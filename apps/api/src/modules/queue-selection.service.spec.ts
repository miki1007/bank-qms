import { describe, expect, it } from "vitest";
import { QueueSelectionService } from "./queue-selection.service";

describe("priority fairness", () => {
  const selector = new QueueSelectionService();
  it("selects standard-only queues", () =>
    expect(
      selector.chooseLane({
        priorityWaiting: 0,
        standardWaiting: 3,
        consecutivePriorityCalls: 0,
        limit: 2,
      }),
    ).toBe("standard"));
  it("selects priority-only queues", () =>
    expect(
      selector.chooseLane({
        priorityWaiting: 3,
        standardWaiting: 0,
        consecutivePriorityCalls: 99,
        limit: 2,
      }),
    ).toBe("priority"));
  it("selects priority below the limit", () =>
    expect(
      selector.chooseLane({
        priorityWaiting: 2,
        standardWaiting: 2,
        consecutivePriorityCalls: 1,
        limit: 2,
      }),
    ).toBe("priority"));
  it("forces standard at the limit", () =>
    expect(
      selector.chooseLane({
        priorityWaiting: 8,
        standardWaiting: 1,
        consecutivePriorityCalls: 2,
        limit: 2,
      }),
    ).toBe("standard"));
  it("resets after a standard call", () =>
    expect(
      selector.countConsecutivePriority([
        { priority: false },
        { priority: true },
      ]),
    ).toBe(0));
  it("counts a continuous priority run", () =>
    expect(
      selector.countConsecutivePriority([
        { priority: true },
        { priority: true },
        { priority: false },
      ]),
    ).toBe(2));
});
