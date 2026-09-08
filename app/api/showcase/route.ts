import {
  businessDate,
  getShowcaseDb,
  publicSnapshot,
  readSnapshot,
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

async function requireActor(request: Request, managerOnly = false) {
  const actor = await getActor(request);
  if (!actor)
    throw new QueueError(
      "Authentication required.",
      401,
      "AUTHENTICATION_FAILED",
    );
  if (managerOnly && actor.role !== "MANAGER")
    throw new QueueError("Manager permission required.", 403, "FORBIDDEN");
  return actor;
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
    const actor = await requireActor(request, surface === "manager");
    if (requested && requested !== actor.branchCode)
      throw new QueueError(
        "This branch is outside your staff assignment.",
        403,
        "FORBIDDEN",
      );
    return json({
      ...(await readSnapshot(getShowcaseDb(), actor.branchCode)),
      actor,
    });
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
      `SELECT public_number, business_date, service_code, service_name, priority, status, counter, created_at, checked_in_at, called_at, started_at, completed_at, channel, no_show_count
    FROM qms_demo_tickets WHERE branch_code=? AND business_date BETWEEN ? AND ? ORDER BY created_at ASC`,
    )
    .bind(actor.branchCode, from, to)
    .all<Record<string, unknown>>();
  const columns = [
    "public_number",
    "business_date",
    "service_code",
    "service_name",
    "priority",
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
          await workflow.staffAction(payload, await requireActor(request)),
        );
      }
      case "call_next":
      case "transfer":
        return json(
          await workflow.staffAction(payload, await requireActor(request)),
        );
      case "counter":
        return json(
          await workflow.counter(
            String(payload.action),
            await requireActor(request),
          ),
        );
      case "arrival_code": {
        const actor = await requireActor(request);
        return json(await workflow.arrivalCode(actor.branchCode, actor));
      }
      case "approve_priority":
        return json(
          await workflow.approvePriority(
            String(payload.ticketId ?? ""),
            await requireActor(request),
          ),
        );
      case "set_priority_limit": {
        const actor = await requireActor(request, true),
          limit = Number(payload.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 5)
          throw new QueueError("Priority limit must be between 1 and 5.", 400);
        await getShowcaseDb()
          .prepare("UPDATE qms_branches SET priority_limit=? WHERE code=?")
          .bind(limit, actor.branchCode)
          .run();
        await appendAudit(
          actor,
          "settings.priority_limit",
          `Priority limit set to ${limit}`,
        );
        return json({
          snapshot: {
            ...(await readSnapshot(getShowcaseDb(), actor.branchCode)),
            actor,
          },
        });
      }
      case "export_csv":
        return await exportDailyCsv(payload, await requireActor(request, true));
      case "audit": {
        const actor = await requireActor(request, true);
        const rows = await getShowcaseDb()
          .prepare(
            "SELECT id,action,detail,created_at FROM qms_demo_audit WHERE branch_code=? ORDER BY created_at DESC LIMIT 100",
          )
          .bind(actor.branchCode)
          .all();
        return json({ entries: rows.results ?? [] });
      }
      case "reset": {
        await requireActor(request, true);
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
