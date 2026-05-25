/**
 * Phase 3-N Plan P2 Step 2 v3.1 — alterNote prompt builder V2 (= 3 層 PM 注入、 GPT 「層を分けたまま」 補正)
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §3 + §4 + Q5 補正
 *
 * 設計原則 (= CEO + GPT 2026-05-25 G2 通過判定):
 *   - **pure module** (= LLM / API / DB / network 不使用、 入力 mutate なし)
 *   - **層を分けたまま注入** (= GPT 「雑に混ぜると generic、 Stable/Recent/Contextual を別 section に」)
 *   - **Output Contract V2 promptInstruction を system prompt に統合** (= 3 部明文化)
 *   - **Phase 別 framing hint** (= PhaseFramingHint で hedging level 制御)
 *
 * V1 (= Step 1) との差:
 *   - V1: 4 short tag を 1 行 「ユーザーの傾向: ◯◯、 ◯◯」 で短く注入 (= 雑に混ぜる)
 *   - V2: Stable / Recent / Contextual を **別 section に分けて注入** (= 「あなたの長期傾向」 「今のあなたの状態」 「今日の文脈」)
 *
 * 構造:
 *   - system prompt:
 *     1. 基本文体規約 (= V1 と同等)
 *     2. **Personal Model 3 層 (= 注入、 Phase に応じた layer)**
 *     3. **Phase 別 framing hint**
 *     4. **Output Contract V2 promptInstruction** (= 3 部統合 1 文ガイド)
 *   - user prompt: V1 と同等 (= ctx の構造化、 personalModel は user prompt に出さない)
 */

import type { AlterNoteContext } from "./types";
import type { PersonalModelV2 } from "./types";
import type { PhaseFramingHint } from "./hdmPhaseGate";
import { ALTER_NOTE_CONTRACT_V2 } from "./outputContract";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Base system prompt (= V1 と共通の文体規約)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SYSTEM_PROMPT_BASE_V2 = [
  "あなたは Aneurasync の予定解釈アシスタントです。",
  "ユーザーが教えてくれた 1 件の予定について、 8〜30 字の短い 「観測的な意味文」 を 1 文だけ返してください。",
  "",
  "目的:",
  "  - ユーザー自身が予定の流れを掴むための、 静かな 「状態描写」 を提供する。",
  "  - 評価や推奨はしない。 観測者の視点で、 場面 / ペース / 質感 を一言で添える。",
  "",
  // v3.2 Patch A: profile vs anchor 衝突優先 rule
  "**重要 — 衝突優先 rule**:",
  "  - ユーザー profile (= 長期傾向 / 内面トーン / 直近リズム) と anchor metadata (= 「会議」 「飲み会」 等) が",
  "    衝突する場合、 **profile を優先して解釈** してください。",
  "  - 例: 「ひとり静か」 ユーザーが 「カフェミーティング」 anchor → 「人と話す前のひととき、 内側を整える時間」",
  "    (= anchor の 「ミーティング」 を無視ではなく、 profile 軸 「ひとり静か」 で reframe)",
  "",
  // v3.4 Patch II (= CEO + GPT 2026-05-25): anchor 事実焼き直し抑制
  "**重要 — anchor 事実の焼き直し禁止**:",
  "  - anchor のタイトル / 時刻 / 場所 / category を そのまま **連続して** 並べて出力するのは禁止。",
  "  - 例 (禁止): anchor 「読書 19:00 カフェ」 → 「夜のカフェで静かに読書する時間」",
  "    (= 「カフェ」 + 「読書」 をほぼ素のまま並べ、 profile (= 集中型) の解釈が一切入っていない)",
  "  - 例 (許可): 「読書 19:00 カフェ」 + 集中型 profile → 「夕方の場所で、 思考を潜らせる」",
  "    (= 「カフェ」 → 「場所」 で抽象化、 「読書」 → 「思考を潜らせる」 で profile 経由 reframe)",
  "  - 「夜 + カフェ + 静か + 読書」 のような **anchor 要素 3 語以上の連続並列** はテンプレ感が強い、 避けてください。",
  "  - anchor の事実は 「半分隠す」 くらいで OK (= profile による意味の方が主役)。",
].join("\n");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Personal Model 3 層 注入 (= GPT 「層を分けたまま」 補正)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Stable layer → prompt 行 (= 「あなたの長期傾向」 section)
 *
 * 全 field optional、 不在 field は出力しない (= token 節約 + safe degrade)
 *
 * 出力例:
 *   ## あなたの長期傾向 (= Stable)
 *   - 判断モード: 集中型
 *   - 時刻偏好: 朝強い
 *   - 内面トーン: ひとり静か
 */
