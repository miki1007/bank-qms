import {
  Body,
  Controller,
  Get,
  Headers,
  Injectable,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import { Prisma, TicketStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { createHash, randomInt } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { PrismaService } from "../prisma.service";
import { DomainError } from "../shared/domain-error";
import { PublicRoute, RequestUser } from "./auth";
import {
  CurrentCustomer,
  CustomerJwtAuthGuard,
  CustomerRequestUser,
} from "./customer-auth";
import { QueueSelectionService } from "./queue-selection.service";
import { RealtimePublisher } from "./realtime";

const createTicketSchema = z.object({
  serviceTypeId: z.string().uuid(),
  priority: z.boolean().default(false),
  priorityReason: z
    .enum(["ELDERLY", "DISABILITY", "PREGNANCY", "OTHER"])
    .nullable()
    .optional(),
  idempotencyKey: z.string().uuid(),
});
const proofSchema = z
  .object({
    branchCode: z.string().min(2).max(20),
    publicNumber: z.string().min(3).max(30),
    lookupCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    lookupToken: z.string().min(20).optional(),
  })
  .refine(
    (value) => value.lookupCode || value.lookupToken,
    "Lookup proof is required",
  );

type LockedTicket = {
  id: string;
  branch_id: string;
  current_service_type_id: string;
  status: TicketStatus;
  assigned_counter_id: string | null;
  assigned_staff_id: string | null;
  counter_session_id: string | null;
  public_number: string;
  priority: boolean;
  version: number;
};

export class TicketNumberService {
  format(code: string, sequence: number) {
    return `${code}-${String(sequence).padStart(3, "0")}`;
  }
}

export class WaitEstimationService {
  estimate(
    peopleAhead: number,
    serviceMinutes: number,
    activeCounters: number,
  ) {
    return activeCounters <= 0
      ? null
      : Math.ceil((peopleAhead * serviceMinutes) / activeCounters);
  }
}

export class TicketTransitionPolicy {
  private readonly allowed: Record<TicketStatus, TicketStatus[]> = {
    ISSUED: ["WAITING"],
    WAITING: ["CALLED", "CANCELLED"],
    CALLED: ["IN_SERVICE", "WAITING", "CANCELLED"],
    IN_SERVICE: ["COMPLETED", "WAITING"],
    COMPLETED: [],
    CANCELLED: [],
  };
  assert(from: TicketStatus, to: TicketStatus) {
    if (!this.allowed[from].includes(to))
      throw new DomainError(
        "TICKET_INVALID_STATE",
        `Ticket cannot move from ${from} to ${to}.`,
      );
  }
}

@Injectable()
export class TicketWorkflowService {
  private readonly number = new TicketNumberService();
  private readonly waits = new WaitEstimationService();
  private readonly policy = new TicketTransitionPolicy();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly selector: QueueSelectionService,
    private readonly realtime: RealtimePublisher,
  ) {}

  private settings(value: Prisma.JsonValue) {
    const settings = (value ?? {}) as Record<string, unknown>;
    return {
      priorityFairnessLimit: Number(settings.priorityFairnessLimit ?? 2),
      noShowTimeoutSeconds: Number(settings.noShowTimeoutSeconds ?? 120),
      slaWaitMinutes: Number(settings.slaWaitMinutes ?? 20),
    };
  }

  private requireIdempotencyKey(idempotencyKey: string) {
    const parsed = z.string().uuid().safeParse(idempotencyKey);
    if (!parsed.success)
      throw new DomainError(
        "VALIDATION_ERROR",
        "A valid Idempotency-Key header is required.",
        400,
      );
    return parsed.data;
  }

  private async beginStaffTicketMutation(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    idempotencyKey: string,
    operation: string,
    ticketId: string,
    request: Record<string, unknown> = {},
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ ticketId, ...request }))
      .digest("hex");
    const lockKey = `${user.branchId}:${operation}:${user.sub}:${idempotencyKey}`;
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
    );
    const previous = await tx.idempotencyRecord.findUnique({
      where: {
        branchId_operation_actorScope_key: {
          branchId: user.branchId,
          operation,
          actorScope: user.sub,
          key: idempotencyKey,
        },
      },
    });
    if (!previous) return { requestHash, replayedTicket: null };
    if (previous.requestHash !== requestHash || !previous.resultId)
      throw new DomainError(
        "IDEMPOTENCY_KEY_CONFLICT",
        "This request key was already used for different action details.",
        409,
      );
    const replayedTicket = await tx.ticket.findFirst({
      where: { id: previous.resultId, branchId: user.branchId },
      include: { currentService: true, assignedCounter: true },
    });
    if (!replayedTicket)
      throw new DomainError(
        "IDEMPOTENCY_RESULT_UNAVAILABLE",
        "The original ticket action result is unavailable.",
        409,
      );
    return { requestHash, replayedTicket };
  }

  private async saveStaffTicketMutation(
    tx: Prisma.TransactionClient,
    user: RequestUser,
    idempotencyKey: string,
    operation: string,
    requestHash: string,
    ticketId: string,
  ) {
    await tx.idempotencyRecord.create({
      data: {
        branchId: user.branchId,
        operation,
        actorScope: user.sub,
        key: idempotencyKey,
        requestHash,
        responseCode: 200,
        responseBody: { ticketId },
        resultId: ticketId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
  }

  private async validateDevice(
    branchId: string,
    deviceCode: string,
    deviceSecret: string,
    expectedType: "KIOSK" | "DISPLAY" = "KIOSK",
  ) {
    const device = await this.prisma.device.findUnique({
      where: { deviceCode },
    });
    if (
      !device ||
      device.branchId !== branchId ||
      device.type !== expectedType ||
      device.status !== "ACTIVE" ||
      !(await argon2.verify(device.credentialHash, deviceSecret))
    )
      throw new DomainError(
        "FORBIDDEN",
        "This device is not authorized for the branch.",
        403,
      );
    return device;
  }

  private async safeView(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { currentService: true, assignedCounter: true },
    });
    if (!ticket)
      throw new DomainError("RESOURCE_NOT_FOUND", "Ticket not found.", 404);
    let peopleAhead: number | null = null;
    let estimatedWaitMinutes: number | null = null;
    if (ticket.status === "WAITING") {
      peopleAhead = await this.prisma.ticket.count({
        where: {
          branchId: ticket.branchId,
          currentServiceTypeId: ticket.currentServiceTypeId,
          status: "WAITING",
          OR: [
            {
              priority: ticket.priority,
              queueEnteredAt: { lt: ticket.queueEnteredAt },
            },
            ...(ticket.priority ? [] : [{ priority: true }]),
          ],
        },
      });
      const activeCounters = await this.prisma.counterSession.count({
        where: {
          branchId: ticket.branchId,
          serviceTypeId: ticket.currentServiceTypeId,
          status: "OPEN",
        },
      });
      estimatedWaitMinutes = this.waits.estimate(
        peopleAhead,
        ticket.currentService.averageServiceMinutes,
        activeCounters,
      );
    }
    return {
      id: ticket.id,
      publicNumber: ticket.publicNumber,
      serviceName: ticket.currentService.name,
      status: ticket.status,
      issuedAt: ticket.issuedAt.toISOString(),
      peopleAhead,
      estimatedWaitMinutes,
      positionIsEstimate: true,
      counterLabel: ticket.assignedCounter?.label ?? null,
      version: ticket.version,
    };
  }

  async listServices(branchCode: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { code: branchCode.toUpperCase() },
    });
    if (!branch || branch.status !== "ACTIVE")
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "Branch is unavailable.",
        404,
      );
    const services = await this.prisma.serviceType.findMany({
      where: { branchId: branch.id, status: "ACTIVE" },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
    return Promise.all(
      services.map(async (service) => {
        const [waitingCount, activeCounters] = await Promise.all([
          this.prisma.ticket.count({
            where: {
              branchId: branch.id,
              currentServiceTypeId: service.id,
              status: "WAITING",
            },
          }),
          this.prisma.counterSession.count({
            where: {
              branchId: branch.id,
              serviceTypeId: service.id,
              status: "OPEN",
            },
          }),
        ]);
        return {
          id: service.id,
          code: service.code,
          name: service.name,
          description: service.description,
          averageServiceMinutes: service.averageServiceMinutes,
          priorityEnabled: service.priorityEnabled,
          waitingCount,
          estimatedWaitMinutes: this.waits.estimate(
            waitingCount,
            service.averageServiceMinutes,
            activeCounters,
          ),
        };
      }),
    );
  }

  async bootstrapDevice(deviceCode: string, deviceSecret: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceCode },
      include: { branch: true },
    });
    if (
      !device ||
      device.status !== "ACTIVE" ||
      !(await argon2.verify(device.credentialHash, deviceSecret))
    )
      throw new DomainError("FORBIDDEN", "Device authentication failed.", 403);
    const calls =
      device.type === "DISPLAY"
        ? await this.prisma.ticket.findMany({
            where: {
              branchId: device.branchId,
              status: { in: ["CALLED", "IN_SERVICE"] },
            },
            include: { assignedCounter: true, currentService: true },
            orderBy: { calledAt: "desc" },
            take: Number(
              (device.branch.settings as Record<string, unknown>)
                .displayHistoryCount ?? 5,
            ),
          })
        : [];
    return {
      device: { code: device.deviceCode, type: device.type, name: device.name },
      branch: {
        id: device.branch.id,
        code: device.branch.code,
        name: device.branch.name,
        timezone: device.branch.timezone,
      },
      calls: calls.map((ticket) => ({
        publicNumber: ticket.publicNumber,
        counterLabel: ticket.assignedCounter?.label,
        serviceName: ticket.currentService.name,
        calledAt: ticket.calledAt,
      })),
    };
  }

  async createTicket(
    branchCode: string,
    input: unknown,
    authorization:
      | { kind: "device"; deviceCode: string; deviceSecret: string }
      | { kind: "customer"; customerId: string },
  ) {
    const parsed = createTicketSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Ticket request is invalid.",
        400,
        parsed.error.flatten(),
      );
    const branch = await this.prisma.branch.findUnique({
      where: { code: branchCode.toUpperCase() },
    });
    if (!branch || branch.status !== "ACTIVE")
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "Branch is unavailable.",
        404,
      );
    const actorScope =
      authorization.kind === "device"
        ? (
            await this.validateDevice(
              branch.id,
              authorization.deviceCode,
              authorization.deviceSecret,
            )
          ).id
        : authorization.customerId;
    const customerId =
      authorization.kind === "customer" ? authorization.customerId : null;
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          serviceTypeId: parsed.data.serviceTypeId,
          priority: parsed.data.priority,
          priorityReason: parsed.data.priorityReason ?? null,
        }),
      )
      .digest("hex");
    const lookupCode = String(randomInt(100000, 1_000_000));
    const lookupSecretHash = await argon2.hash(lookupCode, {
      type: argon2.argon2id,
    });
    const localBusinessDate = DateTime.now()
      .setZone(branch.timezone)
      .toISODate();
    if (!localBusinessDate)
      throw new DomainError(
        "CONFIGURATION_ERROR",
        "The branch timezone could not produce a business date.",
        500,
      );
    const businessDate = new Date(`${localBusinessDate}T00:00:00.000Z`);
    const creation = await this.prisma.$transaction(
      async (tx) => {
        const lockKey = `${branch.id}:CREATE_TICKET:${actorScope}:${parsed.data.idempotencyKey}`;
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
        );
        const existing = await tx.idempotencyRecord.findUnique({
          where: {
            branchId_operation_actorScope_key: {
              branchId: branch.id,
              operation: "CREATE_TICKET",
              actorScope,
              key: parsed.data.idempotencyKey,
            },
          },
        });
        if (existing) {
          if (existing.requestHash !== requestHash)
            throw new DomainError(
              "IDEMPOTENCY_KEY_CONFLICT",
              "This request key was already used for different ticket details.",
            );
          return {
            ticketId: String(existing.resultId),
            lookupToken: String(
              (existing.responseBody as Record<string, unknown>).lookupToken ??
                "",
            ),
            replay: true,
            serviceId: parsed.data.serviceTypeId,
          };
        }
        const service = await tx.serviceType.findFirst({
          where: {
            id: parsed.data.serviceTypeId,
            branchId: branch.id,
            status: "ACTIVE",
          },
        });
        if (!service)
          throw new DomainError(
            "SERVICE_INACTIVE",
            "The selected service is no longer available.",
          );
        if (parsed.data.priority && !service.priorityEnabled)
          throw new DomainError(
            "VALIDATION_ERROR",
            "Priority service is not enabled for this service.",
            400,
          );
        if (parsed.data.priority && !parsed.data.priorityReason)
          throw new DomainError(
            "VALIDATION_ERROR",
            "A priority eligibility reason is required.",
            400,
          );
        const sequenceRows = await tx.$queryRaw<
          Array<{ last_value: number }>
        >(Prisma.sql`
        INSERT INTO daily_sequences (branch_id, service_type_id, business_date, last_value)
        VALUES (${branch.id}::uuid, ${service.id}::uuid, ${businessDate}::date, 1)
        ON CONFLICT (branch_id, service_type_id, business_date)
        DO UPDATE SET last_value = daily_sequences.last_value + 1
        RETURNING last_value
      `);
        const sequence = sequenceRows[0].last_value;
        const created = await tx.ticket.create({
          data: {
            branchId: branch.id,
            currentServiceTypeId: service.id,
            originalServiceTypeId: service.id,
            publicNumber: this.number.format(service.code, sequence),
            businessDate,
            dailySequence: sequence,
            status: "WAITING",
            priority: parsed.data.priority,
            priorityReason: parsed.data.priority
              ? parsed.data.priorityReason
              : null,
            queueEnteredAt: new Date(),
            lookupSecretHash,
            customerId,
          },
          include: { currentService: true },
        });
        await tx.ticketEvent.createMany({
          data: [
            {
              ticketId: created.id,
              branchId: branch.id,
              eventType: "ISSUED",
              fromStatus: null,
              toStatus: "ISSUED",
              serviceTypeId: service.id,
            },
            {
              ticketId: created.id,
              branchId: branch.id,
              eventType: "ENQUEUED",
              fromStatus: "ISSUED",
              toStatus: "WAITING",
              serviceTypeId: service.id,
            },
          ],
        });
        const lookupToken = await this.jwt.signAsync(
          { kind: "ticket-lookup", ticketId: created.id, branchId: branch.id },
          { expiresIn: "24h" },
        );
        await tx.idempotencyRecord.create({
          data: {
            branchId: branch.id,
            operation: "CREATE_TICKET",
            actorScope,
            key: parsed.data.idempotencyKey,
            requestHash,
            responseCode: 201,
            responseBody: { lookupToken },
            resultId: created.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
          },
        });
        return {
          ticketId: created.id,
          lookupToken,
          replay: false,
          serviceId: service.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    const safe = await this.safeView(creation.ticketId);
    if (creation.replay)
      return {
        ticket: {
          ...safe,
          ...(authorization.kind === "device"
            ? { lookupToken: creation.lookupToken }
            : {}),
          idempotentReplay: true,
        },
      };
    this.realtime.publish(
      branch.id,
      "ticket.created",
      {
        id: safe.id,
        publicNumber: safe.publicNumber,
        serviceId: creation.serviceId,
        priority: parsed.data.priority,
        status: safe.status,
        issuedAt: safe.issuedAt,
      },
      ["staff"],
    );
    this.realtime.publish(
      branch.id,
      "queue.updated",
      { serviceId: creation.serviceId, refetch: true },
      ["staff"],
    );
    if (customerId)
      this.realtime.publishCustomer(customerId, branch.id, "ticket.created", {
        id: safe.id,
        publicNumber: safe.publicNumber,
        serviceId: creation.serviceId,
        status: safe.status,
        version: safe.version,
      });
    return {
      ticket: {
        ...safe,
        ...(authorization.kind === "device"
          ? { lookupCode, lookupToken: creation.lookupToken }
          : {}),
        idempotentReplay: false,
      },
    };
  }

  async listBranches() {
    return this.prisma.branch.findMany({
      where: { status: "ACTIVE" },
      select: { code: true, name: true, location: true, timezone: true },
      orderBy: { name: "asc" },
    });
  }

  async customerHistory(customerId: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { customerId },
      include: {
        branch: { select: { code: true, name: true, timezone: true } },
        currentService: { select: { name: true } },
        assignedCounter: { select: { label: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 100,
    });
    return {
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        publicNumber: ticket.publicNumber,
        status: ticket.status,
        priority: ticket.priority,
        issuedAt: ticket.issuedAt.toISOString(),
        calledAt: ticket.calledAt?.toISOString() ?? null,
        completedAt: ticket.completedAt?.toISOString() ?? null,
        serviceName: ticket.currentService.name,
        counterLabel: ticket.assignedCounter?.label ?? null,
        branch: ticket.branch,
        version: ticket.version,
      })),
    };
  }

  async customerTicket(customerId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, customerId },
    });
    if (!ticket)
      throw new DomainError("RESOURCE_NOT_FOUND", "Ticket not found.", 404);
    return { ticket: await this.safeView(ticket.id) };
  }

  private async verifyProof(input: unknown) {
    const parsed = proofSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Ticket lookup information is invalid.",
        400,
      );
    const branch = await this.prisma.branch.findUnique({
      where: { code: parsed.data.branchCode.toUpperCase() },
    });
    const ticket = branch
      ? await this.prisma.ticket.findFirst({
          where: {
            branchId: branch.id,
            publicNumber: parsed.data.publicNumber.toUpperCase(),
          },
        })
      : null;
    let valid = false;
    if (ticket && parsed.data.lookupCode)
      valid = await argon2.verify(
        ticket.lookupSecretHash,
        parsed.data.lookupCode,
      );
    if (ticket && parsed.data.lookupToken) {
      try {
        const token = await this.jwt.verifyAsync<{
          kind: string;
          ticketId: string;
          branchId: string;
        }>(parsed.data.lookupToken);
        valid =
          token.kind === "ticket-lookup" &&
          token.ticketId === ticket.id &&
          token.branchId === branch?.id;
      } catch {
        valid = false;
      }
    }
    if (!ticket || !valid)
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "Ticket not found or code incorrect.",
        404,
      );
    return ticket;
  }

  async lookup(input: unknown) {
    const ticket = await this.verifyProof(input);
    return { ticket: await this.safeView(ticket.id) };
  }

  async customerCancel(ticketId: string, input: unknown) {
    const proof = await this.verifyProof(input);
    if (proof.id !== ticketId)
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "Ticket not found or code incorrect.",
        404,
      );
    return this.cancelLocked(ticketId);
  }

  async customerAccountCancel(customerId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, customerId },
      select: { id: true },
    });
    if (!ticket)
      throw new DomainError("RESOURCE_NOT_FOUND", "Ticket not found.", 404);
    return this.cancelLocked(ticketId);
  }

  private async cancelLocked(ticketId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<LockedTicket>>(
        Prisma.sql`SELECT * FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`,
      );
      const ticket = rows[0];
      if (!ticket)
        throw new DomainError("RESOURCE_NOT_FOUND", "Ticket not found.", 404);
      if (ticket.status === "CANCELLED")
        return tx.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      if (ticket.status !== "WAITING")
        throw new DomainError(
          "TICKET_INVALID_STATE",
          "Only a waiting ticket may be cancelled by the customer.",
        );
      this.policy.assert(ticket.status, "CANCELLED");
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          branchId: ticket.branch_id,
          eventType: "CANCELLED",
          fromStatus: ticket.status,
          toStatus: "CANCELLED",
          serviceTypeId: ticket.current_service_type_id,
          reason: "CUSTOMER_REQUEST",
        },
      });
      return updated;
    });
    this.realtime.publish(
      result.branchId,
      "ticket.updated",
      { id: result.id, status: result.status, version: result.version },
      ["staff"],
    );
    this.realtime.publish(
      result.branchId,
      "queue.updated",
      { serviceId: result.currentServiceTypeId, refetch: true },
      ["staff"],
    );
    if (result.customerId)
      this.realtime.publishCustomer(
        result.customerId,
        result.branchId,
        "ticket.updated",
        { id: result.id, status: result.status, version: result.version },
      );
    return { ticket: await this.safeView(result.id) };
  }

  async callNext(user: RequestUser, idempotencyKey: string) {
    const parsedKey = this.requireIdempotencyKey(idempotencyKey);
    const result = await this.prisma.$transaction(
      async (tx) => {
        const sessions = await tx.$queryRaw<
          Array<{
            id: string;
            branch_id: string;
            counter_id: string;
            staff_id: string;
            service_type_id: string;
            status: string;
          }>
        >(
          Prisma.sql`SELECT * FROM counter_sessions WHERE staff_id = ${user.sub}::uuid AND status = 'OPEN' FOR UPDATE`,
        );
        const session = sessions[0];
        if (!session || session.branch_id !== user.branchId)
          throw new DomainError(
            "FORBIDDEN",
            "An owned open counter session is required.",
            403,
          );
        const operation = "CALL_NEXT";
        const actorScope = user.sub;
        const requestHash = createHash("sha256")
          .update(
            JSON.stringify({
              sessionId: session.id,
              serviceTypeId: session.service_type_id,
            }),
          )
          .digest("hex");
        const lockKey = `${user.branchId}:${operation}:${actorScope}:${parsedKey}`;
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
        );
        const previous = await tx.idempotencyRecord.findUnique({
          where: {
            branchId_operation_actorScope_key: {
              branchId: user.branchId,
              operation,
              actorScope,
              key: parsedKey,
            },
          },
        });
        if (previous) {
          if (previous.requestHash !== requestHash || !previous.resultId)
            throw new DomainError(
              "IDEMPOTENCY_KEY_CONFLICT",
              "This request key was already used for a different operation.",
              409,
            );
          const replayed = await tx.ticket.findFirst({
            where: {
              id: previous.resultId,
              branchId: user.branchId,
              assignedStaffId: user.sub,
              counterSessionId: session.id,
            },
            include: { currentService: true, assignedCounter: true },
          });
          if (!replayed)
            throw new DomainError(
              "IDEMPOTENCY_RESULT_UNAVAILABLE",
              "The original Call Next result is unavailable.",
              409,
            );
          return { ticket: replayed, replay: true };
        }
        const active = await tx.ticket.findFirst({
          where: {
            assignedCounterId: session.counter_id,
            status: { in: ["CALLED", "IN_SERVICE"] },
          },
        });
        if (active)
          throw new DomainError(
            "COUNTER_BUSY",
            "Resolve the current ticket before calling another customer.",
          );
        const branch = await tx.branch.findUniqueOrThrow({
          where: { id: user.branchId },
        });
        const [priorityWaiting, standardWaiting, recentRows] =
          await Promise.all([
            tx.ticket.count({
              where: {
                branchId: user.branchId,
                currentServiceTypeId: session.service_type_id,
                status: "WAITING",
                priority: true,
              },
            }),
            tx.ticket.count({
              where: {
                branchId: user.branchId,
                currentServiceTypeId: session.service_type_id,
                status: "WAITING",
                priority: false,
              },
            }),
            tx.$queryRaw<Array<{ priority: boolean }>>(
              Prisma.sql`SELECT t.priority FROM ticket_events e JOIN tickets t ON t.id = e.ticket_id WHERE e.branch_id = ${user.branchId}::uuid AND e.service_type_id = ${session.service_type_id}::uuid AND e.event_type = 'CALLED' ORDER BY e.occurred_at DESC LIMIT 6`,
            ),
          ]);
        const lane = this.selector.chooseLane({
          priorityWaiting,
          standardWaiting,
          consecutivePriorityCalls:
            this.selector.countConsecutivePriority(recentRows),
          limit: this.settings(branch.settings).priorityFairnessLimit,
        });
        if (!lane)
          throw new DomainError("QUEUE_EMPTY", "No customers waiting.", 409);
        const candidates = await tx.$queryRaw<Array<LockedTicket>>(
          Prisma.sql`SELECT * FROM tickets WHERE branch_id = ${user.branchId}::uuid AND current_service_type_id = ${session.service_type_id}::uuid AND status = 'WAITING'::"TicketStatus" AND priority = ${lane === "priority"} ORDER BY queue_entered_at ASC, daily_sequence ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
        );
        const ticket = candidates[0];
        if (!ticket)
          throw new DomainError("QUEUE_EMPTY", "No customers waiting.", 409);
        this.policy.assert(ticket.status, "CALLED");
        const updated = await tx.ticket.update({
          where: { id: ticket.id },
          data: {
            status: "CALLED",
            assignedCounterId: session.counter_id,
            assignedStaffId: user.sub,
            counterSessionId: session.id,
            calledAt: new Date(),
            version: { increment: 1 },
          },
          include: { currentService: true, assignedCounter: true },
        });
        await tx.ticketEvent.create({
          data: {
            ticketId: updated.id,
            branchId: user.branchId,
            eventType: "CALLED",
            fromStatus: "WAITING",
            toStatus: "CALLED",
            serviceTypeId: updated.currentServiceTypeId,
            counterId: session.counter_id,
            staffId: user.sub,
            metadata: { priority: updated.priority },
          },
        });
        await tx.idempotencyRecord.create({
          data: {
            branchId: user.branchId,
            operation,
            actorScope,
            key: parsedKey,
            requestHash,
            responseCode: 201,
            responseBody: { ticketId: updated.id },
            resultId: updated.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
          },
        });
        return { ticket: updated, replay: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    if (result.replay) return { ticket: result.ticket, idempotentReplay: true };
    const ticket = result.ticket;
    const displayData = {
      publicNumber: ticket.publicNumber,
      counterLabel: ticket.assignedCounter?.label ?? "Counter",
      serviceName: ticket.currentService.name,
      calledAt: ticket.calledAt?.toISOString(),
      recall: false,
    };
    this.realtime.publish(ticket.branchId, "display.call", displayData, [
      "display",
      "staff",
    ]);
    this.realtime.publish(
      ticket.branchId,
      "ticket.updated",
      { id: ticket.id, status: ticket.status, version: ticket.version },
      ["staff"],
    );
    if (ticket.customerId)
      this.realtime.publishCustomer(
        ticket.customerId,
        ticket.branchId,
        "ticket.updated",
        { id: ticket.id, status: ticket.status, version: ticket.version },
      );
    this.realtime.publish(
      ticket.branchId,
      "queue.updated",
      { serviceId: ticket.currentServiceTypeId, refetch: true },
      ["staff"],
    );
    this.realtime.publish(
      ticket.branchId,
      "counter.updated",
      {
        counterId: ticket.assignedCounterId,
        activeTicket: ticket.publicNumber,
      },
      ["staff"],
    );
    return { ticket };
  }

  async recall(user: RequestUser, ticketId: string, idempotencyKey: string) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const operation = "RECALL_TICKET";
    const result = await this.prisma.$transaction(async (tx) => {
      const idempotency = await this.beginStaffTicketMutation(
        tx,
        user,
        key,
        operation,
        ticketId,
      );
      if (idempotency.replayedTicket)
        return { ticket: idempotency.replayedTicket, replay: true };
      const rows = await tx.$queryRaw<Array<LockedTicket>>(
        Prisma.sql`SELECT * FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`,
      );
      const ticket = rows[0];
      if (
        !ticket ||
        ticket.branch_id !== user.branchId ||
        ticket.assigned_staff_id !== user.sub ||
        ticket.status !== "CALLED"
      )
        throw new DomainError(
          "FORBIDDEN",
          "This ticket is not a called ticket in your counter session.",
          403,
        );
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: { recallCount: { increment: 1 }, version: { increment: 1 } },
        include: { assignedCounter: true, currentService: true },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: updated.id,
          branchId: updated.branchId,
          eventType: "RECALLED",
          fromStatus: "CALLED",
          toStatus: "CALLED",
          serviceTypeId: updated.currentServiceTypeId,
          counterId: updated.assignedCounterId,
          staffId: user.sub,
        },
      });
      await this.saveStaffTicketMutation(
        tx,
        user,
        key,
        operation,
        idempotency.requestHash,
        updated.id,
      );
      return { ticket: updated, replay: false };
    });
    if (result.replay) return { ticket: result.ticket, idempotentReplay: true };
    const ticket = result.ticket;
    this.realtime.publish(
      ticket.branchId,
      "display.call",
      {
        publicNumber: ticket.publicNumber,
        counterLabel: ticket.assignedCounter?.label,
        serviceName: ticket.currentService.name,
        calledAt: ticket.calledAt,
        recall: true,
      },
      ["display", "staff"],
    );
    if (ticket.customerId)
      this.realtime.publishCustomer(
        ticket.customerId,
        ticket.branchId,
        "ticket.updated",
        { id: ticket.id, status: ticket.status, version: ticket.version },
      );
    return { ticket };
  }

  async start(user: RequestUser, ticketId: string, idempotencyKey: string) {
    return this.transitionOwned(
      user,
      ticketId,
      idempotencyKey,
      "CALLED",
      "IN_SERVICE",
      "SERVICE_STARTED",
      { serviceStartedAt: new Date() },
    );
  }
  async complete(user: RequestUser, ticketId: string, idempotencyKey: string) {
    return this.transitionOwned(
      user,
      ticketId,
      idempotencyKey,
      "IN_SERVICE",
      "COMPLETED",
      "COMPLETED",
      { completedAt: new Date() },
    );
  }

  private async transitionOwned(
    user: RequestUser,
    ticketId: string,
    idempotencyKey: string,
    from: TicketStatus,
    to: TicketStatus,
    eventType: "SERVICE_STARTED" | "COMPLETED",
    extra: Record<string, unknown>,
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const operation =
      eventType === "COMPLETED" ? "COMPLETE_TICKET" : "START_TICKET";
    const result = await this.prisma.$transaction(async (tx) => {
      const idempotency = await this.beginStaffTicketMutation(
        tx,
        user,
        key,
        operation,
        ticketId,
      );
      if (idempotency.replayedTicket)
        return { ticket: idempotency.replayedTicket, replay: true };
      const rows = await tx.$queryRaw<Array<LockedTicket>>(
        Prisma.sql`SELECT * FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`,
      );
      const ticket = rows[0];
      if (
        !ticket ||
        ticket.branch_id !== user.branchId ||
        ticket.assigned_staff_id !== user.sub
      )
        throw new DomainError(
          "FORBIDDEN",
          "This ticket is not active in your counter session.",
          403,
        );
      this.policy.assert(ticket.status, to);
      if (ticket.status !== from)
        throw new DomainError(
          "TICKET_INVALID_STATE",
          `Ticket must be ${from} for this action.`,
        );
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: to, ...extra, version: { increment: 1 } },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          branchId: ticket.branch_id,
          eventType,
          fromStatus: from,
          toStatus: to,
          serviceTypeId: ticket.current_service_type_id,
          counterId: ticket.assigned_counter_id,
          staffId: user.sub,
        },
      });
      await this.saveStaffTicketMutation(
        tx,
        user,
        key,
        operation,
        idempotency.requestHash,
        updated.id,
      );
      return { ticket: updated, replay: false };
    });
    if (result.replay) return { ticket: result.ticket, idempotentReplay: true };
    const ticket = result.ticket;
    this.realtime.publish(
      ticket.branchId,
      "ticket.updated",
      { id: ticket.id, status: ticket.status, version: ticket.version },
      ["staff"],
    );
    this.realtime.publish(
      ticket.branchId,
      "counter.updated",
      { counterId: ticket.assignedCounterId, refetch: true },
      ["staff"],
    );
    this.realtime.publish(
      ticket.branchId,
      "dashboard.updated",
      { refetch: true },
      ["staff"],
    );
    if (ticket.customerId)
      this.realtime.publishCustomer(
        ticket.customerId,
        ticket.branchId,
        "ticket.updated",
        { id: ticket.id, status: ticket.status, version: ticket.version },
      );
    return { ticket };
  }

  async noShow(user: RequestUser, ticketId: string, idempotencyKey: string) {
    return this.requeue(user, ticketId, idempotencyKey, "NO_SHOW");
  }

  async transfer(
    user: RequestUser,
    ticketId: string,
    destinationServiceTypeId: string,
    note?: string,
    idempotencyKey = "",
  ) {
    return this.requeue(
      user,
      ticketId,
      idempotencyKey,
      "TRANSFERRED",
      destinationServiceTypeId,
      note,
    );
  }

  private async requeue(
    user: RequestUser,
    ticketId: string,
    idempotencyKey: string,
    eventType: "NO_SHOW" | "TRANSFERRED",
    destinationServiceTypeId?: string,
    note?: string,
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const operation =
      eventType === "NO_SHOW" ? "NO_SHOW_TICKET" : "TRANSFER_TICKET";
    const result = await this.prisma.$transaction(async (tx) => {
      const idempotency = await this.beginStaffTicketMutation(
        tx,
        user,
        key,
        operation,
        ticketId,
        { destinationServiceTypeId, note },
      );
      if (idempotency.replayedTicket)
        return { ticket: idempotency.replayedTicket, replay: true };
      if (eventType === "TRANSFERRED") {
        const destination = await tx.serviceType.findFirst({
          where: {
            id: destinationServiceTypeId,
            branchId: user.branchId,
            status: "ACTIVE",
          },
        });
        if (!destination)
          throw new DomainError(
            "SERVICE_INACTIVE",
            "Destination service is unavailable.",
          );
      }
      const rows = await tx.$queryRaw<Array<LockedTicket>>(
        Prisma.sql`SELECT * FROM tickets WHERE id = ${ticketId}::uuid FOR UPDATE`,
      );
      const ticket = rows[0];
      if (
        !ticket ||
        ticket.branch_id !== user.branchId ||
        ticket.assigned_staff_id !== user.sub
      )
        throw new DomainError(
          "FORBIDDEN",
          "This ticket is not active in your counter session.",
          403,
        );
      if (eventType === "NO_SHOW" && ticket.status !== "CALLED")
        throw new DomainError(
          "TICKET_INVALID_STATE",
          "Only a called ticket may be marked no-show.",
        );
      if (
        eventType === "TRANSFERRED" &&
        !["CALLED", "IN_SERVICE"].includes(ticket.status)
      )
        throw new DomainError(
          "TICKET_INVALID_STATE",
          "Only a called or in-service ticket may be transferred.",
        );
      this.policy.assert(ticket.status, "WAITING");
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "WAITING",
          currentServiceTypeId:
            destinationServiceTypeId ?? ticket.current_service_type_id,
          queueEnteredAt: new Date(),
          assignedCounterId: null,
          assignedStaffId: null,
          counterSessionId: null,
          calledAt: null,
          serviceStartedAt: null,
          noShowCount: eventType === "NO_SHOW" ? { increment: 1 } : undefined,
          version: { increment: 1 },
        },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          branchId: ticket.branch_id,
          eventType,
          fromStatus: ticket.status,
          toStatus: "WAITING",
          serviceTypeId:
            destinationServiceTypeId ?? ticket.current_service_type_id,
          counterId: ticket.assigned_counter_id,
          staffId: user.sub,
          reason: note,
          metadata:
            eventType === "TRANSFERRED"
              ? {
                  sourceServiceTypeId: ticket.current_service_type_id,
                  destinationServiceTypeId,
                }
              : undefined,
        },
      });
      await this.saveStaffTicketMutation(
        tx,
        user,
        key,
        operation,
        idempotency.requestHash,
        updated.id,
      );
      return { ticket: updated, replay: false };
    });
    if (result.replay) return { ticket: result.ticket, idempotentReplay: true };
    const ticket = result.ticket;
    this.realtime.publish(
      ticket.branchId,
      "ticket.updated",
      { id: ticket.id, status: ticket.status, version: ticket.version },
      ["staff"],
    );
    this.realtime.publish(
      ticket.branchId,
      "queue.updated",
      { serviceId: ticket.currentServiceTypeId, refetch: true },
      ["staff"],
    );
    this.realtime.publish(
      ticket.branchId,
      "counter.updated",
      { refetch: true },
      ["staff"],
    );
    if (ticket.customerId)
      this.realtime.publishCustomer(
        ticket.customerId,
        ticket.branchId,
        "ticket.updated",
        { id: ticket.id, status: ticket.status, version: ticket.version },
      );
    return { ticket };
  }
}

@PublicRoute()
@Controller("public")
export class PublicController {
  constructor(private readonly workflow: TicketWorkflowService) {}

  @Get("branches/:branchCode/services")
  services(@Param("branchCode") branchCode: string) {
    return this.workflow.listServices(branchCode);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("branches/:branchCode/tickets")
  create(
    @Param("branchCode") branchCode: string,
    @Body() body: unknown,
    @Headers("x-device-code") deviceCode = "",
    @Headers("x-device-secret") deviceSecret = "",
  ) {
    return this.workflow.createTicket(branchCode, body, {
      kind: "device",
      deviceCode,
      deviceSecret,
    });
  }

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post("tickets/lookup")
  lookup(@Body() body: unknown) {
    return this.workflow.lookup(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("tickets/:id/cancel")
  cancel(@Param("id") id: string, @Body() body: unknown) {
    return this.workflow.customerCancel(id, body);
  }

  @Get("devices/:deviceCode/bootstrap")
  bootstrap(
    @Param("deviceCode") code: string,
    @Headers("x-device-secret") secret = "",
  ) {
    return this.workflow.bootstrapDevice(code, secret);
  }
}

@Controller("customers")
@UseGuards(CustomerJwtAuthGuard)
export class CustomerQueueController {
  constructor(private readonly workflow: TicketWorkflowService) {}

  @Get("branches")
  branches() {
    return this.workflow.listBranches();
  }

  @Get("branches/:branchCode/services")
  services(@Param("branchCode") branchCode: string) {
    return this.workflow.listServices(branchCode);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("branches/:branchCode/tickets")
  create(
    @CurrentCustomer() customer: CustomerRequestUser,
    @Param("branchCode") branchCode: string,
    @Body() body: unknown,
  ) {
    return this.workflow.createTicket(branchCode, body, {
      kind: "customer",
      customerId: customer.sub,
    });
  }

  @Get("me/tickets")
  history(@CurrentCustomer() customer: CustomerRequestUser) {
    return this.workflow.customerHistory(customer.sub);
  }

  @Get("tickets/:id")
  ticket(
    @CurrentCustomer() customer: CustomerRequestUser,
    @Param("id") id: string,
  ) {
    return this.workflow.customerTicket(customer.sub, id);
  }

  @Post("tickets/:id/cancel")
  cancel(
    @CurrentCustomer() customer: CustomerRequestUser,
    @Param("id") id: string,
  ) {
    return this.workflow.customerAccountCancel(customer.sub, id);
  }
}
