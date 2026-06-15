/**
 * EventNode generator — Phase 3-K (= K-1b)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §4.3 / §7 / §22
 *
 * 役割:
 *   ExternalAnchor (= 1 日分 expand 済) を EventNode に変換する pure helper。
 *   sensitive redaction を **生成段階で**強制 (= raw title / locationText を物理的に欠落)。
 *
 * 不変原則:
 *   - anchor mutation 不可 (= Invariant 10)
 *   - sensitive===true → title / locationText を undefined (= Invariant 4)
 *   - displayLabel 常に非空 (= safe label 生成 helper 経由)
 *   - inferLatencyTolerance は **必ず**呼ぶ (= v1.1 §22.5、 required)
 *   - inferAnchorVerb / detectTimedAnchorOverlaps 既存 helper 再利用
 *   - out-of-boundary anchor は warning + skip (= v1.1 §22.6)
 *   - endTime 欠落 → startTime + DEFAULT_EVENT_DURATION_MIN (= v1.1 §22.2)
 *   - endTime > boundary end → boundary end に clip (= warning なし)
 */

import { detectTimedAnchorOverlaps } from "@/lib/plan/anchorOverlap";
import type {
  AnchorSensitiveCategory,
  ExternalAnchor,
} from "@/lib/plan/external-anchor";

import { inferAnchorVerb } from "./anchorVerbMap";
import {
  DEFAULT_EVENT_DURATION_MIN,
  type DayGraphWarning,
  type DurationSource,
  type EventNode,
} from "./dayGraphTypes";
import { inferLatencyTolerance } from "./latencyToleranceMap";
import { bucketFromMinutes, minutesToHHMM, parseHHMMtoMinutes } from "./timeFormat";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// displayLabel 生成 (= 設計 §7.3、 sensitive 別 generic 表現)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * sensitiveCategory 別の generic safe label。
 * raw title を漏らさないために、 category 一段の hint だけ提供。
 */
function safeSensitiveLabel(category: AnchorSensitiveCategory): string {
  switch (category) {
    case "medical":
      return "予定 (= 医療系)";
    case "legal":
      return "予定 (= 法務系)";
    case "exam":
      return "予定 (= 試験系)";
    case "other":
      return "予定 (= 機密)";
  }
}

/**
 * displayLabel を生成。
 *
 * 規則:
 *   - sensitive (= sensitiveCategory != null) → safe generic label
 *   - title 非空 → title そのまま
 *   - title 空 / undefined → "予定" (= 究極の fallback)
 */
