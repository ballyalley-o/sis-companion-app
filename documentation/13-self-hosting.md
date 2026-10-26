# Self-hosting and Deployment Guide

Version 1.0 | Container-based, provider-neutral deployment baseline

## What this provides

The backend and PWA frontend now build as independent Docker images. The backend uses FastAPI, MongoDB and configurable CORS; the browser app is exported by Expo/Metro and served by Nginx with SPA deep-link fallback. Photo storage supports local files for development and private S3-compatible storage for production. Password sign-in works with the backend's own JWT sessions. Web Google sign-in uses Google Identity Services and server-verified ID tokens instead of Emergent's session exchange.

The Compose stack is for local development only. It starts a local MongoDB with demo records, exposes the API on port 8000 and serves the app at port 8081. Do not use its demo database, passwords, local file storage or CORS origins in production.

## Local Docker run

1. Install Docker Desktop and copy `.env.example` to `.env`.
2. Generate unique local values for `JWT_SECRET` and `ZOHO_TOKEN_KEY`. A Fernet key can be generated with Python's standard library:

   ```sh
   python -c 'import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())'
   ```

3. Keep the example's `APP_ENV=development`, `SEED_DEMO_DATA=true`, `STORAGE_BACKEND=local`, and `EXPO_PUBLIC_ENABLE_DEMO_ACCOUNTS=true` only in the local `.env`.
4. Run `docker compose up --build` from the repository root and open `http://localhost:8081`.

Compose persists MongoDB and uploaded development images in Docker volumes. For a clean local reset, stop the stack and remove the named volumes only after confirming there is no work to keep.

## Production components

Choose a container host, a managed MongoDB service, and an S3-compatible object store. Publish the backend image from `backend/Dockerfile` and the frontend image from `frontend/Dockerfile`. Use HTTPS at the public edge. The backend exposes `/api/health/live` and `/api/health/ready`; configure the host's readiness probe to use the latter.

Create a new, isolated production database. Do not copy the development demo database or connect infrastructure setup to the existing live Zoho organization. Restrict MongoDB network access to the backend host, enable database authentication and TLS, enable automated backups, and test a restore before accepting operational data.

## Backend environment

Set these secrets and settings on the backend service:

| Variable | Purpose |
|---|---|
| `APP_ENV` | Set to `production`. |
| `APP_NAME` | Stable object storage path prefix, such as `sis-companion`. |
| `MONGO_URL` | TLS-enabled managed MongoDB URI for the new production database. |
| `DB_NAME` | Production database name. |
| `JWT_SECRET` | Unique random secret of at least 32 characters. |
| `ZOHO_TOKEN_KEY` | Valid Fernet key used to encrypt Zoho secrets stored in MongoDB. Keep stable while encrypted values exist. |
| `CORS_ORIGINS` | Comma-separated exact HTTPS frontend origins; no wildcard. |
| `STORAGE_BACKEND` | Set to `s3` in production. |
| `S3_BUCKET` | Private bucket name for equipment photos. |
| `S3_REGION` | Bucket region or `auto` for providers that require it. |
| `S3_ENDPOINT_URL` | Optional S3-compatible endpoint; omit for AWS S3. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Least-privilege storage credentials, or use the host's workload identity where available. |
| `PUBLIC_APP_URL` | Public HTTPS app origin used when generating direct bin QR links. |
| `GOOGLE_CLIENT_ID` | Optional Google web OAuth client ID; must match the frontend build value. |

Do not set `SEED_DEMO_DATA=true` in production. The server refuses this configuration. Never use the demo admin credentials outside a local development database.

## First administrator

After the production backend can reach its empty MongoDB database, run `python bootstrap_admin.py` once inside the backend container with `APP_ENV=production`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (minimum 14 characters), `MONGO_URL` and `DB_NAME`. The script refuses to add an administrator if an admin already exists. It creates the QLD and NSW warehouse records without demo products or stock.

Remove the bootstrap password from the service environment after use. Create or invite staff through the admin UI. Confirm the configured roles and warehouse assignments before operational use.

## Frontend build variables

Frontend values are embedded at build time. Rebuild the image after changing them.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | Backend origin, with no `/api` suffix (for example, `https://api.example.com`). |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Same Google web client ID as `GOOGLE_CLIENT_ID`; optional. |
| `EXPO_PUBLIC_ENABLE_DEMO_ACCOUNTS` | Set to `false` for every non-local build. |

Do not pass any demo account email/password build variables in production. Configure the backend `CORS_ORIGINS` to the exact frontend origin, such as `https://inventory.example.com`. If the frontend and API use one origin through a reverse proxy, route `/api/*` to the backend and use the site's own origin consistently.

## Google sign-in

Google sign-in is optional; password sign-in does not require it. In Google Cloud Console, configure an OAuth consent screen and a Web application client. Add the deployed frontend HTTPS origin and local development origin to the client's authorized JavaScript origins. Set the client ID as `GOOGLE_CLIENT_ID` on the backend and `EXPO_PUBLIC_GOOGLE_CLIENT_ID` when building the frontend. No Google client secret is needed for this ID-token flow. Google issues a credential to the browser and the backend verifies the token signature and audience before issuing the app's own JWT. See Google's [Sign in with Google button guide](https://developers.google.com/identity/gsi/web/guides/display-button) and [server-side ID token verification guide](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

Zoho purchase-order tracking needs the `ZohoInventory.purchaseorders.READ` OAuth scope. Existing Zoho connections must be disconnected and reconnected after this release so the operator can grant the new scope. Purchase-order receipt scanning writes received counts to SIS's local database and stock ledger only; it does not create a Zoho purchase receive or alter Zoho stock.

The current native iOS/Android Google sign-in flow is not included in this self-hosting baseline. Native users can use password sign-in until native OAuth client IDs and an Expo-compatible native flow are configured.

## Zoho and data cutover

Zoho remains mock mode by default. This deployment work does not connect to Zoho or create, adjust, receive or issue any real stock. Before enabling a real Zoho account, verify organization, location mappings, encryption key retention, permissions, sandbox behavior, reconciliation and an approved rollback plan.

This baseline does not migrate the Emergent database or existing photo objects. Moving current users, inventory, audit history, Zoho settings or attachments requires an authorized export, reconciliation and a separate migration plan. Preserve the current `ZOHO_TOKEN_KEY` if migrating encrypted Zoho configuration; changing it makes stored encrypted values unreadable. Existing Emergent object-store photos must be copied into the production bucket and their references verified before cutover.

## Release checklist

- Build/publish staging containers from a recorded commit with a dedicated staging database and bucket.
- Set production origins, secrets, storage and HTTPS before any production deployment.
- Keep demo seeding, demo login UI and local storage disabled in production.
- Create the first administrator with the one-time bootstrap command and remove its password from the environment afterwards.
- Verify health, password login, optional Google login, bin read access, photo upload/download, authorization boundaries and backup restore in staging.
- Verify direct `/bin/{id}` frontend routes reach the SPA entry point and generated bin QR links use `PUBLIC_APP_URL`.
- Keep Zoho in mock mode until its separate sandbox and production cutover are approved.
- Do not declare production ready until data migration, monitoring, support ownership, recovery objectives and incident procedures are approved.
