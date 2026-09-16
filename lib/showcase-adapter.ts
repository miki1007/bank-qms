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

export type StaffDirectoryEntry = {
  id: string;
  username: string;
  display_name: string;
  role: "TELLER" | "MANAGER" | "ADMIN";
  assigned_counter: string | null;
  assigned_service_code: string | null;
  active: number;
  last_login_at: string | null;
};

export type CustomerAccount = {
  id: string;
  account_type: string;
  account_name: string;
  masked_number: string;
  currency: string;
  ledger_balance_minor: number;
  available_balance_minor: number;
  status: string;
  created_at: string;
};

export type CustomerTransaction = {
  id: string;
  account_id: string;
  posted_at: string;
  description: string;
  category: string;
  amount_minor: number;
  balance_minor: number;
  status: string;
  reference: string;
};

export const SAFE_TICKET_COLUMNS = `id, branch_code, public_number, business_date, service_code, service_name,
  priority, priority_requested, status, counter, created_at, queue_entered_at, called_at, started_at,
  completed_at, channel, check_in_opens_at, check_in_deadline, checked_in_at, no_show_count`;

export function safeTicket(
  ticket: StoredTicket | ShowcaseTicket,
): ShowcaseTicket {
  const safe = Object.fromEntries(
    SAFE_TICKET_COLUMNS.split(",")
      .map((key) => key.trim())
      .map((key) => [key, ticket[key as keyof ShowcaseTicket]]),
  ) as ShowcaseTicket;
  return { ...safe, priority: 0, priority_requested: 0 };
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
  const existing = await db
    .prepare("SELECT COUNT(*) AS count FROM qms_branches")
    .first<{ count: number }>();
  if (Number(existing?.count ?? 0) >= BANK_BRANCHES.length) return;
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

export async function ensureServiceConfiguration(
  db = getShowcaseDb(),
  branchCode = DEFAULT_BRANCH_CODE,
) {
  const existing = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM qms_service_configuration WHERE branch_code=?",
    )
    .bind(branchCode)
    .first<{ count: number }>();
  if (Number(existing?.count ?? 0) >= services.length) return;
  await db.batch(
    services.map((service) =>
      db
        .prepare(
          `INSERT INTO qms_service_configuration
           (branch_code, code, name, target_minutes, priority_enabled, active)
           VALUES (?, ?, ?, ?, 0, 1) ON CONFLICT(branch_code, code) DO NOTHING`,
        )
        .bind(branchCode, service.code, service.name, service.minutes),
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

type ConfiguredService = {
  code: string;
  name: string;
  target_minutes: number;
  active: number;
};

function average(values: number[]) {
  if (!values.length) return 0;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10
  );
}

function minutesBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  return Math.max(
    0,
    Math.round(((Date.parse(end) - Date.parse(start)) / 60_000) * 10) / 10,
  );
}

function analyticsFor(
  tickets: ShowcaseTicket[],
  serviceDefinitions: ConfiguredService[],
  today = businessDate(),
) {
  const todayTickets = tickets.filter(
    (ticket) => ticket.business_date === today,
  );
  const statusOrder = [
    "RESERVED",
    "WAITING",
    "CALLED",
    "IN_SERVICE",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
    "EXPIRED",
  ];
  const statusDistribution = statusOrder.map((status) => ({
    status,
    value: todayTickets.filter((ticket) => ticket.status === status).length,
  }));
  const hourlyDemand = Array.from({ length: 13 }, (_, index) => {
    const hour = index + 7;
    return {
      hour,
      value: todayTickets.filter((ticket) => {
        const formatted = new Intl.DateTimeFormat("en-US", {
          timeZone: BANK_TIMEZONE,
          hour: "2-digit",
          hour12: false,
        }).format(new Date(ticket.created_at));
        return Number(formatted) === hour;
      }).length,
    };
  });
  const day = new Date(`${today}T12:00:00.000Z`);
  const weeklyThroughput = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(day);
    value.setUTCDate(day.getUTCDate() - (6 - index));
    const date = value.toISOString().slice(0, 10);
    return {
      date,
      label: value.toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }),
      issued: tickets.filter((ticket) => ticket.business_date === date).length,
      completed: tickets.filter(
        (ticket) =>
          ticket.business_date === date && ticket.status === "COMPLETED",
      ).length,
    };
  });
  const servicePerformance = serviceDefinitions.map((service) => {
    const matching = todayTickets.filter(
      (ticket) => ticket.service_code === service.code,
    );
    const waits = matching
      .map((ticket) =>
        minutesBetween(ticket.queue_entered_at, ticket.called_at),
      )
      .filter((value): value is number => value !== null);
    const durations = matching
      .map((ticket) => minutesBetween(ticket.started_at, ticket.completed_at))
      .filter((value): value is number => value !== null);
    return {
      code: service.code,
      name: service.name,
      targetMinutes: service.target_minutes,
      issued: matching.length,
      waiting: matching.filter((ticket) => ticket.status === "WAITING").length,
      completed: matching.filter((ticket) => ticket.status === "COMPLETED")
        .length,
      averageWaitMinutes: average(waits),
      averageServiceMinutes: average(durations),
      slaBreaches: waits.filter((value) => value > service.target_minutes)
        .length,
    };
  });
  return {
    statusDistribution,
    hourlyDemand,
    weeklyThroughput,
    servicePerformance,
    flow: {
      reserved:
        statusDistribution.find((item) => item.status === "RESERVED")?.value ??
        0,
      waiting:
        statusDistribution.find((item) => item.status === "WAITING")?.value ??
        0,
      called:
        statusDistribution.find((item) => item.status === "CALLED")?.value ?? 0,
      serving:
        statusDistribution.find((item) => item.status === "IN_SERVICE")
          ?.value ?? 0,
      completed:
        statusDistribution.find((item) => item.status === "COMPLETED")?.value ??
        0,
    },
  };
}

