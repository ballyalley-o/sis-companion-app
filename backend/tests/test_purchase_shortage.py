import ast
import copy
import unittest
from pathlib import Path
from types import SimpleNamespace

from purchase_shortage import purchase_shortage


def item(qty, product="p1", bin_id="b1"):
    return dict(product_id=product, sku=product.upper(), name=product, unit="ea", qty=qty, bin_id=bin_id)


class ShortageTest(unittest.TestCase):
    def test_only_missing_quantity(self):
        result = purchase_shortage([item(10)], [dict(product_id="p1", qty=6)])
        self.assertEqual(result[0]["qty"], 4)
        self.assertEqual(result[0]["requested_qty"], 10)

    def test_checks_other_bins_and_combines_repeated_product(self):
        result = purchase_shortage([item(5), item(5, bin_id="b2")], [dict(product_id="p1", qty=3), dict(product_id="p1", qty=4)])
        self.assertEqual(result[0]["qty"], 3)

    def test_no_purchase_when_stock_sufficient(self):
        self.assertEqual(purchase_shortage([item(10)], [dict(product_id="p1", qty=11)]), [])

    def test_zero_stock_and_multiple_products(self):
        result = purchase_shortage([item(10), item(2, "p2")], [])
        self.assertEqual([i["qty"] for i in result], [10, 2])


class HTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail


def purchase_function(**scope):
    tree = ast.parse((Path(__file__).parents[1] / "server.py").read_text())
    node = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "request_purchase")
    node.decorator_list = []
    node.args.defaults = [ast.Constant(None)]
    module = ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[]))
    exec(compile(module, "server.py", "exec"), scope)
    return scope["request_purchase"]


class PurchaseTransitionTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.record = dict(id="r1", number="SR-1", type="take", status="pending", submitted_by_id="d1", shortage=[dict(product_id="p1", qty=4)])
        self.changed = True
        self.write_count = 0
        self.event = []
        async def get_request(rid, user):
            return copy.deepcopy(self.record)
        async def update_one(query, update):
            self.write_count += 1
            if self.changed:
                self.record.update(update["$set"])
            return SimpleNamespace(modified_count=int(self.changed))
        async def event(*args, **kwargs):
            self.event.append(args)
        self.run_purchase = purchase_function(
            get_request=get_request, HTTPException=HTTPException, iso=lambda: "test-time",
            db=SimpleNamespace(stock_requests=SimpleNamespace(update_one=update_one)), audit=event, notify=event)
        self.user = dict(name="Manager", role="manager")

    async def test_draft_is_linked_and_duplicate_action_does_not_write(self):
        result = await self.run_purchase("r1", self.user)
        self.assertEqual(result["status"], "awaiting_purchase")
        self.assertEqual(result["purchase"]["items"][0]["qty"], 4)
        self.assertFalse(result["purchase"]["zoho_stock_changed"])
        await self.run_purchase("r1", self.user)
        self.assertEqual(self.write_count, 1)

    async def test_return_or_completed_request_cannot_purchase(self):
        for key, value in [("type", "return"), ("status", "approved")]:
            original = self.record[key]
            self.record[key] = value
            with self.assertRaises(HTTPException) as error:
                await self.run_purchase("r1", self.user)
            self.assertEqual(error.exception.status_code, 409)
            self.record[key] = original
        self.assertEqual(self.write_count, 0)

    async def test_no_shortage_cannot_purchase(self):
        self.record["shortage"] = []
        with self.assertRaises(HTTPException):
            await self.run_purchase("r1", self.user)
        self.assertEqual(self.write_count, 0)

    async def test_competing_update_does_not_notify(self):
        self.changed = False
        with self.assertRaises(HTTPException):
            await self.run_purchase("r1", self.user)
        self.assertEqual(self.event, [])


if __name__ == "__main__":
    unittest.main()