/**
 * v3.4 Patch I (= CEO + GPT 2026-05-25): judgmentMode → 解釈の向き vocabulary mapping
 *
 * 設計意図:
 *   - v3.2 / Step 3 Phase 6 smoke で発見: judgmentMode=集中型 注入しても alterNote が
 *     V1 baseline と核 95% 同 (= 「静か」 1 語のみの差)。
 *   - 「静か」 は generic な category 反射、 judgmentMode 由来ではない。
 *   - prompt が profile 情報を 「文の具体的選語」 に変換しきれていない。
 *
 * 対策 (= CEO 指示):
 *   - judgmentMode 別に **「解釈動詞」 examples** を prompt に明示
 *   - 「これらを使え」 ではなく 「事実描写ではなく 行為の意味 に効かせろ、 例:」 framing
 *   - 集中型: 深める / 沈む / 没頭する / 潜らせる / 一人で整う
 *   - 分散型: 広げる / 触れる / つなぐ / 受け取る / 開く
 *   - 関係エネルギー型: 対話する / 交わる / 響き合う / 通わせる
 *   - 中庸型: 整える / 一息 / 切り替える (= 詩的化禁止維持、 v3.3 轍回避)
 *
 * 注: v3.3 轍回避のため 「必須」 「強制」 ではなく **「例」 framing**。
 *     LLM が anchor 文脈に応じて選択 / 派生できる余地を残す。
 */
function getJudgmentModeInterpretationVerbs(judgmentMode: string): string {
  switch (judgmentMode) {
    case "集中型":
      return "深める / 沈む / 没頭する / 潜らせる / 一人で整う";
    case "分散型":
      return "広げる / 触れる / つなぐ / 受け取る / 開く";
    case "関係エネルギー型":
      return "対話する / 交わる / 響き合う / 通わせる";
    case "中庸型":
      return "整える / 一息 / 切り替える";
    default:
      return "";
  }
}

