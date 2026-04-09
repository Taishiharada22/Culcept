import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildContagionProfile,
  type ContagionProfile,
} from "../emotionalContagion";
import {
  type TensionResponse,
  type TensionLevel,
  getTensionPromptById,
} from "../tensionArchitecture";
import {
  computeConflictRepairProfile,
  type ConflictRepairProfile,
} from "../conflictRepair";

// ============================================================
// Asset Collector — Counselor 判断に必要な既存資産を一括収集
//
// emotionalContagion と tensionArchitecture のデータを
// Counselor の各判断点で消費可能な形に変換する。
//
// 設計原則:
//   - fail-open: 収集失敗で判断が止まらない
//   - 追加 DB クエリは最小限（既に取得済みのメッセージを再利用可能）
//   - 各判断点が必要な部分だけ使う（全部入り構造体を渡す）
// ============================================================

// ── 型定義 ──

export type EmotionalResonanceSummary = {
  /** 感情共鳴スコア (0-1) */
  resonanceScore: number;
  /** 感情の主導方向 */
  dominantFlow: ContagionProfile["dominantFlow"];
  /** 現在の感情温度 (0-1) */
  currentTemperature: number;
  /** ピークモーメントの日本語記述（最大3件） */
  peakMomentDescriptions: string[];
};

export type TensionPatternSummary = {
  /** 総応答数 */
  totalResponses: number;
  /** faced 数 */
  facedCount: number;
  /** deferred 数 */
  deferredCount: number;
  /** reflected 数 */
  reflectedCount: number;
  /** 到達した最深レベル */
  deepestLevelReached: TensionLevel | null;
  /** 直近の応答タイプ */
  recentResponseType: "faced" | "deferred" | "reflected" | null;
  /** 葛藤修復プロファイル（Gottman式） */
  conflictRepair: ConflictRepairProfile;
};

export type CounselorAssetContext = {
  /** 感情共鳴の要約（メッセージ不足の場合 null） */
  emotionalResonance: EmotionalResonanceSummary | null;
  /** テンション応答パターンの要約（応答なしの場合 null） */
  tensionPattern: TensionPatternSummary | null;
};

// ── 公開API ──

/**
 * 特定の candidate ペアに対する Counselor 資産を一括収集する。
 *
 * @param candidateId - 候補ペアID
 * @param userId - 観測対象ユーザー（"self" 視点の主体）
 * @param existingMessages - 既に取得済みのメッセージ（再利用で DB クエリ削減）
 */
export async function collectCounselorAssets(params: {
  candidateId: string;
  userId: string;
  existingMessages?: Array<{ body: string; sender_id: string; created_at: string }>;
}): Promise<CounselorAssetContext> {
  const { candidateId, userId, existingMessages } = params;

  // 並列に収集（fail-open）
  const [emotionalResonance, tensionPattern] = await Promise.all([
    collectEmotionalResonance(candidateId, userId, existingMessages).catch(
      () => null,
    ),
    collectTensionPattern(candidateId, userId).catch(() => null),
  ]);

  return { emotionalResonance, tensionPattern };
}

/**
 * 資産コンテキストを Counselor プロンプトに注入可能なテキストに変換する。
 * null の要素はスキップされる。
 */
