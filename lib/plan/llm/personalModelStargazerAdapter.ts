/**
 * Phase 3-N Plan P2 Step 3 — Real Stargazer Personal Model Read-only Adapter
 *
 * 設計書: docs/alter-plan-p2-step3-real-pm-readiness.md (= v3.3 失敗後 補正済)
 *
 * 役割 (= CEO + GPT 2026-05-25 Step 3 着手 GO):
 *   - userId → PersonalModelV2 (= 3 層 + meta) を **実 Stargazer 既存 module** から read-only 抽出
 *   - synthetic adapter (= buildPersonalModelV2FromSynthetic) と並列、 production 用 entry
 *   - **read-only** (= Stargazer 既存 module 改変 0、 参照のみ、 DB write 0)
 *   - **safe degrade** (= 軸データ未完成 user で全 field undefined return、 deterministic 同等)
 *
 * Wire 優先順 (= CEO Q5 確定):
 *   1st: judgmentMode + timePreference (= 即効性高)
 *   2nd (次点): recentRhythm (= P4 中庸型対策可能性)
 *   3rd 以後: energyRecovery / psycheTone / archetype 等 (= 段階拡張)
 *
 * Step 3 主目的 (= v3.3 失敗後 格上げ):
 *   - **synthetic limitation vs prompt 弱さ** の切り分け
 *   - real PM で P3/P4 が adoption pass → synthetic 限界が主因
 *   - real PM でも未達 → prompt 弱さが主因 (= v3.4 必要)
 *
 * 実装段階 (= readiness doc Phase 2 内の wire enablement sub-stage):
 *   - Stage A (= 28508617): scaffold + safe fallback (= 全 null/undefined return、 既存 stub と同 挙動)
 *   - **Stage B (= 本 commit)**: judgmentMode + timePreference 実 wire (= axisRegistry + chronotypeFitness)
 *   - Stage C (= 次): recentRhythm 実 wire (= lifeEvents + innerWeather、 CEO Q5 次点)
 *   - Stage D: energyRecovery 等 後続 field 段階拡張
 *
 * 注: readiness doc (= alter-plan-p2-step3-real-pm-readiness.md) の Phase 1-6 は
 *     workflow 全体 (= branch / 実装 / test / smoke / commit / canary)。
 *     adapter file 内の Stage A-D は readiness Phase 2 (= adapter.ts 実装) の sub-stage。
 *
 * 不変原則:
 *   - server-only (= Stargazer module への DB read アクセス想定)
 *   - 既存 Stargazer module 完全 frozen
 *   - DB write 0
 *   - safe degrade (= 例外時は undefined return、 UI 壊れない)
 *   - alter plan scope 限定
 */

import "server-only";

import { supabaseServer } from "@/lib/supabase/server";
import { deserializeBeliefs, type BeliefSet } from "@/lib/stargazer/bayesianAxisUpdater";
import { analyzeChronotype } from "@/lib/stargazer/chronotypeFitness";
import { type HdmPhase, type HdmPhaseState } from "@/lib/stargazer/hdmPhase";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