export function buildDisplayLabel(anchor: ExternalAnchor): string {
  if (anchor.sensitiveCategory) {
    return safeSensitiveLabel(anchor.sensitiveCategory);
  }
  if (typeof anchor.title === "string" && anchor.title.trim().length > 0) {
    return anchor.title;
  }
  return "予定";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface BoundsMinutes {
  readonly startMin: number;
  readonly endMin: number;
}

interface NormalizedTime {
  readonly startMin: number;
  readonly endMin: number;
  /**
   * duration 由来 (= v1.2 §22.8、 K-1f-α)。
   *   "explicit"        — anchor.endTime が明示
   *   "assumed_default" — 欠落 + DEFAULT_EVENT_DURATION_MIN 補完
   */
  readonly durationSource: DurationSource;
  /**
   * endTime が boundary 超で clip されたか (= 設計 §22.6 + v1.2 §22.8)。
   * durationSource と直交。
   */
  readonly boundaryClipped: boolean;
}

/**
 * anchor の startTime / endTime を strict 検証 + clip。
 *
 * 戻り値:
 *   - { ok: true, ...normalized }
 *   - { ok: false, warning }
 */
function normalizeAnchorTime(
  anchor: ExternalAnchor,
  bounds: BoundsMinutes,
): { ok: true; normalized: NormalizedTime } | { ok: false; warning: DayGraphWarning } {
  // 1. startTime parse
  const startMin = parseHHMMtoMinutes(anchor.startTime);
  if (startMin === null) {
    return {
      ok: false,
      warning: {
        kind: "invalid_time",
        anchorId: anchor.id,
        detail: `startTime "${anchor.startTime}" not strict HH:MM`,
      },
    };
  }

  // 2. boundary 外検出 (= v1.1 §22.6、 startTime ベース)
  if (startMin < bounds.startMin || startMin >= bounds.endMin) {
    return {
      ok: false,
      warning: {
        kind: "anchor_outside_boundary",
        anchorId: anchor.id,
        detail:
          `startTime "${anchor.startTime}" outside boundary ` +
          `[${minutesToHHMM(bounds.startMin)}, ${minutesToHHMM(bounds.endMin)})`,
      },
    };
  }

  // 3. endTime decide (= durationSource を同時に確定、 K-1f-α)
  let endMin: number;
  let boundaryClipped = false;
  let durationSource: DurationSource;
  if (typeof anchor.endTime === "string" && anchor.endTime.length > 0) {
    const parsed = parseHHMMtoMinutes(anchor.endTime);
    if (parsed === null) {
      return {
        ok: false,
        warning: {
          kind: "invalid_time",
          anchorId: anchor.id,
          detail: `endTime "${anchor.endTime}" not strict HH:MM`,
        },
      };
    }
    if (parsed <= startMin) {
      return {
        ok: false,
        warning: {
          kind: "end_before_start",
          anchorId: anchor.id,
          detail: `endTime ${anchor.endTime} <= startTime ${anchor.startTime}`,
        },
      };
    }
    endMin = parsed;
    durationSource = "explicit";
  } else {
    // endTime 欠落 → default duration (= v1.1 §22.2)
    endMin = startMin + DEFAULT_EVENT_DURATION_MIN;
    durationSource = "assumed_default";
  }

  // 4. endTime が boundary を超える → clip (= warning なし、 §22.6)
  //    durationSource は不変 (= clip は別軸、 K-1f-α §22.8)
  if (endMin > bounds.endMin) {
    endMin = bounds.endMin;
    boundaryClipped = true;
  }

  // 5. clip 後に endMin <= startMin になる edge case (= boundary start に張り付いた場合等)
  if (endMin <= startMin) {
    return {
      ok: false,
      warning: {
        kind: "anchor_outside_boundary",
        anchorId: anchor.id,
        detail:
          `clipped endTime ${minutesToHHMM(endMin)} <= startTime ${anchor.startTime}`,
      },
    };
  }

  return {
    ok: true,
    normalized: { startMin, endMin, durationSource, boundaryClipped },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventNode 生成 (= 1 anchor から 1 node)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 anchor を EventNode に変換。
 *
 * caller 責任:
 *   - allOverlapsIds: 同日全 anchor から計算した detectTimedAnchorOverlaps 結果
 *   - bounds: options から normalize した minutes 境界
 *
 * 戻り値:
 *   - { ok: true, node }
 *   - { ok: false, warning } (= invalid_time / end_before_start / out_of_boundary etc.)
 */
export function buildEventNodeFromAnchor(input: {
  anchor: ExternalAnchor;
  allDayAnchors: ReadonlyArray<ExternalAnchor>;
  overlapsIds: ReadonlySet<string>;
  bounds: BoundsMinutes;
}): { ok: true; node: EventNode } | { ok: false; warning: DayGraphWarning } {
  const { anchor, overlapsIds } = input;

  // 1. 時刻 normalize (= durationSource / boundaryClipped 含む、 K-1f-α)
  const norm = normalizeAnchorTime(anchor, input.bounds);
  if (!norm.ok) return { ok: false, warning: norm.warning };
  const { startMin, endMin, durationSource, boundaryClipped } = norm.normalized;

  // 2. sensitive flag (= sensitiveCategory != null)
  const sensitive = anchor.sensitiveCategory != null;

  // 3. displayLabel
  const displayLabel = buildDisplayLabel(anchor);

  // 4. verb (= inferAnchorVerb 既存)
  const verb = inferAnchorVerb({
    title: anchor.title,
    locationText: anchor.locationText,
  });

  // 5. latencyTolerance (= 必ず注入、 required field)
  const latencyTolerance = inferLatencyTolerance({
    title: anchor.title,
    locationText: anchor.locationText,
  });

  // 6. overlap ids (= 自身を除外した相手 anchor id list)
  const overlapsWithNodeIds: string[] = [];
  if (overlapsIds.has(anchor.id)) {
    for (const a of input.allDayAnchors) {
      if (a.id === anchor.id) continue;
      if (overlapsIds.has(a.id)) {
        // 時刻判定: 半開区間 [start, end) で交差するか
        const otherStart = parseHHMMtoMinutes(a.startTime);
        const otherEnd = parseHHMMtoMinutes(a.endTime ?? "");
        if (otherStart === null || otherEnd === null) continue;
        if (otherStart >= otherEnd) continue;
        if (startMin < otherEnd && otherStart < endMin) {
          overlapsWithNodeIds.push(a.id);
        }
      }
    }
  }

  // 7. EventNode 構築
  const node: EventNode = {
    id: anchor.id,
    kind: "event",
    origin: "explicit",
    startTime: minutesToHHMM(startMin),
    endTime: minutesToHHMM(endMin),
    durationMin: endMin - startMin,
    timeBucket: bucketFromMinutes(startMin),
    anchorId: anchor.id,
    displayLabel,
    title: sensitive ? undefined : anchor.title,
    locationText: sensitive ? undefined : anchor.locationText,
    locationCategory: anchor.locationCategory,
    verb,
    rigidity: anchor.rigidity,
    latencyTolerance,
    durationSource,    // = K-1f-α: "explicit" or "assumed_default"
    boundaryClipped,   // = K-1f-α: endTime boundary clip 由来
    sensitive,
    sensitiveCategory: anchor.sensitiveCategory,
    overlapsWithNodeIds,
    // U1-EventNode propagation: anchor.startTimeSource を safe enum で伝播（欠落→unknown fail-closed）。
    // durationSource/sourceType/confirmedAt から再導出しない・raw tzid/timestamp は載せない。
    startTimeSource: anchor.startTimeSource ?? "unknown",
  };

  return { ok: true, node };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventNode batch 生成 (= 全 anchor + warnings 収集)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 anchor を EventNode 配列に変換。
 *
 * 規則:
 *   - 1 日分 anchors (= expanded、 caller 責任) を受け取る
 *   - 各 anchor を buildEventNodeFromAnchor で変換
 *   - warning は配列で集約
 *   - 戻り値の events は **startTime 昇順** (= caller の sequencing 準備)
 *   - duplicate anchor id 検出 + warning (= 異常データ防御)
 */
export function buildEventNodesFromAnchors(input: {
  anchors: ReadonlyArray<ExternalAnchor>;
  bounds: BoundsMinutes;
}): { events: ReadonlyArray<EventNode>; warnings: ReadonlyArray<DayGraphWarning> } {
  const warnings: DayGraphWarning[] = [];

  // 1. duplicate id 検出 (= 防御)
  const idsSeen = new Set<string>();
  const filtered: ExternalAnchor[] = [];
  for (const a of input.anchors) {
    if (idsSeen.has(a.id)) {
      warnings.push({
        kind: "duplicate_anchor_id",
        anchorId: a.id,
        detail: `duplicate anchor id "${a.id}" skipped`,
      });
      continue;
    }
    idsSeen.add(a.id);
    filtered.push(a);
  }

  // 2. anchorKind check + one_off の missing date check
  const validKindFiltered: ExternalAnchor[] = [];
  for (const a of filtered) {
    if (a.anchorKind === "one_off") {
      if (typeof a.date !== "string" || a.date.length === 0) {
        warnings.push({
          kind: "missing_date",
          anchorId: a.id,
          detail: `one_off anchor without date`,
        });
        continue;
      }
    } else if (a.anchorKind === "recurring") {
      // recurring 展開済 (= caller 責任) を信頼。 K では追加 check しない。
    } else {
      // 防御的 fallback: ExternalAnchor union が拡張された場合に runtime で warning。
      // 現 union (= one_off | recurring) では unreachable。 cast 経由で id / anchorKind 抽出。
      const defensive = a as unknown as { id?: string; anchorKind?: string };
      warnings.push({
        kind: "unsupported_anchor_kind",
        anchorId: typeof defensive.id === "string" ? defensive.id : undefined,
        detail: `unknown anchorKind "${String(defensive.anchorKind)}"`,
      });
      continue;
    }
    validKindFiltered.push(a);
  }

  // 3. overlap 集合を 1 回計算 (= O(n²) 既存 helper)
  const overlapsIds = detectTimedAnchorOverlaps(validKindFiltered);

  // 4. 各 anchor を node 化
  const events: EventNode[] = [];
  for (const a of validKindFiltered) {
    const r = buildEventNodeFromAnchor({
      anchor: a,
      allDayAnchors: validKindFiltered,
      overlapsIds,
      bounds: input.bounds,
    });
    if (r.ok) {
      events.push(r.node);
    } else {
      warnings.push(r.warning);
    }
  }

  // 5. startTime 昇順 sort (= caller の sequencing 準備)
  events.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return { events, warnings };
}
