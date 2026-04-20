/**
 * CoAlter Slots — 5W1H 束プラン
 *
 * Phase 1.5.4
 *
 * 1候補 = 単一オブジェクトだと、テーマ（映画）がスロット（場所）に上書きされて
 * 「何の映画か」が埋もれる。そこで 1候補を 5W1H の束として扱う。
 *
 * 設計原則:
 *  - title は自由生成ではなく `coreSlot + 補助slot` の合成ルールで生成
 *  - テーマ → (coreSlot, aux候補) はハードコード（LLM に決めさせない）
 *  - coreSlot は必ず埋まる。aux は 1個以上埋まっていれば合成可能
 *  - status=tentative のスロットは UI で「仮」扱い
 *
 * 将来の布石（Phase 1.5.5）:
 *  - 複数の BundledCandidate を when でソート → 1日プラン
 *  - where の動線最適化
 *  - why の統合 narrative
 */

import type { ConversationTheme } from "@/lib/coalter/types";

// ─────────────────────────────────────────────
// Slot 型
// ─────────────────────────────────────────────

/** 5W1H のキー */
export type SlotKey = "what" | "where" | "when" | "who" | "why" | "how";

/**
 * スロットの確定度（3段階）
 *
 * - confirmed: 会話 or 過去プランから確定
 * - proposed:  CoAlter が提案した暫定値（ユーザーはまだ受容していない）
 * - tentative: 仮置き（ユーザーの引きで決まる）。UI で「仮」バッジ
 */
export type SlotStatus = "confirmed" | "proposed" | "tentative";

/** 1スロットの中身 */
export interface SlotContent {
  /** UI に短く出す表記（例: "ラストマイル"、"渋谷ストリーム"） */
  label: string;
  /** 副情報（例: "サスペンス / 118分"、"渋谷駅徒歩5分"） */
  detail?: string;
  /** 外部リンク（公式サイト、食べログ、MAP） */
  url?: string;
  /** 確定度 */
  status: SlotStatus;
}

/** 5W1H の束（全 optional） */
export type SlotBundle = Partial<Record<SlotKey, SlotContent>>;

// ─────────────────────────────────────────────
// テーマルール（ハードコード）
// ─────────────────────────────────────────────

export interface ThemeRule {
  theme: ConversationTheme;
  /** 主軸スロット（必ず埋まっている必要がある） */
  core: SlotKey;
  /** 補助スロット候補（優先順。先にあるものから title に採用） */
  aux: SlotKey[];
  /** title 合成時の区切り文字 */
  titleSep: string;
}

/**
 * Phase 1.5.4 の検証スコープは movie / food / travel の3テーマ。
 * date / gift / schedule / activity / general は未定義（従来の自由生成にフォールバック）。
 */
export const THEME_RULES: Partial<Record<ConversationTheme, ThemeRule>> = {
  movie: {
    theme: "movie",
    core: "what", // 作品タイトルが主軸
    aux: ["where", "when"], // 館 or 上映時刻を添える
    titleSep: " × ",
  },
  food: {
    theme: "food",
    core: "where", // 店が主軸
    aux: ["what"], // 料理ジャンル等を添える
    titleSep: " × ",
  },
  travel: {
    theme: "travel",
    core: "where", // 目的地が主軸
    aux: ["when"], // 時期を添える
    titleSep: " × ",
  },
};

/** テーマルールを取得（未定義テーマは null） */
export function getThemeRule(theme: ConversationTheme | null | undefined): ThemeRule | null {
  if (!theme) return null;
  return THEME_RULES[theme] ?? null;
}

// ─────────────────────────────────────────────
// title 合成器
// ─────────────────────────────────────────────

/**
 * coreSlot 主軸の title 合成。
 *
 * ルール:
 *  - coreSlot が欠けていたら throw（呼び出し側は候補生成を失敗扱いにする）
 *  - aux 優先順に見て、最初に埋まっているものを採用
 *  - aux が全て null なら coreSlot 単独
 */
export function composeTitle(rule: ThemeRule, slots: SlotBundle): string {
  const core = slots[rule.core];
  if (!core || !core.label) {
    throw new Error(`compose_title_core_missing:${rule.core}`);
  }
  const aux = rule.aux.map((k) => slots[k]).find((s) => !!s && !!s.label);
  if (!aux) return core.label;
  return `${core.label}${rule.titleSep}${aux.label}`;
}

/**
 * スロットの合成を試みる（失敗時は null）。
 * LLM 出力のバリデーションで使う。
 */
export function tryComposeTitle(
  theme: ConversationTheme | null | undefined,
  slots: SlotBundle,
): string | null {
  const rule = getThemeRule(theme);
  if (!rule) return null;
  try {
    return composeTitle(rule, slots);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// UI 用ラベル / アイコン
// ─────────────────────────────────────────────

export const SLOT_LABEL: Record<SlotKey, string> = {
  what: "何を",
  where: "どこで",
  when: "いつ",
  who: "誰と",
  why: "なぜ",
  how: "どう",
};

/** テーマ非依存のデフォルトアイコン。テーマ別に上書きする層は UI 側で。 */
export const SLOT_ICON: Record<SlotKey, string> = {
  what: "🎬",
  where: "📍",
  when: "🕐",
  who: "🧑‍🤝‍🧑",
  why: "💡",
  how: "🚶",
};

/** テーマ別のアイコン上書き（what の文脈がテーマで変わるため） */
export const THEME_WHAT_ICON: Partial<Record<ConversationTheme, string>> = {
  movie: "🎬",
  food: "🍽",
  travel: "🧳",
  gift: "🎁",
};

/** coreSlot が確定していて、かつ aux が 1 個以上ある = 合成可能 */
export function canComposeTitle(
  theme: ConversationTheme | null | undefined,
  slots: SlotBundle,
): boolean {
  const rule = getThemeRule(theme);
  if (!rule) return false;
  const core = slots[rule.core];
  if (!core || !core.label) return false;
  return true; // aux は任意（無くても core 単独で返る）
}

// ─────────────────────────────────────────────
// 型ガード
// ─────────────────────────────────────────────

export function isSlotKey(v: unknown): v is SlotKey {
  return (
    v === "what" ||
    v === "where" ||
    v === "when" ||
    v === "who" ||
    v === "why" ||
    v === "how"
  );
}

export function isSlotStatus(v: unknown): v is SlotStatus {
  return v === "confirmed" || v === "proposed" || v === "tentative";
}

/** LLM 生の slot 出力を安全に SlotContent に正規化。無効なら null。 */
export function normalizeSlotContent(raw: unknown): SlotContent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (!label) return null;
  const detail = typeof r.detail === "string" && r.detail.trim().length > 0
    ? r.detail.trim()
    : undefined;
  const url =
    typeof r.url === "string" && /^https?:\/\//.test(r.url.trim())
      ? r.url.trim()
      : undefined;
  const statusRaw = r.status;
  const status: SlotStatus = isSlotStatus(statusRaw) ? statusRaw : "proposed";
  return { label, detail, url, status };
}

/** LLM 生の slots オブジェクトを正規化。不正な slot は落とす。 */
export function normalizeSlotBundle(raw: unknown): SlotBundle {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: SlotBundle = {};
  for (const key of ["what", "where", "when", "who", "why", "how"] as const) {
    const content = normalizeSlotContent(r[key]);
    if (content) out[key] = content;
  }
  return out;
}
