# Zoho Inventory Integration Specification

Version 1.0 | Target design; live configuration and current behavior unverified

## Authority and scope

Connect the app to Zoho for approved catalogue/location imports and stock transactions. The business must define which system owns products, balances, receipts, locations and purchase orders. History reports OAuth setup, organization/location selection, SKU import and stock adjustment work; it reports internal reorders that do not create Zoho purchase orders. These are not independently verified.

## Security

Use server-side OAuth with exact production callback and least-privilege scopes. Store client secret and refresh token only in restricted server-side secrets or encrypted configuration. Separate development, staging and production credentials. Validate state/nonce, callback host and authorization code. Rotate exposed credentials. Redact tokens and sensitive payloads from logs.

## Mapping

| Local | Zoho | Rule |
|---|---|---|
| Product | Item | SKU suggested match key; normalization must be explicit |
| Warehouse | Location | Explicit organization-scoped ID, not display-name inference |
| Movement | Inventory adjustment or approved transaction | Confirm accounting meaning and external ID |
| Receipt | Purchase receipt or approved adjustment | Align with PO and partial receiving |
| Reorder | Purchase Order | Out of scope until supplier, approvals, accounting and duplicate safety defined |

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

