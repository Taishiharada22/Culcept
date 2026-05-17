/**
 * CoAlter AOO Phase B B-5b — Visible Mirror Types (PII firewall + discriminated unions)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 / §6 / §10
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5 / §3
 *
 * 役割 (B-5b 段階):
 *   visible Mirror surface に出すまでの **データ構造のみ** を定義する型 file。
 *   logic は別 file (mirrorTextGenerator / postSpeakVerification / linguisticStopDetector
 *   / visibleMirrorEvaluator) に分離。
 *
 * 設計原則 (Phase B 北極星「黙る」と整合):
 *   - **State Mirror only**: B-5b canary 段階では Difference / Tempo / Fairness / Repair
 *     系の template を一切持たない (Phase C 以降)
 *   - **hedged hypothesis grammar**: 全 template が「〜のような気がしました」「〜という
 *     印象でした」等の hedged form を強制 (断定禁止、命令禁止、提案禁止、疑問禁止、共感演技禁止)
 *   - **enum-locked template id**: literal union 型で template id を固定、runtime に
 *     arbitrary text を生成する経路を構造的に塞ぐ
 *   - **PII firewall を型レベルで強制**: 本 file の input / output 型に raw text / user
 *     id / message id / pair id / session id field を**書けない**
 *   - **discriminated union**:
 *       - `VisibleMirrorEvalResult` は `kind: "absent" | "visible"` で narrowing
 *       - `MirrorVerificationResult` は `ok: true | false` で narrowing
 *       - `LinguisticStopDetectionResult` は `detected: true | false` で narrowing
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1〜B-5a zero diff (本 file は新規)
 *   - Question / Proposal / Suggestion 系の type 一切定義しない
 */

// =============================================================================
// (1) Template ID literal union (5 State Mirror templates only)
// =============================================================================

/**
 * State Mirror template id の literal union。
 *
 * 5 値、すべて State Mirror category (Difference / Tempo / Fairness / Repair は
 * Phase C 以降)。各 id は `mirrorTextTemplates.ts` の `MIRROR_TEXT_TEMPLATES` table と
 * 1:1 対応する。
 *
 * 命名規則: `state_mirror_<aspect>` (snake_case、aspect は観測の方向性)
 *
 * 値:
 *   - `state_mirror_pause`: 間が欲しそう (silence_budget low + uncertainty low)
 *   - `state_mirror_unsettled`: 揺れている (alignment negative + uncertainty mid)
 *   - `state_mirror_preverbal`: 言葉になっていない (alignment neutral + uncertainty mid)
 *   - `state_mirror_holding`: 抱えている (silence_budget mid + uncertainty mid)
 *   - `state_mirror_threshold`: 立ち止まっている (alignment neutral + silence_budget low)
 */
export type VisibleMirrorTemplateId =
  | "state_mirror_pause"
  | "state_mirror_unsettled"
  | "state_mirror_preverbal"
  | "state_mirror_holding"
  | "state_mirror_threshold";

/**
 * Template 1 件の immutable 構造。
 *
 * `mirrorTextTemplates.ts` で **const literal table** として export される。
 *
 * 各 field:
 *   - `id`: literal id (caller は enum 経由でのみ参照)
 *   - `text`: 日本語 hedged hypothesis form 文字列 (≤ 40 文字を design-time で保証、
 *     runtime は postSpeakVerification の length check で再確認)
 *   - `grammarTags`: 構造説明 (test 用、production logic で参照しない)
 */
export interface VisibleMirrorTemplate {
  readonly id: VisibleMirrorTemplateId;
  readonly text: string;
  readonly grammarTags: ReadonlyArray<
    "hedged" | "state_mirror" | "reflection_only" | "no_imperative" | "no_question"
  >;
}

// =============================================================================
// (2) Generator input / output (PII 受理なし)
// =============================================================================

/**
 * `mirrorTextGenerator` の入力 — engine decision の **enum / bucket / mode のみ**。
 *
 * **PII firewall**:
 *   - raw text / message id / user id / pair id / session id を**書けない** (型に存在しない)
 *   - 数値 input なし、すべて enum / literal
 *   - caller が誤って PII を渡しても TypeScript が compile error
 */
export interface MirrorTextGeneratorInput {
  readonly mode: "normal" | "daily" | "travel" | null;
  readonly alignmentBucket:
    | "unknown"
    | "strongly_negative"
    | "negative"
    | "neutral"
    | "positive"
    | "strongly_positive";
  readonly uncertaintyBucket:
    | "unknown"
    | "low_0_to_30"
    | "mid_30_to_70"
    | "high_70_to_100";
  readonly silenceBudgetBucket:
    | "unknown"
    | "low_0_to_30"
    | "mid_30_to_70"
    | "high_70_to_100";
}

