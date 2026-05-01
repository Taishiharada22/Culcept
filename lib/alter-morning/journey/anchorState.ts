/**
 * JourneyAnchorState — origin / end anchor の state contract (PR B-1)
 *
 * CEO/GPT 2026-05-02 規律:
 *   既存の resolveHomeAnchor / resolveJourneyEndAnchor は変更しない。
 *   converter で MorningPlan.journeyOrigin / journeyEnd を 3 kind discriminated union
 *   に変換し、unknown を構造的に表現する。
 *
 * 設計判断 (CEO/GPT 2026-05-02):
 *   - kind 3 値 + source 識別 (案 A 採用):
 *     known_exact + source="default_round_trip" は assumed end として
 *     `isAssumedAnchor()` で識別。kind を増やさず guard 数を増やさない。
 *   - converter 方式: 既存 resolver の戻り値型 (HomeAnchor | null /
 *     JourneyEndAnchor | null) は壊さず、本 module で新型に変換。
 *
 * 不変条件 (PR B-1):
 *   1. coords が無い anchor では travel item 生成しない (捏造禁止)
 *   2. events.length > 0 の plan では journeyOrigin / journeyEnd が必ず設定される
 *      (silent fail 排除、Commit 5 invariant test で固定)
 *   3. source === "default_round_trip" は assumed end として識別される
 *      (UI / debug / 将来の plan_presented 条件で confirmed と混同しないこと)
 *   4. 既存 resolver の戻り値型は変えない (converter 経由)
 *   5. 既存正常 path (= source != default_round_trip + coords あり) は byte-diff zero
 *
 * scope (PR B-1 限定):
 *   - 型定義 + converter のみ
 *   - resolver 自体の優先順位変更は PR B-4 (current_location time-aware redesign)
 *   - DB persistence は PR B-5
 *   - clarify / answerBinder / DialogState 拡張は PR B-2
 *   - extractStartPointAnchor / extractExplicitEndpoint は PR B-3
 */

import type { HomeAnchor, JourneyEndAnchor } from "../planning/transportContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AnchorUnknownReason — unknown 状態の細分類 (GPT 規律: state は細かく)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * unknown 状態の理由分類。UI は薄い 1 行 (「起点未確定」 等) で良いが、
 * debug / 将来の clarify 起動 (PR B-2) で reason を見るために細かく持つ。
 */
export type AnchorUnknownReason =
  /** browser geolocation が denied で currentLat/Lng が無く baseline_home も無い */
  | "denied"
  /**
   * resolver が呼ばれたが入力情報なし (default-skipped)。
   * 例: events.length === 0 で resolver を skip した turn (互換性 path)
   */
  | "unrequested"
  /** baseline_home 未登録 + currentLat/Lng なし → origin 不明 */
  | "no_baseline"
  /** (end 専用) 発話に終点情報なし + origin も無いため round-trip default が引けない */
  | "no_endpoint_signal";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AnchorSource — known anchor の出所
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * anchor の出所。origin / end で意味が異なるが、union として束ねる。
 * 「assumed (推定) か confirmed (確定) か」 は kind ではなく source で識別する
 * (CEO/GPT 2026-05-02 案 A: kind を増やすより source 識別が型シンプル)。
 */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AnchorSource source 意味論固定 (CEO/GPT 2026-05-02 PR B-2b 規律)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 各 source の信頼度と USER_EXPLICIT_SOURCES (= prior 上書き強権) 適格性:
