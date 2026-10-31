# Product warehouse map

Open **Warehouse map** in the desktop sidebar, or **More → Warehouse map** on mobile,
to see the overview. **Find a product** opens Stock for locating a specific item.
Open Stock, choose a product, then select **View on warehouse map** under its bin location.
The selected warehouse's product locations come from the existing authenticated product API.
Choose another location to move the marker. View bin contents opens the existing read-only bin page.
The locator performs read-only API calls; it makes no external map service calls.

## Search and radar

Area indicators identify SEC1 as **Operations** and SEC2, SEC3 and SEC4 as
**Consumables**. A colour-keyed legend remains readable at mobile widths; the
selected item's location path and detailed rack heading also identify its area.
These labels describe warehouse areas, not product categories or access permissions.

Search by product name/SKU or equipment name/code/category directly on the map.
Select a result to show its recorded warehouse, aisle, section, level and bin.
Multiple product locations can be selected separately. Product queries use literal text,
including punctuation. No-match, loading, missing-location and failed-request states are shown.
Warehouse switching clears the selected item. Manager warehouse restrictions remain enforced by the API.

The overview fits the screen. The rack view scrolls horizontally to the target cell.
Animated rings plus a stationary dot identify the target and respect reduced-motion settings.
Click the radar's selected section in the floor overview, or **Show exact bin**, to
scroll to the detailed rack elevation and centre the selected bin. This keeps the selected
item and location intact. Each rack cell labels its level and bay even when row labels
have scrolled out of view. Unselected sections can still be explored separately.
SEC4's overview marker identifies the section; its rack marker identifies the exact bin code.
Section controls let users inspect all rack elevations without selecting an item.

Equipment may have an optional `home_bin_id`; creation validates that the bin is active
and belongs to the same warehouse. Existing equipment without a bin remains unassigned.
Equipment detail links to the locator. Checked-out or maintenance equipment shows the
home-storage marker with an explicit status, never a claim that it is physically at that bin.
This is a recorded-location lookup, not indoor positioning or turn-by-turn navigation.

## Additive demo fixtures

Run `python seed_map_demo.py` inside the backend only for a development database with
`APP_ENV=development` and `SEED_DEMO_DATA=true`. The script refuses other environments.
It adds the 164 valid bin codes per warehouse (QLD and NSW), 8 `MAP-DEMO-*` products,
16 product stock rows and 8 equipment records with home bins. All sample records are
labelled `map_demo` and test items are labelled in the UI. Test data uses the same schematic
in both warehouses for exercising warehouse filters; it does not assert both buildings are identical.

Fixtures use deterministic IDs and insert-only upserts. Re-running preserves quantities,
existing stock, loan history and equipment assignments. It does not contact Zoho or
reassign older `QLD-A01`-style bins. No real provider stock is changed.
Test searches: `gloves`, `hose`, `bentonite`, `cordless drill`, `water pump`, `MAP-DEMO`.

Validation helpers: `node tests/test-warehouse-map.cjs` from the frontend.

## Remap all existing demo locations

`python remap_demo_locations.py` prints the plan without writing. Add `--apply` to
relabel all active legacy bins and assign unmapped equipment home-storage bins.
This is development-only, requires demo mode, and refuses databases with a Zoho refresh token.
It writes a private full-database JSON backup under `/tmp/warehouse-structure-v1-backup.json`
before changes and keeps a resumable plan in `map_location_migrations`.
Copy the backup into a private ignored location before recreating that API container.

Existing occupied bin IDs remain unchanged: stock rows, quantities, movement records,
stock requests and loan history are not rewritten. Unused structured placeholder bins
are retired with redirects to the relabelled original bins, preserving their QR URLs.
Old bin codes are aliases for lookup. Code scanning is warehouse-scoped because a
structured code such as SEC1-L1-B1 can exist in both QLD and NSW.
The scanner provides a warehouse selector; ID-based QR labels remain unambiguous.
Historical records retain their original labels for traceability.

The migration refuses to retire placeholders referenced by stock, equipment or any
other stored record. A completed run is a no-op. Equipment home bins change without
changing availability, checkout status, borrowers or signed history.

The schematic follows the supplied Revision 03 screenshot: SEC1 across the top (15 bays),
SEC2 at the right (6), SEC3 bottom-right (12) and SEC4 bottom-left (14).
The layout is a reference, not a validated warehouse survey or navigation route.
Bay numbering direction and the warehouse to which the drawing applies need confirmation.
The user's correction is interpreted as SEC4 having 8 positions on L1 and L2,
and the detailed drawing shows 14 positions on L3 and L4. This overrides the drawing's older 6-bin lower rows.
Lower bins are provisionally numbered B1–B8. Confirm this interpretation and numbering before picking.
The rack view displays levels top-to-bottom with the shorter lower rows centred for illustration.
No alignment between those lower positions and upper bay numbers is asserted.
For SEC4 the floor overview highlights only the section; the rack view highlights the specific bin.
Edit the geometry and limits in `frontend/src/warehouseMap.ts` after warehouse validation.

Bin codes matching SECn-Ln-Bn are checked against reference bounds. Invalid or out-of-range
codes display an unmapped message rather than an invented marker. A floor bay is highlighted;
its vertical level is stated in the location card and shown in the rack view.
Validation uses the bay count for the specific level: e.g. SEC4-L1-B9 is unmapped,
while SEC4-L3-B14 is mapped. Pulse animation honours reduced-motion settings.

Not included: indoor GPS, aisle routing, a layout editor, validated physical coordinates or Figma integration.
