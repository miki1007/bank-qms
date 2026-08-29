import { Injectable } from "@nestjs/common";

@Injectable()
export class QueueSelectionService {
  chooseLane(input: {
    priorityWaiting: number;
    standardWaiting: number;
    consecutivePriorityCalls: number;
    limit: number;
  }): "priority" | "standard" | null {
    if (input.priorityWaiting === 0 && input.standardWaiting === 0) return null;
    if (input.standardWaiting === 0) return "priority";
    if (input.priorityWaiting === 0) return "standard";
    return input.consecutivePriorityCalls >= input.limit
      ? "standard"
      : "priority";
  }

  countConsecutivePriority(recentCalls: Array<{ priority: boolean }>) {
    let count = 0;
    for (const call of recentCalls) {
      if (!call.priority) break;
      count += 1;
    }
    return count;
  }
}
