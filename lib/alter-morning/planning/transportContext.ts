/**
 * transportContext — Transport rendering 基盤の pure helpers
 *
 * CEO 2026-04-28 PR #40 Option B 採用:
 *   - events[*].transport を dayConditions.mainTransport に lift
 *   - 1-event plan でも home/current → first_event の travel item を生成
 *   - Home anchor 優先順位: 現在地 → 登録済み自宅 → null（hallucination 禁止）
 *
 * 本ファイルは pure helper のみを export する。
 *   - HOME_TRAVEL_SENTINEL_ID: synthetic home segment の fromEventId
 *   - parseJapaneseTransportToVc: 「電車」「徒歩」等 → vcTypes.TransportMode
 *   - mapVcTransportToPlanMode: vcTypes.TransportMode → transport/types.TransportMode
 *   - deriveDayTransport: events[*].transport から { vc, plan } を取り出す
 *   - resolveHomeAnchor: current/home 座標から HomeAnchor | null を解決
 *
 * 設計原則:
 *   - 副作用なし、env / flag を読まない
 *   - 引数 explicit、返り値 deterministic
 *   - 上位（legacyAdapter / selection route）から呼ばれる
 */

import type { Event as ComprehensionEvent } from "../comprehension/eventSchema";
import type { TransportMode as PlanTransportMode } from "../transport/types";
import type { TransportMode as VcTransportMode } from "@/app/(culcept)/calendar/_lib/vcTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOME_TRAVEL_SENTINEL_ID
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 1-event plan で「home/current → first_event」の synthetic travel segment を
// 表現するために使う特殊 event_id。実 event とは衝突しない（"__" prefix）。
//
// 用途:
//   - buildTransportSegments が segment.fromEventId にこの値を設定する
//   - synthesizeTravelItems が segment.fromEventId === HOME_TRAVEL_SENTINEL_ID を
//     検出して homeAnchor.label を from に使う
//   - interleaveTravelItems が entry.afterEventId === HOME_TRAVEL_SENTINEL_ID を
//     検出して eventItems の先頭に prepend する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const HOME_TRAVEL_SENTINEL_ID = "__home__";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HomeAnchor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type HomeAnchorSource = "current" | "registered_home";

