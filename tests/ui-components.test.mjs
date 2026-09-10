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
  const retiredAdmin = await read("../app/admin/page.tsx");
  assert.match(retiredAdmin, /redirect\("\/manager"\)/);
  const login = await read("../app/staff/login/page.tsx");
  assert.match(login, /StaffLoginClient/);
});

test("connects interface actions to the persisted queue API", async () => {
  const client = await read("../app/qms-client.tsx");
  const route = await read("../app/api/showcase/route.ts");
  const workflow = await read("../lib/showcase-ticket-workflow.ts");

  assert.match(client, /fetch\("\/api\/showcase"/);
  for (const operation of ["issue", "call_next", "transition", "transfer"]) {
    assert.match(route, new RegExp(`case ["']${operation}["']`));
  }
  assert.match(workflow, /status IN \('CALLED','IN_SERVICE'\)/);
  assert.match(workflow, /qms_branch_fairness/);
  assert.match(workflow, /last_operation_id/);
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
  const workflow = await read("../lib/showcase-ticket-workflow.ts");

  assert.match(auth, /HttpOnly;/);
  assert.match(auth, /secure \? "Secure; " : ""/);
  assert.match(auth, /SameSite=Strict/);
  assert.match(auth, /PBKDF2_ITERATIONS = 100_000/);
  assert.match(auth, /locked_until/);
  assert.match(auth, /ON CONFLICT\(username\) DO UPDATE/);
  assert.match(authRoute, /Unable to sign in with those credentials/);
  assert.match(authRoute, /oai-authenticated-user-email/);
  assert.match(authRoute, /workspace_showcase/);
  assert.match(authRoute, /sign-in service is temporarily unavailable/i);
  assert.match(auth, /FROM qms_demo_staff WHERE username = \?/);
  assert.match(queueRoute, /requiredRole === "MANAGER"/);
  assert.match(queueRoute, /surface === "teller"\s*\? "TELLER"/);
  assert.match(authRoute, /LOGOUT_REQUIRED/);
  assert.match(workflow, /lookup_token_hash/);
});

test("routes managers to the full dashboard and keeps daily ticket identities", async () => {
  const login = await read("../app/staff-login-client.tsx");
  const staffApp = await read("../app/mobile-staff-client.tsx");
  const schema = await read("../db/schema.ts");
  const migration = await read(
    "../drizzle/0004_worldlink_branch_reservations.sql",
  );
  const workflow = await read("../lib/showcase-ticket-workflow.ts");

  assert.match(login, /actor\.role === "MANAGER"/);
  assert.match(login, /window\.location\.replace\("\/manager"\)/);
  assert.match(login, /\["\/teller", "\/staff-app"\]/);
  assert.match(staffApp, /data\.actor\?\.role === "MANAGER"/);
  assert.match(schema, /qms_demo_ticket_number_per_branch_day_unique/);
  assert.match(migration, /qms_demo_ticket_number_per_branch_day_unique/);
  assert.match(migration, /qms_branch_sequences/);
  assert.match(workflow, /businessDate\(now\)/);
  assert.match(
    workflow,
    /branch_code=\? AND service_code=\? AND business_date=\?/,
  );
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
  const workflow = await read("../lib/showcase-ticket-workflow.ts");
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
  assert.match(workflow, /async lookup\(/);
  assert.match(queueRoute, /case "check_in"/);
  assert.match(workflow, /qms_branch_fairness/);
  assert.equal(customerManifest.display, "standalone");
  assert.equal(customerManifest.start_url, "/customer");
  assert.equal(staffManifest.display, "standalone");
  assert.equal(staffManifest.start_url, "/staff-app");
});

test("launches each actor-owned product surface and exposes audited manager controls", async () => {
  const home = await read("../app/page.tsx");
  const client = await read("../app/qms-client.tsx");
  const route = await read("../app/api/showcase/route.ts");

  for (const path of [
    "/customer-app",
    "/staff-app",
    "/kiosk",
    "/display",
    "next=%2Fteller",
    "next=%2Fmanager",
  ]) {
    assert.ok(home.includes(path));
  }
  assert.ok(!home.includes("next=%2Fadmin"));
  assert.ok(!home.includes("Administration"));
  assert.match(client, /operation: "set_priority_limit"/);
  assert.match(client, /operation: "export_csv"/);
  assert.match(route, /Priority limit must be between 1 and 5/);
  assert.match(route, /report\.export/);
  assert.match(route, /Content-Disposition/);
});

test("adds real manager analytics, retires the separate admin surface, and keeps customer data safe", async () => {
  const manager = await read("../app/qms-client.tsx");
  const customer = await read("../app/mobile-customer-client.tsx");
  const route = await read("../app/api/showcase/route.ts");
  const adminRoute = await read("../app/admin/page.tsx");
  const schema = await read("../db/schema.ts");

  assert.match(manager, /Seven-day throughput/);
  assert.match(manager, /Hourly demand/);
  assert.match(manager, /Live customer flow/);
  assert.match(manager, /Manager-only administration/);
  assert.match(manager, /admin_staff_update/);
  assert.match(manager, /admin_service_update/);
  assert.match(customer, /Total available balance/);
  assert.match(customer, /Recent transactions/);
  assert.match(customer, /customer-banking/);
  assert.match(customer, /customer_statement/);
  assert.match(adminRoute, /redirect\("\/manager"\)/);
  assert.match(route, /requireActor\(request, "MANAGER"\)/);
  assert.match(schema, /qms_customer_accounts/);
  assert.match(schema, /qms_customer_transactions/);
});

test("keeps manager and teller workspaces isolated with visible logout controls", async () => {
  const hosted = await read("../app/qms-client.tsx");
  const staffLogin = await read("../app/staff-login-client.tsx");
  const hostedAuth = await read("../app/api/showcase/auth/route.ts");
  const productionTeller = await read("../apps/api/src/modules/teller.ts");
  const staffWeb = await read("../apps/staff-web/src/main.tsx");

  assert.doesNotMatch(hosted, /Switch staff|Open teller login|href="\/admin"/);
  assert.match(hosted, /Manager dashboard/);
  assert.match(hosted, /Teller console/);
  assert.match(hosted, /"Log out"/);
  assert.match(hostedAuth, /LOGOUT_REQUIRED/);
  assert.match(hostedAuth, /closeTellerCounterBeforeLogout/);
  assert.match(staffLogin, /requestedRole !== result\.actor\.role/);
  assert.match(staffLogin, /setSessionConflict/);
  assert.match(staffLogin, /action: "logout"/);
  assert.match(staffLogin, /Staff identity is never switched silently/);
  assert.match(
    productionTeller,
    /@Roles\("TELLER"\)\s*@Controller\("teller"\)/,
  );
  assert.match(staffWeb, /className="logout-control"/);
  assert.match(staffWeb, /Logging out…/);
});

test("ships full native Android customer and teller applications", async () => {
  const settings = await read("../apps/android/settings.gradle");
  const core = await read(
    "../apps/android/mobile-core/src/main/java/com/bankqms/mobilecore/QmsApiClient.kt",
  );
  const secureStore = await read(
    "../apps/android/mobile-core/src/main/java/com/bankqms/mobilecore/SecureSessionStore.kt",
  );
  const realtime = await read(
    "../apps/android/mobile-core/src/main/java/com/bankqms/mobilecore/RealtimeConnection.kt",
  );
  const serverSetup = await read(
    "../apps/android/mobile-core/src/main/java/com/bankqms/mobilecore/ServerConfiguration.kt",
  );
  const customerMain = await read(
    "../apps/android/customer-app/src/main/java/com/bankqms/customer/MainActivity.kt",
  );
  const staffMain = await read(
    "../apps/android/staff-app/src/main/java/com/bankqms/staff/MainActivity.kt",
  );
  const customer = await read(
    "../apps/android/customer-app/src/main/java/com/bankqms/customer/CustomerApplication.kt",
  );
  const customerApi = await read(
    "../apps/android/customer-app/src/main/java/com/bankqms/customer/CustomerRepository.kt",
  );
  const staff = await read(
    "../apps/android/staff-app/src/main/java/com/bankqms/staff/StaffApplication.kt",
  );
  const staffApi = await read(
    "../apps/android/staff-app/src/main/java/com/bankqms/staff/StaffRepository.kt",
  );
  const customerBuild = await read("../apps/android/customer-app/build.gradle");
  const staffBuild = await read("../apps/android/staff-app/build.gradle");
  const workflow = await read("../.github/workflows/android-apks.yml");

  assert.match(settings, /mobile-core/);
  assert.match(settings, /customer-app/);
  assert.match(settings, /staff-app/);
  assert.match(customerBuild, /com\.bankqms\.customer/);
  assert.match(staffBuild, /com\.bankqms\.staff/);
  assert.match(customerBuild, /compose true/);
  assert.match(staffBuild, /compose true/);
  assert.match(
    customerBuild,
    /manifestPlaceholders = \[usesCleartext: "false"\]/,
  );
  assert.match(staffBuild, /manifestPlaceholders = \[usesCleartext: "false"\]/);
  assert.match(secureStore, /AndroidKeyStore/);
  assert.match(secureStore, /AES\/GCM\/NoPadding/);
  assert.match(core, /X-Refresh-Token/);
  assert.match(core, /Idempotency-Key/);
  assert.match(realtime, /eventId/);
  assert.match(realtime, /seenIds/);
  assert.match(serverSetup, /Connect this phone/);
  assert.match(serverSetup, /health\/ready/);
  assert.match(serverSetup, /confirmedUrl/);
  assert.match(serverSetup, /Release builds accept HTTPS only/);
  assert.match(customerMain, /ServerSetupScreen/);
  assert.match(staffMain, /ServerSetupScreen/);
  assert.match(customer, /Join a bank queue/);
  assert.match(customerApi, /customer-auth\/register/);
  assert.match(customerApi, /customers\/tickets\/\$id\/cancel/);
  assert.match(staff, /Call next customer/);
  assert.match(staffApi, /teller\/tickets\/call-next/);
  assert.match(staffApi, /teller\/tickets\/\$id\/transfer/);
  assert.doesNotMatch(customer + staff + core, /android\.webkit\.WebView/);
  assert.match(workflow, /assembleDebug/);
  assert.match(workflow, /stat -c%s/);
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
  const showcaseWorkflow = await read("../lib/showcase-ticket-workflow.ts");
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
  assert.match(showcaseWorkflow, /qms_branch_fairness/);
  assert.match(showcaseWorkflow, /service_code=\?/);
  assert.match(showcaseWorkflow, /priorityReason/);
  assert.match(seed, /passwordHash,/);
  assert.match(seed, /authVersion: \{ increment: 1 \}/);
});
