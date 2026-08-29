-- Mirrors the Prisma migration used by the executable API.
ALTER TABLE "staff"
ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "staff"
ADD CONSTRAINT "staff_auth_version_check" CHECK ("auth_version" > 0);
