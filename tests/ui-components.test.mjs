import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("exposes all four working Bank QMS interfaces", async () => {
  const client = await read("../app/qms-client.tsx");

  for (const surface of [
    "Customer self-service",
    "Teller workspace",
    "Now serving",
    "Operations overview",
  ]) {
    assert.match(client, new RegExp(surface, "i"));
  }
});

test("separates operational surfaces into dedicated routes", async () => {
  for (const route of ["kiosk", "display", "teller", "manager"]) {
    const page = await read(`../app/${route}/page.tsx`);
    assert.match(page, new RegExp(`surface=["']${route}["']`));
  }
  const login = await read("../app/staff/login/page.tsx");
  assert.match(login, /StaffLoginClient/);
});

test("connects interface actions to the persisted queue API", async () => {
  const client = await read("../app/qms-client.tsx");
  const route = await read("../app/api/showcase/route.ts");

  assert.match(client, /fetch\("\/api\/showcase"/);
  for (const operation of ["issue", "call_next", "transition", "transfer"]) {
    assert.match(route, new RegExp(`case ["']${operation}["']`));
  }
  assert.match(route, /status IN \('CALLED','IN_SERVICE'\)/);
  assert.match(route, /priority_streak/);
});

test("reinforces active-counter and queue ordering rules in storage", async () => {
  const schema = await read("../db/schema.ts");
  const migration = await read("../drizzle/0000_clever_miracleman.sql");

  assert.match(schema, /qms_demo_active_counter_idx/);
  assert.match(migration, /CREATE UNIQUE INDEX `qms_demo_active_counter_idx`/);
  assert.match(migration, /'CALLED', 'IN_SERVICE'/);
  assert.match(migration, /qms_demo_queue_idx/);
});

test("enforces staff sessions, manager roles, and private cancellation proof", async () => {
  const auth = await read("../lib/showcase-auth.ts");
  const authRoute = await read("../app/api/showcase/auth/route.ts");
  const queueRoute = await read("../app/api/showcase/route.ts");

  assert.match(auth, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(auth, /PBKDF2_ITERATIONS = 100_000/);
  assert.match(auth, /locked_until/);
  assert.match(auth, /ON CONFLICT\(username\) DO UPDATE SET/);
  assert.match(authRoute, /Unable to sign in with those credentials/);
  assert.match(authRoute, /oai-authenticated-user-email/);
  assert.match(authRoute, /workspace_showcase/);
  assert.match(authRoute, /sign-in service is temporarily unavailable/i);
  assert.match(auth, /FROM qms_demo_staff WHERE username = \?/);
  assert.match(queueRoute, /Manager permission required/);
  assert.match(queueRoute, /lookup_token_hash/);
});

test("routes managers to the full dashboard and keeps daily ticket identities", async () => {
  const login = await read("../app/staff-login-client.tsx");
  const staffApp = await read("../app/mobile-staff-client.tsx");
  const schema = await read("../db/schema.ts");
  const migration = await read("../drizzle/0002_daily_ticket_identity.sql");
  const queueRoute = await read("../app/api/showcase/route.ts");

  assert.match(login, /actor\.role === "MANAGER"/);
  assert.match(login, /window\.location\.replace\("\/manager"\)/);
  assert.match(staffApp, /data\.actor\?\.role === "MANAGER"/);
  assert.match(schema, /qms_demo_ticket_number_per_day_unique/);
  assert.match(migration, /DROP INDEX `qms_demo_tickets_public_number_unique`/);
  assert.match(migration, /datetime\(`created_at`, '\+3 hours'\)/);
  assert.match(queueRoute, /business_date, service_code/);
  assert.match(queueRoute, /WHERE service_code = \? AND business_date = \?/);
});

test("keeps reconnect and reduced-motion safety states visible", async () => {
  const client = await read("../app/qms-client.tsx");
  const css = await read("../app/globals.css");

  assert.match(client, /Last safe queue\s+snapshot remains visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /focus-visible/);
});

test("provides two installable mobile apps on the shared queue backend", async () => {
  const customerPage = await read("../app/customer-app/page.tsx");
  const staffPage = await read("../app/staff-app/page.tsx");
  const customer = await read("../app/mobile-customer-client.tsx");
  const staff = await read("../app/mobile-staff-client.tsx");
  const queueRoute = await read("../app/api/showcase/route.ts");
  const customerManifest = JSON.parse(
    await read("../public/customer-app.webmanifest"),
  );
  const staffManifest = JSON.parse(
    await read("../public/staff-app.webmanifest"),
  );

  assert.match(customerPage, /MobileCustomerClient/);
  assert.match(staffPage, /MobileStaffClient/);
  assert.match(customer, /operation: "issue"/);
  assert.match(customer, /operation: "lookup"/);
  assert.match(customer, /shareTicket/);
  assert.match(customer, /showNotification/);
  assert.match(customer, /lookupToken/);
  assert.match(staff, /operation: "call_next"/);
  assert.match(staff, /operation: "transfer"/);
  assert.match(staff, /action: "requeue"/);
  assert.match(staff, /role === "MANAGER"/);
  assert.match(queueRoute, /customerTicketLookup/);
  assert.match(queueRoute, /priority_streak/);
  assert.equal(customerManifest.display, "standalone");
  assert.equal(customerManifest.start_url, "/customer-app");
  assert.equal(staffManifest.display, "standalone");
  assert.equal(staffManifest.start_url, "/staff-app");
});

test("launches every product surface and exposes audited manager controls", async () => {
  const home = await read("../app/page.tsx");
  const client = await read("../app/qms-client.tsx");
  const route = await read("../app/api/showcase/route.ts");

  for (const path of [
    "/customer-app",
    "/staff-app",
    "/kiosk",
    "/display",
    "/manager",
  ]) {
    assert.ok(home.includes(path));
  }
  assert.match(client, /operation: "set_priority_limit"/);
  assert.match(client, /operation: "export_csv"/);
  assert.match(route, /Priority limit must be between 1 and 5/);
  assert.match(route, /report\.export/);
  assert.match(route, /Content-Disposition/);
});

test("ships separate hardened Android customer and staff applications", async () => {
  const settings = await read("../apps/android/settings.gradle");
  const shell = await read(
    "../apps/android/shell/src/main/java/com/bankqms/shell/BaseWebActivity.java",
  );
  const policy = await read(
    "../apps/android/shell/src/main/java/com/bankqms/shell/TrustedNavigationPolicy.java",
  );
  const customerBuild = await read("../apps/android/customer-app/build.gradle");
  const staffBuild = await read("../apps/android/staff-app/build.gradle");
  const customerManifest = await read(
    "../apps/android/customer-app/src/main/AndroidManifest.xml",
  );
  const staffManifest = await read(
    "../apps/android/staff-app/src/main/AndroidManifest.xml",
  );
  const workflow = await read("../.github/workflows/android-apks.yml");

  assert.match(settings, /customer-app/);
  assert.match(settings, /staff-app/);
  assert.match(customerBuild, /com\.bankqms\.customer/);
  assert.match(staffBuild, /com\.bankqms\.staff/);
  assert.match(customerManifest, /android:usesCleartextTraffic="false"/);
  assert.match(staffManifest, /android:usesCleartextTraffic="false"/);
  assert.match(
    shell,
    /setMixedContentMode\(WebSettings\.MIXED_CONTENT_NEVER_ALLOW\)/,
  );
  assert.match(shell, /handler\.cancel\(\)/);
  assert.match(policy, /"https"\.equalsIgnoreCase/);
  assert.match(workflow, /assembleDebug/);
});

test("ships separate secure iOS customer and staff targets", async () => {
  const project = await read("../apps/ios/project.yml");
  const shell = await read("../apps/ios/Shared/SecureWebApp.swift");
  assert.match(project, /BankQMSCustomer:/);
  assert.match(project, /BankQMSStaff:/);
  assert.match(project, /com\.bankqms\.customer/);
  assert.match(project, /com\.bankqms\.staff/);
  assert.match(shell, /websiteDataStore = \.default\(\)/);
  assert.match(shell, /performDefaultHandling/);
  assert.match(shell, /url\.scheme\?\.lowercased\(\) == "https"/);
});

test("provides customer accounts without persistent browser token storage", async () => {
  const customer = await read("../apps/customer-web/src/main.tsx");
  const auth = await read("../apps/api/src/modules/customer-auth.ts");
  assert.match(customer, /customer-auth\/\$\{mode\}/);
  assert.match(customer, /Create account/);
  assert.match(customer, /customer-auth\/refresh/);
  assert.doesNotMatch(customer, /localStorage|sessionStorage/);
  assert.match(auth, /argon2\.argon2id/);
  assert.match(auth, /customerRefreshSession/);
  assert.match(auth, /authVersion: \{ increment: 1 \}/);
});

test("makes canonical Call Next retries idempotent inside PostgreSQL", async () => {
  const workflow = await read("../apps/api/src/modules/tickets.ts");
  const controller = await read("../apps/api/src/modules/teller.ts");
  const staff = await read("../apps/staff-web/src/main.tsx");

  assert.match(controller, /@Headers\("idempotency-key"\)/);
  assert.match(workflow, /operation = "CALL_NEXT"/);
  assert.match(workflow, /pg_advisory_xact_lock/);
  assert.match(workflow, /FOR UPDATE SKIP LOCKED LIMIT 1/);
  assert.match(workflow, /idempotentReplay: true/);
  assert.match(staff, /"Idempotency-Key": idempotencyKey/);
  assert.match(staff, /crypto\.randomUUID\(\)/);
});

test("locks teller accounts to manager-controlled counters and scopes fairness per service", async () => {
  const prisma = await read("../apps/api/prisma/schema.prisma");
  const seed = await read("../apps/api/prisma/seed.ts");
  const teller = await read("../apps/api/src/modules/teller.ts");
  const workflow = await read("../apps/api/src/modules/tickets.ts");
  const staffWeb = await read("../apps/staff-web/src/main.tsx");
  const showcaseAuth = await read("../lib/showcase-auth.ts");
  const showcaseQueue = await read("../app/api/showcase/route.ts");
  const showcaseStaff = await read("../app/mobile-staff-client.tsx");

  assert.match(prisma, /assignedCounterId\s+String\?\s+@unique/);
  assert.match(
    teller,
    /You may open only the counter assigned by your manager/,
  );
  assert.match(staffWeb, /Open your assigned counter/);
  assert.doesNotMatch(showcaseStaff, /setCounter\(/);
  assert.match(showcaseAuth, /assignedCounter: "Counter 4"/);
  assert.match(workflow, /PRIORITY_FAIRNESS/);
  assert.match(showcaseQueue, /qms_demo_priority_state/);
  assert.match(showcaseQueue, /service_code = \?/);
  assert.match(showcaseQueue, /priorityReason/);
  assert.match(seed, /passwordHash,/);
  assert.match(seed, /authVersion: \{ increment: 1 \}/);
});
