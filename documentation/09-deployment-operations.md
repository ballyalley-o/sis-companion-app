# Deployment and Operations Runbook

Version 1.0 | Target procedure; hosting platform unverified

See [Self-hosting and Deployment Guide](13-self-hosting.md) for the Docker images, environment variables, first-admin setup, Google web authentication, object storage and data-cutover requirements. The Compose stack is for development only; production requires isolated managed services.

## Environments and release

Maintain separate development, staging and production environments, URLs, databases, OAuth clients, storage and credentials. Never copy production secrets/data into development. CI requires reviewed changes, protected branch, build/tests/security/migration checks and least-privilege credentials. Release an immutable artifact from a recorded commit.

Release sequence: document change/migration and recovery; verify backups and sync queue; deploy staging and smoke test; obtain approvals; deploy production; verify health, sign-in, read-only stock and safe transaction; monitor errors, queue lag and reconciliation; roll back app only with explicit handling for schema and already-posted Zoho transactions.

## PWA deployment

Serve HTTPS. Verify manifest, icons, start URL, display mode, service-worker scope and cache policy. Cache shell assets deliberately; protect stock data with authorization/cache controls. Ensure updates do not interrupt active transactions. Manual lookup remains available if camera permission is denied.

## Monitoring

Track API availability/latency/errors, auth failures, database capacity, queue age, Zoho response class, pending/unknown transaction age, reconciliation differences, backup age and domain/certificate expiry. Alerts route to named responders. Logs include correlation IDs and redact sensitive values.

## Backup and recovery

Agree RPO/RTO. Back up database and required attachments on schedule; encrypt and restrict. Restore into an isolated environment on a recurring schedule and before launch. Verify app compatibility, migrations, access and reconciliation. An untested backup is not proven.

Recovery: contain suspected unauthorized/incorrect writes; disable outbound Zoho if appropriate; preserve evidence; restore at approved point; reconcile local ledger, Zoho and source documents; create linked correction events; communicate status; resume after dual approval.

## Incident runbooks

**Zoho unavailable:** show status, pause/queue according to approved authority, alert owner, avoid manual duplicates and reconcile unknown outcomes before resume.

**Incorrect movement:** pause workflow/writes, locate request and correlation/idempotency IDs, compare ledger, Zoho and physical stock, obtain correction approval, append correction and document incident.

**Credential loss:** revoke and rotate, audit usage, pause integration, reauthorize least privilege and reconcile pending commands.

**Service outage:** communicate safe manual procedure. Do not create an uncontrolled parallel stock ledger. Reconcile paper actions on recovery and record original event time and operator.

Before launch name product owner, technical support, warehouse approver, Zoho administrator and backup custodian; document hours and escalation path.

# Web/PWA deployment notes

The frontend is an Expo Router application using React Native Web and Metro's `single` output. Deploy the exported web bundle behind HTTPS with a fallback rewrite to `index.html` for app routes. `frontend/public/manifest.json` supplies install metadata; `frontend/public/service-worker.js` caches only static app assets and excludes API/data paths.

Set backend `PUBLIC_APP_URL` to the public HTTPS origin (for example, `https://inventory.example.com`) before generating bin labels. Without it, QR labels continue to use the legacy `BIN:{code}` text payload. Rebuild/redeploy the web frontend when its config changes. Verify deep links, authentication return behavior, installation and labels in the actual hosting environment before rollout. PWA caching does not provide offline inventory access.

