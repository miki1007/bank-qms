import {
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import * as argon2 from "argon2";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma.service";
import { DomainError } from "../shared/domain-error";
import { jwtRefreshSecret, refreshTokenTtlDays } from "../config";

export interface RequestUser {
  kind: "staff";
  sub: string;
  branchId: string;
  role: "TELLER" | "MANAGER";
  username: string;
  name: string;
  sessionVersion: number;
}

export const PublicRoute = () => SetMetadata("publicRoute", true);
export const Roles = (...roles: Array<RequestUser["role"]>) =>
  SetMetadata("roles", roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<Request & { user: RequestUser }>().user,
);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>("publicRoute", [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: RequestUser }>();
    const token = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : null;
    if (!token) throw new UnauthorizedException("Authentication required");
    try {
      const claims = await this.jwt.verifyAsync<RequestUser>(token);
      const staff = await this.prisma.staff.findUnique({
        where: { id: claims.sub },
      });
      if (
        claims.kind !== "staff" ||
        !staff ||
        staff.status !== "ACTIVE" ||
        (staff.lockedUntil && staff.lockedUntil > new Date()) ||
        claims.sessionVersion !== staff.authVersion
      )
        throw new Error("inactive");
      request.user = claims;
      return true;
    } catch {
      throw new UnauthorizedException("Authentication required");
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Array<RequestUser["role"]>>(
      "roles",
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) return true;
    const user = context
      .switchToHttp()
      .getRequest<Request & { user: RequestUser }>().user;
    if (!user || !roles.includes(user.role))
      throw new ForbiddenException(
        "You do not have permission for this operation",
      );
    return true;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async audit(
    branchId: string | null,
    actorId: string | null,
    action: string,
    outcome: string,
    request: Request,
  ) {
    await this.prisma.auditLog.create({
      data: {
        branchId,
        actorType: actorId ? "STAFF" : "ANONYMOUS",
        actorId,
        action,
        outcome,
        requestId: String(request.headers["x-request-id"] ?? randomUUID()),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]?.slice(0, 255),
      },
    });
  }

  async login(usernameInput: string, password: string, request: Request) {
    const username = usernameInput.trim().toLowerCase();
    const staff = await this.prisma.staff.findUnique({
      where: { username },
      include: { branch: true },
    });
    const now = new Date();
    const valid = Boolean(
      staff &&
      staff.status === "ACTIVE" &&
      (!staff.lockedUntil || staff.lockedUntil <= now) &&
      (await argon2.verify(staff.passwordHash, password)),
    );
    if (!valid || !staff) {
      if (staff) {
        const attempts = staff.failedLoginCount + 1;
        await this.prisma.staff.update({
          where: { id: staff.id },
          data: {
            failedLoginCount: attempts >= 5 ? 0 : attempts,
            lockedUntil:
              attempts >= 5
                ? new Date(Date.now() + 15 * 60_000)
                : staff.lockedUntil,
          },
        });
        await this.audit(
          staff.branchId,
          staff.id,
          "AUTH_LOGIN_FAILURE",
          "DENIED",
          request,
        );
      } else {
        await this.audit(null, null, "AUTH_LOGIN_FAILURE", "DENIED", request);
      }
      throw new DomainError(
        "AUTHENTICATION_FAILED",
        "Username or password is incorrect.",
        401,
      );
    }

    await this.prisma.staff.update({
      where: { id: staff.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    const claims: RequestUser = {
      kind: "staff",
      sub: staff.id,
      branchId: staff.branchId,
      role: staff.role,
      username: staff.username,
      name: staff.name,
      sessionVersion: staff.authVersion,
    };
    const accessToken = await this.jwt.signAsync(claims);
    const refreshToken = await this.jwt.signAsync(
      {
        sub: staff.id,
        branchId: staff.branchId,
        kind: "refresh",
        nonce: randomUUID(),
      },
      {
        secret: jwtRefreshSecret(),
        expiresIn: refreshTokenTtlDays() * 86_400,
      },
    );
    await this.prisma.refreshSession.create({
      data: {
        staffId: staff.id,
        branchId: staff.branchId,
        tokenHash: createHash("sha256").update(refreshToken).digest("hex"),
        expiresAt: new Date(Date.now() + refreshTokenTtlDays() * 86_400_000),
      },
    });
    await this.audit(
      staff.branchId,
      staff.id,
      "AUTH_LOGIN_SUCCESS",
      "SUCCESS",
      request,
    );
    return {
      accessToken,
      user: {
        id: staff.id,
        branchId: staff.branchId,
        branchCode: staff.branch.code,
        branchName: staff.branch.name,
        name: staff.name,
        username: staff.username,
        role: staff.role,
      },
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const claims = await this.jwt.verifyAsync<{
        sub: string;
        branchId: string;
        kind: string;
      }>(refreshToken, {
        secret: jwtRefreshSecret(),
      });
      if (claims.kind !== "refresh") throw new Error("wrong token");
      const hash = createHash("sha256").update(refreshToken).digest("hex");
      const session = await this.prisma.refreshSession.findFirst({
        where: {
          tokenHash: hash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { staff: { include: { branch: true } } },
      });
      if (!session || session.staff.status !== "ACTIVE")
        throw new Error("revoked");
      const revoked = await this.prisma.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new Error("already rotated");
      const newRefresh = await this.jwt.signAsync(
        {
          sub: session.staff.id,
          branchId: session.branchId,
          kind: "refresh",
          nonce: randomUUID(),
        },
        {
          secret: jwtRefreshSecret(),
          expiresIn: refreshTokenTtlDays() * 86_400,
        },
      );
      await this.prisma.refreshSession.create({
        data: {
          staffId: session.staff.id,
          branchId: session.branchId,
          tokenHash: createHash("sha256").update(newRefresh).digest("hex"),
          expiresAt: new Date(Date.now() + refreshTokenTtlDays() * 86_400_000),
        },
      });
      const accessToken = await this.jwt.signAsync({
        kind: "staff",
        sub: session.staff.id,
        branchId: session.branchId,
        role: session.staff.role,
        username: session.staff.username,
        name: session.staff.name,
        sessionVersion: session.staff.authVersion,
      });
      return {
        accessToken,
        refreshToken: newRefresh,
        user: {
          id: session.staff.id,
          branchId: session.staff.branchId,
          branchCode: session.staff.branch.code,
          branchName: session.staff.branch.name,
          name: session.staff.name,
          username: session.staff.username,
          role: session.staff.role,
        },
      };
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
    user: RequestUser,
    request: Request,
  ) {
    await this.prisma.$transaction([
      this.prisma.refreshSession.updateMany({
        where: {
          ...(refreshToken
            ? {
                tokenHash: createHash("sha256")
                  .update(refreshToken)
                  .digest("hex"),
              }
            : {}),
          staffId: user.sub,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      }),
      this.prisma.staff.update({
        where: { id: user.sub },
        data: { authVersion: { increment: 1 } },
      }),
    ]);
    await this.audit(
      user.branchId,
      user.sub,
      "AUTH_LOGOUT",
      "SUCCESS",
      request,
    );
    return { success: true };
  }
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @PublicRoute()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  async login(
    @Body() body: { username?: string; password?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!body.username || !body.password)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Username and password are required.",
        400,
      );
    const result = await this.auth.login(body.username, body.password, request);
    response.cookie("qms_refresh", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: refreshTokenTtlDays() * 86_400_000,
    });
    return { accessToken: result.accessToken, user: result.user };
  }

  @PublicRoute()
  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(
      String(request.cookies?.qms_refresh ?? ""),
    );
    response.cookie("qms_refresh", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: refreshTokenTtlDays() * 86_400_000,
    });
    return { accessToken: result.accessToken, user: result.user };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("logout")
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.logout(
      request.cookies?.qms_refresh,
      user,
      request,
    );
    response.clearCookie("qms_refresh", { path: "/api/v1/auth" });
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return { user };
  }
}
