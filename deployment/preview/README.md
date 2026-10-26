# Temporary demo preview

This Compose stack uses a separate MongoDB volume, sample records, and fresh secrets. It publishes the existing Expo web app and FastAPI backend through a temporary Cloudflare Tunnel. The gateway requires a separate preview password, gates API access with a secure cookie, and disables all Zoho connection/settings/import routes. The frontend calls `/api` on the preview origin. No backend or database ports are published.

Generated secrets, gateway configuration, and the current preview URL live in the ignored `.preview/` directory. They must not be committed. The preview requires this Mac and Docker to stay running. Restarting the tunnel can change its URL.

Run from the repository root after preparing `.preview/api.env`, `.preview/runtime.env`, `.preview/nginx.conf`, and `.preview/htpasswd`. Copy the gateway files into its Docker-managed volume before its first start:

```sh
docker compose -p sis-temporary-preview --env-file .preview/runtime.env -f deployment/preview/compose.yml build
docker compose -p sis-temporary-preview --env-file .preview/runtime.env -f deployment/preview/compose.yml create
docker compose -p sis-temporary-preview --env-file .preview/runtime.env -f deployment/preview/compose.yml cp .preview/nginx.conf web:/etc/nginx/conf.d/default.conf
docker compose -p sis-temporary-preview --env-file .preview/runtime.env -f deployment/preview/compose.yml cp .preview/htpasswd web:/etc/nginx/conf.d/preview.htpasswd
docker compose -p sis-temporary-preview --env-file .preview/runtime.env -f deployment/preview/compose.yml up -d
```

Stop the preview and revoke its public URL without deleting sample data:

```sh
docker compose -p sis-temporary-preview --env-file .preview/runtime.env -f deployment/preview/compose.yml down
```

This is a temporary demo, not a production deployment. Physical scanners and real Zoho access require separate validation.
