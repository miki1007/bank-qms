import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaService } from "./prisma.service";
import {
  AuthController,
  AuthService,
  JwtAuthGuard,
  RolesGuard,
} from "./modules/auth";
import {
  CustomerQueueController,
  PublicController,
  TicketWorkflowService,
} from "./modules/tickets";
import { TellerController, CounterSessionService } from "./modules/teller";
import { QueueSelectionService } from "./modules/queue-selection.service";
import {
  AdminController,
  ManagerController,
  ManagerService,
  ReportQueryService,
} from "./modules/manager";
import { HealthController } from "./modules/health";
import { RealtimeGateway, RealtimePublisher } from "./modules/realtime";
import { accessTokenTtlMinutes, jwtAccessSecret } from "./config";
import {
  CustomerAuthController,
  CustomerAuthService,
  CustomerJwtAuthGuard,
} from "./modules/customer-auth";
import {
  AzureSpeechService,
  DisplaySpeechController,
  DisplaySpeechService,
} from "./modules/display-speech";
import {
  CustomerBankingController,
  CustomerBankingService,
} from "./modules/customer-banking";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: jwtAccessSecret(),
        signOptions: { expiresIn: accessTokenTtlMinutes() * 60 },
      }),
    }),
  ],
  controllers: [
    AuthController,
    CustomerAuthController,
    CustomerBankingController,
    CustomerQueueController,
    PublicController,
    TellerController,
    AdminController,
    ManagerController,
    HealthController,
    DisplaySpeechController,
  ],
  providers: [
    PrismaService,
    AuthService,
    CustomerAuthService,
    CustomerBankingService,
    TicketWorkflowService,
    CounterSessionService,
    QueueSelectionService,
    ManagerService,
    ReportQueryService,
    RealtimeGateway,
    RealtimePublisher,
    JwtAuthGuard,
    RolesGuard,
    CustomerJwtAuthGuard,
    AzureSpeechService,
    DisplaySpeechService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
