import {
  authenticate,
  createSession,
  getActor,
  getWorkspaceShowcaseActor,
  revokeSession,
} from "@/lib/showcase-auth";
import { getShowcaseDb } from "@/lib/showcase-adapter";
import {
  QueueError,
  TicketWorkflowService,
} from "@/lib/showcase-ticket-workflow";

export const dynamic = "force-dynamic";

function genericFailure() {
  return Response.json(
    { error: "Unable to sign in with those credentials." },
    { status: 401 },
  );
}

function logoutRequired() {
  return Response.json(
    {
      error:
        "Log out of the current workspace before signing in as another staff member.",
      code: "LOGOUT_REQUIRED",
    },
    { status: 409 },
  );
}

async function closeTellerCounterBeforeLogout(
  actor: Awaited<ReturnType<typeof getActor>>,
) {
  if (
    actor?.role !== "TELLER" ||
    !actor.assignedCounter ||
    !actor.assignedServiceCode
  )
    return;
  const operation = await getShowcaseDb()
    .prepare(
      `SELECT status FROM qms_counter_operations
       WHERE branch_code=? AND counter=? AND staff_id=? LIMIT 1`,
    )
    .bind(actor.branchCode, actor.assignedCounter, actor.id)
    .first<{ status: string }>();
  if (operation && ["OPEN", "PAUSED"].includes(operation.status))
    await new TicketWorkflowService().counter("close", actor);
}

export async function GET(request: Request) {
  const actor = await getActor(request);
  return actor
    ? Response.json({ actor })
    : Response.json({ error: "Authentication required." }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "logout") {
      const actor = await getActor(request);
      await closeTellerCounterBeforeLogout(actor);
      const cookie = await revokeSession(request, actor);
      return Response.json(
        { success: true },
        { headers: { "Set-Cookie": cookie } },
      );
    }
    if (body.action === "workspace_showcase") {
      const workspaceUser =
        request.headers.get("oai-authenticated-user-email") ??
        (new URL(request.url).hostname === "terminal.local"
          ? "local-preview@worldlink.test"
          : null);
      if (!workspaceUser)
        return Response.json(
          { error: "Private showcase authentication is required." },
          { status: 403 },
        );
      const role =
        body.role === "ADMIN"
          ? "ADMIN"
          : body.role === "MANAGER"
            ? "MANAGER"
            : body.role === "TELLER"
              ? "TELLER"
              : null;
      if (!role) return genericFailure();
      const requestedUsername =
        typeof body.username === "string" ? body.username : undefined;
      const actor = await getWorkspaceShowcaseActor(role, requestedUsername);
      if (!actor) return genericFailure();
      const currentActor = await getActor(request);
      if (currentActor?.id === actor.id) return Response.json({ actor });
      if (currentActor) return logoutRequired();
      const session = await createSession(
        actor,
        new URL(request.url).hostname !== "terminal.local",
      );
      return Response.json(
        { actor, expiresAt: session.expiresAt },
        { headers: { "Set-Cookie": session.cookie } },
      );
    }
    if (body.action !== "login") return genericFailure();
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) return genericFailure();
    const actor = await authenticate(username, password);
    if (!actor) return genericFailure();
    const currentActor = await getActor(request);
    if (currentActor?.id === actor.id) return Response.json({ actor });
    if (currentActor) return logoutRequired();
    const session = await createSession(
      actor,
      new URL(request.url).hostname !== "terminal.local",
    );
    return Response.json(
      { actor, expiresAt: session.expiresAt },
      { headers: { "Set-Cookie": session.cookie } },
    );
  } catch (error) {
    if (error instanceof QueueError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    console.error("Bank QMS staff authentication service failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json(
      { error: "The sign-in service is temporarily unavailable. Try again." },
      { status: 503 },
    );
  }
}