//
//   user_declared:
//     deterministic origin detector 由来 (extractStartPointAnchor)。
//     例: 「自宅から」「ホテルから」「会社を出る」
//     強権: ✅ USER_EXPLICIT_SOURCES に含まれる (prior known_exact を上書き可)
//
//   user_explicit_endpoint:
//     deterministic endpoint detector 由来 (extractEndpointAnchor)。
//     例: 「自宅に帰る」「ホテルに泊まる」「会社に向かう」
//     強権: ✅ USER_EXPLICIT_SOURCES に含まれる
//     注意: user_declared は origin 専用、user_explicit_endpoint は end 専用。
//     対称構造で意味論を区別する (GPT 2026-05-02 規律)。
//
//   comprehension_explicit:
//     LLM / comprehension 経由の explicit extraction。
//     例: LLM が「ホテルに泊まる」 を解釈して endpoint として抽出した場合等。
//     強権: ❌ USER_EXPLICIT_SOURCES に **含めない** (PR B-2b 規律)。
//     理由: LLM 誤抽出リスクが残るため、prior known_exact を上書きする強権を
//     持たせるのは時期尚早。PR B-2b 後の LLM 信頼性 audit で再評価。
//
//   current:
//     browser geolocation 由来 (時刻依存)。
//     STALE_SOURCES_ON_DATE_MISMATCH に含まれる (samePlanDate=false で抑制)。
//
//   registered_home:
//     profiles.baseline_home_lat/lng 由来 (時刻非依存)。
//
//   default_round_trip:
//     homeAnchor からの round-trip default 派生 (assumed end)。
//     isAssumedAnchor() で識別、UI で「(推定)」 表示。
//     STALE_SOURCES_ON_DATE_MISMATCH に含まれる (homeAnchor が current 由来の
//     場合 stale current 由来 round-trip となるため安全側で抑制)。
//
//   user_override:
//     endpoint clarify (PR B-2e) の user 回答で確定した終点。
//     強権: 直接強権なし (応答時に PendingClarify 経由で上書きされるため)。
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AnchorSource =
  // ── origin sources (deterministic detector 由来) ──
  /** browser geolocation 由来の現在地座標 */
  | "current"
  /** profiles.baseline_home_lat/lng 由来の登録自宅座標 */
  | "registered_home"
  /** PR B-2b: deterministic origin detector 由来。例: 「自宅から」「ホテルから」 */
  | "user_declared"
  // ── end sources ──
  /**
   * home anchor からの round-trip default 派生 (assumed end)。
   * confirmed end ではなく仮の終点。`isAssumedAnchor()` で識別され、
   * UI/debug は「(推定)」 として描画する。plan_presented の完全確定条件では
   * confirmed end として扱わない (将来 PR C scope)。
   */
  | "default_round_trip"
  /**
   * LLM / comprehension 経由の explicit endpoint 抽出。
   * PR B-2b 規律: USER_EXPLICIT_SOURCES に **含めない** (LLM 誤抽出リスク)。
   * 強権 (prior 上書き) を持たせるのは PR B-2b 後の LLM 信頼性 audit 後。
   */
  | "comprehension_explicit"
  /**
   * PR B-2b: deterministic endpoint detector 由来。例: 「自宅に帰る」「ホテルに泊まる」
   * USER_EXPLICIT_SOURCES に含まれ、prior known_exact を上書き可。
   * user_declared (origin 専用) と対称な end 専用 source。
   */
  | "user_explicit_endpoint"
  /** (将来 PR B-2e) endpoint clarify の user 回答で確定した終点 */
  | "user_override";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JourneyAnchorState — discriminated union (kind 3 値)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * MorningPlan.journeyOrigin / journeyEnd の構造的表現。
 *
 * kind 3 値:
 *   - known_exact: label + lat + lng + source。travel item 生成可能。
 *   - known_label_only: label + source のみ (coords 解決失敗)。travel 不生成。
 *   - unknown: reason のみ。travel 不生成 + UI で「未確定」 表示。
 *
 * GPT 規律: source === "default_round_trip" は known_exact でも assumed end として
 * `isAssumedAnchor()` で識別すること。
 */
