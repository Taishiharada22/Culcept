/**
 * Phase 3-L-3b + L-3c (pure) — MovementSegment Overlay Layer
 *
 * 役割 (= K の「computed projection」 に対する「現実の影」):
 *   K phase の DayGraph は「ユーザーが宣言した時間構造」、
 *   本 overlay は「現実の物理移動の影」。 影は本体を mutate しない。
 *
 *   `buildDayGraph` の出力 (= DayGraph + MovementTransition[]) と、 caller が用意した
 *   `coordsByAnchorId` map + `overridesByTransitionKey` map を入力に、
 *   各 transition を cascade orchestrator で resolve し、
 *   PII-sanitize 済の `segmentsByTransitionKey` map を返す。
 *
 * 思想 (= Mobility Truth Layer):
 *   - 移動が確定したか / されていないかを **観測** する layer
 *   - K の computed projection 純度を一切破壊しない
 *   - 「→ 移動」 は K のまま、 overlay は「移動 約 30 分」 等の view 層 (= L-4+) に渡る素材を提供するだけ
 *   - **Privacy is structural** — overlay 出力に nodeId / locationText / title 等の PII を **持てない**
 *
 * L-3b 設計 (= 初版、 2026-05-22):
 *   - GPT 補正 6 件全反映
 *   - 自律補強 5 件 (= A / B1 / B3 / C1 / F1)
 *
 * L-3c post-audit hardening (= 2026-05-22 PM、 4 critical 実害修正):
 *   1A. **mutation guard 強化** — snapshotId 比較 → JSON.stringify snapshot 比較
 *       (= computeSnapshotId は anchor 集合から計算するため、 graph 内部 mutate 検出不能だった)
 *   1B. 配列長 + 第一要素 reference 同一性 早期検出
 *   2A. **transitionKey を非 PII 化** — `transition_${index}` 単独 (= EventNode.id === anchor.id だったため anchor id 漏洩していた)
 *   3A. **cascade で sensitive_adjacent も early-exit** (= cascade 側で対応済、 overlay default 計算も整合)
 *   6A. **overlay 出力で nodeId / locationText を強制 sanitize** — 新型 `OverlaySegmentView` 導入
 *       (= MovementSegment は L-1 で raw locationText を持てる構造、 L-3c は overlay layer で sanitize)
 *
 *   追加条件 (= CEO 2026-05-22 PM 指示):
 *   - result / warnings / traces に **nodeId を出さない** (= anchor id 相当)
 *   - transitionIndex は OK
 *   - transitionKey は `transition_${index}` のみ
 *   - fromNodeId / toNodeId は **内部処理のみで使い、 overlay output には出さない**
 *   - sanitize 済 segment を返す前に **privacy assertion** をかける
 *
 * L-3c scope:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0
 *   - K phase 既存 file 変更 0
 *   - L-1 type 変更 0 (= freeze 維持、 overlay layer で sanitize)
 *   - DayGraph mutation 一切なし
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-3-post-implementation-audit.md (= 4 critical 詳述)
 *   - docs/alter-plan-phase3-l-3-readiness-audit.md (= L-3 pre-audit)
 *   - lib/plan/transport/cascadeOrchestrator.ts (= L-3a + L-3c sensitive_adjacent 強化)
 *   - lib/plan/dayGraph/dayGraphTypes.ts (= K phase 無変更)
 */

import type {
  DayGraph,
  MovementTransition,
} from "@/lib/plan/dayGraph/dayGraphTypes";
import {
  runCascade,
  type CascadeInput,
  type CascadeOptions,
  type CascadeTrace,
  type ManualOverride,
} from "./cascadeOrchestrator";
import type {
  MovementConfidence,
  MovementPrivacyClass,
  MovementUnresolvedReason,
  TransportModeCandidate,
  TransportProvider,
  TransportResolutionProvider,
} from "./transportTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-3c hardening: transitionKey (= 非 PII 化、 anchor id を含まない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Overlay 出力用の transitionKey 生成 (= L-3c 修正案 2A)。
 *
 * 形式: `transition_${index}`
 *
 * L-3b 旧形式 `transition_${index}_${fromNodeId}_${toNodeId}` は anchor id 漏洩していたため廃止。
 * fromNodeId / toNodeId は overlay output に **出さない** (= EventNode.id === anchor.id のため)。
 *
 * 同 graph 内で `index` は一意、 graph 跨ぎでは衝突可能だが、
 * overlay は単一 DayGraph に対する処理なので問題ない。
 *
 * @param index - transitions 配列内の index (= K phase と同 index 採番、 caller が graph.transitions 順を維持する責務)
 */
