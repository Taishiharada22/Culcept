/**
 * CoAlter AOO Phase B — Mirror layer 型定義 (B-2)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164)
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165, merge `2c2be4de`)
 *
 * 役割 (B-2 段階):
 *   Mirror layer (`lib/coalter/mirror/*`) で共有する型定義のみ。
 *   pure / 副作用なし / runtime logic なし。
 *
 * 設計原則:
 *   - **既存 presence layer (`lib/coalter/presence/types.ts`) には touch しない**
 *     - Mirror layer は独自に `MirrorPresenceMode` を定義する
 *     - 値の集合は `lib/coalter/presence/types.ts` の `PresenceMode`
 *       (= `"normal" | "daily" | "travel"`、2026-05-17 時点) と一致させる
 *     - 構造的 drift が発生した場合は別 PR で adapter layer (B-2 後続 / B-3)
 *       で吸収する。本 PR では runtime 接続なし
 *   - **discriminated union による型レベル epistemic safety**:
 *     `MirrorModeContextResult` は `status` で discriminate するため、
 *     `mode` への access には事前に `status === "known"` の判定が必要となる。
 *     `canProceedToMirrorDecision` は型レベル invariant (known => true / unknown => false)。
 *   - **unknown は明示型 (PresenceMode に null や undefined を混ぜない)**:
 *     - 入力で undefined / null / 不明値 → 出力 status = "unknown"
 *     - Mirror Channel の Speak 判定は unknown 時に必ず fail-close
 *       (B-4 で実装、本 PR では canProceedToMirrorDecision: false を返すだけ)
 *
 * 不可侵境界 (B-0 §9 / Phase A 継承):
 *   - lib/coalter/presence/ 全 30+ files 不可侵 (本ファイルは presence type を import しない)
 *   - app/components/chat/ 17 files 不可侵
 *   - lib/coalter/observer/ (Phase A) 不可侵
 *   - components/coalter/mirror/* (B-1 成果物) 不可侵 (B-2 では UI 接続なし)
 */

/**
 * Mirror layer 内部で使う PresenceMode 相当の値型。
 *
 * **構造的に `lib/coalter/presence/types.ts` の `PresenceMode` と一致させる**:
 *   現行 (2026-05-17): `"normal" | "daily" | "travel"`
 *
 * presence layer 側の型変更が起きた場合は別 PR で adapter / migration を作る。
 * 本ファイルが presence type を直接 import すると、Mirror layer が presence layer に
 * runtime / type のいずれかで依存することになるため、意図的に独立定義としている。
 */
export type MirrorPresenceMode = "normal" | "daily" | "travel";

/**
 * `readMirrorModeContext` 入力の source 列挙。
 *
 * - `"presence_state"`: 既存 presence layer / observer 由来 (B-3 以降で runtime 接続予定)
 * - `"explicit_input"`: 明示的に上位 logic から渡されたモード (例: テスト / 将来の手動入力)
 * - `"missing"`: source が未指定 / 取得失敗
 *
 * 上記 3 値以外が入力された場合、reader は `"missing"` に正規化する (fail-closed)。
 */
export type MirrorModeContextSource = "presence_state" | "explicit_input" | "missing";

/**
 * `readMirrorModeContext` 入力。
 *
 * すべて optional (caller 都合で undefined もあり得る):
 *   - presenceMode: `MirrorPresenceMode | null | undefined`
 *   - source: `MirrorModeContextSource | undefined`
 *
 * **重要 (CEO 北極星)**: raw text / message id / user id / session id 等の
 * **PII を含む情報は受け取らない**。型レベルで限定し、内部実装でも
 * これらを参照する経路を持たない (pure function 制約)。
 */
export interface MirrorModeContextInput {
  readonly presenceMode?: MirrorPresenceMode | null;
  readonly source?: MirrorModeContextSource;
}