export async function readSnapshot(
  db = getShowcaseDb(),
  branchCode = DEFAULT_BRANCH_CODE,
) {
  const selected = bankBranch(branchCode);
  if (!selected) throw new Error("Choose an available branch.");
  await ensureBranches(db);
  await ensureServiceConfiguration(db, branchCode);
  await expireReservations(db, branchCode);
  const [ticketResult, eventResult, counts, counters, configured] =
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
          `SELECT code, name, target_minutes, priority_enabled, active
           FROM qms_service_configuration WHERE branch_code=? ORDER BY code`,
        )
        .bind(branchCode)
        .all<ConfiguredService>(),
    ]);
  const tickets = ticketResult.results ?? [];
  const counterStates = counters.results ?? [];
  const configuredServices = configured.results ?? [];
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
    services: configuredServices
      .filter((service) => service.active)
      .map((service) => {
        const row = counts.results?.find(
          (item) => item.service_code === service.code,
        );
        const activeCounters = counterStates.filter(
          (item) =>
            item.service_code === service.code && item.status === "OPEN",
        ).length;
        const waiting = Number(row?.waiting ?? 0);
        return {
          code: service.code,
          name: service.name,
          minutes: service.target_minutes,
          icon:
            services.find((item) => item.code === service.code)?.icon ??
            "service",
          waiting,
          reserved: Number(row?.reserved ?? 0),
          activeCounters,
          estimatedWaitMinutes: activeCounters
            ? Math.ceil((waiting * service.target_minutes) / activeCounters)
            : null,
        };
      }),
    serviceConfiguration: configuredServices.map((service) => ({
      ...service,
      active: Boolean(service.active),
    })),
    tickets,
    events: eventResult.results ?? [],
    activeCall,
    counters: counterStates,
    metrics: {
      issued: count("issued"),
      waiting: count("waiting"),
      reserved: count("reserved"),
      serving: count("serving"),
      completed: count("completed"),
      noShow: tickets.reduce((sum, ticket) => sum + ticket.no_show_count, 0),
    },
    analytics: analyticsFor(tickets, configuredServices),
  };
}

export async function readStaffDirectory(
  db = getShowcaseDb(),
  branchCode = DEFAULT_BRANCH_CODE,
) {
  const rows = await db
    .prepare(
      `SELECT id, username, display_name, role, assigned_counter, assigned_service_code, active, last_login_at
       FROM qms_demo_staff WHERE branch_code=? ORDER BY role DESC, assigned_counter, display_name`,
    )
    .bind(branchCode)
    .all<StaffDirectoryEntry>();
  return rows.results ?? [];
}

export function actorPerformance(
  snapshot: Awaited<ReturnType<typeof readSnapshot>>,
  counter: string | null,
) {
  if (!counter) return { servedToday: 0, averageServiceMinutes: 0, noShow: 0 };
  const today = businessDate();
  const handled = snapshot.tickets.filter(
    (ticket) => ticket.counter === counter && ticket.business_date === today,
  );
  const serviceDurations = handled
    .map((ticket) => minutesBetween(ticket.started_at, ticket.completed_at))
    .filter((value): value is number => value !== null);
  return {
    servedToday: handled.filter((ticket) => ticket.status === "COMPLETED")
      .length,
    averageServiceMinutes: average(serviceDurations),
    noShow: handled.reduce((sum, ticket) => sum + ticket.no_show_count, 0),
  };
}

function portfolioAccountId(subject: string, type: string) {
  return `demo-${type.toLowerCase()}-${subject.slice(0, 20)}`;
}

function demoAccountSuffix(subject: string, offset: number) {
  return String(
    Number.parseInt(subject.slice(offset, offset + 8), 16) % 10_000,
  ).padStart(4, "0");
}

function shiftedIso(now: Date, days: number, hours = 0) {
  return new Date(
    now.getTime() - days * 86_400_000 - hours * 3_600_000,
  ).toISOString();
}

