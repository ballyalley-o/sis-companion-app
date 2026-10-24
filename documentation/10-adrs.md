# Architecture Decision Records

Status: proposed records requiring technical and product-owner approval

## ADR-001: PWA-first delivery

**Context:** The referenced conversation accepted PWA-first and possible later private mobile distribution. History refers to Expo/React Native and a web preview; present compatibility is unverified.

**Decision:** Target an installable responsive PWA first. Keep an API boundary so future native clients reuse business rules.

**Consequences:** Requires HTTPS, manifest, service worker, browser matrix and camera/manual fallback. PWA does not guarantee native camera, push or offline behavior. Audit current framework before committing migration.

**Status:** Direction accepted; implementation unverified.

## ADR-002: QR resolves to live bin

**Context:** Contents change and static QR text becomes stale.

**Decision:** Encode stable HTTPS route or opaque token; show authorized live record, not embedded inventory.

**Consequences:** Live lookup needs connectivity; manual search and stale/offline states are required. Labels need revocation/reprint.

**Status:** Target; current payload unverified.

## ADR-003: Zoho server-side adapter

**Context:** Secrets and business rules must stay out of browser; external behavior can fail.

**Decision:** Use server-side provider adapter, durable commands, retries and reconciliation.

**Consequences:** Requires worker/outbox and unknown-outcome handling.

**Status:** Recommended; verify existing implementation.

## ADR-004: Append-only movement ledger

**Context:** Stock changes must be explainable.

**Decision:** Posted movement is immutable; corrections use linked reversal/adjustment with transaction and idempotency.

**Consequences:** History is reliable; corrections need explicit workflow and training.

**Status:** Required target; source unverified.

## ADR-005: Per-line bin assignment on receipts

**Context:** Items in one delivery can go to different bins.

**Decision:** Each receipt line records target bin; unknown destination remains explicitly unassigned until put-away.

**Consequences:** Line-based receiving and movement history are required.

**Status:** Requirement based on user preference; source unverified.

## ADR-006: No unreviewed offline stock mutation

**Context:** Offline issue may conflict with other staff and Zoho.

**Decision:** Offline may cache shell or capture clearly pending draft only. Final stock mutation requires server confirmation unless a separately approved conflict protocol exists.

**Consequences:** Connectivity is needed for final confirmation; queued and complete states must be distinct.

**Status:** Proposed safety baseline.

