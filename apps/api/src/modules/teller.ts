import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Injectable,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Prisma, SessionStatus } from "@prisma/client";
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
import { TicketWorkflowService } from "./tickets";

@Injectable()
export class CounterSessionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimePublisher) private readonly realtime: RealtimePublisher,
  ) {}

  async available(user: RequestUser) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: user.sub, branchId: user.branchId, status: "ACTIVE" },
      include: {
        assignedCounter: {
          include: {
            assignedService: true,
            sessions: {
              where: { status: { in: ["OPEN", "PAUSED"] } },
              select: { staffId: true },
            },
          },
        },
      },
    });
    const counter = staff?.assignedCounter;
    if (!counter || counter.branchId !== user.branchId) return [];
    return [
      {
        id: counter.id,
        label: counter.label,
        status: counter.status,
        service: counter.assignedService && {
          id: counter.assignedService.id,
          code: counter.assignedService.code,
          name: counter.assignedService.name,
        },
        available:
          counter.sessions.length === 0 &&
          counter.isActive &&
          Boolean(counter.assignedServiceId),
      },
    ];
  }

  async current(user: RequestUser) {
    const session = await this.prisma.counterSession.findFirst({
      where: {
        staffId: user.sub,
        branchId: user.branchId,
        status: { in: ["OPEN", "PAUSED"] },
      },
      include: { counter: true, serviceType: true },
    });
    if (!session) return { session: null };
    const [activeTicket, waiting] = await Promise.all([
      this.prisma.ticket.findFirst({
        where: {
          counterSessionId: session.id,
          status: { in: ["CALLED", "IN_SERVICE"] },
        },
        include: { currentService: true },
      }),
      this.prisma.ticket.count({
        where: {
          branchId: user.branchId,
          currentServiceTypeId: session.serviceTypeId,
          status: "WAITING",
        },
      }),
    ]);
    const oldest = await this.prisma.ticket.findFirst({
      where: {
        branchId: user.branchId,
        currentServiceTypeId: session.serviceTypeId,
        status: "WAITING",
      },
      orderBy: { queueEnteredAt: "asc" },
      select: { queueEnteredAt: true },
    });
    return {
      session: {
        id: session.id,
        status: session.status,
        openedAt: session.openedAt,
        counter: session.counter,
        service: session.serviceType,
        queue: {
          waiting,
          oldestWaitSeconds: oldest
            ? Math.floor((Date.now() - oldest.queueEnteredAt.getTime()) / 1000)
            : 0,
        },
        activeTicket,
      },
    };
  }

  async open(user: RequestUser, counterId: string) {
    const session = await this.prisma.$transaction(async (tx) => {
      const staffRows = await tx.$queryRaw<
        Array<{ assigned_counter_id: string | null }>
      >(
        Prisma.sql`SELECT assigned_counter_id FROM staff WHERE id = ${user.sub}::uuid AND branch_id = ${user.branchId}::uuid AND status = 'ACTIVE'::"StaffStatus" FOR UPDATE`,
      );
      if (staffRows[0]?.assigned_counter_id !== counterId)
        throw new DomainError(
          "FORBIDDEN",
          "You may open only the counter assigned by your manager.",
          403,
        );
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          branch_id: string;
          assigned_service_id: string | null;
          status: string;
          is_active: boolean;
        }>
      >(
        Prisma.sql`SELECT * FROM counters WHERE id = ${counterId}::uuid FOR UPDATE`,
      );
      const counter = rows[0];
      if (
        !counter ||
        counter.branch_id !== user.branchId ||
        !counter.is_active ||
        !counter.assigned_service_id
      )
        throw new DomainError(
          "RESOURCE_NOT_FOUND",
          "Counter is unavailable.",
          404,
        );
      const existing = await tx.counterSession.findFirst({
        where: {
          OR: [{ staffId: user.sub }, { counterId }],
          status: { in: ["OPEN", "PAUSED"] },
        },
      });
      if (existing)
        throw new DomainError(
          "COUNTER_BUSY",
          "The teller or counter already has an active session.",
        );
      const created = await tx.counterSession.create({
        data: {
          branchId: user.branchId,
          counterId,
          staffId: user.sub,
          serviceTypeId: counter.assigned_service_id,
          status: "OPEN",
        },
        include: { counter: true, serviceType: true },
      });
      await tx.counter.update({
        where: { id: counterId },
        data: { status: "OPEN" },
      });
      await tx.auditLog.create({
        data: {
          branchId: user.branchId,
          actorType: "STAFF",
          actorId: user.sub,
          action: "COUNTER_SESSION_OPEN",
          targetType: "COUNTER",
          targetId: counterId,
          outcome: "SUCCESS",
        },
      });
      return created;
    });
    this.realtime.publish(
      user.branchId,
      "counter.updated",
      { counterId, status: "OPEN", refetch: true },
      ["staff"],
    );
    return { session };
  }

  async changeState(user: RequestUser, target: SessionStatus) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; counter_id: string; status: SessionStatus }>
      >(
        Prisma.sql`SELECT id, counter_id, status FROM counter_sessions WHERE staff_id = ${user.sub}::uuid AND branch_id = ${user.branchId}::uuid AND status IN ('OPEN','PAUSED') FOR UPDATE`,
      );
      const session = rows[0];
      if (!session)
        throw new DomainError(
          "RESOURCE_NOT_FOUND",
          "No active counter session.",
          404,
        );
      const activeTicket = await tx.ticket.findFirst({
        where: {
          counterSessionId: session.id,
          status: { in: ["CALLED", "IN_SERVICE"] },
        },
      });
      if (activeTicket)
        throw new DomainError(
          "COUNTER_BUSY",
          "Resolve the active ticket before changing the counter state.",
        );
      if (target === "PAUSED" && session.status !== "OPEN")
        throw new DomainError(
          "COUNTER_BUSY",
          "Only an open counter can be paused.",
        );
      if (target === "OPEN" && session.status !== "PAUSED")
        throw new DomainError(
          "COUNTER_BUSY",
          "Only a paused counter can be resumed.",
        );
      const now = new Date();
      const updated = await tx.counterSession.update({
        where: { id: session.id },
        data: {
          status: target,
          pausedAt: target === "PAUSED" ? now : null,
          closedAt: target === "CLOSED" ? now : null,
        },
      });
      await tx.counter.update({
        where: { id: session.counter_id },
        data: {
          status:
            target === "CLOSED"
              ? "CLOSED"
              : target === "PAUSED"
                ? "PAUSED"
                : "OPEN",
        },
      });
      await tx.auditLog.create({
        data: {
          branchId: user.branchId,
          actorType: "STAFF",
          actorId: user.sub,
          action: `COUNTER_SESSION_${target}`,
          targetType: "COUNTER_SESSION",
          targetId: session.id,
          outcome: "SUCCESS",
        },
      });
      return updated;
    });
    this.realtime.publish(
      user.branchId,
      "counter.updated",
      { counterId: result.counterId, status: target, refetch: true },
      ["staff"],
    );
    return { session: result };
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("TELLER")
@Controller("teller")
export class TellerController {
  constructor(
    @Inject(CounterSessionService)
    private readonly sessions: CounterSessionService,
    @Inject(TicketWorkflowService)
    private readonly workflow: TicketWorkflowService,
  ) {}

