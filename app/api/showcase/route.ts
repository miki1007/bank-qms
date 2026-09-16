import {
  actorPerformance,
  businessDate,
  getShowcaseDb,
  publicSnapshot,
  readCustomerPortfolio,
  readSnapshot,
  readStaffDirectory,
} from "@/lib/showcase-adapter";
import { BANK_NAME, DEFAULT_BRANCH_CODE, bankBranch } from "@/lib/bank-brand";
import {
  appendAudit,
  getActor,
  sha256Hex,
  type ShowcaseActor,
} from "@/lib/showcase-auth";
import {
  QueueError,
  TicketWorkflowService,
} from "@/lib/showcase-ticket-workflow";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const error = (message: string, status = 400, code = "VALIDATION_ERROR") =>
  json({ error: message, code }, status);

function roleName(role: ShowcaseActor["role"]) {
  if (role === "ADMIN") return "Administrator";
  return role === "MANAGER" ? "Manager" : "Teller";
}

async function requireActor(
  request: Request,
  requiredRole?: ShowcaseActor["role"],
) {
  const actor = await getActor(request);
  if (!actor)
    throw new QueueError(
      "Authentication required.",
      401,
      "AUTHENTICATION_FAILED",
    );
  if (requiredRole && actor.role !== requiredRole)
    throw new QueueError(
      `${roleName(requiredRole)} permission required.`,
      403,
      "FORBIDDEN",
    );
  return actor;
}

async function requireAnyActor(
  request: Request,
  allowedRoles: Array<ShowcaseActor["role"]>,
) {
  const actor = await requireActor(request);
  if (!allowedRoles.includes(actor.role))
    throw new QueueError(
      `${allowedRoles.map(roleName).join(" or ")} permission required.`,
      403,
      "FORBIDDEN",
    );
  return actor;
}

async function protectedSnapshot(actor: ShowcaseActor) {
  const snapshot = await readSnapshot(getShowcaseDb(), actor.branchCode);
  return {
    ...snapshot,
    actor,
    actorMetrics: actorPerformance(snapshot, actor.assignedCounter),
    staff:
      actor.role === "ADMIN"
        ? await readStaffDirectory(getShowcaseDb(), actor.branchCode)
        : undefined,
  };
}
async function customerSubject(request: Request) {
  // Only the owner-private Sites dispatcher supplies this identity. This is a
  // documented showcase adaptation, never a substitute for production phone OTP.
  const identity =
    request.headers.get("oai-authenticated-user-id") ??
    (new URL(request.url).hostname === "terminal.local"
      ? "local-preview-customer"
      : null);
  if (!identity)
    throw new QueueError(
      "Sign in to the private demo to reserve a ticket.",
      401,
      "AUTHENTICATION_FAILED",
    );
  return sha256Hex(`worldlink-customer:${identity}`);
}
function handleError(caught: unknown) {
  if (caught instanceof QueueError)
    return error(caught.message, caught.status, caught.code);
  if (
    caught instanceof Error &&
    /UNIQUE constraint failed/.test(caught.message)
  )
    return error(
      "There is already an active ticket or request. Refresh your ticket history before trying again.",
      409,
      "QUEUE_CONFLICT",
    );
  const requestId = crypto.randomUUID();
  console.error("WorldLink queue request failed", {
    requestId,
    errorType: caught instanceof Error ? caught.name : "Unknown",
  });
  return json(
    {
      error:
        "The ticket service is temporarily unavailable. You can safely retry the same request.",
      code: "SYSTEM_UNAVAILABLE",
      requestId,
    },
    503,
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      surface = url.searchParams.get("surface");
    const requested = url.searchParams.get("branch");
    if (surface === "customer-banking")
      return json(await readCustomerPortfolio(await customerSubject(request)));
    if (surface === "customer-history")
      return json(
        await new TicketWorkflowService().history(
          await customerSubject(request),
        ),
      );
    if (surface === "kiosk" || surface === "display") {
      const branch = requested ?? DEFAULT_BRANCH_CODE;
      if (!bankBranch(branch))
        throw new QueueError("Choose an available branch.", 400);
      return json(
        publicSnapshot(await readSnapshot(getShowcaseDb(), branch), surface),
      );
    }
    const requiredRole =
      surface === "teller"
        ? "TELLER"
        : surface === "manager"
          ? "MANAGER"
          : surface === "admin"
            ? "ADMIN"
            : undefined;
    const actor = await requireActor(request, requiredRole);
    if (requested && requested !== actor.branchCode)
      throw new QueueError(
        "This branch is outside your staff assignment.",
        403,
        "FORBIDDEN",
      );
    return json(await protectedSnapshot(actor));
  } catch (caught) {
    return handleError(caught);
  }
}

