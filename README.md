# SIS Companion

Expo Router and React Native Web frontend with a FastAPI and MongoDB backend. The frontend runs as a PWA-capable web app; the backend can run as a standalone container without Emergent runtime services.

## Run locally

1. Copy `.env.example` to `.env` and replace the JWT and Fernet keys. The example enables demo data and demo logins for local development only.
2. Start Docker Desktop.
3. Run `docker compose up --build` from the repository root.
4. Open `http://localhost:8081`.

The API is available at `http://localhost:8000`. Local demo accounts are created only when `APP_ENV=development` and `SEED_DEMO_DATA=true`.

## Stock requests and purchase shortages

Drillers submit take or return requests. Managers review requests within their assigned warehouse; administrators can review across warehouses.

### Normal request

1. Select the warehouse, driller, rig, products, requested bins, and quantities.
2. Submit the request. Its status starts as **Pending**.
3. A manager or administrator reviews and approves or rejects it.
4. Approval checks the selected bins and issues the complete request. Normal approval retains the existing stock-adjustment behaviour for the configured Zoho mode.

### When stock is insufficient

1. Submit the full quantity needed. The form warns when the selected bin is short rather than blocking submission. Products without a stock location require a requested receiving bin.
2. Open the request detail and review **Stock shortage**. SIS combines demand for each product and checks available stock across the selected warehouse, including other bins.
3. A manager or administrator selects **Request purchase** for the missing quantity.
4. SIS creates an internal purchase draft with reference `PUR-<stock request number>`, changes the request to **Awaiting purchase**, records the action in history, and creates an in-app notification for the requester.
5. An authorised person creates, approves, and sends the actual PO in Zoho outside SIS.
6. Enter its number or reference in **Zoho PO reference** and select **Link Zoho PO**. The existing read-only lookup checks product quantities. Demo and cancelled orders cannot be linked.
7. Receive the delivery through **Orders**, putting stock into the requested bins.
8. Return to the original request and approve it after replenishment. Requests awaiting purchase require a linked Zoho PO and sufficient stock in their selected bins.

Example: **10 requested − 6 available across the warehouse = 4 to purchase**. If enough stock exists in another bin, arrange that stock in the requested bins instead of purchasing more.

Use the **Awaiting purchase** filter in the request list to monitor outstanding purchases.

### Current implementation limits

- **The purchase draft is an internal SIS record, not a PO created or sent in Zoho.** Direct creation needs additional Zoho write access and supplier/pricing selection.
- Draft quantities capture availability at review time. They do not reserve stock or automatically recalculate an existing draft.
- The original request is fulfilled in full after replenishment; partial issues are not implemented by this flow.
- PO linking checks product quantities, not supplier approval, prices, or quantities allocated to other requests.
- Purchase-order receiving updates local SIS stock and history without changing Zoho stock or the Zoho PO. Normal request approval retains its existing Zoho adjustment behaviour.
- Receiving does not automatically approve the original request. Warehouse staff perform the final review.

### API reference

