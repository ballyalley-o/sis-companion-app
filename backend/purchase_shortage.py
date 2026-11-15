"""Calculate purchase quantities across a warehouse, without reserving stock."""
def purchase_shortage(items, stock):
    demand = {}
    for item in items:
        key = item["product_id"]
        if key not in demand:
            demand[key] = {key: item[key] for key in ("product_id", "sku", "name", "unit")}
            demand[key]["requested_qty"] = 0
        demand[key]["requested_qty"] += item["qty"]
    available = {}
    for row in stock:
        key = row["product_id"]
        available[key] = available.get(key, 0) + max(0, row.get("qty", 0))
    return [{**item, "available_qty": available.get(key, 0),
             "qty": item["requested_qty"] - available.get(key, 0)}
            for key, item in demand.items() if item["requested_qty"] > available.get(key, 0)]
