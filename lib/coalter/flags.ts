/**
 * CoAlter runtime flags — kill switch集約
 *
 * Phase A (2026-04-18): `bookingHandoffEnabled`
 *   - false のとき narrationTemplate の `buildCandidateDetail` 呼び出しをスキップし、
 *     候補カードに `detail` を載せない。UI 側は `current.detail` が無ければ
 *     bottom sheet 起動ボタンを出さないため、旧体験に戻る。
 *   - 本番で違和感が出たときに「全体を止める」のではなく
 *     「detail sheet だけ止める」粒度で切り戻せるようにするための弁。
 *
 * [CEO lock 2026-04-20 M1 1a] `stage1LiveEnabled`
 *   - /api/coalter/invoke で Stage 1 Understand を呼ぶかを決める弁。
 *   - 既定 OFF。invoke の response shape は flag OFF で現行と完全一致。
 *   - ON 時のみ collector + `runUnderstanding()` が走り、response.data に
 *     optional `stage1: Stage1Snapshot` が付与される。
 *   - Stage 1 側の例外は invoke route で握り潰し、`stage1` 欠落で返す（fail-open）。
 *   - env から外せば即座に 1a 前状態へ戻る。
 *
 * 既定値は flag ごとに異なる。bookingHandoffEnabled は ON、stage1LiveEnabled は OFF。
 */

/**
 * 値ベースの bool 正規化。
 *
 * **重要 (2026-04-29 修正)**: webpack の DefinePlugin は `process.env.X` (member
 * access) のみ build 時に値で置換する。`process.env[name]` (computed access) は
 * 置換されないため、client side では browser polyfill (process.env={}) に
 * 落ちて常に undefined を返す。したがって NEXT_PUBLIC_ flag を client で
 * 読むには、各 getter で `process.env.NEXT_PUBLIC_X` を**直接記述**する必要が
 * ある。本 helper は読み取り済みの raw value を受け取るだけの pure function。
 */
function normalizeBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "1" || v === "true" || v === "on" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return fallback;
}

/**
 * 動的 env name を取って bool を返す helper。
 *
 * **server-only context でしか使わないこと**。client で呼ぶと browser polyfill
 * の空 env により常に fallback を返す。現状の唯一の caller は
 * `isU3AbolitionActive` (theme→env name の動的 lookup が必要)。
 */
function envBool(name: string, fallback: boolean): boolean {
  return normalizeBool(process.env[name], fallback);
}