export function formatAssetContextForPrompt(
  ctx: CounselorAssetContext,
): string {
  const lines: string[] = [];

  if (ctx.emotionalResonance) {
    const er = ctx.emotionalResonance;
    const flowLabel = {
      self_to_other: "ユーザー → 相手（ユーザーが感情をリード）",
      other_to_self: "相手 → ユーザー（相手の感情に影響されやすい）",
      mutual: "双方向（互いに感情が影響し合っている）",
      independent: "独立（感情的な連動が弱い）",
    }[er.dominantFlow];

    lines.push("【感情共鳴分析】");
    lines.push(`- 共鳴スコア: ${(er.resonanceScore * 100).toFixed(0)}%`);
    lines.push(`- 感情の流れ: ${flowLabel}`);
    lines.push(
      `- 現在の温度: ${(er.currentTemperature * 100).toFixed(0)}%`,
    );
    if (er.peakMomentDescriptions.length > 0) {
      lines.push(
        `- 共鳴ピーク: ${er.peakMomentDescriptions.join("、")}`,
      );
    }
  }

  if (ctx.tensionPattern) {
    const tp = ctx.tensionPattern;
    lines.push("【テンション応答パターン】");
    lines.push(
      `- 応答数: ${tp.totalResponses}回（faced ${tp.facedCount} / reflected ${tp.reflectedCount} / deferred ${tp.deferredCount}）`,
    );
    if (tp.deepestLevelReached) {
      const levelLabel = {
        gentle: "穏やか",
        moderate: "中程度",
        confronting: "対峙的",
        deep: "深層",
      }[tp.deepestLevelReached];
      lines.push(`- 到達深度: ${levelLabel}レベル`);
    }
    if (tp.recentResponseType) {
      const responseLabel = {
        faced: "向き合った",
        deferred: "保留にした",
        reflected: "内省した",
      }[tp.recentResponseType];
      lines.push(`- 直近の応答: ${responseLabel}`);
    }

    const cr = tp.conflictRepair;
    lines.push(
      `- 葛藤修復力: 主導力 ${(cr.repairInitiative * 100).toFixed(0)}% / 応答性 ${(cr.responsiveness * 100).toFixed(0)}% / 回復速度 ${(cr.recoverySpeed * 100).toFixed(0)}%`,
    );
    if (cr.escalationTendency > 0.4) {
      lines.push(
        `- ⚠ エスカレーション傾向: ${(cr.escalationTendency * 100).toFixed(0)}%（要注意）`,
      );
    }
  }

  return lines.join("\n");
}

// ── 内部実装 ──

const LEVEL_ORDER: Record<TensionLevel, number> = {
  gentle: 0,
  moderate: 1,
  confronting: 2,
  deep: 3,
};

async function collectEmotionalResonance(
  candidateId: string,
  userId: string,
  existingMessages?: Array<{ body: string; sender_id: string; created_at: string }>,
): Promise<EmotionalResonanceSummary | null> {
  let messages: Array<{ text: string; sender_id: string; created_at: string }>;

  if (existingMessages && existingMessages.length >= 10) {
    // 既存メッセージを再利用（DB クエリ削減）
    messages = existingMessages.map((m) => ({
      text: m.body,
      sender_id: m.sender_id,
      created_at: m.created_at,
    }));
  } else {
    // DB から取得
    const { data } = await supabaseAdmin
      .from("rendezvous_messages")
      .select("body, sender_id, created_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (!data || data.length < 10) return null;

    messages = data.map((m) => ({
      text: m.body ?? "",
      sender_id: m.sender_id,
      created_at: m.created_at,
    }));
  }

  const profile = buildContagionProfile(messages, userId);

  // resonanceScore が極めて低い場合は有意義なデータがないとみなす
  if (profile.contagionEvents.length === 0) return null;

  return {
    resonanceScore: profile.resonanceScore,
    dominantFlow: profile.dominantFlow,
    currentTemperature: profile.currentTemperature,
    peakMomentDescriptions: profile.peakMoments.map((p) => p.description),
  };
}

async function collectTensionPattern(
  candidateId: string,
  userId: string,
): Promise<TensionPatternSummary | null> {
  const { data } = await supabaseAdmin
    .from("rendezvous_tension_responses")
    .select("prompt_id, response, reflection, created_at")
    .eq("candidate_id", candidateId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return null;

  const responses: TensionResponse[] = data.map((r) => ({
    promptId: r.prompt_id,
    response: r.response as TensionResponse["response"],
    reflection: r.reflection ?? undefined,
    respondedAt: r.created_at,
  }));

  // 応答カウント
  const facedCount = responses.filter((r) => r.response === "faced").length;
  const deferredCount = responses.filter(
    (r) => r.response === "deferred",
  ).length;
  const reflectedCount = responses.filter(
    (r) => r.response === "reflected",
  ).length;

  // 最深レベル
  let deepestLevel: TensionLevel | null = null;
  let deepestOrder = -1;
  for (const r of responses) {
    const prompt = getTensionPromptById(r.promptId);
    if (prompt) {
      const order = LEVEL_ORDER[prompt.level];
      if (order > deepestOrder) {
        deepestOrder = order;
        deepestLevel = prompt.level;
      }
    }
  }

  // 葛藤修復プロファイル
  const conflictRepair = computeConflictRepairProfile({
    tensionResponses: responses,
  });

  // 直近の応答
  const recentResponse = responses[responses.length - 1];

  return {
    totalResponses: responses.length,
    facedCount,
    deferredCount,
    reflectedCount,
    deepestLevelReached: deepestLevel,
    recentResponseType: recentResponse?.response ?? null,
    conflictRepair,
  };
}
