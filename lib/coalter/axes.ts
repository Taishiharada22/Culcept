/**
 * CoAlter Phase 1.5 — 評価軸定義と軸ユーティリティ
 *
 * 軸セット:
 *   共通軸（全テーマ）: price, access, novelty
 *   food: quietness, atmosphere
 *   movie: tone, runtime
 *   travel: activity, relaxation
 *   schedule: flexibility, effort
 *   gift / activity / general: 共通軸のみ
 *
 * pairFit は軸ではなく関係性メタ指標（表示のみ、操作対象外）
 */

import type { Axis, AxisKey, ConversationTheme } from "./types";

// ─────────────────────────────────────────────
// 軸メタ情報
// ─────────────────────────────────────────────

const AXES: Record<AxisKey, Axis> = {
  price: {
    key: "price",
    label: "価格",
    lowLabel: "安い",
    highLabel: "高め",
  },
  access: {
    key: "access",
    label: "アクセス",
    lowLabel: "駅近・簡便",
    highLabel: "手間あり",
  },
  novelty: {
    key: "novelty",
    label: "新しさ",
    lowLabel: "安心・定番",
    highLabel: "新規・冒険",
  },
  quietness: {
    key: "quietness",
    label: "静かさ",
    lowLabel: "賑やか",
    highLabel: "静か",
  },
  atmosphere: {
    key: "atmosphere",
    label: "雰囲気",
    lowLabel: "カジュアル",
    highLabel: "落ち着き",
  },
  tone: {
    key: "tone",
    label: "トーン",
    lowLabel: "軽め",
    highLabel: "重め",
  },
  runtime: {
    key: "runtime",
    label: "上映時間",
    lowLabel: "短め",
    highLabel: "長め",
  },
  activity: {
    key: "activity",
    label: "アクティブ度",
    lowLabel: "ゆったり",
    highLabel: "アクティブ",
  },
  relaxation: {
    key: "relaxation",
    label: "リラックス度",
    lowLabel: "充実",
    highLabel: "のんびり",
  },
  flexibility: {
    key: "flexibility",
    label: "柔軟さ",
    lowLabel: "固定",
    highLabel: "柔軟",
  },
  effort: {
    key: "effort",
    label: "手間",
    lowLabel: "気軽",
    highLabel: "しっかり",
  },
};

/** 全テーマ共通の軸 */
const COMMON_AXES: AxisKey[] = ["price", "access", "novelty"];

/** テーマ固有軸 */
const THEME_AXES: Record<ConversationTheme, AxisKey[]> = {
  food: ["quietness", "atmosphere"],
  movie: ["tone", "runtime"],
  travel: ["activity", "relaxation"],
  schedule: ["flexibility", "effort"],
  gift: [],
  activity: [],
  general: [],
};

// ─────────────────────────────────────────────
// 公開API
// ─────────────────────────────────────────────

/**
 * このテーマで操作可能な軸を返す（共通軸 + テーマ固有軸）
 */
export function getAxesForTheme(theme: ConversationTheme): AxisKey[] {
  return [...COMMON_AXES, ...THEME_AXES[theme]];
}

/** 軸メタ情報を取得 */
export function getAxisMeta(key: AxisKey): Axis {
  return AXES[key];
}

/**
 * pendingAxisDeltas を日本語のテンプレ文に変換する。
 *
 * 例: { quietness: 1, novelty: -1 } → "静かさを上げ、新しさを下げて候補を組み直しました。"
 *
 * reroll 時の reasoning 先頭に固定フォーマットで差し込むために使う。
 */
export function deltasToTemplate(deltas: Record<string, number>): string {
  const parts: string[] = [];
  for (const [key, delta] of Object.entries(deltas)) {
    const axis = AXES[key as AxisKey];
    if (!axis) continue;
    if (delta > 0) {
      parts.push(`${axis.label}を上げ`);
    } else if (delta < 0) {
      parts.push(`${axis.label}を下げ`);
    }
  }
  if (parts.length === 0) return "";
  return parts.join("、") + "て候補を組み直しました。";
}

// ─────────────────────────────────────────────
// seenCandidateKeys 関連
// ─────────────────────────────────────────────

/**
 * タイトル正規化（seenCandidateKeys のフォールバック用）
 * 小文字化 + 空白・記号除去
 */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\s　・\-_、。,.]/g, "");
}

/**
 * 候補から一意キーを抽出。
 *
 * 優先順:
 *   1. URL があれば `url:<hostname><pathname>`
 *   2. URL なしは `title:<normalizedTitle>`
 */
export function candidateKey(c: { title: string; url?: string | null }): string {
  if (c.url) {
    try {
      const u = new URL(c.url);
      return `url:${u.hostname}${u.pathname.replace(/\/$/, "")}`;
    } catch {
      // fall through
    }
  }
  return `title:${normalizeTitle(c.title)}`;
}
