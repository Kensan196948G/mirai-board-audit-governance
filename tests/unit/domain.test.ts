import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateQuorum, transitionAction, transitionAgenda, transitionFinding, transitionMeeting } from "../../src/domain.ts";
import { AppError } from "../../src/errors.ts";

describe("定足数エンジン", () => {
  it("過半数ルールで必要定足数を算出する", () => {
    const r = calculateQuorum({ formula: "majority", totalMembers: 8, actualAttendees: 6, recusedCount: 1, pendingCount: 1 });
    assert.equal(r.requiredQuorum, 4);
    assert.equal(r.eligibleCount, 5);
    assert.equal(r.meetsQuorum, true);
  });

  it("三分の二ルールを適用できる", () => {
    const r = calculateQuorum({ formula: "two_thirds", totalMembers: 9, actualAttendees: 9, recusedCount: 2, pendingCount: 0 });
    assert.equal(r.requiredQuorum, 6);
    assert.equal(r.eligibleCount, 7);
    assert.equal(r.meetsQuorum, true);
  });

  it("在任人数が0なら422", () => {
    assert.throws(() => calculateQuorum({ formula: "majority", totalMembers: 0, actualAttendees: 0, recusedCount: 0, pendingCount: 0 }), AppError);
  });
});

describe("状態遷移ガード", () => {
  it("議案は正規遷移のみ許可する", () => {
    transitionAgenda("created", "submitted");
    transitionAgenda("submitted", "returned");
    transitionAgenda("returned", "submitted");
    transitionAgenda("decision_pending", "finalized");
    assert.throws(() => transitionAgenda("created", "finalized"), AppError);
  });

  it("会議・指摘・履行タスクの遷移ガード", () => {
    transitionMeeting("prepared", "convened");
    transitionMeeting("in_progress", "closed");
    assert.throws(() => transitionMeeting("prepared", "finalized"), AppError);
    transitionFinding("draft", "finalized");
    transitionFinding("remediating", "retesting");
    assert.throws(() => transitionFinding("draft", "closed"), AppError);
    transitionAction("evidence_submitted", "confirmed");
    transitionAction("confirmed", "reopened");
    assert.throws(() => transitionAction("not_started", "confirmed"), AppError);
  });
});
