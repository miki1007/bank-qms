import {
  businessDate,
  ensureBranches,
  expireReservations,
  getShowcaseDb,
  readSnapshot,
  safeTicket,
  services,
  type StoredTicket,
} from "./showcase-adapter";
import { bankBranch, DEFAULT_BRANCH_CODE } from "./bank-brand";
import { sha256Hex, type ShowcaseActor } from "./showcase-auth";

export class QueueError extends Error {
  constructor(
    message: string,
    public status = 409,
    public code = "QUEUE_CONFLICT",
  ) {
    super(message);
  }
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeStates = "'RESERVED','WAITING','CALLED','IN_SERVICE','NO_SHOW'";
const reasons = new Set([
  "ELDERLY",
  "DISABILITY",
  "PREGNANCY",
  "ACCESSIBILITY",
  "OTHER",
]);

/** Central workflow for the private hosted compatibility demo. The canonical
 * PostgreSQL implementation lives in apps/api TicketWorkflowService. */
export class TicketWorkflowService {
  constructor(
    private db: D1Database = getShowcaseDb(),
    private clock: () => Date = () => new Date(),
  ) {}

  async throttle(
    subject: string,
    operation: string,
    maximum = 20,
    seconds = 60,
  ) {
    const now = this.clock();
    const bucket = Math.floor(now.getTime() / (seconds * 1000));
    const key = `${operation}:${subject}:${bucket}`;
    const row = await this.db
      .prepare(
        `INSERT INTO qms_request_limits (key, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
      )
      .bind(key, new Date((bucket + 1) * seconds * 1000).toISOString())
      .first<{ count: number }>();
    if ((row?.count ?? maximum + 1) > maximum)
      throw new QueueError(
        "Too many attempts. Please wait a minute and try again.",
        429,
        "RATE_LIMITED",
      );
  }
  private branch(value: unknown) {
    const code = value ?? DEFAULT_BRANCH_CODE;
    if (!bankBranch(code))
      throw new QueueError(
        "Choose an available branch.",
        400,
        "VALIDATION_ERROR",
      );
    return String(code);
  }
  private key(value: unknown) {
    if (typeof value !== "string" || !uuid.test(value))
      throw new QueueError(
        "A valid request key is required. Refresh the page and try again.",
        400,
        "VALIDATION_ERROR",
      );
    return value;
  }
  private async ticket(id: string) {
    const ticket = await this.db
      .prepare("SELECT * FROM qms_demo_tickets WHERE id=?")
      .bind(id)
      .first<StoredTicket>();
    if (!ticket)
      throw new QueueError(
        "Ticket not found or private code incorrect.",
        404,
        "RESOURCE_NOT_FOUND",
      );
    return ticket;
  }
  private async prove(id: string, proof: unknown, subject?: string) {
    const ticket = await this.ticket(id);
    if (
      subject &&
      ticket.channel === "REMOTE" &&
      ticket.customer_subject === subject
    )
      return ticket;
    if (
      typeof proof !== "string" ||
      proof.length < 32 ||
      (await sha256Hex(proof)) !== ticket.lookup_token_hash
    )
      throw new QueueError(
        "Ticket not found or private code incorrect.",
        403,
        "FORBIDDEN",
      );
    return ticket;
  }
  private audit(
    actor: ShowcaseActor,
    action: string,
    detail: string,
    now: string,
  ) {
    return this.db
      .prepare(
        "INSERT INTO qms_demo_audit (id, branch_code, staff_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        actor.branchCode,
        actor.id,
        action,
        detail,
        now,
      );
  }
  async issue(payload: Record<string, unknown>, subject: string) {
    const branch = this.branch(payload.branchCode);
    const service = services.find((item) => item.code === payload.serviceCode);
    if (!service)
      throw new QueueError("Choose a valid service.", 400, "VALIDATION_ERROR");
    const key = this.key(payload.idempotencyKey);
    const channel = payload.channel === "KIOSK" ? "KIOSK" : "REMOTE";
    const reason =
      payload.priority === true ? String(payload.priorityReason ?? "") : null;
    if (
      (reason && !reasons.has(reason)) ||
      (payload.priority === true && !reason)
    )
      throw new QueueError(
        "Choose a valid priority eligibility reason.",
        400,
        "VALIDATION_ERROR",
      );
    const proof =
      typeof payload.lookupToken === "string" &&
      payload.lookupToken.length >= 32 &&
      payload.lookupToken.length <= 256
        ? payload.lookupToken
        : null;
    if (!proof)
      throw new QueueError(
        "Secure ticket proof is missing. Refresh and try again.",
        400,
        "VALIDATION_ERROR",
      );
    const hash = await sha256Hex(
      JSON.stringify({ branch, service: service.code, channel, reason, proof }),
    );
    await ensureBranches(this.db);
    const now = this.clock();
    const at = now.toISOString();
    const date = businessDate(now);
    await expireReservations(this.db, branch, at);
    const replay = await this.db
      .prepare(
        "SELECT * FROM qms_demo_tickets WHERE branch_code=? AND customer_subject=? AND idempotency_key=?",
      )
      .bind(branch, subject, key)
      .first<StoredTicket>();
    if (replay) {
      if (replay.request_hash !== hash)
        throw new QueueError(
          "This request key was already used for another selection.",
          409,
          "IDEMPOTENCY_KEY_CONFLICT",
        );
      return { ticket: safeTicket(replay), lookupToken: proof, replayed: true };
    }
    await this.throttle(subject, "issue", 10);
    if (channel === "REMOTE") {
      const existing = await this.db
        .prepare(
          `SELECT id FROM qms_demo_tickets WHERE customer_subject=? AND branch_code=? AND channel='REMOTE' AND status IN (${activeStates})`,
        )
        .bind(subject, branch)
        .first();
      if (existing)
        throw new QueueError(
          "You already have an active ticket at this branch. Open Ticket history to continue.",
          409,
          "ACTIVE_TICKET_EXISTS",
        );
      const limits = await this.db
        .prepare(
          `SELECT COUNT(*) AS issued, SUM(CASE WHEN status='EXPIRED' OR no_show_count>0 THEN 1 ELSE 0 END) AS missed
        FROM qms_demo_tickets WHERE customer_subject=? AND channel='REMOTE' AND business_date=?`,
        )
        .bind(subject, date)
        .first<{ issued: number; missed: number }>();
      if ((limits?.issued ?? 0) >= 3)
        throw new QueueError(
          "You have reached today's limit of three remote reservations. Branch staff can help with another visit.",
          429,
          "DAILY_LIMIT",
        );
      const recent = await this.db
        .prepare(
          "SELECT id FROM qms_demo_tickets WHERE customer_subject=? AND channel='REMOTE' AND status='CANCELLED' AND completed_at>? LIMIT 1",
        )
        .bind(subject, new Date(now.getTime() - 600_000).toISOString())
        .first();
      if (recent)
        throw new QueueError(
          "Please wait 10 minutes after cancelling before reserving again.",
          429,
          "CANCELLATION_COOLDOWN",
        );
      const missed = await this.db
        .prepare(
          "SELECT SUM(CASE WHEN status='EXPIRED' THEN 1 ELSE no_show_count END) AS count FROM qms_demo_tickets WHERE customer_subject=? AND channel='REMOTE' AND created_at>?",
        )
        .bind(subject, new Date(now.getTime() - 86_400_000).toISOString())
        .first<{ count: number }>();
      if ((missed?.count ?? 0) >= 3)
        throw new QueueError(
          "Remote reservations are paused for 24 hours after repeated missed visits. You can still visit the branch kiosk.",
          429,
          "REMOTE_RESTRICTED",
        );
    }
    const ahead = await this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM qms_demo_tickets WHERE branch_code=? AND service_code=? AND status IN ('RESERVED','WAITING')",
      )
      .bind(branch, service.code)
      .first<{ count: number }>();
    const open = await this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM qms_counter_operations WHERE branch_code=? AND service_code=? AND status='OPEN'",
      )
      .bind(branch, service.code)
      .first<{ count: number }>();
    const estimate = Math.ceil(
      ((ahead?.count ?? 0) * service.minutes) / Math.max(1, open?.count ?? 0),
    );
    const opens = new Date(
      now.getTime() + Math.max(0, estimate - 30) * 60_000,
    ).toISOString();
    const deadline = new Date(
      now.getTime() + (estimate + 10) * 60_000,
    ).toISOString();
    const id = crypto.randomUUID();
    const lookupHash = await sha256Hex(proof);
    // A D1 batch is one transaction. Sequence, ticket, and event commit together.
    // INSERT's quota conditions are evaluated inside that transaction, including races.
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO qms_branch_sequences (branch_code, service_code, business_date, next_value)
        VALUES (?, ?, ?, COALESCE((SELECT MAX(CAST(substr(public_number, instr(public_number, '-')+1) AS INTEGER)) FROM qms_demo_tickets WHERE branch_code=? AND business_date=? AND public_number LIKE ?),0)+1)
        ON CONFLICT(branch_code,service_code,business_date) DO UPDATE SET next_value=next_value+1`,
        )
        .bind(branch, service.code, date, branch, date, `${service.code}-%`),
      this.db
        .prepare(
          `INSERT INTO qms_demo_tickets (id, branch_code, public_number, business_date, service_code, service_name, priority, priority_requested, priority_reason, status,
        created_at, queue_entered_at, lookup_token_hash, customer_subject, idempotency_key, request_hash, channel, check_in_opens_at, check_in_deadline, checked_in_at)
        SELECT ?, ?, ? || '-' || printf('%03d', next_value), ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM qms_branch_sequences
        WHERE branch_code=? AND service_code=? AND business_date=?
          AND (?='KIOSK' OR ((SELECT COUNT(*) FROM qms_demo_tickets WHERE customer_subject=? AND channel='REMOTE' AND business_date=?)<3
          AND NOT EXISTS(SELECT 1 FROM qms_demo_tickets WHERE customer_subject=? AND channel='REMOTE' AND status='CANCELLED' AND completed_at>?)))
        ON CONFLICT(branch_code,customer_subject,idempotency_key) DO NOTHING`,
        )
        .bind(
          id,
          branch,
          service.code,
          date,
          service.code,
          service.name,
          reason ? 1 : 0,
          reason,
          channel === "REMOTE" ? "RESERVED" : "WAITING",
          at,
          at,
          lookupHash,
          subject,
          key,
          hash,
          channel,
          channel === "REMOTE" ? opens : null,
          channel === "REMOTE" ? deadline : null,
          channel === "KIOSK" ? at : null,
          branch,
          service.code,
          date,
          channel,
          subject,
          date,
          subject,
          new Date(now.getTime() - 600_000).toISOString(),
        ),
      this.db
        .prepare(
          `INSERT INTO qms_demo_events (id, branch_code, ticket_id, type, detail, created_at)
        SELECT ?, branch_code, id, 'ticket.created', public_number || ': ' || CASE WHEN channel='REMOTE' THEN 'place reserved; arrival required' ELSE 'joined service queue' END, ?
        FROM qms_demo_tickets WHERE id=?`,
        )
        .bind(crypto.randomUUID(), at, id),
    ]);
    const created = await this.db
      .prepare(
        "SELECT * FROM qms_demo_tickets WHERE branch_code=? AND customer_subject=? AND idempotency_key=?",
      )
      .bind(branch, subject, key)
      .first<StoredTicket>();
    if (!created)
      throw new QueueError(
        "Your reservation limit changed. Refresh your tickets before trying again.",
        429,
        "RATE_LIMITED",
      );
    if (created.request_hash !== hash)
      throw new QueueError(
        "This request key was already used for another selection.",
        409,
        "IDEMPOTENCY_KEY_CONFLICT",
      );
    return {
      ticket: safeTicket(created),
      lookupToken: proof,
      replayed: created.id !== id,
      estimatedWaitMinutes: estimate,
    };
  }

  async lookup(id: string, proof: unknown, subject?: string) {
    let ticket = await this.prove(id, proof, subject);
    await expireReservations(
      this.db,
      ticket.branch_code,
      this.clock().toISOString(),
    );
    ticket = await this.ticket(id);
    const snapshot = await readSnapshot(this.db, ticket.branch_code);
    const waiting = snapshot.tickets
      .filter(
        (item) =>
          item.service_code === ticket.service_code &&
          (item.status === "WAITING" ||
            (item.id === ticket.id && item.status === "RESERVED")),
      )
      .sort(
        (a, b) =>
          a.queue_entered_at.localeCompare(b.queue_entered_at) ||
          Number(a.public_number.split("-")[1]) -
            Number(b.public_number.split("-")[1]) ||
          a.id.localeCompare(b.id),
      );
    const fairness = await this.db
      .prepare(
        "SELECT streak FROM qms_branch_fairness WHERE branch_code=? AND service_code=?",
      )
      .bind(ticket.branch_code, ticket.service_code)
      .first<{ streak: number }>();
    let streak = fairness?.streak ?? 0;
    let position: number | null = null;
    for (let rank = 1; waiting.length; rank++) {
      const standard = waiting.find((item) => !item.priority);
      const priority = waiting.find((item) => item.priority);
      const selected =
        standard && streak >= snapshot.settings.priorityLimit
          ? standard
          : (priority ?? standard);
      if (!selected) break;
      if (selected.id === id) {
        position = rank;
        break;
      }
      waiting.splice(waiting.indexOf(selected), 1);
      streak = selected.priority ? streak + 1 : 0;
    }
    const service = snapshot.services.find(
      (item) => item.code === ticket.service_code,
    );
    return {
      ticket: safeTicket(ticket),
      position,
      peopleAhead: position === null ? null : position - 1,
      estimatedWaitMinutes:
        position !== null && service?.activeCounters
          ? Math.ceil(
              ((position - 1) * service.minutes) / service.activeCounters,
            )
          : null,
      branch: snapshot.branch,
      generatedAt: this.clock().toISOString(),
    };
  }
  async history(subject: string) {
    const result = await this.db
      .prepare(
        `SELECT * FROM qms_demo_tickets WHERE customer_subject=? AND channel='REMOTE' ORDER BY created_at DESC LIMIT 50`,
      )
      .bind(subject)
      .all<StoredTicket>();
    return { tickets: (result.results ?? []).map(safeTicket) };
  }
  async arrivalCode(branch: string, actor: ShowcaseActor) {
    if (actor.branchCode !== branch)
      throw new QueueError(
        "This branch is outside your staff assignment.",
        403,
        "FORBIDDEN",
      );
    await this.throttle(actor.id, "arrival-code", 10);
    const digits = new Uint32Array(1);
    crypto.getRandomValues(digits);
    const code = String(100000 + (digits[0] % 900000));
    const expiresAt = new Date(this.clock().getTime() + 120_000).toISOString();
    await this.db
      .prepare(
        "INSERT INTO qms_arrival_challenges (branch_code, code_hash, expires_at) VALUES (?, ?, ?) ON CONFLICT(branch_code) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at",
      )
      .bind(branch, await sha256Hex(`${branch}:${code}`), expiresAt)
      .run();
    return { code, expiresAt, branchCode: branch };
  }
  async checkIn(payload: Record<string, unknown>, subject: string) {
    await this.throttle(subject, "arrival", 5);
    const ticket = await this.prove(
      String(payload.ticketId ?? ""),
      payload.lookupToken,
      subject,
    );
    if (ticket.channel !== "REMOTE" || ticket.customer_subject !== subject)
      throw new QueueError(
        "This reservation belongs to another customer.",
        403,
        "FORBIDDEN",
      );
    if (ticket.status === "WAITING" && ticket.checked_in_at)
      return { ticket: safeTicket(ticket), replayed: true };
    const now = this.clock().toISOString();
    await expireReservations(this.db, ticket.branch_code, now);
    if (
      ticket.status !== "RESERVED" ||
      !ticket.check_in_deadline ||
      ticket.check_in_deadline < now
    )
      throw new QueueError(
        "The reservation has expired. Request a new ticket to join at the back.",
        409,
        "RESERVATION_EXPIRED",
      );
    if (ticket.check_in_opens_at && now < ticket.check_in_opens_at)
      throw new QueueError(
        "Your check-in window has not opened yet.",
        409,
        "CHECK_IN_NOT_OPEN",
      );
    const challenge = await this.db
      .prepare(
        "SELECT code_hash FROM qms_arrival_challenges WHERE branch_code=? AND expires_at>?",
      )
      .bind(ticket.branch_code, now)
      .first<{ code_hash: string }>();
    if (
      !challenge ||
      typeof payload.arrivalCode !== "string" ||
      !/^\d{6}$/.test(payload.arrivalCode) ||
      (await sha256Hex(`${ticket.branch_code}:${payload.arrivalCode}`)) !==
        challenge.code_hash
    )
      throw new QueueError(
        "The arrival code is incorrect or expired. Ask branch staff for the current code.",
        400,
        "INVALID_ARRIVAL_CODE",
      );
    // queue_entered_at is deliberately preserved: on-time arrival keeps booking order.
    const op = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE qms_demo_tickets SET status='WAITING', checked_in_at=?, last_operation_id=? WHERE id=? AND status='RESERVED' AND check_in_deadline>=?",
        )
        .bind(now, op, ticket.id, now),
      this.db
        .prepare(
          "INSERT INTO qms_demo_events (id, branch_code, ticket_id, type, detail, created_at) SELECT ?, branch_code, id, 'ticket.checked_in', public_number || ': arrival confirmed; booking order preserved', ? FROM qms_demo_tickets WHERE id=? AND last_operation_id=?",
        )
        .bind(crypto.randomUUID(), now, ticket.id, op),
    ]);
    const updated = await this.ticket(ticket.id);
    if (updated.status !== "WAITING")
      throw new QueueError("The reservation changed. Refresh its status.");
    return { ticket: safeTicket(updated) };
  }
  async cancel(payload: Record<string, unknown>, subject?: string) {
    const ticket = await this.prove(
      String(payload.ticketId ?? ""),
      payload.lookupToken,
      subject,
    );
    if (ticket.status === "CANCELLED")
      return { ticket: safeTicket(ticket), replayed: true };
    if (!["RESERVED", "WAITING"].includes(ticket.status))
      throw new QueueError(
        "Only an uncalled ticket or reservation can be cancelled.",
      );
    const now = this.clock().toISOString(),
      op = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE qms_demo_tickets SET status='CANCELLED', completed_at=?, last_operation_id=? WHERE id=? AND status IN ('RESERVED','WAITING')",
        )
        .bind(now, op, ticket.id),
      this.db
        .prepare(
          "INSERT INTO qms_demo_events (id, branch_code, ticket_id, type, detail, created_at) SELECT ?, branch_code, id, 'ticket.cancelled', public_number || ': customer cancelled', ? FROM qms_demo_tickets WHERE id=? AND last_operation_id=?",
        )
        .bind(crypto.randomUUID(), now, ticket.id, op),
    ]);
    const updated = await this.ticket(ticket.id);
    if (updated.status !== "CANCELLED")
      throw new QueueError(
        "This ticket was already called. Refresh its status.",
      );
    return { ticket: safeTicket(updated) };
  }

  private teller(actor: ShowcaseActor) {
    if (
      actor.role !== "TELLER" ||
      !actor.assignedCounter ||
      !actor.assignedServiceCode
    )
      throw new QueueError(
        "A manager-assigned teller counter is required.",
        403,
        "FORBIDDEN",
      );
  }
  async counter(action: string, actor: ShowcaseActor) {
    this.teller(actor);
    const next = (
      {
        open: "OPEN",
        pause: "PAUSED",
        resume: "OPEN",
        close: "CLOSED",
      } as Record<string, string>
    )[action];
    if (!next) throw new QueueError("Unknown counter action.", 400);
    const now = this.clock().toISOString();
    const result = await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO qms_counter_operations (branch_code,counter,staff_id,service_code,status) VALUES (?,?,?,?,'CLOSED') ON CONFLICT(branch_code,counter) DO NOTHING",
        )
        .bind(
          actor.branchCode,
          actor.assignedCounter,
          actor.id,
          actor.assignedServiceCode,
        ),
      this.db
        .prepare(
          `UPDATE qms_counter_operations SET status=?,staff_id=?,opened_at=CASE WHEN ?='open' THEN ? ELSE opened_at END
        WHERE branch_code=? AND counter=? AND (staff_id=? OR status='CLOSED')
        AND status IN (${action === "open" ? "'CLOSED'" : action === "pause" ? "'OPEN'" : action === "resume" ? "'PAUSED'" : "'OPEN','PAUSED'"})
        AND NOT EXISTS(SELECT 1 FROM qms_demo_tickets WHERE branch_code=? AND counter=? AND status IN ('CALLED','IN_SERVICE')) RETURNING *`,
        )
        .bind(
          next,
          actor.id,
          action,
          now,
          actor.branchCode,
          actor.assignedCounter,
          actor.id,
          actor.branchCode,
          actor.assignedCounter,
        ),
    ]);
    if (!result[1]?.results?.length)
      throw new QueueError(
        "Resolve the current customer first, or refresh the counter state.",
        409,
        "COUNTER_BUSY",
      );
    await this.audit(
      actor,
      `counter.${action}`,
      `${actor.assignedCounter}: ${next}`,
      now,
    ).run();
    return {
      snapshot: { ...(await readSnapshot(this.db, actor.branchCode)), actor },
    };
  }
  private async replay(actor: ShowcaseActor, key: string, hash: string) {
    const row = await this.db
      .prepare(
        "SELECT request_hash,ticket_id FROM qms_operation_replays WHERE actor_id=? AND request_key=?",
      )
      .bind(actor.id, key)
      .first<{ request_hash: string; ticket_id: string }>();
    if (!row) return null;
    if (row.request_hash !== hash)
      throw new QueueError(
        "This request key belongs to a different action.",
        409,
        "IDEMPOTENCY_KEY_CONFLICT",
      );
    return {
      ticket: safeTicket(await this.ticket(row.ticket_id)),
      replayed: true,
    };
  }
  async staffAction(payload: Record<string, unknown>, actor: ShowcaseActor) {
    this.teller(actor);
    const action =
      payload.operation === "call_next"
        ? "call_next"
        : payload.operation === "transfer"
          ? "transfer"
          : String(payload.action);
    const key = this.key(payload.idempotencyKey),
      hash = await sha256Hex(
        JSON.stringify({
          action,
          ticket: payload.ticketId ?? null,
          service: payload.serviceCode ?? null,
        }),
      );
    const replay = await this.replay(actor, key, hash);
    if (replay) return replay;
    const session = await this.db
      .prepare(
        "SELECT status FROM qms_counter_operations WHERE branch_code=? AND counter=? AND staff_id=?",
      )
      .bind(actor.branchCode, actor.assignedCounter, actor.id)
      .first<{ status: string }>();
    if (session?.status !== "OPEN")
      throw new QueueError(
        "Open your assigned counter session before serving customers.",
        409,
        "SESSION_REQUIRED",
      );
    const now = this.clock().toISOString(),
      op = crypto.randomUUID();
    await expireReservations(this.db, actor.branchCode, now);
    let mutation: D1PreparedStatement;
    let type = "ticket.updated";
    if (action === "call_next") {
      await this.db
        .prepare(
          "INSERT INTO qms_branch_fairness (branch_code,service_code,streak) VALUES (?,?,0) ON CONFLICT(branch_code,service_code) DO NOTHING",
        )
        .bind(actor.branchCode, actor.assignedServiceCode)
        .run();
      // The ordering expression reads the streak inside the same serialized transaction.
      mutation = this.db
        .prepare(
          `UPDATE qms_demo_tickets SET status='CALLED',counter=?,called_at=?,last_operation_id=?
        WHERE id=(SELECT id FROM qms_demo_tickets t WHERE branch_code=? AND service_code=? AND status='WAITING'
          ORDER BY CASE WHEN (SELECT streak FROM qms_branch_fairness WHERE branch_code=? AND service_code=?) >= COALESCE((SELECT priority_limit FROM qms_branches WHERE code=?),2)
            AND EXISTS(SELECT 1 FROM qms_demo_tickets WHERE branch_code=? AND service_code=? AND status='WAITING' AND priority=0)
            THEN priority ELSE -priority END, queue_entered_at ASC, CAST(substr(public_number,instr(public_number,'-')+1) AS INTEGER) ASC,id ASC LIMIT 1)
        AND NOT EXISTS(SELECT 1 FROM qms_demo_tickets WHERE branch_code=? AND counter=? AND status IN ('CALLED','IN_SERVICE'))
        AND NOT EXISTS(SELECT 1 FROM qms_operation_replays WHERE actor_id=? AND request_key=?)
        AND EXISTS(SELECT 1 FROM qms_counter_operations WHERE branch_code=? AND counter=? AND staff_id=? AND status='OPEN') RETURNING *`,
        )
        .bind(
          actor.assignedCounter,
          now,
          op,
          actor.branchCode,
          actor.assignedServiceCode,
          actor.branchCode,
          actor.assignedServiceCode,
          actor.branchCode,
          actor.branchCode,
          actor.assignedServiceCode,
          actor.branchCode,
          actor.assignedCounter,
          actor.id,
          key,
          actor.branchCode,
          actor.assignedCounter,
          actor.id,
        );
      type = "display.call";
    } else {
      const ticket = await this.ticket(String(payload.ticketId ?? ""));
      if (
        ticket.branch_code !== actor.branchCode ||
        ticket.counter !== actor.assignedCounter
      )
        throw new QueueError(
          "This ticket belongs to another teller counter.",
          403,
          "FORBIDDEN",
        );
      const changes: Record<
        string,
        { from: string; set: string; values: unknown[]; event: string }
      > = {
        start: {
          from: "'CALLED'",
          set: "status='IN_SERVICE',started_at=?",
          values: [now],
          event: "ticket.started",
        },
        complete: {
          from: "'IN_SERVICE'",
          set: "status='COMPLETED',completed_at=?",
          values: [now],
          event: "ticket.completed",
        },
        recall: {
          from: "'CALLED'",
          set: "status='CALLED'",
          values: [],
          event: "display.call",
        },
        no_show: {
          from: "'CALLED'",
          set: "status='WAITING',counter=NULL,called_at=NULL,queue_entered_at=?,no_show_count=no_show_count+1",
          values: [now],
          event: "ticket.no_show",
        },
      };
      if (
        action === "no_show" &&
        this.clock().getTime() - new Date(ticket.called_at ?? now).getTime() <
          120_000
      )
        throw new QueueError(
          "Wait two minutes after calling before marking no-show.",
          409,
          "NO_SHOW_TOO_EARLY",
        );
      if (action === "transfer") {
        const service = services.find(
          (item) => item.code === payload.serviceCode,
        );
        if (!service || service.code === ticket.service_code)
          throw new QueueError("Choose a different destination service.", 400);
        changes.transfer = {
          from: "'CALLED','IN_SERVICE'",
          set: "status='WAITING',service_code=?,service_name=?,queue_entered_at=?,counter=NULL,called_at=NULL,started_at=NULL",
          values: [service.code, service.name, now],
          event: "ticket.transferred",
        };
      }
      const change = changes[action];
      if (!change) throw new QueueError("This action is not available.", 400);
      mutation = this.db
        .prepare(
          `UPDATE qms_demo_tickets SET ${change.set},last_operation_id=? WHERE id=? AND branch_code=? AND counter=? AND status IN (${change.from})
        AND NOT EXISTS(SELECT 1 FROM qms_operation_replays WHERE actor_id=? AND request_key=?)
        AND EXISTS(SELECT 1 FROM qms_counter_operations WHERE branch_code=? AND counter=? AND staff_id=? AND status='OPEN') RETURNING *`,
        )
        .bind(
          ...change.values,
          op,
          ticket.id,
          actor.branchCode,
          actor.assignedCounter,
          actor.id,
          key,
          actor.branchCode,
          actor.assignedCounter,
          actor.id,
        );
      type = change.event;
    }
    const statements = [
      mutation,
      this.db
        .prepare(
          "INSERT INTO qms_demo_events (id,branch_code,ticket_id,type,detail,created_at) SELECT ?,branch_code,id,?,public_number || ': ' || ?,? FROM qms_demo_tickets WHERE last_operation_id=?",
        )
        .bind(
          crypto.randomUUID(),
          type,
          type === "display.call"
            ? `called to ${actor.assignedCounter}`
            : action.replaceAll("_", " "),
          now,
          op,
        ),
      this.db
        .prepare(
          "INSERT INTO qms_demo_audit (id,branch_code,staff_id,action,detail,created_at) SELECT ?,branch_code,?,?,public_number,? FROM qms_demo_tickets WHERE last_operation_id=?",
        )
        .bind(crypto.randomUUID(), actor.id, `ticket.${action}`, now, op),
      this.db
        .prepare(
          "INSERT INTO qms_operation_replays (actor_id,request_key,request_hash,ticket_id,created_at) SELECT ?,?,?,id,? FROM qms_demo_tickets WHERE last_operation_id=? ON CONFLICT(actor_id,request_key) DO NOTHING",
        )
        .bind(actor.id, key, hash, now, op),
    ];
    if (action === "call_next")
      statements.push(
        this.db
          .prepare(
            "UPDATE qms_branch_fairness SET streak=CASE WHEN (SELECT priority FROM qms_demo_tickets WHERE last_operation_id=?)=1 THEN streak+1 ELSE 0 END WHERE branch_code=? AND service_code=? AND EXISTS(SELECT 1 FROM qms_demo_tickets WHERE last_operation_id=?)",
          )
          .bind(op, actor.branchCode, actor.assignedServiceCode, op),
      );
    const result = await this.db.batch<StoredTicket>(statements);
    const changed = result[0]?.results?.[0];
    if (!changed) {
      const replay = await this.replay(actor, key, hash);
      if (replay) return replay;
      throw new QueueError(
        action === "call_next"
          ? "No eligible customers are waiting, or your counter already has an unresolved ticket."
          : "The ticket changed. Refresh and try again.",
      );
    }
    return {
      ticket: safeTicket(changed),
      snapshot: { ...(await readSnapshot(this.db, actor.branchCode)), actor },
    };
  }
  async approvePriority(ticketId: string, actor: ShowcaseActor) {
    const ticket = await this.ticket(ticketId);
    if (ticket.branch_code !== actor.branchCode)
      throw new QueueError(
        "This ticket belongs to another branch.",
        403,
        "FORBIDDEN",
      );
    if (
      !ticket.priority_requested ||
      !["WAITING", "RESERVED"].includes(ticket.status)
    )
      throw new QueueError("No pending priority request for this ticket.");
    const now = this.clock().toISOString(),
      op = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE qms_demo_tickets SET priority=1,priority_verified_by=?,last_operation_id=? WHERE id=? AND priority=0 AND status IN ('WAITING','RESERVED')",
        )
        .bind(actor.id, op, ticket.id),
      this.db
        .prepare(
          "INSERT INTO qms_demo_events (id,branch_code,ticket_id,type,detail,created_at) SELECT ?,branch_code,id,'ticket.priority_approved',public_number || ': priority approved',? FROM qms_demo_tickets WHERE last_operation_id=?",
        )
        .bind(crypto.randomUUID(), now, op),
      this.audit(
        actor,
        "priority.approved",
        `${ticket.public_number}: staff verified eligibility`,
        now,
      ),
    ]);
    return {
      ticket: safeTicket(await this.ticket(ticket.id)),
      snapshot: { ...(await readSnapshot(this.db, actor.branchCode)), actor },
    };
  }
}
