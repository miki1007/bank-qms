import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { DomainExceptionFilter } from "./shared/domain-exception.filter";
import { RequestValidationPipe } from "./shared/request-validation.pipe";
import {
  allowedOrigins,
  apiPort,
  loadLocalEnvironment,
  validateRuntimeEnvironment,
} from "./config";

async function bootstrap() {
  loadLocalEnvironment();
  validateRuntimeEnvironment();
  const app = await NestFactory.create(AppModule, { cors: false });
  app.setGlobalPrefix("api/v1", { exclude: ["health/live", "health/ready"] });
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  });
  app.useGlobalPipes(new RequestValidationPipe());
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle("Bank Queue Management System API")
    .setDescription(
      "Authoritative REST API for customer, kiosk, display, teller, and manager interfaces",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));

  await app.listen(apiPort(), "0.0.0.0");
}

void bootstrap();
