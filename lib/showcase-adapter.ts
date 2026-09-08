import { env } from "cloudflare:workers";
import {
  BANK_BRANCHES,
  BANK_NAME,
  BANK_TIMEZONE,
  DEFAULT_BRANCH_CODE,
  bankBranch,
} from "./bank-brand";

export const services = [
  { code: "DEP", name: "Cash Deposit", minutes: 4, icon: "deposit" },
  { code: "WDR", name: "Cash Withdrawal", minutes: 5, icon: "withdrawal" },
  { code: "LON", name: "Loan Services", minutes: 15, icon: "loan" },
  { code: "NAC", name: "New Account", minutes: 20, icon: "account" },
] as const;

export type ShowcaseTicket = {
  id: string;
  branch_code: string;
  public_number: string;
  business_date: string;
  service_code: string;
  service_name: string;
  priority: number;
  priority_requested: number;
  status: string;
  counter: string | null;
  created_at: string;
  queue_entered_at: string;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  channel: string;
  check_in_opens_at: string | null;
  check_in_deadline: string | null;
  checked_in_at: string | null;
  no_show_count: number;
};
export type StoredTicket = ShowcaseTicket & {
  lookup_token_hash: string;
  customer_subject: string | null;
  request_hash: string | null;
  priority_reason: string | null;
};
export type DemoEvent = {
  id: string;
  branch_code: string;
  ticket_id: string | null;
  type: string;
  detail: string;
  created_at: string;
};
export type CounterState = {
  counter: string;
  service_code: string;
  status: string;
  opened_at: string | null;
  staff_id: string | null;
};

export const SAFE_TICKET_COLUMNS = `id, branch_code, public_number, business_date, service_code, service_name,
  priority, priority_requested, status, counter, created_at, queue_entered_at, called_at, started_at,
  completed_at, channel, check_in_opens_at, check_in_deadline, checked_in_at, no_show_count`;

