import { describe, expect, it } from "vitest";
import {
  TicketNumberService,
  TicketTransitionPolicy,
  WaitEstimationService,
} from "./tickets";

describe("ticket domain", () => {
  it("formats daily public numbers", () =>
    expect(new TicketNumberService().format("DEP", 42)).toBe("DEP-042"));
  it("allows the documented happy-path transition", () =>
    expect(() =>
      new TicketTransitionPolicy().assert("CALLED", "IN_SERVICE"),
    ).not.toThrow());
  it("keeps terminal tickets terminal", () =>
    expect(() =>
      new TicketTransitionPolicy().assert("COMPLETED", "WAITING"),
    ).toThrow());
  it("uses active counter count for estimates", () =>
    expect(new WaitEstimationService().estimate(5, 4, 2)).toBe(10));
  it("does not claim zero wait without a counter", () =>
    expect(new WaitEstimationService().estimate(5, 4, 0)).toBeNull());
});
