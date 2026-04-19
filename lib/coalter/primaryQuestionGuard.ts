/**
 * CoAlter 2026-04-19 — Primary Question Guard (CEO 採用案 D)
 *
 * 目的:
 *   rankedCount=0 / candidates=[] の fallback 質問が「何を観に行くか」
 *   「どの映画にする？」のように **ユーザーが答えを持っていない質問** になる事故を
 *   構造で排除する。
 *
 * 事故例 (2026-04-19 実測):
 *   - thread 18eeb9ff, catalogCount=0, rankedCount=0
 *   - LLM briefBuilder が primaryUnresolvedQuestion.question="土曜日に何を観に行くか"
 *     (slot="what") を出力 → movieOrchestrator が summary にそのまま差し込み
 *   - 「迷っている」ユーザーに「何を観る？」と聞く = 質問として破綻
 *
 * 契約:
 *   - slot="what" は **禁止**（何を観る/食べる/買う は CoAlter の仕事）
 *   - 「何を」「どの」「どれを」「なにを」+ 観/見/食/行/決/選 の動詞組み合わせ
 *     も禁止パターン（slot が誤って "where" 等になっていても弾く）
 *   - 破綻質問を検出したら破棄し、埋まっていない **条件スロット** を優先順で 1 問だけ返す
 *   - 返す質問は必ず closed-vocabulary / 2 択誘導（ユーザーが答えやすい形）
 *   - 全て埋まっている / 条件質問を作れない場合は null
 */

import type {
  ConversationAnalysis,
  ConversationBrief,
  ConversationTheme,
  PrimaryUnresolvedQuestion,
} from "./types";

/** 条件質問生成の最小入力 (brief と analysis の両方から derive できる共通形) */
interface ConditionContext {
  area: string | null;
  date: string | null;
  timeSlot: string | null;
  moodLen: number;
}

/**
 * 破綻質問かどうかを判定する pure check。
 */
export function isBrokenPickQuestion(
  q: PrimaryUnresolvedQuestion | null,
): boolean {
  if (!q) return false;
  if (q.slot === "what") return true;
  const text = q.question ?? "";
  // 「何を/どれを/どの/なにを」+（観|見|食|行|買|決|選|選ぶ|やる）の組み合わせは
  // ユーザーが既に答えを持っている前提の質問。回答を本人に求める時点で破綻する。
  if (
    /(何を|どれを|どの(?!あたり|時間|くらい|ぐらい)|なにを)[^。？?!！\n]{0,12}(観|見|食|行|買|決|選|やる)/.test(
      text,
    )
  ) {
    return true;
  }
  // 「作品名を教えて」「タイトルを教えて」「映画の名前」類も禁止
  if (/(作品名|タイトル|映画の名前|店の名前|料理名)/.test(text)) {
    return true;
  }
  return false;
}

/**
 * 埋まっていない条件スロットから、ユーザーが答えやすい 1 問を生成する。
 *
 * 優先順 (theme="movie"):
 *   1. area 未定 → 「どのあたりで観る？」
 *   2. date/timeSlot 未定 → 「昼と夜どっちが合う？」
 *   3. mood 未定 → 「軽めと重めどっち？」
 *   4. 何も欠けていないが rank=0 → 「上映時間は長め/短めどっちが合う？」
 *
 * theme="food" は area → timeSlot → mood の順。
 * その他テーマは null（legacy 側にお任せ）。
 *
 * 2026-04-19 CEO 採用案 E: Loop guard
 *   `avoidKey` に直前 invoke で既に聞いた質問 key を渡すと、その優先は
 *   skip して次に進む。全優先が潰れた場合は null を返す（= 撤退 summary）。
 */
