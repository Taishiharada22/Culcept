/**
 * CoAlter Layer 3b: Narration Enricher (LLM natural prose only)
 *
 * logic-built ProposalCard → 自然文を洗練した ProposalCard
 *
 * 設計:
 *  - LLM は **summary / reasoning / oneLiner の prose のみ** 書き換える
 *  - immutable field は postprocessor で logic 値に強制復元:
 *    title / theater / showtime / runtimeMinutes / releaseStatus / rating /
 *    sourceUrl / axisScores / rationale(role/matchedInterests*)
 *  - LLM 失敗時は logic の card をそのまま返す（品質は落ちない）
 *  - LLM が禁止表現（「〜すべき」「本当は〜」等）を出したら logic に差し戻す
 */

import "server-only";

import { runAI } from "@/lib/ai";
import type {
  ConversationBrief,
  ProposalCandidate,
  ProposalCard,
  RankedCandidate,
} from "./types";
import type { EmotionTag } from "./emotion/types";
import { buildEmotionSignalsBlock } from "./stage1Narration";

interface EnrichArgs {
  baseCard: ProposalCard;
  ranked: RankedCandidate[];
  brief: ConversationBrief;
  timeoutMs?: number;
  userId?: string;
  sessionId?: string;
  /**
   * Phase 3B Layer 2-B: 軽い感情補助信号。
   * - LLM prompt 内のみで使用、user-facing prose には構造化ラベルとして漏らさない。
   * - undefined / 空 → prompt に何も追加しない（既存 prompt と同等）。
   * - postprocessor の FORBIDDEN check で `emotion_signals:` / `speaker:` /
   *   `category:` の prose 漏出を検出して fallback。
   */
  emotionTags?: EmotionTag[];
}

export interface EnrichResult {
  card: ProposalCard;
  llmSuccess: boolean;
  latencyMs: number;
  mode: "llm" | "logic_template";
}

const FORBIDDEN = [
  /べき[だで]/,
  /本当は/,
  /正しい選択/,
  /AはBに合わせ/,
  /BはAに合わせ/,
  // Phase 3B Layer 2-B: emotion_signals 構造化ラベルの prose 漏出を fallback 化。
  // LLM が prompt 内の補助ラベルを誤って prose に複写した場合の保険。
  /emotion_signals\s*:/,
  /^\s*-?\s*speaker\s*:/m,
  /^\s*category\s*:/m,
];

function violatesForbiddenExpressions(text: string): boolean {
  return FORBIDDEN.some((re) => re.test(text));
}

const PROSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string" },
    reasoning: { type: "string" },
    candidateProses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidateKey: { type: "string" },
          oneLiner: { type: "string" },
        },
        required: ["candidateKey", "oneLiner"],
      },
    },
  },
  required: ["summary", "reasoning", "candidateProses"],
};

const SYSTEM_PROMPT = `あなたはCoAlterの文面担当です。与えられた構造化された提案カードの「自然文」だけを磨きます。

# 絶対ルール
- title / 劇場 / 時刻 / 上映時間 / 評価 / URL など固有情報は一切変更しない（変更しても postprocessor で元に戻る）。
- 以下の表現は禁止: 「〜すべき」「本当は〜」「正しい選択」「AはBに合わせ」「BはAに合わせ」。
- 2 人のどちらかを否定しない。中立に扱う。
- 退出トーン: 居座らず、「あとは2人で決めてね」的に自然に閉じる。

# emotion_signals が prompt に含まれる場合の絶対ルール
- emotion_signals は「軽い補助信号」です。感情を決めつけたり強調したりしない。
- 配慮のヒントとして使うだけで、prose 内には書かない。
- prose 内に「emotion_signals:」「speaker:」「category:」などの構造化ラベルを絶対に出力しない。自然文のみ。
- 感情カテゴリ名（mood / indecision / relation / friction）も prose に直接書かない。
- 補助信号が無い場合と prose の温度感を大きく変えない（信号の有無で別人にならない）。

# あなたが書くもの
- summary: 今回決めたいことを2〜3文で整理。何に迷っているか・情報がどれだけ揃っているか。
- reasoning: なぜこの候補になったか（軸の話 + 2人の関係への配慮）を2〜3文。
- candidateProses: 各候補の「oneLiner」を自然に書き直す。候補key はそのまま使う。

JSON のみ。`;