import type {
  PersonalModelV2,
  PersonalModelStableLayer,
  PersonalModelRecentLayer,
  PersonalModelContextualLayer,
  PersonalModelMeta,
} from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wire 段階 const (= Stage A では全 disable、 Stage B 以降で有効化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 各 field wire 段階 control (= 段階的 enable、 Step 3 内の Stage 進行で個別 enable)
 *
 * Stage A: 全 false (= safe scaffold、 既存 stub と同 挙動)
 * **Stage B (= 本 commit)**: WIRE_JUDGMENT_MODE + WIRE_TIME_PREFERENCE = true
 * Stage C: + WIRE_RECENT_RHYTHM = true
 * Stage D 以後: 段階的に他 field 追加
 *
 * 各 wire 段階で:
 *   - 単体 test 追加 / 更新
 *   - real PM smoke 1 回
 *   - 採点 (= P3/P4 改善幅 + P1/P2 regression check)
 */
const WIRE_JUDGMENT_MODE = true;
const WIRE_TIME_PREFERENCE = true;
const WIRE_RECENT_RHYTHM = false;
const WIRE_ENERGY_RECOVERY = false;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 閾値 const (= 「集中型 / 分散型 / 中庸型」 判定基準、 Stage B 確定)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * judgmentMode 判定の axis 平均値閾値 (= readiness Stage B 確定)
 *
 * 根拠:
 *   - mu (= -1 から +1 の正規化) の 0.25 は moderate strength (= 弱からの脱出ライン)
 *   - 0.25 未満 = 中庸範囲、 secondary signal で判定
 *   - 0.25 以上 = 明確な傾向 (= 集中 / 分散)
 *   - portraitBuilder.ts pattern (= |mu| × √precision) を参考、 ただし Stage B では precision 不使用
 *     (= Stage C 以降で confidence 重み付け拡張余地)
 */
const JUDGMENT_MODE_THRESHOLD = 0.25;
const RELATIONAL_ENERGY_THRESHOLD = 0.25;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Observed-axis filter (= prior の 0 を本人特性と誤判定しないため)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * BeliefSet から **実観測あり (= confidence > 0) の軸の mu のみ** を抽出
 *
 * 設計理由:
 *   - 既存 `beliefsToScores()` は全 TRAIT_AXIS_KEYS について 0 fallback を注入する
 *     (= 「未観測 = prior の 0」 を本人特性として読めない区別なし shape)。
 *   - 本 adapter は LLM prompt 注入用 = 未観測軸の 0 を 「中庸型」 等として LLM に
 *     伝えるのは fake signal。
 *   - createEmptyBelief() は `confidence: 0` で初期化されるため、
 *     observation 後の belief は必ず confidence > 0。 これを gating signal に使う。
 *
 * 不変:
 *   - BeliefSet を mutate しない (= 新規 object return)
 *   - pure function (= I/O なし、 deterministic)
 */
function filterObservedScores(
  beliefs: BeliefSet,
): Partial<Record<TraitAxisKey, number>> {
  const observed: Partial<Record<TraitAxisKey, number>> = {};
  for (const key of Object.keys(beliefs) as TraitAxisKey[]) {
    const b = beliefs[key];
    if (b && b.confidence > 0) {
      observed[key] = b.mu;
    }
  }
  return observed;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB snapshot loader (= 1 つの query で profile + hdm state を並列取得)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Stargazer snapshot (= 単一 DB session で取得した read-only 状態)
 *
 * 各 field optional (= 1 query 失敗で他 field を巻き込まない、 fail-open per field)
 */
type StargazerSnapshot = {
  readonly scores: Partial<Record<TraitAxisKey, number>> | null;
  readonly hdmPhase: HdmPhase | null;
};

/**
 * userId から Stargazer の最新 axis scores + HdmPhase を read-only 取得
 *
 * 取得元 (= 既存 frozen tables):
 *   - stargazer_profiles.axis_beliefs (= JSON BeliefSet)
 *   - stargazer_alter_growth.hdm_phase_state (= JSON HdmPhaseState)
 *
 * fail-open:
 *   - userId 不在 → null/null
 *   - supabase 接続失敗 → null/null
 *   - row 不在 / column null → 個別 null
 *   - JSON 不正 → 個別 null (= deserializeBeliefs 例外を try/catch)
 *
 * Stargazer 既存 module 不変 (= 参照のみ、 frozen file 不触)
 */
async function loadStargazerSnapshotForUser(
  userId: string,
): Promise<StargazerSnapshot> {
  if (!userId || userId.length === 0) {
    return { scores: null, hdmPhase: null };
  }

  try {
    const supabase = await supabaseServer();

    const [profileRes, growthRes] = await Promise.all([
      supabase
        .from("stargazer_profiles")
        .select("axis_beliefs")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_alter_growth")
        .select("hdm_phase_state")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    // axis_beliefs → scores 抽出
    //
    // 重要: beliefsToScores() は全 TRAIT_AXIS_KEYS について 0 を fallback 注入する
    // (= 未観測軸 mu=0、 confidence=0)。 これを そのまま使うと
    //「観測されていない user」 が常に 「中庸型」 / 「中庸」 として injected される
    // bug が発生する (= prior の 0 を本人特性として誤伝)。
    //
    // 解法: BeliefSet を直接走査し、 **confidence > 0 の軸のみ** を観測済とみなす。
    // createEmptyBelief() (= bayesianAxisUpdater.ts:91-98) は confidence: 0 で
    // 初期化されるため、 confidence > 0 ⇔ 実観測あり と一意に対応する。
    let scores: Partial<Record<TraitAxisKey, number>> | null = null;
    const axisBeliefs = profileRes.data?.axis_beliefs;
    if (axisBeliefs && typeof axisBeliefs === "object") {
      try {
        const beliefs: BeliefSet = deserializeBeliefs(
          axisBeliefs as Record<string, { mu: number; precision: number }>,
        );
        scores = filterObservedScores(beliefs);
      } catch {
        // deserialize 失敗 = JSON 不正、 silent fallback
        scores = null;
      }
    }

    // hdm_phase_state → currentPhase 抽出
    let hdmPhase: HdmPhase | null = null;
    const hdmStateJson = growthRes.data?.hdm_phase_state;
    if (hdmStateJson && typeof hdmStateJson === "object") {
      try {
        const state = hdmStateJson as HdmPhaseState;
        const p = state.currentPhase;
        if (typeof p === "number" && p >= 0 && p <= 5 && Number.isInteger(p)) {
          hdmPhase = p as HdmPhase;
        }
      } catch {
        hdmPhase = null;
      }
    }

    return { scores, hdmPhase };
  } catch {
    // supabase 接続 / cookies() 不在 / その他例外 = 完全 fail-open
    return { scores: null, hdmPhase: null };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-field derivers (= pure function、 scores 渡しで mock 可能)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * judgmentMode 導出 (= axisRegistry の individual_vs_social + stress_isolation_vs_social から短 tag)
 *
 * Logic:
 *   1. individual_vs_social.mu (= -1 〜 +1):
 *      - mu < -0.25 → 「集中型」 (= 個で深める、 deep solo focus)
 *      - mu > +0.25 → 「分散型」 (= 集団で広げる、 collaborative spread)
 *   2. 中庸範囲 (= |mu| ≤ 0.25): stress_isolation_vs_social で副次判定
 *      - mu > +0.25 → 「関係エネルギー型」 (= ストレス時に人を求める、 relational energy)
 *      - 上記以外 → 「中庸型」
 *
 * 不変:
 *   - scores null / individual_vs_social 不在 → undefined return
 *   - pure function (= I/O なし)
 */
function deriveJudgmentMode(
  scores: Partial<Record<TraitAxisKey, number>> | null,
): string | undefined {
  if (!scores) return undefined;
  const individual = scores.individual_vs_social;
  if (typeof individual !== "number") return undefined;

  if (individual < -JUDGMENT_MODE_THRESHOLD) return "集中型";
  if (individual > JUDGMENT_MODE_THRESHOLD) return "分散型";

  // 中庸範囲 — secondary signal で判定
  const stressIso = scores.stress_isolation_vs_social;
  if (typeof stressIso === "number" && stressIso > RELATIONAL_ENERGY_THRESHOLD) {
    return "関係エネルギー型";
  }
  return "中庸型";
}

/**
 * timePreference 導出 (= chronotypeFitness 経由で 短 tag)
 *
 * Logic:
 *   1. analyzeChronotype(scores) → ChronotypeResult | null
 *      (= 5 軸以上必要 = plan / bold / emotional / regulation / analytical)
 *   2. result.type → 短 tag:
 *      - "morning" → 「朝強い」
 *      - "evening" → 「夜強い」
 *      - "balanced" → 「中庸」
 *
 * 不変:
 *   - scores null / axis 5 個未満 → undefined return
 *   - chronotypeFitness module 不変 (= 既存 frozen、 read-only 呼出)
 *   - pure function (= I/O なし)
 */
function deriveTimePreference(
  scores: Partial<Record<TraitAxisKey, number>> | null,
): string | undefined {
  if (!scores) return undefined;
  // analyzeChronotype が ≥5 axes を要求 (= chronotypeFitness.ts:43-44)
  // 注: scores は filterObservedScores で confidence > 0 のみ含む。
  //     よって definedCount = 実観測軸数 (= prior 0 fallback による fake count なし)
  const definedCount = Object.values(scores).filter(
    (v) => typeof v === "number",
  ).length;
  if (definedCount < 5) return undefined;

  const result = analyzeChronotype(scores);
  if (!result) return undefined;

  switch (result.type) {
    case "morning":
      return "朝強い";
    case "evening":
      return "夜強い";
    case "balanced":
      return "中庸";
    default:
      return undefined;
  }
}

/**
 * recentRhythm 導出 (= lifeEvents + innerWeather 経由、 Stage C 実装予定)
 *
 * Stage B (= 本 commit): WIRE_RECENT_RHYTHM = false → undefined return
 */
function deriveRecentRhythm(
  _scores: Partial<Record<TraitAxisKey, number>> | null,
): string | undefined {
  if (!WIRE_RECENT_RHYTHM) return undefined;
  // Stage C で実装
  return undefined;
}

/**
 * energyRecovery 導出 (= axisRegistry traitTone 経由、 Stage D 実装予定)
 *
 * Stage B (= 本 commit): WIRE_ENERGY_RECOVERY = false → undefined return
 */
function deriveEnergyRecovery(
  _scores: Partial<Record<TraitAxisKey, number>> | null,
): string | undefined {
  if (!WIRE_ENERGY_RECOVERY) return undefined;
  // Stage D で実装
  return undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// extractPersonalModelFromStargazer (= public entry、 各 field 独立 try/catch)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 実 Stargazer 経由で PersonalModelV2 抽出
 *
 * 全体フロー:
 *   1. loadStargazerSnapshotForUser(userId) で 1 DB session で 2 query 並列
 *   2. snapshot.scores から judgmentMode + timePreference 導出 (= Stage B)
 *   3. snapshot.hdmPhase → meta.hdmPhase
 *   4. Phase に応じて layer build (= 0-1: meta only / 2: + stable / 3: + recent / 4-5: + contextual)
 *
 * Stage B (= 本 commit):
 *   - WIRE_JUDGMENT_MODE / WIRE_TIME_PREFERENCE = true (= 実 wire)
 *   - WIRE_RECENT_RHYTHM / WIRE_ENERGY_RECOVERY = false (= Stage C 以降)
 *
 * 不変:
 *   - 既存 Stargazer module 完全 frozen (= 参照のみ)
 *   - DB write 0
 *   - 例外 1 件で entry 全体が落ちない (= fail-open per layer / per field)
 *   - 軸データ未完成 user → meta-only Phase 0 (= Stage A 等価動作)
 */
export async function extractPersonalModelFromStargazer(
  userId: string,
): Promise<PersonalModelV2> {
  // userId 不在 → meta-only Phase 0 (= deterministic 等価)
  if (!userId || userId.length === 0) {
    return {
      meta: {
        hdmPhase: 0,
        trustLevel: 0,
        observationCompleteness: 0,
      },
    };
  }

  // DB snapshot 1 session 取得 (= fail-open、 例外で完全 null/null)
  const snapshot = await loadStargazerSnapshotForUser(userId);

  // Per-field 導出 (= pure、 例外なし)
  const judgmentMode = WIRE_JUDGMENT_MODE
    ? deriveJudgmentMode(snapshot.scores)
    : undefined;
  const timePreference = WIRE_TIME_PREFERENCE
    ? deriveTimePreference(snapshot.scores)
    : undefined;
  const recentRhythm = deriveRecentRhythm(snapshot.scores);
  const energyRecovery = deriveEnergyRecovery(snapshot.scores);

  // Meta build (= hdmPhase は snapshot から、 trust / completeness は Stage 後段)
  const hdmPhase: HdmPhase = snapshot.hdmPhase ?? 0;
  const meta: PersonalModelMeta = {
    hdmPhase,
    trustLevel: 0, // Stage 後段で alterUnderstanding 経由実装
    observationCompleteness: 0, // Stage 後段で axisRegistry 充足度算定
  };

  // Phase 6 smoke 観測用 dev-only log (= 本番では emit しない)
  // PII 出さない (= userId は 8 文字 + ***、 軸値・mu は出さない、 短 tag のみ)
  if (process.env.NODE_ENV !== "production") {
    const observedAxesCount = snapshot.scores
      ? Object.keys(snapshot.scores).length
      : 0;
    console.info("[plan/pm] extracted", {
      userIdPrefix: userId.slice(0, 8) + "***",
      hdmPhase,
      observedAxesCount,
      judgmentMode: judgmentMode ?? null,
      timePreference: timePreference ?? null,
      layer:
        hdmPhase < 2
          ? "meta-only"
          : hdmPhase === 2
            ? "stable"
            : hdmPhase === 3
              ? "stable+recent"
              : "full",
    });
  }

  // Phase < 2 → meta-only (= 個別化 skip、 deterministic 等価)
  if (hdmPhase < 2) {
    return { meta };
  }

  // Stable layer build (= 充填 field のみ含む、 readonly 維持のため spread で構築)
  const stable: PersonalModelStableLayer | undefined = (() => {
    const built: PersonalModelStableLayer = {
      ...(judgmentMode ? { judgmentMode } : {}),
      ...(timePreference ? { timePreference } : {}),
      // energyRecovery → traitTone slot に格納 (= Stable layer の slot 名)
      ...(energyRecovery ? { traitTone: energyRecovery } : {}),
    };
    return Object.keys(built).length > 0 ? built : undefined;
  })();

  // Phase 2 → stable のみ
  if (hdmPhase === 2) {
    return stable !== undefined ? { stable, meta } : { meta };
  }

  // Recent layer build (= Phase ≥ 3、 readonly 維持)
  const recent: PersonalModelRecentLayer | undefined = (() => {
    const built: PersonalModelRecentLayer = {
      ...(recentRhythm ? { recentRhythm } : {}),
    };
    return Object.keys(built).length > 0 ? built : undefined;
  })();

  if (hdmPhase === 3) {
    return {
      ...(stable !== undefined ? { stable } : {}),
      ...(recent !== undefined ? { recent } : {}),
      meta,
    };
  }

  // Phase ≥ 4 → contextual layer も build (= 当面空、 別 Step で実装)
  const contextual: PersonalModelContextualLayer | undefined = undefined;

  return {
    ...(stable !== undefined ? { stable } : {}),
    ...(recent !== undefined ? { recent } : {}),
    ...(contextual !== undefined ? { contextual } : {}),
    meta,
  };
}
