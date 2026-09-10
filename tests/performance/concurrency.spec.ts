import { describe, expect, it } from "vitest";

const run = process.env.RUN_DATABASE_TESTS === "1";
const apiUrl = process.env.E2E_API_URL ?? "http://localhost:3000/api/v1";
const tellerPassword = process.env.DEV_TELLER_PASSWORD ?? "";
const adminPassword = process.env.DEV_ADMIN_PASSWORD ?? "";
const kioskSecret = process.env.KIOSK_DEVICE_SECRET ?? "";

describe.skipIf(!run)("real PostgreSQL Call Next concurrency", () => {
  it("assigns unique tickets over repeated simultaneous calls", async () => {
    const login = async (username: string) => {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password: tellerPassword }),
      });
      return (await response.json()).accessToken as string;
    };
    const adminLogin = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "admin.dev",
        password: adminPassword,
      }),
    });
    const adminToken = (await adminLogin.json()).accessToken as string;
    const adminHeaders = {
      Authorization: `Bearer ${adminToken}`,
      "content-type": "application/json",
    };
    const servicesResponse = await fetch(`${apiUrl}/admin/services`, {
      headers: adminHeaders,
    });
    const services = (await servicesResponse.json()) as Array<{
      id: string;
      code: string;
    }>;
    const deposit = services.find((service) => service.code === "DEP")!;
    const countersResponse = await fetch(`${apiUrl}/admin/counters`, {
      headers: adminHeaders,
    });
    const counters = (await countersResponse.json()) as Array<{ id: string }>;
    for (const counter of counters.slice(0, 3))
      await fetch(`${apiUrl}/admin/counters/${counter.id}/assign-service`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ serviceTypeId: deposit.id }),
      });
    const createTicket = (idempotencyKey: string, priority = false) =>
      fetch(`${apiUrl}/public/branches/MAIN/tickets`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-device-code": "MAIN-KIOSK-01",
          "x-device-secret": kioskSecret,
        },
        body: JSON.stringify({
          serviceTypeId: deposit.id,
          priority,
          priorityReason: priority ? "ELDERLY" : null,
          idempotencyKey,
        }),
      });

    const createdResponses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createTicket(crypto.randomUUID(), index % 3 === 0),
      ),
    );
    expect(createdResponses.every((response) => response.ok)).toBe(true);
    const createdTickets = await Promise.all(
      createdResponses.map(
        async (response) => (await response.json()).ticket as { id: string },
      ),
    );
    expect(new Set(createdTickets.map((ticket) => ticket.id)).size).toBe(20);
    const tokens = await Promise.all(
      ["teller.one", "teller.two", "teller.three"].map(login),
    );
    await Promise.all(
      tokens.map((token, index) =>
        fetch(`${apiUrl}/teller/counter-sessions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ counterId: counters[index].id }),
        }),
      ),
    );
    const call = (token: string, idempotencyKey = crypto.randomUUID()) =>
      fetch(`${apiUrl}/teller/tickets/call-next`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
      });
    const assigned = new Set<string>();
    const callRetryKey = crypto.randomUUID();
    const firstCall = await call(tokens[0], callRetryKey);
    const retriedCall = await call(tokens[0], callRetryKey);
    expect(firstCall.ok).toBe(true);
    expect(retriedCall.ok).toBe(true);
    const firstCalledTicket = (await firstCall.json()).ticket as { id: string };
    const replayed = (await retriedCall.json()) as {
      ticket: { id: string };
      idempotentReplay: boolean;
    };
    expect(replayed.ticket.id).toBe(firstCalledTicket.id);
    expect(replayed.idempotentReplay).toBe(true);
    assigned.add(firstCalledTicket.id);
    const firstStart = await fetch(
      `${apiUrl}/teller/tickets/${firstCalledTicket.id}/start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens[0]}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
      },
    );
    expect(firstStart.ok).toBe(true);
    const firstComplete = await fetch(
      `${apiUrl}/teller/tickets/${firstCalledTicket.id}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens[0]}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
      },
    );
    expect(firstComplete.ok).toBe(true);

    for (let round = 0; round < 6; round += 1) {
      const responses = await Promise.all(
        tokens.map(async (token) => ({ token, response: await call(token) })),
      );
      for (const { token, response } of responses) {
        expect(response.ok).toBeTruthy();
        const ticket = (await response.json()).ticket as { id: string };
        expect(assigned.has(ticket.id)).toBe(false);
        assigned.add(ticket.id);
        const started = await fetch(
          `${apiUrl}/teller/tickets/${ticket.id}/start`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Idempotency-Key": crypto.randomUUID(),
            },
          },
        );
        expect(started.ok).toBe(true);
        const completed = await fetch(
          `${apiUrl}/teller/tickets/${ticket.id}/complete`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Idempotency-Key": crypto.randomUUID(),
            },
          },
        );
        expect(completed.ok).toBe(true);
      }
    }

    const finalCall = await call(tokens[0]);
    expect(finalCall.ok).toBe(true);
    const finalTicket = (await finalCall.json()).ticket as { id: string };
    expect(assigned.has(finalTicket.id)).toBe(false);
    assigned.add(finalTicket.id);
    const finalStart = await fetch(
      `${apiUrl}/teller/tickets/${finalTicket.id}/start`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens[0]}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
      },
    );
    expect(finalStart.ok).toBe(true);
    const finalComplete = await fetch(
      `${apiUrl}/teller/tickets/${finalTicket.id}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens[0]}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
      },
    );
    expect(finalComplete.ok).toBe(true);
    expect(assigned.size).toBe(20);
    expect(createdTickets.every((ticket) => assigned.has(ticket.id))).toBe(
      true,
    );
  });
});