export type JourneyAnchorState =
  | {
      kind: "known_exact";
      label: string;
      lat: number;
      lng: number;
      source: AnchorSource;
    }
  | {
      kind: "known_label_only";
      /**
       * 将来 PR B-3 で grounder が coords 解決を試みる起点。PR B-1 段階では
       * 入る経路がほぼ無い (resolver は coords 必須の HomeAnchor を返すため)。
       * 型定義のみ。
       */
      label: string;
      source: AnchorSource;
    }
  | {
      kind: "unknown";
      reason: AnchorUnknownReason;
    };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `source === "default_round_trip"` を識別するヘルパー (CEO/GPT 規律)。
 *
 * 用途:
 *   - UI: 「(推定)」 ラベル付き描画
 *   - debug: assumed vs confirmed の区別
 *   - 将来 plan_presented 条件 (PR C): confirmed end として扱わない
 *
 * 注意: kind === "known_exact" でも source === "default_round_trip" のときは
 * **confirmed ではなく assumed**。この区別を曖昧にすると「終点を勝手に決めた」
 * UX に見える。
 */
export function isAssumedAnchor(state: JourneyAnchorState): boolean {
  return state.kind === "known_exact" && state.source === "default_round_trip";
}

/**
 * `kind === "known_exact"` の guard。travel segment 生成可否の判定に使う。
 *
 * `kind === "known_label_only"` (coords なし) や `kind === "unknown"` は
 * travel 不生成 (= 捏造禁止)。
 */
