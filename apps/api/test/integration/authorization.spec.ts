import { Test } from "@nestjs/testing";
import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/prisma.service";
import { DomainExceptionFilter } from "../../src/shared/domain-exception.filter";
import { RequestValidationPipe } from "../../src/shared/request-validation.pipe";

const run = process.env.RUN_DATABASE_TESTS === "1";
const tellerPassword = process.env.DEV_TELLER_PASSWORD ?? "";
const managerPassword = process.env.DEV_MANAGER_PASSWORD ?? "";

describe.skipIf(!run)("authorization integration with PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tellerOneAccessToken = "";
  let tellerThreeAccessToken = "";
  let managerAccessToken = "";
  let browserTellerBody: Record<string, unknown> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health/live", "health/ready"] });
    app.use(cookieParser());
    app.useGlobalPipes(new RequestValidationPipe());
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const teller = await login("teller.one", tellerPassword);
    if (teller.status !== 201) {
      throw new Error("Unable to establish the shared teller test session.");
    }
    tellerOneAccessToken = teller.body.accessToken as string;
    browserTellerBody = teller.body as Record<string, unknown>;
  });

  afterAll(async () => app?.close());

  async function login(username: string, password: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ username, password });
    return response;
  }

  it("returns 403 for teller privilege escalation", async () => {
    for (const path of [
      "/api/v1/manager/staff",
      "/api/v1/manager/services",
      "/api/v1/manager/reports/summary",
      "/api/v1/manager/audit-logs",
    ]) {
      const response = await request(app.getHttpServer())
        .get(path)
        .set("Authorization", `Bearer ${tellerOneAccessToken}`);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("returns 403 when a manager tries to use the teller API", async () => {
    const manager = await login("manager.dev", managerPassword);
    expect(manager.status).toBe(201);
    managerAccessToken = manager.body.accessToken as string;
    const response = await request(app.getHttpServer())
      .get("/api/v1/teller/counter-session/current")
      .set("Authorization", `Bearer ${managerAccessToken}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("rotates an Android staff refresh token without exposing it to browsers", async () => {
    expect(browserTellerBody.refreshToken).toBeUndefined();

    const mobile = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("X-Client-Platform", "android")
      .send({ username: "teller.three", password: tellerPassword });
    expect(mobile.status).toBe(201);
    expect(mobile.body.refreshToken).toEqual(expect.any(String));
    tellerThreeAccessToken = mobile.body.accessToken as string;

    const rotated = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("X-Client-Platform", "android")
      .set("X-Refresh-Token", mobile.body.refreshToken);
    expect(rotated.status).toBe(201);
    expect(rotated.body.refreshToken).toEqual(expect.any(String));
    expect(rotated.body.refreshToken).not.toBe(mobile.body.refreshToken);
    expect(rotated.body.user.role).toBe("TELLER");
  });

  it("locks a teller session to the counter assigned by the manager", async () => {
    const account = await prisma.staff.findUniqueOrThrow({
      where: { username: "teller.one" },
      include: { assignedCounter: true },
    });
    expect(account.assignedCounter).not.toBeNull();
    const otherCounter = await prisma.counter.findFirstOrThrow({
      where: {
        branchId: account.branchId,
        id: { not: account.assignedCounter!.id },
      },
    });

    const available = await request(app.getHttpServer())
      .get("/api/v1/teller/counters/available")
      .set("Authorization", `Bearer ${tellerOneAccessToken}`);
    expect(available.status).toBe(200);
    expect(available.body).toHaveLength(1);
    expect(available.body[0].id).toBe(account.assignedCounterId);

    const forgedOpen = await request(app.getHttpServer())
      .post("/api/v1/teller/counter-sessions")
      .set("Authorization", `Bearer ${tellerOneAccessToken}`)
      .send({ counterId: otherCounter.id });
    expect(forgedOpen.status).toBe(403);
    expect(forgedOpen.body.error.code).toBe("FORBIDDEN");

    const assignedOpen = await request(app.getHttpServer())
      .post("/api/v1/teller/counter-sessions")
      .set("Authorization", `Bearer ${tellerOneAccessToken}`)
      .send({ counterId: account.assignedCounterId });
    expect(assignedOpen.status).toBe(201);
    expect(assignedOpen.body.session.counterId).toBe(account.assignedCounterId);

    const close = await request(app.getHttpServer())
      .post("/api/v1/teller/counter-session/close")
      .set("Authorization", `Bearer ${tellerOneAccessToken}`);
    expect(close.status).toBe(201);
  });

  it("closes an idle teller counter session during logout", async () => {
    const account = await prisma.staff.findUniqueOrThrow({
      where: { username: "teller.three" },
    });
    expect(account.assignedCounterId).not.toBeNull();

    const opened = await request(app.getHttpServer())
      .post("/api/v1/teller/counter-sessions")
      .set("Authorization", `Bearer ${tellerThreeAccessToken}`)
      .send({ counterId: account.assignedCounterId });
    expect(opened.status).toBe(201);

    const loggedOut = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${tellerThreeAccessToken}`);
    expect(loggedOut.status).toBe(201);
    expect(loggedOut.body.success).toBe(true);
    expect(
      await prisma.counterSession.findFirst({
        where: { id: opened.body.session.id },
        select: { status: true },
      }),
    ).toEqual({ status: "CLOSED" });
    expect(
      await prisma.counter.findUnique({
        where: { id: account.assignedCounterId! },
        select: { status: true },
      }),
    ).toEqual({ status: "CLOSED" });
  });

  it("rejects inactive accounts with a generic login message", async () => {
    await prisma.staff.update({
      where: { username: "teller.two" },
      data: { status: "INACTIVE" },
    });
    const response = await login("teller.two", tellerPassword);
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe(
      "Username or password is incorrect.",
    );
    await prisma.staff.update({
      where: { username: "teller.two" },
      data: { status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
    });
  });

  it("prevents a manager from mutating another branch resource", async () => {
    const branchTwo = await prisma.branch.findUniqueOrThrow({
      where: { code: "TEST-B2" },
    });
    const foreign = await prisma.serviceType.create({
      data: {
        branchId: branchTwo.id,
        code: `B2${randomUUID().slice(0, 6)}`,
        name: "Branch Two Test",
        averageServiceMinutes: 5,
      },
    });
    const attack = await request(app.getHttpServer())
      .patch(`/api/v1/manager/services/${foreign.id}`)
      .set("Authorization", `Bearer ${managerAccessToken}`)
      .send({ name: "Cross branch mutation" });
    expect(attack.status).toBe(404);
  });

  it("registers a customer, isolates the staff boundary, owns tickets, and revokes logout", async () => {
    const email = `customer-${randomUUID()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/api/v1/customer-auth/register")
      .send({
        name: "Integration Customer",
        email,
        password: "IntegrationCustomer7",
      });
    expect(registered.status).toBe(201);
    expect(registered.body.user.email).toBe(email);
    expect(registered.headers["set-cookie"]?.[0]).toContain(
      "qms_customer_refresh=",
    );

    const customerToken = registered.body.accessToken as string;
    const managerAttempt = await request(app.getHttpServer())
      .get("/api/v1/manager/dashboard/live")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(managerAttempt.status).toBe(401);

    const services = await request(app.getHttpServer())
      .get("/api/v1/customers/branches/MAIN/services")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(services.status).toBe(200);
    const created = await request(app.getHttpServer())
      .post("/api/v1/customers/branches/MAIN/tickets")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        serviceTypeId: services.body[0].id,
        priority: false,
        priorityReason: null,
        idempotencyKey: randomUUID(),
      });
    expect(created.status).toBe(201);
    expect(created.body.ticket.lookupCode).toBeUndefined();

    const history = await request(app.getHttpServer())
      .get("/api/v1/customers/me/tickets")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(history.body.tickets[0].id).toBe(created.body.ticket.id);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/customers/tickets/${created.body.ticket.id}/cancel`)
      .set("Authorization", `Bearer ${customerToken}`);
    expect(cancelled.body.ticket.status).toBe("CANCELLED");

    const cookie = registered.headers["set-cookie"]?.[0].split(";")[0] ?? "";
    const logout = await request(app.getHttpServer())
      .post("/api/v1/customer-auth/logout")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Cookie", cookie);
    expect(logout.status).toBe(201);
    const revoked = await request(app.getHttpServer())
      .get("/api/v1/customer-auth/me")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(revoked.status).toBe(401);
  });

  it("supports encrypted-at-rest Android customer refresh rotation", async () => {
    const registered = await request(app.getHttpServer())
      .post("/api/v1/customer-auth/register")
      .set("X-Client-Platform", "android")
      .send({
        name: "Mobile Customer",
        email: `mobile-${randomUUID()}@example.com`,
        password: "MobileCustomer7",
      });
    expect(registered.status).toBe(201);
    expect(registered.body.refreshToken).toEqual(expect.any(String));

    const rotated = await request(app.getHttpServer())
      .post("/api/v1/customer-auth/refresh")
      .set("X-Client-Platform", "android")
      .set("X-Refresh-Token", registered.body.refreshToken);
    expect(rotated.status).toBe(201);
    expect(rotated.body.refreshToken).toEqual(expect.any(String));
    expect(rotated.body.refreshToken).not.toBe(registered.body.refreshToken);
  });
});
