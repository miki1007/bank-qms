import { expect, test, type APIRequestContext } from "@playwright/test";

const apiUrl = process.env.E2E_API_URL ?? "http://localhost:3000/api/v1";
const tellerPassword = process.env.DEV_TELLER_PASSWORD ?? "";
const managerPassword = process.env.DEV_MANAGER_PASSWORD ?? "";
const adminPassword = process.env.DEV_ADMIN_PASSWORD ?? "";
const displayDeviceSecret = process.env.DISPLAY_DEVICE_SECRET ?? "";
const staffTokens = new Map<string, Promise<string>>();

async function login(
  request: APIRequestContext,
  username: string,
  password: string,
) {
  const cached = staffTokens.get(username);
  if (cached) return cached;

  const token = (async () => {
    const response = await request.post(`${apiUrl}/auth/login`, {
      data: { username, password },
    });
    const body = await response.text();
    expect(
      response.ok(),
      `Login for ${username} failed with ${response.status()}: ${body}`,
    ).toBeTruthy();
    return (JSON.parse(body) as { accessToken: string }).accessToken;
  })();
  staffTokens.set(username, token);
  return token;
}

test("teller login is isolated from manager and admin endpoints", async ({
  request,
}) => {
  const token = await login(request, "teller.one", tellerPassword);
  for (const path of [
    "/admin/staff",
    "/admin/services",
    "/admin/branches",
    "/manager/reports/summary",
    "/admin/audit-logs",
  ]) {
    const response = await request.get(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(403);
  }
});

test("each teller can open only the administrator-assigned counter", async ({
  request,
}) => {
  const tellerToken = await login(request, "teller.one", tellerPassword);
  const adminToken = await login(request, "admin.dev", adminPassword);
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

  const allCountersResponse = await request.get(`${apiUrl}/admin/counters`, {
    headers: { Authorization: `Bearer ${adminToken}` },
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

test("manager dashboard exports a report and creates an audit record", async ({
  page,
  request,
}) => {
  await page.goto("http://localhost:5177/login");
  await page.getByLabel("Username").fill("manager.dev");
  await page.getByLabel("Password").fill(managerPassword);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Live branch overview" }),
  ).toBeVisible();
  await expect(page.getByText("Live demand by service")).toBeVisible();
  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: /Queue workspace/i }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: "Reports" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export filtered CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("bank-qms-report.csv");

  const adminToken = await login(request, "admin.dev", adminPassword);
  const audit = await request.get(
    `${apiUrl}/admin/audit-logs?action=REPORT_EXPORT`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  expect(
    (await audit.json()).some(
      (entry: { action: string }) => entry.action === "REPORT_EXPORT",
    ),
  ).toBeTruthy();
});

test("administrator configures the display announcement policy", async ({
  request,
}) => {
  const token = await login(request, "admin.dev", adminPassword);
  const headers = { Authorization: "Bearer " + token };
  const currentResponse = await request.get(apiUrl + "/admin/settings", {
    headers,
  });
  expect(currentResponse.ok()).toBeTruthy();
  const current = (await currentResponse.json()) as {
    timezone: string;
    settings: Record<string, unknown>;
  };

  const update = await request.patch(apiUrl + "/admin/settings", {
    headers,
    data: {
      ...current.settings,
      timezone: current.timezone,
      soundEnabled: true,
      announcementRepeatCount: 2,
    },
  });
  expect(update.ok()).toBeTruthy();

  const bootstrap = await request.get(
    apiUrl + "/public/devices/MAIN-DISPLAY-01/bootstrap",
    { headers: { "x-device-secret": displayDeviceSecret } },
  );
  expect(bootstrap.ok()).toBeTruthy();
  expect((await bootstrap.json()).displaySettings).toMatchObject({
    soundEnabled: true,
    announcementRepeatCount: 2,
  });

  const restore = await request.patch(apiUrl + "/admin/settings", {
    headers,
    data: {
      ...current.settings,
      timezone: current.timezone,
      soundEnabled: true,
      announcementRepeatCount: 3,
    },
  });
  expect(restore.ok()).toBeTruthy();
});

test("polished kiosk and display workspaces render", async ({ page }) => {
  await page.goto("http://localhost:5174");
  await expect(
    page.getByRole("heading", { name: /Welcome to WorldLink Bank/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Get a ticket/i }),
  ).toBeVisible();

  await page.goto("http://localhost:5175");
  await expect(page.getByText("Current & recent calls")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Enable voice|Voice on/i }),
  ).toBeVisible();
  const displayViewport = await page.evaluate(() => ({
    viewportHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.scrollHeight,
  }));
  expect(displayViewport.documentHeight).toBeLessThanOrEqual(
    displayViewport.viewportHeight,
  );
  expect(displayViewport.bodyHeight).toBeLessThanOrEqual(
    displayViewport.viewportHeight,
  );
});

test("administrator and teller remain in their own polished workspaces", async ({
  page,
}) => {
  await page.goto("http://localhost:5173/login");
  await page.getByLabel("Username").fill("admin.dev");
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Administration overview" }),
  ).toBeVisible();
  await expect(page.getByText("Administrator protected")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Queue workspace/i }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("http://localhost:5178/login");
  await page.getByLabel("Username").fill("teller.one");
  await page.getByLabel("Password").fill(tellerPassword);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", {
      name: /Open your assigned counter|Queue workspace/,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(
    0,
  );
});
