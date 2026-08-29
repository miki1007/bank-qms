import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { DomainError } from "./domain-error";

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const requestId = String(request.headers["x-request-id"] ?? randomUUID());
    if (error instanceof DomainError) {
      response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          requestId,
          details: error.details,
        },
      });
      return;
    }
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json({
        error: {
          code: error.getStatus() === 403 ? "FORBIDDEN" : "VALIDATION_ERROR",
          message: error.message,
          requestId,
        },
      });
      return;
    }
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        path: request.url,
        message: "Unhandled server error",
      }),
    );
    response.status(500).json({
      error: {
        code: "SYSTEM_UNAVAILABLE",
        message: "The service is temporarily unavailable.",
        requestId,
      },
    });
  }
}
