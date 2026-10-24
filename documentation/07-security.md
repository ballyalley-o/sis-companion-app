# Security and Privacy Requirements

Version 1.0 | Baseline pending threat review

## Assets and threats

Protect employee accounts, stock, warehouse mappings, movement history, equipment custody, OAuth credentials, backups and deployment secrets. Threats include compromised accounts, cross-warehouse access, QR enumeration, duplicate requests, malicious uploads, leaked secrets, dependency compromise and accidental live test writes.

## Required controls

- Authenticate through an approved identity method; enforce server-side role and warehouse scope on every protected operation.
- Deny by default, apply least privilege, use strong admin authentication, disable accounts promptly and revoke sessions.
- Test object-level authorization with identifiers from other users/warehouses; never trust client-supplied actor, role or warehouse.
- Validate input and state transitions; use parameterized database access and rate limits for auth, QR and mutations.
- Apply CSRF protections for cookie sessions, secure cookie attributes, suitable CORS, CSP and output encoding.
- Validate uploads by type/size, store safely and scan where supported.
- Keep credentials outside source, browser bundle, logs and fixtures. Rotate any historical secret that may remain valid.
- Encrypt database, storage and backups; restrict export/log access.
- Define retention for audit, identity, signatures and equipment photos.

## Audit and response

Audit login failures, role/mapping changes, stock movements, approvals, receipts, counts, equipment handoffs, integration configuration and sync outcomes. Include actor, entity, time, reason and correlation ID; exclude tokens/secrets and unnecessary personal data. Restrict access and alert on suspicious patterns.

Require peer review, dependency/secret scanning, protected branches, least-privilege CI and separated deployment credentials. Maintain incident severity, containment, credential rotation, evidence preservation, communication and recovery procedures. Include Zoho misuse and accidental stock adjustment scenarios.

## Pre-release review

Verify account lifecycle, API authorization, secret/history assessment, TLS/headers/CORS/uploads/rate limits, dependency findings, backup access, QR enumeration resistance, audit completeness and incident access. Resolve critical/high findings or obtain accountable written risk acceptance.

