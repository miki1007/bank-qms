CREATE TABLE "customer_bank_accounts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "account_type" VARCHAR(24) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "masked_number" VARCHAR(24) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ETB',
    "ledger_balance_minor" BIGINT NOT NULL,
    "available_balance_minor" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "customer_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_bank_transactions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL,
    "description" VARCHAR(160) NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "balance_minor" BIGINT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'POSTED',
    "reference" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_bank_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_bank_accounts_customer_id_account_type_key"
ON "customer_bank_accounts"("customer_id", "account_type");

CREATE INDEX "customer_bank_accounts_customer_id_status_idx"
ON "customer_bank_accounts"("customer_id", "status");

CREATE UNIQUE INDEX "customer_bank_transactions_reference_key"
ON "customer_bank_transactions"("reference");

CREATE INDEX "customer_bank_transactions_account_id_posted_at_idx"
ON "customer_bank_transactions"("account_id", "posted_at");

ALTER TABLE "customer_bank_accounts"
ADD CONSTRAINT "customer_bank_accounts_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_bank_transactions"
ADD CONSTRAINT "customer_bank_transactions_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "customer_bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_bank_accounts"
  ADD CONSTRAINT "customer_bank_accounts_currency_check" CHECK (char_length("currency") = 3),
  ADD CONSTRAINT "customer_bank_accounts_status_check" CHECK ("status" IN ('ACTIVE', 'FROZEN', 'CLOSED'));

ALTER TABLE "customer_bank_transactions"
  ADD CONSTRAINT "customer_bank_transactions_status_check" CHECK ("status" IN ('PENDING', 'POSTED', 'REVERSED'));
