# Quality Assurance and Testing Strategy

Version 1.0 | Proposed strategy; current test suite not inspected

## Objectives and test layers

Protect inventory integrity, access boundaries, auditability, Zoho correctness, mobile usability and recovery. Historical messages report groups of passing server checks, including 22 on 19 October 2026. Current source and test commands were not inspected.

| Layer | Coverage |
|---|---|
| Unit/domain | Availability, reservations, transitions, partial receipts |
| Database integration | Atomic updates, constraints, ledger immutability, idempotency |
| API authorization | Roles, warehouse scope, input validation, guessed identifiers |
| Provider contract | OAuth refresh, mapping, rate limits and safe errors |
| End-to-end | Request through approval, issue and history |
| PWA/device | Install, camera/manual scan, offline display and browser matrix |
| Security | IDOR, XSS/CSRF, secrets, uploads, dependency review |
| Operations | Deploy, rollback, backup restore and alerts |
| UAT | Real warehouse receiving, picking, count and equipment workflows |

## Critical cases

Test two managers issuing the last quantity concurrently; response loss/retry; repeated approval; provider accepts but response is lost; multiple receipt lines to different bins with partial/damaged amounts; count concurrent with issue; reservation cancellation/release; cross-warehouse ID guessing; camera denial and stale cache; damaged equipment return.

## Safe tests and gates

Never test against production Zoho or live inventory. Use mocks, sandbox or isolated test tenant. Fail fast if test configuration targets production. Keep production credentials out of CI and use clearly synthetic fixtures.

Release gates: clean install/build/typecheck/lint/full tests; no unexplained flakes in critical flows; migration and recovery rehearsed; Zoho sandbox walkthrough passed; PWA smoke tests on supported devices; accessibility review; critical/high security findings resolved/accepted; backup restore and rollback proven; UAT signed.

Treat suspected incorrect stock mutation as an incident: pause related writes, preserve logs, reconcile both systems and physical stock, then apply approved linked correction.

