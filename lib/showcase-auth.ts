import { getShowcaseDb } from "@/lib/showcase-adapter";

export type ShowcaseRole = "TELLER" | "MANAGER";

export type ShowcaseActor = {
  id: string;
  username: string;
  displayName: string;
  role: ShowcaseRole;
};

const SESSION_COOKIE = "bank_qms_session";
const SESSION_SECONDS = 60 * 60 * 4;
// Cloudflare Workers WebCrypto currently rejects PBKDF2 counts above 100,000.
const PBKDF2_ITERATIONS = 100_000;

const showcaseStaff = [
  {
    id: "showcase-manager",
    username: "manager.dev",
    displayName: "Showcase Manager",
    role: "MANAGER" as const,
    salt: "42347debaf04f652d29a982200c05ba1",
    passwordHash:
      "356ccf97995de685fc013a028d680e0d0a2be0396026e1913e48532027d02af0",
  },
  {
    id: "showcase-teller",
    username: "teller.one",
    displayName: "Showcase Teller",
    role: "TELLER" as const,
    salt: "c6716fa6420014a4b1fb9a4f90d8fe8e",
    passwordHash:
      "083592b13334c36a10fc8880f9167cee0fcda8560469e4bf8ab841605314ca50",
  },
];

function fromHex(value: string) {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

function toHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string) {
  return toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function passwordHash(password: string, salt: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return toHex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: fromHex(salt),
        iterations: PBKDF2_ITERATIONS,
      },
      material,
      256,
    ),
  );
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function ensureShowcaseStaff(db = getShowcaseDb()) {
  for (const staff of showcaseStaff) {
    await db
      .prepare(
        `INSERT INTO qms_demo_staff
         (id, username, display_name, role, password_salt, password_hash, failed_login_count, active)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1)
         ON CONFLICT(username) DO UPDATE SET
           display_name = excluded.display_name,
           role = excluded.role,
           failed_login_count = CASE
             WHEN qms_demo_staff.password_salt <> excluded.password_salt
               OR qms_demo_staff.password_hash <> excluded.password_hash
             THEN 0 ELSE qms_demo_staff.failed_login_count END,
           locked_until = CASE
             WHEN qms_demo_staff.password_salt <> excluded.password_salt
               OR qms_demo_staff.password_hash <> excluded.password_hash
             THEN NULL ELSE qms_demo_staff.locked_until END,
           password_salt = excluded.password_salt,
           password_hash = excluded.password_hash,
           active = 1`,
      )
      .bind(
        staff.id,
        staff.username,
        staff.displayName,
        staff.role,
        staff.salt,
        staff.passwordHash,
      )
      .run();
  }
}

export async function getWorkspaceShowcaseActor(role: ShowcaseRole) {
  const db = getShowcaseDb();
  await ensureShowcaseStaff(db);
  const staff = showcaseStaff.find((candidate) => candidate.role === role);
  if (!staff) return null;
  const persisted = await db
    .prepare(
      `SELECT id, username, display_name, role
       FROM qms_demo_staff WHERE username = ? AND active = 1 LIMIT 1`,
    )
    .bind(staff.username)
    .first<{
      id: string;
      username: string;
      display_name: string;
      role: ShowcaseRole;
    }>();
  if (!persisted || persisted.role !== role) return null;
  return {
    id: persisted.id,
    username: persisted.username,
    displayName: persisted.display_name,
    role: persisted.role,
  } satisfies ShowcaseActor;
}

export async function authenticate(username: string, password: string) {
  const db = getShowcaseDb();
  await ensureShowcaseStaff(db);
  const normalized = username.trim().toLowerCase();
  const staff = await db
    .prepare(
      `SELECT id, username, display_name, role, password_salt, password_hash,
              failed_login_count, locked_until, active
       FROM qms_demo_staff WHERE username = ? LIMIT 1`,
    )
    .bind(normalized)
    .first<{
      id: string;
      username: string;
      display_name: string;
      role: ShowcaseRole;
      password_salt: string;
      password_hash: string;
      failed_login_count: number;
      locked_until: string | null;
      active: number;
    }>();

  const now = Date.now();
  if (
    !staff ||
    !staff.active ||
    (staff.locked_until && new Date(staff.locked_until).getTime() > now)
  ) {
    return null;
  }

  const derived = await passwordHash(password, staff.password_salt);
  if (!timingSafeEqual(derived, staff.password_hash)) {
    const failures = staff.failed_login_count + 1;
    const lockedUntil =
      failures >= 5 ? new Date(now + 5 * 60 * 1000).toISOString() : null;
    await db
      .prepare(
        "UPDATE qms_demo_staff SET failed_login_count=?, locked_until=? WHERE id=?",
      )
      .bind(failures >= 5 ? 0 : failures, lockedUntil, staff.id)
      .run();
    return null;
  }

  await db
    .prepare(
      "UPDATE qms_demo_staff SET failed_login_count=0, locked_until=NULL, last_login_at=? WHERE id=?",
    )
    .bind(new Date(now).toISOString(), staff.id)
    .run();
  return {
    id: staff.id,
    username: staff.username,
    displayName: staff.display_name,
    role: staff.role,
  } satisfies ShowcaseActor;
}

export async function createSession(actor: ShowcaseActor) {
  const db = getShowcaseDb();
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_SECONDS * 1000);
  await db
    .prepare(
      `INSERT INTO qms_demo_sessions
       (id, staff_id, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actor.id,
      tokenHash,
      createdAt.toISOString(),
      expiresAt.toISOString(),
    )
    .run();
  await appendAudit(actor, "auth.login", "Staff session opened");
  return {
    cookie: `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`,
    expiresAt: expiresAt.toISOString(),
  };
}

function readCookie(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=");
  }
  return null;
}

export async function getActor(
  request: Request,
): Promise<ShowcaseActor | null> {
  const token = readCookie(request);
  if (!token) return null;
  const db = getShowcaseDb();
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT staff.id, staff.username, staff.display_name, staff.role
       FROM qms_demo_sessions session
       JOIN qms_demo_staff staff ON staff.id = session.staff_id
       WHERE session.token_hash = ? AND session.revoked_at IS NULL
         AND session.expires_at > ? AND staff.active = 1
       LIMIT 1`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<{
      id: string;
      username: string;
      display_name: string;
      role: ShowcaseRole;
    }>();
  return row
    ? {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
      }
    : null;
}

export async function revokeSession(
  request: Request,
  actor: ShowcaseActor | null,
) {
  const token = readCookie(request);
  if (token) {
    const db = getShowcaseDb();
    await db
      .prepare(
        "UPDATE qms_demo_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
      )
      .bind(new Date().toISOString(), await sha256Hex(token))
      .run();
  }
  if (actor) await appendAudit(actor, "auth.logout", "Staff session closed");
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export async function appendAudit(
  actor: ShowcaseActor,
  action: string,
  detail: string,
) {
  const db = getShowcaseDb();
  await db
    .prepare(
      "INSERT INTO qms_demo_audit (id, staff_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      actor.id,
      action,
      detail,
      new Date().toISOString(),
    )
    .run();
}
