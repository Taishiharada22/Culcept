/**
 * CoAlter Stage 1 Understand — Live collector（本番 invoke 用）
 *
 * ─────────────────────────────────────────────────────────────────────────
 * [CEO lock 2026-04-20 M1 1b] **Y-lite 範囲の live collector**
 *
 *   許可ソース:
 *     - talk_messages                  (1a から継続)
 *     - stargazer_axis_snapshots       (1b 追加 — person.stargazer.decisionAxes)
 *     - stargazer_alter_growth         (1b 追加 — person.alter の trust + phase)
 *     - coalter_fairness_ledger        (1b 追加 — relationship.fairnessLedger)
 *
 *   **意図的に省略**（Y-lite 範囲外、別 chunk 対象）:
 *     - stargazer_inner_weather        — CEO: 最新データで観測ほぼ無し
 *     - origin / calendar / wear       — behavioral 全体を null で残す
 *     - location / wardrobe / style    — context を null で残す
 *     - sharedHistory / ruptures       — 本番テーブル未作成のため [] で残す
 *
 *   1a の構造保全:
 *     - talk_messages fetch ロジック（DESC → reverse）は変更なし
 *     - read-only（INSERT / UPDATE / DELETE なし）
 *     - 例外は呼び元に throw（invoke 側で catch → stage1 欠落 fail-open）
 *     - collectorMeta の queryCount / sources で latency / 過読み検知可能
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stage1CollectorMeta } from "../types";
import {
  buildObservationBundle,
  type AlterCollectorInput,
  type CollectorInputs,
  type PersonCollectorInput,
  type RelationshipCollectorInput,
  type StargazerCollectorInput,
} from "./observationBundle";
import type {
  ConversationTurn,
  DecisionAxis,
  FairnessRecord,
  HdmPhaseSummary,
  IsoTimestamp,
  ObservationBundle,
  TrustLevelScalar,
  UserId,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public input / output
// ═══════════════════════════════════════════════════════════════════════════

export type LiveCollectorInput = {
  supabase: SupabaseClient;
  threadId: string;
  /** coalter_fairness_ledger の絞り込み key */
  pairStateId: string;
  userA: string;
  userB: string;
  /** invoke route が注入する現在時刻 ISO。決定論のため caller 責任。 */
  now: IsoTimestamp;
};

