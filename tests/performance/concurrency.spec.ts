import { describe, expect, it } from "vitest";

const run = process.env.RUN_DATABASE_TESTS === "1";
const apiUrl = process.env.E2E_API_URL ?? "http://localhost:3000/api/v1";
const tellerPassword = process.env.DEV_TELLER_PASSWORD ?? "";
const managerPassword = process.env.DEV_MANAGER_PASSWORD ?? "";
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
    const managerLogin = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "manager.dev",
        password: managerPassword,
      }),
    });
    const managerToken = (await managerLogin.json()).accessToken as string;
    const managerHeaders = {
      Authorization: `Bearer ${managerToken}`,
      "content-type": "application/json",
    };
    const servicesResponse = await fetch(`${apiUrl}/manager/services`, {
      headers: managerHeaders,
    });
    const services = (await servicesResponse.json()) as Array<{
      id: string;
      code: string;
    }>;
    const deposit = services.find((service) => service.code === "DEP")!;
    const countersResponse = await fetch(`${apiUrl}/manager/counters`, {
      headers: managerHeaders,
    });
    const counters = (await countersResponse.json()) as Array<{ id: string }>;
    for (const counter of counters.slice(0, 3))
      await fetch(`${apiUrl}/manager/counters/${counter.id}/assign-service`, {
        method: "POST",
        headers: managerHeaders,
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

    const retryKey = crypto.randomUUID();
    const retries = await Promise.all(
      Array.from({ length: 10 }, () => createTicket(retryKey)),
    );
    const retryTickets = await Promise.all(
      retries.map(async (response) => {
        expect(response.ok).toBe(true);
        return (await response.json()).ticket as {
          id: string;
          publicNumber: string;
          lookupCode?: string;
          lookupToken?: string;
        };
      }),
    );
    expect(new Set(retryTickets.map((ticket) => ticket.id)).size).toBe(1);
    await fetch(`${apiUrl}/public/tickets/${retryTickets[0].id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branchCode: "MAIN",
        publicNumber: retryTickets[0].publicNumber,
        lookupCode: retryTickets[0].lookupCode,
        lookupToken: retryTickets[0].lookupToken,
      }),
    });
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
    expect((await createTicket(crypto.randomUUID())).ok).toBe(true);
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
    await fetch(`${apiUrl}/teller/tickets/${firstCalledTicket.id}/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens[0]}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    await fetch(`${apiUrl}/teller/tickets/${firstCalledTicket.id}/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens[0]}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    const assigned = new Set<string>();
    for (let trial = 0; trial < 3; trial += 1) {
      const created = await Promise.all(
        Array.from({ length: 21 }, (_, index) =>
          createTicket(crypto.randomUUID(), index % 3 === 0),
        ),
      );
      expect(created.every((response) => response.ok)).toBe(true);
      for (let round = 0; round < 7; round += 1) {
        const responses = await Promise.all(
          tokens.map(async (token) => ({ token, response: await call(token) })),
        );
        for (const { token, response } of responses) {
          expect(response.ok).toBeTruthy();
          const ticket = (await response.json()).ticket;
          expect(assigned.has(ticket.id)).toBe(false);
          assigned.add(ticket.id);
          await fetch(`${apiUrl}/teller/tickets/${ticket.id}/start`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Idempotency-Key": crypto.randomUUID(),
            },
          });
          await fetch(`${apiUrl}/teller/tickets/${ticket.id}/complete`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Idempotency-Key": crypto.randomUUID(),
            },
          });
        }
      }
    }
    expect(assigned.size).toBe(63);
  });
});