All routes require authentication. Purchase actions require manager or administrator access and enforce warehouse permissions.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/requests` | Submit a take or return request, including quantities above available stock. |
| GET | `/api/requests/{id}` | Read a request and its current warehouse shortage. |
| POST | `/api/requests/{id}/purchase` | Prepare the shortage-only purchase draft. |
| POST | `/api/requests/{id}/purchase/link` | Link a Zoho PO with a body such as `{"reference":"PO-10452"}`. |
| POST | `/api/requests/{id}/approve` | Fulfil the full request after stock checks. |
| GET | `/api/requests?status=awaiting_purchase` | List purchases within the caller's request access scope. |

## Verification

The frontend Docker build uses Node.js 22 and the backend uses Python 3.12. With frontend dependencies installed, run from the repository root:

```sh
node frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json
node frontend/test/test-api-base.cjs
node frontend/test/test-bin-label.cjs
node frontend/test/test-warehouse-map.cjs
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -p test_purchase_shortage.py -v
```

The shortage tests cover calculations across bins, repeated products, zero stock, duplicate purchase actions, invalid states, and competing updates. These isolated tests use database stubs; they do not verify live MongoDB or Zoho behaviour.

To build the browser app:

```sh
cd frontend
npx expo export --platform web
```

Device layouts, camera access, and live integration behaviour need separate acceptance checks.

## Local operation notes

Stop the Compose instance from the same checkout:

```sh
docker compose down
```

This preserves database and upload volumes. Closing the browser does not stop containers.

For a phone on the same network, use the computer's LAN address rather than `localhost`. Set `EXPO_PUBLIC_BACKEND_URL` to that computer's API origin and include the exact frontend origin in `CORS_ORIGINS`, then rebuild. Frontend environment variables are embedded at build time. Browser camera features may require HTTPS.

## Deploy

Use the backend and frontend Dockerfiles with a managed MongoDB database and S3-compatible private object storage. Production must use a separate database, unique secrets, explicit CORS origins and a first-admin bootstrap. Follow [the self-hosting guide](documentation/13-self-hosting.md) for environment variables, Google sign-in setup, deployment, and cutover requirements.

Zoho integration remains in mock mode unless an administrator explicitly configures and connects it. Do not point a new deployment at production Zoho or copy real stock data while preparing infrastructure.

## Documentation

The production engineering documents and roadmap are in [`documentation/`](documentation/README.md).


## Release version and deployment identity

The frontend package version in `frontend/package.json` is the release version. Expo's dynamic configuration reads that same value, so the web and native configuration use one version source.

The app displays its version on **More**, the **login screen**, and the **desktop sidebar**. For example, `v1.0.0 · a1b2c3d` identifies both the release and source revision. `modified` means the exported working tree included uncommitted changes; `unidentified build` means no revision was supplied or available. The More footer also shows the UTC build timestamp embedded during export.

### Build metadata

- Local Expo builds read the current Git revision and working-tree state.
- Vercel builds use `VERCEL_GIT_COMMIT_SHA` when available.
- Docker builds need `BUILD_COMMIT` and `BUILD_DIRTY` passed through Compose because the frontend build context does not contain Git metadata:

  ```sh
  export BUILD_COMMIT="$(git rev-parse HEAD)"
  export BUILD_DIRTY=false
  if [ -n "$(git status --porcelain)" ]; then export BUILD_DIRTY=true; fi
  docker compose up --build
  ```

The label describes the **frontend artifact being viewed**, not the separately deployed backend. Existing hosted exports will show the label only after they are rebuilt and deployed. Building locally does not update a hosted deployment.

### Change the release version

From the frontend directory, use semantic versioning:

```sh
npm version patch --no-git-tag-version
```

Use `patch` for fixes, `minor` for compatible features, or `major` for breaking changes. This updates `package.json` and its npm lockfile. Review and commit the release changes before building a clean deployment. The Git revision distinguishes multiple builds of the same release number.

Validate metadata generation with:

```sh
node frontend/test/test-release.cjs
```


## Staff help centre

User-facing guides live in [`guide/`](guide/README.md), separate from the engineering specifications. Build the static site with `python3 guide/build.py`. It includes task guides, search, workflow diagrams, mobile navigation, and printable pages.

The intended hostname is `doc.siscompanion.com.au`. This is a deployment target, not a claim that DNS or hosting is live. Protect every documentation route and static asset with a staff identity gate before publishing. See the [hosting checklist](guide/HOSTING.md).

After the host is ready, set `EXPO_PUBLIC_DOCUMENTATION_URL=https://doc.siscompanion.com.au` in the frontend build environment and rebuild. **More → Help centre** opens the same guide site from web or native mobile. It does not send an SIS session token through the URL.


## User and rig accounts

Open **More → My account** to view your email, role, active status, home warehouse, assigned rig, base area, and senior drilling manager. Users can update their own name and upload/change/remove their profile photo. Profile photos use the existing configured storage service; removing a profile photo unlinks it and does not purge the stored file.