/**
 * `readMirrorModeContext` 出力 (discriminated union)。
 *
 * 型レベル invariant:
 *   - `status === "known"` ⇔ `mode !== null` ⇔ `canProceedToMirrorDecision === true`
 *   - `status === "unknown"` ⇔ `mode === null` ⇔ `canProceedToMirrorDecision === false`
 *
 * Consumer は `result.status` で discriminate してから `mode` にアクセスする。
 * `canProceedToMirrorDecision` は型レベル literal (true / false) なので、
 * TypeScript narrowing で誤読を構造的に防げる。
 */
export type MirrorModeContextResult =
  | {
      readonly status: "known";
      readonly mode: MirrorPresenceMode;
      readonly source: MirrorModeContextSource;
      readonly canProceedToMirrorDecision: true;
    }
  | {
      readonly status: "unknown";
      readonly mode: null;
      readonly source: MirrorModeContextSource;
      readonly canProceedToMirrorDecision: false;
    };

// =============================================================================
// B-3 (2026-05-17): Bucket types for `lib/coalter/mirror/buckets/*`
// =============================================================================
//
// 設計原則:
//   - **既存 Phase A observer (`lib/coalter/observer/relationshipStateTypes.ts`)
//     の `AlignmentBucket` / `UncertaintyBucket` / `SilenceBudgetBucket` /
//     `MatchedPatternCategory` と構造的に一致する**:
//     - Mirror 側は独立定義 (Phase A type を import しない)
//     - 値の集合は Phase A 側と一致 (driftが発生した場合は別 PR で adapter / migration)
//     - 例外: `MirrorPatternCategoryBucket` は Phase A の `"rupture_signal"` を
//       severity 別 (`"rupture_signal_high"` / `"rupture_signal_mild"`) に拡張する
//       (B-0 plan §9.3 設計に従う、Phase A 側 raw → Mirror 側 bucket の adapter は
//       将来 B-3+ で実装、現状は caller がすでに severity 既知の前提で入力)
//
//   - **discriminated union による型レベル epistemic safety** (B-2 と同じパターン):
//     `known` / `unknown` で discriminate、`canProceedToMirrorDecision` は literal
//     `true` / `false` で TypeScript narrowing が機能する
//
//   - **unknown は first-class**:
//     null / undefined / NaN / Infinity / 範囲外 / 不明 string すべて `"unknown"` bucket
//     に正規化、`canProceedToMirrorDecision: false` を返す (fail-closed)
//
//   - **PII を型レベルで受け取らない**:
//     入力は numeric / boolean / enum のみ。raw text / message id / user id / pair id /
//     session id は構造的に拒否

/**
 * alignment bucket — 関係性 alignment score (-1..+1) の 5 段階分類 + unknown。
 *
 * 値域: -1.0 (完全な不一致) → 0.0 (中立) → +1.0 (強い一致)
 * Phase A `lib/coalter/observer/relationshipStateTypes.ts` の `AlignmentBucket` と
 * 構造的に一致する (Mirror 側は独立定義)。
 */
export type MirrorAlignmentBucket =
  | "unknown"
  | "strongly_negative"
  | "negative"
  | "neutral"
  | "positive"
  | "strongly_positive";

/**
 * uncertainty bucket — 観測不確実性 (0..1) の 3 段階分類 + unknown。
 *
 * 値域: 0.0 (確信) → 1.0 (完全な不確実)
 * Phase A `lib/coalter/observer/relationshipStateTypes.ts` の `UncertaintyBucket` と
 * 構造的に一致する (Mirror 側は独立定義)。
 */
export type MirrorUncertaintyBucket =
  | "unknown"
  | "low_0_to_30"
  | "mid_30_to_70"
  | "high_70_to_100";

/**
 * silence budget bucket — 会話内発話量比率 (0..1) の 3 段階分類 + unknown。
 *
 * 値域: 0.0 (発話なし、余裕あり) → 1.0 (満杯)
 * Phase A `lib/coalter/observer/relationshipStateTypes.ts` の `SilenceBudgetBucket` と
 * 構造的に一致する (Mirror 側は独立定義)。
 */
