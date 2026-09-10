import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { Prisma, StaffRole } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { DomainError } from "../shared/domain-error";
import {
  CurrentUser,
  JwtAuthGuard,
  RequestUser,
  Roles,
  RolesGuard,
} from "./auth";
import { RealtimePublisher } from "./realtime";

type ReportFilters = {
  from?: string;
  to?: string;
  serviceTypeId?: string;
  counterId?: string;
  staffId?: string;
};

@Injectable()
export class ReportQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private range(filters: ReportFilters) {
    const from = filters.from
      ? new Date(`${filters.from}T00:00:00.000Z`)
      : new Date(Date.now() - 24 * 60 * 60_000);
    const to = filters.to
      ? new Date(`${filters.to}T23:59:59.999Z`)
      : new Date();
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from > to
    )
      throw new DomainError(
        "VALIDATION_ERROR",
        "Invalid report date range.",
        400,
      );
    return { from, to };
  }

  private median(values: number[]) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  async summary(branchId: string, filters: ReportFilters) {
    const { from, to } = this.range(filters);
    const where: Prisma.TicketWhereInput = {
      branchId,
      issuedAt: { gte: from, lte: to },
      ...(filters.serviceTypeId
        ? { currentServiceTypeId: filters.serviceTypeId }
        : {}),
      ...(filters.counterId ? { assignedCounterId: filters.counterId } : {}),
      ...(filters.staffId ? { assignedStaffId: filters.staffId } : {}),
    };
    const [tickets, sessions, branch] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          currentService: true,
          assignedCounter: true,
          assignedStaff: true,
        },
        orderBy: { issuedAt: "asc" },
      }),
      this.prisma.counterSession.findMany({
        where: {
          branchId,
          openedAt: { lte: to },
          OR: [{ closedAt: { gte: from } }, { closedAt: null }],
        },
        include: { counter: true, staff: true },
      }),
      this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } }),
    ]);
    const waits = tickets
      .filter((t) => t.calledAt)
      .map((t) =>
        Math.max(
          0,
          (t.calledAt!.getTime() - t.queueEnteredAt.getTime()) / 60_000,
        ),
      );
    const services = tickets
      .filter((t) => t.completedAt && t.serviceStartedAt)
      .map((t) =>
        Math.max(
          0,
          (t.completedAt!.getTime() - t.serviceStartedAt!.getTime()) / 60_000,
        ),
      );
    const noShowCount = await this.prisma.ticketEvent.count({
      where: {
        branchId,
        eventType: "NO_SHOW",
        occurredAt: { gte: from, lte: to },
      },
    });
    const transferCount = await this.prisma.ticketEvent.count({
      where: {
        branchId,
        eventType: "TRANSFERRED",
        occurredAt: { gte: from, lte: to },
      },
    });
    const counterOpenMinutes = sessions.reduce(
      (sum, session) =>
        sum +
        Math.max(
          0,
          ((session.closedAt ?? to).getTime() -
            Math.max(session.openedAt.getTime(), from.getTime())) /
            60_000,
        ),
      0,
    );
    const busyMinutes = services.reduce((sum, value) => sum + value, 0);
    const byService = Object.values(
      tickets.reduce<
        Record<
          string,
          {
            serviceId: string;
            serviceName: string;
            issued: number;
            completed: number;
            waiting: number;
            waitTotal: number;
            waitCount: number;
          }
        >
      >((acc, ticket) => {
        const key = ticket.currentServiceTypeId;
        acc[key] ??= {
          serviceId: key,
          serviceName: ticket.currentService.name,
          issued: 0,
          completed: 0,
          waiting: 0,
          waitTotal: 0,
          waitCount: 0,
        };
        acc[key].issued += 1;
        if (ticket.status === "COMPLETED") acc[key].completed += 1;
        if (ticket.status === "WAITING") acc[key].waiting += 1;
        if (ticket.calledAt) {
          acc[key].waitTotal +=
            (ticket.calledAt.getTime() - ticket.queueEnteredAt.getTime()) /
            60_000;
          acc[key].waitCount += 1;
        }
        return acc;
      }, {}),
    ).map((row) => ({
      ...row,
      averageWaitMinutes: row.waitCount ? row.waitTotal / row.waitCount : 0,
    }));
    const hourlyDemand = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      issued: tickets.filter((t) => t.issuedAt.getUTCHours() === hour).length,
    }));
    return {
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        serviceTypeId: filters.serviceTypeId ?? null,
        counterId: filters.counterId ?? null,
        staffId: filters.staffId ?? null,
      },
      generatedAt: new Date().toISOString(),
      branchTimezone: branch.timezone,
      metrics: {
        ticketsIssued: tickets.length,
        waitingNow: tickets.filter((t) => t.status === "WAITING").length,
        completed: tickets.filter((t) => t.status === "COMPLETED").length,
        averageWaitMinutes: waits.length
          ? waits.reduce((a, b) => a + b, 0) / waits.length
          : 0,
        medianWaitMinutes: this.median(waits),
        averageServiceMinutes: services.length
          ? services.reduce((a, b) => a + b, 0) / services.length
          : 0,
        medianServiceMinutes: this.median(services),
        throughput: tickets.filter((t) => t.status === "COMPLETED").length,
        cancellationRate: tickets.length
          ? (tickets.filter((t) => t.status === "CANCELLED").length /
              tickets.length) *
            100
          : 0,
        noShowCount,
        transferCount,
        counterOpenMinutes,
        counterBusyMinutes: busyMinutes,
        counterUtilization: counterOpenMinutes
          ? Math.min(100, (busyMinutes / counterOpenMinutes) * 100)
          : 0,
      },
      byService,
      hourlyDemand,
      tickets: tickets.map((ticket) => ({
        publicNumber: ticket.publicNumber,
        service: ticket.currentService.name,
        status: ticket.status,
        priority: ticket.priority,
        issuedAt: ticket.issuedAt,
        calledAt: ticket.calledAt,
        completedAt: ticket.completedAt,
        counter: ticket.assignedCounter?.label ?? "",
        teller: ticket.assignedStaff?.name ?? "",
        noShowCount: ticket.noShowCount,
      })),
    };
  }

  toCsv(report: Awaited<ReturnType<ReportQueryService["summary"]>>) {
    const q = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const metadata = [
      ["Generated at", report.generatedAt],
      ["Branch timezone", report.branchTimezone],
      ["From", report.filters.from],
      ["To", report.filters.to],
      [
        "Definition",
        "Waiting time = called_at - queue_entered_at; service time = completed_at - service_started_at",
      ],
    ];
    const rows = report.tickets.map((ticket) => [
      ticket.publicNumber,
      ticket.service,
      ticket.status,
      ticket.priority,
      ticket.issuedAt,
      ticket.calledAt,
      ticket.completedAt,
      ticket.counter,
      ticket.teller,
      ticket.noShowCount,
    ]);
    return [
      ...metadata.map((row) => row.map(q).join(",")),
      "",
      [
        "Ticket",
        "Service",
        "Status",
        "Priority",
        "Issued At",
        "Called At",
        "Completed At",
        "Counter",
        "Teller",
        "No Shows",
      ]
        .map(q)
        .join(","),
      ...rows.map((row) => row.map(q).join(",")),
    ].join("\n");
  }
}

