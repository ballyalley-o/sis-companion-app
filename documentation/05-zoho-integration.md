# Zoho Inventory Integration Specification

Version 1.0 | Target design; live configuration and current behavior unverified

## Authority and scope

Connect the app to Zoho for approved catalogue/location imports and stock transactions. The business must define which system owns products, balances, receipts, locations and purchase orders. History reports OAuth setup, organization/location selection, SKU import and stock adjustment work; it reports internal reorders that do not create Zoho purchase orders. These are not independently verified.

### Purchase-order arrival workflow (implemented locally)

Managers and admins can list and look up Zoho purchase orders by purchase-order number or reference. The app reads the order and line items through `ZohoInventory.purchaseorders.READ`. A wedge scanner can enter a SKU or Zoho item ID and press Enter; each scan adds one unit to the received count. Staff can adjust counts and assign each item to its own local bin. Posting a receipt updates SIS stock, movement history, receipt history and audit records only. It does not call Zoho's purchase-receive, purchase-order, or inventory-adjustment write endpoints. The Zoho order remains read-only and its Zoho received quantities do not change through this workflow. Local SIS received quantities are tracked separately and used to prevent over-receiving from this app.

The local development Compose environment provides a clearly marked mock PO (`PO-DEMO-10452`) for trying the scanner screen without connecting to Zoho. Live purchase-order access requires reconnecting Zoho to grant the additional read scope. Review duplicate/retry behavior and supplier barcode-to-SKU mapping in staging before live warehouse use.

Purchase-order receipts retain a stable client reference on retry. Posting reserves the order against concurrent receiving and each stock row records applied receipt lines atomically. An interrupted receipt remains `posting`; use **Resume receipt** under Recent arrivals to finish the stored receipt before posting another receipt for that order. Do not delete its receiving lock to force another receipt through. This workflow counts whole units using SKU or Zoho item-ID barcodes and Enter-terminated HID scanner input; vendor barcode mappings, fractional units and physical scanner acceptance still need validation.

## Security

Use server-side OAuth with exact production callback and least-privilege scopes. Store client secret and refresh token only in restricted server-side secrets or encrypted configuration. Separate development, staging and production credentials. Validate state/nonce, callback host and authorization code. Rotate exposed credentials. Redact tokens and sensitive payloads from logs.

## Mapping

| Local | Zoho | Rule |
|---|---|---|
| Product | Item | SKU suggested match key; normalization must be explicit |
| Warehouse | Location | Explicit organization-scoped ID, not display-name inference |
| Movement | Inventory adjustment or approved transaction | Confirm accounting meaning and external ID |
| Receipt | Purchase receipt or approved adjustment | Align with PO and partial receiving |
| Internal reorder | Purchase Order | Reorders still do not create Zoho POs; the app may track existing Zoho purchase orders read-only |

Missing/duplicate SKU is a manual exception. Do not guess by name. Persist external identity within organization scope.

## Import procedure

1. Confirm organization, data center, scopes and locations.
2. Fetch read-only metadata/items in a non-production tenant.
3. Preview duplicates, missing identifiers, units, inactive products and quantity conflicts.
4. Match by approved policy and retain external IDs.
5. Use UNASSIGNED only if approved; never invent a physical bin.
6. Import in pages with rate-limit handling and resumable checkpoint.
7. Produce reconciliation summary and obtain warehouse-owner sign-off.

## Outbound and failure handling

Persist each command before dispatch with operation, local source, idempotency key, correlation ID, organization/location, attempts, timestamps and safe result. Retry transient errors with bounded exponential backoff. Permanent validation errors need operator review. Unknown timeout outcome must be reconciled before resubmission. The UI distinguishes pending, failed, rejected and complete.

| Failure | Response |
|---|---|
| Token revoked | Pause integration; reauthorize; inspect queue before resume |
| Rate limit/transient 5xx | Bounded retry and age alert |
| Validation rejection | Correct mapping/input; reviewed new command if appropriate |
| Timeout after dispatch | Unknown until provider transaction is checked |
| Wrong org/location | Stop writes, verify mapping and reconcile affected events |
| Missing/duplicate SKU | Exception queue; no automatic name match |

## Reconciliation and cutover

Compare quantities by item/location, missing mappings, pending/unknown commands, repeated adjustments and mapping changes. Reconciliation identifies discrepancies; it must not silently overwrite values. Manager reviews source, documents reason and approves correction.

Before production: verify callbacks/scopes, secret rotation, mapping, dry-run import, each mutation in sandbox, retries/timeouts/rate limits, reconciliation and kill switch. Obtain named approval and rehearse rollback.

