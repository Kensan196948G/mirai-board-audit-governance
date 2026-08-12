import { AppError } from "./errors.ts";

/* ---------- 定足数 ---------- */

export type QuorumInput = {
  formula: string;
  totalMembers: number;
  actualAttendees: number;
  recusedCount: number;
  pendingCount: number;
};

export type QuorumResult = {
  eligibleCount: number;
  requiredQuorum: number;
  meetsQuorum: boolean;
  calculationInputs: QuorumInput;
};

export function calculateQuorum(input: QuorumInput): QuorumResult {
  if (input.totalMembers <= 0) {
    throw new AppError("QUORUM", "定足数計算に必要な在任人数が設定されていません", 422);
  }
  const formula = input.formula || "majority";
  let required: number;
  if (formula === "two_thirds") {
    required = Math.ceil((input.totalMembers * 2) / 3);
  } else if (formula === "absolute") {
    required = input.totalMembers;
  } else {
    required = Math.ceil(input.totalMembers / 2);
  }
  const eligibleCount = Math.max(0, input.actualAttendees - input.recusedCount);
  return {
    eligibleCount,
    requiredQuorum: required,
    meetsQuorum: eligibleCount >= required,
    calculationInputs: input,
  };
}

/* ---------- 議案の状態遷移 ---------- */

export const AGENDA_TRANSITIONS: Record<string, string[]> = {
  created: ["submitted", "withdrawn"],
  submitted: ["returned", "withdrawn", "in_review"],
  returned: ["submitted"],
  withdrawn: [],
  in_review: ["decision_pending", "returned", "withdrawn"],
  decision_pending: ["finalized", "in_review", "withdrawn"],
  finalized: ["closed"],
  closed: [],
};

export function transitionAgenda(from: string, to: string, reason?: string): void {
  const allowed = AGENDA_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError("CONFLICT", `議案を ${from} → ${to} へ遷移できません`, 409, { from, to, allowed, reason: reason ?? null });
  }
}

/* ---------- 会議の状態遷移 ---------- */

export const MEETING_TRANSITIONS: Record<string, string[]> = {
  prepared: ["convened"],
  convened: ["in_progress", "prepared"],
  in_progress: ["closed", "convened"],
  closed: ["minutes_review", "in_progress"],
  minutes_review: ["finalized", "closed"],
  finalized: [],
};

export function transitionMeeting(from: string, to: string): void {
  const allowed = MEETING_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError("CONFLICT", `会議を ${from} → ${to} へ遷移できません`, 409, { from, to, allowed });
  }
}

/* ---------- 指摘の状態遷移 ---------- */

export const FINDING_TRANSITIONS: Record<string, string[]> = {
  draft: ["finalized"],
  finalized: ["awaiting_response"],
  awaiting_response: ["remediating", "closed"],
  remediating: ["retesting", "closed"],
  retesting: ["closed", "reopened"],
  reopened: ["finalized", "remediating"],
  closed: ["reopened"],
};

export function transitionFinding(from: string, to: string, reason?: string): void {
  const allowed = FINDING_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError("CONFLICT", `指摘を ${from} → ${to} へ遷移できません`, 409, { from, to, allowed, reason: reason ?? null });
  }
}

/* ---------- 履行タスク ---------- */

export const ACTION_TRANSITIONS: Record<string, string[]> = {
  not_started: ["in_progress", "evidence_submitted"],
  in_progress: ["evidence_submitted", "returned", "extended"],
  evidence_submitted: ["confirmed", "returned", "extended", "reopened"],
  returned: ["in_progress", "evidence_submitted"],
  extended: ["in_progress", "evidence_submitted"],
  confirmed: ["reopened"],
  reopened: ["in_progress", "evidence_submitted"],
};

export function transitionAction(from: string, to: string, reason?: string): void {
  const allowed = ACTION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError("CONFLICT", `履行タスクを ${from} → ${to} へ遷移できません`, 409, { from, to, allowed, reason: reason ?? null });
  }
}

/* ---------- 職務分離 ---------- */

export function assertNotSameActor(actorA: string, actorB: string | null | undefined, message: string): void {
  if (actorB && actorA === actorB) {
    throw new AppError("SOD", message, 409);
  }
}

export function assertTwoPersonApproval(requestedBy: string, approvedBy: string, message = "申請者と承認者は同一にできません"): void {
  assertNotSameActor(requestedBy, approvedBy, message);
}