export async function ensureCustomerPortfolio(
  customerSubject: string,
  db = getShowcaseDb(),
) {
  const existing = await db
    .prepare(
      "SELECT id FROM qms_customer_accounts WHERE customer_subject=? LIMIT 1",
    )
    .bind(customerSubject)
    .first<{ id: string }>();
  if (existing) return;
  const now = new Date();
  const everydayId = portfolioAccountId(customerSubject, "everyday");
  const savingsId = portfolioAccountId(customerSubject, "savings");
  const everydayTransactions = [
    [
      "opening",
      14,
      "Opening demonstration balance",
      "Account",
      5_000_000,
      5_000_000,
    ],
    ["salary", 8, "Salary credit", "Income", 2_450_000, 7_450_000],
    ["rent", 6, "Housing payment", "Housing", -850_000, 6_600_000],
    ["market", 4, "Local supermarket", "Shopping", -185_025, 6_414_975],
    ["utility", 3, "Electric utility", "Utilities", -64_040, 6_350_935],
    ["mobile", 2, "Mobile airtime", "Communication", -50_000, 6_300_935],
    ["atm", 1, "ATM cash withdrawal", "Cash", -200_000, 6_100_935],
  ] as const;
  const savingsTransactions = [
    [
      "opening",
      30,
      "Opening demonstration balance",
      "Account",
      12_500_000,
      12_500_000,
    ],
    ["interest", 1, "Monthly savings interest", "Interest", 40_050, 12_540_050],
  ] as const;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO qms_customer_accounts
         (id, customer_subject, account_type, account_name, masked_number, currency, ledger_balance_minor, available_balance_minor, status, created_at)
         VALUES (?, ?, 'EVERYDAY', 'Everyday Account', ?, 'ETB', 6100935, 6100935, 'ACTIVE', ?)`,
      )
      .bind(
        everydayId,
        customerSubject,
        `•••• ${demoAccountSuffix(customerSubject, 0)}`,
        now.toISOString(),
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO qms_customer_accounts
         (id, customer_subject, account_type, account_name, masked_number, currency, ledger_balance_minor, available_balance_minor, status, created_at)
         VALUES (?, ?, 'SAVINGS', 'Savings Account', ?, 'ETB', 12540050, 12540050, 'ACTIVE', ?)`,
      )
      .bind(
        savingsId,
        customerSubject,
        `•••• ${demoAccountSuffix(customerSubject, 8)}`,
        now.toISOString(),
      ),
    ...everydayTransactions.map(
      ([key, days, description, category, amount, balance]) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO qms_customer_transactions
             (id, account_id, posted_at, description, category, amount_minor, balance_minor, status, reference)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', ?)`,
          )
          .bind(
            `${everydayId}-${key}`,
            everydayId,
            shiftedIso(now, days),
            description,
            category,
            amount,
            balance,
            `DEMO-${subjectReference(customerSubject)}-E-${key.toUpperCase()}`,
          ),
    ),
    ...savingsTransactions.map(
      ([key, days, description, category, amount, balance]) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO qms_customer_transactions
             (id, account_id, posted_at, description, category, amount_minor, balance_minor, status, reference)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'POSTED', ?)`,
          )
          .bind(
            `${savingsId}-${key}`,
            savingsId,
            shiftedIso(now, days),
            description,
            category,
            amount,
            balance,
            `DEMO-${subjectReference(customerSubject)}-S-${key.toUpperCase()}`,
          ),
    ),
  ]);
}

function subjectReference(subject: string) {
  return subject.slice(0, 10).toUpperCase();
}

export async function readCustomerPortfolio(
  customerSubject: string,
  db = getShowcaseDb(),
) {
  await ensureCustomerPortfolio(customerSubject, db);
  const [accountsResult, transactionResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, account_type, account_name, masked_number, currency, ledger_balance_minor,
                available_balance_minor, status, created_at
         FROM qms_customer_accounts WHERE customer_subject=? ORDER BY account_type`,
      )
      .bind(customerSubject)
      .all<CustomerAccount>(),
    db
      .prepare(
        `SELECT tx.id, tx.account_id, tx.posted_at, tx.description, tx.category,
                tx.amount_minor, tx.balance_minor, tx.status, tx.reference
         FROM qms_customer_transactions tx
         JOIN qms_customer_accounts account ON account.id=tx.account_id
         WHERE account.customer_subject=? ORDER BY tx.posted_at DESC LIMIT 50`,
      )
      .bind(customerSubject)
      .all<CustomerTransaction>(),
  ]);
  const accounts = accountsResult.results ?? [];
  return {
    generatedAt: new Date().toISOString(),
    currency: "ETB",
    totalAvailableMinor: accounts.reduce(
      (sum, account) => sum + Number(account.available_balance_minor),
      0,
    ),
    accounts,
    transactions: transactionResult.results ?? [],
    disclaimer:
      "Demonstration balances and transactions only. No real funds or banking operations are connected.",
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
      serviceConfiguration: [],
      analytics: undefined,
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
