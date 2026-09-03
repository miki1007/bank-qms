import { PrismaClient, StaffRole } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith("choose-") || value.startsWith("use-the-")) {
    throw new Error(
      `${name} must be set to a non-placeholder development value.`,
    );
  }
  return value;
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seed is disabled in production.");
  const managerPassword = required("DEV_MANAGER_PASSWORD");
  const tellerPassword = required("DEV_TELLER_PASSWORD");
  const branch = await prisma.branch.upsert({
    where: { code: "MAIN" },
    update: {},
    create: {
      code: "MAIN",
      name: "Main Branch",
      location: "Addis Ababa, Ethiopia",
      timezone: "Africa/Addis_Ababa",
      settings: {
        noShowTimeoutSeconds: 120,
        priorityFairnessLimit: 2,
        kioskIdleTimeoutSeconds: 45,
        displayHistoryCount: 5,
        slaWaitMinutes: 20,
        soundEnabled: true,
      },
    },
  });

  const serviceSeeds = [
    {
      code: "DEP",
      name: "Cash Deposit",
      description: "Deposit cash into your account",
      averageServiceMinutes: 4,
      displayOrder: 1,
    },
    {
      code: "WDR",
      name: "Cash Withdrawal",
      description: "Withdraw cash from your account",
      averageServiceMinutes: 5,
      displayOrder: 2,
    },
    {
      code: "LON",
      name: "Loan Services",
      description: "Loan applications and support",
      averageServiceMinutes: 15,
      displayOrder: 3,
    },
    {
      code: "NAC",
      name: "New Account",
      description: "Open a new account",
      averageServiceMinutes: 20,
      displayOrder: 4,
    },
  ];
  const services = [];
  for (const service of serviceSeeds) {
    services.push(
      await prisma.serviceType.upsert({
        where: { branchId_code: { branchId: branch.id, code: service.code } },
        update: { ...service, priorityEnabled: true, status: "ACTIVE" },
        create: { branchId: branch.id, ...service, priorityEnabled: true },
      }),
    );
  }

  const counters = [];
  for (let index = 0; index < services.length; index += 1) {
    counters.push(
      await prisma.counter.upsert({
        where: {
          branchId_label: {
            branchId: branch.id,
            label: `Counter ${index + 1}`,
          },
        },
        update: { assignedServiceId: services[index].id, isActive: true },
        create: {
          branchId: branch.id,
          label: `Counter ${index + 1}`,
          assignedServiceId: services[index].id,
        },
      }),
    );
  }

  const users: Array<{
    staffCode: string;
    name: string;
    username: string;
    role: StaffRole;
    password: string;
    assignedCounterId?: string;
  }> = [
    {
      staffCode: "MGR-001",
      name: "Development Manager",
      username: "manager.dev",
      role: "MANAGER",
      password: managerPassword,
    },
    {
      staffCode: "TEL-001",
      name: "Meron Tesfaye",
      username: "teller.one",
      role: "TELLER",
      password: tellerPassword,
      assignedCounterId: counters[0].id,
    },
    {
      staffCode: "TEL-002",
      name: "Dawit Bekele",
      username: "teller.two",
      role: "TELLER",
      password: tellerPassword,
      assignedCounterId: counters[1].id,
    },
    {
      staffCode: "TEL-003",
      name: "Hana Girma",
      username: "teller.three",
      role: "TELLER",
      password: tellerPassword,
      assignedCounterId: counters[2].id,
    },
    {
      staffCode: "TEL-004",
      name: "Selam Alemu",
      username: "teller.four",
      role: "TELLER",
      password: tellerPassword,
      assignedCounterId: counters[3].id,
    },
  ];
  for (const user of users) {
    const passwordHash = await argon2.hash(user.password, {
      type: argon2.argon2id,
    });
    await prisma.staff.upsert({
      where: { username: user.username },
      update: {
        name: user.name,
        role: user.role,
        status: "ACTIVE",
        assignedCounterId: user.assignedCounterId ?? null,
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        authVersion: { increment: 1 },
      },
      create: {
        branchId: branch.id,
        staffCode: user.staffCode,
        name: user.name,
        username: user.username,
        passwordHash,
        role: user.role,
        assignedCounterId: user.assignedCounterId,
      },
    });
  }

  const kioskHash = await argon2.hash(required("KIOSK_DEVICE_SECRET"), {
    type: argon2.argon2id,
  });
  const displayHash = await argon2.hash(required("DISPLAY_DEVICE_SECRET"), {
    type: argon2.argon2id,
  });
  await prisma.device.upsert({
    where: { deviceCode: "MAIN-KIOSK-01" },
    update: { credentialHash: kioskHash, status: "ACTIVE" },
    create: {
      branchId: branch.id,
      type: "KIOSK",
      name: "Lobby Kiosk",
      deviceCode: "MAIN-KIOSK-01",
      credentialHash: kioskHash,
    },
  });
  await prisma.device.upsert({
    where: { deviceCode: "MAIN-DISPLAY-01" },
    update: { credentialHash: displayHash, status: "ACTIVE" },
    create: {
      branchId: branch.id,
      type: "DISPLAY",
      name: "Main Hall Display",
      deviceCode: "MAIN-DISPLAY-01",
      credentialHash: displayHash,
    },
  });

  const second = await prisma.branch.upsert({
    where: { code: "TEST-B2" },
    update: {},
    create: {
      code: "TEST-B2",
      name: "Test Branch 2",
      timezone: "Africa/Addis_Ababa",
      settings: {
        noShowTimeoutSeconds: 120,
        priorityFairnessLimit: 2,
        kioskIdleTimeoutSeconds: 45,
        displayHistoryCount: 5,
        slaWaitMinutes: 20,
      },
    },
  });
  const branchTwoManagerHash = await argon2.hash(managerPassword, {
    type: argon2.argon2id,
  });
  await prisma.staff.upsert({
    where: { username: "manager.branch2" },
    update: {
      status: "ACTIVE",
      passwordHash: branchTwoManagerHash,
      failedLoginCount: 0,
      lockedUntil: null,
      authVersion: { increment: 1 },
    },
    create: {
      branchId: second.id,
      staffCode: "MGR-B2-001",
      name: "Branch Two Manager",
      username: "manager.branch2",
      passwordHash: branchTwoManagerHash,
      role: "MANAGER",
    },
  });

  console.log(
    "Seeded MAIN with 4 services, 4 counters, 1 manager, 4 independently assigned tellers, 2 devices, and a cross-branch test fixture.",
  );
}

main().finally(() => prisma.$disconnect());
