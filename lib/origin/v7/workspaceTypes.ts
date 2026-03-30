// Origin v7 — Workspace Types
// 形成履歴ワークスペースの型定義

import type { LifePeriod } from "./types";

/* ─── A. Root Profile ─── */

export type HomeAtmosphere =
  | "warm" | "strict" | "quiet" | "busy" | "tense"
  | "free" | "unstable" | "lonely" | "mixed";

export type RootProfile = {
  birthplace: string;
  childhoodLocation: string;
  homeAtmosphere: HomeAtmosphere | null;
  distanceFromHometown: "living" | "near" | "far" | "very_far" | null;
  movingHistory: MovingEntry[];
  completedAt: string | null;
  // v8: Life Calendar 用
  birthYear?: number;
  birthMonth?: number;
};

export type MovingReason =
  | "family" | "school" | "work" | "marriage"
  | "independence" | "environment" | "other";

export type MovingEntry = {
  id: string;
  period: LifePeriod;
  fromLocation: string;
  toLocation: string;
  reason: MovingReason | null;
};

export function createEmptyRootProfile(): RootProfile {
  return {
    birthplace: "",
    childhoodLocation: "",
    homeAtmosphere: null,
    distanceFromHometown: null,
    movingHistory: [],
    completedAt: null,
  };
}

/* ─── B. 時代骨格（Era Affiliation） ─── */

export type EraRole =
  | "leader" | "supporter" | "lone_wolf" | "mediator"
  | "entertainer" | "follower" | "observer" | "outsider";

export type RelationshipTone =
  | "close_group" | "wide_shallow" | "few_deep"
  | "mostly_alone" | "mixed";

export type LifeCenter =
  | "study" | "club" | "friends" | "family" | "hobby"
  | "part_time" | "romance" | "survival" | "escape";

export type EraAffiliation = {
  id: string;
  period: LifePeriod;
  school: string | null;
  affiliation: string | null;
  mainActivity: string | null;
  mainRole: EraRole | null;
  atmosphere: string | null;
  relationships: RelationshipTone | null;
  lifeCenter: LifeCenter | null;
};

/* ─── C. 活動履歴（Activity History） ─── */

export type ActivityCategory =
  | "club" | "hobby" | "study" | "part_time" | "job"
  | "creative" | "competition" | "volunteer" | "other";

export type ActivityEntry = {
  id: string;
  name: string;
  category: ActivityCategory;
  period: LifePeriod;
  endPeriod?: LifePeriod;
  leadershipRole: boolean;
  caretakerRole: boolean;
  timeAllocation: "main" | "secondary" | "occasional";
  analyticalFrame: AnalyticalFrame | null;
};

/* ─── D. 共通分析フレーム（14問） ─── */

export type RewardType =
  | "security" | "recognition" | "achievement"
  | "belonging" | "freedom";

export type AnalyticalFrame = {
  whatWasDone: string | null;          // Q1: 何をしていたか
  environment: string | null;          // Q2: 環境
  role: EraRole | null;                // Q3: 役割
  whyStarted: WhyStartedReason[];     // Q4: 始めた理由
  whyContinued: WhyContinuedReason[];  // Q5: 続けた理由
  whyStopped: WhyStoppedReason[];      // Q6: やめた理由
  whatWasSought: string | null;        // Q7: 求めていたもの
  whatWasAvoided: string | null;       // Q8: 避けていたもの
  pressure: string | null;            // Q9: 圧力
  reward: RewardType[];               // Q10: 報酬
  whatGained: string | null;           // Q11: 得たもの
  whatLost: string | null;             // Q12: 失ったもの
  learnedRules: string | null;        // Q13: 覚えたルール
  whatRemains: string | null;          // Q14: 今に残るもの
};

export function createEmptyAnalyticalFrame(): AnalyticalFrame {
  return {
    whatWasDone: null,
    environment: null,
    role: null,
    whyStarted: [],
    whyContinued: [],
    whyStopped: [],
    whatWasSought: null,
    whatWasAvoided: null,
    pressure: null,
    reward: [],
    whatGained: null,
    whatLost: null,
    learnedRules: null,
    whatRemains: null,
  };
}

/* ─── E. 理由台帳（Why Ledger） ─── */

export type WhyStartedReason =
  | "liked_it" | "good_at_it" | "invited" | "family_influence"
  | "wanted_belonging" | "wanted_recognition" | "for_future"
  | "wanted_escape" | "wanted_change" | "neutral";

export type WhyContinuedReason =
  | "enjoyable" | "got_results" | "recognized" | "had_peers"
  | "hard_to_quit" | "became_habit" | "core_self" | "nowhere_else";

export type WhyStoppedReason =
  | "lost_interest" | "environment_changed" | "tired" | "hurt"
  | "job_done" | "found_alternative" | "didnt_fit" | "couldnt_continue";

/* ─── F. 転機（Turning Points） ─── */

export type TurningPointCategory =
  | "beginning" | "ending" | "meeting" | "separation"
  | "win" | "loss" | "defeat" | "move" | "decision";

export type TurningPoint = {
  id: string;
  period: LifePeriod;
  category: TurningPointCategory;
  title: string;
  impact: "transformative" | "significant" | "subtle";
  analyticalFrame: AnalyticalFrame | null;
};

/* ─── G. 残留ボード（Residue Board） ─── */

export type ResidueCategory =
  | "behavioral_pattern" | "interpersonal_habit"
  | "pride" | "wound" | "weapon" | "defense" | "still_seeking";

export type ResidueItem = {
  id: string;
  category: ResidueCategory;
  label: string;
  sourceActivityId?: string;
  sourceTurningPointId?: string;
  intensity: "strong" | "moderate" | "faint";
};

/* ─── ワークスペース状態 ─── */

export type ActivePanel = "left" | "center" | "right";

export type RightPanelView =
  | "empty"
  | "detail"
  | "deep_exploration"
  | "activity_edit"
  | "turning_point_edit"
  | "root_edit"
  | "era_edit"
  | "residue_edit"
  | "vector_refinement";
