/**
 * synthesizeTravelItems — W3-PR-10 Phase 2 Display Cache
 *
 * 位置づけ:
 *   canonical TransportSegment[] を Path A の UI 表示用 PlanItem(kind="travel") に
 *   射影する pure function。T1 原則（domain truth = segments / persisted PlanItem =
 *   display cache）を機械的に enforce するための変換層。
 *
 * 設計原則（CEO 確定 2026-04-23）:
 *   - **pure**: env / flag を読まない。side effect なし。
 *   - **決定論**: 同じ (segments, events) 入力で常に同じ出力。id は fromEventId /
 *     toEventId から派生（`travel__<from>__<to>`）。React reconciliation 安定。
 *   - **synthesize only**: この関数は travel item を生成するだけで、interleave は
 *     call-site（legacyAdapter / selection route）が責務。
 *   - **buildPlanAndSegmentsFromEvents に混ぜない**: Phase 1 の T2 原則を守る。
 *     公開 API は引き続き `buildPlanAndSegmentsFromEvents` と本関数の 2 本体制。
 *   - **flag 引数を持たない**: flag gating は caller 側で行う（synthesize を呼ぶか
 *     どうかの判断）。本関数は segments があれば travel を作る、無ければ [] を返す。
 *   - **id parse しない**: entry pair として afterEventId を side-channel で返し、
 *     interleave が id parse せずに済む構造にする（event_id に `__` を含む場合の事故回避）。
 *
 * 非責務:
 *   - Path B（insertTravelItems）との統合・不干渉
 *   - client 側 regenerateTravel の id 揺れ解消
 *   - Routes API による duration / distance 計算（estimatedDurationMin 由来で埋める）
 *   - mode 推定（segment.mode をそのまま使用）
 */

import type { Event as ComprehensionEvent } from "../comprehension/eventSchema";
import type { PlanItem } from "../types";
import type { TransportMode, TransportSegment } from "../transport/types";
import type { TransportMode as VcTransportMode } from "@/app/(culcept)/calendar/_lib/vcTypes";
// CEO 2026-04-28 Option B: HOME_TRAVEL_SENTINEL_ID を fromEventId に持つ segment は
// 実 event ではなく homeAnchor 由来の synthetic edge。本ファイルで label を埋める。
// CEO 2026-04-28 Journey 構造: ENDPOINT_TRAVEL_SENTINEL_ID を toEventId に持つ
// segment は last_event → 帰宅 の synthetic edge。journeyEndAnchor.label で to を埋める。
import {
  HOME_TRAVEL_SENTINEL_ID,
  ENDPOINT_TRAVEL_SENTINEL_ID,
  type HomeAnchor,
  type JourneyEndAnchor,
} from "./transportContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// id prefix — 既存 travelTimeEngine の `travel_${Date.now()}_${rand}` と衝突
// させないため `travel__` (double underscore) で分ける。
// 既存 travel item の id は `travel_` + base36 × 2、synthesize 由来は `travel__` +
// event_id × 2。string prefix で機械的に判別できる（id parse は interleave に
// 持ち込まない — afterEventId は entry で別 channel に出す）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TRAVEL_ID_PREFIX = "travel__";

