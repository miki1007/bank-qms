import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { SqliteD1 } from "./sqlite-d1";
import { env } from "./worker-env";
import { TicketWorkflowService } from "../../../../lib/showcase-ticket-workflow";
import {
  ensureShowcaseStaff,
  createSession,
  type ShowcaseActor,
} from "../../../../lib/showcase-auth";
import {
  readCustomerPortfolio,
  readSnapshot,
  publicSnapshot,
} from "../../../../lib/showcase-adapter";
import { GET, POST } from "../../../../app/api/showcase/route";
import { POST as AUTH_POST } from "../../../../app/api/showcase/auth/route";

let db: SqliteD1, workflow: TicketWorkflowService;
const teller: ShowcaseActor = {
  id: "showcase-teller",
  username: "teller.one",
  displayName: "Demo Teller",
  role: "TELLER",
  assignedCounter: "Counter 1",
  assignedServiceCode: "DEP",
  branchCode: "SUMMIT",
};
const manager: ShowcaseActor = {
  id: "showcase-manager",
  username: "manager.dev",
  displayName: "Demo Manager",
  role: "MANAGER",
  assignedCounter: null,
  assignedServiceCode: null,
  branchCode: "SUMMIT",
};
function intent(extra: Record<string, unknown> = {}) {
  return {
    branchCode: "SUMMIT",
    serviceCode: "DEP",
    channel: "REMOTE",
    idempotencyKey: randomUUID(),
    lookupToken: randomUUID() + randomUUID(),
    priority: false,
    ...extra,
  };
}
const staffAction = (
  operation: string,
  extra: Record<string, unknown> = {},
) => ({ operation, idempotencyKey: randomUUID(), ...extra });
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T08:00:00Z"));
  db = new SqliteD1();
  env.DB = db;
  workflow = new TicketWorkflowService(db as never);
  await ensureShowcaseStaff(db as never);
});
afterEach(() => {
  db.sql.close();
  vi.useRealTimers();
});

