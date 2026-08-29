import {
  authenticate,
  createSession,
  getActor,
  getWorkspaceShowcaseActor,
  revokeSession,
} from "@/lib/showcase-auth";

export const dynamic = "force-dynamic";

function genericFailure() {
  return Response.json(
    { error: "Unable to sign in with those credentials." },
    { status: 401 },
  );
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
      const cookie = await revokeSession(request, actor);
      return Response.json(
        { success: true },
        { headers: { "Set-Cookie": cookie } },
      );
    }
    if (body.action === "workspace_showcase") {
      const workspaceUser = request.headers.get("oai-authenticated-user-email");
      if (!workspaceUser)
        return Response.json(
          { error: "Private showcase authentication is required." },
          { status: 403 },
        );
      const role = body.role === "MANAGER" ? "MANAGER" : "TELLER";
      const actor = await getWorkspaceShowcaseActor(role);
      if (!actor) return genericFailure();
      const session = await createSession(actor);
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
    const session = await createSession(actor);
    return Response.json(
      { actor, expiresAt: session.expiresAt },
      { headers: { "Set-Cookie": session.cookie } },
    );
  } catch (error) {
    console.error("Bank QMS staff authentication service failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return Response.json(
      { error: "The sign-in service is temporarily unavailable. Try again." },
      { status: 503 },
    );
  }
}
