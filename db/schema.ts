import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const showcaseTickets = sqliteTable(
  "qms_demo_tickets",
  {
    id: text("id").primaryKey(),
    branchCode: text("branch_code").notNull().default("SUMMIT"),
    customerSubject: text("customer_subject"),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    lastOperationId: text("last_operation_id"),
    channel: text("channel").notNull().default("KIOSK"),
    checkInOpensAt: text("check_in_opens_at"),
    checkInDeadline: text("check_in_deadline"),
    checkedInAt: text("checked_in_at"),
    priorityRequested: integer("priority_requested").notNull().default(0),
    priorityVerifiedBy: text("priority_verified_by"),
    noShowCount: integer("no_show_count").notNull().default(0),
    publicNumber: text("public_number").notNull(),
    businessDate: text("business_date").notNull(),
    serviceCode: text("service_code").notNull(),
    serviceName: text("service_name").notNull(),
    priority: integer("priority", { mode: "boolean" })
      .notNull()
      .default(false),
    priorityReason: text("priority_reason"),
    status: text("status").notNull().default("WAITING"),
    counter: text("counter"),
    createdAt: text("created_at").notNull(),
    queueEnteredAt: text("queue_entered_at").notNull(),
    calledAt: text("called_at"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    lookupTokenHash: text("lookup_token_hash"),
  },
  (table) => [
    uniqueIndex("qms_demo_ticket_number_per_branch_day_unique").on(
      table.branchCode,
      table.businessDate,
      table.publicNumber,
    ),
    index("qms_demo_queue_idx").on(
      table.branchCode,
      table.status,
      table.serviceCode,
      table.priority,
      table.queueEnteredAt,
    ),
    uniqueIndex("qms_demo_active_counter_idx")
      .on(table.branchCode, table.counter)
      .where(sql`${table.status} IN ('CALLED', 'IN_SERVICE')`),
    uniqueIndex("qms_ticket_idempotency_unique").on(table.branchCode, table.customerSubject, table.idempotencyKey),
    uniqueIndex("qms_customer_active_ticket_unique").on(table.branchCode, table.customerSubject)
      .where(sql`${table.customerSubject} IS NOT NULL AND ${table.channel} = 'REMOTE' AND ${table.status} IN ('RESERVED', 'WAITING', 'CALLED', 'IN_SERVICE', 'NO_SHOW')`),
  ],
);

export const showcaseEvents = sqliteTable("qms_demo_events", {
  id: text("id").primaryKey(),
  branchCode: text("branch_code").notNull().default("SUMMIT"),
  ticketId: text("ticket_id"),
  type: text("type").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
});

export const showcaseSequences = sqliteTable(
  "qms_demo_sequences",
  {
    serviceCode: text("service_code").notNull(),
    businessDate: text("business_date").notNull(),
    nextValue: integer("next_value").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.serviceCode, table.businessDate] })],
);

export const showcaseSettings = sqliteTable("qms_demo_settings", {
  id: integer("id").primaryKey(),
  priorityStreak: integer("priority_streak").notNull().default(0),
  priorityLimit: integer("priority_limit").notNull().default(2),
});

export const showcasePriorityState = sqliteTable(
  "qms_demo_priority_state",
  {
    serviceCode: text("service_code").primaryKey(),
    priorityStreak: integer("priority_streak").notNull().default(0),
  },
  (table) => [index("qms_demo_priority_state_streak_idx").on(table.priorityStreak)],
);

export const showcaseStaff = sqliteTable(
  "qms_demo_staff",
  {
    id: text("id").primaryKey(),
    branchCode: text("branch_code").notNull().default("SUMMIT"),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    assignedCounter: text("assigned_counter"),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: text("locked_until"),
    lastLoginAt: text("last_login_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    index("qms_demo_staff_role_idx").on(table.role, table.active),
    uniqueIndex("qms_demo_staff_counter_unique").on(table.branchCode, table.assignedCounter),
  ],
);

export const showcaseSessions = sqliteTable(
  "qms_demo_sessions",
  {
    id: text("id").primaryKey(),
    staffId: text("staff_id")
      .notNull()
      .references(() => showcaseStaff.id),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [index("qms_demo_session_staff_idx").on(table.staffId)],
);

export const showcaseAudit = sqliteTable(
  "qms_demo_audit",
  {
    id: text("id").primaryKey(),
    branchCode: text("branch_code").notNull().default("SUMMIT"),
    staffId: text("staff_id").references(() => showcaseStaff.id),
    action: text("action").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("qms_demo_audit_created_idx").on(table.createdAt)],
);

export const bankBranches = sqliteTable("qms_branches", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Africa/Addis_Ababa"),
  priorityLimit: integer("priority_limit").notNull().default(2),
});

export const branchSequences = sqliteTable("qms_branch_sequences", {
  branchCode: text("branch_code").notNull(),
  serviceCode: text("service_code").notNull(),
  businessDate: text("business_date").notNull(),
  nextValue: integer("next_value").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.branchCode, table.serviceCode, table.businessDate] })]);

export const branchFairness = sqliteTable("qms_branch_fairness", {
  branchCode: text("branch_code").notNull(),
  serviceCode: text("service_code").notNull(),
  streak: integer("streak").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.branchCode, table.serviceCode] })]);

export const requestLimits = sqliteTable("qms_request_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
});

export const counterOperation = sqliteTable("qms_counter_operations", {
  branchCode: text("branch_code").notNull(),
  counter: text("counter").notNull(),
  staffId: text("staff_id"),
  serviceCode: text("service_code").notNull(),
  status: text("status").notNull().default("CLOSED"),
  openedAt: text("opened_at"),
}, (table) => [primaryKey({ columns: [table.branchCode, table.counter] })]);

export const operationReplays = sqliteTable("qms_operation_replays", {
  actorId: text("actor_id").notNull(),
  requestKey: text("request_key").notNull(),
  requestHash: text("request_hash").notNull(),
  ticketId: text("ticket_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.actorId, table.requestKey] })]);

export const arrivalChallenges = sqliteTable("qms_arrival_challenges", {
  branchCode: text("branch_code").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
});