export function buildSynthesizedTravelId(
  fromEventId: string,
  toEventId: string,
): string {
  return `${TRAVEL_ID_PREFIX}${fromEventId}__${toEventId}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// icon mapping — travelTimeEngine.getTravelIcon と同じ絵文字セット。
// 依存を逃すためインラインで持つ（Path B の internal 関数を引き込まない）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function travelIconFor(mode: TransportMode): string {
  switch (mode) {
    case "walk":
      return "🚶";
    case "car":
      return "🚗";
    case "public_transit":
      return "🚃";
    case "bicycle":
      return "🚲";
    case "taxi":
      return "🚕";
    case "unknown":
    default:
      return "🚗"; // 既存実装の fallback と揃える
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mode mapping — segment.mode (transport/types.ts TransportMode) と
// PlanItem.travelTransport (vcTypes TransportMode) は別の型 union。
// 互換のあるモードはそのまま、無いものは近似マッピングで埋める。
//   - public_transit → train（近似、UI icon は電車系で一致）
//   - unknown → "car"（UI fallback と同じ。見えない差異なし）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function toVcTransportMode(mode: TransportMode): VcTransportMode {
  switch (mode) {
    case "walk":
      return "walk";
    case "car":
      return "car";
    case "bicycle":
      return "bicycle";
    case "taxi":
      return "taxi";
    case "public_transit":
      return "train";
    case "unknown":
    default:
      return "car";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// label resolution — event.where.place_ref を travelFrom/travelTo と text に使う。
// 空文字の場合は UI fallback（"──" 的扱い）を避けるため空のまま通す。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function placeLabel(event: ComprehensionEvent): string {
  return event.where.place_ref ?? "";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * synthesize 出力の 1 要素。
 * - `afterEventId`: interleave 時に「この event の直後」に挿入する基準 id。
 *   id parse ではなく entry の field として渡すことで、event_id に `__` 等が
 *   混ざっても安全に interleave できる。
 * - `item`: 実体の PlanItem(kind="travel")。UI に直接渡せる shape。
 */
export interface SynthesizedTravelEntry {
  afterEventId: string;
  item: PlanItem;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * canonical TransportSegment[] を display cache の travel entry に射影する。
 *
 * 契約:
 *   - segments の各要素に対応する SynthesizedTravelEntry を 1:1 で返す
 *   - 返却順序は segments の配列順
 *   - segment が参照する event が events に見つからない場合、その segment は skip
 *     （defensive: segments は events と同じ build 由来で常に整合するが、呼び出し
 *      順序で events が絞り込まれる可能性に備える）
 *   - caller は interleaveTravelItems に entry[] を渡す
 *
 * durationMin:
 *   - seg.estimatedDurationMin が number なら採用。
 *   - null（≤0.2km / invalid coords / heuristic 失敗）なら travel entry を生成しない。
 *     「0 分の travel」を作ると UI 上で虚偽の移動帯が出るため、null-skip を
 *     canonical edge 生成の safety net として併置する。buildTransportSegments 側で
 *     ≤0.2km を既に null にしているが、display cache 側でも二重防御する。
 *   - Phase 1 では Routes API 未接続のため Scope A の mode-free 中立距離 heuristic が
 *     埋める。Phase 3 で Routes 連携時に自動で実値に置き換わる。
 */
export function synthesizeTravelItems(
  segments: TransportSegment[],
  events: ComprehensionEvent[],
  homeAnchor?: HomeAnchor | null,
  journeyEnd?: JourneyEndAnchor | null,
): SynthesizedTravelEntry[] {
  if (segments.length === 0) return [];

  const eventById = new Map<string, ComprehensionEvent>();
  for (const ev of events) {
    eventById.set(ev.event_id, ev);
  }

  const entries: SynthesizedTravelEntry[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // ── CEO 2026-04-28 Option B: HOME_SENTINEL の解釈（from 側）──
    //   fromEventId が HOME_TRAVEL_SENTINEL_ID なら from は home anchor。
    //   homeAnchor が渡されていない（呼び出し側のミス）場合は skip（hallucination 防止）。
    let fromLabel: string;
    if (seg.fromEventId === HOME_TRAVEL_SENTINEL_ID) {
      if (!homeAnchor) {
        // segment は home 用なのに anchor が渡っていない → defensive skip
        continue;
      }
      fromLabel = homeAnchor.label;
    } else {
      const from = eventById.get(seg.fromEventId);
      if (!from) continue;
      fromLabel = placeLabel(from);
    }

    // ── CEO 2026-04-28 Journey 構造: ENDPOINT_SENTINEL の解釈（to 側）──
    //   toEventId が ENDPOINT_TRAVEL_SENTINEL_ID なら to は journey end anchor。
    //   journeyEnd が渡されていない場合は skip（defensive）。
    let toLabel: string;
    if (seg.toEventId === ENDPOINT_TRAVEL_SENTINEL_ID) {
      if (!journeyEnd) {
        continue;
      }
      toLabel = journeyEnd.label;
    } else {
      const to = eventById.get(seg.toEventId);
      if (!to) continue;
      toLabel = placeLabel(to);
    }

    // null-skip: heuristic が null を返した segment（≤0.2km / invalid coords /
    // 失敗）では travel display cache を生成しない。fake 0分 travel 禁止。
    // segment 自体は canonical に残す（domain truth は edge の存在まで）。
    if (seg.estimatedDurationMin === null) {
      continue;
    }

    const icon = travelIconFor(seg.mode);
    const text = `${icon} ${fromLabel}→${toLabel}`;

    const item: PlanItem = {
      id: buildSynthesizedTravelId(seg.fromEventId, seg.toEventId),
      kind: "travel",
      text,
      what: null,
      durationMin: seg.estimatedDurationMin,
      durationSource: "inferred",
      fixedStart: false,
      orderHint: i, // 最終 orderHint は interleave で再付番される
      sourceTurnIndex: 0,
      completed: false,
      travelFrom: fromLabel,
      travelTo: toLabel,
      travelTransport: toVcTransportMode(seg.mode),
    };

    // ── interleave 用の afterEventId 規約 ──
    //   HOME segment: afterEventId = HOME_SENTINEL → eventItems の先頭に prepend
    //   ENDPOINT segment: afterEventId = last event の id → eventItems の最後の event の直後に挿入
    //                       （endpoint node は plan-level metadata で UI 側に出る）
    //   通常 segment: afterEventId = from event id → 該当 event 直後に挿入
    //
    // ENDPOINT segment の afterEventId は from(=last event).event_id にする
    // ことで、interleave の通常 path（event の直後に挿入）に乗せられる。
    // HOME と異なり「先頭 prepend」の特別 path 不要。
    entries.push({ afterEventId: seg.fromEventId, item });
  }

  return entries;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Interleave helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// eventItems と travel entries を canonical 順序で混ぜる pure function。
//
// 設計原則:
//   - pure / 決定論
//   - travel は entry.afterEventId に対応する event の直後に挿入
//   - 同じ afterEventId に複数 entry があれば entries 入力順で連続挿入
//     （Phase 1 の segment 契約では 1 event につき最大 1 segment なので通常 1 件）
//   - afterEventId が eventItems に存在しない entry は skip
//     （defensive: 不一致なら travel を捏造しない）
//   - orderHint は 0..n の連番で再付番する
//
// 注意: eventItems は events と同じ順序である前提（caller が担保）。
//
// CEO 2026-04-28 Option B 拡張:
//   afterEventId === HOME_TRAVEL_SENTINEL_ID の entry は eventItems の **先頭に prepend**
//   する（home/current → first event の travel）。
//   通常 entry（実 event id）は従来通り該当 event の直後に挿入。

export function interleaveTravelItems(
  eventItems: PlanItem[],
  entries: SynthesizedTravelEntry[],
): PlanItem[] {
  if (entries.length === 0) {
    return eventItems.map((item, idx) => ({ ...item, orderHint: idx }));
  }

  // ── HOME 由来の prepend entries と event-attached entries に分離 ──
  const prependEntries: SynthesizedTravelEntry[] = [];
  const insertEntries: SynthesizedTravelEntry[] = [];
  for (const entry of entries) {
    if (entry.afterEventId === HOME_TRAVEL_SENTINEL_ID) {
      prependEntries.push(entry);
    } else {
      insertEntries.push(entry);
    }
  }

  // afterEventId → entries[] の map（同じ event の直後に複数挟むケースに備える）
  const byAfter = new Map<string, SynthesizedTravelEntry[]>();
  for (const entry of insertEntries) {
    const arr = byAfter.get(entry.afterEventId);
    if (arr) {
      arr.push(entry);
    } else {
      byAfter.set(entry.afterEventId, [entry]);
    }
  }

  const result: PlanItem[] = [];
  let orderIdx = 0;
  // ── HOME → first event を eventItems の前に prepend ──
  for (const e of prependEntries) {
    result.push({ ...e.item, orderHint: orderIdx++ });
  }
  // ── 既存 event-attached interleave ──
  for (const ev of eventItems) {
    result.push({ ...ev, orderHint: orderIdx++ });
    const travels = byAfter.get(ev.id);
    if (travels) {
      for (const t of travels) {
        result.push({ ...t.item, orderHint: orderIdx++ });
      }
    }
  }
  return result;
}
