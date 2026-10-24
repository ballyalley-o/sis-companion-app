# Architecture and Data Model

Version 1.0 | Target design pending source audit

## Architecture goals

Keep warehouse rules server-side, use a thin responsive PWA, isolate Zoho behind an adapter, make inventory auditable/idempotent, and support later mobile clients without duplicating rules. Confirm existing technology stack before migration or rewrite.

## Components

| Component | Responsibility |
|---|---|
| PWA | Responsive screens, camera QR access, manual lookup |
| API | Identity, authorization, validation, transactions and state transitions |
| Domain services | Inventory, requests, receipts, equipment, trips and reservations |
| Database | Entities, constraints, ledger, outbox and audit |
| Integration worker | OAuth, provider calls, retries and reconciliation |
| Operations | CI/CD, secrets, monitoring, backups and recovery |

Never call Zoho from the browser. Cache only approved application shell/reference data. Private stock data needs appropriate authorization and cache policy.

## Conceptual entities

| Entity | Key fields and constraints |
|---|---|
| User | identity subject, email, status, role; subject unique |
| Warehouse | code, name, status, Zoho location ID |
| Bin | warehouse ID, code, display name, status, QR token; unique warehouse/code |
| Product | SKU, name, base unit, active, Zoho item ID; explicit SKU normalization |
| StockBalance | product, bin, on-hand, reserved, version; unique product/bin |
| Movement | product, from/to bin, quantity, unit, kind, actor, source, idempotency key, time; append-only |
| Request/RequestLine | requester, warehouse, status, product, requested/approved/issued quantity |
| Reservation | request line, product, bin, quantity, state; release once |
| Receipt/ReceiptLine | supplier/reference, receiver, product, accepted/damaged quantity, unit, target bin |
| EquipmentAsset | asset tag, description, status, home warehouse, condition; unique tag |
| EquipmentLoan | asset, borrower, checkout/due/return, conditions; one active loan per asset |
| Trip | warehouse, rig, site, start/end, state, creator |
| Reorder | warehouse, state, needed-by, trip; internal until PO integration approved |
| SyncCommand | provider, operation, external ID, idempotency/correlation IDs, status, attempts, safe error |
| AuditEvent | actor, action, entity, before/after summary, time, correlation; append-only |

## Transaction patterns

**Issue:** in one database transaction validate access/availability, lock or compare-and-swap balances, create movement, update balance, consume reservation and transition request, write audit, enqueue provider command. A unique idempotency constraint prevents duplicates.

**Receipt:** validate every line and target bin, create receipt/movements, update balances and audit, enqueue command in one transaction. Partial delivery records actual quantity rather than editing expected quantity.

**Unknown provider result:** persist command before dispatch. After timeout, mark unknown and reconcile before retry; reuse original command identity.

## API and migration

Resource groups may include auth, users, warehouses, bins, products, balances, requests, receipts, counts, movements, equipment, trips, reorders, Zoho integration, reports and health. Follow existing routes if source audit confirms them. Validate server-side, version schemas, apply warehouse scope from authenticated principal, use version checks for stale writes and return safe errors with correlation ID.

Use versioned migrations and tested recovery. Before import, snapshot, normalize SKUs, identify duplicates/missing IDs, preview mappings/counts and obtain sign-off. Preserve legacy identifiers. Never seed demo accounts in production.