export function safeTicket(
  ticket: StoredTicket | ShowcaseTicket,
): ShowcaseTicket {
  return Object.fromEntries(
    SAFE_TICKET_COLUMNS.split(",")
      .map((key) => key.trim())
      .map((key) => [key, ticket[key as keyof ShowcaseTicket]]),
  ) as ShowcaseTicket;
}
export function getShowcaseDb(): D1Database {
  if (!env.DB) throw new Error("The queue database is unavailable.");
  return env.DB;
}
export function businessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BANK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}
export async function ensureBranches(db = getShowcaseDb()) {
  await db.batch(
    BANK_BRANCHES.map((branch) =>
      db
        .prepare(
          "INSERT INTO qms_branches (code, name, timezone) VALUES (?, ?, ?) ON CONFLICT(code) DO NOTHING",
        )
        .bind(branch.code, `${branch.name} Branch`, BANK_TIMEZONE),
    ),
  );
}
export function eventStatement(
  db: D1Database,
  branch: string,
  ticketId: string | null,
  type: string,
  detail: string,
  now: string,
) {
  return db
    .prepare(
      "INSERT INTO qms_demo_events (id, branch_code, ticket_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), branch, ticketId, type, detail, now);
}
export async function appendEvent(
  db: D1Database,
  ticketId: string | null,
  type: string,
  detail: string,
  branch = DEFAULT_BRANCH_CODE,
) {
  await eventStatement(
    db,
    branch,
    ticketId,
    type,
    detail,
    new Date().toISOString(),
  ).run();
}
export async function expireReservations(
  db: D1Database,
  branch: string,
  now = new Date().toISOString(),
) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO qms_demo_events (id, branch_code, ticket_id, type, detail, created_at)
      SELECT lower(hex(randomblob(16))), branch_code, id, 'ticket.expired', public_number || ': arrival deadline missed', ?
      FROM qms_demo_tickets WHERE branch_code=? AND status='RESERVED' AND check_in_deadline < ?`,
      )
      .bind(now, branch, now),
    db
      .prepare(
        "UPDATE qms_demo_tickets SET status='EXPIRED', completed_at=? WHERE branch_code=? AND status='RESERVED' AND check_in_deadline < ?",
      )
      .bind(now, branch, now),
  ]);
}
export async function readSnapshot(
  db = getShowcaseDb(),
  branchCode = DEFAULT_BRANCH_CODE,
) {
  const selected = bankBranch(branchCode);
  if (!selected) throw new Error("Choose an available branch.");
  await ensureBranches(db);
  await expireReservations(db, branchCode);
  const [ticketResult, eventResult, settings, counts, counters, fairness] =
    await Promise.all([
      db
        .prepare(
          `SELECT ${SAFE_TICKET_COLUMNS} FROM qms_demo_tickets WHERE branch_code=? ORDER BY created_at DESC LIMIT 500`,
        )
        .bind(branchCode)
        .all<ShowcaseTicket>(),
      db
        .prepare(
          "SELECT * FROM qms_demo_events WHERE branch_code=? ORDER BY created_at DESC, rowid DESC LIMIT 40",
        )
        .bind(branchCode)
        .all<DemoEvent>(),
      db
        .prepare("SELECT priority_limit FROM qms_branches WHERE code=?")
        .bind(branchCode)
        .first<{ priority_limit: number }>(),
      db
        .prepare(
          `SELECT service_code, SUM(CASE WHEN status='WAITING' THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN status='RESERVED' THEN 1 ELSE 0 END) AS reserved,
      SUM(CASE WHEN business_date=? THEN 1 ELSE 0 END) AS issued,
      SUM(CASE WHEN status='IN_SERVICE' THEN 1 ELSE 0 END) AS serving,
      SUM(CASE WHEN status='COMPLETED' AND business_date=? THEN 1 ELSE 0 END) AS completed
      FROM qms_demo_tickets WHERE branch_code=? GROUP BY service_code`,
        )
        .bind(businessDate(), businessDate(), branchCode)
        .all<Record<string, number | string>>(),
      db
        .prepare(
          "SELECT counter, service_code, status, opened_at, staff_id FROM qms_counter_operations WHERE branch_code=? ORDER BY counter",
        )
        .bind(branchCode)
        .all<CounterState>(),
      db
        .prepare(
          "SELECT COALESCE(MAX(streak), 0) AS streak FROM qms_branch_fairness WHERE branch_code=?",
        )
        .bind(branchCode)
        .first<{ streak: number }>(),
    ]);
  const tickets = ticketResult.results ?? [];
  const counterStates = counters.results ?? [];
  const count = (key: string) =>
    (counts.results ?? []).reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
  const activeCall =
    tickets
      .filter((ticket) => ["CALLED", "IN_SERVICE"].includes(ticket.status))
      .sort((a, b) =>
        (b.called_at ?? "").localeCompare(a.called_at ?? ""),
      )[0] ?? null;
  return {
    generatedAt: new Date().toISOString(),
    bankName: BANK_NAME,
    branch: {
      code: branchCode,
      name: `${selected.name} Branch`,
      timezone: BANK_TIMEZONE,
    },
    branches: BANK_BRANCHES,
    services: services.map((service) => {
      const row = counts.results?.find(
        (item) => item.service_code === service.code,
      );
      const activeCounters = counterStates.filter(
        (item) => item.service_code === service.code && item.status === "OPEN",
      ).length;
      const waiting = Number(row?.waiting ?? 0);
      return {
        ...service,
        waiting,
        reserved: Number(row?.reserved ?? 0),
        activeCounters,
        estimatedWaitMinutes: activeCounters
          ? Math.ceil((waiting * service.minutes) / activeCounters)
          : null,
      };
    }),
    tickets,
    events: eventResult.results ?? [],
    activeCall,
    counters: counterStates,
    settings: {
      priorityStreak: fairness?.streak ?? 0,
      priorityLimit: settings?.priority_limit ?? 2,
    },
    metrics: {
      issued: count("issued"),
      waiting: count("waiting"),
      reserved: count("reserved"),
      serving: count("serving"),
      completed: count("completed"),
      noShow: tickets.reduce((sum, ticket) => sum + ticket.no_show_count, 0),
    },
  };
}

export function publicSnapshot(
  snapshot: Awaited<ReturnType<typeof readSnapshot>>,
  surface: "kiosk" | "display",
) {
  if (surface === "kiosk")
    return {
      ...snapshot,
      tickets: [],
      events: [],
      activeCall: null,
      counters: [],
    };
  const events = snapshot.events.filter(
    (event) => event.type === "display.call",
  );
  const ids = new Set(events.map((event) => event.ticket_id));
  const displayTicket = (ticket: ShowcaseTicket) => ({
    id: ticket.id,
    public_number: ticket.public_number,
    service_code: ticket.service_code,
    service_name: ticket.service_name,
    status: ticket.status,
    counter: ticket.counter,
    called_at: ticket.called_at,
  });
  return {
    generatedAt: snapshot.generatedAt,
    branch: snapshot.branch,
    branches: snapshot.branches,
    services: [],
    settings: {},
    metrics: {},
    counters: [],
    tickets: snapshot.tickets
      .filter(
        (ticket) => ids.has(ticket.id) || ticket.id === snapshot.activeCall?.id,
      )
      .map(displayTicket),
    events,
    activeCall: snapshot.activeCall ? displayTicket(snapshot.activeCall) : null,
  };
}