function generateConditionQuestion(
  ctx: ConditionContext,
  theme: ConversationTheme,
  avoidKey: string | null = null,
): PrimaryUnresolvedQuestion | null {
  const { area, date, timeSlot, moodLen } = ctx;

  const tryReturn = (q: PrimaryUnresolvedQuestion): PrimaryUnresolvedQuestion | null => {
    if (avoidKey && q.key === avoidKey) return null;
    return q;
  };

  if (theme === "movie") {
    const candidates: Array<PrimaryUnresolvedQuestion | null> = [];
    if (!area) {
      candidates.push(tryReturn({
        key: "area",
        slot: "where",
        question: "どのあたりで観る？渋谷・新宿・池袋あたりでイメージある？",
      }));
    }
    if (!date && !timeSlot) {
      candidates.push(tryReturn({
        key: "time",
        slot: "when",
        question: "時間帯は昼と夜どっちが合う？",
      }));
    }
    if (moodLen === 0) {
      candidates.push(tryReturn({
        key: "mood",
        slot: "how",
        question: "気分は軽めと重めどっちに寄ってる？",
      }));
    }
    candidates.push(tryReturn({
      key: "runtime",
      slot: "how",
      question: "上映時間は長めと短めどっちが合う？",
    }));
    const next = candidates.find((c) => c !== null);
    return next ?? null;
  }

  if (theme === "food") {
    const candidates: Array<PrimaryUnresolvedQuestion | null> = [];
    if (!area) {
      candidates.push(tryReturn({
        key: "area",
        slot: "where",
        question: "エリアはどのあたり？渋谷・新宿あたりでイメージある？",
      }));
    }
    if (!date && !timeSlot) {
      candidates.push(tryReturn({
        key: "time",
        slot: "when",
        question: "時間は昼と夜どっち？",
      }));
    }
    if (moodLen === 0) {
      candidates.push(tryReturn({
        key: "mood",
        slot: "how",
        question: "気分は軽めとしっかりめどっち？",
      }));
    }
    const next = candidates.find((c) => c !== null);
    return next ?? null;
  }

  return null;
}

/**
 * primaryUnresolvedQuestion を受け取り、破綻なら条件質問に差し替える。
 *
 * - 破綻でない & null でない → そのまま通す
 * - 破綻を検出 → 条件質問に書き換え（作れなければ null）
 * - 元から null → 条件質問を作れるなら生成、無理なら null のまま
 */
function briefToContext(brief: ConversationBrief): ConditionContext {
  return {
    area: brief.area ?? null,
    date: brief.approximateTime?.date ?? null,
    timeSlot: brief.approximateTime?.timeSlot ?? null,
    moodLen: Array.isArray(brief.mood) ? brief.mood.length : 0,
  };
}

function analysisToContext(analysis: ConversationAnalysis): ConditionContext {
  const c = analysis.extractedConstraints;
  return {
    area: c?.location ?? null,
    date: c?.date ?? null,
    timeSlot: c?.timeSlot ?? null,
    // legacy 側は mood を抽出しないので常に 0 扱い
    moodLen: 0,
  };
}

export function sanitizePrimaryQuestion(
  q: PrimaryUnresolvedQuestion | null,
  brief: ConversationBrief,
  theme: ConversationTheme,
  avoidKey: string | null = null,
): {
  question: PrimaryUnresolvedQuestion | null;
  sanitized: boolean;
  reason:
    | "passthrough"
    | "broken_pick_rewritten"
    | "null_filled"
    | "still_null"
    | "loop_avoided";
} {
  // passthrough: 健全 & avoidKey に一致しない場合のみ通す
  if (q && !isBrokenPickQuestion(q)) {
    if (avoidKey && q.key === avoidKey) {
      // 直前と同じ key を健全でも投げ直すのを禁止 → 条件質問に差し替え
      const replacement = generateConditionQuestion(
        briefToContext(brief),
        theme,
        avoidKey,
      );
      return {
        question: replacement,
        sanitized: true,
        reason: replacement ? "broken_pick_rewritten" : "loop_avoided",
      };
    }
    return { question: q, sanitized: false, reason: "passthrough" };
  }
  const replacement = generateConditionQuestion(
    briefToContext(brief),
    theme,
    avoidKey,
  );
  if (q && isBrokenPickQuestion(q)) {
    return {
      question: replacement,
      sanitized: true,
      reason: replacement
        ? "broken_pick_rewritten"
        : avoidKey
          ? "loop_avoided"
          : "still_null",
    };
  }
  // q === null の場合
  return {
    question: replacement,
    sanitized: replacement !== null,
    reason: replacement
      ? "null_filled"
      : avoidKey
        ? "loop_avoided"
        : "still_null",
  };
}

/**
 * Legacy path (ConversationBrief を持たない generateProposal 経路) 用。
 * ConversationAnalysis から条件質問を 1 問生成する。
 * area/date/timeSlot のいずれも埋まっていなければ where を優先する。
 */
export function buildConditionQuestionFromAnalysis(
  analysis: ConversationAnalysis,
  theme: ConversationTheme,
  avoidKey: string | null = null,
): PrimaryUnresolvedQuestion | null {
  return generateConditionQuestion(analysisToContext(analysis), theme, avoidKey);
}