export function buildTransitionKey(index: number): string {
  return `transition_${index}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-3c hardening: OverlaySegmentView (= PII-free 公開出力型)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Overlay 出力公開 view (= **Privacy is structural** の構造的保証)。
 *
 * **L-1 `MovementSegmentResolved/Unresolved` を再利用せず、 overlay 専用 view 型を新設**。
 * これにより:
 *   - `fromNodeId` / `toNodeId` (= EventNode.id === anchor.id) を **持てない**
 *   - `fromLocationText` / `toLocationText` (= raw location 名) を **持てない**
 *   - `sensitiveProximity` (= 内部 flag) を **持てない**
 *   - L-1 freeze を維持しつつ、 overlay output から PII を構造的に排除
 *
 * 設計判断:
 *   - L-1 MovementSegment は「型レベル」 と「内部処理」 で必要
 *   - L overlay の public output は別 type にして、 caller は本 type だけを見る
 *   - 思想: 「K view (= render only) が anchor id を含む、 L overlay (= 永続化素材) は含まない」 という責任分離
 *
 * 必要な対応:
 *   - caller (= L-4+ で UI 接続時) は本 view に「移動 約 30 分」 等の duration を出すために
 *     K view の location 名と本 view の duration を **transitionIndex で join** する
 *   - K view の `MovementTransitionView.key = transition_${index}_${fromNodeId}_${toNodeId}` から
 *     index を抽出する helper `extractTransitionIndexFromKViewKey` を提供 (= 後述)
 */
export type OverlaySegmentView = OverlaySegmentResolvedView | OverlaySegmentUnresolvedView;

export interface OverlaySegmentResolvedView {
  readonly timingStatus: "resolved";
  readonly transitionIndex: number;
  readonly estimatedDurationMin: number;
  readonly modeCandidate: TransportModeCandidate;
  readonly source: Exclude<TransportProvider, "none">;
  readonly confidence: MovementConfidence;
  readonly privacyClass: MovementPrivacyClass;
  /** 距離 (m)、 内部 telemetry 用、 UI 非露出。 caller が log out するかは別判断 */
  readonly distanceM?: number;
}

export interface OverlaySegmentUnresolvedView {
  readonly timingStatus: "unresolved";
  readonly transitionIndex: number;
  readonly unresolvedReason: MovementUnresolvedReason;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-3c hardening: Privacy Assertion (= sanitize 機械保証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Overlay 出力に PII が混入していないことを runtime に機械保証する assertion (= L-3c 修正案)。
 *
 * Check 内容:
 *   - segment view の key set に `fromNodeId` / `toNodeId` / `fromLocationText` / `toLocationText`
 *     / `sensitiveProximity` / `title` / `userId` / `anchorId` 等 PII field が **存在しない**
 *   - result top-level に同 PII field が **存在しない**
 *   - 違反検出時は `OverlayPrivacyAssertionError` を throw
 *
 * 用途:
 *   - resolveMovementSegmentOverlay の最終段で必ず呼ぶ (= 出荷品質保証)
 *   - test での assertion (= regression guard)
 *
 * 制約:
 *   - 本関数は **runtime check**、 type system での PII 不存在は OverlaySegmentView 型で別途保証
 *   - 「runtime check + type 構造」 の二重防御
 */
const FORBIDDEN_KEYS_IN_SEGMENT: ReadonlyArray<string> = [
  "fromNodeId",
  "toNodeId",
  "fromLocationText",
  "toLocationText",
  "sensitiveProximity",
  "title",
  "locationText",
  "userId",
  "anchorId",
];

const FORBIDDEN_KEYS_IN_RESULT_TOP: ReadonlyArray<string> = [
  ...FORBIDDEN_KEYS_IN_SEGMENT,
];

export class OverlayPrivacyAssertionError extends Error {
  readonly violation: string;
  constructor(violation: string, detail?: string) {
    const suffix = detail ? ` (${detail})` : "";
    super(`[L-3c] Overlay privacy assertion violated: ${violation}${suffix}`);
    this.name = "OverlayPrivacyAssertionError";
    this.violation = violation;
  }
}

function assertSegmentViewPrivacy(view: OverlaySegmentView): void {
  const keys = Object.keys(view);
  for (const forbidden of FORBIDDEN_KEYS_IN_SEGMENT) {
    if (keys.includes(forbidden)) {
      throw new OverlayPrivacyAssertionError(
        "segment_view_contains_pii_field",
        `key="${forbidden}" found in segment view`,
      );
    }
  }
}

/**
 * Overlay の最終 result が PII を含まないことを runtime に assertion する。
 * resolveMovementSegmentOverlay の出荷直前に必ず呼ぶ。
 */
export function assertOverlayResultCompliance(result: OverlayResult): void {
  // (1) top-level field check
  const topKeys = Object.keys(result);
  for (const forbidden of FORBIDDEN_KEYS_IN_RESULT_TOP) {
    if (topKeys.includes(forbidden)) {
      throw new OverlayPrivacyAssertionError(
        "result_top_contains_pii_field",
        `key="${forbidden}"`,
      );
    }
  }

  // (2) transitionKey 形式 check (= L-3c 2A、 非 PII 形式に固定)
  for (const transitionKey of result.segmentsByTransitionKey.keys()) {
    if (!/^transition_\d+$/.test(transitionKey)) {
      throw new OverlayPrivacyAssertionError(
        "transition_key_format_violation",
        `key="${transitionKey}" does not match /^transition_\\d+$/`,
      );
    }
  }

  // (3) 各 segment view の field check
  for (const outcome of result.segmentsByTransitionKey.values()) {
    if (outcome.ok) {
      assertSegmentViewPrivacy(outcome.segment);
    }
    // ok=false (= internal_error etc.) は { ok, reason } のみで PII を持たない構造
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-3c hardening: K view との bridge (= caller が transitionIndex で join するため)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * K view の `MovementTransitionView.key` (= `transition_${index}_${fromNodeId}_${toNodeId}`)
 * から transitionIndex を抽出する helper。
 *
 * caller は K view の location 名と L overlay の duration を join する際に、
 * 本 helper で K view key から index を取り出し、 L overlay の `transition_${index}` と一致確認できる。
 *
 * @returns index (= number) or null if format mismatch
 */
export function extractTransitionIndexFromKViewKey(kViewKey: string): number | null {
  const match = /^transition_(\d+)_/.exec(kViewKey);
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input / Output types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Overlay input。
 */
export interface OverlayInput {
  /**
   * K phase の DayGraph (= 同期 pure で生成済)。
   *
   * 本 overlay は本 graph を **読み取りのみ**、 mutate しない。
   * L-3c hardening: JSON snapshot 比較 + 配列 reference 同一性 二重 check で機械保証。
   */
  readonly graph: DayGraph;

  /**
   * anchorId → coords の map。
   * caller (= L-3+ で MapTab integration 時に既存 geocode 結果を渡す) が用意する。
   * 空 Map なら全 transition が unresolved。
   */
  readonly coordsByAnchorId: ReadonlyMap<
    string,
    { readonly lat: number; readonly lng: number }
  >;

  /**
   * Privacy class を transitionIndex 別に上書きする optional map (= L-3c で key 変更)。
   * default は K phase の `sensitiveProximity` から自動計算。
   *
   * **L-3c 強化**: K の `sensitiveProximity = true` は片方 / 両方を区別せず、
   * overlay 内で全て `sensitive_both` に倒す (= 保守的、 cascade で必ず unresolved)。
   * 細分化したい場合は caller が本 map で override する pattern。
   */
  readonly privacyClassByTransitionIndex?: ReadonlyMap<number, MovementPrivacyClass>;

  /**
   * Manual override map (= transitionIndex 別の user-explicit duration)。
   * 該当 index に override が存在する場合のみ manual_user provider が試行 (= L-3a 構造的 skip)。
   */
  readonly overridesByTransitionIndex?: ReadonlyMap<number, ManualOverride>;

  /** Cascade options (= provider 配列、 順序が cascade 試行順を決定) */
  readonly cascadeOptions: CascadeOptions;

  /** Opaque tracing id (= L-4+ telemetry sink 用 hook、 L-3 では unused) */
  readonly tracingId?: string;
}

/**
 * Per-transition outcome — discriminated union。
 *
 * ok=true → sanitize 済 OverlaySegmentView + trace
 * ok=false → 事前判定 failure (= 内部 error 等、 PII なし)
 */
export type OverlayTransitionOutcome =
  | {
      readonly ok: true;
      readonly segment: OverlaySegmentView;
      readonly trace: CascadeTrace;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "from_anchor_id_missing"
        | "to_anchor_id_missing"
        | "internal_error";
    };

/**
 * Overlay result (= top-level、 PII-free structural 保証)。
 */
export interface OverlayResult {
  /**
   * transitionKey (= `transition_${index}`) → outcome の map。
   */
  readonly segmentsByTransitionKey: ReadonlyMap<string, OverlayTransitionOutcome>;
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
  readonly internalErrorCount: number;
  readonly tracingId?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Privacy class default 計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Transition から default privacy class を計算する pure helper。
 *
 * 規則:
 *   - sensitiveProximity === true → sensitive_both (= K では片方/両方区別なし、 保守的に倒す)
 *   - 両端 anchor の coords どちらも欠落 → location_unknown
 *   - 片方欠落 → location_unknown (= 安全側)
 *   - 両端揃い → normal
 *
 * L-3c 注: cascade は `sensitive_adjacent` も unresolved にするため、
 *           caller が privacyClassByTransitionIndex で sensitive_adjacent を指定しても
 *           cascade は早期 unresolved を返す。
 */
function computeDefaultPrivacyClass(
  transition: MovementTransition,
  fromCoords: { lat: number; lng: number } | undefined,
  toCoords: { lat: number; lng: number } | undefined,
): MovementPrivacyClass {
  if (transition.sensitiveProximity) {
    return "sensitive_both";
  }
  if (!fromCoords || !toCoords) {
    return "location_unknown";
  }
  return "normal";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventNode anchorId 逆引き (= 内部処理のみ、 overlay output 非露出)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function findAnchorIdByNodeId(graph: DayGraph, nodeId: string): string | undefined {
  for (const node of graph.nodes) {
    if (node.kind === "event" && node.id === nodeId) {
      return node.anchorId;
    }
  }
  return undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-3c hardening: Sanitize — MovementSegment → OverlaySegmentView 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Cascade result の MovementSegmentResolved を OverlaySegmentResolvedView に変換 (= sanitize)。
 *
 * 削除する field:
 *   - fromNodeId / toNodeId (= anchor id 相当、 L-3c 必須 sanitize)
 *   - fromLocationText / toLocationText (= raw 値、 L-3c 必須 sanitize)
 *   - sensitiveProximity (= 内部 flag)
 *   - slackAnalysis (= L-1 type にあるが overlay output には不要、 L-3 では unused)
 */
function sanitizeResolvedSegment(
  cascadeSegment: {
    readonly estimatedDurationMin: number;
    readonly modeCandidate: TransportModeCandidate;
    readonly source: Exclude<TransportProvider, "none">;
    readonly confidence: MovementConfidence;
    readonly privacyClass: MovementPrivacyClass;
    readonly distanceM?: number;
  },
  transitionIndex: number,
): OverlaySegmentResolvedView {
  const view: OverlaySegmentResolvedView = {
    timingStatus: "resolved",
    transitionIndex,
    estimatedDurationMin: cascadeSegment.estimatedDurationMin,
    modeCandidate: cascadeSegment.modeCandidate,
    source: cascadeSegment.source,
    confidence: cascadeSegment.confidence,
    privacyClass: cascadeSegment.privacyClass,
    ...(cascadeSegment.distanceM !== undefined
      ? { distanceM: cascadeSegment.distanceM }
      : {}),
  };
  return view;
}

/**
 * Unresolved の場合の sanitize (= overlay layer での view 生成)。
 */
function buildUnresolvedView(
  transitionIndex: number,
  reason: MovementUnresolvedReason,
): OverlaySegmentUnresolvedView {
  return {
    timingStatus: "unresolved",
    transitionIndex,
    unresolvedReason: reason,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-transition resolution (= isolation 単位)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function resolveSingleTransition(
  input: OverlayInput,
  transition: MovementTransition,
  index: number,
): Promise<OverlayTransitionOutcome> {
  // anchorId 逆引き (= 内部処理のみ、 overlay output に出さない)
  const fromAnchorId = findAnchorIdByNodeId(input.graph, transition.fromNodeId);
  if (!fromAnchorId) {
    return { ok: false, reason: "from_anchor_id_missing" };
  }
  const toAnchorId = findAnchorIdByNodeId(input.graph, transition.toNodeId);
  if (!toAnchorId) {
    return { ok: false, reason: "to_anchor_id_missing" };
  }

  // Coords 取得
  const fromCoords = input.coordsByAnchorId.get(fromAnchorId);
  const toCoords = input.coordsByAnchorId.get(toAnchorId);

  // Privacy class 決定 (= override 優先、 default は自動計算)
  const overrideClass = input.privacyClassByTransitionIndex?.get(index);
  const privacyClass =
    overrideClass ?? computeDefaultPrivacyClass(transition, fromCoords, toCoords);

  // Manual override 取得
  const manualOverride = input.overridesByTransitionIndex?.get(index);

  // Cascade input 組み立て
  // segmentBase に fromLocationText / toLocationText を渡すが、 これは provider 内部の話。
  // overlay 出力 (= OverlaySegmentView) には sanitize で除去される。
  const cascadeInput: CascadeInput = {
    resolution: {
      privacyClass,
      ...(fromCoords ? { fromCoords } : {}),
      ...(toCoords ? { toCoords } : {}),
    },
    segmentBase: {
      fromNodeId: transition.fromNodeId,
      toNodeId: transition.toNodeId,
      fromLocationText: transition.fromLocationText,
      toLocationText: transition.toLocationText,
      sensitiveProximity: transition.sensitiveProximity,
    },
    ...(manualOverride ? { manualOverride } : {}),
  };

  // Cascade 実行
  const result = await runCascade(cascadeInput, input.cascadeOptions);

  // L-3c sanitize: cascade 出力 → OverlaySegmentView
  if (result.ok) {
    if (result.segment.timingStatus !== "resolved") {
      // type-level に到達不能 (= cascade ok=true は resolved 限定)、 防御
      const view = buildUnresolvedView(index, "no_provider_available");
      return { ok: true, segment: view, trace: result.trace };
    }
    const view = sanitizeResolvedSegment(
      {
        estimatedDurationMin: result.segment.estimatedDurationMin,
        modeCandidate: result.segment.modeCandidate,
        source: result.segment.source,
        confidence: result.segment.confidence,
        privacyClass: result.segment.privacyClass,
        distanceM: result.segment.distanceM,
      },
      index,
    );
    return { ok: true, segment: view, trace: result.trace };
  }

  // Unresolved view 構築
  const view = buildUnresolvedView(index, result.reason);
  return { ok: true, segment: view, trace: result.trace };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// L-3c hardening: Graph immutability — JSON snapshot 比較 + 配列 reference
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class MovementOverlayMutationError extends Error {
  readonly violation: string;
  constructor(violation: string, detail?: string) {
    const suffix = detail ? ` (${detail})` : "";
    super(`[L-3c] Overlay violated graph immutability: ${violation}${suffix}`);
    this.name = "MovementOverlayMutationError";
    this.violation = violation;
  }
}

interface ImmutabilityCheckpoint {
  readonly snapshotId: string;
  readonly jsonSnapshot: string;
  readonly nodesLength: number;
  readonly transitionsLength: number;
  readonly edgesLength: number;
  readonly firstNodeRef: unknown;
  readonly firstTransitionRef: unknown;
}

function captureImmutabilityCheckpoint(graph: DayGraph): ImmutabilityCheckpoint {
  return {
    snapshotId: graph.snapshotId,
    jsonSnapshot: JSON.stringify(graph),
    nodesLength: graph.nodes.length,
    transitionsLength: graph.transitions.length,
    edgesLength: graph.edges.length,
    firstNodeRef: graph.nodes[0],
    firstTransitionRef: graph.transitions[0],
  };
}

function assertImmutability(
  graph: DayGraph,
  checkpoint: ImmutabilityCheckpoint,
): void {
  // (1) 早期検出: snapshotId / 配列長 / 第一要素 reference
  if (graph.snapshotId !== checkpoint.snapshotId) {
    throw new MovementOverlayMutationError(
      "snapshot_id_changed",
      `before=${checkpoint.snapshotId}, after=${graph.snapshotId}`,
    );
  }
  if (graph.nodes.length !== checkpoint.nodesLength) {
    throw new MovementOverlayMutationError(
      "nodes_length_changed",
      `before=${checkpoint.nodesLength}, after=${graph.nodes.length}`,
    );
  }
  if (graph.transitions.length !== checkpoint.transitionsLength) {
    throw new MovementOverlayMutationError(
      "transitions_length_changed",
      `before=${checkpoint.transitionsLength}, after=${graph.transitions.length}`,
    );
  }
  if (graph.edges.length !== checkpoint.edgesLength) {
    throw new MovementOverlayMutationError(
      "edges_length_changed",
      `before=${checkpoint.edgesLength}, after=${graph.edges.length}`,
    );
  }
  if (graph.nodes[0] !== checkpoint.firstNodeRef) {
    throw new MovementOverlayMutationError("first_node_reference_changed");
  }
  if (graph.transitions[0] !== checkpoint.firstTransitionRef) {
    throw new MovementOverlayMutationError("first_transition_reference_changed");
  }

  // (2) 完全 deep equality: JSON.stringify 比較 (= 内部 field mutation を検出)
  const currentJson = JSON.stringify(graph);
  if (currentJson !== checkpoint.jsonSnapshot) {
    throw new MovementOverlayMutationError(
      "deep_structure_changed",
      "JSON.stringify mismatch — internal field mutation detected",
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: resolveMovementSegmentOverlay
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function resolveMovementSegmentOverlay(
  input: OverlayInput,
): Promise<OverlayResult> {
  // L-3c hardening: Immutability checkpoint (= JSON snapshot + 配列長 + reference)
  const checkpoint = captureImmutabilityCheckpoint(input.graph);

  // 各 transition を並列実行 + per-transition isolation
  const tasks = input.graph.transitions.map((transition, index) =>
    resolveSingleTransition(input, transition, index)
      .catch((): OverlayTransitionOutcome => ({
        ok: false,
        reason: "internal_error",
      })),
  );

  const outcomes = await Promise.all(tasks);

  // L-3c hardening: 強化 immutability assertion (= JSON deep + reference + length)
  assertImmutability(input.graph, checkpoint);

  // Result 集計
  const segmentsByTransitionKey = new Map<string, OverlayTransitionOutcome>();
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let internalErrorCount = 0;

  input.graph.transitions.forEach((_transition, index) => {
    const transitionKey = buildTransitionKey(index); // L-3c: 非 PII 形式
    const outcome = outcomes[index]!;
    segmentsByTransitionKey.set(transitionKey, outcome);

    if (outcome.ok) {
      if (outcome.segment.timingStatus === "resolved") {
        resolvedCount++;
      } else {
        unresolvedCount++;
      }
    } else {
      internalErrorCount++;
    }
  });

  const result: OverlayResult = {
    segmentsByTransitionKey,
    resolvedCount,
    unresolvedCount,
    internalErrorCount,
    ...(input.tracingId !== undefined ? { tracingId: input.tracingId } : {}),
  };

  // L-3c hardening: 出荷直前 privacy assertion (= runtime structural 保証)
  assertOverlayResultCompliance(result);

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Re-exports (= L-3a へのアクセサ統一)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type {
  CascadeInput,
  CascadeOptions,
  CascadeTrace,
  ManualOverride,
} from "./cascadeOrchestrator";

export type {
  MovementUnresolvedReason,
  TransportProvider,
  TransportResolutionProvider,
};