export const COALTER_FLAGS = {
  /** Phase A: bottom sheet 用 detail を candidate に付与するか */
  get bookingHandoffEnabled(): boolean {
    return normalizeBool(process.env.COALTER_BOOKING_HANDOFF_ENABLED, true);
  },
  /** M1 1a: /api/coalter/invoke で Stage 1 Understand を呼んで response に乗せるか */
  get stage1LiveEnabled(): boolean {
    return normalizeBool(process.env.COALTER_STAGE1_LIVE, false);
  },
  /**
   * [CEO lock 2026-04-20 M1 Candidate 2] `stage1NarrationEnabled`
   *   - Stage 1 の todayReading を proposalCard.summary / card.summary に
   *     1 行だけ反映する弁。既定 OFF。
   *   - stage1LiveEnabled と独立。narration 層だけ切り戻したい場面がある。
   *   - outcome が failed の場合は flag に関係なく narration を付けない
   *     (CEO lock: failed を意味あるコピーに見せない)。
   *   - 依存: stage1LiveEnabled = true。snapshot が無い場合は no-op。
   */
  get stage1NarrationEnabled(): boolean {
    return normalizeBool(process.env.COALTER_STAGE1_NARRATION, false);
  },
  /**
   * [CEO lock 2026-04-20 M1 Candidate 3] `pairOnboardingEnabled`
   *   - ペア activate 時に `coalter_pair_states.onboarded_at` をセットし、
   *     `coalter_fairness_ledger` に bias_score=0 の seed row を 1 件入れる。
   *   - invoke の Stage 1 は「onboarded_at is null かつ talk_messages 0」の
   *     cold-start ペアに対しては snapshot を返さない（outcome="failed" を
   *     見せないための保護）。
   *   - 既定 OFF。activate/invoke のどちらも flag OFF で従来挙動と完全一致。
   *   - stage1LiveEnabled / stage1NarrationEnabled と独立。onboarding 層
   *     だけ切り戻したい場面に対応する 3 つ目の弁。
   */
  get pairOnboardingEnabled(): boolean {
    return normalizeBool(process.env.COALTER_PAIR_ONBOARDING, false);
  },
  /**
   * [CEO lock 2026-04-20 F-5] `foodLensWired`
   *   - engine.ts の food branch で Stage 1 Understand を走らせ、その結果
   *     (TwoPersonLensToday / FoodLensToday / FoodQueryBuilderInput) を
   *     foodOrchestrator に渡すかを決める kill switch。
   *   - 既定 OFF。false 時は従来経路（options.foodLens を外部から渡された
   *     場合のみ orchestrator に流す、それ以外は lens 無し）を機械的に維持する。
   *   - Stage 1 側の例外は engine 内で fail-open（catch して lens なしで
   *     従来経路に fall through）。env から外せば即座に pre-F-5 状態へ戻る。
   *   - 時間の優先順位: brief > exact time > lens 補完。lens は brief の
   *     欠損を埋めるだけで上書きはしない（F-5 wiring test d 参照）。
   *   - F-5 scope: output 復活まで。foodTierExpander の消費は F-6 以降。
   */
  get foodLensWired(): boolean {
    return normalizeBool(process.env.COALTER_FOOD_LENS_WIRED, false);
  },
  /**
   * [CEO lock 2026-04-24 B-5] `understandingShadowMovie`
   *   - engine.ts の movie branch で Stage 1 Understand を **shadow 並走** するか
   *     決める kill switch。Step B の β 範囲（CEO 承認 2026-04-24）。
   *   - 既定 OFF。**flag OFF 時は movie V2 経路の call flow が 1 bit も変化しない**。
   *     import は残るが実行されない（dead import）。
   *   - ON 時: `runMovieShadowUnderstanding` を `generateMovieProposalV2` 起動と
   *     並列に **fire-and-forget** で起動する。shadow 結果は本流の
   *     card / ranked / telemetry / diagnostics に **1 bit も反映しない**。
   *     差分は `emitUnderstandingDiagnostics`（別 flag `COALTER_UNDERSTANDING_DIAGNOSTICS`）
   *     からのみ出す。
   *   - shadow 失敗は runMovieShadowUnderstanding 内 try/catch で握り潰し、
   *     呼び出し側でも `.catch(() => {})` で二重防御（fail-open）。
   *   - §11.A の behavior invariant (既存 movie retrieval の挙動を 1 bit も
   *     変えない) を守るため、flag OFF が既定。preview で shadow 並走して
   *     B-6 の U1-U5 現実分布を取るときのみ env で ON にする。
   *   - env から外せば即座に pre-B-5 状態へ戻る。
   */
  get understandingShadowMovie(): boolean {
    return normalizeBool(process.env.COALTER_UNDERSTANDING_SHADOW_MOVIE, false);
  },
  /**
   * [CEO lock 2026-04-20 F-6] `foodTierLoop`
   *   - foodOrchestrator で `runTieredRanking`（T0→T1a→T1b→T2 順次）を
   *     走らせるかの kill switch。F-5 (`foodLensWired`) と独立。
   *   - 既定 OFF。false 時は従来どおり `rankFood` 単発（= Tier 0 相当）のみ。
   *   - true + effective FoodQuery 不在（lens 欠損 or area 欠落）→ tier loop skip、
   *     従来動作に fall through（fail-open）。
   *   - 契約（CEO 2026-04-20 F-6）:
   *     1. Tier 入力は **query 主体 + brief fallback**
   *        (area: query.area → brief.area / time: query.requestedTimeSlots → brief.approximateTime)
   *     2. 成功閾値は `ranked.length >= 1`（"豊富" 閾値 3 は diagnostics/narration 用のみ）
   *     3. Tier 結果は**混ぜない**。最初に success した Tier の ranked をそのまま採用。
   *   - F-6 scope: re-search しない、booking API・daily/travel には入らない、
   *     density/lighting ranker 負債は触らない。
   */
  get foodTierLoop(): boolean {
    return normalizeBool(process.env.COALTER_FOOD_TIER_LOOP, false);
  },
  /**
   * [Stage 4 L4-i 2026-04-28] `presenceSpeechLLMEnabled`
   *   - speechBuilder の LLM 合成経路を有効化する kill switch (Stage 4 L4-i)。
   *   - **既定 OFF**。Stage 4 L4-l flip まで OFF 固定 (CEO 別審議)。
   *   - flag OFF: speechBuilder は static mock 文面を返す (Stage 1 挙動維持)
   *   - flag ON: speechPromptBuilder + LLM 合成 + speechPostValidator 経路
   *   - env: `COALTER_PRESENCE_SPEECH_LLM`。env から外せば既定 OFF へ戻る。
   *   - 不可侵: flag OFF で speech template §3-§9 prompt 経路に入らない
   *     (LLM 課金経路が production behavior 不変原則を侵さない)。
   */
  get presenceSpeechLLMEnabled(): boolean {
    return normalizeBool(process.env.COALTER_PRESENCE_SPEECH_LLM, false);
  },
  /**
   * [Stage 4 L4-c 2026-04-28] `legacyCardAutoInsertEnabled`
   *   - 旧 CoAlterCard 自動挿入経路 (ChatClient.tsx :1741-1759、退役計画 doc §1.1) を
   *     enable するかの kill switch。
   *   - **既定 ON** (移行期、既存挙動維持)。Stage 4 L4-l flip で OFF に切替予定 (CEO 別審議)。
   *   - flag ON: 既存 CoAlterCard 自動挿入が走る (移行期挙動)。
   *   - flag OFF: 自動挿入スキップ。S7 提案は明示 handoff (HandoffButton) tap 経由のみ
   *     メインチャットに送信 (UI spec §2.7 / §4.3.8 / 統合契約 §1.6-3)。
   *   - **Phase 6.C+ Dispatcher 経路 (line 1721-1740) は flag 無関係に常時動作** (退役計画 doc §1.2 / plan v0.3 §3.3)。
   *   - env: `NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT`。env から外せば既定 ON 状態へ即座に戻る。
   *   - **NEXT_PUBLIC_ prefix + 直接アクセス必須 (2026-04-29 修正)**: ChatClient.tsx
   *     (client component) が判定に使う。webpack DefinePlugin が build 時に
   *     値で置換するのは `process.env.NEXT_PUBLIC_X` (member access) のみ。
   *     `process.env[name]` (computed access) は browser polyfill (env={}) に
   *     落ちて常に undefined → fallback。本 getter は直接記述で inline 強制。
   */
  get legacyCardAutoInsertEnabled(): boolean {
    return normalizeBool(
      process.env.NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT,
      true,
    );
  },
  /**
   * [Stage 2 L2-g 2026-04-28] `presenceExecutorEnabled`
   *   - lib/coalter/presence/** の Presence executor を本番経路に組み込むかの
   *     最終 kill switch (Stage 4 L4-l production flip 用の弁)。
   *   - 既定 OFF。Stage 4 L4-l flip まで OFF 固定 (CEO 別審議の上で flip)。
   *   - **flag OFF 時は presence/** が import すらされない**。Stage 1-3 の preview / E2E
   *     試作はこの flag を介さず別経路 (preview ページ / Stage 3 試作 wiring)。
   *   - 本 flag が ON になるのは Stage 4 L4-l のみ。flag が ON のとき:
   *       - 上部レイヤー UI を本番 ChatClient に mount (Stage 4 L4-c-h 経由で legacy
   *         CoAlterCard と入替)
   *       - signalAdapter / reducer / patternSelector / cooldownResolver / 各 store が
   *         active 経路に接続される
   *   - flag OFF で既存 coalter 挙動 (engine / orchestrator / dispatch / CoAlterCard) が
   *     1 bit も変わらない。Stage 4 以前の安全弁。
   *   - env から外せば pre-Stage 4 状態へ即座に戻る。
   *
   *   **NEXT_PUBLIC_ prefix + 直接アクセス必須 (2026-04-29 訂正)**:
   *   UpperLayerMount / PresenceSignalWiring (client component) が判定に使い、
   *   telemetry.safeEmit も client / server 両方から呼ばれる。
   *   webpack DefinePlugin の inline は `process.env.NEXT_PUBLIC_X`
   *   (member access) のみ対象。computed access (`process.env[name]`) は
   *   browser polyfill の env={} に落ちて常に undefined → fallback。
   *   本 getter は直接記述で inline を強制する。
   */
  get presenceExecutorEnabled(): boolean {
    return normalizeBool(
      process.env.NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR,
      false,
    );
  },
};

