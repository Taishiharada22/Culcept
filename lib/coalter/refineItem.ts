/**
 * CoAlter Refine Item — 局所リファインメント
 *
 * Phase 1.5.3（Claude 旅行プラン機能取り込み ④）
 *
 * 採用済みアイテムを「部分修正」する。全体やり直しではなく
 * 「ここだけ変えて」を可能にする：2人のすり合わせの本質は局所修正。
 *
 * direction（方向ヒント）で差し替え候補を1つだけ LLM から取得する。
 *
 * 設計原則:
 *  - 大胆にずらしすぎない（元アイテムの核は残す）
 *  - カテゴリ・日付は固定（時刻のみ direction 次第で更新）
 *  - 禁止表現チェックは proposalGenerator と同じポリシー
 */

import "server-only";
import { runAI } from "@/lib/ai";
import type { PlanItem } from "@/lib/coalter/planShelf";

export type RefineDirection =
  | "cheaper" // 予算を抑えめに
  | "earlier" // 時刻を早めに
  | "later" // 時刻を遅めに
  | "closer" // より近場に
  | "quieter" // もっと落ち着ける雰囲気に
  | "livelier"; // もっと賑やかな雰囲気に

export const REFINE_DIRECTION_LABEL: Record<RefineDirection, string> = {
  cheaper: "予算抑えめに",
  earlier: "時刻を早めに",
  later: "時刻を遅めに",
  closer: "近場に",
  quieter: "落ち着ける雰囲気に",
  livelier: "賑やかな雰囲気に",
};

const DIRECTION_HINT_JA: Record<RefineDirection, string> = {
  cheaper: "予算を抑えめにしたい。コスパ寄り。",
  earlier: "時刻を前倒しにしたい。",
  later: "時刻を遅めにしたい。",
  closer: "移動が少ない、より近い場所がよい。",
  quieter: "落ち着いていて静かな雰囲気。混雑を避けたい。",
  livelier: "賑やかで活気のある雰囲気。人が集まる場所。",
};

export interface RefineCandidate {
  title: string;
  oneLiner: string;
  practicalInfo: string | null;
  url: string | null;
  /** direction をどう反映したかの短いメモ（UI補助） */
  changeNote: string;
  /** 提案する timeSlot（null なら元の timeSlot を踏襲） */
  timeSlot: string | null;
}

// ─────────────────────────────────────────────
// スキーマ
// ─────────────────────────────────────────────

const REFINE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    oneLiner: { type: "string" },
    practicalInfo: { type: ["string", "null"] },
    url: { type: ["string", "null"] },
    changeNote: { type: "string" },
    timeSlot: { type: ["string", "null"] },
  },
  required: ["title", "oneLiner", "changeNote"],
  additionalProperties: false,
} as const;

// ─────────────────────────────────────────────
// 禁止表現（proposalGenerator と同じポリシー）
// ─────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  /すべきです/,
  /しなければ/,
  /最適な選択は/,
  /正しい(選択|答え|判断)は/,
  /本当は.{0,10}思って/,
  /マッチング度|一致度|適合率/,
  /\d{2,3}%/,
];

function sanitize(text: string): string {
  let t = text;
  for (const p of FORBIDDEN_PATTERNS) {
    t = t.replace(p, "");
  }
  return t.trim();
}

// ─────────────────────────────────────────────
// プロンプト
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは CoAlter。2人の関係と文脈を知った上で、採用済み候補の「局所修正案」を1つだけ生成する。

重要な原則:
- 元の候補の核（目的・日付・カテゴリ）は維持する
- direction が指す方向にだけ寄せる（大胆にずらさない）
- 「〜すべき」「最適な〜」等の断定・命令は禁止
- 2人のどちらかを正しいと置かない

出力は JSON 単一候補:
{
  "title": "...",
  "oneLiner": "15-40文字の説明",
  "practicalInfo": "住所・料金などの実用情報 or null",
  "url": "候補のURL or null",
  "changeNote": "direction をどう反映したかの短い一言（20文字程度）",
  "timeSlot": "提案する時刻 or null（元を踏襲する場合）"
}`;

function buildRefinePrompt(
  item: Pick<PlanItem, "title" | "description" | "practicalInfo" | "timeSlot" | "category" | "targetDate">,
  direction: RefineDirection,
): string {
  return [
    "# 採用済み候補",
    `- title: ${item.title}`,
    `- description: ${item.description}`,
    `- practicalInfo: ${item.practicalInfo ?? "(なし)"}`,
    `- timeSlot: ${item.timeSlot ?? "(未設定)"}`,
    `- category: ${item.category}`,
    `- targetDate: ${item.targetDate}`,
    "",
    `# 変更方向（direction）`,
    `${direction}: ${DIRECTION_HINT_JA[direction]}`,
    "",
    "# 依頼",
    "この候補を上記 direction に沿って **局所修正** した差し替え案を 1 つだけ出してください。",
    "日付・カテゴリは変えない。時刻は direction が時刻系（earlier/later）なら調整、それ以外は元を踏襲。",
  ].join("\n");
}

// ─────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────

/**
 * direction を指定して差し替え候補を 1 つ生成する。
 * LLM 失敗時は throw。
 */
export async function generateRefinedCandidate(params: {
  item: Pick<
    PlanItem,
    "title" | "description" | "practicalInfo" | "timeSlot" | "category" | "targetDate"
  >;
  direction: RefineDirection;
  userId?: string | null;
}): Promise<RefineCandidate> {
  const { item, direction, userId } = params;
  const prompt = buildRefinePrompt(item, direction);

  const result = await runAI({
    taskType: "coalter_refine_item",
    userId: userId ?? undefined,
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: REFINE_SCHEMA,
    requireJson: true,
    temperature: 0.6,
    maxOutputTokens: 512,
    timeoutMs: 10000,
  });

  const raw = result.structured as Record<string, unknown> | null;
  if (!raw) {
    throw new Error("refine_item_no_structured_output");
  }

  const title = sanitize(String(raw.title ?? ""));
  const oneLiner = sanitize(String(raw.oneLiner ?? ""));
  const changeNote = sanitize(String(raw.changeNote ?? ""));
  if (!title || !oneLiner) {
    throw new Error("refine_item_invalid_output");
  }

  const practicalInfoRaw = raw.practicalInfo;
  const practicalInfo =
    typeof practicalInfoRaw === "string" && practicalInfoRaw.trim().length > 0
      ? sanitize(practicalInfoRaw)
      : null;
  const urlRaw = raw.url;
  const url =
    typeof urlRaw === "string" && /^https?:\/\//.test(urlRaw.trim())
      ? urlRaw.trim()
      : null;
  const timeSlotRaw = raw.timeSlot;
  const timeSlot =
    typeof timeSlotRaw === "string" && timeSlotRaw.trim().length > 0
      ? timeSlotRaw.trim()
      : null;

  return {
    title,
    oneLiner,
    practicalInfo,
    url,
    changeNote: changeNote || REFINE_DIRECTION_LABEL[direction],
    timeSlot,
  };
}

/** direction が妥当かチェック */
export function isRefineDirection(v: unknown): v is RefineDirection {
  return (
    v === "cheaper" ||
    v === "earlier" ||
    v === "later" ||
    v === "closer" ||
    v === "quieter" ||
    v === "livelier"
  );
}

/** テスト用に sanitize を export */
export const __internal = { sanitize, buildRefinePrompt };
