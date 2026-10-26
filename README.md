# SIS Companion / DrillStock Pro

Expo Router and React Native Web frontend with a FastAPI and MongoDB backend. The frontend runs as a PWA-capable web app; the backend can run as a standalone container without Emergent runtime services.

## Run locally

1. Copy `.env.example` to `.env` and replace the JWT and Fernet keys. The example enables demo data and demo logins for local development only.
2. Start Docker Desktop.
3. Run `docker compose up --build` from the repository root.
4. Open `http://localhost:8081`.

The API is available at `http://localhost:8000`. Local demo accounts are created only when `APP_ENV=development` and `SEED_DEMO_DATA=true`.

## Deploy

Use the backend and frontend Dockerfiles with a managed MongoDB database and S3-compatible private object storage. Production must use a separate database, unique secrets, explicit CORS origins and a first-admin bootstrap. Follow [the self-hosting guide](documentation/13-self-hosting.md) for environment variables, Google sign-in setup, deployment, and cutover requirements.

Zoho integration remains in mock mode unless an administrator explicitly configures and connects it. Do not point a new deployment at production Zoho or copy real stock data while preparing infrastructure.

## Documentation

The production engineering documents and roadmap are in [`documentation/`](documentation/README.md).
