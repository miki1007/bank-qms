import { loadEnvFile } from "node:process";

function read(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function loadLocalEnvironment() {
  if (process.env.NODE_ENV === "production") return;
  try {
    loadEnvFile(".env");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function jwtAccessSecret() {
  const value = read("JWT_ACCESS_SECRET");
  if (value.length < 32 || value.startsWith("replace-with")) {
    throw new Error(
      "JWT_ACCESS_SECRET must contain at least 32 non-placeholder characters.",
    );
  }
  return value;
}

export function jwtRefreshSecret() {
  const value = read("JWT_REFRESH_SECRET");
  if (value.length < 32 || value.startsWith("replace-with")) {
    throw new Error(
      "JWT_REFRESH_SECRET must contain at least 32 non-placeholder characters.",
    );
  }
  return value;
}

export const accessTokenTtlMinutes = () =>
  positiveInteger("ACCESS_TOKEN_TTL_MINUTES", 15);
export const refreshTokenTtlDays = () =>
  positiveInteger("REFRESH_TOKEN_TTL_DAYS", 7);
export const apiPort = () => positiveInteger("PORT", 3000);

export function allowedOrigins() {
  const values = [
    process.env.APP_ORIGIN,
    process.env.CUSTOMER_ORIGIN,
    process.env.KIOSK_ORIGIN,
    process.env.DISPLAY_ORIGIN,
  ]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error("At least one allowed web origin must be configured.");
  }
  return [...new Set(values)];
}

export function validateRuntimeEnvironment() {
  const databaseUrl = read("DATABASE_URL");
  if (
    !databaseUrl.startsWith("postgresql://") &&
    !databaseUrl.startsWith("postgres://")
  ) {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }
  jwtAccessSecret();
  jwtRefreshSecret();
  allowedOrigins();
  accessTokenTtlMinutes();
  refreshTokenTtlDays();
  apiPort();
}
