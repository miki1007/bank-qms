import { describe, expect, it } from "vitest";
import {
  customerRegistrationSchema,
  settingsSchema,
  ticketLookupSchema,
} from "./index";

describe("shared validation", () => {
  it("normalizes a public number", () => {
    expect(
      ticketLookupSchema.parse({
        branchCode: "MAIN",
        publicNumber: "dep-001",
        lookupCode: "123456",
      }).publicNumber,
    ).toBe("DEP-001");
  });

  it("rejects an invalid no-show timeout", () => {
    expect(() =>
      settingsSchema.parse({
        noShowTimeoutSeconds: 10,
        kioskIdleTimeoutSeconds: 45,
        displayHistoryCount: 5,
        slaWaitMinutes: 20,
      }),
    ).toThrow();
  });

  it("normalizes a customer email and accepts a strong password", () => {
    const result = customerRegistrationSchema.parse({
      name: "Queue Customer",
      email: " Customer@Example.COM ",
      password: "SafePassword7",
    });
    expect(result.email).toBe("customer@example.com");
  });

  it("rejects a weak customer password", () => {
    expect(() =>
      customerRegistrationSchema.parse({
        name: "Queue Customer",
        email: "customer@example.com",
        password: "alllowercase",
      }),
    ).toThrow();
  });
});