function buildUserPrompt(
  card: ProposalCard,
  ranked: RankedCandidate[],
  emotionTags?: EmotionTag[],
): string {
  const lines: string[] = [];
  lines.push("# 現在の提案カード（自然文のみ磨いてください。事実は触らない）");
  lines.push("");
  lines.push(`## 会話要点（現行）: ${card.summary}`);
  lines.push(`## 理由（現行）: ${card.reasoning}`);
  lines.push("");
  lines.push("## 候補一覧");
  for (const c of ranked) {
    lines.push(
      `- candidateKey="${c.candidateKey}" role=${c.role} title=${c.title} theater=${c.theater ?? "?"} showtime=${c.showtime ?? "?"} matchedA=[${c.rationale.matchedInterestsA.join(",")}] matchedB=[${c.rationale.matchedInterestsB.join(",")}]`,
    );
  }
  // Phase 3B Layer 2-B: emotion_signals は軽い補助信号として末尾に添付。
  // null（タグ無し / 全 malformed）のときは何も追加せず、既存 prompt と同等を保つ。
  // prose には決して出さないルールは SYSTEM_PROMPT 側で明示。
  const emotionBlock = buildEmotionSignalsBlock(emotionTags);
  if (emotionBlock !== null) {
    lines.push("");
    lines.push("## 補助信号（軽い参考のみ。prose には絶対に書き写さない）");
    lines.push(emotionBlock);
  }
  return lines.join("\n");
}

/**
 * ProposalCard の prose だけ LLM で磨く。
 * 失敗時は logic-built card をそのまま返す。
 */
export async function enrichNarration(args: EnrichArgs): Promise<EnrichResult> {
  const started = Date.now();
  const { baseCard, ranked, brief, timeoutMs = 3500, userId, sessionId, emotionTags } = args;

  // 候補が無い場合は LLM を呼ぶ意味がない
  if (ranked.length === 0) {
    return {
      card: baseCard,
      llmSuccess: false,
      latencyMs: Date.now() - started,
      mode: "logic_template",
    };
  }

  try {
    const result = await runAI({
      taskType: "coalter_narration",
      systemPrompt: SYSTEM_PROMPT,
      prompt: buildUserPrompt(baseCard, ranked, emotionTags),
      jsonSchema: PROSE_SCHEMA,
      requireJson: true,
      temperature: 0.5,
      maxOutputTokens: 900,
      timeoutMs,
      userId,
      sessionId,
    });
    const raw = result.structured as Record<string, unknown> | null;
    if (!raw) {
      return {
        card: baseCard,
        llmSuccess: false,
        latencyMs: Date.now() - started,
        mode: "logic_template",
      };
    }

    const enriched = applyProse(baseCard, raw, ranked);
    if (!enriched) {
      return {
        card: baseCard,
        llmSuccess: false,
        latencyMs: Date.now() - started,
        mode: "logic_template",
      };
    }
    return {
      card: enriched,
      llmSuccess: true,
      latencyMs: Date.now() - started,
      mode: "llm",
    };
  } catch {
    return {
      card: baseCard,
      llmSuccess: false,
      latencyMs: Date.now() - started,
      mode: "logic_template",
    };
  }
}

// ─────────────────────────────────────────────
// Prose 適用 (immutable フィールドは保護)
// ─────────────────────────────────────────────

function applyProse(
  base: ProposalCard,
  raw: Record<string, unknown>,
  ranked: RankedCandidate[],
): ProposalCard | null {
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning.trim() : "";

  // 禁止表現チェック
  if (violatesForbiddenExpressions(summary) || violatesForbiddenExpressions(reasoning)) {
    return null;
  }
  // 長すぎ/短すぎチェック
  if (summary.length < 10 || summary.length > 500) return null;
  if (reasoning.length < 10 || reasoning.length > 500) return null;

  // candidateProses を candidateKey で lookup
  const proses = Array.isArray(raw.candidateProses) ? raw.candidateProses : [];
  const oneLinerMap = new Map<string, string>();
  for (const p of proses) {
    if (!p || typeof p !== "object") continue;
    const obj = p as Record<string, unknown>;
    const key = typeof obj.candidateKey === "string" ? obj.candidateKey : null;
    const line = typeof obj.oneLiner === "string" ? obj.oneLiner.trim() : null;
    if (!key || !line) continue;
    if (violatesForbiddenExpressions(line)) continue;
    if (line.length < 5 || line.length > 200) continue;
    oneLinerMap.set(key, line);
  }

  const rankedByCandidateKey = new Map(ranked.map((r) => [r.candidateKey, r]));

  const newCandidates: ProposalCandidate[] = base.candidates.map((cand) => {
    // candidate に対応する RankedCandidate の candidateKey から oneLiner を取る
    // base.candidates は ranked と同順で buildProposalCandidates から来ているので同じ index を使う
    const rankedOne = ranked[cand.rank - 1];
    if (!rankedOne) return cand;
    const llmLine = oneLinerMap.get(rankedOne.candidateKey);
    if (!llmLine) return cand;
    // title / practicalInfo / url / slots は触らない
    return { ...cand, oneLiner: llmLine };
  });

  // Immutable 保護: title, practicalInfo, url, slots, coreSlot, theme は base のまま
  // axisScores も base のまま（今回 base には無いが設定されたら維持）
  return {
    ...base,
    summary,
    reasoning,
    candidates: newCandidates,
  };
}

export const __internal = {
  violatesForbiddenExpressions,
  applyProse,
  buildUserPrompt,
  SYSTEM_PROMPT,
  FORBIDDEN,
};
