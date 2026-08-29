-- Mirrors the executable Prisma migration. See apps/api/prisma/migrations.
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

CREATE TABLE "customers" (
    "id" UUID NOT NULL PRIMARY KEY,
    "email" VARCHAR(254) NOT NULL UNIQUE,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "auth_version" INTEGER NOT NULL DEFAULT 1,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "customers_email_normalized_check" CHECK ("email" = lower("email")),
    CONSTRAINT "customers_failed_login_count_check" CHECK ("failed_login_count" >= 0),
    CONSTRAINT "customers_auth_version_check" CHECK ("auth_version" > 0)
);

CREATE TABLE "customer_refresh_sessions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "tickets"
ADD COLUMN "customer_id" UUID REFERENCES "customers"("id") ON DELETE SET NULL;

CREATE INDEX "customers_status_created_at_idx" ON "customers"("status", "created_at");
CREATE INDEX "customer_refresh_sessions_customer_id_expires_at_idx"
ON "customer_refresh_sessions"("customer_id", "expires_at");
CREATE INDEX "tickets_customer_id_issued_at_idx" ON "tickets"("customer_id", "issued_at");
