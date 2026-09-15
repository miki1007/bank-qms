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

const AMHARIC_SPEECH_VOICES = new Set([
  "am-ET-MekdesNeural",
  "am-ET-AmehaNeural",
]);

export type AzureSpeechConfiguration = {
  key: string;
  region: string;
  voice: string;
};

/**
 * Cloud speech is optional so the API can still serve visual queue calls while
 * a branch is being provisioned. Supplying only half of the credentials is a
 * startup error: that almost always means a deployment secret was missed.
 */
export function azureSpeechConfiguration(): AzureSpeechConfiguration | null {
  const key = process.env.AZURE_SPEECH_KEY?.trim() ?? "";
  const region = process.env.AZURE_SPEECH_REGION?.trim().toLowerCase() ?? "";
  const voice = process.env.AZURE_SPEECH_VOICE?.trim() || "am-ET-MekdesNeural";

  if (!key && !region) return null;
  if (!key || !region) {
    throw new Error(
      "AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be configured together.",
    );
  }
  if (!/^[a-z0-9]+$/.test(region)) {
    throw new Error("AZURE_SPEECH_REGION is not a valid Azure region name.");
  }
  if (!AMHARIC_SPEECH_VOICES.has(voice)) {
    throw new Error(
      "AZURE_SPEECH_VOICE must be am-ET-MekdesNeural or am-ET-AmehaNeural.",
    );
  }

  return { key, region, voice };
}

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
  azureSpeechConfiguration();
}