function csvCell(value: unknown) {
  let cell = value == null ? "" : String(value);
  if (/^[=+@\-\t\r]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}
async function exportDailyCsv(
  payload: Record<string, unknown>,
  actor: ShowcaseActor,
) {
  const from = typeof payload.from === "string" ? payload.from : businessDate();
  const to = typeof payload.to === "string" ? payload.to : from;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) ||
    to < from ||
    Date.parse(to) - Date.parse(from) > 31 * 86_400_000
  )
    throw new QueueError("Select a valid report period of up to 31 days.", 400);
  const rows = await getShowcaseDb()
    .prepare(
      `SELECT public_number, business_date, service_code, service_name, status, counter, created_at, checked_in_at, called_at, started_at, completed_at, channel, no_show_count
    FROM qms_demo_tickets WHERE branch_code=? AND business_date BETWEEN ? AND ? ORDER BY created_at ASC`,
    )
    .bind(actor.branchCode, from, to)
    .all<Record<string, unknown>>();
  const columns = [
    "public_number",
    "business_date",
    "service_code",
    "service_name",
    "status",
    "counter",
    "created_at",
    "checked_in_at",
    "called_at",
    "started_at",
    "completed_at",
    "channel",
    "no_show_count",
  ];
  const lines = [
    `# ${BANK_NAME} queue report`,
    `# Branch: ${actor.branchCode}`,
    `# Filters: ${from} to ${to}`,
    `# Generated at UTC: ${new Date().toISOString()}`,
    "# Branch timezone: Africa/Addis_Ababa",
    "# All timestamp columns use UTC; status counts derive from tickets",
    columns.map(csvCell).join(","),
    ...(rows.results ?? []).map((row) =>
      columns.map((column) => csvCell(row[column])).join(","),
    ),
  ];
  await appendAudit(
    actor,
    "report.export",
    `CSV ${from} to ${to}: ${(rows.results ?? []).length} tickets`,
  );
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="worldlink-${actor.branchCode}-${from}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