// ─────────────────────────────────────────────
// §7 Step B (2026-04-20): U3 exclusion gate abolition
// ─────────────────────────────────────────────
//
// webConnector.decideSearch の NO_SEARCH_PATTERNS (感情・関係性 regex) を
// 条件付きで撤廃する per-theme flag。
//
// 既定は全 OFF（Step A 観測挙動のまま）。env で theme 単位に ON 可能:
//   COALTER_U3_ABOLITION_FOOD=true など。
//
// flag=ON 時の挙動:
//   NO_SEARCH_PATTERNS hit + actionable=true → skip せず通常検索へ
//   NO_SEARCH_PATTERNS hit + actionable=false → 従来どおり skip（noise 防止）
//
// テストからは __setU3AbolitionOverride で env を汚さず切替可能。

export type U3AbolishableTheme = "food" | "movie" | "travel" | "activity";

const U3_ABOLITION_ENV_KEYS: Record<U3AbolishableTheme, string> = {
  food: "COALTER_U3_ABOLITION_FOOD",
  movie: "COALTER_U3_ABOLITION_MOVIE",
  travel: "COALTER_U3_ABOLITION_TRAVEL",
  activity: "COALTER_U3_ABOLITION_ACTIVITY",
};

const U3_ABOLISHABLE_THEMES = new Set<string>(
  Object.keys(U3_ABOLITION_ENV_KEYS),
);

let u3AbolitionOverride:
  | Partial<Record<U3AbolishableTheme, boolean>>
  | null = null;

/**
 * テスト用 override。process.env を触らず U3 abolition flag を上書きする。
 * null でクリア。
 */
export function __setU3AbolitionOverride(
  next: Partial<Record<U3AbolishableTheme, boolean>> | null,
): void {
  u3AbolitionOverride = next;
}

/**
 * 指定 theme で U3 撤廃が有効か。
 *
 *  1. 撤廃対象外 theme（schedule/gift/general）は常に false
 *  2. テスト override があればそれを採用
 *  3. 環境変数 fallback（default false）
 */
export function isU3AbolitionActive(theme: string): boolean {
  if (!U3_ABOLISHABLE_THEMES.has(theme)) return false;
  const t = theme as U3AbolishableTheme;
  if (u3AbolitionOverride && t in u3AbolitionOverride) {
    return !!u3AbolitionOverride[t];
  }
  return envBool(U3_ABOLITION_ENV_KEYS[t], false);
}
