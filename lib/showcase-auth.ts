import { getShowcaseDb } from "@/lib/showcase-adapter";
import { BANK_BRANCHES, DEFAULT_BRANCH_CODE } from "@/lib/bank-brand";

export type ShowcaseRole = "TELLER" | "MANAGER";

export type ShowcaseActor = {
  id: string;
  username: string;
  displayName: string;
  role: ShowcaseRole;
  assignedCounter: string | null;
  assignedServiceCode: string | null;
  branchCode: string;
};

const SESSION_COOKIE = "bank_qms_session";
const SESSION_SECONDS = 60 * 60 * 4;
// Cloudflare Workers WebCrypto currently rejects PBKDF2 counts above 100,000.
const PBKDF2_ITERATIONS = 100_000;

const baseShowcaseStaff = [
  {
    id: "showcase-manager",
    username: "manager.dev",
    displayName: "Showcase Manager",
    role: "MANAGER" as const,
    assignedCounter: null,
    assignedServiceCode: null,
    salt: "42347debaf04f652d29a982200c05ba1",
    passwordHash:
      "356ccf97995de685fc013a028d680e0d0a2be0396026e1913e48532027d02af0",
  },
  {
    id: "showcase-teller",
    username: "teller.one",
    displayName: "Meron Tesfaye",
    role: "TELLER" as const,
    assignedCounter: "Counter 1",
    assignedServiceCode: "DEP",
    salt: "c6716fa6420014a4b1fb9a4f90d8fe8e",
    passwordHash:
      "083592b13334c36a10fc8880f9167cee0fcda8560469e4bf8ab841605314ca50",
  },
  {
    id: "showcase-teller-two",
    username: "teller.two",
    displayName: "Dawit Bekele",
    role: "TELLER" as const,
    assignedCounter: "Counter 2",
    assignedServiceCode: "WDR",
    salt: "c6716fa6420014a4b1fb9a4f90d8fe8e",
    passwordHash:
      "083592b13334c36a10fc8880f9167cee0fcda8560469e4bf8ab841605314ca50",
  },
  {
    id: "showcase-teller-three",
    username: "teller.three",
    displayName: "Hana Girma",
    role: "TELLER" as const,
    assignedCounter: "Counter 3",
    assignedServiceCode: "LON",
    salt: "c6716fa6420014a4b1fb9a4f90d8fe8e",
    passwordHash:
      "083592b13334c36a10fc8880f9167cee0fcda8560469e4bf8ab841605314ca50",
  },
  {
    id: "showcase-teller-four",
    username: "teller.four",
    displayName: "Selam Alemu",
    role: "TELLER" as const,
    assignedCounter: "Counter 4",
    assignedServiceCode: "NAC",
    salt: "c6716fa6420014a4b1fb9a4f90d8fe8e",
    passwordHash:
      "083592b13334c36a10fc8880f9167cee0fcda8560469e4bf8ab841605314ca50",
  },
];

const showcaseStaff = BANK_BRANCHES.flatMap((branch) =>
  baseShowcaseStaff.map((staff) => ({
    ...staff,
    id:
      branch.code === DEFAULT_BRANCH_CODE
        ? staff.id
        : `${staff.id}-${branch.code.toLowerCase()}`,
    username:
      branch.code === DEFAULT_BRANCH_CODE
        ? staff.username
        : `${staff.username}.${branch.code.toLowerCase()}`,
    branchCode: branch.code,
  })),
);

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
  await db.batch(
    showcaseStaff.map((staff) =>
      db
        .prepare(
          `INSERT INTO qms_demo_staff
         (id, username, display_name, role, assigned_counter, assigned_service_code, password_salt, password_hash, branch_code, failed_login_count, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
         ON CONFLICT(username) DO UPDATE SET
           assigned_service_code=COALESCE(qms_demo_staff.assigned_service_code, excluded.assigned_service_code)`,
        )
        .bind(
          staff.id,
          staff.username,
          staff.displayName,
          staff.role,
          staff.assignedCounter,
          staff.assignedServiceCode,
          staff.salt,
          staff.passwordHash,
          staff.branchCode,
        ),
    ),
  );
}

export async function getWorkspaceShowcaseActor(
  role: ShowcaseRole,
  requestedUsername?: string,
) {
  const db = getShowcaseDb();
  await ensureShowcaseStaff(db);
  const staff = showcaseStaff.find(
    (candidate) =>
      candidate.role === role &&
      (!requestedUsername || candidate.username === requestedUsername),
  );
  if (!staff) return null;
  const persisted = await db
    .prepare(
      `SELECT id, username, display_name, role, assigned_counter, assigned_service_code, branch_code
       FROM qms_demo_staff WHERE username = ? AND active = 1 LIMIT 1`,
    )
    .bind(staff.username)
    .first<{
      id: string;
      username: string;
      display_name: string;
      role: ShowcaseRole;
      assigned_counter: string | null;
      assigned_service_code: string | null;
      branch_code: string;
    }>();
  if (!persisted || persisted.role !== role) return null;
  return {
    id: persisted.id,
    username: persisted.username,
    displayName: persisted.display_name,
    role: persisted.role,
    assignedCounter: persisted.assigned_counter,
    assignedServiceCode: persisted.assigned_service_code,
    branchCode: persisted.branch_code,
  } satisfies ShowcaseActor;
}

export async function authenticate(username: string, password: string) {
  const db = getShowcaseDb();
  await ensureShowcaseStaff(db);
  const normalized = username.trim().toLowerCase();
  const staff = await db
    .prepare(
      `SELECT id, username, display_name, role, assigned_counter, assigned_service_code, branch_code, password_salt, password_hash,
              failed_login_count, locked_until, active
       FROM qms_demo_staff WHERE username = ? LIMIT 1`,
    )
    .bind(normalized)
    .first<{
      id: string;
      username: string;
      display_name: string;
      role: ShowcaseRole;
      assigned_counter: string | null;
      assigned_service_code: string | null;
      branch_code: string;
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
    assignedCounter: staff.assigned_counter,
    branchCode: staff.branch_code,
    assignedServiceCode: staff.assigned_service_code,
  } satisfies ShowcaseActor;
}

export async function createSession(actor: ShowcaseActor, secure = true) {
  const db = getShowcaseDb();
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_SECONDS * 1000);
  await db
    .prepare(
      "UPDATE qms_demo_sessions SET revoked_at=? WHERE staff_id=? AND revoked_at IS NULL",
    )
    .bind(createdAt.toISOString(), actor.id)
    .run();
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
    cookie: `${SESSION_COOKIE}=${token}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`,
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
      `SELECT staff.id, staff.username, staff.display_name, staff.role, staff.assigned_counter, staff.assigned_service_code, staff.branch_code
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
      assigned_counter: string | null;
      assigned_service_code: string | null;
      branch_code: string;
    }>();
  return row
    ? {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        assignedCounter: row.assigned_counter,
        branchCode: row.branch_code,
        assignedServiceCode: row.assigned_service_code,
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
  const secure = new URL(request.url).hostname !== "terminal.local";
  return `${SESSION_COOKIE}=; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=0`;
}

export async function appendAudit(
  actor: ShowcaseActor,
  action: string,
  detail: string,
) {
  const db = getShowcaseDb();
  await db
    .prepare(
      "INSERT INTO qms_demo_audit (id, staff_id, action, detail, created_at, branch_code) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      actor.id,
      action,
      detail,
      new Date().toISOString(),
      actor.branchCode,
    )
    .run();
}
