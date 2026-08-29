# Deployment

1. Provision PostgreSQL 16 with TLS, restricted network access, backups, and a least-privilege application role.
2. Supply long random access/refresh secrets and unique per-device secrets through the deployment secret manager.
3. Run `pnpm db:migrate` once from a controlled release job.
4. Build with `pnpm build`; serve customer, kiosk, display, and staff Vite assets through HTTPS and proxy `/api/v1` plus `/realtime` to NestJS.
5. Restrict CORS to exact production origins and set `NODE_ENV=production`.
6. Verify `/health/live`, `/health/ready`, customer registration/session restore, staff login, kiosk creation, and display reconnect.
7. Retain the previous application image and database backup for rollback. Database migrations are forward-only; never rewrite an applied migration.
8. Build Android/iOS apps against the same approved HTTPS origins. Keep Play/App Store signing material outside the repository and use managed release credentials.