describe("WorldLink hosted workflow on real SQLite with all migrations", () => {
  it("allocates ticket numbers per branch and local day; retry returns the same receipt", async () => {
    const payload = intent();
    const first = await workflow.issue(payload, "alice");
    const retry = await workflow.issue(payload, "alice");
    expect(first.ticket.public_number).toBe("DEP-001");
    expect(retry.ticket.id).toBe(first.ticket.id);
    expect(retry.lookupToken).toBe(first.lookupToken);
    expect(
      (await workflow.issue(intent({ branchCode: "CMC" }), "alice")).ticket
        .public_number,
    ).toBe("DEP-001");
    vi.setSystemTime(new Date("2026-09-09T08:00:00Z"));
    expect((await workflow.issue(intent(), "alice")).ticket.public_number).toBe(
      "DEP-001",
    );
    expect(
      db.sql.prepare("SELECT COUNT(*) AS count FROM qms_demo_tickets").get()
        ?.count,
    ).toBe(3);
    await expect(
      workflow.issue({ ...payload, serviceCode: "WDR" }, "alice"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT" });
  });
  it("preserves booking order after on-time check-in and skips absent reservations", async () => {
    const first = await workflow.issue(intent(), "alice");
    vi.advanceTimersByTime(1000);
    const walkin = await workflow.issue(intent({ channel: "KIOSK" }), "lobby");
    await workflow.counter("open", teller);
    const called = await workflow.staffAction(staffAction("call_next"), teller);
    expect(called.ticket.id).toBe(walkin.ticket.id);
    const code = await workflow.arrivalCode("SUMMIT", teller);
    const arrived = await workflow.checkIn(
      { ticketId: first.ticket.id, arrivalCode: code.code },
      "alice",
    );
    expect(arrived.ticket.queue_entered_at).toBe(first.ticket.queue_entered_at);
    await expect(
      workflow.staffAction(staffAction("call_next"), teller),
    ).rejects.toThrow(/unresolved/);
    await workflow.staffAction(
      staffAction("transition", {
        action: "start",
        ticketId: walkin.ticket.id,
      }),
      teller,
    );
    await workflow.staffAction(
      staffAction("transition", {
        action: "complete",
        ticketId: walkin.ticket.id,
      }),
      teller,
    );
    const next = await workflow.staffAction(staffAction("call_next"), teller);
    expect(next.ticket.id).toBe(first.ticket.id);
  });
  it("keeps an early remote booking ahead of a later waiting walk-in after check-in", async () => {
    const first = await workflow.issue(intent(), "alice");
    vi.advanceTimersByTime(1000);
    const later = await workflow.issue(intent({ channel: "KIOSK" }), "lobby");
    const code = await workflow.arrivalCode("SUMMIT", teller);
    await workflow.checkIn(
      { ticketId: first.ticket.id, arrivalCode: code.code },
      "alice",
    );
    await workflow.counter("open", teller);
    expect(
      (await workflow.staffAction(staffAction("call_next"), teller)).ticket.id,
    ).toBe(first.ticket.id);
    expect(
      (await workflow.lookup(later.ticket.id, later.lookupToken)).ticket.status,
    ).toBe("WAITING");
  });
  it("rejects wrong arrival codes and expires late reservations without reviving them", async () => {
    const issued = await workflow.issue(intent(), "alice");
    await expect(
      workflow.checkIn(
        { ticketId: issued.ticket.id, arrivalCode: "000000" },
        "alice",
      ),
    ).rejects.toMatchObject({ code: "INVALID_ARRIVAL_CODE" });
    vi.advanceTimersByTime(11 * 60_000);
    expect(
      (await workflow.lookup(issued.ticket.id, issued.lookupToken)).ticket
        .status,
    ).toBe("EXPIRED");
    const code = await workflow.arrivalCode("SUMMIT", teller);
    await expect(
      workflow.checkIn(
        { ticketId: issued.ticket.id, arrivalCode: code.code },
        "alice",
      ),
    ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
    expect(
      db.sql
        .prepare(
          "SELECT COUNT(*) AS count FROM qms_demo_events WHERE type='ticket.expired'",
        )
        .get()?.count,
    ).toBe(1);
  });
  it("enforces one active reservation, a daily cap and cancellation cooldown", async () => {
    const issued = await workflow.issue(intent(), "alice");
    await expect(workflow.issue(intent(), "alice")).rejects.toMatchObject({
      code: "ACTIVE_TICKET_EXISTS",
    });
    await workflow.cancel({ ticketId: issued.ticket.id }, "alice");
    await expect(workflow.issue(intent(), "alice")).rejects.toMatchObject({
      code: "CANCELLATION_COOLDOWN",
    });
    vi.advanceTimersByTime(601_000);
    const second = await workflow.issue(intent(), "alice");
    await workflow.cancel({ ticketId: second.ticket.id }, "alice");
    vi.advanceTimersByTime(601_000);
    const third = await workflow.issue(intent(), "alice");
    await workflow.cancel({ ticketId: third.ticket.id }, "alice");
    vi.advanceTimersByTime(601_000);
    await expect(workflow.issue(intent(), "alice")).rejects.toMatchObject({
      code: "DAILY_LIMIT",
    });
  });
  it("requires staff priority approval and calls standard after two priorities", async () => {
    const standard = await workflow.issue(
      intent({ channel: "KIOSK" }),
      "lobby",
    );
    const priorities = [];
    for (let n = 0; n < 3; n++) {
      vi.advanceTimersByTime(10);
      const item = await workflow.issue(
        intent({ channel: "KIOSK", priority: true, priorityReason: "ELDERLY" }),
        `lobby-${n}`,
      );
      expect(item.ticket.priority).toBe(0);
      await workflow.approvePriority(item.ticket.id, manager);
      priorities.push(item);
    }
    await workflow.counter("open", teller);
    const order = [];
    for (let n = 0; n < 4; n++) {
      const item = await workflow.staffAction(staffAction("call_next"), teller);
      order.push(item.ticket.id);
      await workflow.staffAction(
        staffAction("transition", {
          action: "start",
          ticketId: item.ticket.id,
        }),
        teller,
      );
      await workflow.staffAction(
        staffAction("transition", {
          action: "complete",
          ticketId: item.ticket.id,
        }),
        teller,
      );
    }
    expect(order).toEqual([
      priorities[0].ticket.id,
      priorities[1].ticket.id,
      standard.ticket.id,
      priorities[2].ticket.id,
    ]);
  });
  it("enforces session ownership, terminal states, recall time and safe transfer", async () => {
    const first = await workflow.issue(intent({ channel: "KIOSK" }), "lobby");
    await expect(
      workflow.staffAction(staffAction("call_next"), teller),
    ).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    await workflow.counter("open", teller);
    const called = await workflow.staffAction(staffAction("call_next"), teller);
    vi.advanceTimersByTime(10_000);
    const recalled = await workflow.staffAction(
      staffAction("transition", {
        action: "recall",
        ticketId: first.ticket.id,
      }),
      teller,
    );
    expect(recalled.ticket.called_at).toBe(called.ticket.called_at);
    await expect(workflow.counter("close", teller)).rejects.toMatchObject({
      code: "COUNTER_BUSY",
    });
    const transfer = await workflow.staffAction(
      staffAction("transfer", {
        ticketId: first.ticket.id,
        serviceCode: "LON",
      }),
      teller,
    );
    expect(transfer.ticket.counter).toBeNull();
    expect(transfer.ticket.service_code).toBe("LON");
    await workflow.cancel({
      ticketId: first.ticket.id,
      lookupToken: first.lookupToken,
    });
    await expect(
      workflow.staffAction(
        staffAction("transition", {
          action: "start",
          ticketId: first.ticket.id,
        }),
        teller,
      ),
    ).rejects.toThrow();
  });
  it("requeues no-shows at the back and records one event on retried action", async () => {
    const first = await workflow.issue(intent({ channel: "KIOSK" }), "lobby-a");
    vi.advanceTimersByTime(1000);
    const second = await workflow.issue(
      intent({ channel: "KIOSK" }),
      "lobby-b",
    );
    await workflow.counter("open", teller);
    await workflow.staffAction(staffAction("call_next"), teller);
    vi.advanceTimersByTime(121000);
    const action = staffAction("transition", {
      action: "no_show",
      ticketId: first.ticket.id,
    });
    await workflow.staffAction(action, teller);
    await workflow.staffAction(action, teller);
    expect(
      (await workflow.staffAction(staffAction("call_next"), teller)).ticket.id,
    ).toBe(second.ticket.id);
    expect(
      db.sql
        .prepare("SELECT no_show_count FROM qms_demo_tickets WHERE id=?")
        .get(first.ticket.id)?.no_show_count,
    ).toBe(1);
  });
  it("keeps branch data and private fields out of public display payloads", async () => {
    await workflow.issue(intent({ branchCode: "CMC" }), "alice");
    await workflow.issue(
      intent({ channel: "KIOSK", priority: true, priorityReason: "PREGNANCY" }),
      "lobby",
    );
    await workflow.counter("open", teller);
    await workflow.staffAction(staffAction("call_next"), teller);
    const data = publicSnapshot(
      await readSnapshot(db as never, "SUMMIT"),
      "display",
    );
    const serialized = JSON.stringify(data);
    for (const field of [
      "priority_reason",
      "priority_requested",
      "lookup_token_hash",
      "customer_subject",
      "PREGNANCY",
      "password",
      "token",
    ])
      expect(serialized).not.toContain(field);
    expect(data.tickets).toHaveLength(1);
    expect(data.branch.code).toBe("SUMMIT");
  });
  it("keeps synthetic customer portfolios identity-scoped and read-only", async () => {
    const alice = await readCustomerPortfolio("customer-alice", db as never);
    const aliceAgain = await readCustomerPortfolio(
      "customer-alice",
      db as never,
    );
    const bob = await readCustomerPortfolio("customer-bob", db as never);

    expect(alice.accounts).toHaveLength(2);
    expect(alice.transactions.length).toBeGreaterThan(2);
    expect(aliceAgain.accounts.map((account) => account.id)).toEqual(
      alice.accounts.map((account) => account.id),
    );
    expect(
      db.sql
        .prepare("SELECT COUNT(*) AS count FROM qms_customer_accounts")
        .get()?.count,
    ).toBe(4);
    expect(
      alice.accounts.every((account) =>
        account.masked_number.startsWith("•••• "),
      ),
    ).toBe(true);
    expect(bob.accounts.map((account) => account.id)).not.toEqual(
      alice.accounts.map((account) => account.id),
    );
    expect(JSON.stringify(alice)).not.toContain("customer_subject");
    expect(alice.disclaimer).toMatch(/demonstration/i);
  });
  it("creates a customer ticket through the real route and returns its account-owned history", async () => {
    const created = await POST(
      new Request("https://terminal.local/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "issue", ...intent() }),
      }),
    );
    expect(created.status).toBe(201);
    const receipt = (await created.json()) as {
      ticket: { public_number: string; status: string };
      lookupToken: string;
    };
    expect(receipt.ticket.public_number).toBe("DEP-001");
    expect(receipt.ticket.status).toBe("RESERVED");
    expect(receipt.lookupToken.length).toBeGreaterThan(31);

    const history = await GET(
      new Request(
        "https://terminal.local/api/showcase?surface=customer-history",
      ),
    );
    expect(history.status).toBe(200);
    expect(
      ((await history.json()) as { tickets: unknown[] }).tickets,
    ).toHaveLength(1);
  });
  it("requires logout before a manager session can become a teller session", async () => {
    const managerSession = await createSession(manager);
    const oldCookie = managerSession.cookie.split(";")[0];
    const switched = await AUTH_POST(
      new Request("https://terminal.local/api/showcase/auth", {
        method: "POST",
        headers: { cookie: oldCookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "workspace_showcase",
          role: "TELLER",
          username: "teller.one",
        }),
      }),
    );
    expect(switched.status).toBe(409);
    expect((await switched.json()).code).toBe("LOGOUT_REQUIRED");
    expect(switched.headers.get("set-cookie")).toBeNull();

    const managerWorkspace = await GET(
      new Request("https://qms.test/api/showcase?surface=manager", {
        headers: { cookie: oldCookie },
      }),
    );
    expect(managerWorkspace.status).toBe(200);

    const loggedOut = await AUTH_POST(
      new Request("https://terminal.local/api/showcase/auth", {
        method: "POST",
        headers: { cookie: oldCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      }),
    );
    expect(loggedOut.status).toBe(200);

    const tellerLogin = await AUTH_POST(
      new Request("https://terminal.local/api/showcase/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "workspace_showcase",
          role: "TELLER",
          username: "teller.one",
        }),
      }),
    );
    expect(tellerLogin.status).toBe(200);
    expect(
      ((await tellerLogin.json()) as { actor: ShowcaseActor }).actor.role,
    ).toBe("TELLER");
  });
  it("keeps a teller signed in until an active customer is resolved", async () => {
    const issued = await workflow.issue(intent({ channel: "KIOSK" }), "lobby");
    await workflow.counter("open", teller);
    await workflow.staffAction(staffAction("call_next"), teller);
    const session = await createSession(teller);
    const cookie = session.cookie.split(";")[0];

    const blocked = await AUTH_POST(
      new Request("https://terminal.local/api/showcase/auth", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      }),
    );
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe("COUNTER_BUSY");
    expect(
      await GET(
        new Request("https://qms.test/api/showcase?surface=teller", {
          headers: { cookie },
        }),
      ),
    ).toMatchObject({ status: 200 });

    await workflow.staffAction(
      staffAction("transition", {
        action: "start",
        ticketId: issued.ticket.id,
      }),
      teller,
    );
    await workflow.staffAction(
      staffAction("transition", {
        action: "complete",
        ticketId: issued.ticket.id,
      }),
      teller,
    );
    const completed = await AUTH_POST(
      new Request("https://terminal.local/api/showcase/auth", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      }),
    );
    expect(completed.status).toBe(200);
    expect(
      db.sql
        .prepare(
          "SELECT status FROM qms_counter_operations WHERE branch_code=? AND counter=?",
        )
        .get("SUMMIT", "Counter 1")?.status,
    ).toBe("CLOSED");
  });
  it("denies teller manager APIs and cross-branch access; audits CSV export", async () => {
    const session = await createSession(teller);
    const cookie = session.cookie.split(";")[0];
    const cross = await GET(
      new Request("https://qms.test/api/showcase?surface=teller&branch=CMC", {
        headers: { cookie },
      }),
    );
    expect(cross.status).toBe(403);
    const admin = await GET(
      new Request("https://qms.test/api/showcase?surface=admin", {
        headers: { cookie },
      }),
    );
    expect(admin.status).toBe(403);
    for (const operation of ["audit", "set_priority_limit", "export_csv"]) {
      const response = await POST(
        new Request("https://qms.test/api/showcase", {
          method: "POST",
          headers: { cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ operation, limit: 3 }),
        }),
      );
      expect(response.status).toBe(403);
    }
    const mgr = await createSession(manager);
    const managerCookie = mgr.cookie.split(";")[0];
    const tellerSurface = await GET(
      new Request("https://qms.test/api/showcase?surface=teller", {
        headers: { cookie: managerCookie },
      }),
    );
    expect(tellerSurface.status).toBe(403);
    const tellerAction = await POST(
      new Request("https://qms.test/api/showcase", {
        method: "POST",
        headers: {
          cookie: managerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(staffAction("call_next")),
      }),
    );
    expect(tellerAction.status).toBe(403);
    const result = await POST(
      new Request("https://qms.test/api/showcase", {
        method: "POST",
        headers: {
          cookie: managerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ operation: "export_csv" }),
      }),
    );
    expect(result.status).toBe(200);
    expect(await result.text()).toContain("Africa/Addis_Ababa");
    expect(
      db.sql
        .prepare(
          "SELECT COUNT(*) AS count FROM qms_demo_audit WHERE action='report.export'",
        )
        .get()?.count,
    ).toBe(1);
  });
  it("lets managers administer teller assignments and service policy with an audit trail", async () => {
    const session = await createSession(manager);
    const cookie = session.cookie.split(";")[0];
    const headers = { cookie, "Content-Type": "application/json" };

    const staffUpdate = await POST(
      new Request("https://qms.test/api/showcase", {
        method: "POST",
        headers,
        body: JSON.stringify({
          operation: "admin_staff_update",
          staffId: teller.id,
          assignedCounter: "Counter 1",
          assignedServiceCode: "LON",
          active: true,
        }),
      }),
    );
    expect(staffUpdate.status).toBe(200);
    expect(
      db.sql
        .prepare("SELECT assigned_service_code FROM qms_demo_staff WHERE id=?")
        .get(teller.id)?.assigned_service_code,
    ).toBe("LON");

    const serviceUpdate = await POST(
      new Request("https://qms.test/api/showcase", {
        method: "POST",
        headers,
        body: JSON.stringify({
          operation: "admin_service_update",
          serviceCode: "DEP",
          targetMinutes: 6,
          priorityEnabled: false,
          active: true,
        }),
      }),
    );
    expect(serviceUpdate.status).toBe(200);
    expect(
      db.sql
        .prepare(
          "SELECT target_minutes, priority_enabled FROM qms_service_configuration WHERE branch_code='SUMMIT' AND code='DEP'",
        )
        .get(),
    ).toEqual({ target_minutes: 6, priority_enabled: 0 });
    await expect(
      workflow.issue(
        intent({ priority: true, priorityReason: "ELDERLY" }),
        "customer-policy-test",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(
      db.sql
        .prepare(
          "SELECT COUNT(*) AS count FROM qms_demo_audit WHERE action LIKE 'admin.%'",
        )
        .get()?.count,
    ).toBe(2);
  });
  it("repeated parallel calls assign unique tickets and lose no waiting customers", async () => {
    for (let round = 0; round < 5; round++) {
      const tellers = Array.from({ length: 5 }, (_, index) => ({
        ...teller,
        id: `race-${round}-${index}`,
        assignedCounter: `Counter ${round * 5 + index + 10}`,
      }));
      for (const staff of tellers) {
        db.sql
          .prepare(
            "INSERT INTO qms_demo_staff(id,username,display_name,role,password_salt,password_hash,branch_code,assigned_counter) VALUES(?,?,?,'TELLER','test','test','SUMMIT',?)",
          )
          .run(staff.id, staff.id, staff.id, staff.assignedCounter);
        await workflow.counter("open", staff);
      }
      for (let index = 0; index < 20; index++)
        await workflow.issue(
          intent({ channel: "KIOSK" }),
          `race-${round}-${index}`,
        );
      for (let batch = 0; batch < 4; batch++) {
        const called = await Promise.all(
          tellers.map((staff) =>
            workflow.staffAction(staffAction("call_next"), staff),
          ),
        );
        expect(new Set(called.map((item) => item.ticket.id)).size).toBe(5);
        for (let index = 0; index < 5; index++) {
          await workflow.staffAction(
            staffAction("transition", {
              action: "start",
              ticketId: called[index].ticket.id,
            }),
            tellers[index],
          );
          await workflow.staffAction(
            staffAction("transition", {
              action: "complete",
              ticketId: called[index].ticket.id,
            }),
            tellers[index],
          );
        }
      }
      expect(
        db.sql
          .prepare(
            "SELECT COUNT(*) AS count FROM qms_demo_tickets WHERE status='WAITING'",
          )
          .get()?.count,
      ).toBe(0);
    }
    expect(
      db.sql
        .prepare(
          "SELECT COUNT(*) AS count FROM qms_demo_tickets WHERE status='COMPLETED'",
        )
        .get()?.count,
    ).toBe(100);
  });
});