export type MirrorSilenceBudgetBucket =
  | "unknown"
  | "low_0_to_30"
  | "mid_30_to_70"
  | "high_70_to_100";

/**
 * pattern category bucket — 観測 pattern の category 分類 + unknown。
 *
 * Phase A `lib/coalter/observer/signalRedaction.ts` の `MatchedPatternCategory`
 * (`"safety_concern" | "rupture_signal" | "unknown_category" | null`) を
 * Mirror 側で severity 拡張:
 *   - `"null_pattern"`: pattern なし (Phase A の `null` 相当)
 *   - `"safety_concern"`: 安全関心 (Phase B 発話禁止、B-0 §9.3)
 *   - `"rupture_signal_high"`: 高リスク rupture (STAY_SILENT、B-0 §9.3)
 *   - `"rupture_signal_mild"`: 軽微 rupture (Repair Mirror 候補、B-0 §9.3)
 *   - `"unknown_category"`: 不明 (Observe Gate fail)
 *
 * Phase A 側 raw `"rupture_signal"` → Mirror 側 severity 別の bridge adapter は
 * 別 PR で実装。本 bucket function は **caller が severity 既知の前提**で受け取る
 * (caller が severity を判定できない場合は safety-first で `"rupture_signal_high"`
 * を渡すべき)。
 */
export type MirrorPatternCategoryBucket =
  | "null_pattern"
  | "safety_concern"
  | "rupture_signal_high"
  | "rupture_signal_mild"
  | "unknown_category";

/**
 * alignment bucket reader の入力。
 *
 * - `alignmentSignal`: -1..+1 範囲の数値、null / undefined / NaN / Infinity / 範囲外 → unknown
 *
 * **PII 非受理**: raw text / message id / user id / pair id / session id を含まない。
 */
export interface AlignmentBucketInput {
  readonly alignmentSignal?: number | null;
}

/**
 * uncertainty bucket reader の入力。
 *
 * - `uncertainty`: 0..1 範囲の数値、null / undefined / NaN / Infinity / 範囲外 → unknown
 *
 * **PII 非受理**。
 */
export interface UncertaintyBucketInput {
  readonly uncertainty?: number | null;
}

/**
 * silence budget bucket reader の入力。
 *
 * - `silenceBudget`: 0..1 範囲の数値、null / undefined / NaN / Infinity / 範囲外 → unknown
 *
 * **PII 非受理**。
 */
export interface SilenceBudgetBucketInput {
  readonly silenceBudget?: number | null;
}

/**
 * pattern category bucket reader の入力。
 *
 * - `category`: 既知 enum / null (= null_pattern) / undefined / 不明 string → unknown_category
 *
 * **PII 非受理**。raw matched pattern string は受け取らない (caller が事前に bucketize 済)。
 */
export interface PatternCategoryBucketInput {
  readonly category?:
    | "null_pattern"
    | "safety_concern"
    | "rupture_signal_high"
    | "rupture_signal_mild"
    | "unknown_category"
    | null;
}

/**
 * alignment bucket reader の出力 (discriminated union)。
 *
 * 型レベル invariant:
 *   - `status === "known"` ⇔ `bucket !== "unknown"` ⇔ `raw !== null` ⇔ `canProceed === true`
 *   - `status === "unknown"` ⇔ `bucket === "unknown"` ⇔ `raw === null` ⇔ `canProceed === false`
 *
 * canProceed 設計: alignment はすべての known level で canProceed = true。
 * alignment 値そのものは Mirror 発話を gate しない (ERV 入力としてのみ使う、B-4)。
 */
export type AlignmentBucketResult =
  | {
      readonly status: "known";
      readonly bucket: Exclude<MirrorAlignmentBucket, "unknown">;
      readonly raw: number;
      readonly canProceedToMirrorDecision: true;
    }
  | {
      readonly status: "unknown";
      readonly bucket: "unknown";
      readonly raw: null;
      readonly canProceedToMirrorDecision: false;
    };