export interface HomeAnchor {
  lat: number;
  lng: number;
  /** 表示ラベル（"現在地" or "自宅"）。出所と同期する */
  label: "現在地" | "自宅";
  /** どちらの coordinate から由来したか（telemetry / debug 用） */
  source: HomeAnchorSource;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Japanese transport word → vcTypes.TransportMode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// answerBinder.ts:parseTransport は「電車 / 徒歩 / 自転車 / 車 / バス」の生文字を
// events[idx].transport に書き込む。本関数はそれを vcTypes.TransportMode に正規化する。
//
// 既存 mappers との整合:
//   sufficiencyGate.ts L46 / morningProtocol.ts L198 / routesApiClient.ts L105 /
//   travelTimeEngine.ts L610 / deltaClassifier.ts L86 全て同じ vcTypes 結果に到達する。
//   本関数はその挙動を踏襲する。
//
// 決定論:
//   - NFKC 正規化
//   - 検出順は specific → general（電車 / 地下鉄 / JR が車両系で先勝ち）
//   - 不明なら undefined
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function parseJapaneseTransportToVc(
  raw: string,
): VcTransportMode | undefined {
  const s = raw.normalize("NFKC");
  // 公共交通: 電車 / 地下鉄 / JR / 私鉄
  if (/電車|地下鉄|JR|私鉄/i.test(s)) return "train";
  // バス（公共交通だが vcTypes で別 tag）
  if (/バス/.test(s)) return "bus";
  // 徒歩
  if (/徒歩|歩き|歩いて/.test(s)) return "walk";
  // 自転車
  if (/自転車|チャリ/.test(s)) return "bicycle";
  // タクシー / Uber は taxi
  if (/タクシー|uber/i.test(s)) return "taxi";
  // 自家用車
  if (/車|クルマ/.test(s)) return "car";
  return undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// vcTypes.TransportMode → transport/types.TransportMode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 二つの union が別ファイルに存在する architectural debt:
//   vcTypes.TransportMode      = "walk"|"bicycle"|"train"|"car"|"taxi"|"bus"|"motorcycle"|"plane"
//   transport/types.TransportMode = "walk"|"car"|"public_transit"|"bicycle"|"taxi"|"unknown"
//
// 本関数は前者から後者への正規化を行う（plan layer に渡すための変換）。
// selection/route.ts の既存 mapVcTransportToPlanTransport を移行（一元化）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function mapVcTransportToPlanMode(
  mode: VcTransportMode | undefined,
): PlanTransportMode | undefined {
  if (mode === undefined) return undefined;
  switch (mode) {
    case "walk":
      return "walk";
    case "bicycle":
      return "bicycle";
    case "car":
    case "motorcycle":
      return "car";
    case "taxi":
      return "taxi";
    case "train":
    case "bus":
      // 公共交通手段は "public_transit" にまとめる (transport/types のセマンティクス)
      return "public_transit";
    case "plane":
      // 飛行機は plan layer では未対応 → unknown 扱い
      return "unknown";
    default: {
      // exhaustive check fallback
      const _exhaustive: never = mode;
      void _exhaustive;
      return "unknown";
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// deriveDayTransport — events[*].transport から day-level 既定値を導出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計:
//   - events[0..n] を順に scan。最初の non-null transport を採用
//   - 「Phase 1 では per-segment 推定なし」の方針に従い、day-level に集約
//   - vc / plan 両形式を返す（dayConditions.mainTransport は vc、TransportSegment.mode は plan）
//
// CEO 2026-04-28: events[*].transport が orphan field だった真因を
// この関数で「dayConditions に lift する正規経路」として明示する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DerivedTransport {
  /** dayConditions.mainTransport にセットする vcTypes 形 */
  vc: VcTransportMode;
  /** TransportSegment.mode / buildPlanAndSegments.mainTransport に渡す plan 形 */
  plan: PlanTransportMode;
}

export function deriveDayTransport(
  events: ReadonlyArray<ComprehensionEvent>,
): DerivedTransport | null {
  for (const ev of events) {
    if (!ev.transport) continue;
    const vc = parseJapaneseTransportToVc(ev.transport);
    if (!vc) continue;
    const plan = mapVcTransportToPlanMode(vc);
    if (!plan) continue;
    return { vc, plan };
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// resolveHomeAnchor — 現在地 → 自宅 → null の優先解決
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO 2026-04-28 directive:
//   1. 現在地座標 (browser geolocation)
//   2. 登録済み自宅座標 (DB baseline_home_lat/lng)
//   3. どちらもない場合は null（travel item を出さない）
//
// hallucination 防止:
//   - lat/lng が finite number でない場合は採用しない
//   - 0,0 (赤道海上) は実際の home としてあり得る確率が低いため採用するが、
//     上位 buildTransportSegments の estimateNeutralDurationMin が ≤0.2km で null を返すため
//     結局 travel item は生成されない（safety net）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ResolveHomeAnchorInput {
  currentLat?: number | null;
  currentLng?: number | null;
  homeLat?: number | null;
  homeLng?: number | null;
}

function isFiniteCoord(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function resolveHomeAnchor(
  input: ResolveHomeAnchorInput,
): HomeAnchor | null {
  // Priority 1: current location
  if (isFiniteCoord(input.currentLat) && isFiniteCoord(input.currentLng)) {
    return {
      lat: input.currentLat,
      lng: input.currentLng,
      label: "現在地",
      source: "current",
    };
  }
  // Priority 2: registered home
  if (isFiniteCoord(input.homeLat) && isFiniteCoord(input.homeLng)) {
    return {
      lat: input.homeLat,
      lng: input.homeLng,
      label: "自宅",
      source: "registered_home",
    };
  }
  // Priority 3: nothing → no travel item (hallucination 防止)
  return null;
}