export function hasResolvedCoordinates(
  state: JourneyAnchorState | undefined,
): state is JourneyAnchorState & { kind: "known_exact" } {
  return state !== undefined && state.kind === "known_exact";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// describeAnchorBlock — UI 描画判断の純粋関数 (PR B-1 Commit 4 補強)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO/GPT 2026-05-02 PR B-1 規律補強:
//   MorningPlanCard の JourneyAnchorBlock JSX が 3 kind × source 識別で 4 分岐
//   する。JSX で直接分岐すると test しにくいため、決定ロジックを純粋関数として
//   抽出し、UI test (RTL) を導入せず Vitest で検証可能にする。
//
// 戻り値の variant 4 種:
//   - "exact_confirmed":  known_exact + 通常 source (label のみ表示)
//   - "exact_assumed":    known_exact + source="default_round_trip" (label + 「(推定)」)
//   - "label_only":       known_label_only (label + 「(場所未確定)」)
//   - "unknown":          unknown (unknownLabel のみ表示)
//
// JSX 側はこの variant でシンプルに分岐するだけ。decision logic は本関数で固定。

export type AnchorBlockVariant =
  | "exact_confirmed"
  | "exact_assumed"
  | "label_only"
  | "unknown";

export interface AnchorBlockDescription {
  variant: AnchorBlockVariant;
  /** 主表示テキスト (label or unknownLabel) */
  primaryText: string;
  /** 副表示テキスト (「(推定)」 / 「(場所未確定)」 / undefined) */
  secondaryText?: string;
  /** 役割ラベル (「起点」 / 「終点」、JSX 側で受け取った roleLabel をそのまま透過) */
  roleLabel: string;
}

export function describeAnchorBlock(
  anchor: JourneyAnchorState,
  opts: { roleLabel: string; unknownLabel: string },
): AnchorBlockDescription {
  if (anchor.kind === "unknown") {
    return {
      variant: "unknown",
      primaryText: opts.unknownLabel,
      roleLabel: opts.roleLabel,
    };
  }
  if (anchor.kind === "known_label_only") {
    return {
      variant: "label_only",
      primaryText: anchor.label,
      secondaryText: "(場所未確定)",
      roleLabel: opts.roleLabel,
    };
  }
  // known_exact
  if (isAssumedAnchor(anchor)) {
    return {
      variant: "exact_assumed",
      primaryText: anchor.label,
      secondaryText: "(推定)",
      roleLabel: opts.roleLabel,
    };
  }
  return {
    variant: "exact_confirmed",
    primaryText: anchor.label,
    roleLabel: opts.roleLabel,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Converters — 既存 HomeAnchor / JourneyEndAnchor を JourneyAnchorState に変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * `resolveHomeAnchor` の戻り値 (HomeAnchor | null) を `JourneyAnchorState` に変換。
 *
 * - HomeAnchor 存在 → kind="known_exact" + source は HomeAnchor.source 由来
 * - null → kind="unknown" + reason (caller 指定)
 *
 * @param anchor resolveHomeAnchor の戻り値
 * @param fallbackReason anchor が null のときの reason
 *   (caller 側で「なぜ null になったか」 を知っているはずなので明示的に渡す)
 */
export function toOriginState(
  anchor: HomeAnchor | null,
  fallbackReason: AnchorUnknownReason,
): JourneyAnchorState {
  if (anchor === null) {
    return { kind: "unknown", reason: fallbackReason };
  }
  return {
    kind: "known_exact",
    label: anchor.label,
    lat: anchor.lat,
    lng: anchor.lng,
    source: anchor.source,
  };
}

/**
 * `resolveJourneyEndAnchor` の戻り値 (JourneyEndAnchor | null) を
 * `JourneyAnchorState` に変換。
 *
 * 注意 (CEO/GPT 規律):
 *   JourneyEndAnchor.source は通常 "default_round_trip" (homeAnchor 由来の
 *   round-trip default)。この場合 kind="known_exact" + source="default_round_trip"
 *   となり、`isAssumedAnchor()` で assumed end として識別される。
 *   将来 PR B-3 で comprehension_explicit / PR B-2 で user_override が入る。
 */
export function toEndState(
  anchor: JourneyEndAnchor | null,
  fallbackReason: AnchorUnknownReason,
): JourneyAnchorState {
  if (anchor === null) {
    return { kind: "unknown", reason: fallbackReason };
  }
  return {
    kind: "known_exact",
    label: anchor.label,
    lat: anchor.lat,
    lng: anchor.lng,
    source: anchor.source,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyAnchorFallback — chat route turn 跨ぎ continuity (PR B-2a)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO/GPT 2026-05-02 PR B-2a 規律:
//   chat route の events>0 path で fresh resolve が unknown の場合、priorPlan の
//   anchor を fallback として継承する。turn 跨ぎでの anchor 不安定 (PR B-1 audit
//   で identify した gap) を塞ぐ。
//
// 不変条件 (10 ケース決定表):
//   1. fresh.kind === "known_exact" → 常に fresh (新情報優先)
//   2. fresh.kind === "known_label_only" + prior.kind === "known_exact" → prior
//      (coords 落とさない、GPT 規律 - label_only で coords 付き anchor を上書きしない)
//   3. fresh.kind === "known_label_only" + prior unknown/undefined → fresh (label_only)
//   4. fresh.kind === "unknown" + prior.kind === "known_exact" + STALE source +
//      !samePlanDate → fresh (= unknown) [stale current/default_round_trip 拒否]
//   5. fresh unknown + prior known_exact + STALE source + samePlanDate → prior (同日内)
//   6. fresh unknown + prior known_exact + 非 STALE source → prior (時刻非依存)
//   7. fresh unknown + prior known_label_only → prior (label 維持、travel 不生成)
//   8. fresh unknown + prior unknown/undefined → fresh (= unknown、再 resolve 機会維持)
//
// STALE_SOURCES (samePlanDate=false で fallback 抑制):
//   - "current": browser geolocation = 時刻依存 (今日の位置情報を明日の起点にしない)
//   - "default_round_trip": homeAnchor 由来の round-trip default。homeAnchor の
//     source が "current" だった場合、stale current 由来の終点になる。derivedFrom
//     を持てば厳密区別可能 (PR B-3 検討) だが、本 PR では安全側で全 default_round_trip
//     を STALE 扱い。
//
// 非 STALE_SOURCES (samePlanDate に関わらず継承可):
//   - "registered_home": 登録自宅 = 時刻非依存
//   - "user_declared": 発話で起点を指定 (PR B-3 で実装)
//   - "comprehension_explicit": 発話で終点を指定 (PR B-3 で実装)
//   - "user_override": clarify 経路の user 回答 (PR B-2e で実装)
//
// 引数 samePlanDate:
//   caller (legacyAdapter) で priorPlan?.date === currentPlanDate を計算。
//   GPT 規律 (a): today 比較ではなく、同じ plan 日付の継続かどうか。
//   明日プラン継続編集で stale 判定にならないように。

const STALE_SOURCES_ON_DATE_MISMATCH = new Set<AnchorSource>([
  "current",
  "default_round_trip",
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USER_EXPLICIT_SOURCES (CEO/GPT 2026-05-02 PR B-2b 規律)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// deterministic detector 由来の user 明示発話は prior known_exact を上書き可。
// = 決定表 #2-bis: fresh.kind="known_label_only" + fresh.source ∈ USER_EXPLICIT
//   → prior 不問で fresh (label_only) を採用。
//
// 含まれる source:
//   - "user_declared": deterministic origin detector (extractStartPointAnchor)
//   - "user_explicit_endpoint": deterministic endpoint detector (extractEndpointAnchor)
//
// 含まれない source (重要、GPT 規律):
//   - "comprehension_explicit": LLM 経由 = 誤抽出リスク残るため強権なし。
//     PR B-2b 後の LLM 信頼性 audit 後に追加検討。
//
// 強権の意味:
//   通常規則 (決定表 #2): fresh known_label_only + prior known_exact → prior 維持
//   (= coords 落とさない、PR B-2a 不変条件)
//   USER_EXPLICIT 例外 (#2-bis): user 明示発話なので prior coords を捨てて fresh 採用
//   (= ユーザー文言尊重、CEO 思想)
//
// 副作用 (重要):
//   USER_EXPLICIT で上書きされた journeyOrigin/End は kind="known_label_only" のため
//   coords なし → travel item 不生成 (hasResolvedCoordinates=false で skip)。
//   これは「明示発話を尊重するが、移動を捏造しない」 という規律 (PR B-1 と整合)。
const USER_EXPLICIT_SOURCES = new Set<AnchorSource>([
  "user_declared",
  "user_explicit_endpoint",
]);

export function applyAnchorFallback(
  fresh: JourneyAnchorState,
  prior: JourneyAnchorState | undefined,
  opts: { samePlanDate: boolean },
): JourneyAnchorState {
  // ケース 1: fresh known_exact は常に新情報優先
  if (fresh.kind === "known_exact") {
    return fresh;
  }

  // ケース 2-3: fresh known_label_only
  if (fresh.kind === "known_label_only") {
    // ケース 2-bis [GPT/CEO 2026-05-02 PR B-2b]: USER_EXPLICIT は強権 prior 上書き可
    //   user 明示発話 (deterministic detector 由来) は coords がなくても prior を上書き。
    //   travel は生成されない (hasResolvedCoordinates=false で skip)。
    //   comprehension_explicit (LLM 由来) は USER_EXPLICIT に含まれないため、
    //   この exception は通らず、通常規則 (#2) に落ちる。
    if (USER_EXPLICIT_SOURCES.has(fresh.source)) {
      return fresh;
    }
    // ケース 2: prior に coords あり (known_exact) なら prior 維持 (coords 落とさない)
    if (prior?.kind === "known_exact") {
      return prior;
    }
    // ケース 3: prior unknown/undefined/known_label_only なら fresh
    return fresh;
  }

  // ケース 4-8: fresh unknown
  // priorPlan inheritance のロジック。GPT 規律 (3): unknown を unknown のままにせず、
  // priorPlan に known anchor があれば継承する (turn 跨ぎ continuity の本体)。
  if (prior === undefined || prior.kind === "unknown") {
    // ケース 8: prior も unknown / undefined → fresh のまま (再 resolve 機会維持)
    return fresh;
  }

  if (prior.kind === "known_label_only") {
    // ケース 7: label 維持 (coords なしなので travel 不生成、PR B-1 不変条件と整合)
    return prior;
  }

  // prior.kind === "known_exact"
  // ケース 4-6: STALE source 判定 + samePlanDate 判定
  if (
    !opts.samePlanDate &&
    STALE_SOURCES_ON_DATE_MISMATCH.has(prior.source)
  ) {
    // ケース 4: stale current/default_round_trip を引き継がない
    return fresh;
  }
  // ケース 5: STALE source + samePlanDate=true → prior (同日内 OK)
  // ケース 6: 非 STALE source → prior (時刻非依存、registered_home 等)
  return prior;
}