function formatStableLayerSection(stable: PersonalModelV2["stable"]): string {
  if (!stable) return "";
  const lines: string[] = ["## あなたの長期傾向 (= Stable layer)"];
  let count = 0;
  if (stable.judgmentMode) {
    lines.push(`- 判断モード: ${stable.judgmentMode}`);
    count += 1;
  }
  if (stable.psycheTone) {
    lines.push(`- 深層トーン: ${stable.psycheTone}`);
    count += 1;
  }
  if (stable.timePreference) {
    // v3.4 Patch III: 中庸 timePreference は補助 framing (= 主役にしない、 GPT 指示)
    //   raw 「中庸」 だけだと LLM が 「整え/バランス」 系に詩的化しやすい (= v3.3 P4 後退原因)。
    //   「時間帯に左右されない、 偏向押し付け禁止」 と明示して suppress。
    if (stable.timePreference === "中庸") {
      lines.push("- 時刻偏好: 中庸 (= 時間帯に左右されない、 偏向押し付け禁止、 主役にしない)");
    } else {
      lines.push(`- 時刻偏好: ${stable.timePreference}`);
    }
    count += 1;
  }
  if (stable.traitTone) {
    lines.push(`- 性格傾向: ${stable.traitTone}`);
    count += 1;
  }
  if (stable.archetype) {
    lines.push(`- アーキタイプ: ${stable.archetype}`);
    count += 1;
  }
  if (stable.decisionMode) {
    lines.push(`- 判断スタイル: ${stable.decisionMode}`);
    count += 1;
  }
  if (stable.strengthAxis) {
    lines.push(`- 強み: ${stable.strengthAxis}`);
    count += 1;
  }
  if (stable.workStyle) {
    lines.push(`- 仕事スタイル: ${stable.workStyle}`);
    count += 1;
  }
  if (stable.lifeStageHint) {
    lines.push(`- ライフステージ: ${stable.lifeStageHint}`);
    count += 1;
  }
  if (count === 0) return "";

  // v3.4 Patch I (= CEO + GPT 2026-05-25): judgmentMode 別 解釈動詞 examples
  //   stable injection の prompt 反映を 「雰囲気語」 から 「解釈の向き」 に効かせる。
  //   anchor 事実の焼き直し (= 「夜カフェで静かに読書」) を抑止、
  //   行為の意味 (= 「深める / 没頭する」) に主役を渡す。
  if (stable.judgmentMode) {
    const verbs = getJudgmentModeInterpretationVerbs(stable.judgmentMode);
    if (verbs) {
      lines.push("");
      lines.push(`**解釈の向き hint (= 判断モード ${stable.judgmentMode} の場合の例)**:`);
      lines.push(`  事実描写 (= 「カフェで読書」) ではなく、 **行為の意味** を一段入れる。`);
      lines.push(`  例の動詞: ${verbs}`);
      lines.push(`  注: 「使え」 ではない (= テンプレ化禁止)、 anchor 文脈に応じて選択 / 派生 OK。`);
      lines.push(`  「静か」 等の雰囲気語のみで終わらせない (= V1 baseline と同等になる)。`);
    }
  }

  // v3.2 Patch D 維持: 中庸 profile 対策 (= 詩的化禁止)
  lines.push("");
  lines.push("**解釈ヒント (= 中庸 profile 対策)**:");
  lines.push("  profile が中庸 / バランス系の場合、 「リズム」 「整え」 「ペース」 等の");
  lines.push("  **状態語** で唯一性を立てる (= 中庸の中での個性化)。");
  lines.push("  ただし詩的にしすぎない (= 「リズムの調べ」 「ペースの旋律」 等の比喩は曖昧化を生む)。");
  lines.push("  あくまで観測語として 「整え」 「リズム」 等を素直に使う。");
  return lines.join("\n");
}

/**
 * Recent layer → prompt 行 (= 「今のあなたの状態」 section)
 */
function formatRecentLayerSection(recent: PersonalModelV2["recent"]): string {
  if (!recent) return "";
  const lines: string[] = ["## 今のあなたの状態 (= Recent layer、 直近 7-14 日)"];
  let count = 0;
  if (recent.innerWeather) {
    lines.push(`- 内的天気: ${recent.innerWeather}`);
    count += 1;
  }
  if (recent.recentMood) {
    lines.push(`- 直近気分: ${recent.recentMood}`);
    count += 1;
  }
  if (recent.recentEvents) {
    lines.push(`- 直近イベント: ${recent.recentEvents}`);
    count += 1;
  }
  if (recent.reactionPattern) {
    lines.push(`- 反応パターン: ${recent.reactionPattern}`);
    count += 1;
  }
  if (recent.fluctuation) {
    lines.push(`- 揺らぎ: ${recent.fluctuation}`);
    count += 1;
  }
  if (recent.stressLoad) {
    lines.push(`- ストレス負荷: ${recent.stressLoad}`);
    count += 1;
  }
  if (recent.recentRupture) {
    lines.push(`- 直近 rupture: あり (= 慎重に観測)`);
    count += 1;
  }
  if (recent.recentRhythm) {
    lines.push(`- 直近リズム: ${recent.recentRhythm}`);
    count += 1;
  }
  if (count === 0) return "";
  return lines.join("\n");
}

/**
 * Contextual layer → prompt 行 (= 「今日の予定の文脈」 section)
 */
