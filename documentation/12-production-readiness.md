# Production Readiness Checklist

Version 1.0 | Gate template; every item needs evidence and an owner

Mark Pass, Fail, N/A with reason, or Open. Critical/high-risk open items block launch unless an accountable owner records explicit acceptance, expiry and review.

## Product and ownership

- [ ] Product, technical, warehouse and support owners named.
- [ ] Roles, warehouse scope and approval thresholds signed off.
- [ ] Supported devices, service hours, PWA scope and fallback agreed.
- [ ] User training, onboarding and outage procedure ready.

## Source and release

- [ ] Release commit and artifact recorded; source audit matches claims.
- [ ] CI build, typecheck, lint and tests pass on release commit.
- [ ] Branch protection, review and deploy access are least privilege.
- [ ] Migration and recovery rehearsed on production-like data.

## Security and privacy

- [ ] Authentication, disablement, session expiry and API authorization verified.
- [ ] Guessed cross-warehouse IDs tested.
- [ ] Secrets absent from source, browser bundle, logs and fixtures.
- [ ] Historical exposed credentials assessed/rotated.
- [ ] TLS, headers, CORS, uploads and rate limits verified.
- [ ] Retention covers employee records, photos, exports and audit.
- [ ] Critical/high findings resolved or formally accepted.

## Inventory integrity

- [ ] Movements append-only and attributable.
- [ ] Concurrent issue cannot overdraw available.
- [ ] Retries/duplicate approvals cannot duplicate movements.
- [ ] Reservations release exactly once on terminal paths.
- [ ] Receipt lines support own bin and partial/damaged quantities.
- [ ] Counts, corrections and reversals preserve history.
- [ ] Physical count and variance approval documented.

## Zoho

- [ ] Authority policy and production organization/location approved.
- [ ] OAuth callback, scopes, secret storage and rotation verified.
- [ ] Dry-run import reviewed; SKU/unit exceptions resolved.
- [ ] Each mutation proven in sandbox and reversible.
- [ ] Timeout, unknown outcome, retry and rate limit tested.
- [ ] Reconciliation, operator queue and kill switch demonstrated.
- [ ] Canary and rollback approved.

## PWA and operations

- [ ] HTTPS, manifest, service worker and install tested on supported devices.
- [ ] Private inventory cache/access policy verified.
- [ ] Camera and manual lookup work; real labels scan at target distance.
- [ ] Unknown, stale, retired and offline states are clear.
- [ ] Monitoring, alerts and named responders are ready.
- [ ] Encrypted backups and restore meet approved RTO/RPO.
- [ ] Incident, outage, credential and rollback runbooks rehearsed.

## User acceptance and approval

- [ ] Warehouse staff complete representative end-to-end workflows.
- [ ] Mobile usability and accessibility reviewed.
- [ ] Staff understand pending/approved/issued/unknown/failed states.
- [ ] Limitations and manual fallback communicated.
- [ ] Product, warehouse and technical owners approve.

## Release decision

Decision: Open / Approved / Approved with risks / Rejected  
Version and commit:  
Product approver/date:  
Warehouse approver/date:  
Technical approver/date:  
Accepted risks and review date:  
Rollback owner and trigger:

