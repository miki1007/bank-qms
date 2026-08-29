import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma.service";
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { allowedOrigins } from "../config";

@WebSocketGateway({
  namespace: "/realtime",
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins().includes(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed"), false);
    },
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async handleConnection(@ConnectedSocket() socket: Socket) {
    try {
      const accessToken = String(socket.handshake.auth.accessToken ?? "");
      const deviceCode = String(socket.handshake.auth.deviceCode ?? "");
      const deviceSecret = String(socket.handshake.auth.deviceSecret ?? "");
      let branchId: string;
      let audience: "staff" | "display" | "kiosk" | "customer";
      if (accessToken) {
        const claims = await this.jwt.verifyAsync<{
          kind: "staff" | "customer";
          sub: string;
          branchId?: string;
          sessionVersion: number;
        }>(accessToken);
        if (claims.kind === "customer") {
          const customer = await this.prisma.customer.findUnique({
            where: { id: claims.sub },
          });
          if (
            !customer ||
            customer.status !== "ACTIVE" ||
            (customer.lockedUntil && customer.lockedUntil > new Date()) ||
            customer.authVersion !== claims.sessionVersion
          )
            throw new Error("unauthorized");
          socket.data.audience = "customer";
          socket.data.customerId = customer.id;
          await socket.join(`customer:${customer.id}`);
          return;
        }
        const staff = await this.prisma.staff.findUnique({
          where: { id: claims.sub },
        });
        if (
          !staff ||
          staff.status !== "ACTIVE" ||
          (staff.lockedUntil && staff.lockedUntil > new Date()) ||
          staff.branchId !== claims.branchId ||
          staff.authVersion !== claims.sessionVersion
        )
          throw new Error("unauthorized");
        branchId = staff.branchId;
        audience = "staff";
      } else {
        const device = await this.prisma.device.findUnique({
          where: { deviceCode },
        });
        if (
          !device ||
          device.status !== "ACTIVE" ||
          !(await argon2.verify(device.credentialHash, deviceSecret))
        )
          throw new Error("unauthorized");
        branchId = device.branchId;
        audience = device.type === "DISPLAY" ? "display" : "kiosk";
        await this.prisma.device.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date() },
        });
      }
      socket.data.branchId = branchId;
      socket.data.audience = audience;
      await socket.join(`branch:${branchId}:${audience}`);
    } catch {
      socket.disconnect(true);
    }
  }
}

@Injectable()
export class RealtimePublisher {
  constructor(
    @Inject(RealtimeGateway) private readonly gateway: RealtimeGateway,
  ) {}

  publish(
    branchId: string,
    event: string,
    data: Record<string, unknown>,
    audiences: Array<"staff" | "display" | "kiosk"> = ["staff"],
  ) {
    const envelope = {
      event,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      branchId,
      data,
    };
    for (const audience of audiences)
      this.gateway.server
        ?.to(`branch:${branchId}:${audience}`)
        .emit(event, envelope);
    return envelope;
  }

  publishCustomer(
    customerId: string,
    branchId: string,
    event: string,
    data: Record<string, unknown>,
  ) {
    const envelope = {
      event,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      branchId,
      data,
    };
    this.gateway.server?.to(`customer:${customerId}`).emit(event, envelope);
    return envelope;
  }
}