@Injectable()
export class ManagerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  async dashboard(branchId: string) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const [
      branch,
      services,
      counters,
      issued,
      waiting,
      completed,
      activeTickets,
    ] = await Promise.all([
      this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } }),
      this.prisma.serviceType.findMany({
        where: { branchId },
        orderBy: { displayOrder: "asc" },
      }),
      this.prisma.counter.findMany({
        where: { branchId },
        include: {
          assignedService: true,
          sessions: {
            where: { status: { in: ["OPEN", "PAUSED"] } },
            include: { staff: true },
          },
        },
        orderBy: { label: "asc" },
      }),
      this.prisma.ticket.count({
        where: { branchId, issuedAt: { gte: start } },
      }),
      this.prisma.ticket.count({ where: { branchId, status: "WAITING" } }),
      this.prisma.ticket.count({
        where: { branchId, status: "COMPLETED", completedAt: { gte: start } },
      }),
      this.prisma.ticket.findMany({
        where: { branchId, status: { in: ["CALLED", "IN_SERVICE"] } },
        select: {
          id: true,
          publicNumber: true,
          status: true,
          assignedCounterId: true,
        },
      }),
    ]);
    const queueCards = await Promise.all(
      services.map(async (service) => ({
        id: service.id,
        code: service.code,
        name: service.name,
        status: service.status,
        waiting: await this.prisma.ticket.count({
          where: {
            branchId,
            currentServiceTypeId: service.id,
            status: "WAITING",
          },
        }),
        priorityWaiting: await this.prisma.ticket.count({
          where: {
            branchId,
            currentServiceTypeId: service.id,
            status: "WAITING",
            priority: true,
          },
        }),
        oldest: await this.prisma.ticket.findFirst({
          where: {
            branchId,
            currentServiceTypeId: service.id,
            status: "WAITING",
          },
          orderBy: { queueEnteredAt: "asc" },
          select: { queueEnteredAt: true },
        }),
      })),
    );
    return {
      branch: {
        id: branch.id,
        code: branch.code,
        name: branch.name,
        timezone: branch.timezone,
        settings: branch.settings,
      },
      kpis: { issued, waiting, active: activeTickets.length, completed },
      queues: queueCards.map((q) => ({
        ...q,
        oldestWaitMinutes: q.oldest
          ? Math.floor(
              (Date.now() - q.oldest.queueEnteredAt.getTime()) / 60_000,
            )
          : 0,
      })),
      counters: counters.map((counter) => ({
        id: counter.id,
        label: counter.label,
        status: counter.status,
        isActive: counter.isActive,
        service: counter.assignedService,
        teller: counter.sessions[0]?.staff ?? null,
        activeTicket:
          activeTickets.find(
            (ticket) => ticket.assignedCounterId === counter.id,
          ) ?? null,
      })),
    };
  }

  async adminOverview() {
    const [
      totalBranches,
      activeBranches,
      totalStaff,
      administrators,
      lockedStaff,
      activeServices,
      activeSessions,
    ] = await Promise.all([
      this.prisma.branch.count(),
      this.prisma.branch.count({ where: { status: "ACTIVE" } }),
      this.prisma.staff.count(),
      this.prisma.staff.count({ where: { role: "ADMIN", status: "ACTIVE" } }),
      this.prisma.staff.count({
        where: {
          OR: [{ status: "LOCKED" }, { lockedUntil: { gt: new Date() } }],
        },
      }),
      this.prisma.serviceType.count({ where: { status: "ACTIVE" } }),
      this.prisma.counterSession.count({
        where: { status: { in: ["OPEN", "PAUSED"] } },
      }),
    ]);
    return {
      totalBranches,
      activeBranches,
      totalStaff,
      administrators,
      lockedStaff,
      activeServices,
      activeSessions,
    };
  }

  branches() {
    return this.prisma.branch.findMany({
      include: {
        _count: {
          select: {
            staff: true,
            services: true,
            counters: true,
            tickets: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });
  }

  async adminScope(user: RequestUser, requestedBranchId?: string) {
    const branchId = requestedBranchId?.trim() || user.branchId;
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch)
      throw new DomainError("RESOURCE_NOT_FOUND", "Branch not found.", 404);
    return { ...user, branchId: branch.id };
  }

  private validTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  }

  private defaultBranchSettings() {
    return {
      noShowTimeoutSeconds: 120,
      priorityFairnessLimit: 2,
      kioskIdleTimeoutSeconds: 45,
      displayHistoryCount: 5,
      slaWaitMinutes: 20,
      soundEnabled: true,
    };
  }

  async createBranch(
    user: RequestUser,
    body: {
      code?: string;
      name?: string;
      location?: string;
      timezone?: string;
    },
  ) {
    const code = body.code?.trim().toUpperCase() ?? "";
    const name = body.name?.trim() ?? "";
    const timezone = body.timezone?.trim() || "Africa/Addis_Ababa";
    if (!/^[A-Z0-9-]{2,20}$/.test(code) || name.length < 2 || name.length > 120)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Use a 2–20 character branch code and a valid branch name.",
        400,
      );
    if (!this.validTimezone(timezone))
      throw new DomainError("VALIDATION_ERROR", "Timezone is invalid.", 400);
    if (await this.prisma.branch.findUnique({ where: { code } }))
      throw new DomainError(
        "RESOURCE_CONFLICT",
        "That branch code is already in use.",
        409,
      );
    const branch = await this.prisma.branch.create({
      data: {
        code,
        name,
        location: body.location?.trim() || null,
        timezone,
        settings: this.defaultBranchSettings(),
      },
    });
    await this.audit(user, "BRANCH_CREATE", "BRANCH", branch.id);
    return branch;
  }

  async updateBranch(
    user: RequestUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.prisma.branch.findUnique({ where: { id } });
    if (!existing)
      throw new DomainError("RESOURCE_NOT_FOUND", "Branch not found.", 404);
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const timezone =
      typeof body.timezone === "string" ? body.timezone.trim() : undefined;
    if (name !== undefined && (name.length < 2 || name.length > 120))
      throw new DomainError("VALIDATION_ERROR", "Branch name is invalid.", 400);
    if (timezone !== undefined && !this.validTimezone(timezone))
      throw new DomainError("VALIDATION_ERROR", "Timezone is invalid.", 400);
    const status =
      body.status === "ACTIVE" || body.status === "INACTIVE"
        ? body.status
        : undefined;
    if (status === "INACTIVE" && existing.status !== "INACTIVE") {
      const [activeTickets, activeSessions] = await Promise.all([
        this.prisma.ticket.count({
          where: {
            branchId: id,
            status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
          },
        }),
        this.prisma.counterSession.count({
          where: { branchId: id, status: { in: ["OPEN", "PAUSED"] } },
        }),
      ]);
      if (activeTickets || activeSessions)
        throw new DomainError(
          "COUNTER_BUSY",
          "Close active sessions and resolve active tickets before deactivating this branch.",
          409,
        );
    }
    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        name,
        location:
          typeof body.location === "string"
            ? body.location.trim() || null
            : body.location === null
              ? null
              : undefined,
        timezone,
        status,
      },
    });
    await this.audit({ ...user, branchId: id }, "BRANCH_UPDATE", "BRANCH", id);
    return branch;
  }

  services(branchId: string) {
    return this.prisma.serviceType.findMany({
      where: { branchId },
      orderBy: { displayOrder: "asc" },
    });
  }
  counters(branchId: string) {
    return this.prisma.counter.findMany({
      where: { branchId },
      include: {
        assignedService: true,
        assignedStaff: {
          select: { id: true, name: true, username: true, status: true },
        },
      },
      orderBy: { label: "asc" },
    });
  }
  staff(branchId: string) {
    return this.prisma.staff.findMany({
      where: { branchId },
      select: {
        id: true,
        staffCode: true,
        name: true,
        username: true,
        role: true,
        status: true,
        failedLoginCount: true,
        lockedUntil: true,
        lastLoginAt: true,
        createdAt: true,
        assignedCounter: {
          select: { id: true, label: true, assignedServiceId: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async createService(
    user: RequestUser,
    body: {
      code?: string;
      name?: string;
      description?: string;
      averageServiceMinutes?: number;
      priorityEnabled?: boolean;
      displayOrder?: number;
    },
  ) {
    if (
      !body.code ||
      !body.name ||
      !body.averageServiceMinutes ||
      body.averageServiceMinutes < 1 ||
      body.averageServiceMinutes > 240
    )
      throw new DomainError(
        "VALIDATION_ERROR",
        "Valid service code, name, and service time are required.",
        400,
      );
    const service = await this.prisma.serviceType.create({
      data: {
        branchId: user.branchId,
        code: body.code.toUpperCase(),
        name: body.name,
        description: body.description,
        averageServiceMinutes: body.averageServiceMinutes,
        priorityEnabled: body.priorityEnabled ?? false,
        displayOrder: body.displayOrder ?? 0,
      },
    });
    await this.audit(user, "SERVICE_CREATE", "SERVICE_TYPE", service.id);
    this.realtime.publish(
      user.branchId,
      "dashboard.updated",
      { refetch: true },
      ["staff"],
    );
    return service;
  }

  async updateService(
    user: RequestUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.prisma.serviceType.findFirst({
      where: { id, branchId: user.branchId },
    });
    if (!existing)
      throw new DomainError("RESOURCE_NOT_FOUND", "Service not found.", 404);
    if (body.status === "INACTIVE") {
      const active = await this.prisma.ticket.count({
        where: {
          currentServiceTypeId: id,
          status: { in: ["WAITING", "CALLED", "IN_SERVICE"] },
        },
      });
      if (active)
        throw new DomainError(
          "COUNTER_BUSY",
          "Resolve or transfer active tickets before deactivating this service.",
        );
    }
    const service = await this.prisma.serviceType.update({
      where: { id },
      data: {
        code:
          typeof body.code === "string" ? body.code.toUpperCase() : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
        description:
          typeof body.description === "string" ? body.description : undefined,
        averageServiceMinutes:
          typeof body.averageServiceMinutes === "number"
            ? body.averageServiceMinutes
            : undefined,
        priorityEnabled:
          typeof body.priorityEnabled === "boolean"
            ? body.priorityEnabled
            : undefined,
        displayOrder:
          typeof body.displayOrder === "number" ? body.displayOrder : undefined,
        status:
          body.status === "ACTIVE" || body.status === "INACTIVE"
            ? body.status
            : undefined,
      },
    });
    await this.audit(user, "SERVICE_UPDATE", "SERVICE_TYPE", id);
    return service;
  }

  async createCounter(
    user: RequestUser,
    body: { label?: string; assignedServiceId?: string },
  ) {
    if (!body.label)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Counter label is required.",
        400,
      );
    if (
      body.assignedServiceId &&
      !(await this.prisma.serviceType.findFirst({
        where: { id: body.assignedServiceId, branchId: user.branchId },
      }))
    )
      throw new DomainError(
        "FORBIDDEN",
        "Service is outside your branch.",
        403,
      );
    const counter = await this.prisma.counter.create({
      data: {
        branchId: user.branchId,
        label: body.label,
        assignedServiceId: body.assignedServiceId,
      },
    });
    await this.audit(user, "COUNTER_CREATE", "COUNTER", counter.id);
    return counter;
  }

  async updateCounter(
    user: RequestUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const counter = await this.prisma.counter.findFirst({
      where: { id, branchId: user.branchId },
    });
    if (!counter)
      throw new DomainError("RESOURCE_NOT_FOUND", "Counter not found.", 404);
    const active = await this.prisma.ticket.count({
      where: {
        assignedCounterId: id,
        status: { in: ["CALLED", "IN_SERVICE"] },
      },
    });
    if (
      active &&
      (body.assignedServiceId ||
        body.isActive === false ||
        body.status === "CLOSED")
    )
      throw new DomainError(
        "COUNTER_BUSY",
        "Resolve the active ticket before changing this counter.",
      );
    if (
      typeof body.assignedServiceId === "string" &&
      !(await this.prisma.serviceType.findFirst({
        where: { id: body.assignedServiceId, branchId: user.branchId },
      }))
    )
      throw new DomainError(
        "FORBIDDEN",
        "Service is outside your branch.",
        403,
      );
    const updated = await this.prisma.counter.update({
      where: { id },
      data: {
        label: typeof body.label === "string" ? body.label : undefined,
        assignedServiceId:
          typeof body.assignedServiceId === "string"
            ? body.assignedServiceId
            : undefined,
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
    });
    await this.audit(user, "COUNTER_UPDATE", "COUNTER", id);
    return updated;
  }

  async createStaff(
    user: RequestUser,
    body: {
      staffCode?: string;
      name?: string;
      username?: string;
      password?: string;
      role?: StaffRole;
      assignedCounterId?: string;
    },
  ) {
    if (
      !body.staffCode ||
      !body.name ||
      !body.username ||
      !body.password ||
      body.password.length < 8 ||
      !body.role ||
      (body.role !== "TELLER" &&
        body.role !== "MANAGER" &&
        body.role !== "ADMIN")
    )
      throw new DomainError(
        "VALIDATION_ERROR",
        "Complete valid staff details are required.",
        400,
      );
    const assignedCounterId =
      body.role === "TELLER" ? body.assignedCounterId : undefined;
    if (body.role === "TELLER" && !assignedCounterId)
      throw new DomainError(
        "VALIDATION_ERROR",
        "A teller must be assigned to a counter.",
        400,
      );
    if (assignedCounterId)
      await this.assertCounterAssignmentAvailable(
        user.branchId,
        assignedCounterId,
      );
    const staff = await this.prisma.staff.create({
      data: {
        branchId: user.branchId,
        staffCode: body.staffCode,
        name: body.name,
        username: body.username.toLowerCase(),
        passwordHash: await argon2.hash(body.password, {
          type: argon2.argon2id,
        }),
        role: body.role,
        assignedCounterId,
      },
      select: {
        id: true,
        staffCode: true,
        name: true,
        username: true,
        role: true,
        status: true,
        assignedCounter: { select: { id: true, label: true } },
      },
    });
    await this.audit(user, "STAFF_CREATE", "STAFF", staff.id);
    return staff;
  }

  async updateStaff(
    user: RequestUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    const target = await this.prisma.staff.findFirst({
      where: { id, branchId: user.branchId },
    });
    if (!target)
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "Staff account not found.",
        404,
      );
    const nextRole =
      body.role === "TELLER" || body.role === "MANAGER" || body.role === "ADMIN"
        ? body.role
        : target.role;
    const nextStatus =
      body.status === "ACTIVE" ||
      body.status === "INACTIVE" ||
      body.status === "LOCKED"
        ? body.status
        : target.status;
    if (id === user.sub && (nextRole !== "ADMIN" || nextStatus !== "ACTIVE"))
      throw new DomainError(
        "VALIDATION_ERROR",
        "An administrator cannot remove or lock their own active administrator access.",
        400,
      );
    if (
      target.role === "ADMIN" &&
      (nextRole !== "ADMIN" || nextStatus !== "ACTIVE") &&
      (await this.prisma.staff.count({
        where: { role: "ADMIN", status: "ACTIVE", id: { not: id } },
      })) === 0
    )
      throw new DomainError(
        "VALIDATION_ERROR",
        "At least one active administrator account must remain.",
        400,
      );
    const requestedCounterId =
      typeof body.assignedCounterId === "string"
        ? body.assignedCounterId
        : body.assignedCounterId === null
          ? null
          : target.assignedCounterId;
    const nextCounterId = nextRole === "TELLER" ? requestedCounterId : null;
    const accessChanged =
      nextRole !== target.role || nextStatus !== target.status;
    if (nextRole === "TELLER" && !nextCounterId)
      throw new DomainError(
        "VALIDATION_ERROR",
        "A teller must be assigned to a counter.",
        400,
      );
    if (nextCounterId && nextCounterId !== target.assignedCounterId) {
      const activeSession = await this.prisma.counterSession.findFirst({
        where: { staffId: id, status: { in: ["OPEN", "PAUSED"] } },
        select: { id: true },
      });
      if (activeSession)
        throw new DomainError(
          "COUNTER_BUSY",
          "Close the teller's active session before reassigning the counter.",
          409,
        );
      await this.assertCounterAssignmentAvailable(
        user.branchId,
        nextCounterId,
        id,
      );
    }
    const staff = await this.prisma.staff.update({
      where: { id },
      data: {
        name: typeof body.name === "string" ? body.name : undefined,
        role:
          body.role === "TELLER" ||
          body.role === "MANAGER" ||
          body.role === "ADMIN"
            ? body.role
            : undefined,
        assignedCounterId: nextCounterId,
        status: nextStatus,
        authVersion: accessChanged ? { increment: 1 } : undefined,
      },
      select: {
        id: true,
        staffCode: true,
        name: true,
        username: true,
        role: true,
        status: true,
        assignedCounter: { select: { id: true, label: true } },
      },
    });
    if (accessChanged)
      await this.prisma.refreshSession.updateMany({
        where: { staffId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    await this.audit(user, "STAFF_UPDATE", "STAFF", id);
    return staff;
  }

  private async assertCounterAssignmentAvailable(
    branchId: string,
    counterId: string,
    excludeStaffId?: string,
  ) {
    const counter = await this.prisma.counter.findFirst({
      where: { id: counterId, branchId, isActive: true },
      select: { id: true, assignedServiceId: true },
    });
    if (!counter?.assignedServiceId)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Choose an active counter with an assigned service.",
        400,
      );
    const assigned = await this.prisma.staff.findFirst({
      where: {
        assignedCounterId: counterId,
        ...(excludeStaffId ? { id: { not: excludeStaffId } } : {}),
      },
      select: { id: true },
    });
    if (assigned)
      throw new DomainError(
        "COUNTER_BUSY",
        "That counter is already assigned to another teller.",
        409,
      );
  }

  async resetPassword(user: RequestUser, id: string, password: string) {
    if (password.length < 8)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Password must contain at least eight characters.",
        400,
      );
    const target = await this.prisma.staff.findFirst({
      where: { id, branchId: user.branchId },
    });
    if (!target)
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "Staff account not found.",
        404,
      );
    await this.prisma.$transaction([
      this.prisma.staff.update({
        where: { id },
        data: {
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          failedLoginCount: 0,
          lockedUntil: null,
          status: "ACTIVE",
          authVersion: { increment: 1 },
        },
      }),
      this.prisma.refreshSession.updateMany({
        where: { staffId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit(user, "STAFF_PASSWORD_RESET", "STAFF", id);
    return { success: true };
  }

  async unlock(user: RequestUser, id: string) {
    const result = await this.prisma.staff.updateMany({
      where: { id, branchId: user.branchId },
      data: { failedLoginCount: 0, lockedUntil: null, status: "ACTIVE" },
    });
    if (!result.count)
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "Staff account not found.",
        404,
      );
    await this.audit(user, "STAFF_UNLOCK", "STAFF", id);
    return { success: true };
  }

  async settings(branchId: string) {
    const branch = await this.prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
    });
    return { timezone: branch.timezone, settings: branch.settings };
  }
  async updateSettings(user: RequestUser, body: Record<string, unknown>) {
    const priorityFairnessLimit = Number(body.priorityFairnessLimit);
    const noShowTimeoutSeconds = Number(body.noShowTimeoutSeconds);
    const kioskIdleTimeoutSeconds = Number(body.kioskIdleTimeoutSeconds);
    const displayHistoryCount = Number(body.displayHistoryCount);
    const slaWaitMinutes = Number(body.slaWaitMinutes);
    if (
      priorityFairnessLimit < 1 ||
      priorityFairnessLimit > 5 ||
      noShowTimeoutSeconds < 30 ||
      noShowTimeoutSeconds > 600 ||
      kioskIdleTimeoutSeconds < 15 ||
      kioskIdleTimeoutSeconds > 300 ||
      displayHistoryCount < 1 ||
      displayHistoryCount > 20 ||
      slaWaitMinutes < 1 ||
      slaWaitMinutes > 240
    )
      throw new DomainError(
        "VALIDATION_ERROR",
        "One or more branch settings are outside the allowed range.",
        400,
      );
    const settings = {
      priorityFairnessLimit,
      noShowTimeoutSeconds,
      kioskIdleTimeoutSeconds,
      displayHistoryCount,
      slaWaitMinutes,
    };
    await this.prisma.branch.update({
      where: { id: user.branchId },
      data: {
        timezone: typeof body.timezone === "string" ? body.timezone : undefined,
        settings,
      },
    });
    await this.audit(user, "BRANCH_SETTINGS_UPDATE", "BRANCH", user.branchId);
    this.realtime.publish(
      user.branchId,
      "system.notice",
      { kind: "SETTINGS_UPDATED", refetch: true },
      ["staff", "display", "kiosk"],
    );
    return { settings };
  }

  auditLogs(branchId: string, query: Record<string, string | undefined>) {
    return this.prisma.auditLog.findMany({
      where: {
        branchId,
        ...(query.action
          ? { action: { contains: query.action, mode: "insensitive" } }
          : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(query.limit ?? 100), 200),
    });
  }
  audit(
    user: RequestUser,
    action: string,
    targetType: string,
    targetId: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        branchId: user.branchId,
        actorType: "STAFF",
        actorId: user.sub,
        action,
        targetType,
        targetId,
        outcome: "SUCCESS",
      },
    });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("MANAGER")
@Controller("manager")
export class ManagerController {
  constructor(
    @Inject(ManagerService) private readonly manager: ManagerService,
    @Inject(ReportQueryService) private readonly reports: ReportQueryService,
  ) {}
  @Get("dashboard/live") dashboard(@CurrentUser() user: RequestUser) {
    return this.manager.dashboard(user.branchId);
  }
  @Get("reports/summary") report(
    @CurrentUser() user: RequestUser,
    @Query() query: ReportFilters,
  ) {
    return this.reports.summary(user.branchId, query);
  }
  @Get("reports/tickets.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", "attachment; filename=bank-qms-report.csv")
  async csv(@CurrentUser() user: RequestUser, @Query() query: ReportFilters) {
    const report = await this.reports.summary(user.branchId, query);
    await this.manager.audit(user, "REPORT_EXPORT", "REPORT", user.branchId);
    return this.reports.toCsv(report);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller("admin")
export class AdminController {
  constructor(
    @Inject(ManagerService) private readonly administration: ManagerService,
  ) {}

  @Get("overview") overview() {
    return this.administration.adminOverview();
  }

  @Get("branches") branches() {
    return this.administration.branches();
  }

  @Post("branches") createBranch(
    @CurrentUser() user: RequestUser,
    @Body() body: Parameters<ManagerService["createBranch"]>[1],
  ) {
    return this.administration.createBranch(user, body);
  }

  @Patch("branches/:id") updateBranch(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.administration.updateBranch(user, id, body);
  }

  private scope(user: RequestUser, branchId?: string) {
    return this.administration.adminScope(user, branchId);
  }

  @Get("services") async services(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId?: string,
  ) {
    const scoped = await this.scope(user, branchId);
    return this.administration.services(scoped.branchId);
  }

  @Post("services") async createService(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Body() body: Parameters<ManagerService["createService"]>[1],
  ) {
    return this.administration.createService(
      await this.scope(user, branchId),
      body,
    );
  }

  @Patch("services/:id") async updateService(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.administration.updateService(
      await this.scope(user, branchId),
      id,
      body,
    );
  }

  @Post("services/:id/activate") async activateService(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Param("id") id: string,
  ) {
    return this.administration.updateService(
      await this.scope(user, branchId),
      id,
      { status: "ACTIVE" },
    );
  }

  @Post("services/:id/deactivate") async deactivateService(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Param("id") id: string,
  ) {
    return this.administration.updateService(
      await this.scope(user, branchId),
      id,
      { status: "INACTIVE" },
    );
  }

  @Get("counters") async counters(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId?: string,
  ) {
    const scoped = await this.scope(user, branchId);
    return this.administration.counters(scoped.branchId);
  }

  @Post("counters") async createCounter(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Body() body: Parameters<ManagerService["createCounter"]>[1],
  ) {
    return this.administration.createCounter(
      await this.scope(user, branchId),
      body,
    );
  }

  @Patch("counters/:id") async updateCounter(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.administration.updateCounter(
      await this.scope(user, branchId),
      id,
      body,
    );
  }

  @Post("counters/:id/assign-service") async assignCounter(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Param("id") id: string,
    @Body() body: { serviceTypeId?: string },
  ) {
    return this.administration.updateCounter(
      await this.scope(user, branchId),
      id,
      { assignedServiceId: body.serviceTypeId },
    );
  }

  @Get("staff") async staff(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId?: string,
  ) {
    const scoped = await this.scope(user, branchId);
    return this.administration.staff(scoped.branchId);
  }

  @Post("staff") async createStaff(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Body() body: Parameters<ManagerService["createStaff"]>[1],
  ) {
    return this.administration.createStaff(
      await this.scope(user, branchId),
      body,
    );
  }

  @Patch("staff/:id") async updateStaff(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.administration.updateStaff(
      await this.scope(user, branchId),
      id,
      body,
    );
  }

  @Post("staff/:id/reset-password") async resetPassword(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Param("id") id: string,
    @Body() body: { password?: string },
  ) {
    return this.administration.resetPassword(
      await this.scope(user, branchId),
      id,
      body.password ?? "",
    );
  }

  @Post("staff/:id/unlock") async unlock(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Param("id") id: string,
  ) {
    return this.administration.unlock(await this.scope(user, branchId), id);
  }

  @Get("settings") async settings(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId?: string,
  ) {
    const scoped = await this.scope(user, branchId);
    return this.administration.settings(scoped.branchId);
  }

  @Patch("settings") async updateSettings(
    @CurrentUser() user: RequestUser,
    @Query("branchId") branchId: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.administration.updateSettings(
      await this.scope(user, branchId),
      body,
    );
  }

  @Get("audit-logs") async audit(
    @CurrentUser() user: RequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    const scoped = await this.scope(user, query.branchId);
    return this.administration.auditLogs(scoped.branchId, query);
  }
}
