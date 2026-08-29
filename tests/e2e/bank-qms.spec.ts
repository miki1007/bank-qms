import { expect, test, type APIRequestContext } from "@playwright/test";

const apiUrl = process.env.E2E_API_URL ?? "http://localhost:3000/api/v1";
const tellerPassword = process.env.DEV_TELLER_PASSWORD ?? "";
const managerPassword = process.env.DEV_MANAGER_PASSWORD ?? "";
const kioskSecret = process.env.KIOSK_DEVICE_SECRET ?? "";

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

test("customer creates, looks up, and cancels a ticket", async ({
  request,
}) => {
  const services = await request.get(`${apiUrl}/public/branches/MAIN/services`);
  const service = (await services.json()).find(
    (item: { code: string }) => item.code === "DEP",
  );
  const created = await request.post(`${apiUrl}/public/branches/MAIN/tickets`, {
    headers: {
      "x-device-code": "MAIN-KIOSK-01",
      "x-device-secret": kioskSecret,
    },
    data: {
      serviceTypeId: service.id,
      priority: false,
      priorityReason: null,
      idempotencyKey: crypto.randomUUID(),
    },
  });
  expect(created.ok()).toBeTruthy();
  const ticket = (await created.json()).ticket;
  const lookup = await request.post(`${apiUrl}/public/tickets/lookup`, {
    data: {
      branchCode: "MAIN",
      publicNumber: ticket.publicNumber,
      lookupCode: ticket.lookupCode,
    },
  });
  expect((await lookup.json()).ticket.status).toBe("WAITING");
  const cancelled = await request.post(
    `${apiUrl}/public/tickets/${ticket.id}/cancel`,
    {
      data: {
        branchCode: "MAIN",
        publicNumber: ticket.publicNumber,
        lookupCode: ticket.lookupCode,
      },
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
