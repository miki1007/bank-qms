import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { AuthService, type RequestUser } from "./auth";

const user: RequestUser = {
  kind: "staff",
  sub: "00000000-0000-4000-8000-000000000001",
  branchId: "00000000-0000-4000-8000-000000000002",
  role: "TELLER",
  username: "teller.one",
  name: "Test Teller",
  sessionVersion: 1,
};

const request = {
  headers: { "x-request-id": "logout-test" },
  ip: "127.0.0.1",
} as unknown as Request;

function fixture(activeTicket: { id: string } | null) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000003",
        counter_id: "00000000-0000-4000-8000-000000000004",
      },
    ]),
    ticket: { findFirst: vi.fn().mockResolvedValue(activeTicket) },
    counterSession: { update: vi.fn().mockResolvedValue({}) },
    counter: { update: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    refreshSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    staff: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(
      (operation: (client: typeof tx) => Promise<string | null>) =>
        operation(tx),
    ),
  };
  const realtime = { publish: vi.fn() };
  const service = new AuthService(
    prisma as never,
    {} as never,
    realtime as never,
  );
  return { service, tx, realtime };
}

describe("staff logout", () => {
  it("closes an idle teller counter before revoking the staff session", async () => {
    const { service, tx, realtime } = fixture(null);

    await expect(service.logout(undefined, user, request)).resolves.toEqual({
      success: true,
    });

    expect(tx.counterSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CLOSED" }),
      }),
    );
    expect(tx.counter.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CLOSED" } }),
    );
    expect(tx.refreshSession.updateMany).toHaveBeenCalledOnce();
    expect(tx.staff.update).toHaveBeenCalledOnce();
    expect(realtime.publish).toHaveBeenCalledWith(
      user.branchId,
      "counter.updated",
      expect.objectContaining({ status: "CLOSED" }),
      ["staff"],
    );
  });

  it("keeps the teller authenticated while a customer remains active", async () => {
    const { service, tx, realtime } = fixture({
      id: "00000000-0000-4000-8000-000000000005",
    });

    await expect(
      service.logout(undefined, user, request),
    ).rejects.toMatchObject({
      code: "COUNTER_BUSY",
      status: 409,
    });

    expect(tx.counterSession.update).not.toHaveBeenCalled();
    expect(tx.refreshSession.updateMany).not.toHaveBeenCalled();
    expect(tx.staff.update).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
  });
});