/**
 * uncertainty bucket reader の出力 (discriminated union)。
 *
 * canProceed 設計: B-0 §6.1 / §4.3 (Safe Gate):
 *   - `low_0_to_30` / `mid_30_to_70` → canProceed = true (Speak 判定へ進めてよい)
 *   - `high_70_to_100` → canProceed = false (高不確実性、Safe Gate fail)
 *   - `unknown` → canProceed = false (入力なし、fail-closed)
 *
 * 注: B-0 plan の `uncertainty > 0.4` 閾値とは異なる (Phase A の 30/70 区切りに合わせ、
 * B-4 ERV engine で `> 0.4` 閾値を別途適用する。本 bucket は categorical 分類のみ)。
 */
export type UncertaintyBucketResult =
  | {
      readonly status: "known";
      readonly bucket: "low_0_to_30" | "mid_30_to_70";
      readonly raw: number;
      readonly canProceedToMirrorDecision: true;
    }
  | {
      readonly status: "known";
      readonly bucket: "high_70_to_100";
      readonly raw: number;
      readonly canProceedToMirrorDecision: false;
    }
  | {
      readonly status: "unknown";
      readonly bucket: "unknown";
      readonly raw: null;
      readonly canProceedToMirrorDecision: false;
    };

/**
 * silence budget bucket reader の出力 (discriminated union)。
 *
 * canProceed 設計: B-0 §4.2 (Worth Gate):
 *   - `low_0_to_30` / `mid_30_to_70` → canProceed = true (発話余裕あり)
 *   - `high_70_to_100` → canProceed = false (既に十分発話している、Worth Gate fail)
 *   - `unknown` → canProceed = false (fail-closed)
 *
 * 注: B-0 plan の `silence_budget ≥ 0.7` 閾値と一致 (high_70_to_100 開始 = 0.7)。
 */
export type SilenceBudgetBucketResult =
  | {
      readonly status: "known";
      readonly bucket: "low_0_to_30" | "mid_30_to_70";
      readonly raw: number;
      readonly canProceedToMirrorDecision: true;
    }
  | {
      readonly status: "known";
      readonly bucket: "high_70_to_100";
      readonly raw: number;
      readonly canProceedToMirrorDecision: false;
    }
  | {
      readonly status: "unknown";
      readonly bucket: "unknown";
      readonly raw: null;
      readonly canProceedToMirrorDecision: false;
    };

/**
 * pattern category bucket reader の出力 (discriminated union)。
 *
 * canProceed 設計: B-0 §9.3:
 *   - `null_pattern` → canProceed = true (通常評価)
 *   - `rupture_signal_mild` → canProceed = true (Repair Mirror 候補、B-5 で
 *     §6.5 設計書の grammar 制約で出力)
 *   - `safety_concern` → canProceed = false (Phase B 全期間発話禁止)
 *   - `rupture_signal_high` → canProceed = false (STAY_SILENT)
 *   - `unknown_category` → canProceed = false (Observe Gate fail)
 *
 * 注: 本 bucket は raw numeric 入力を持たないため `raw` field なし。
 */
export type PatternCategoryBucketResult =
  | {
      readonly status: "known";
      readonly bucket: "null_pattern" | "rupture_signal_mild";
      readonly canProceedToMirrorDecision: true;
    }
  | {
      readonly status: "known";
      readonly bucket: "safety_concern" | "rupture_signal_high";
      readonly canProceedToMirrorDecision: false;
    }
  | {
      readonly status: "unknown";
      readonly bucket: "unknown_category";
      readonly canProceedToMirrorDecision: false;
    };

