/**
 * L3.1 LLM Narration Prompt — Comprehension-First v1.3+ Wave 2 末尾 PR
 *
 * 責務:
 *   plan graph (NarrationInput) を LLM narrator に渡す prompt に serialize する。
 *
 * 設計原則（Wave 2 北極星）:
 *   「Narration を plan graph に従属させる」
 *   - System prompt で plan graph 外の情報追加を禁止する
 *   - User prompt で plan graph を明示的に列挙し、LLM が参照すべき値域を固定する
 *   - feedback があれば前回の違反内容を明示し、修正を要求する
 *   - 応答は strict JSON schema で構造化する（{ text, covered_event_ids }）
 *
 * この prompt と L3.2 Faithfulness Checker の allowed 集合は表裏一体:
 *   checker が弾く集合外の値を LLM に作らせない prompt を書く。
 */

import type { NarrationInput } from "./narration";
import { resolveDisplayName } from "../planning/placeGrounder";
import type { FaithfulnessViolation } from "./faithfulnessChecker";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Response schema (OpenAI / Gemini 両対応の JSON Schema subset)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM からの narration 応答スキーマ。
 * - text: 日本語 narration 本文
 * - covered_event_ids: narration 内で実際に言及した event_id 列
 *
 * strict: true （OpenAI Structured Outputs 互換）を想定。
 * Gemini も同じ shape で structured output を受ける。
 */
