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
  });

  afterAll(async () => app?.close());

  async function login(username: string, password: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ username, password });
    return response;
  }

  it("returns 403 for teller privilege escalation", async () => {
    const teller = await login("teller.one", tellerPassword);
    expect(teller.status).toBe(201);
    for (const path of [
      "/api/v1/manager/staff",
      "/api/v1/manager/services",
      "/api/v1/manager/reports/summary",
      "/api/v1/manager/audit-logs",
    ]) {
      const response = await request(app.getHttpServer())
        .get(path)
        .set("Authorization", `Bearer ${teller.body.accessToken}`);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    }
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
    const branchTwo = await login("manager.branch2", managerPassword);
    const foreign = await request(app.getHttpServer())
      .post("/api/v1/manager/services")
      .set("Authorization", `Bearer ${branchTwo.body.accessToken}`)
      .send({ code: "B2T", name: "Branch Two Test", averageServiceMinutes: 5 });
    expect(foreign.status).toBe(201);
    const mainManager = await login("manager.dev", managerPassword);
    const attack = await request(app.getHttpServer())
      .patch(`/api/v1/manager/services/${foreign.body.id}`)
      .set("Authorization", `Bearer ${mainManager.body.accessToken}`)
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
});