  @Get("counters/available") available(@CurrentUser() user: RequestUser) {
    return this.sessions.available(user);
  }
  @Get("counter-session/current") current(@CurrentUser() user: RequestUser) {
    return this.sessions.current(user);
  }
  @Post("counter-sessions") open(
    @CurrentUser() user: RequestUser,
    @Body() body: { counterId?: string },
  ) {
    if (!body.counterId)
      throw new DomainError("VALIDATION_ERROR", "Counter is required.", 400);
    return this.sessions.open(user, body.counterId);
  }
  @Post("counter-session/pause") pause(@CurrentUser() user: RequestUser) {
    return this.sessions.changeState(user, "PAUSED");
  }
  @Post("counter-session/resume") resume(@CurrentUser() user: RequestUser) {
    return this.sessions.changeState(user, "OPEN");
  }
  @Post("counter-session/close") close(@CurrentUser() user: RequestUser) {
    return this.sessions.changeState(user, "CLOSED");
  }
  @Post("tickets/call-next") callNext(
    @CurrentUser() user: RequestUser,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.workflow.callNext(user, idempotencyKey ?? "");
  }
  @Post("tickets/:ticketId/recall") recall(
    @CurrentUser() user: RequestUser,
    @Param("ticketId") id: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.workflow.recall(user, id, idempotencyKey ?? "");
  }
  @Post("tickets/:ticketId/start") start(
    @CurrentUser() user: RequestUser,
    @Param("ticketId") id: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.workflow.start(user, id, idempotencyKey ?? "");
  }
  @Post("tickets/:ticketId/complete") complete(
    @CurrentUser() user: RequestUser,
    @Param("ticketId") id: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.workflow.complete(user, id, idempotencyKey ?? "");
  }
  @Post("tickets/:ticketId/no-show") noShow(
    @CurrentUser() user: RequestUser,
    @Param("ticketId") id: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.workflow.noShow(user, id, idempotencyKey ?? "");
  }
  @Post("tickets/:ticketId/transfer") transfer(
    @CurrentUser() user: RequestUser,
    @Param("ticketId") id: string,
    @Body() body: { destinationServiceTypeId?: string; note?: string },
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (!body.destinationServiceTypeId)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Destination service is required.",
        400,
      );
    return this.workflow.transfer(
      user,
      id,
      body.destinationServiceTypeId,
      body.note,
      idempotencyKey ?? "",
    );
  }
}