// =============================================================================
// B-4a (2026-05-17): Decision Engine 型基盤 (types only, no logic)
// =============================================================================
//
// 設計原則:
//   - **B-4a は型のみ**: ERV / Gate / Counterfactual / Engine の実装 logic は
//     B-4b〜B-4d で順次追加 (本 file は読み取り専用に維持される予定)
//   - **discriminated union による型レベル epistemic safety** (B-2 / B-3 と同じパターン):
//     `MirrorDecision` は `type` で discriminate / `GateResult` は `passed` で discriminate
//     / consumer は narrowing 必須
//   - **Default-STAY_SILENT を型で保証**: `MirrorDecision` の 1 variant は STAY_SILENT、
//     もう 1 variant が MIRROR_CANDIDATE。consumer が明示的に MIRROR_CANDIDATE を生成
//     しない限り STAY_SILENT (structural default)
//   - **PII firewall を型レベルで強制**: `MirrorDecisionInput` には B-2/B-3 結果 +
//     4 axes (novelty / phase / time / rupture / sleep) のみ。raw text / message id /
//     user id / pair id / session id を**書けない**
//   - **reason enum は `decisionConstants.ts` を source-of-truth**:
//     `MirrorStaySilentReason` 型は decisionConstants.ts の `(typeof MIRROR_STAY_SILENT_REASON)[keyof ...]`
//     由来 (typo 防止 + IDE autocomplete)

/**
 * 会話 phase の literal union。
 *
 * 値:
 *   - `"greeting"`: 会話冒頭 (Mirror 不可)
 *   - `"in_progress"`: 進行中 (Mirror 候補可)
 *   - `"closing"`: 会話末尾 (Mirror 不可)
 *   - `"emergent"`: 緊急性検出 (Mirror 不可)
 *   - `"unknown"`: 推定不能 (Mirror 不可、fail-closed)
 *
 * Phase B 初期 canary では `"in_progress"` のみ Worth Gate PASS する設計
 * (B-0 plan §4.2 / B-4 preflight §3)。`"unknown"` も明示 first-class value として
 * 持つ (B-2 modeContext / B-3 bucket の unknown 設計と一貫)。
 */
export type ConversationPhase =
  | "greeting"
  | "in_progress"
  | "closing"
  | "emergent"
  | "unknown";

/**
 * Mirror Channel が STAY_SILENT を返す理由の literal union 型。
 *
 * 値は `./decisionConstants.ts` の `MIRROR_STAY_SILENT_REASON` から自動生成。
 * 直接の文字列リテラル使用ではなく、必ず `MIRROR_STAY_SILENT_REASON.<KEY>` 経由で参照する
 * (magic string 禁止、typo 防止)。
 */
export type { MirrorStaySilentReason } from "./decisionConstants";

import type { MirrorStaySilentReason as _MirrorStaySilentReason } from "./decisionConstants";

/**
 * Decision Engine 入力統合型。
 *
 * 構成:
 *   - B-2 modeContext 結果
 *   - B-3 4 bucket 結果 (alignment / uncertainty / silenceBudget / patternCategory)
 *   - B-4 追加 4 axes (B-3 で bucket 化されていない、本 input で直接受け取り):
 *     - `observationNovelty`: 0..1 数値 (B-4b/c で inline validate)
 *     - `conversationPhase`: ConversationPhase enum
 *     - `timeSinceLastSpeakTurns`: 非負整数
 *     - `ruptureFlag`: boolean (precautionary、unknown は true 扱いせず Safe Gate fail)
 *     - `userOverrideSleep`: boolean (true で必ず Safe Gate fail)
 *
 * **PII firewall (型レベル)**:
 *   raw text / message id / user id / pair id / session id / email / phone / IP 等の
 *   PII field は**型に存在しない**。caller が `as unknown as MirrorDecisionInput` cast
 *   で injection しても、Decision Engine は宣言された 10 field しか参照しない。
 *
 * 全 field が `readonly` (immutability)、optional 4 axes は `undefined` 経路で
 * unknown 扱い (Gate fail)。
 */