**My account → Update password** requires the current password and a new password of at least 12 characters (maximum 72 UTF-8 bytes). A successful change revokes previous sessions and keeps the changing session signed in with a replacement token. Password-only changes do not affect the user's role or rig. Google-only accounts without a password must contact an administrator rather than using this form to bypass current-password verification.

### Role and warehouse permissions

| Role | Operational scope | System administration |
| --- | --- | --- |
| Driller | Own profile and explicitly assigned rig account. Existing individual request/trip detail permissions remain enforced. | No. |
| Warehouse manager | Operational actions in the assigned QLD or NSW warehouse. | No. |
| Senior drilling manager | Operational manager permissions in the assigned QLD or NSW warehouse; may supervise rigs there. | No. |
| General manager | Operational manager permissions across both warehouses. | No user/role administration or Zoho configuration access. |
| Administrator | All warehouses, role and crew assignments, integration configuration. | Yes. |

Senior drilling manager is one role with a mandatory regional warehouse assignment, not two duplicated role types. Account roles and rig assignments are administrator-controlled, never editable through self-service profile updates.

### Configure rigs and crew

1. Create the required senior drilling manager account in **Users & roles**, selecting QLD or NSW.
2. Open **More → Rig accounts**, select an existing rig, then **Manage rig details**. Set its warehouse, base area, and active senior drilling manager in the same warehouse.
3. Open **Users & roles → Manage account** to assign each user to a matching warehouse and rig. Access changes invalidate that user's previous sessions; they must sign in again.
4. The rig account shows crew, current/upcoming and recent trips, equipment loans, stock request summaries, stock movements, and rig-account audit activity.

Legacy rigs are not assigned regions by guessing from rig numbers or historical stock. Administrators or the general manager first configure unassigned rigs. Regional managers can manage rigs already in their warehouse. Cross-warehouse rig transfers require a separate reviewed migration; this screen deliberately refuses them to preserve historical warehouse associations.

### Operations pallet allocations

Warehouse staff can allocate a labelled pallet to an active **SEC1** Operations bin in the rig's own warehouse. Pallet references are unique within each warehouse. Staff can move a pallet between valid Operations bins, release it, or store it again. Released records remain visible for history.

These are physical allocation records with a contents description. They do not automatically deduct, reserve, transfer, or otherwise change stock quantities in SIS or Zoho. A pallet is not automatically a product stock row. The current screen does not transfer an existing pallet reference between rigs.

### Scope and verification

Rig dashboards use the rig number **and warehouse** to match existing requests, trips, loans, and movements. They show up to 100 records per activity category, 200 pallet records, and explicitly assigned crew. Equipment signatures are excluded from the rig summary. Existing detail screens retain their own access checks, so a driller sees links to their own request/trip details only.

Account API tests use an isolated stub database and cover password changes, token versions, profile-photo ownership, privilege escalation, regional rig access, supervisor validation, pallet restrictions, and warehouse-filtered summaries. They do not constitute live database, storage, or device verification.

```sh
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -p test_account_api.py -v
```

Install the backend application dependencies plus `httpx` for these FastAPI TestClient tests. No live database or Zoho credentials are needed.


### Account editor and Administrator 2

The account view separates fields with additional spacing and uses a status chip. Administrators can open **Edit account details** to update their warehouse and rig, while profile name and photo remain editable through **Save profile**. Email and member-since are read-only. Shared rig base-area and supervisor details are edited through **View / edit rig details**. Ordinary users cannot elevate their own role or change privileged assignments.

**Administrator 2** (`administrator_2`) has operational access across both warehouses, but cannot manage users, grant roles, or configure Zoho. It is intentionally different from Administrator. An Administrator can create or assign this role in **Users & roles**.

Administrator access changes return a replacement token for the current session when editing the current account. Another administrator must downgrade or deactivate your own administrator account. Administrators can explicitly set other accounts Active or Inactive through **Manage account**, with access changes invalidating that user's existing sessions.
