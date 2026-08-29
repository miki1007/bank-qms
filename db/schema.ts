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
    publicNumber: text("public_number").notNull().unique(),
    serviceCode: text("service_code").notNull(),
    serviceName: text("service_name").notNull(),
    priority: integer("priority", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status").notNull().default("WAITING"),
    counter: text("counter"),
    createdAt: text("created_at").notNull(),
    calledAt: text("called_at"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    lookupTokenHash: text("lookup_token_hash"),
  },
  (table) => [
    index("qms_demo_queue_idx").on(
      table.status,
      table.serviceCode,
      table.priority,
      table.createdAt,
    ),
    uniqueIndex("qms_demo_active_counter_idx")
      .on(table.counter)
      .where(sql`${table.status} IN ('CALLED', 'IN_SERVICE')`),
  ],
);

export const showcaseEvents = sqliteTable("qms_demo_events", {
  id: text("id").primaryKey(),
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

export const showcaseStaff = sqliteTable(
  "qms_demo_staff",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: text("locked_until"),
    lastLoginAt: text("last_login_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [index("qms_demo_staff_role_idx").on(table.role, table.active)],
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
    staffId: text("staff_id").references(() => showcaseStaff.id),
    action: text("action").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("qms_demo_audit_created_idx").on(table.createdAt)],
);
