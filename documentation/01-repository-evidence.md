# Repository Evidence and Implementation Status

Checked 24 October 2026 | Repository: https://github.com/ballyalley-o/sis-companion-app | Default branch: main

## Inspection boundary

The public GitHub `main` source was cloned and inspected on 24 October 2026. The root README is empty. The source tree contains `.emergent`, `backend`, `frontend`, `documentation`, `tests` and related project data. The Emergent share preview was not accessible from this environment, so the deployed preview, its current revision and its hosting configuration were not inspected.

Source confirms an Expo SDK 57 / React Native 0.86 application using Expo Router, React Native Web and Metro's `single` web output. The backend is FastAPI with Motor/MongoDB and a Zoho adapter. `expo-camera` is configured, while the scan screen explicitly uses manual entry on web. Existing bin screens, QR payload generation and API scan resolution are present. This confirms the committed source architecture; it does not confirm the current Emergent deployment or its runtime behavior.

## Dated evidence

| Date and evidence | Supports | Does not prove |
|---|---|---|
| 8 Oct, commit 6b289c9, “DrillStock Pro MVP complete” | Reported requests, approvals, stocktakes, reports, QR labels, equipment; 24/24 server checks reported | Current code, security, live Zoho or production availability |
| 11 Oct, commit d9ad774 | Reported 100 x 50 mm labels, receipts, common items and spelling suggestions; print dialog not verified | Physical dimensions, printer compatibility or scan performance |
| 11 Oct, commit 5d01fed | Reported rig kits and Google sign-in; manual identity verification remained | Present auth configuration and production identity |
| 18 Oct, commit 79b4f80 | Reported Zoho setup/import, SKU matching, unassigned stock and encrypted credential storage; live account not yet tested then | Present code/security and live data integrity |
| 18 Oct, commit 98382eb | Reported credentials accepted by Zoho and connection awaiting user consent | Production OAuth, safe credential handling today or successful import |
| 18 Oct, commit 47ea594 | Reported organization/location selection and import instructions | User-completed testing or current mapping correctness |
| 19 Oct, commit 0ab6ac0 | Reported trips, reservations, issue, reorders, partial receipt and history; 22 server checks reported passing | Current tests, complete UI behavior or live posting |
| 22 Oct, commit ff3e115 | Commit says README instructions removed | No conclusion about code/runtime behavior |

## Capability register

| Capability | Status | Verification required |
|---|---|---|
| Requests, approvals and stock movement | Reported in history | Inspect handlers, transactions and state machine |
| Warehouse isolation | Reported in history | Test all API/query boundaries |
| Ledger and idempotency | Reported in history | Inspect schema, indexes and duplicate retries |
| QR labels | Reported in history | Inspect payload, authorization and physical print |
| Equipment loans | Reported in history | Inspect lifecycle, inspection and retention |
| Zoho OAuth/import | Reported in history | Inspect scopes, encryption, mapping and exceptions |
| Live Zoho mutation | Unknown/unverified | Test operations in sandbox and reconcile |
| PWA installability | Manifest, icons and static-only service worker added in this change; browser install still unverified | Deploy on HTTPS, check host rewrites and test target browsers/devices |
| Offline transactions | Earlier history said not built | Confirm source; do not enable without conflict design |
| CI/CD, monitoring, backups | Unknown/unverified | Inspect deployment and perform drills |

## Source audit sequence

Pin source revision and SHA. Inspect agent instructions, manifests, runtime and deployment files. Trace every inventory write through API, database transaction, ledger and Zoho adapter. Review schema, indexes, migrations, fixtures, tests, CI, secrets, backups and monitoring. Run documented checks only against isolated data. Compare actual behavior with this register, update it with revision and evidence paths, then conduct authorized staging acceptance.

Historical reports mention OAuth credentials and setup details. This package omits secrets and old preview callback values. Review repository and conversation history for exposed valid credentials; rotate as needed and ensure no secret is committed, logged or embedded in client assets.

