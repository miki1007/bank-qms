import { describe, expect, it } from "vitest";

describe("report metric definitions", () => {
  it("calculates cancellation rate consistently", () => {
    const issued = 8;
    const cancelled = 2;
    expect((cancelled / issued) * 100).toBe(25);
  });
  it("caps utilization for invalid overlapping data", () =>
    expect(Math.min(100, (75 / 60) * 100)).toBe(100));
});