/**
 * `mirrorTextGenerator` の出力 — template id + text、または null (not_applicable)。
 *
 * `null` を返す条件:
 *   - input から候補 template が決まらない (例: bucket すべて unknown)
 *   - travel mode (Phase B canary では travel で speak しない)
 */
export type MirrorTextGeneratorResult =
  | {
      readonly kind: "generated";
      readonly templateId: VisibleMirrorTemplateId;
      readonly text: string;
    }
  | {
      readonly kind: "not_applicable";
      readonly reason:
        | "travel_mode"
        | "alignment_unknown"
        | "uncertainty_unknown"
        | "silence_budget_unknown"
        | "no_matching_template";
    };

// =============================================================================
// (3) postSpeakVerification 型
// =============================================================================

/**
 * Verification fail の reason literal union。
 *
 * 7 値 (7-layer check と 1:1 mapping):
 *   - `pii_detected`: PII pattern (email / phone / URL / 数字 4 桁以上 / id-like) 検出
 *   - `imperative_grammar`: 命令形 (「しろ」「して」「べき」「なさい」「ましょう」)
 *   - `question_grammar`: 疑問形 (「?」「？」「ですか」「ますか」「でしょうか」)
 *   - `suggestion_grammar`: 提案形 (「みては」「みたら」「みよう」「するといい」)
 *   - `empathy_theater`: 共感演技 (「わかります」「気持ちわかる」「同じ」「私も」)
 *   - `text_too_long`: 60 文字超
 *   - `duplicate_in_session`: 同 templateId が session 内で既出
 */
export type MirrorVerificationFailReason =
  | "pii_detected"
  | "imperative_grammar"
  | "question_grammar"
  | "suggestion_grammar"
  | "empathy_theater"
  | "text_too_long"
  | "duplicate_in_session";

/**
 * `postSpeakVerification` の入力。
 *
 * **PII firewall**: text は受け取るが、検証目的のみ。caller (useMirrorEngine) は
 * generator が返した template text のみ渡す (raw user text は通さない構造)。
 */
export interface PostSpeakVerificationInput {
  readonly text: string;
  readonly templateId: VisibleMirrorTemplateId;
  readonly recentlyEmittedTemplateIds: ReadonlyArray<VisibleMirrorTemplateId>;
}

/**
 * `postSpeakVerification` の出力 (discriminated union)。
 *
 * narrowing:
 *   - `ok === true`: visible に出してよい
 *   - `ok === false`: reason field 必須、出してはいけない
 */
export type MirrorVerificationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: MirrorVerificationFailReason };

// =============================================================================
// (4) linguisticStopDetector 型
// =============================================================================

/**
 * 明示的言語停止コマンドの literal union。
 *
 * 3 値のみ。**sentiment / mood 推測なし**、明示的 substring match のみ:
 *   - `silence_request`: 「黙ってて」「黙って」「黙れ」
 *   - `not_needed_now`: 「今は不要」「今はいらない」(short forms は false positive 防止のため除外)
 *   - `explicit_suppression`: 「出さないで」「言わないで」「コメントしないで」
 */
export type LinguisticStopCommand =
  | "silence_request"
  | "not_needed_now"
  | "explicit_suppression";

/**
 * `linguisticStopDetector` の出力 (discriminated union)。
 *
 * narrowing:
 *   - `detected === true`: command 必須、sleepStore.setSleep(true) を呼ぶべき
 *   - `detected === false`: command field なし、何もしない
 *
 * **B-5b では本 detector の runtime 接続は行わない** (chat 経路で raw text を受ける
 * 安全な API がまだない、B-5c smoke で確立後 or 別 PR で接続)。
 */
export type LinguisticStopDetectionResult =
  | { readonly detected: true; readonly command: LinguisticStopCommand }
  | { readonly detected: false };

// =============================================================================
// (5) visibleMirrorEvaluator (orchestration) 型
// =============================================================================

/**
 * Visible mirror 評価の最終 state (discriminated union)。
 *
 * narrowing:
 *   - `kind === "absent"`: visible 出力なし、reason field で diagnostic 残せる
 *   - `kind === "visible"`: text / templateId 必須、UI に出す
 */
export type VisibleMirrorEvalResult =
  | {
      readonly kind: "absent";
      readonly reason:
        | "decision_stay_silent"
        | "sleep_on"
        | "visible_cap_reached"
        | "text_not_generated"
        | "verification_failed";
      readonly verificationFailReason?: MirrorVerificationFailReason;
    }
  | {
      readonly kind: "visible";
      readonly text: string;
      readonly templateId: VisibleMirrorTemplateId;
    };