export interface MirrorDecisionInput {
  readonly modeContext: MirrorModeContextResult;
  readonly alignment: AlignmentBucketResult;
  readonly uncertainty: UncertaintyBucketResult;
  readonly silenceBudget: SilenceBudgetBucketResult;
  readonly patternCategory: PatternCategoryBucketResult;
  readonly observationNovelty?: number | null;
  readonly conversationPhase?: ConversationPhase;
  readonly timeSinceLastSpeakTurns?: number | null;
  readonly ruptureFlag?: boolean | null;
  readonly userOverrideSleep?: boolean | null;
}

/**
 * Gate 関数 (B-4b で実装される checkObserveGate / checkWorthGate / checkSafeGate)
 * の共通 result 型 (discriminated union)。
 *
 * 型レベル invariant:
 *   - `passed === true`: reason field なし
 *   - `passed === false`: reason field 必須 (MirrorStaySilentReason)
 *
 * TypeScript narrowing:
 *   ```ts
 *   if (gate.passed) {
 *     // gate.reason に access 不可 (compile error)
 *   } else {
 *     const r: MirrorStaySilentReason = gate.reason;  // OK
 *   }
 *   ```
 */
export type GateResult =
  | { readonly passed: true }
  | { readonly passed: false; readonly reason: _MirrorStaySilentReason };

/**
 * Counterfactual Silence Test の 4 outcome (B-0 plan §10.2)。
 *
 * 値:
 *   - `"user_misses_small_observation"`: ERV bar 未達 → STAY_SILENT (許容)
 *   - `"user_misses_meaningful_insight"`: bar 通過 + 条件成立 → SPEAK 候補維持
 *   - `"user_takes_harmful_action"`: safety / rupture_high routing → STAY_SILENT
 *     (本来 Safe Gate で先に捕捉されるが、CST にも redundant check 残す)
 *   - `"no_difference"`: 中立 (travel mode 等) → STAY_SILENT
 *
 * **defense-in-depth**: COUNTERFACTUAL_ERV_BAR (0.85) は SPEAK_THRESHOLD_BASE (0.75)
 * よりも高く設定。ERV ≥ 0.75 で SPEAK 候補となった案件のうち、ERV ≥ 0.85 のみが
 * Counterfactual を通過。Mirror 発話を更に絞る (CEO 北極星「黙る・誤読を避ける」)。
 */
export type CounterfactualOutcome =
  | "user_misses_small_observation"
  | "user_misses_meaningful_insight"
  | "user_takes_harmful_action"
  | "no_difference";

/**
 * Mirror Channel の Decision Engine 出力 (discriminated union)。
 *
 * 型レベル invariant:
 *   - `type === "STAY_SILENT"`: reason field 必須 (MirrorStaySilentReason) / ervScore なし
 *   - `type === "MIRROR_CANDIDATE"`: ervScore field 必須 (number) / reason は固定値 "speak_passed"
 *
 * **Default-STAY_SILENT 構造保証**:
 *   - 2 variant のみ。caller / engine は明示的に MIRROR_CANDIDATE を生成しない限り
 *     STAY_SILENT を返すしかない
 *   - 関数末尾の fallback も型上 STAY_SILENT を選ぶしかない (MIRROR_CANDIDATE 生成には
 *     ervScore: number が必須、未計算では生成不可)
 *
 * TypeScript narrowing:
 *   ```ts
 *   if (decision.type === "MIRROR_CANDIDATE") {
 *     const score: number = decision.ervScore;
 *     // decision.reason は "speak_passed" literal
 *   } else {
 *     const r: MirrorStaySilentReason = decision.reason;
 *     // decision.ervScore access 不可 (compile error)
 *   }
 *   ```
 */
export type MirrorDecision =
  | {
      readonly type: "STAY_SILENT";
      readonly reason: _MirrorStaySilentReason;
    }
  | {
      readonly type: "MIRROR_CANDIDATE";
      readonly ervScore: number;
      readonly reason: "speak_passed";
    };
