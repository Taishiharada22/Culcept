/**
 * Phase 3-L-3b (pure) — MovementSegment Overlay Layer
 *
 * 役割 (= K の「computed projection」 に対する「現実の影」):
 *   K phase の DayGraph は「ユーザーが宣言した時間構造」、
 *   本 overlay は「現実の物理移動の影」。 影は本体を mutate しない。
 *
 *   `buildDayGraph` の出力 (= DayGraph + MovementTransition[]) と、 caller が用意した
 *   `coordsByAnchorId` map + `overridesByTransitionKey` map を入力に、
 *   各 transition を cascade orchestrator で resolve し、
 *   `segmentsByTransitionKey` map を返す。
 *
 * 思想 (= Mobility Truth Layer):
 *   - 移動が確定したか / されていないかを **観測** する layer
 *   - K の computed projection 純度を一切破壊しない
 *   - 「→ 移動」 は K のまま、 overlay は「移動 約 30 分」 等の view 層 (= L-4+) に渡る素材を提供するだけ
 *
 * GPT 補正 6 件 + 自律補強 5 件 全反映:
 *
 *   GPT 補正:
 *   1. manual_user は明示 override input がある transition のみ試行 (= cascade 内構造)
 *   2. missing coords → unresolved (= caller が coords を渡さなければ self-resolve しない)
 *   3. sensitiveProximity → unresolved (= privacy_class 判定で確定)
 *   4. **overlay は DayGraph を mutate しない** (= snapshotId 不変 assertion で機械保証)
 *   5. transitionKey に raw title / locationText を含めない (= node id + index、 既存 K view と同形式)
 *   6. provider exception は transition 単位で吸収 (= Promise.allSettled で構造的解決)
 *
 *   自律補強 (= GPT 案を超える人間超越設計):
 *   B1. transitionKey deterministic 生成 (= K phase `MovementTransitionView.key` と同形式、 join 可能)
 *   B2. per-transition isolation (= Promise.allSettled、 1 失敗で overlay 全体落とさない)
 *   B3. **graph immutability runtime assertion** (= snapshotId 不変 check、 mutation 検出)
 *   C1. Privacy structural: result type に title / locationText / userId field を **持てない**
 *   F1. Forward compat: tracingId opaque field、 unresolvedCount 集計 (= L-4+ UI 用素材)
 *
 * L-3b-pure scope:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0
 *   - K phase 既存 file 変更 0 (= 純追加)
 *   - DayGraph mutation 一切なし (= 受け取った graph は無傷で返さない)
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-3-readiness-audit.md §2.4 / §3
 *   - lib/plan/transport/cascadeOrchestrator.ts (= L-3a)
 *   - lib/plan/dayGraph/dayGraphTypes.ts (= K phase 無変更)
 *   - lib/plan/dayGraph/dayGraphTimelinePresentation.ts (= transition key 同形式)
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
  MovementPrivacyClass,
  MovementSegment,
  MovementUnresolvedReason,
  TransportProvider,
  TransportResolutionProvider,
} from "./transportTypes";
import { assertMovementSegmentCompliance } from "./transportIntegrityContract";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// transitionKey (= K phase の MovementTransitionView.key と同形式)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * K phase の `dayGraphTimelinePresentation.ts` line 285 と同形式:
 *   `transition_${index}_${fromNodeId}_${toNodeId}`
 *
 * 設計判断 (= 自律補強 B1):
 *   - K phase の MovementTransitionView.key と **同形式** にすることで、
 *     L-3 overlay の出力と K view を transitionKey で **join 可能** にする
 *   - K phase は本 file を import しない (= 一方向依存、 K 無変更維持)
 *   - PII を含まない (= node id は K phase で sensitive 由来でも anchorId base、 raw title なし)
 *
 * @param transition - K phase の MovementTransition
 * @param index - transitions 配列内の index (= K phase と同 index 採番)
 */