export type LiveCollectorOutput = {
  bundle: ObservationBundle;
  meta: Stage1CollectorMeta;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. 定数
// ═══════════════════════════════════════════════════════════════════════════

/** talk_messages の tail 件数。diag / shadow と同じ 50 件。 */
const TALK_MESSAGES_TAIL_LIMIT = 50;

/** 参照テーブル（collectorMeta.sources にソート済みで載せるもの） */
const SOURCE_TALK = "talk_messages";
const SOURCE_AXES = "stargazer_axis_snapshots";
const SOURCE_GROWTH = "stargazer_alter_growth";
const SOURCE_FAIRNESS = "coalter_fairness_ledger";

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public collector
// ═══════════════════════════════════════════════════════════════════════════

export async function collectLiveBundle(
  input: LiveCollectorInput,
): Promise<LiveCollectorOutput> {
  const turns = await fetchTurns(
    input.supabase,
    input.threadId,
    input.userA,
    input.userB,
  );
  const axesByUser = await fetchAxesByUser(input.supabase, input.userA, input.userB);
  const growthByUser = await fetchGrowthByUser(input.supabase, input.userA, input.userB);
  const fairnessLedger = await fetchFairnessLedger(input.supabase, input.pairStateId);

  const relationship: RelationshipCollectorInput = {
    sharedHistory: [],
    fairnessLedger,
    currentTemperature: null,
    interactionPattern: null,
    unresolvedThreads: [],
    rupturesAndRepairs: [],
  };

  const collectorInputs: CollectorInputs = {
    personA: buildPerson(input.userA, axesByUser, growthByUser),
    personB: buildPerson(input.userB, axesByUser, growthByUser),
    relationship,
    conversation: {
      turns,
      theme: null,
      extractedConstraints: null,
      caringIntensity: null,
      implicitMood: null,
      energyLevel: null,
      conversationArc: null,
      questionGuardState: null,
    },
    environmental: {
      timestamp: input.now,
      weather: null,
    },
    collectedAt: input.now,
  };

  const bundle = buildObservationBundle(collectorInputs);

  const meta: Stage1CollectorMeta = {
    queryCount: 4,
    // sources は alphabetical に昇順固定（snapshot 比較で揺らがないため）
    sources: [SOURCE_FAIRNESS, SOURCE_GROWTH, SOURCE_AXES, SOURCE_TALK].sort(),
  };

  return { bundle, meta };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Person composer — Stargazer / 基本 Alter の埋め込み
// ═══════════════════════════════════════════════════════════════════════════

function buildPerson(
  userId: string,
  axesByUser: Map<string, DecisionAxis[]>,
  growthByUser: Map<string, GrowthRow>,
): PersonCollectorInput {
  const axes = axesByUser.get(userId) ?? [];
  const growth = growthByUser.get(userId) ?? null;

  const stargazer: StargazerCollectorInput | null =
    axes.length > 0
      ? {
          axes,
          comfortSources: [],
          fatigueTriggers: [],
          recoveryConditions: [],
          unspokenDesires: [],
          breakingConditions: [],
          stateVariability: null,
        }
      : null;

  const alter: AlterCollectorInput | null = buildAlter(growth);

  return {
    userId: userId as UserId,
    displayName: "",
    stargazer,
    alter,
    behavioral: null, // Y-lite 範囲外（calendar / wear は次 chunk）
    context: null, // Y-lite 範囲外（location / wardrobe / styleProfile は次 chunk）
  };
}

function buildAlter(growth: GrowthRow | null): AlterCollectorInput | null {
  if (!growth) return null;

  const phaseState: HdmPhaseSummary | null =
    growth.hdm_phase_state?.currentPhase != null
      ? {
          phase: clamp(growth.hdm_phase_state.currentPhase ?? 0, 0, 5),
          lastTransitionAt: (growth.hdm_phase_state.lastTransitionAt ??
            growth.updated_at) as IsoTimestamp,
        }
      : null;

  const trustLevel: TrustLevelScalar | null =
    typeof growth.trust_level === "number"
      ? {
          level: clamp(growth.trust_level * 5, 0, 5),
          observedAt: growth.updated_at as IsoTimestamp,
        }
      : null;

  if (!phaseState && !trustLevel) return null;

  return {
    personalityLens: null, // Y-lite: 別テーブル。推論せず null
    recentEmotionalState: null, // Y-lite: inner_weather は観測スカスカなので null
    trustLevel,
    phaseState,
    recentNarratives: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Supabase queries
// ═══════════════════════════════════════════════════════════════════════════

type TalkMessageRow = {
  sender_id: string;
  body: string;
  created_at: string;
};

async function fetchTurns(
  supabase: SupabaseClient,
  threadId: string,
  userA: string,
  userB: string,
): Promise<ConversationTurn[]> {
  const { data, error } = await supabase
    .from(SOURCE_TALK)
    .select("sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(TALK_MESSAGES_TAIL_LIMIT);

  if (error) {
    throw new Error(`liveCollector: talk_messages fetch failed: ${error.message}`);
  }
  const rows = (data ?? []) as TalkMessageRow[];
  rows.reverse();
  return rows
    .filter((r) => r.sender_id === userA || r.sender_id === userB)
    .map((r) => ({
      senderId: r.sender_id as UserId,
      body: r.body,
      createdAt: r.created_at as IsoTimestamp,
    }));
}

type AxisRow = {
  user_id: string;
  axis_id: string;
  score: number | string;
  confidence: number | string | null;
  created_at: string;
};

async function fetchAxesByUser(
  supabase: SupabaseClient,
  userA: string,
  userB: string,
): Promise<Map<string, DecisionAxis[]>> {
  const { data, error } = await supabase
    .from(SOURCE_AXES)
    .select("user_id, axis_id, score, confidence, created_at")
    .in("user_id", [userA, userB])
    .is("context", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`liveCollector: stargazer_axis_snapshots fetch failed: ${error.message}`);
  }
  const rows = (data ?? []) as AxisRow[];

  // 各 user × axis_id で最新を採用
  const byUserAxis = new Map<string, AxisRow>();
  for (const r of rows) {
    const key = `${r.user_id}::${r.axis_id}`;
    const cur = byUserAxis.get(key);
    if (!cur || cur.created_at < r.created_at) byUserAxis.set(key, r);
  }

  const map = new Map<string, DecisionAxis[]>();
  for (const r of byUserAxis.values()) {
    const axis: DecisionAxis = {
      key: r.axis_id,
      value: clamp(Number(r.score), -1, 1),
      confidence: clamp(Number(r.confidence ?? 0), 0, 1),
      observedAt: r.created_at as IsoTimestamp,
    };
    const list = map.get(r.user_id) ?? [];
    list.push(axis);
    map.set(r.user_id, list);
  }
  return map;
}

type GrowthRow = {
  user_id: string;
  hdm_phase_state: { currentPhase?: number | null; lastTransitionAt?: string | null } | null;
  trust_level: number | null;
  updated_at: string;
};

async function fetchGrowthByUser(
  supabase: SupabaseClient,
  userA: string,
  userB: string,
): Promise<Map<string, GrowthRow>> {
  const { data, error } = await supabase
    .from(SOURCE_GROWTH)
    .select("user_id, hdm_phase_state, trust_level, updated_at")
    .in("user_id", [userA, userB]);

  if (error) {
    throw new Error(`liveCollector: stargazer_alter_growth fetch failed: ${error.message}`);
  }
  const rows = (data ?? []) as GrowthRow[];
  const map = new Map<string, GrowthRow>();
  for (const r of rows) map.set(r.user_id, r);
  return map;
}

type FairnessLedgerRow = {
  /**
   * coalter_sessions.id。
   * **null = onboarding seed row** (pre-session の公平性原点 skew=0)。
   * 型を嘘にしないため string | null。将来集計で除外したい場合は
   * `WHERE session_id IS NOT NULL` を付ける。
   */
  session_id: string | null;
  bias_score: number | string;
  decided_at: string;
};

async function fetchFairnessLedger(
  supabase: SupabaseClient,
  pairStateId: string,
): Promise<FairnessRecord[]> {
  const { data, error } = await supabase
    .from(SOURCE_FAIRNESS)
    .select("session_id, bias_score, decided_at")
    .eq("pair_state_id", pairStateId)
    .order("decided_at", { ascending: true });

  if (error) {
    throw new Error(`liveCollector: coalter_fairness_ledger fetch failed: ${error.message}`);
  }
  const rows = (data ?? []) as FairnessLedgerRow[];
  return rows.map((r) => ({
    sessionId: r.session_id,
    decidedAt: r.decided_at as IsoTimestamp,
    skew: clamp(Number(r.bias_score), -1, 1),
    topic: "", // Y-lite: fairnessLedger の topic は別 column。1b では空で十分
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. 小さなヘルパ
// ═══════════════════════════════════════════════════════════════════════════

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
