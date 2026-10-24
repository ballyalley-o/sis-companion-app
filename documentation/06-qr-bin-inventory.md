# QR and Bin Inventory Specification

Version 1.0 | Target workflow; current QR implementation unverified

## Scan experience

Staff scan a bin label and see current authorized contents. The QR carries a stable HTTPS route or opaque bin token, not mutable text or quantity. Display warehouse, bin code, status, refresh time, SKU, item name, unit, quantity, reservation/availability warnings and safe actions. Unknown, retired or unauthorized locations do not expose private inventory.

Historical reports describe bin identifiers such as SEC2-L1-B3 and a 100 x 50 mm label layout with title on the left and QR at right. Physical print dialog and label size were not verified in that report. Treat dimensions as proposed until actual print testing.

## Identifiers and lifecycle

Keep human-readable code separate from immutable internal ID. QR payload must not include stock, employee details, secrets or permissions. Do not treat a bin code as authorization. When a location is renamed/retired, resolve old labels safely to a retired-location notice or approved remap; never silently point an old label to unrelated stock. Provide bulk reprint and revocation.

## Receiving and put-away

Each received item line selects its own target bin. A scan may preselect the bin, but the user confirms item and warehouse. Unknown destination remains in an explicit unassigned bucket and put-away queue. Put-away creates a movement to a real bin; it does not rewrite receipt history.

## Security and physical acceptance

Require sign-in by default because quantities/items are sensitive. If limited anonymous view is approved, define fields, use revocable opaque tokens, rate-limit and monitor access. Print at 100% on intended stock. Test lighting, scan distance, angles, supported phones, damaged/dirty labels, quiet zone, contrast, clipping and manual code fallback.

