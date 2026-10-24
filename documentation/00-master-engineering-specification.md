# SIS Companion Production Engineering Specification

Version 1.0 | 24 October 2026 | Draft baseline pending source audit, stakeholder approval and production verification

## Executive summary

SIS Companion is intended to help authorised Site Investigation Supply staff find warehouse stock, identify bin contents, request and issue materials, receive deliveries, manage equipment loans and coordinate inventory with Zoho Inventory. The agreed initial target is a mobile-first Progressive Web App at a secure company URL. QR labels identify stable bin locations and open a live digital view; a QR must not contain a static inventory list. A private native app may be evaluated after the PWA proves its workflows.

Repository history reports role-based warehouse access, requests and approvals, stock movements and counts, QR labels, equipment tracking, Zoho integration work, rig kits, trips, reservations and reorders. These are reports in dated commit messages; source-level verification was not possible through the available GitHub interface. Current PWA installability, production deployment, live Zoho writes, backup/restore, security controls and release process remain unverified.

The production design should maintain an auditable local operational ledger and explicitly define how Zoho participates as system of record. Every stock-affecting operation should be atomic, idempotent, attributable and traceable to external transactions. Failed external writes must not leave local and external balances silently divergent.

## Product outcomes and users

The system should help staff locate items quickly, preserve traceability for stock changes, help managers plan around rigs/trips, account for reusable equipment and expose discrepancies and sync failures.

| User | Responsibility | Access boundary |
|---|---|---|
| Driller/field employee | Request and return materials; view assigned trip/equipment | Assigned identity and permitted warehouse/rig |
| Warehouse manager | Approve, pick, issue, receive, count and manage bins | Assigned warehouse(s) |
| Administrator | Manage users, roles, integrations and configuration | Company-wide; high-risk actions audited |
| Operations owner | Review reports, reconcile inventory and approve releases/incidents | Approved reporting/release authority |

Confirm role names, warehouse assignments, approval thresholds and identity source with the business.

## Scope

The initial operational release includes secure sign-in; server-enforced role and warehouse access; product/bin lookup; QR labels; search and manual code entry; requests, approvals, issues and returns; receiving with item-level bin assignment; cycle counts and movement history; equipment checkout and inspection; and Zoho integration only after sandbox proof and authority approval.

Trips, reservations, rig kits, reorders and richer reports are subsequent maturity work. Public inventory access, uncontrolled offline stock mutations, unapproved purchase orders and replacement of Zoho accounting/procurement are out of scope. Keep APIs and business rules independent from the PWA so a future native client can reuse them.

## Evidence and confidence

Repository metadata confirms the public repository and main default branch. README was empty at inspection and code search was not indexed. History reports features as of 19 October 2026 and a README change on 22 October. An earlier conversation reported backend/frontend and test directories, but the tree was not re-fetched.

The 19 October commit report describes trip planning, reservations, issue, in-app reorders, partial receiving and stock history, and reports 22 server checks passing. This is historical development evidence, not proof of current main-branch tests or production health. See 01-repository-evidence.md.

## Target architecture

Use a responsive PWA, authenticated API, durable database, server-side Zoho adapter, durable command queue/outbox and operations layer. Browser clients must never hold Zoho secrets or refresh tokens. Server-side authorization and domain rules protect every mutation. A worker handles OAuth refresh, provider calls, bounded retries and reconciliation. Confirm framework, database, identity provider and hosting through source audit.

Logical flow: employee browser/PWA over HTTPS to API and authorization, then database and movement ledger; API also writes durable outbox commands, which a server-side Zoho adapter sends to Zoho Inventory.

Do not treat service-worker cache as an authoritative inventory ledger. Cache the application shell and approved non-sensitive content only. Confirm the existing Expo/React Native project can deliver the agreed PWA experience before selecting migration or packaging work.

## Inventory and data principles

- Keep products, warehouses, bins, balances, movement events, users, requests, trips, equipment, receipts and audit events distinct.
- Track consumables by quantity and reusable equipment by unique asset.
- Tie every balance to product, bin and explicit unit.
- Record each stock change with actor, reason, time, source document, direction and idempotency identity.
- Correct posted events through linked reversals/adjustments, never silent edits.
- Enforce available stock and reservations atomically.
- Keep bin assignment separate from stock movement; location correction is audited and does not silently move quantity.
- Store Zoho identifiers in addition to local identifiers.

