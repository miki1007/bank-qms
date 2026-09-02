import { expect, test, type APIRequestContext } from "@playwright/test";

const apiUrl = process.env.E2E_API_URL ?? "http://localhost:3000/api/v1";
const tellerPassword = process.env.DEV_TELLER_PASSWORD ?? "";
const managerPassword = process.env.DEV_MANAGER_PASSWORD ?? "";

async function login(
  request: APIRequestContext,
  username: string,
  password: string,
) {
  const response = await request.post(`${apiUrl}/auth/login`, {
    data: { username, password },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).accessToken as string;
}

test("teller login is isolated from manager endpoints", async ({ request }) => {
  const token = await login(request, "teller.one", tellerPassword);
  for (const path of [
    "/manager/staff",
    "/manager/services",
    "/manager/reports/summary",
    "/manager/audit-logs",
  ]) {
    const response = await request.get(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(403);
  }
});

test("each teller can open only the manager-assigned counter", async ({
  request,
}) => {
  const tellerToken = await login(request, "teller.one", tellerPassword);
  const managerToken = await login(request, "manager.dev", managerPassword);
  const tellerHeaders = { Authorization: `Bearer ${tellerToken}` };
  const assignedResponse = await request.get(
    `${apiUrl}/teller/counters/available`,
    { headers: tellerHeaders },
  );
  expect(assignedResponse.ok()).toBeTruthy();
  const assigned = (await assignedResponse.json()) as Array<{
    id: string;
    label: string;
  }>;
  expect(assigned).toHaveLength(1);
  expect(assigned[0].label).toBe("Counter 1");

  const allCountersResponse = await request.get(`${apiUrl}/manager/counters`, {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  const allCounters = (await allCountersResponse.json()) as Array<{
    id: string;
    label: string;
  }>;
  const anotherCounter = allCounters.find(
    (counter) => counter.label === "Counter 2",
  );
  expect(anotherCounter).toBeTruthy();
  const rejected = await request.post(`${apiUrl}/teller/counter-sessions`, {
    headers: tellerHeaders,
    data: { counterId: anotherCounter!.id },
  });
  expect(rejected.status()).toBe(403);
});

test("customer creates, looks up, and cancels a ticket", async ({
  request,
}) => {
  const registered = await request.post(`${apiUrl}/customer-auth/register`, {
    data: {
      name: "E2E Customer",
      email: `e2e-${crypto.randomUUID()}@example.test`,
      password: "CustomerE2E2026",
    },
  });
  expect(registered.ok()).toBeTruthy();
  const customerToken = (await registered.json()).accessToken as string;
  const customerHeaders = { Authorization: `Bearer ${customerToken}` };
  const services = await request.get(
    `${apiUrl}/customers/branches/MAIN/services`,
    { headers: customerHeaders },
  );
  const service = (await services.json()).find(
    (item: { code: string }) => item.code === "DEP",
  );
  const created = await request.post(
    `${apiUrl}/customers/branches/MAIN/tickets`,
    {
      headers: customerHeaders,
      data: {
        serviceTypeId: service.id,
        priority: false,
        priorityReason: null,
        idempotencyKey: crypto.randomUUID(),
      },
    },
  );
  expect(created.ok()).toBeTruthy();
  const ticket = (await created.json()).ticket;
  const lookup = await request.get(`${apiUrl}/customers/tickets/${ticket.id}`, {
    headers: customerHeaders,
  });
  expect((await lookup.json()).ticket.status).toBe("WAITING");
  const cancelled = await request.post(
    `${apiUrl}/customers/tickets/${ticket.id}/cancel`,
    {
      headers: customerHeaders,
    },
  );
  expect((await cancelled.json()).ticket.status).toBe("CANCELLED");
});

test("manager report export creates an audit record", async ({ request }) => {
  const token = await login(request, "manager.dev", managerPassword);
  const headers = { Authorization: `Bearer ${token}` };
  const exportResponse = await request.get(
    `${apiUrl}/manager/reports/tickets.csv`,
    { headers },
  );
  expect(exportResponse.ok()).toBeTruthy();
  expect(exportResponse.headers()["content-type"]).toContain("text/csv");
  const audit = await request.get(
    `${apiUrl}/manager/audit-logs?action=REPORT_EXPORT`,
    { headers },
  );
  expect(
    (await audit.json()).some(
      (entry: { action: string }) => entry.action === "REPORT_EXPORT",
    ),
  ).toBeTruthy();
});
