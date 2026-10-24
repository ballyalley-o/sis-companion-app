# Software Requirements Specification

Version 1.0 | Draft baseline; requirements require owner approval

## Context

System comprises a browser PWA, authenticated API, durable database, integration worker and Zoho Inventory. The API owns access control, validation, state transitions and integration orchestration.

## Functional requirements

### Identity and access

- FR-001 Authenticate employees using the approved identity method.
- FR-002 Enforce role and warehouse scope on every protected API operation.
- FR-003 Allow admins to provision/disable accounts and change assignments with audit.
- FR-004 Expired, disabled or unauthorized sessions fail closed.
- FR-005 User errors do not expose secrets, stack traces or private records.

### Catalogue and QR

- FR-010 Maintain SKU, description, unit, active status and Zoho identity.
- FR-011 Maintain warehouse and stable bin code, unique within warehouse.
- FR-012 Generate QR labels that resolve to a bin record and contain no mutable quantity.
- FR-013 Display only authorized contents, unit, quantity, status and freshness.
- FR-014 Provide text search and manual code entry if camera is unavailable.
- FR-015 Archive/reactivate locations through audited operations.

### Stock operations

- FR-020 Create requests with user, warehouse, lines, rig/trip and purpose.
- FR-021 Enforce state transitions; a request cannot be approved or issued twice.
- FR-022 Record decision actor, time, outcome and reason.
- FR-023 Reserve stock when policy requires; available equals on-hand less active reservations.
- FR-024 Commit issue/return through atomic ledger events and balance updates.
- FR-025 Reject insufficient, stale, invalid-unit or unauthorized mutations.
- FR-026 Record supplier/reference and received lines with per-line target bin.
- FR-027 Support partial receipt, damage/hold and linked reversal events.
- FR-028 Record count variance, reason and approval where required.
- FR-029 Show item/bin history with actor and source document.
- FR-030 Use idempotency identity for every mutation.

### Equipment and planning

- FR-040 Track reusable equipment as individual assets.
- FR-041 Record borrower, due date, condition, rig/job and acknowledgement at checkout.
- FR-042 Record return inspection; damaged assets remain unavailable until release.
- FR-043 Show overdue status and authorized loan history.
- FR-050 Support trips with dates, rig, site and requested materials.
- FR-051 Allow manager approval/rejection and state-controlled edits.
- FR-052 Reserve on approval and release exactly once on cancellation/rejection/expiry.
- FR-053 Support kit templates and shortage calculation.
- FR-054 Track internal reorder and partial receipt status.
- FR-055 Do not create supplier commitments without a separate approval workflow.

### Zoho and administration

- FR-060 Keep OAuth credentials/tokens server-side and encrypted.
- FR-061 Map approved organization and local warehouses to explicit Zoho locations.
- FR-062 Import items with duplicate/missing SKU exceptions.
- FR-063 Persist external command ID, correlation, idempotency, status and attempts.
- FR-064 Retry transient failures with bounded backoff and provider guidance.
- FR-065 Distinguish success, rejected, pending and unknown result.
- FR-066 Reconcile differences and require reviewed resolution.
- FR-067 Provide server-side outbound-write kill switch.
- FR-070 Configure users, roles, warehouses, bins, mappings and integrations.
- FR-071 Provide authorized reports and exports with minimized sensitive fields.
- FR-072 Audit high-risk settings and admin actions.
- FR-073 Expose safe health/readiness checks.

## Non-functional requirements

- Availability objective, hours and support response need business approval.
- Common lookup should render within 2 seconds at p95 on supported devices/network; define test load.
- Stock movement and ledger commit atomically; concurrent issue cannot overdraw available.
- TLS, least privilege, server authorization, encrypted secrets and audit mutations.
- Narrow-screen usability, accessible labels, focus, contrast and non-color status cues.
- Publish tested browser/device matrix for iOS Safari, Android Chrome and desktop.
- Backups and restore meet approved RPO/RTO.
- Correlate API, movements and sync without logging secrets or excess personal data.
- PWA HTTPS, manifest, service worker, cache policy and installation must be verified.

## Business invariants

Posted movements are immutable; correction is linked reversal/adjustment. On-hand follows opening balance plus movements or a rigorously maintained transactional projection. Available equals on-hand minus active reservations and approved holds. No issue exceeds availability without explicit approval. Warehouse identifiers are authorized from authenticated principal. Every receipt line has its own target bin. Equipment requires return inspection. Retries reuse idempotency identity. Provider timeout is unknown until reconciled. Bin reassignment changes location metadata, not quantity.

## Acceptance examples

1. A manager in Warehouse A cannot access Warehouse B by guessing an ID.
2. Concurrent requests for the last units cannot both succeed.
3. Repeating approval with the same key creates one movement.
4. A multi-line delivery can assign lines to different bins.
5. A Zoho timeout is shown unknown/pending and not blindly duplicated.
6. QR scan and manual entry resolve to the same authorized bin.
7. Damaged equipment remains unavailable until inspection release.

