import "server-only";

import { supabaseServer } from "@/lib/supabase/server";

// ============================================================
// Rendezvous Phase Gate
//
// Stargazer Phase（HDM Phase 0-5）に基づいて
// Rendezvous の接続権限を段階的に制御する。
//
// 設計根拠（Part 1 §4）:
//   Phase 2 → 相性パターン仮説の閲覧（個人プロフィールは見せない）
//   Phase 3 → 1対1テキスト接続
//   Phase 4+ → Exchange Protocol全機能、対面推薦
//
// ウィンドウショッピング防止:
//   Phase 2では相手個人ではなく「自分の相性パターンの仮説」だけ提示。
//   Phase 3への動機は「仮説を実際に確かめたい」= 内発的動機を保つ。
//
// 非対称問題の解消:
//   双方が一定Phase以上に達している場合のみ接続可能。
// ============================================================

/** Rendezvous で付与される接続権限 */
export type RendezvousAccessLevel =
  | "none"             // Phase 2 未到達 — Rendezvous 利用不可
  | "hypothesis_only"  // Phase 2 — 自分の相性パターン仮説の閲覧のみ
  | "text_connection"  // Phase 3 — 1対1テキスト接続
  | "full_exchange";   // Phase 4+ — Exchange Protocol 全機能 + 対面推薦

export const ACCESS_LEVEL_LABELS: Record<RendezvousAccessLevel, string> = {
  none: "Stargazer Phase 2 到達でRendezvousが解放されます",
  hypothesis_only: "相性パターンの仮説を閲覧できます",
  text_connection: "1対1テキスト接続が可能です",
  full_exchange: "全機能が利用可能です",
};

export type PhaseGateResult = {
  /** 現在の Stargazer Phase */
  currentPhase: number;
  /** Rendezvous での接続権限 */
  accessLevel: RendezvousAccessLevel;
  /** 権限の説明ラベル */
  accessLabel: string;
  /** 次のレベル解放に必要な Phase（null = 最大） */
  nextPhaseRequired: number | null;
  /** 次のレベルの説明 */
  nextLevelDescription: string | null;
};

/**
 * ユーザーの Stargazer Phase から Rendezvous 接続権限を判定する。
 *
 * DB: stargazer_profiles.hdm_phase_state → currentPhase を参照
 * HDM Phase 0-5 の 0始まりの整数値を使う。
 */
export async function checkPhaseGate(userId: string): Promise<PhaseGateResult> {
  const currentPhase = await fetchCurrentPhase(userId);
  const accessLevel = resolveAccessLevel(currentPhase);

  const nextPhaseRequired = getNextPhaseRequired(accessLevel);
  const nextLevelDescription = getNextLevelDescription(accessLevel);

  return {
    currentPhase,
    accessLevel,
    accessLabel: ACCESS_LEVEL_LABELS[accessLevel],
    nextPhaseRequired,
    nextLevelDescription,
  };
}

/**
 * 2人のユーザーが接続可能かを判定する（非対称問題の解消）。
 *
 * 双方が requiredLevel 以上でなければ接続不可。
 */
export async function checkPairPhaseGate(
  userAId: string,
  userBId: string,
  requiredLevel: RendezvousAccessLevel,
): Promise<{
  allowed: boolean;
  userALevel: RendezvousAccessLevel;
  userBLevel: RendezvousAccessLevel;
  reason: string | null;
}> {
  const [phaseA, phaseB] = await Promise.all([
    fetchCurrentPhase(userAId),
    fetchCurrentPhase(userBId),
  ]);

  const levelA = resolveAccessLevel(phaseA);
  const levelB = resolveAccessLevel(phaseB);

  const levelOrder: RendezvousAccessLevel[] = [
    "none",
    "hypothesis_only",
    "text_connection",
    "full_exchange",
  ];
  const reqIdx = levelOrder.indexOf(requiredLevel);
  const aIdx = levelOrder.indexOf(levelA);
  const bIdx = levelOrder.indexOf(levelB);

  if (aIdx >= reqIdx && bIdx >= reqIdx) {
    return { allowed: true, userALevel: levelA, userBLevel: levelB, reason: null };
  }

  const lower = aIdx < bIdx ? "A" : "B";
  const lowerPhase = lower === "A" ? phaseA : phaseB;
  return {
    allowed: false,
    userALevel: levelA,
    userBLevel: levelB,
    reason: `ユーザー${lower}のStargazer Phase(${lowerPhase})が不足しています`,
  };
}

// ── 内部ロジック ──

async function fetchCurrentPhase(userId: string): Promise<number> {
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("stargazer_profiles")
    .select("hdm_phase_state")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.hdm_phase_state) return 0;

  const phaseState = data.hdm_phase_state as Record<string, unknown>;
  const currentPhase = (phaseState.currentPhase as number) ?? 0;

  return currentPhase;
}

function resolveAccessLevel(phase: number): RendezvousAccessLevel {
  if (phase >= 4) return "full_exchange";
  if (phase >= 3) return "text_connection";
  if (phase >= 2) return "hypothesis_only";
  return "none";
}

function getNextPhaseRequired(
  current: RendezvousAccessLevel,
): number | null {
  switch (current) {
    case "none":
      return 2;
    case "hypothesis_only":
      return 3;
    case "text_connection":
      return 4;
    case "full_exchange":
      return null;
  }
}

function getNextLevelDescription(
  current: RendezvousAccessLevel,
): string | null {
  switch (current) {
    case "none":
      return "Phase 2 で相性パターン仮説の閲覧が解放されます";
    case "hypothesis_only":
      return "Phase 3 で 1対1 テキスト接続が解放されます";
    case "text_connection":
      return "Phase 4 で Exchange Protocol 全機能が解放されます";
    case "full_exchange":
      return null;
  }
}
