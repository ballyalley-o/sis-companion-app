# QR and Bin Inventory Specification

Version 1.0 | Target workflow; current QR implementation unverified

## Scan experience

The bin contents page uses a bounded two-column desktop layout and stacks its sticker,
location details and stock list on smaller screens. Read-only links keep all stock-changing
controls hidden. Sticker previews and print output use a wide 100 × 30 mm layout:
large bin title on the left, section-coloured location code below it, and a square QR code
on the right. This print size is an assumption based on the supplied wide sticker example.
Custom titles are escaped in print HTML, and QR loading errors provide a retry action.

Staff scan a bin label and see current authorized contents. When `PUBLIC_APP_URL` is set to the deployed HTTPS app origin, newly generated labels encode `/bin/{id}?view=1`; that route displays inventory without receive/take controls. The existing `BIN:{code}` payload remains the fallback when no app URL is configured. The QR contains neither mutable stock quantities nor permissions. Unknown, retired or unauthorized locations must not expose private inventory. Sign-in is still required by the API.

The initial service worker caches only same-origin versioned static assets. It never caches API responses or bin contents, and the app does not work offline. Hosting must serve `manifest.json` and `service-worker.js`, use HTTPS and rewrite direct app routes such as `/bin/{id}` to the Expo single-page entry point.

Historical reports describe bin identifiers such as SEC2-L1-B3 and a 100 x 50 mm label layout with title on the left and QR at right. Physical print dialog and label size were not verified in that report. Treat dimensions as proposed until actual print testing.

## Identifiers and lifecycle

Keep human-readable code separate from immutable internal ID. QR payload must not include stock, employee details, secrets or permissions. Do not treat a bin code as authorization. When a location is renamed/retired, resolve old labels safely to a retired-location notice or approved remap; never silently point an old label to unrelated stock. Provide bulk reprint and revocation.

## Receiving and put-away

Each received item line selects its own target bin. A scan may preselect the bin, but the user confirms item and warehouse. Unknown destination remains in an explicit unassigned bucket and put-away queue. Put-away creates a movement to a real bin; it does not rewrite receipt history.

## Security and physical acceptance

Require sign-in by default because quantities/items are sensitive. If limited anonymous view is approved, define fields, use revocable opaque tokens, rate-limit and monitor access. Print at 100% on intended stock. Test lighting, scan distance, angles, supported phones, damaged/dirty labels, quiet zone, contrast, clipping and manual code fallback.

