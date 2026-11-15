# SIS Companion

Warehouse stock, QR bin locations, equipment loans, and purchase-order receiving for the QLD and NSW warehouses.

The existing application uses Expo Router, React Native, and React Native Web with a FastAPI backend and MongoDB. Docker Compose runs the frontend, API, and database together. The backend does not require Emergent runtime services.

## Run locally

1. Install Docker Desktop and start it.
2. From the repository root, copy the development configuration:

   ```sh
   cp .env.example .env
   ```

3. Replace `JWT_SECRET` with a random secret of at least 32 characters and `ZOHO_TOKEN_KEY` with a valid Fernet key. Keep the MongoDB password consistent between `MONGO_ROOT_PASSWORD` and `MONGO_URL`. Generate a Fernet key with a Python installation that has `cryptography` installed:

   ```sh
   python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
   ```

4. Build and start the application:

   ```sh
   docker compose up --build
   ```

5. Open [SIS Companion](http://localhost:8081). The API runs at [localhost:8000](http://localhost:8000), and its database readiness check is [API readiness](http://localhost:8000/api/health/ready).

The example configuration enables development demo data and demo sign-in buttons. Demo users are seeded only with `APP_ENV=development` and `SEED_DEMO_DATA=true`. These settings and credentials are for local use.

Stop this Compose instance with:

```sh
docker compose down
```

Database and upload volumes are preserved. Closing a browser or terminal does not necessarily stop detached containers. Run Compose from the same checkout to avoid creating another instance.

### Preview from a phone

Use the computer's LAN address instead of `localhost` in the phone's browser. Configure `EXPO_PUBLIC_BACKEND_URL` to use that computer's API address, and add the exact frontend origin to `CORS_ORIGINS` before rebuilding. For example, if the computer is `192.168.1.20`:

```dotenv
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.20:8000
CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081,http://192.168.1.20:8081
```

Both devices must be on a network that permits the connection. Browser camera features may require HTTPS. Frontend environment variables are embedded at build time, so changing them requires rebuilding the web image.

## Stock requests and shortages

Drillers submit take or return requests. Managers review requests within their warehouse; administrators can review across warehouses.

### Normal fulfilment

1. The driller selects a warehouse, rig, items, quantities, and requested bins.
2. The request is submitted as **Pending**.
3. A manager or administrator reviews it and selects **Approve** or **Reject**.
4. Approval checks stock in the selected bins before issuing the full request. The existing stock-adjustment integration applies according to the configured Zoho mode.

### Shortage-to-purchase workflow

1. A driller can request more than the selected bin currently holds. The form warns about the bin shortage rather than blocking submission.
2. Open the request detail to review **Stock shortage**. Purchase quantities are calculated across the selected warehouse, combining repeated product lines and stock in other bins.
3. If the warehouse is short, a manager or administrator selects **Request purchase**.
4. SIS stores a purchase draft on the original request, assigns a `PUR-<stock request number>` reference, changes its status to **Awaiting purchase**, records the action in history, and notifies the requester in the app.
5. An authorised person creates, approves, and sends the actual purchase order in Zoho outside SIS.
6. Enter the PO number or reference under **Zoho PO reference** and select **Link Zoho PO**. The app uses the existing read-only Zoho lookup and checks that the PO covers the draft's products and quantities. Cancelled and demo POs are rejected.
7. Receive the delivery through **Orders**, selecting the appropriate put-away bins.
8. Return to the original request and approve it when the requested bins contain sufficient stock. A request awaiting purchase requires a linked Zoho PO before approval.

Example: **10 requested − 6 available across the warehouse = 4 to purchase**. A shortage in one bin alone does not justify a purchase if the warehouse has enough elsewhere; staff must arrange the stock in the requested bins before approval.

Use the **Awaiting purchase** filter on the request list to monitor these requests.

### Current boundaries

- **SIS prepares an internal purchase draft; it does not create or send a PO in Zoho.** Direct PO creation needs additional Zoho write access and supplier/pricing selection work.
- The purchase draft is embedded in the stock request, not a separate editable PO or supplier email.
- Draft quantities capture the stock available at review time. They do not reserve stock or automatically recalculate an existing draft.
- This flow issues the complete request after replenishment; partial fulfilment is not implemented.
- Linking checks product quantities, not supplier approval, price, or remaining unallocated PO quantities across other requests.
- Receipt recording currently updates local SIS stock and history without modifying Zoho stock or the Zoho PO. Normal request approval retains the existing Zoho adjustment behaviour; the whole application is not globally read-only.
- Receiving does not automatically approve the original request. Staff complete that review explicitly.

### Relevant API routes

All routes require authentication. Purchase actions require manager or administrator access and respect warehouse permissions.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/requests` | Submit a take or return request, including requested quantities above available stock. |
| GET | `/api/requests/{id}` | Read a request and its current warehouse shortage. |
| POST | `/api/requests/{id}/purchase` | Store a shortage-only purchase draft and mark the request awaiting purchase. |
| POST | `/api/requests/{id}/purchase/link` | Link a Zoho PO using a JSON body such as `{"reference":"PO-10452"}`. |
| POST | `/api/requests/{id}/approve` | Fulfil a request after stock checks. |
| GET | `/api/requests?status=awaiting_purchase` | List awaiting-purchase requests within the caller's access scope. |

## Checks

The frontend container uses Node.js 22; the backend container uses Python 3.12. With frontend dependencies installed, run from the repository root:

```sh
node frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json
node frontend/test/test-api-base.cjs
node frontend/test/test-bin-label.cjs
node frontend/test/test-warehouse-map.cjs
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -p test_purchase_shortage.py -v
```

The shortage test suite checks missing quantities, combined products and bins, zero stock, repeat purchase actions, invalid request states, and competing updates. It uses isolated calculations and database stubs; it does not verify a live MongoDB deployment or Zoho account.

Build a browser export from the frontend directory:

```sh
cd frontend
npx expo export --platform web
```

A successful build does not confirm physical-device layouts, camera access, or live supplier/Zoho behaviour. Those require separate acceptance checks.

## Deployment

Use the backend and frontend Dockerfiles with managed MongoDB and private S3-compatible object storage. Production needs unique secrets, exact frontend CORS origins, demo seeding disabled, and a first-admin bootstrap. See the [self-hosting guide](documentation/13-self-hosting.md) for configuration and deployment details.

Zoho remains in mock mode unless an administrator explicitly connects and configures Live mode. Infrastructure preparation and tests should use mock data; purchase-draft preparation itself does not modify real Zoho stock.

## Further documentation

The [documentation index](documentation/README.md) contains the engineering documents and roadmap. This README describes the shortage flow implemented in this checkout; it does not establish that a hosted deployment has been updated.
