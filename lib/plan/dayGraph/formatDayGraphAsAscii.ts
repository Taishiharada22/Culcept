/**
 * formatDayGraphAsAscii — Phase 3-K dev-only debug helper (= K-1e)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §1.1 / §7
 *
 * 役割:
 *   DayGraph を人間が読める ASCII 表現に変換する pure helper。
 *   主に dev / test debug 用、 production UI では使わない。
 *
 * 不変原則:
 *   - **必ず displayLabel を使う** (= raw title / locationText を一切出力しない)
 *   - sensitive node の category hint も displayLabel に既に含まれているため安全
 *   - transitions の location は sensitiveProximity 由来 redaction を信頼
 *   - graph mutation 不可
 */

import { applyDayGraphView } from "./dayGraphView";
import type { DayGraph, DayGraphView } from "./dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Format helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function padLabel(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DayGraph を ASCII 文字列に変換する。
 *
 * 例:
 *   DayGraph 2026-05-22 (mood=light, density=sparse, anchors=1)
 *   06:00-06:00  [START]    (boundary)
 *   06:00-14:00  [GAP]      480min
 *   14:00-15:00  [EVENT]    カフェ (cafe)
 *   15:00-23:00  [GAP]      480min
 *   23:00-23:00  [END]      (boundary)
 *
 * @param view default "user_self"。 "shared_view" を指定で sensitive 完全 genericize。
 */
export function formatDayGraphAsAscii(
  graph: DayGraph,
  view: DayGraphView = "user_self",
): string {
  const target = applyDayGraphView(graph, view);
  const lines: string[] = [];

  // Header line
  lines.push(
    `DayGraph ${target.attributes.date} ` +
      `(mood=${target.attributes.dayMood}, ` +
      `density=${target.attributes.density}, ` +
      `anchors=${target.attributes.anchorCount}` +
      `${target.attributes.hasOverlap ? ", overlap" : ""}` +
      `${target.attributes.hasSensitive ? ", sensitive" : ""})`,
  );
  lines.push("");

  // Nodes timeline
  for (const node of target.nodes) {
    const range = `${node.startTime}-${node.endTime}`;
    let labelKind: string;
    let descriptor: string;
    switch (node.kind) {
      case "start":
        labelKind = "[START]";
        descriptor = "(boundary)";
        break;
      case "event": {
        labelKind = "[EVENT]";
        const loc = node.locationCategory ? ` (${node.locationCategory})` : "";
        descriptor = `${node.displayLabel}${loc}`;
        break;
      }
      case "gap":
        labelKind = "[GAP]";
        descriptor = `${node.durationMin}min${node.sensitiveProximity ? " (sensitive proximity)" : ""}`;
        break;
      case "end":
        labelKind = "[END]";
        descriptor = "(boundary)";
        break;
    }
    lines.push(`${range}  ${padLabel(labelKind, 9)}  ${descriptor}`);
  }

  // Transitions
  if (target.transitions.length > 0) {
    lines.push("");
    lines.push("transitions:");
    for (const t of target.transitions) {
      const from = t.fromLocationText ?? "—";
      const to = t.toLocationText ?? "—";
      const sens = t.sensitiveProximity ? " (sensitive)" : "";
      lines.push(`  ${t.fromNodeId} → ${t.toNodeId}: ${from} → ${to} [${t.timingStatus}]${sens}`);
    }
  }

  return lines.join("\n");
}