function formatContextualLayerSection(contextual: PersonalModelV2["contextual"]): string {
  if (!contextual) return "";
  const lines: string[] = ["## 今日の予定の文脈 (= Contextual layer)"];
  let count = 0;
  if (contextual.similarDayRecall) {
    lines.push(`- 似た日の想起: ${contextual.similarDayRecall}`);
    count += 1;
  }
  if (contextual.pastSelfDelta) {
    lines.push(`- 過去自己との差分: ${contextual.pastSelfDelta}`);
    count += 1;
  }
  if (contextual.shiftSignal) {
    lines.push(`- context shift: ${contextual.shiftSignal}`);
    count += 1;
  }
  if (contextual.narrativeContinuity) {
    lines.push(`- 物語の連続性: ${contextual.narrativeContinuity}`);
    count += 1;
  }
  if (contextual.sameSlotHistory) {
    lines.push(`- 同時間帯履歴: ${contextual.sameSlotHistory}`);
    count += 1;
  }
  if (count === 0) return "";
  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 別 framing hint (= prompt に追加する指示)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getFramingInstructionForPhase(hint: PhaseFramingHint): string {
  switch (hint) {
    case "no_personal_framing":
      return [
        "## 文体ガイド (= Phase 0-1)",
        "- 「あなた」 主語を使わない、 一般的な観測文に留める",
        "- 上記 Personal Model は無視して、 fact + interpretation のみで構築",
      ].join("\n");
    case "soft_personal_with_hedge":
      return [
        "## 文体ガイド (= Phase 2)",
        "- 「あなた」 主語 OK、 ただし hedging 強 (= 「〜の傾向」 「〜かもしれない」)",
        "- Personal Model は **参考程度**、 主張しない",
      ].join("\n");
    case "moderate_personal":
      return [
        "## 文体ガイド (= Phase 3)",
        "- 「あなた」 主語 OK、 hedging 弱化",
        "- Personal Model から自然に文体に反映 (= 「あなたが集中しやすい」 等)",
        "- 直近の状態を踏まえた framing OK",
        // v3.2 Patch B: 内部指示強化、 表層テンプレ化禁止
        "- **重要**: profile (= 判断モード / 時刻偏好 / 性格傾向) が **文の内容そのもの** に反映されるよう、",
        "  単なる事実描写ではなく **profile らしさが滲む表現** を選んでください。",
        "  「あなた」 主語を必ず使う必要はなく、 文体・選語・場面捉え方で profile を立てるのが理想。",
        "  例: P1 (集中型 + ひとり静か) → 「静かに沈む時間」 (= 「あなた」 主語なしでも個別性 visible)",
      ].join("\n");
    case "deep_personal_framing":
      return [
        "## 文体ガイド (= Phase 4-5)",
        "- 「あなたの軸では」 「あなたが本当に」 等の深い framing 解禁",
        "- Personal Model を統合的に活用、 「あなたという人」 の一面を映す",
        "- ただし押しつけは厳禁、 観測寄りの解釈に留める",
        // v3.2 Patch B: 内部指示強化、 表層テンプレ化禁止
        "- **必須**: profile の唯一性が **文の内容** に反映されること。",
        "  ただし 「あなたの軸では」 等の特定語句を **毎回使う必要はない**。",
        "  表層の言い回し固定はテンプレ感を生むため、 LLM が文体を自由に選んで profile を立てる方が良い。",
        "  judge は 「表層語句の有無」 ではなく 「profile らしさが伝わるか」 で採点される前提。",
        "  (profile を反映しないと weak_personalization、 user の 「第二の自己」 体験を達成できない)",
      ].join("\n");
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// System prompt 構築 (= base + PM 3 層 + framing + contract)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * V2 system prompt (= 層を分けたまま注入、 GPT 補正)
 *
 * 順序:
 *   1. base 文体規約
 *   2. Personal Model 3 層 (= 充填された layer のみ、 別 section)
 *   3. Phase 別 framing hint
 *   4. Output Contract V2 promptInstruction (= 3 部統合 1 文ガイド)
 *
 * pm が undefined → V1 system prompt と等価動作 (= safe degrade)
 */
export function buildSystemPromptV2(
  pm?: PersonalModelV2,
  framingHint?: PhaseFramingHint,
): string {
  const sections: string[] = [SYSTEM_PROMPT_BASE_V2];

  // PM 3 層を別 section に挿入 (= 雑に混ぜない、 GPT 補正)
  if (pm) {
    const stableSection = formatStableLayerSection(pm.stable);
    const recentSection = formatRecentLayerSection(pm.recent);
    const contextualSection = formatContextualLayerSection(pm.contextual);

    if (stableSection || recentSection || contextualSection) {
      sections.push(""); // 空行で区切り
      if (stableSection) sections.push(stableSection);
      if (recentSection) sections.push(recentSection);
      if (contextualSection) sections.push(contextualSection);
    }
  }

  // Phase framing hint (= Phase < 2 では PM 無視指示も含む)
  if (framingHint) {
    sections.push("");
    sections.push(getFramingInstructionForPhase(framingHint));
  }

  // Output Contract V2 (= 3 部統合 + 禁止語 + generic self-help 拒否)
  sections.push("");
  sections.push(ALTER_NOTE_CONTRACT_V2.promptInstruction);

  return sections.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User prompt (= V1 と等価、 PM は system prompt に注入済み)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_LABEL: Record<AlterNoteContext["category"], string> = {
  cafe: "カフェ",
  meal: "食事",
  work: "仕事 / 学習 / 業務",
  home: "自宅",
  other: "その他",
};

function timeOfDayLabel(hhmm: string): string {
  const hour = Number.parseInt(hhmm.slice(0, 2), 10);
  if (Number.isNaN(hour)) return "(時刻不明)";
  if (hour >= 5 && hour < 11) return "朝";
  if (hour >= 11 && hour < 14) return "昼";
  if (hour >= 14 && hour < 18) return "午後";
  if (hour >= 18 && hour < 23) return "夜";
  return "深夜";
}

export function buildUserPromptV2(ctx: AlterNoteContext): string {
  const lines: string[] = [];
  lines.push(`カテゴリ: ${CATEGORY_LABEL[ctx.category]}`);
  lines.push(`時刻帯: ${timeOfDayLabel(ctx.startTime)} (${ctx.startTime}${ctx.endTime ? `-${ctx.endTime}` : ""})`);
  if (ctx.title !== undefined && ctx.title.length > 0) {
    lines.push(`予定タイトル: ${ctx.title}`);
  }
  if (ctx.location !== undefined && ctx.location.length > 0) {
    lines.push(`場所: ${ctx.location}`);
  }
  lines.push("");
  lines.push(
    "この 1 件の予定について、 上記 Personal Model を踏まえ、 出力契約に従い 8〜30 字の意味文 1 文を JSON で返してください。",
  );
  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 統合 builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build alterNote V2 prompt (= 統合 entry、 generator V2 から呼出)
 *
 * - ctx.personalModelV2 が undefined → V1 等価の system prompt (= safe degrade)
 * - ctx.personalModelV2 + framingHint が指定 → 層を分けたまま PM 注入 + Phase 別 framing
 */
export function buildAlterNotePromptV2(
  ctx: AlterNoteContext,
  framingHint?: PhaseFramingHint,
): {
  readonly systemPrompt: string;
  readonly userPrompt: string;
} {
  return {
    systemPrompt: buildSystemPromptV2(ctx.personalModelV2, framingHint),
    userPrompt: buildUserPromptV2(ctx),
  };
}

/**
 * JSON schema (= V1 同 shape、 runAI requireJson 用)
 */
export const ALTER_NOTE_JSON_SCHEMA_V2 = {
  type: "object",
  properties: {
    text: {
      type: "string",
      minLength: 0,
      maxLength: 60,
    },
  },
  required: ["text"],
  additionalProperties: false,
} as const;
