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
   * [D-1-d 2026-05-11] `movieCuratorLiveEnabled`
   *   - movieOrchestrator の `generateMovieProposalV2` で D-1-c curator を
   *     **shadow 並走** するか決める kill switch (Step D D-1-d、handover
   *     `docs/coalter-handoff-2026-05-11-stepd.md` §5 / 三段式 §6 Phase M1)。
   *   - 既定 OFF。**flag OFF 時は movieOrchestrator の 4-layer pipeline call flow が
   *     1 bit も変化しない**。新 path import は残るが実行されない (dead import)。
   *   - ON 時: `runMovieCuratorShadow` を 4-layer pipeline 完了後 (return 直前) に
   *     **fire-and-forget** で起動。shadow 結果は本流の card / ranked / telemetry /
   *     diagnostics に **1 bit も反映しない**。
   *   - shadow 失敗は runMovieCuratorShadow 内 try/catch で握り潰し、呼び出し側でも
   *     `.catch(() => {})` で二重防御 (fail-open、Bug-1 §2.3 失敗独立 5 条文の精神)。
   *   - D-1-d scope (CEO 採用 X1 + Y1): 3 source は空配列 stub、LLM client は
   *     空 stub (実 LLM / API 接続なし、実 candidate fetch なし、telemetry / persistence /
   *     console log 追加なし)。
   *   - 完全置換は D-2-e `COALTER_THREE_STAGE` grand kill switch で別 phase。
   *   - env から外せば即座に pre-D-1-d 状態へ戻る。
   */
  get movieCuratorLiveEnabled(): boolean {
    return normalizeBool(process.env.COALTER_MOVIE_CURATOR_LIVE, false);
  },
  /**
   * [D-2-e2 2026-05-11] `threeStageEnabled` (`COALTER_THREE_STAGE`)
   *   - movie 三段式本線 (`runThreeStagePipeline` D-2-e1 scaffold) を起動する
   *     grand kill switch (Step D Phase M2、handover
   *     `docs/coalter-handoff-2026-05-11-stepd.md` §6 / 三段式 §6 Phase M2)。
   *   - 既定 OFF。**flag OFF 時は generateMovieProposalV2 の 4-layer pipeline
   *     call flow が 1 bit も変化しない** (D-1-d `movieCuratorLiveEnabled` と同精神)。
   *   - ON 時: 4-layer pipeline を **bypass** し、`runThreeStageScaffoldPath`
   *     (`lib/coalter/movie/threeStageOrchestratorAdapter.ts`) で stub deps
   *     (4 fetcher = 空配列、LLM client = 空文字列、3 candidate source = 空配列、
   *     lens = placeholder、userArea = "") で `runThreeStagePipeline` を起動し、
   *     結果を `MovieOrchestratorOutput` 互換 shape に adapter で変換して返す。
   *   - D-2-e2 scope (structural scaffold complete): 実 fetcher / 実 LLM / M0
   *     lens 接続なし、telemetry / persistence / console log 追加なし。
   *   - 実接続 (実 candidate / 実 LLM / M0 lens) は **D-2-e3** で別 phase。
   *     Step E (Production observation) は **D-2-e3 + Step E-0 の実接続レビュー
   *     後** にしか起動できない。
   *   - rollback: 環境変数 `COALTER_THREE_STAGE` を `false` / unset / 環境から
   *     削除 → Production redeploy → 即座に pre-D-2-e2 状態 (4-layer pipeline
   *     のみ) に復帰。コード revert 不要。
   */
  get threeStageEnabled(): boolean {
    return normalizeBool(process.env.COALTER_THREE_STAGE, false);
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
  /**
   * [A3 2026-05-16] `understandingBufferFanoutEnabled` (`COALTER_UNDERSTANDING_BUFFER_FANOUT`)
   *   - emitUnderstandingDiagnostics 内で、A2 redacted diagnostics buffer
   *     (`lib/coalter/understanding/redactedDiagnosticsBuffer.ts`) への
   *     **memory-only fan-out** を起動する kill switch。
   *   - 既定 OFF。**flag OFF 時は emit call flow が 1 bit も変化しない**
   *     (fanOut helper は早期 return)。既存 console emit 経路は不変。
   *   - ON 時: emit 内で fanOutUnderstandingDiagnosticsToBuffer が走り、
   *     raw UnderstandingDiagnostics を redacted CreateInput に transform、
   *     A2 buffer に memory-only append。
   *   - 既存 `COALTER_UNDERSTANDING_DIAGNOSTICS` (console emit kill switch) に
   *     **依存しない** (完全独立 flag)。buffer fan-out path は console-free。
   *   - 失敗は内部 try/catch + 呼び出し側 try/catch の二重防御 (fail-open)。
   *   - **A3 scope**: fan-out only。read-only retrieval API / Sentry / telemetry
   *     send / console / DB / storage は **追加しない**。
   *   - rollback: 環境変数 `COALTER_UNDERSTANDING_BUFFER_FANOUT=false` /
   *     unset → 即座に pre-A3 状態 (console emit のみ) に復帰。コード revert 不要。
   *   - **本 PR で env file / Vercel env 変更なし** (Preview env 設定は別判断)。
   */
  get understandingBufferFanoutEnabled(): boolean {
    return normalizeBool(process.env.COALTER_UNDERSTANDING_BUFFER_FANOUT, false);
  },
  /**
   * [A-2b 2026-05-16] `presenceObserverEnabled` (`NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER`)
   *   - CoAlter Always-On Observer (AOO) の presence signal bus subscribe を
   *     有効化する kill switch。
   *   - 既定 OFF。Production env は触らない (default false 維持)。
   *   - **flag OFF 時は observer subscribe を一切しない**。既存 presence layer の
   *     動作は 1 bit も変わらない (subscribers fan-out に observer が加わらないため、
   *     既存 subscriber `usePresenceExecutor` の挙動も完全不変)。
   *   - ON 時: A-2c で実装される client wiring が
   *     `subscribePresenceSignal(handler)` 呼出を許可される。本 A-2b 段階では
   *     library のみ準備、実 subscribe call なし。
   *   - **A-2b scope**: getter 追加のみ。env 操作なし。Preview env に
   *     `NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER=true` を追加するのは CEO 判断後の
   *     別オペレーション。
   *
   *   **NEXT_PUBLIC_ prefix + 直接アクセス必須 (presenceExecutorEnabled と同根拠)**:
   *   AOO observer は client side で subscribe する (productionSignalBus は現状
   *   client side でのみ publish/subscribe される)。webpack DefinePlugin の
   *   inline 置換対象は `process.env.NEXT_PUBLIC_X` (member access) のみで、
   *   computed access は browser polyfill で undefined → fallback。本 getter は
   *   既存 `presenceExecutorEnabled` と同じ直接記述パターンを踏襲する。
   *
   *   関連:
   *   - 設計: docs/coalter-always-on-observer-design.md (PR #151)
   *   - 訂正: docs/coalter-aoo-presence-reconciliation.md (PR #154)
   *   - audit: docs/coalter-aoo-a2-presence-signal-bus-audit.md (PR #156)
   *   - preflight: docs/coalter-aoo-a2b-implementation-preflight.md (PR #157)
   */
  get presenceObserverEnabled(): boolean {
    return normalizeBool(
      process.env.NEXT_PUBLIC_COALTER_PRESENCE_OBSERVER,
      false,
    );
  },

  /**
   * **Phase B B-1 (2026-05-17)** — Mirror Channel kill switch (strict parser)
   *
   * 用途:
   *   `components/coalter/mirror/MirrorHost` が読み、
   *   - false なら `return null` (完全 no-op、DOM 出力なし)
   *   - true なら `<MirrorSurface />` mount (B-1 段階は hidden shell のみ)
   *
   * **strict parser** (CEO 補正 1 / B-0 plan §3.3):
   *   - 既存 `normalizeBool` の "" → true 挙動とは**明示的に異なる**
   *   - Mirror Channel は user との関係に直接影響するため、空文字 / 曖昧値で
   *     意図せず ON になるリスクを排除する
   *   - `process.env.NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED === "true"` のみ true
   *   - unset / "" / "false" / "0" / "1" / "on" / "yes" / 不明値 すべて false
   *   - 既存 `presenceExecutorEnabled` / `presenceObserverEnabled` の normalizeBool 挙動には
   *     触らない (Phase A の挙動を維持、global 副作用なし)
   *
   * webpack DefinePlugin:
   *   `process.env.NEXT_PUBLIC_X` (member access) を build 時 string 値で inline 置換。
   *   computed access (`process.env[name]`) は browser polyfill で undefined → fallback。
   *   本 getter は既存 `presenceExecutorEnabled` と同じ member access 直接記述。
   *
   * env scope (Phase B 計画):
   *   - B-1 merge: env 投入なし (default false → MirrorHost null-render)
   *   - B-2 〜 B-4 merge: env 投入なし
   *   - B-5 canary: branch-scoped Preview only (CEO 承認後)
   *   - Production: Phase B 全期間で投入禁止
   *
   * 関連:
   *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164)
   *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165)
   */
  get mirrorChannelEnabled(): boolean {
    return process.env.NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED === "true";
  },

  /**
   * **Phase B B-5a (2026-05-17)** — Mirror Diagnostic debug global expose (strict parser)
   *
   * 用途:
   *   `lib/coalter/mirror/diagnosticDebugGlobal.ts` が読み、
   *   - false なら window global を install しない (完全 no-op)
   *   - true なら `window.__coalterMirrorDiagnostic` に 15-min expire debug API を expose
   *
   * **二重 flag gating**:
   *   debug global は **両方の flag が true** のときのみ install:
   *     1. `mirrorChannelEnabled === true` (Mirror Channel 自体が ON)
   *     2. `mirrorDiagnosticExposeEnabled === true` (diagnostic 公開を明示)
   *
   *   片方だけ ON では install されない。
   *
   * **strict parser** (B-1 mirror flag と同パターン、global 副作用なし):
   *   - `process.env.NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE === "true"` のみ true
   *   - unset / "" / "false" / "0" / "1" / "on" / "yes" / 不明値 すべて false
   *   - 既存 `normalizeBool` helper は使わない (Phase A 挙動を保護、B-1 と同方針)
   *
   * env scope (Phase B 計画):
   *   - B-5a merge: env 投入なし (default false → debug global install されない)
   *   - B-5c canary (CEO 操作): branch-scoped Preview only で `=== "true"` を投入
   *   - Production: Phase B 全期間で投入禁止
   *
   * webpack DefinePlugin:
   *   member access 直接記述 (B-1 mirror channel flag と同形式)。
   *
   * 関連:
   *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §10.8 Transparent Reticence
   *   - 実装: lib/coalter/mirror/diagnosticDebugGlobal.ts (B-5a)
   */
  get mirrorDiagnosticExposeEnabled(): boolean {
    return process.env.NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE === "true";
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
