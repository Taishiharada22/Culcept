/**
 * Phase 3-L-2 (pure) — HeuristicDistanceProvider
 *
 * 役割:
 *   distance heuristic で MovementSegment を resolved 化する provider 実装。
 *   既存の alter-morning durationHeuristic (= W3-PR-10 Scope A、 CEO 2026-04-24 確定) を reuse。
 *
 * 思想:
 *   - **API なし** で動く (= 3-L MVP 最小価値の検証手段)
 *   - **mode 推定しない** (= mode は常に "unknown" 候補で confidence "low")
 *   - **privacy first** (= sensitive_both / location_unknown は呼ばずに unresolved を返す)
 *   - **fail-safe** (= heuristic が null を返したら heuristic_failed で unresolved)
 *
 * Reuse 確認 (= 既存資産):
 *   - lib/alter-morning/transport/durationHeuristic.ts
 *   - signature: `estimateNeutralDurationMin(fromCoords, toCoords) → number | null`
 *   - 段階テーブル: ≤0.2km null / ≤1km 10min / ... / >30km 90min
 *   - 既存実装は CEO 確定済。 本 file は import 経路のみ追加 (= 既存 file 無変更)
 *
 * L-2-pure scope (= 2026-05-22 CEO PARTIAL 承認):
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用
 *   - DB / env / package / dependency 変更 0
 *   - UI 変更 0
 *
 * 参照:
 *   - docs/alter-plan-phase3-l-transport-design.md v0.2 §4.7 / §8
 *   - docs/alter-plan-phase3-l-0-readiness-audit.md
 */

import {
  estimateNeutralDurationMin,
  type Coords,
} from "@/lib/alter-morning/transport/durationHeuristic";

import type {
  MovementResolutionInput,
  MovementResolutionResult,
  MovementSegmentResolved,
  TransportResolutionProvider,
} from "./transportTypes";
import { assertMovementSegmentCompliance } from "./transportIntegrityContract";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Haversine helper (= 距離計算、 後方互換のため別 export しない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance (m)。 distanceM field を MovementSegmentResolved に書く用。
 * heuristic 内部の値とは別計算 (= 段階テーブルの境界判定とは独立)。
 *
 * NaN / invalid coords には NaN を返す (= caller 側で fail-safe 判定)。
 */
function haversineDistanceMeters(a: Coords, b: Coords): number {
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return Number.NaN;
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return Number.NaN;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory options
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * HeuristicDistanceProvider の resolved 出力に書く base segment 情報。
 *
 * Provider は input の coords しか持たないため、 fromNodeId / toNodeId 等の
 * MovementTransition base field は caller (= L-3+ build pipeline) が「外側」 から
 * 注入する必要がある。 本 provider は input から直接 segment を組み立てる時の
 * default 情報を constructor で受け取る pattern を採る。
 *
 * MVP では single-call test 用に inline で渡せるようにしておく。
 */
export interface HeuristicDistanceProviderOptions {
  /**
   * 解決対象 segment の base 情報 (= K の MovementTransition 由来 field)。
   * caller が segment ごとに provider instance を作るより、 resolveDuration の
   * input 拡張で渡す pattern が望ましい。
   *
   * L-2-pure 段階では「base はテスト fixture / L-3+ pipeline から渡される」
   * 想定で、 factory は base を直接持たず、 resolve 時に input.segmentBase で受ける。
   */
  readonly id?: never; // sentinel to discourage misuse
}

/**
 * resolveDuration の拡張 input。
 *
 * MovementResolutionInput では base segment 情報 (= fromNodeId / toNodeId 等) を
 * 渡せないため、 provider 実装側で受ける用の input shape を定義する。
 *
 * 設計選択:
 *   - L-1 type の MovementResolutionInput を変えると abstraction が壊れる
 *   - そこで provider 実装側で「自分が読む input shape」 を持つ
 *   - caller (= L-3+) は両方を渡せばよい
 */
export interface HeuristicResolveInput extends MovementResolutionInput {
  /**
   * segment base — caller が MovementTransition 由来 field を渡す。
   * provider はこれを resolved segment に転写する。
   */
  readonly segmentBase: {
    readonly fromNodeId: string;
    readonly toNodeId: string;
    readonly fromLocationText?: string;
    readonly toLocationText?: string;
    readonly sensitiveProximity: boolean;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * HeuristicDistanceProvider を生成する factory。
 *
 * 挙動:
 *   1. privacy guard (= sensitive_both / location_unknown は即 unresolved)
 *   2. coords missing → location_unknown
 *   3. estimateNeutralDurationMin 呼出 → null なら heuristic_failed
 *   4. number → resolved segment 構築 (= confidence low / heuristic_distance_only)
 *
 * Note: 本 factory は state-less。 instance は singleton として再利用可能。
 *
 * 戻り値の resolveDuration は MovementResolutionInput を受け取る (= L-1 interface 準拠)。
 * 但し L-2 では segment base を渡せないため、 caller は HeuristicResolveInput 互換の
 * 拡張入力で呼ぶ必要がある (= cast / 型 narrowing で対応)。
 */
export function createHeuristicDistanceProvider(): TransportResolutionProvider {
  return {
    id: "heuristic_distance",
    health: "healthy",
    async resolveDuration(
      input: MovementResolutionInput,
    ): Promise<MovementResolutionResult> {
      // 1. Privacy guard — sensitive_both は API 呼ばないのと同様 heuristic も呼ばない
      if (input.privacyClass === "sensitive_both") {
        return { ok: false, reason: "sensitive_proximity" };
      }
      // location_unknown は coords が無い前提
      if (input.privacyClass === "location_unknown") {
        return { ok: false, reason: "location_unknown" };
      }

      // 2. Coords missing
      if (!input.fromCoords || !input.toCoords) {
        return { ok: false, reason: "location_unknown" };
      }

      // 3. Heuristic call
      const durationMin = estimateNeutralDurationMin(
        input.fromCoords,
        input.toCoords,
      );
      if (durationMin === null) {
        return { ok: false, reason: "heuristic_failed" };
      }

      // 4. Build resolved segment
      // base 情報 (= fromNodeId 等) は caller が input.segmentBase で渡す約束。
      // L-1 MovementResolutionInput には segmentBase が無いため、 narrow を試みる。
      const heuristicInput = input as HeuristicResolveInput;
      const base = heuristicInput.segmentBase;
      if (!base) {
        // base 無しでは MovementSegmentResolved を組めない → fail-safe
        return { ok: false, reason: "no_provider_available" };
      }

      const distanceM = haversineDistanceMeters(input.fromCoords, input.toCoords);

      const segment: MovementSegmentResolved = {
        fromNodeId: base.fromNodeId,
        toNodeId: base.toNodeId,
        fromLocationText: base.fromLocationText,
        toLocationText: base.toLocationText,
        sensitiveProximity: base.sensitiveProximity,
        timingStatus: "resolved",
        estimatedDurationMin: durationMin,
        modeCandidate: {
          mode: "unknown",
          confidence: {
            level: "low",
            reason: "heuristic_distance_only",
          },
        },
        source: "heuristic_distance",
        confidence: {
          level: "low",
          reason: "heuristic_distance_only",
        },
        privacyClass: input.privacyClass,
        ...(Number.isFinite(distanceM) ? { distanceM } : {}),
      };

      // self-check (= 構造的不変性、 出荷品質保証)
      assertMovementSegmentCompliance(segment);

      return { ok: true, segment };
    },
  };
}
