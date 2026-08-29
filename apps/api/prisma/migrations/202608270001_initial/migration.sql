-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CounterStatus" AS ENUM ('CLOSED', 'OPEN', 'PAUSED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('TELLER', 'MANAGER');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ISSUED', 'WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketEventType" AS ENUM ('ISSUED', 'ENQUEUED', 'CALLED', 'RECALLED', 'SERVICE_STARTED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('KIOSK', 'DISPLAY');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "location" VARCHAR(255),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Addis_Ababa',
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "average_service_minutes" INTEGER NOT NULL,
    "priority_enabled" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "ServiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "assigned_service_id" UUID,
    "status" "CounterStatus" NOT NULL DEFAULT 'CLOSED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "staff_code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "username" VARCHAR(80) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counter_sessions" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "counter_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "counter_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_sequences" (
    "branch_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_sequences_pkey" PRIMARY KEY ("branch_id","service_type_id","business_date")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "current_service_type_id" UUID NOT NULL,
    "original_service_type_id" UUID NOT NULL,
    "public_number" VARCHAR(30) NOT NULL,
    "business_date" DATE NOT NULL,
    "daily_sequence" INTEGER NOT NULL,
    "status" "TicketStatus" NOT NULL,
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "priority_reason" VARCHAR(50),
    "queue_entered_at" TIMESTAMPTZ(6) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "called_at" TIMESTAMPTZ(6),
    "service_started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "assigned_counter_id" UUID,
    "assigned_staff_id" UUID,
    "counter_session_id" UUID,
    "no_show_count" INTEGER NOT NULL DEFAULT 0,
    "recall_count" INTEGER NOT NULL DEFAULT 0,
    "lookup_secret_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "event_type" "TicketEventType" NOT NULL,
    "from_status" "TicketStatus",
    "to_status" "TicketStatus",
    "service_type_id" UUID NOT NULL,
    "counter_id" UUID,
    "staff_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(255),
    "metadata" JSONB,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "type" "DeviceType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "device_code" VARCHAR(50) NOT NULL,
    "credential_hash" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "branch_id" UUID,
    "actor_type" VARCHAR(30) NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(50),
    "target_id" UUID,
    "outcome" VARCHAR(30) NOT NULL,
    "reason" VARCHAR(255),
    "request_id" VARCHAR(80),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "actor_scope" VARCHAR(120) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "result_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE INDEX "service_types_branch_id_status_display_order_idx" ON "service_types"("branch_id", "status", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_branch_id_code_key" ON "service_types"("branch_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "counters_branch_id_label_key" ON "counters"("branch_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "staff_staff_code_key" ON "staff"("staff_code");

-- CreateIndex
CREATE UNIQUE INDEX "staff_username_key" ON "staff"("username");

-- CreateIndex
CREATE INDEX "staff_branch_id_role_status_idx" ON "staff"("branch_id", "role", "status");

-- CreateIndex
CREATE INDEX "counter_sessions_branch_id_status_idx" ON "counter_sessions"("branch_id", "status");

-- CreateIndex
CREATE INDEX "tickets_branch_id_current_service_type_id_status_priority_q_idx" ON "tickets"("branch_id", "current_service_type_id", "status", "priority", "queue_entered_at", "daily_sequence");

-- CreateIndex
CREATE INDEX "tickets_assigned_counter_id_status_idx" ON "tickets"("assigned_counter_id", "status");

-- CreateIndex
CREATE INDEX "tickets_issued_at_idx" ON "tickets"("issued_at");

-- CreateIndex
CREATE INDEX "tickets_completed_at_idx" ON "tickets"("completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_branch_id_business_date_public_number_key" ON "tickets"("branch_id", "business_date", "public_number");

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_occurred_at_idx" ON "ticket_events"("ticket_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ticket_events_branch_id_event_type_occurred_at_idx" ON "ticket_events"("branch_id", "event_type", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_code_key" ON "devices"("device_code");

-- CreateIndex
CREATE INDEX "audit_logs_branch_id_action_created_at_idx" ON "audit_logs"("branch_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "refresh_sessions_staff_id_expires_at_idx" ON "refresh_sessions"("staff_id", "expires_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_branch_id_operation_actor_scope_key_key" ON "idempotency_records"("branch_id", "operation", "actor_scope", "key");

-- AddForeignKey
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counters" ADD CONSTRAINT "counters_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counters" ADD CONSTRAINT "counters_assigned_service_id_fkey" FOREIGN KEY ("assigned_service_id") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_sessions" ADD CONSTRAINT "counter_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_sessions" ADD CONSTRAINT "counter_sessions_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_sessions" ADD CONSTRAINT "counter_sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_sessions" ADD CONSTRAINT "counter_sessions_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sequences" ADD CONSTRAINT "daily_sequences_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sequences" ADD CONSTRAINT "daily_sequences_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_current_service_type_id_fkey" FOREIGN KEY ("current_service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_original_service_type_id_fkey" FOREIGN KEY ("original_service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_counter_id_fkey" FOREIGN KEY ("assigned_counter_id") REFERENCES "counters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_counter_session_id_fkey" FOREIGN KEY ("counter_session_id") REFERENCES "counter_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_counter_id_fkey" FOREIGN KEY ("counter_id") REFERENCES "counters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL invariants Prisma cannot currently express.
CREATE UNIQUE INDEX "counter_sessions_one_active_per_staff"
ON "counter_sessions" ("staff_id")
WHERE "status" IN ('OPEN', 'PAUSED');

CREATE UNIQUE INDEX "counter_sessions_one_active_per_counter"
ON "counter_sessions" ("counter_id")
WHERE "status" IN ('OPEN', 'PAUSED');

CREATE UNIQUE INDEX "tickets_one_active_per_counter"
ON "tickets" ("assigned_counter_id")
WHERE "assigned_counter_id" IS NOT NULL AND "status" IN ('CALLED', 'IN_SERVICE');

ALTER TABLE "service_types"
  ADD CONSTRAINT "service_types_average_minutes_check" CHECK ("average_service_minutes" BETWEEN 1 AND 240),
  ADD CONSTRAINT "service_types_display_order_check" CHECK ("display_order" >= 0),
  ADD CONSTRAINT "service_types_code_uppercase_check" CHECK ("code" = upper("code"));

ALTER TABLE "daily_sequences"
  ADD CONSTRAINT "daily_sequences_positive_check" CHECK ("last_value" >= 0);

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_failed_login_count_check" CHECK ("failed_login_count" >= 0),
  ADD CONSTRAINT "staff_username_normalized_check" CHECK ("username" = lower("username"));

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_daily_sequence_positive_check" CHECK ("daily_sequence" > 0),
  ADD CONSTRAINT "tickets_no_show_count_check" CHECK ("no_show_count" >= 0),
  ADD CONSTRAINT "tickets_recall_count_check" CHECK ("recall_count" >= 0),
  ADD CONSTRAINT "tickets_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "tickets_terminal_timestamp_check" CHECK (
    ("status" <> 'COMPLETED' OR "completed_at" IS NOT NULL)
    AND ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL)
  );

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_response_code_check" CHECK ("response_code" BETWEEN 100 AND 599);