async function exportCustomerStatement(
  payload: Record<string, unknown>,
  subject: string,
) {
  const portfolio = await readCustomerPortfolio(subject);
  const requestedAccount =
    typeof payload.accountId === "string" ? payload.accountId : null;
  if (
    requestedAccount &&
    !portfolio.accounts.some((account) => account.id === requestedAccount)
  )
    throw new QueueError("Account not found.", 404, "RESOURCE_NOT_FOUND");
  const rows = portfolio.transactions.filter(
    (transaction) =>
      !requestedAccount || transaction.account_id === requestedAccount,
  );
  const accountName = requestedAccount
    ? portfolio.accounts.find((account) => account.id === requestedAccount)
        ?.account_name
    : "All demonstration accounts";
  const lines = [
    `# ${BANK_NAME} customer statement`,
    `# Account: ${accountName}`,
    `# Generated at UTC: ${new Date().toISOString()}`,
    "# Demonstration data only; no real funds or banking operations",
    [
      "posted_at",
      "description",
      "category",
      "amount_etb",
      "balance_etb",
      "status",
      "reference",
    ]
      .map(csvCell)
      .join(","),
    ...rows.map((row) =>
      [
        row.posted_at,
        row.description,
        row.category,
        (row.amount_minor / 100).toFixed(2),
        (row.balance_minor / 100).toFixed(2),
        row.status,
        row.reference,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="worldlink-statement-${businessDate()}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}

const allowedCounters = new Set([
  "Counter 1",
  "Counter 2",
  "Counter 3",
  "Counter 4",
]);

async function updateStaffAssignment(
  payload: Record<string, unknown>,
  actor: ShowcaseActor,
) {
  const db = getShowcaseDb();
  await readSnapshot(db, actor.branchCode);
  const staffId = typeof payload.staffId === "string" ? payload.staffId : "";
  const assignedCounter =
    typeof payload.assignedCounter === "string" ? payload.assignedCounter : "";
  const assignedServiceCode =
    typeof payload.assignedServiceCode === "string"
      ? payload.assignedServiceCode
      : "";
  const active = payload.active !== false;
  if (!staffId || !allowedCounters.has(assignedCounter))
    throw new QueueError("Choose a valid teller and counter.", 400);
  const teller = await db
    .prepare(
      `SELECT id, display_name, assigned_counter, assigned_service_code, active
       FROM qms_demo_staff WHERE id=? AND branch_code=? AND role='TELLER' LIMIT 1`,
    )
    .bind(staffId, actor.branchCode)
    .first<{
      id: string;
      display_name: string;
      assigned_counter: string | null;
      assigned_service_code: string | null;
      active: number;
    }>();
  if (!teller) throw new QueueError("Teller not found in your branch.", 404);
  const service = await db
    .prepare(
      "SELECT code FROM qms_service_configuration WHERE branch_code=? AND code=? AND active=1",
    )
    .bind(actor.branchCode, assignedServiceCode)
    .first<{ code: string }>();
  if (!service) throw new QueueError("Choose an active service.", 400);
  const assignmentChanged =
    teller.assigned_counter !== assignedCounter ||
    teller.assigned_service_code !== assignedServiceCode ||
    Boolean(teller.active) !== active;
  if (!assignmentChanged) return protectedSnapshot(actor);
  const activeCounter = await db
    .prepare(
      `SELECT counter FROM qms_counter_operations
       WHERE branch_code=? AND staff_id=? AND status!='CLOSED' LIMIT 1`,
    )
    .bind(actor.branchCode, staffId)
    .first<{ counter: string }>();
  if (activeCounter)
    throw new QueueError(
      "Close this teller's active counter session before changing the assignment.",
      409,
      "COUNTER_BUSY",
    );
  const occupied = await db
    .prepare(
      `SELECT id FROM qms_demo_staff
       WHERE branch_code=? AND assigned_counter=? AND id!=? AND active=1 LIMIT 1`,
    )
    .bind(actor.branchCode, assignedCounter, staffId)
    .first();
  if (occupied)
    throw new QueueError(
      "That counter is already assigned to another active teller.",
      409,
      "COUNTER_BUSY",
    );
  await db
    .prepare(
      `UPDATE qms_demo_staff
       SET assigned_counter=?, assigned_service_code=?, active=?
       WHERE id=? AND branch_code=? AND role='TELLER'`,
    )
    .bind(
      assignedCounter,
      assignedServiceCode,
      active ? 1 : 0,
      staffId,
      actor.branchCode,
    )
    .run();
  await appendAudit(
    actor,
    "admin.staff_assignment",
    `${teller.display_name}: ${assignedCounter}, ${assignedServiceCode}, ${active ? "active" : "inactive"}`,
  );
  return protectedSnapshot(actor);
}

async function updateServiceConfiguration(
  payload: Record<string, unknown>,
  actor: ShowcaseActor,
) {
  const db = getShowcaseDb();
  await readSnapshot(db, actor.branchCode);
  const code =
    typeof payload.serviceCode === "string" ? payload.serviceCode : "";
  const targetMinutes = Number(payload.targetMinutes);
  const active = payload.active !== false;
  if (
    !code ||
    !Number.isInteger(targetMinutes) ||
    targetMinutes < 1 ||
    targetMinutes > 60
  )
    throw new QueueError(
      "Service target must be between 1 and 60 minutes.",
      400,
    );
  const current = await db
    .prepare(
      "SELECT name FROM qms_service_configuration WHERE branch_code=? AND code=?",
    )
    .bind(actor.branchCode, code)
    .first<{ name: string }>();
  if (!current) throw new QueueError("Service not found.", 404);
  if (!active) {
    const inUse = await db
      .prepare(
        `SELECT id FROM qms_demo_tickets WHERE branch_code=? AND service_code=?
         AND status IN ('RESERVED','WAITING','CALLED','IN_SERVICE') LIMIT 1`,
      )
      .bind(actor.branchCode, code)
      .first();
    if (inUse)
      throw new QueueError(
        "Resolve this service's active queue before deactivating it.",
        409,
        "QUEUE_CONFLICT",
      );
  }
  await db
    .prepare(
      `UPDATE qms_service_configuration
       SET target_minutes=?, priority_enabled=0, active=?
       WHERE branch_code=? AND code=?`,
    )
    .bind(targetMinutes, active ? 1 : 0, actor.branchCode, code)
    .run();
  await appendAudit(
    actor,
    "admin.service_configuration",
    `${code}: target ${targetMinutes} minutes, ${active ? "active" : "inactive"}`,
  );
  return protectedSnapshot(actor);
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new QueueError(
        "This request origin is not allowed.",
        403,
        "FORBIDDEN",
      );
    if (Number(request.headers.get("content-length") ?? 0) > 16_384)
      throw new QueueError("Request too large.", 413);
    const payload = (await request.json()) as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new QueueError("Invalid request.", 400);
    const workflow = new TicketWorkflowService();
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) await workflow.throttle(await sha256Hex(ip), "network", 240);
    switch (payload.operation) {
      case "customer_statement":
        return await exportCustomerStatement(
          payload,
          await customerSubject(request),
        );
      case "issue": {
        const subject = await customerSubject(request);
        const result = await workflow.issue(payload, subject);
        return json(
          {
            ...result,
            snapshot: publicSnapshot(
              await readSnapshot(getShowcaseDb(), result.ticket.branch_code),
              "kiosk",
            ),
          },
          result.replayed ? 200 : 201,
        );
      }
      case "lookup": {
        const subject = await customerSubject(request);
        await workflow.throttle(subject, "lookup", 90);
        return json(
          await workflow.lookup(
            String(payload.ticketId ?? ""),
            payload.lookupToken,
            subject,
          ),
        );
      }
      case "check_in":
        return json(
          await workflow.checkIn(payload, await customerSubject(request)),
        );
      case "transition": {
        if (payload.action === "cancel")
          return json(
            await workflow.cancel(payload, await customerSubject(request)),
          );
        return json(
          await workflow.staffAction(
            payload,
            await requireActor(request, "TELLER"),
          ),
        );
      }
      case "call_next":
      case "transfer":
        return json(
          await workflow.staffAction(
            payload,
            await requireActor(request, "TELLER"),
          ),
        );
      case "counter":
        return json(
          await workflow.counter(
            String(payload.action),
            await requireActor(request, "TELLER"),
          ),
        );
      case "arrival_code": {
        const actor = await requireAnyActor(request, ["TELLER", "MANAGER"]);
        return json(await workflow.arrivalCode(actor.branchCode, actor));
      }
      case "admin_staff_update": {
        const actor = await requireActor(request, "ADMIN");
        return json({ snapshot: await updateStaffAssignment(payload, actor) });
      }
      case "admin_service_update": {
        const actor = await requireActor(request, "ADMIN");
        return json({
          snapshot: await updateServiceConfiguration(payload, actor),
        });
      }
      case "admin_revoke_teller_sessions": {
        const actor = await requireActor(request, "ADMIN");
        const now = new Date().toISOString();
        await getShowcaseDb()
          .prepare(
            `UPDATE qms_demo_sessions SET revoked_at=? WHERE revoked_at IS NULL
             AND staff_id IN (SELECT id FROM qms_demo_staff WHERE branch_code=? AND role='TELLER')`,
          )
          .bind(now, actor.branchCode)
          .run();
        await appendAudit(
          actor,
          "admin.sessions_revoked",
          "All active teller authentication sessions revoked",
        );
        return json({ snapshot: await protectedSnapshot(actor) });
      }
      case "export_csv":
        return await exportDailyCsv(
          payload,
          await requireActor(request, "MANAGER"),
        );
      case "audit": {
        const actor = await requireActor(request, "ADMIN");
        const rows = await getShowcaseDb()
          .prepare(
            "SELECT id,action,detail,created_at FROM qms_demo_audit WHERE branch_code=? ORDER BY created_at DESC LIMIT 100",
          )
          .bind(actor.branchCode)
          .all();
        return json({ entries: rows.results ?? [] });
      }
      case "reset": {
        await requireActor(request, "ADMIN");
        throw new QueueError(
          "Operational records are retained. Use the documented local demo reset procedure.",
          409,
        );
      }
      default:
        return error("Unknown operation.");
    }
  } catch (caught) {
    return handleError(caught);
  }
}
