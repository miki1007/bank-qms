CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "auth_version" INTEGER NOT NULL DEFAULT 1,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_refresh_sessions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_refresh_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tickets" ADD COLUMN "customer_id" UUID;

CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");
CREATE INDEX "customers_status_created_at_idx" ON "customers"("status", "created_at");
CREATE INDEX "customer_refresh_sessions_customer_id_expires_at_idx"
ON "customer_refresh_sessions"("customer_id", "expires_at");
CREATE INDEX "tickets_customer_id_issued_at_idx" ON "tickets"("customer_id", "issued_at");

ALTER TABLE "customer_refresh_sessions"
ADD CONSTRAINT "customer_refresh_sessions_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tickets"
ADD CONSTRAINT "tickets_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_email_normalized_check" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "customers_failed_login_count_check" CHECK ("failed_login_count" >= 0),
  ADD CONSTRAINT "customers_auth_version_check" CHECK ("auth_version" > 0);
