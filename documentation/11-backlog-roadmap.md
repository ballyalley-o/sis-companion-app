# Development Backlog and Phased Roadmap

Version 1.0 | Proposed sequencing; estimate after source audit

## Roadmap phases

| Phase | Outcome | Exit criteria |
|---|---|---|
| 0 Audit/ownership | As-built report, source evidence, role matrix, Zoho authority and risk register | Owners approve baseline; deployment/framework known |
| 1 Production foundation | Auth, RBAC, audit, ledger, migrations, CI, secrets, monitoring, backups | Access/concurrency tests pass; restore/rollback rehearsed |
| 2 Warehouse MVP | PWA lookup/QR, request, issue/return, per-bin receiving, counts/history | One-warehouse UAT and physical label test pass |
| 3 Zoho controlled launch | OAuth, mapping, import, writes, reconciliation, kill switch | Sandbox/failure tests pass; canary and cutover approved |
| 4 Planning maturity | Equipment, trips, kits, reservations, reorders and reporting | Lifecycle accepted; multi-warehouse and recovery review complete |
| 5 Private mobile | Packaging/native strategy and managed distribution | Adoption case and device/security requirements justify work |

## Epics

**E0 Source audit (P0):** pin revision; map runtimes/deployment; trace stock writes; verify auth/warehouse rules; inventory secrets/CI/backups/tests; reconcile reported features.

**E1 Access/audit (P0):** approve permission matrix; enforce API scope; add audit; define account lifecycle and session policy.

**E2 Inventory integrity (P0):** immutable movement ledger; idempotency and duplicate constraints; concurrent issue/reservations; reversals; units and per-line receiving.

**E3 PWA/QR (P0):** confirm web build; secure QR resolution; live bin page and manual fallback; install/cache policy; physical label testing.

**E4 Zoho (P1):** OAuth/scope/encryption; org/location/SKU policy; dry-run import; durable queue and unknown outcomes; reconciliation/kill switch; sandbox/canary.

**E5 Equipment/planning (P1/P2):** verify inspection lifecycle; validate trips/kits/reservations; define reorder approval; add demand/cost reports only after data quality.

**E6 Operations (P0):** separate environments; CI secrets; health/logs/alerts; encrypted backup/restore; incident/runbooks; support, RTO/RPO and approvals.

## Representative stories

- Employee scans or enters a bin code and sees current authorized contents.
- Receiver can place delivery lines into different bins.
- Manager approves an issue once and traces ledger and Zoho result.
- Driller requests kit for a trip and sees shortage before collection.
- Custodian inspects returns and keeps damaged assets unavailable.
- Administrator pauses outbound writes without losing command history.

## Definition of done

Acceptance criteria and owner are recorded; code reviewed; success/failure/concurrency/access tests pass; logs are safe; documentation/migrations updated; staging evidence attached; recovery understood; warehouse/product owner accepts behavior.

