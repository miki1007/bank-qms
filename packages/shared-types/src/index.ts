export type StaffRole = "TELLER" | "MANAGER" | "ADMIN";
export type TicketStatus =
  "ISSUED" | "WAITING" | "CALLED" | "IN_SERVICE" | "COMPLETED" | "CANCELLED";

export interface AuthUser {
  id: string;
  branchId: string;
  name: string;
  username: string;
  role: StaffRole;
}

export interface CustomerUser {
  id: string;
  name: string;
  email: string;
}

export interface PublicBranch {
  code: string;
  name: string;
  location: string | null;
  timezone: string;
}

export interface PublicService {
  id: string;
  code: string;
  name: string;
  description: string | null;
  averageServiceMinutes: number;
  waitingCount: number;
  estimatedWaitMinutes: number | null;
}

export interface TicketView {
  id: string;
  publicNumber: string;
  serviceName: string;
  status: TicketStatus;
  issuedAt: string;
  peopleAhead: number | null;
  estimatedWaitMinutes: number | null;
  positionIsEstimate: boolean;
  counterLabel?: string | null;
  version: number;
}

export interface RealtimeEnvelope<T = unknown> {
  event: string;
  eventId: string;
  occurredAt: string;
  branchId: string;
  data: T;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