export const NARRATION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["text", "covered_event_ids"],
  properties: {
    text: {
      type: "string",
      description: "plan graph を日本語で読み上げた narration 本文。plan graph にない情報を絶対に含めてはいけない。",
    },
    covered_event_ids: {
      type: "array",
      description: "narration 本文で実際に言及した event_id の一覧（plan graph の event_id に限る）。",
      items: { type: "string" },
    },
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * System prompt は値に依存しない固定文（cache 効きやすくするため）。
 */
export const NARRATION_SYSTEM_PROMPT = [
  "あなたは plan graph narrator です。",
  "与えられた plan graph を、自然で簡潔な日本語で読み上げます。",
  "",
  "【絶対ルール】",
  "1. plan graph にある event 以外の予定を追加しない。",
  "2. plan graph にない時刻を narration に書かない（推測で補わない）。",
  "3. plan graph にない場所・固有名を narration に書かない。",
  "4. plan graph の who が空の event で、同行者を創作しない。",
  "5. certainty=tentative の event は断定せず、「〜あたり」「〜かも」「〜予定」等の hedge 表現でやわらげる。",
  "6. certainty=confirmed の event は hedge しない。",
  "7. 時刻表現は plan graph の startTime/endTime を踏襲する。形式は「9時」「9時半」「9時30分」「12:30」等の自然な日本語。",
  "8. 場所は plan graph で resolved されていれば resolvedName、unresolved なら place_ref をそのまま使う。",
  "9. 短く、滑らかに、余計な装飾や感想を入れない。",
  "",
  "【出力形式】",
  "必ず以下の JSON で出力してください:",
  '{ "text": "<narration 本文>", "covered_event_ids": ["<event_id>", ...] }',
  "",
  "covered_event_ids には narration 本文で実際に言及した event_id のみを入れてください。",
  "plan graph 全 event を narration に含めるのが望ましいですが、どうしても言及できない event は covered_event_ids から外してください（嘘を書くより省略）。",
].join("\n");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User prompt builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatViolation(v: FaithfulnessViolation): string {
  const parts: string[] = [`- [${v.type}]`];
  if (v.event_id) parts.push(`event_id=${v.event_id}`);
  if (v.offender) parts.push(`offender="${v.offender}"`);
  parts.push(v.message);
  return parts.join(" ");
}

/**
 * plan graph を LLM が読める形で serialize する。
 *
 * 形式例:
 *   # plan graph
 *
 *   ## event e1 (confirmed)
 *   - 時刻: 09:00
 *   - 場所: サドヤ（resolved: サドヤ）
 *   - 活動: コーヒー
 *   - 同行者: （記載なし）
 *
 *   ## event e2 (tentative)
 *   - 時刻: 12:00〜13:00
 *   - 場所: 渋谷（unresolved: 発話通り使う）
 *   - 活動: ランチ
 *   - 同行者: 田中
 *
 *   ## 許容時刻（この集合外の時刻は書かないでください）
 *   09:00, 12:00, 13:00
 *
 *   ## 許容場所（この集合外の固有名は書かないでください）
 *   サドヤ, 渋谷, 田中
 */
export function buildNarrationUserPrompt(input: NarrationInput): string {
  const { comprehension, timeline, grounded } = input;
  const groundedById = new Map(grounded.map((g) => [g.event_id, g]));
  const entryById = new Map(timeline.entries.map((e) => [e.event_id, e]));

  const lines: string[] = [];
  lines.push("# plan graph");
  lines.push("");

  // 許容集合（checker の allowed と揃える）
  const allowedTimes = new Set<string>();
  const allowedPlaces = new Set<string>();
  const allowedWho = new Set<string>();

  for (const ev of comprehension.events) {
    const entry = entryById.get(ev.event_id);
    const g = groundedById.get(ev.event_id);

    lines.push(`## event ${ev.event_id} (${ev.certainty})`);

    // 時刻
    const startTime = entry?.startTime;
    const endTime = entry?.endTime;
    if (startTime && endTime) {
      lines.push(`- 時刻: ${startTime}〜${endTime}`);
      allowedTimes.add(startTime);
      allowedTimes.add(endTime);
    } else if (startTime) {
      lines.push(`- 時刻: ${startTime}`);
      allowedTimes.add(startTime);
    } else {
      lines.push(`- 時刻: （記載なし）`);
    }

    // 場所
    if (g && g.selected) {
      lines.push(
        `- 場所: ${g.selected.resolvedName}（${g.status}${
          g.selected.matchedAlias ? ` / alias=${g.selected.matchedAlias}` : ""
        }）`,
      );
      allowedPlaces.add(g.selected.resolvedName);
      if (g.selected.matchedAlias) allowedPlaces.add(g.selected.matchedAlias);
      if (g.place_ref) allowedPlaces.add(g.place_ref);
    } else if (ev.where.place_ref) {
      lines.push(`- 場所: ${ev.where.place_ref}（unresolved: 発話通り使ってください）`);
      allowedPlaces.add(ev.where.place_ref);
    } else {
      lines.push(`- 場所: （記載なし）`);
    }

    // 活動
    const activity = ev.what.activity || ev.what.activityCanonical;
    if (activity) {
      lines.push(`- 活動: ${activity}`);
      if (ev.what.activity) allowedPlaces.add(ev.what.activity);
      if (ev.what.activityCanonical) allowedPlaces.add(ev.what.activityCanonical);
    }

    // 同行者
    if (ev.who.length > 0) {
      lines.push(`- 同行者: ${ev.who.join("、")}`);
      for (const w of ev.who) {
        allowedWho.add(w);
        allowedPlaces.add(w);
      }
    } else {
      lines.push(`- 同行者: （記載なし。同行者の名前を勝手に足さない）`);
    }

    // hedge 要求
    if (ev.certainty === "tentative") {
      lines.push(
        `- hedge: この event は tentative。断定を避け、「〜あたり」「〜かも」「〜予定」等でやわらげてください。`,
      );
    }
    lines.push("");
  }

  // 許容集合
  lines.push("## 許容時刻（この集合外の時刻は絶対に書かないでください）");
  lines.push(
    allowedTimes.size > 0
      ? Array.from(allowedTimes).sort().join(", ")
      : "（時刻情報なし。narration に時刻を書かないでください）",
  );
  lines.push("");

  lines.push("## 許容固有名（この集合外の固有名・カタカナ語は書かないでください）");
  lines.push(
    allowedPlaces.size > 0
      ? Array.from(allowedPlaces).sort().join(", ")
      : "（固有名情報なし）",
  );
  lines.push("");

  // feedback (retry 時のみ)
  if (input.feedback && input.feedback.length > 0) {
    lines.push("## ⚠ 前回の narration で以下の違反が検出されました。今回は必ず修正してください:");
    for (const v of input.feedback) {
      lines.push(formatViolation(v));
    }
    lines.push("");
  }

  // 最終指示
  lines.push("## 依頼");
  lines.push(
    "上記 plan graph を日本語で 1〜3 文程度に畳み込んで narration してください。",
  );
  lines.push(
    "出力は JSON スキーマ { text: string, covered_event_ids: string[] } に厳密に従ってください。",
  );

  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildNarrationPrompt(input: NarrationInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: NARRATION_SYSTEM_PROMPT,
    userPrompt: buildNarrationUserPrompt(input),
  };
}

// resolveDisplayName を unused 回避のため参照維持
void resolveDisplayName;