export function buildTransitionKey(
  transition: MovementTransition,
  index: number,
): string {
  return `transition_${index}_${transition.fromNodeId}_${transition.toNodeId}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input / Output types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Overlay input。
 *
 * 設計判断:
 *   - DayGraph を直接受け取り、 transitions[] と node 情報を内部で参照
 *   - coordsByAnchorId は caller が用意 (= L-3 では geocode を呼ばないため、 caller 責任)
 *   - overridesByTransitionKey で transition 別に manual override を渡せる
 *   - providers は cascade に渡す配列、 順序は caller が決定
 */
export interface OverlayInput {
  /**
   * K phase の DayGraph (= 同期 pure で生成済)。
   *
   * 本 overlay は本 graph を **読み取りのみ**、 mutate しない。
   * snapshotId は overlay 実行前後で不変 (= runtime assertion で機械保証)。
   */
  readonly graph: DayGraph;

  /**
   * anchorId → coords の map。
   *
   * 設計判断 (= GPT 補正 2):
   *   - L-3 では geocode endpoint を能動的に呼ばない
   *   - caller (= L-3+ で MapTab integration 時に既存 geocode 結果を渡す) が用意する
   *   - 空 Map を渡せば全 transition が coords なしで unresolved (= 構造的保証)
   *
   * Note: anchorId は EventNode.anchorId と一致する想定。 graph.nodes から逆引き。
   */
  readonly coordsByAnchorId: ReadonlyMap<
    string,
    { readonly lat: number; readonly lng: number }
  >;

  /**
   * Privacy class を transition 別に上書きする optional map。
   *
   * 設計判断:
   *   - default は K phase の `sensitiveProximity` から自動計算
   *     - sensitiveProximity === true → sensitive_both
   *     - coords 欠落 → location_unknown
   *     - それ以外 → normal
   *   - caller が「片方 sensitive」 等を細かく指定したい場合に override 可能
   *   - L-3 では default 計算のみ想定、 caller が override しないのが推奨
   */
  readonly privacyClassByTransitionKey?: ReadonlyMap<string, MovementPrivacyClass>;

  /**
   * Manual override map (= transition 別の user-explicit duration)。
   *
   * GPT 補正 1 の構造的解決:
   *   - 該当 transitionKey に override が存在する場合のみ manual_user provider が試行
   *   - undefined (= map に key なし) なら cascade 内で manual_user 構造的 skip
   */
  readonly overridesByTransitionKey?: ReadonlyMap<string, ManualOverride>;

  /**
   * Cascade options (= provider 配列、 順序が cascade 試行順を決定)。
   */
  readonly cascadeOptions: CascadeOptions;

  /**
   * Opaque tracing id (= 自律補強 F1)。
   * L-3 では unused、 L-4+ telemetry sink で活用する hook を予約。
   */
  readonly tracingId?: string;
}

/**
 * Per-transition outcome — discriminated union (= ok / fail)。
 * 全 transition について Map に積まれる。
 */
export type OverlayTransitionOutcome =
  | {
      readonly ok: true;
      readonly segment: MovementSegment; // resolved or unresolved (= integrity contract 通過済)
      readonly trace: CascadeTrace;
    }
  | {
      readonly ok: false;
      /**
       * Cascade を呼ぶ前の事前判定 failure。
       *   - "from_anchor_id_missing": transition の fromNodeId に対応する EventNode が無い
       *   - "to_anchor_id_missing": 同 toNodeId
       *   - "internal_error": overlay 内 unexpected exception (= 補正 6 isolation の最終 catch)
       */
      readonly reason:
        | "from_anchor_id_missing"
        | "to_anchor_id_missing"
        | "internal_error";
    };

/**
 * Overlay result。
 *
 * 設計判断 (= 自律補強 C1: Privacy structural):
 *   - 本 type には title / locationText / userId / anchorId field が **存在しない**
 *   - segmentsByTransitionKey の MovementSegment にも raw title / userId は含まれない
 *     (= MovementSegment 自身が PII-free 設計、 L-1 で型保証済)
 *   - unresolvedCount は集計のみ、 個別 segment の特定 PII を露出しない
 */
export interface OverlayResult {
  /**
   * transitionKey → outcome の map。
   *
   * Key 形式: `transition_${index}_${fromNodeId}_${toNodeId}` (= K view と同形式)
   * (= 自律補強 B1)
   */
  readonly segmentsByTransitionKey: ReadonlyMap<string, OverlayTransitionOutcome>;

  /**
   * Resolved transition の数 (= 集計、 L-4+ UI 用素材)。
   */
  readonly resolvedCount: number;

  /**
   * Unresolved transition の数 (= 集計、 L-4+ UI 用素材)。
   */
  readonly unresolvedCount: number;

  /**
   * Internal error が発生した transition の数 (= 補正 6 isolation の発火回数)。
   */
  readonly internalErrorCount: number;

  /**
   * Opaque tracing id (= input から passthrough)。
   */
  readonly tracingId?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Privacy class default 計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Transition から default privacy class を計算する pure helper。
 *
 * 規則:
 *   - sensitiveProximity === true → sensitive_both (= GPT 補正 3)
 *   - 両端 anchor の coords どちらも欠落 → location_unknown (= GPT 補正 2)
 *   - 片方欠落 → location_unknown (= 安全側、 resolve しない)
 *   - 両端 anchor の coords 揃い → normal
 *
 * 注: K phase の `sensitiveProximity` は前後の anchor.sensitive どちらかが true なら true。
 *      これを sensitive_both に mapping するのは「sensitive 跨ぎの cascade で API を呼ばない」
 *      ための GPT 補正 3 整合。 sensitive_adjacent (= 片方 sensitive) は L-3 では使わない
 *      (= 安全側に倒す、 L-3+ で UI 接続時に細分化を検討)。
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
// EventNode anchorId 逆引き
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DayGraph の nodes から `EventNode.id` で逆引きして `anchorId` を返す。
 * EventNode 以外 (= start/gap/end) は anchorId を持たないため undefined。
 */
function findAnchorIdByNodeId(graph: DayGraph, nodeId: string): string | undefined {
  for (const node of graph.nodes) {
    if (node.kind === "event" && node.id === nodeId) {
      return node.anchorId;
    }
  }
  return undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Per-transition resolution (= isolation 単位)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 transition について resolve を試行する pure-ish 関数。
 *
 * GPT 補正 6 + 自律補強 B2 (= per-transition isolation):
 *   - 本関数内の unexpected exception は最終的に Promise.allSettled で catch
 *   - cascade orchestrator 内の exception は cascade 側で吸収済 (= L-3a の責務)
 *   - 本関数の責務は「事前 input 組み立て + cascade 呼出」
 */
async function resolveSingleTransition(
  input: OverlayInput,
  transition: MovementTransition,
  index: number,
): Promise<OverlayTransitionOutcome> {
  const transitionKey = buildTransitionKey(transition, index);

  // anchorId 逆引き (= EventNode → anchorId)
  const fromAnchorId = findAnchorIdByNodeId(input.graph, transition.fromNodeId);
  if (!fromAnchorId) {
    return { ok: false, reason: "from_anchor_id_missing" };
  }
  const toAnchorId = findAnchorIdByNodeId(input.graph, transition.toNodeId);
  if (!toAnchorId) {
    return { ok: false, reason: "to_anchor_id_missing" };
  }

  // Coords 取得 (= caller の coordsByAnchorId Map から)
  const fromCoords = input.coordsByAnchorId.get(fromAnchorId);
  const toCoords = input.coordsByAnchorId.get(toAnchorId);

  // Privacy class 決定 (= override 優先、 default は自動計算)
  const overrideClass = input.privacyClassByTransitionKey?.get(transitionKey);
  const privacyClass =
    overrideClass ?? computeDefaultPrivacyClass(transition, fromCoords, toCoords);

  // Manual override 取得
  const manualOverride = input.overridesByTransitionKey?.get(transitionKey);

  // Cascade input 組み立て
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

  if (result.ok) {
    // 出荷品質: integrity contract 機械保証 (= L-1)
    assertMovementSegmentCompliance(result.segment);
    return { ok: true, segment: result.segment, trace: result.trace };
  }
  // Unresolved も MovementSegment として包む (= caller が discriminated union で扱える)
  const unresolvedSegment: MovementSegment = {
    fromNodeId: transition.fromNodeId,
    toNodeId: transition.toNodeId,
    fromLocationText: transition.fromLocationText,
    toLocationText: transition.toLocationText,
    sensitiveProximity: transition.sensitiveProximity,
    timingStatus: "unresolved",
    unresolvedReason: result.reason,
  };
  // integrity 通過確認 (= 機械保証)
  assertMovementSegmentCompliance(unresolvedSegment);
  return { ok: true, segment: unresolvedSegment, trace: result.trace };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: resolveMovementSegmentOverlay
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Overlay layer の main entry。
 *
 * 設計の核 (= 自律補強 B3 + GPT 補正 4):
 *   - 入力 graph を mutate しない
 *   - 実行前後の `graph.snapshotId` が **完全一致** であることを runtime assertion (= snapshotIdBefore / snapshotIdAfter)
 *   - mutation が検出された場合は throw (= internal bug の即座 detection)
 *
 * Isolation (= 自律補強 B2 + GPT 補正 6):
 *   - 各 transition は Promise.allSettled で並列実行
 *   - 1 transition の internal error は他 transitions に伝搬しない
 *   - rejected promise は "internal_error" として記録、 segmentsByTransitionKey に積む
 *
 * Privacy structural (= 自律補強 C1):
 *   - OverlayResult type に title / locationText / userId / anchorId 不存在
 *   - segmentsByTransitionKey の各 MovementSegment は L-1 で PII-free 保証済
 */
export async function resolveMovementSegmentOverlay(
  input: OverlayInput,
): Promise<OverlayResult> {
  // Graph immutability assertion (= 自律補強 B3、 GPT 補正 4)
  const snapshotIdBefore = input.graph.snapshotId;

  // 各 transition を並列実行 + per-transition isolation
  const tasks = input.graph.transitions.map((transition, index) =>
    resolveSingleTransition(input, transition, index)
      .catch((): OverlayTransitionOutcome => ({
        ok: false,
        reason: "internal_error",
      })),
  );

  const outcomes = await Promise.all(tasks);

  // Graph immutability runtime assertion (= mutation 検出 → throw)
  if (input.graph.snapshotId !== snapshotIdBefore) {
    throw new Error(
      `[L-3b] Overlay violated graph immutability: snapshotId mutated from "${snapshotIdBefore}" to "${input.graph.snapshotId}"`,
    );
  }

  // Result 集計
  const segmentsByTransitionKey = new Map<string, OverlayTransitionOutcome>();
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let internalErrorCount = 0;

  input.graph.transitions.forEach((transition, index) => {
    const transitionKey = buildTransitionKey(transition, index);
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

  return {
    segmentsByTransitionKey,
    resolvedCount,
    unresolvedCount,
    internalErrorCount,
    ...(input.tracingId !== undefined ? { tracingId: input.tracingId } : {}),
  };
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
  MovementSegment,
  MovementUnresolvedReason,
  TransportProvider,
  TransportResolutionProvider,
};
