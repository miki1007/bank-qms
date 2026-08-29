# Backup and restore

Production-like deployments retain encrypted daily PostgreSQL backups for at least 14 days. Example operator commands:

```bash
pg_dump --format=custom --no-owner --file=bank_qms_YYYYMMDD.dump "$DATABASE_URL"
pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" bank_qms_YYYYMMDD.dump
```

Restore only into an isolated database first. Run schema and count checks, authenticate with a controlled test account, verify recent ticket events/audits, then switch application connectivity through the approved incident procedure. Record one restoration exercise per release cycle.
