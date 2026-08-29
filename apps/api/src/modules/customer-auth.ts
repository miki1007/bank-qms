import {
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import { Prisma } from "@prisma/client";
import {
  customerLoginSchema,
  customerRegistrationSchema,
} from "@qms/validation";
import type { Request, Response } from "express";
import * as argon2 from "argon2";
import { createHash, randomUUID } from "node:crypto";
import { refreshTokenTtlDays, jwtRefreshSecret } from "../config";
import { PrismaService } from "../prisma.service";
import { DomainError } from "../shared/domain-error";
import { PublicRoute } from "./auth";

export interface CustomerRequestUser {
  kind: "customer";
  sub: string;
  email: string;
  name: string;
  sessionVersion: number;
}

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context
      .switchToHttp()
      .getRequest<Request & { customer: CustomerRequestUser }>().customer,
);

@Injectable()
export class CustomerJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { customer: CustomerRequestUser }>();
    const token = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : null;
    if (!token) throw new UnauthorizedException("Authentication required");
    try {
      const claims = await this.jwt.verifyAsync<CustomerRequestUser>(token);
      const customer = await this.prisma.customer.findUnique({
        where: { id: claims.sub },
      });
      if (
        claims.kind !== "customer" ||
        !customer ||
        customer.status !== "ACTIVE" ||
        (customer.lockedUntil && customer.lockedUntil > new Date()) ||
        claims.sessionVersion !== customer.authVersion
      )
        throw new Error("inactive");
      request.customer = claims;
      return true;
    } catch {
      throw new UnauthorizedException("Authentication required");
    }
  }
}

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async audit(
    customerId: string | null,
    action: string,
    outcome: string,
    request: Request,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorType: customerId ? "CUSTOMER" : "ANONYMOUS",
        actorId: customerId,
        action,
        outcome,
        requestId: String(request.headers["x-request-id"] ?? randomUUID()),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]?.slice(0, 255),
      },
    });
  }

  private async issueSession(customer: {
    id: string;
    email: string;
    name: string;
    authVersion: number;
  }) {
    const claims: CustomerRequestUser = {
      kind: "customer",
      sub: customer.id,
      email: customer.email,
      name: customer.name,
      sessionVersion: customer.authVersion,
    };
    const accessToken = await this.jwt.signAsync(claims);
    const refreshToken = await this.jwt.signAsync(
      {
        sub: customer.id,
        kind: "customer-refresh",
        nonce: randomUUID(),
      },
      {
        secret: jwtRefreshSecret(),
        expiresIn: refreshTokenTtlDays() * 86_400,
      },
    );
    await this.prisma.customerRefreshSession.create({
      data: {
        customerId: customer.id,
        tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
        expiresAt: new Date(Date.now() + refreshTokenTtlDays() * 86_400_000),
      },
    });
    return {
      accessToken,
      refreshToken,
      user: { id: customer.id, email: customer.email, name: customer.name },
    };
  }

  async register(input: unknown, request: Request) {
    const parsed = customerRegistrationSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Registration information is invalid.",
        400,
        parsed.error.flatten(),
      );
    const exists = await this.prisma.customer.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
    if (exists) {
      await this.audit(
        exists.id,
        "CUSTOMER_REGISTER_DUPLICATE",
        "DENIED",
        request,
      );
      throw new DomainError(
        "ACCOUNT_EXISTS",
        "An account with this email already exists.",
        409,
      );
    }
    let customer;
    try {
      customer = await this.prisma.customer.create({
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          passwordHash: await argon2.hash(parsed.data.password, {
            type: argon2.argon2id,
          }),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new DomainError(
          "ACCOUNT_EXISTS",
          "An account with this email already exists.",
          409,
        );
      throw error;
    }
    await this.audit(customer.id, "CUSTOMER_REGISTER", "SUCCESS", request);
    return this.issueSession(customer);
  }

  async login(input: unknown, request: Request) {
    const parsed = customerLoginSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError(
        "AUTHENTICATION_FAILED",
        "Email or password is incorrect.",
        401,
      );
    const customer = await this.prisma.customer.findUnique({
      where: { email: parsed.data.email },
    });
    const now = new Date();
    const valid = Boolean(
      customer &&
      customer.status === "ACTIVE" &&
      (!customer.lockedUntil || customer.lockedUntil <= now) &&
      (await argon2.verify(customer.passwordHash, parsed.data.password)),
    );
    if (!valid || !customer) {
      if (customer) {
        const attempts = customer.failedLoginCount + 1;
        await this.prisma.customer.update({
          where: { id: customer.id },
          data: {
            failedLoginCount: attempts >= 5 ? 0 : attempts,
            lockedUntil:
              attempts >= 5
                ? new Date(Date.now() + 15 * 60_000)
                : customer.lockedUntil,
          },
        });
      }
      await this.audit(
        customer?.id ?? null,
        "CUSTOMER_LOGIN_FAILURE",
        "DENIED",
        request,
      );
      throw new DomainError(
        "AUTHENTICATION_FAILED",
        "Email or password is incorrect.",
        401,
      );
    }
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await this.audit(customer.id, "CUSTOMER_LOGIN_SUCCESS", "SUCCESS", request);
    return this.issueSession(updated);
  }

  async refresh(refreshToken: string) {
    try {
      const claims = await this.jwt.verifyAsync<{ sub: string; kind: string }>(
        refreshToken,
        { secret: jwtRefreshSecret() },
      );
      if (claims.kind !== "customer-refresh") throw new Error("wrong token");
      const hash = createHash("sha256").update(refreshToken).digest("hex");
      const session = await this.prisma.customerRefreshSession.findFirst({
        where: {
          tokenHash: hash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { customer: true },
      });
      if (
        !session ||
        session.customer.status !== "ACTIVE" ||
        (session.customer.lockedUntil &&
          session.customer.lockedUntil > new Date())
      )
        throw new Error("revoked");
      const revoked = await this.prisma.customerRefreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new Error("already rotated");
      return this.issueSession(session.customer);
    } catch {
      throw new DomainError(
        "AUTHENTICATION_FAILED",
        "Authentication expired. Please sign in again.",
        401,
      );
    }
  }

  async logout(
    refreshToken: string | undefined,
    user: CustomerRequestUser,
    request: Request,
  ) {
    await this.prisma.$transaction([
      this.prisma.customerRefreshSession.updateMany({
        where: {
          ...(refreshToken
            ? {
                tokenHash: createHash("sha256")
                  .update(refreshToken)
                  .digest("hex"),
              }
            : {}),
          customerId: user.sub,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
      this.prisma.customer.update({
        where: { id: user.sub },
        data: { authVersion: { increment: 1 } },
      }),
    ]);
    await this.audit(user.sub, "CUSTOMER_LOGOUT", "SUCCESS", request);
    return { success: true };
  }
}

const customerCookie = "qms_customer_refresh";
const customerCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/v1/customer-auth",
  maxAge: refreshTokenTtlDays() * 86_400_000,
});

@Controller("customer-auth")
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @PublicRoute()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  async register(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(body, request);
    response.cookie(
      customerCookie,
      result.refreshToken,
      customerCookieOptions(),
    );
    return { accessToken: result.accessToken, user: result.user };
  }

  @PublicRoute()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body, request);
    response.cookie(
      customerCookie,
      result.refreshToken,
      customerCookieOptions(),
    );
    return { accessToken: result.accessToken, user: result.user };
  }

  @PublicRoute()
  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(
      String(request.cookies?.[customerCookie] ?? ""),
    );
    response.cookie(
      customerCookie,
      result.refreshToken,
      customerCookieOptions(),
    );
    return { accessToken: result.accessToken, user: result.user };
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post("logout")
  async logout(
    @CurrentCustomer() user: CustomerRequestUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.logout(
      request.cookies?.[customerCookie],
      user,
      request,
    );
    response.clearCookie(customerCookie, {
      path: "/api/v1/customer-auth",
    });
    return result;
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Get("me")
  me(@CurrentCustomer() user: CustomerRequestUser) {
    return { user: { id: user.sub, email: user.email, name: user.name } };
  }
}