Conceptual schema is in 04-architecture-data-model.md. Confirm product identity, units, serial tracking and warehouse naming before migration/import.

## Core journeys

### Scan a bin

Scan a permanent QR with PWA camera, device camera or manual code entry. Resolve an authorized bin record. Display warehouse, location code, status, refresh time, SKU, name, unit, quantity and warnings. Unknown, retired and unauthorized locations produce safe outcomes without exposing stock.

### Request and issue

An employee submits items, quantity, warehouse, rig/trip and purpose. The server validates access, quantity and state. A manager approves or rejects with reason. Issue commits balance and movement atomically and reports integration outcome according to approved Zoho policy. Duplicate submission or approval is rejected through idempotency and state constraints.

### Receive and put away

Record supplier, purchase order/docket reference, date and lines. Each line has accepted quantity, unit, warehouse and destination bin. Handle partial, damaged or held quantities distinctly. Reverse through a linked correction, preserving later assignments and history.

### Equipment

Track individually identified assets. Checkout records borrower, rig/job, expected return, condition and required acknowledgement. Return requires inspection. Damaged or overdue assets remain unavailable until released.

## Zoho and synchronization

Before live writes, define the system of record for products, quantities, receipts, locations and purchase orders. Historical reports describe SKU matching, location mapping, UNASSIGNED stock, encrypted secret storage and Zoho-first mutation behavior; these are unverified implementation reports.

Require least-privilege OAuth, encrypted secrets, token rotation, bounded retries, idempotent commands, correlation IDs, durable sync status, reconciliation and a server-side kill switch. Distinguish rejected, pending, successful and unknown outcomes. A timeout after dispatch is not safe reason to create a new adjustment. See 05-zoho-integration.md.

## Security, quality and operations

Use TLS, secure sessions, server authorization, least privilege, audit logging, dependency/secret review, safe QR tokens, rate limits and tested recovery. Test warehouse boundaries, IDOR, concurrency, retries, reversals, provider failures, PWA behavior and accessibility. Never run automated tests against live inventory.

Use separate environments, reviewed immutable releases, protected CI secrets, tested migrations, smoke checks, monitoring, encrypted backups and rehearsed rollback/restore. Document incident ownership, service objectives and outage procedures. See 07-security.md, 08-quality.md and 09-deployment-operations.md.

## Phased roadmap

**Phase 0 - Evidence and ownership:** audit source/deployment, identify framework/hosting, establish owners, approve role and authority policy, inventory data/secrets. Exit with verified as-built report and risk register.

**Phase 1 - Production foundation:** harden authentication, authorization, audit, migrations, secrets, CI, monitoring and recovery. Prove idempotency and stock concurrency. No live writes before gates pass.

**Phase 2 - Warehouse MVP:** deliver bin/QR lookup, search, request/approval, issue/return, per-bin receiving, counts and movement history. Pilot one warehouse.

**Phase 3 - Controlled Zoho launch:** verify OAuth/mapping, dry-run import, test retries/reconciliation, enable writes gradually with kill switch and dual review.

**Phase 4 - Planning and maturity:** validate trips, reservations, kits, reorders, reports and multi-warehouse operation.

**Phase 5 - Private mobile distribution:** evaluate wrapper or native client after PWA/API stability, including device management, camera, notifications and distribution requirements.

## Production gates

Do not declare production readiness until source and deployment are pinned and reproducible; owners approve requirements and stock authority; critical/high security findings are resolved or explicitly accepted; tests pass safely; stock concurrency, idempotency and reconciliation are proven; PWA install, camera and manual fallback are verified; Zoho writes pass isolated tests; monitoring, support, restore and rollback are rehearsed; warehouse staff complete acceptance and training. See 12-production-readiness.md.

## Decisions requiring owners

1. Which system owns product master, quantity, receipts, purchase orders and locations?
2. Which Zoho organisation/locations are production targets and who approves mapping?
3. Is the current target installable PWA, Expo web app or native shell?
4. Which actions and thresholds require manager approval?
5. What retention applies to employee identity, signatures, equipment photos and audit events?
6. What are service hours, RTO and RPO?
7. Who owns support, incidents, OAuth credentials and release approval?
8. Must QR inventory pages require sign-in? Default recommendation: yes.

