import unittest

from remap_demo_locations import mapped, strings


class LocationLayoutTests(unittest.TestCase):
    def test_section_limits(self):
        for code in ["SEC1-L4-B15", "SEC2-L2-B6", "SEC3-L4-B12", "SEC4-L1-B8", "SEC4-L2-B8", "SEC4-L3-B14", "SEC4-L4-B14"]:
            self.assertTrue(mapped(code), code)

    def test_invalid_and_legacy_locations(self):
        for code in ["QLD-A01", "SEC1-L1-B16", "SEC2-L3-B1", "SEC3-L1-B13", "SEC4-L1-B9", "SEC4-L2-B14", "SEC4-L4-B15", "RETIRED-id", None]:
            self.assertFalse(mapped(code), code)

    def test_nested_references_protect_placeholder_ids(self):
        record = {"items": [{"bin_id": "occupied"}], "home_bin_id": "equipment-home", "nested": {"original": ["historical"]}}
        references = set(strings(record))
        self.assertTrue({"occupied", "equipment-home", "historical"}.issubset(references))
        self.assertNotIn("unused", references)


if __name__ == "__main__":
    unittest.main()
