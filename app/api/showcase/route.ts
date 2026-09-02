import {
  appendEvent,
  businessDate,
  getShowcaseDb,
  readSnapshot,
  services,
  type ShowcaseTicket,
} from "@/lib/showcase-adapter";
import {
  appendAudit,
  getActor,
  sha256Hex,
  type ShowcaseActor,
} from "@/lib/showcase-auth";

export const dynamic = "force-dynamic";

function error(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function serviceByCode(code: unknown) {
  return services.find((service) => service.code === code);
}

const priorityReasons = new Set([
  "ELDERLY",
  "DISABILITY",
  "PREGNANCY",
  "OTHER",
]);

async function issueTicket(payload: Record<string, unknown>) {
  const service = serviceByCode(payload.serviceCode);
  if (!service) return error("Choose a valid service.");
  const priority = payload.priority === true ? 1 : 0;
  const priorityReason =
    priority && typeof payload.priorityReason === "string"
      ? payload.priorityReason
      : null;
  if (priority && (!priorityReason || !priorityReasons.has(priorityReason)))
    return error("Choose a valid priority eligibility reason.");
  const db = getShowcaseDb();
  const date = businessDate();
  const sequence = await db
    .prepare(
      `INSERT INTO qms_demo_sequences (service_code, business_date, next_value)
       VALUES (?, ?, COALESCE(
         (SELECT MAX(CAST(substr(public_number, instr(public_number, '-') + 1) AS INTEGER))
          FROM qms_demo_tickets WHERE service_code = ? AND business_date = ?),
         0
       ) + 1)
       ON CONFLICT(service_code, business_date)
       DO UPDATE SET next_value = next_value + 1
       RETURNING next_value`,
    )
    .bind(service.code, date, service.code, date)
    .first<{ next_value: number }>();
  if (!sequence) return error("A ticket number could not be allocated.", 500);

  const id = crypto.randomUUID();
  const lookupToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const publicNumber = `${service.code}-${String(sequence.next_value).padStart(3, "0")}`;
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO qms_demo_tickets
       (id, public_number, business_date, service_code, service_name, priority, priority_reason,
        status, created_at, queue_entered_at, lookup_token_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING', ?, ?, ?)`,
    )
    .bind(
      id,
      publicNumber,
      date,
      service.code,
      service.name,
      priority,
      priorityReason,
      createdAt,
      createdAt,
      await sha256Hex(lookupToken),
    )
    .run();
  await appendEvent(
    db,
    id,
    "ticket.created",
    `${publicNumber} joined ${service.name}`,
  );
  const ticket = await db
    .prepare("SELECT * FROM qms_demo_tickets WHERE id = ?")
    .bind(id)
    .first<ShowcaseTicket>();
  return Response.json(
    {
      ticket,
      lookupToken,
      snapshot: publicSnapshot(await readSnapshot(db), "kiosk"),
    },
    { status: 201 },
  );
}

async function callNext(
  _payload: Record<string, unknown>,
  actor: ShowcaseActor,
) {
  if (
    actor.role !== "TELLER" ||
    !actor.assignedCounter ||
    !actor.assignedServiceCode
  )
    return error("A manager-assigned teller counter is required.", 403);
  const counter = actor.assignedCounter;
  const serviceCode = actor.assignedServiceCode;
  const db = getShowcaseDb();
  await db
    .prepare(
      "INSERT INTO qms_demo_settings (id, priority_streak, priority_limit) VALUES (1, 0, 2) ON CONFLICT(id) DO NOTHING",
    )
    .run();
  await db
    .prepare(
      `INSERT INTO qms_demo_priority_state (service_code, priority_streak)
       VALUES (?, 0) ON CONFLICT(service_code) DO NOTHING`,
    )
    .bind(serviceCode)
    .run();
  const active = await db
    .prepare(
      "SELECT id FROM qms_demo_tickets WHERE counter = ? AND status IN ('CALLED','IN_SERVICE') LIMIT 1",
    )
    .bind(counter)
    .first();
  if (active) return error(`${counter} already has an active customer.`, 409);

  const settings = await db
    .prepare("SELECT priority_limit FROM qms_demo_settings WHERE id = 1")
    .first<{ priority_limit: number }>();
  const fairness = await db
    .prepare(
      "SELECT priority_streak FROM qms_demo_priority_state WHERE service_code = ?",
    )
    .bind(serviceCode)
    .first<{ priority_streak: number }>();
  const standardWaiting = await db
    .prepare(
      "SELECT id FROM qms_demo_tickets WHERE status = 'WAITING' AND service_code = ? AND priority = 0 LIMIT 1",
    )
    .bind(serviceCode)
    .first();
  const forceStandard =
    Boolean(standardWaiting) &&
    (fairness?.priority_streak ?? 0) >= (settings?.priority_limit ?? 2);
  const order = forceStandard
    ? "priority ASC, queue_entered_at ASC, public_number ASC"
    : "priority DESC, queue_entered_at ASC, public_number ASC";
  const now = new Date().toISOString();
  const called = await db
    .prepare(
      `UPDATE qms_demo_tickets SET status = 'CALLED', counter = ?, called_at = ?
       WHERE id = (SELECT id FROM qms_demo_tickets
         WHERE status = 'WAITING' AND service_code = ? ORDER BY ${order} LIMIT 1)
       AND status = 'WAITING' RETURNING *`,
    )
    .bind(counter, now, serviceCode)
    .first<ShowcaseTicket>();
  if (!called) return error("No customers are waiting.", 409);
  await db
    .prepare(
      `UPDATE qms_demo_priority_state
       SET priority_streak = CASE WHEN ? = 1 THEN priority_streak + 1 ELSE 0 END
       WHERE service_code = ?`,
    )
    .bind(called.priority, serviceCode)
    .run();
  await appendEvent(
    db,
    called.id,
    "display.call",
    `${called.public_number} called to ${counter}`,
  );
  await appendAudit(
    actor,
    "queue.call_next",
    `${called.public_number} called to ${counter}`,
  );
  return Response.json({
    ticket: called,
    snapshot: { ...(await readSnapshot(db)), actor },
  });
}

async function transition(
  payload: Record<string, unknown>,
  actor: ShowcaseActor | null,
) {
  const id = typeof payload.ticketId === "string" ? payload.ticketId : "";
  const action = typeof payload.action === "string" ? payload.action : "";
  if (!id) return error("A ticket is required.");
  const db = getShowcaseDb();
  const now = new Date().toISOString();
  const transitions: Record<
    string,
    { sql: string; type: string; detail: string; timestamp: boolean }
  > = {
    start: {
      sql: "UPDATE qms_demo_tickets SET status='IN_SERVICE', started_at=? WHERE id=? AND status='CALLED' RETURNING *",
      type: "ticket.started",
      detail: "Service started",
      timestamp: true,
    },
    complete: {
      sql: "UPDATE qms_demo_tickets SET status='COMPLETED', completed_at=? WHERE id=? AND status='IN_SERVICE' RETURNING *",
      type: "ticket.completed",
      detail: "Service completed",
      timestamp: true,
    },
    no_show: {
      sql: "UPDATE qms_demo_tickets SET status='NO_SHOW', completed_at=? WHERE id=? AND status='CALLED' RETURNING *",
      type: "ticket.no_show",
      detail: "Customer marked no-show",
      timestamp: true,
    },
    requeue: {
      sql: "UPDATE qms_demo_tickets SET status='WAITING', counter=NULL, called_at=NULL, started_at=NULL, completed_at=NULL, queue_entered_at=? WHERE id=? AND status='NO_SHOW' RETURNING *",
      type: "ticket.requeued",
      detail: "Customer returned to queue",
      timestamp: true,
    },
    recall: {
      sql: "UPDATE qms_demo_tickets SET called_at=? WHERE id=? AND status='CALLED' RETURNING *",
      type: "display.call",
      detail: "Customer recalled",
      timestamp: true,
    },
    cancel: {
      sql: "UPDATE qms_demo_tickets SET status='CANCELLED', completed_at=? WHERE id=? AND status='WAITING' RETURNING *",
      type: "ticket.cancelled",
      detail: "Waiting ticket cancelled",
      timestamp: true,
    },
  };
  const transition = transitions[action];
  if (!transition) return error("That transition is not available.");
  if (action === "cancel") {
    const lookupToken =
      typeof payload.lookupToken === "string" ? payload.lookupToken : "";
    const proof = await db
      .prepare(
        "SELECT lookup_token_hash FROM qms_demo_tickets WHERE id=? AND status='WAITING'",
      )
      .bind(id)
      .first<{ lookup_token_hash: string | null }>();
    if (
      !lookupToken ||
      !proof?.lookup_token_hash ||
      (await sha256Hex(lookupToken)) !== proof.lookup_token_hash
    ) {
      return error("The private ticket proof is invalid.", 403);
    }
  } else if (!actor) {
    return error("Authentication required.", 401);
  } else {
    if (actor.role !== "TELLER" || !actor.assignedCounter)
      return error("A manager-assigned teller counter is required.", 403);
    const owned = await db
      .prepare("SELECT counter FROM qms_demo_tickets WHERE id=? LIMIT 1")
      .bind(id)
      .first<{ counter: string | null }>();
    if (!owned || owned.counter !== actor.assignedCounter)
      return error("This ticket belongs to another teller counter.", 403);
  }
  const ticket = transition.timestamp
    ? await db.prepare(transition.sql).bind(now, id).first<ShowcaseTicket>()
    : await db.prepare(transition.sql).bind(id).first<ShowcaseTicket>();
  if (!ticket)
    return error(
      "The ticket state changed or this action is not allowed.",
      409,
    );
  await appendEvent(
    db,
    ticket.id,
    transition.type,
    `${ticket.public_number}: ${transition.detail}`,
  );
  if (actor) {
    await appendAudit(
      actor,
      `ticket.${action}`,
      `${ticket.public_number}: ${transition.detail}`,
    );
  }
  const snapshot = await readSnapshot(db);
  return Response.json({
    ticket,
    snapshot: actor
      ? { ...snapshot, actor }
      : publicSnapshot(snapshot, "kiosk"),
  });
}

async function transfer(
  payload: Record<string, unknown>,
  actor: ShowcaseActor,
) {
  const id = typeof payload.ticketId === "string" ? payload.ticketId : "";
  const service = serviceByCode(payload.serviceCode);
  if (!id || !service) return error("Choose a ticket and destination service.");
  if (actor.role !== "TELLER" || !actor.assignedCounter)
    return error("A manager-assigned teller counter is required.", 403);
  const db = getShowcaseDb();
  const now = new Date().toISOString();
  const ticket = await db
    .prepare(
      `UPDATE qms_demo_tickets
       SET service_code=?, service_name=?, status='WAITING', counter=NULL, called_at=NULL,
           started_at=NULL, completed_at=NULL, queue_entered_at=?
       WHERE id=? AND counter=? AND status IN ('CALLED','IN_SERVICE') RETURNING *`,
    )
    .bind(service.code, service.name, now, id, actor.assignedCounter)
    .first<ShowcaseTicket>();
  if (!ticket) return error("This ticket cannot be transferred now.", 409);
  await appendEvent(
    db,
    ticket.id,
    "ticket.transferred",
    `${ticket.public_number} transferred to ${service.name}`,
  );
  await appendAudit(
    actor,
    "ticket.transfer",
    `${ticket.public_number} transferred to ${service.name}`,
  );
  return Response.json({
    ticket,
    snapshot: { ...(await readSnapshot(db)), actor },
  });
}

async function resetShowcase(actor: ShowcaseActor) {
  const db = getShowcaseDb();
  await db.batch([
    db.prepare("DELETE FROM qms_demo_events"),
    db.prepare("DELETE FROM qms_demo_tickets"),
    db.prepare("DELETE FROM qms_demo_sequences"),
    db.prepare("DELETE FROM qms_demo_priority_state"),
    db.prepare("UPDATE qms_demo_settings SET priority_streak=0 WHERE id=1"),
  ]);
  await appendAudit(actor, "showcase.reset", "Showcase queue records reset");
  return Response.json({
    snapshot: { ...(await readSnapshot(db)), actor },
  });
}

async function setPriorityLimit(
  payload: Record<string, unknown>,
  actor: ShowcaseActor,
) {
  const limit = Number(payload.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) {
    return error("Priority limit must be between 1 and 5.");
  }
  const db = getShowcaseDb();
  await db
    .prepare(
      `INSERT INTO qms_demo_settings (id, priority_streak, priority_limit)
       VALUES (1, 0, ?)
       ON CONFLICT(id) DO UPDATE SET priority_limit=excluded.priority_limit,
         priority_streak=MIN(priority_streak, excluded.priority_limit)`,
    )
    .bind(limit)
    .run();
  await db
    .prepare(
      "UPDATE qms_demo_priority_state SET priority_streak=MIN(priority_streak, ?)",
    )
    .bind(limit)
    .run();
  await appendAudit(
    actor,
    "settings.priority_limit",
    `Priority limit set to ${limit}`,
  );
  return Response.json({ snapshot: { ...(await readSnapshot(db)), actor } });
}

function csvCell(value: unknown) {
  const valueText = value == null ? "" : String(value);
  return `"${valueText.replaceAll('"', '""')}"`;
}

async function exportDailyCsv(actor: ShowcaseActor) {
  const db = getShowcaseDb();
  const rows = await db
    .prepare(
      `SELECT public_number, service_code, service_name, priority, status,
              counter, created_at, called_at, started_at, completed_at
       FROM qms_demo_tickets ORDER BY created_at ASC`,
    )
    .all<Record<string, unknown>>();
  const generatedAt = new Date().toISOString();
  const headers = [
    "ticket_number",
    "service_code",
    "service_name",
    "class",
    "status",
    "counter",
    "issued_utc",
    "called_utc",
    "service_started_utc",
    "completed_utc",
  ];
  const lines = [
    "# Bank QMS daily report",
    `# Generated at UTC: ${generatedAt}`,
    "# Branch timezone: Africa/Addis_Ababa",
    headers.map(csvCell).join(","),
    ...(rows.results ?? []).map((row) =>
      [
        row.public_number,
        row.service_code,
        row.service_name,
        Number(row.priority) === 1 ? "Priority" : "Standard",
        row.status,
        row.counter,
        row.created_at,
        row.called_at,
        row.started_at,
        row.completed_at,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  await appendAudit(actor, "report.export", "Daily ticket CSV exported");
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bank-qms-${businessDate()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function publicSnapshot(
  snapshot: Awaited<ReturnType<typeof readSnapshot>>,
  surface: "kiosk" | "display",
) {
  if (surface === "kiosk") {
    return {
      ...snapshot,
      tickets: [],
      events: [],
      activeCall: null,
      metrics: {
        issued: 0,
        waiting: snapshot.metrics.waiting,
        serving: 0,
        completed: 0,
        noShow: 0,
      },
    };
  }
  const publicEvents = snapshot.events.filter(
    (event) => event.type === "display.call",
  );
  const publicTicketIds = new Set(
    publicEvents.map((event) => event.ticket_id).filter(Boolean),
  );
  return {
    ...snapshot,
    tickets: snapshot.tickets.filter(
      (ticket) =>
        publicTicketIds.has(ticket.id) || ticket.id === snapshot.activeCall?.id,
    ),
    events: publicEvents,
    metrics: {
      issued: 0,
      waiting: snapshot.metrics.waiting,
      serving: 0,
      completed: 0,
      noShow: 0,
    },
  };
}

async function requireActor(request: Request, managerOnly = false) {
  const actor = await getActor(request);
  if (!actor) return { response: error("Authentication required.", 401) };
  if (managerOnly && actor.role !== "MANAGER") {
    return { response: error("Manager permission required.", 403) };
  }
  return { actor };
}

async function customerTicketLookup(ticketId: string, lookupToken: string) {
  const db = getShowcaseDb();
  const ticket = await db
    .prepare(
      `SELECT id, public_number, service_code, service_name, priority, status,
              counter, created_at, called_at, started_at, completed_at,
              lookup_token_hash
       FROM qms_demo_tickets WHERE id = ? LIMIT 1`,
    )
    .bind(ticketId)
    .first<ShowcaseTicket & { lookup_token_hash: string | null }>();

  if (
    !ticket ||
    !ticket.lookup_token_hash ||
    (await sha256Hex(lookupToken)) !== ticket.lookup_token_hash
  ) {
    return error("The private ticket proof is invalid.", 403);
  }

  let position: number | null = null;
  if (ticket.status === "WAITING") {
    const [waitingResult, settings, fairness] = await Promise.all([
      db
        .prepare(
          `SELECT id, priority, queue_entered_at FROM qms_demo_tickets
           WHERE status='WAITING' AND service_code=?
           ORDER BY queue_entered_at ASC, public_number ASC`,
        )
        .bind(ticket.service_code)
        .all<{ id: string; priority: number; queue_entered_at: string }>(),
      db
        .prepare("SELECT priority_limit FROM qms_demo_settings WHERE id=1")
        .first<{ priority_limit: number }>(),
      db
        .prepare(
          "SELECT priority_streak FROM qms_demo_priority_state WHERE service_code=?",
        )
        .bind(ticket.service_code)
        .first<{ priority_streak: number }>(),
    ]);
    const waiting = [...(waitingResult.results ?? [])];
    let streak = fairness?.priority_streak ?? 0;
    const limit = settings?.priority_limit ?? 2;
    for (let index = 1; waiting.length; index += 1) {
      const standards = waiting.filter((item) => item.priority === 0);
      const priorities = waiting.filter((item) => item.priority === 1);
      const selected =
        standards.length && streak >= limit
          ? standards[0]
          : (priorities[0] ?? standards[0]);
      if (!selected) break;
      if (selected.id === ticket.id) {
        position = index;
        break;
      }
      waiting.splice(
        waiting.findIndex((item) => item.id === selected.id),
        1,
      );
      streak = selected.priority ? streak + 1 : 0;
    }
  }

  const safeTicket: ShowcaseTicket = {
    id: ticket.id,
    public_number: ticket.public_number,
    service_code: ticket.service_code,
    service_name: ticket.service_name,
    priority: ticket.priority,
    status: ticket.status,
    counter: ticket.counter,
    created_at: ticket.created_at,
    called_at: ticket.called_at,
    started_at: ticket.started_at,
    completed_at: ticket.completed_at,
  };
  return Response.json({
    ticket: safeTicket,
    position,
    generatedAt: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  try {
    const surface = new URL(request.url).searchParams.get("surface");
    const snapshot = await readSnapshot();
    if (surface === "kiosk" || surface === "display") {
      return Response.json(publicSnapshot(snapshot, surface));
    }
    const authorization = await requireActor(request, surface === "manager");
    if (authorization.response) return authorization.response;
    return Response.json({ ...snapshot, actor: authorization.actor });
  } catch (caught) {
    return error(
      caught instanceof Error ? caught.message : "Snapshot unavailable.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    switch (payload.operation) {
      case "issue":
        return issueTicket(payload);
      case "lookup": {
        const ticketId =
          typeof payload.ticketId === "string" ? payload.ticketId : "";
        const lookupToken =
          typeof payload.lookupToken === "string" ? payload.lookupToken : "";
        if (!ticketId || !lookupToken) {
          return error("Ticket number and private proof are required.", 400);
        }
        return customerTicketLookup(ticketId, lookupToken);
      }
      case "transition": {
        if (payload.action === "cancel") return transition(payload, null);
        const authorization = await requireActor(request);
        if (authorization.response) return authorization.response;
        return transition(payload, authorization.actor);
      }
      case "call_next": {
        const authorization = await requireActor(request);
        if (authorization.response) return authorization.response;
        return callNext(payload, authorization.actor);
      }
      case "transfer": {
        const authorization = await requireActor(request);
        if (authorization.response) return authorization.response;
        return transfer(payload, authorization.actor);
      }
      case "reset": {
        const authorization = await requireActor(request, true);
        if (authorization.response) return authorization.response;
        return resetShowcase(authorization.actor);
      }
      case "set_priority_limit": {
        const authorization = await requireActor(request, true);
        if (authorization.response) return authorization.response;
        return setPriorityLimit(payload, authorization.actor);
      }
      case "export_csv": {
        const authorization = await requireActor(request, true);
        if (authorization.response) return authorization.response;
        return exportDailyCsv(authorization.actor);
      }
      default:
        return error("Unknown operation.");
    }
  } catch (caught) {
    return error(
      caught instanceof Error ? caught.message : "Request failed.",
      500,
    );
  }
}
