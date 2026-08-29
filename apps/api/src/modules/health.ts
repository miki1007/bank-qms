import { Controller, Get, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { PublicRoute } from "./auth";

@PublicRoute()
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  @Get("live") live() {
    return { status: "ok" };
  }
  @Get("ready") async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ready", database: "available" };
  }
}
