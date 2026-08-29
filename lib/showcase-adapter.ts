import { env } from "cloudflare:workers";

export const services = [
  { code: "DEP", name: "Cash Deposit", minutes: 4, icon: "deposit" },
  { code: "WDR", name: "Cash Withdrawal", minutes: 5, icon: "withdrawal" },
  { code: "LON", name: "Loan Services", minutes: 15, icon: "loan" },
  { code: "NAC", name: "New Account", minutes: 20, icon: "account" },
] as const;

export type ShowcaseTicket = {
  id: string;
  public_number: string;
  service_code: string;
  service_name: string;
  priority: number;
  status: string;
  counter: string | null;
  created_at: string;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type DemoEvent = {
  id: string;
  ticket_id: string | null;
  type: string;
  detail: string;
  created_at: string;
};

export function getShowcaseDb(): D1Database {
  if (!env.DB)
    throw new Error("The Bank QMS showcase database is unavailable.");
  return env.DB;
}

export function businessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export async function appendEvent(
  db: D1Database,
  ticketId: string | null,
  type: string,
  detail: string,
) {
  await db
    .prepare(
      "INSERT INTO qms_demo_events (id, ticket_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), ticketId, type, detail, new Date().toISOString())
    .run();
}

export async function readSnapshot(db = getShowcaseDb()) {
  const [ticketResult, eventResult, settings] = await Promise.all([
    db
      .prepare(
        `SELECT id, public_number, service_code, service_name, priority, status,
                counter, created_at, called_at, started_at, completed_at
         FROM qms_demo_tickets ORDER BY created_at DESC LIMIT 100`,
      )
      .all<ShowcaseTicket>(),
    db
      .prepare(
        "SELECT * FROM qms_demo_events ORDER BY created_at DESC LIMIT 24",
      )
      .all<DemoEvent>(),
    db
      .prepare(
        "SELECT priority_streak, priority_limit FROM qms_demo_settings WHERE id=1",
      )
      .first<{ priority_streak: number; priority_limit: number }>(),
  ]);
  const tickets = ticketResult.results ?? [];
  const events = eventResult.results ?? [];
  const activeCall =
    tickets
      .filter(
        (ticket) =>
          ticket.status === "CALLED" || ticket.status === "IN_SERVICE",
      )
      .sort((a, b) =>
        (b.called_at ?? "").localeCompare(a.called_at ?? ""),
      )[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    branch: {
      code: "MAIN",
      name: "Main Branch",
      timezone: "Africa/Addis_Ababa",
    },
    services: services.map((service) => ({
      ...service,
      waiting: tickets.filter(
        (ticket) =>
          ticket.service_code === service.code && ticket.status === "WAITING",
      ).length,
    })),
    tickets,
    events,
    activeCall,
    settings: {
      priorityStreak: settings?.priority_streak ?? 0,
      priorityLimit: settings?.priority_limit ?? 2,
    },
    metrics: {
      issued: tickets.length,
      waiting: tickets.filter((ticket) => ticket.status === "WAITING").length,
      serving: tickets.filter((ticket) => ticket.status === "IN_SERVICE")
        .length,
      completed: tickets.filter((ticket) => ticket.status === "COMPLETED")
        .length,
      noShow: tickets.filter((ticket) => ticket.status === "NO_SHOW").length,
    },
  };
}
