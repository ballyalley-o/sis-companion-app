# DrillStock Pro — PRD

## Original problem statement
iOS/Android drilling warehouse inventory app integrated with Zoho Inventory; QLD + NSW warehouses, bins, SKUs, warehouse quantities. Drillers sign in, pick name + rig, scan bin QR / search, submit take/return requests; managers (own warehouse) approve/reject before Zoho transactions update stock; audit trail + notifications. Roles: driller, manager, admin (cross-warehouse). Stocktake, cycle counts, low-stock alerts, discrepancy reports, bin mgmt, printable QR labels, movement history, dashboards. Equipment borrow/return register (driller, rig, equipment ID, timestamps, condition both events, notes, photos; availability, overdue, history). Rugged high-contrast UI, secure auth, Zoho OAuth settings, reliable transactions.

## User choices
Zoho MOCKED for now · JWT email/password roles (+ Google login requested, deferred) · photos in app (Emergent object storage) · in-app notifications (+ push requested, deferred) · dark industrial theme, safety yellow.

## Architecture
- Backend FastAPI `server.py` (+ `zoho.py` mock/live adapter, `storage.py` object storage, `seed.py` idempotent demo data), MongoDB, string uuid ids, `_id` excluded.
- Approvals: pending→processing lock, Zoho adjustment first, then atomic conditional stock updates w/ compensation; client_ref idempotency.
- Frontend Expo Router: tabs Home/Stock/Equipment/More (NativeTabs on iOS 26+), screens scan, request/new, request/[id], requests, bin/[id], product/[id], equipment/[id], equipment/action, counts, counts/[id], bins, reports, notifications, zoho, users.

## Implemented (2026-06)
All features above end-to-end; testing iteration_1: backend 24/24, frontend critical flows green.

## Iteration 2 (2026-06)
- Bin stickers 100×50mm (@page size, one per page, light bg, title "BIN 22", red first code segment, QR right) + in-app preview; optional bin label title
- Receiving stock (goods in): /receive screen, POST/GET /api/receipts, Zoho mock adjustment, movement "receive", Reports → Receipts
- Common items (per warehouse/rig, by usage) in Stock tab, new request, receive
- "Did you mean" spelling helper (/api/products/suggest, difflib)
- Tests: iteration_2 backend 15/15, frontend verified

## Iteration 3 (2026-06)
- Rig kits: managers/admins create/edit/delete standard kits per rig (/kits, /kit/[id]); drillers tap "Add kit" in new take request (qty capped by bin availability, shortages flagged)
- Google Sign-In (Emergent-managed) → app JWT; existing emails keep their role, unknown Google users auto-created as drillers; admins notified
- Zoho live connection deferred by user (still mocked)
- Tests: iteration_3 backend 15/15, frontend flows green

## Iteration 4 (2026-06)
- Live-ready Zoho Inventory: in-app setup guide, Mock/Live toggle, encrypted secret + refresh token, OAuth w/ CSRF state + callback page, location listing & QLD/NSW mapping, import items by SKU + align stock (UNASSIGNED bin), adjustments with location_id + reference, retry/backoff
- Awaiting user's Zoho credentials (entered in-app by admin); real Zoho calls untested
- Tests: iteration_4 backend 17/17; UI gating fix applied
- User's Zoho client saved (AU data center confirmed valid); org ID + data center now auto-detected on OAuth callback (accounts-server/location params, /organizations)

## Iteration 5 (2026-06)
- Trip calendar (/trips): drillers plan trips (rig, dates, site, items incl. kits/common items); managers approve/reject/mark packed/issue (issue = linked take request approved → Zoho + stock); approved trips reserve stock; shortages shown
- Reorders (/reorders): raised against trip shortages or manually; ordered/cancel; receive against reorder (prefilled) tracks received qty
- Stock history trace (/history, product → Full stock history): totals, movements with running balance, upcoming trip reservations & open reorders
- Zoho live connected to org 7007711688 (Sis.demo); QLD/NSW Logistics locations
- Tests: iteration_6 backend 22/22, frontend verified (run in temporary mock mode, live restored)

## Backlog
- P0: Real Zoho credentials → set ZOHO_MODE=live, item ID mapping/sync of items from Zoho
- P1: Emergent Google social login; push notifications (needs google-services.json + build)
- P1: Offline queue for requests on poor site connectivity
- P2: CSV/PDF export of reports, bin-to-bin transfers, equipment QR label printing
