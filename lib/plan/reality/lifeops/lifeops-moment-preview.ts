/**
 * 横 R2/R4 前段 — Life Ops Moment Trigger Preview（**pure・通知しない・R4 本体非 import**・barrel 非 export）
 *
 * 設計: docs/life-ops-moment-trigger-preview-mini-design.md
 *
 * 役割: 選択 tier の composed 結果と nowMinute から、「**この時点なら何を出すのが自然か**」を pure に判定する preview VM。
 *   R4 本線接続の前段＝**配送・通知・UI・本線接続を一切しない**。R4 の思想と語彙だけ揃える
 *   （silence-by-default・**cap 1**・surfaced/silencedCount・非断定）。R4 の型/union には触れない（本体変更禁止）。
 *
 * 厳守:
 *   - **pure・deterministic**（`Date.now()` 禁止＝nowMinute 注入・IO/DB/fetch/React なし）。
 *   - **focus_work / recovery block 中は全抑制**（集中と回復は Life Ops より優先）。
 *   - cooldown 相当は **excludeKeys 注入**（既出 key は already_surfaced で沈黙・状態を持たない）。
 *   - 文言は非断定（「今なら入れやすそうです」）・L-8a を public API で再利用（cautions）・HH:MM/placeQuery を出さない。
 *   - overflow は **deadline kind のみ** fallback・alsoAvailable は扱わない（窓がない＝moment の根拠がない）。
 */

import { toLifeOpsCardViewModel } from "../../../lifeops/card-presenter";
import { assessLifeOpsPermission } from "../../../lifeops/permission";
import type { LifeOpsCandidate } from "../../../lifeops/candidate-types";
import type { ComposedDayProposal } from "./lifeops-empty-day-compose";
import type { PlacedLifeOpsCandidate } from "./lifeops-placement";

/** 窓接近の既定リード（分）。 */
export const MOMENT_LEAD_MINUTES = 30;
/** 注意文言の最大件数。 */
export const MOMENT_CAUTION_MAX = 2;

export type LifeOpsMomentKind = "window_open" | "window_approaching" | "deadline_pressure";

export interface LifeOpsMomentSurfacedVm {
  /** L-1 辞書 label（自由文なし）。 */
  readonly title: string;
  readonly kind: LifeOpsMomentKind;
  /** 非断定 1 行（HH:MM を含まない）。 */
  readonly phrase: string;
  /** L-7/L-8a 由来の注意（dedupe・≤2）。 */
  readonly cautions: readonly string[];
}

export interface LifeOpsMomentTriggerPreviewVm {
  /** 出すなら 1 件だけ（silence-by-default・cap 1）。null=沈黙。 */
  readonly surfaced: LifeOpsMomentSurfacedVm | null;
  /** 沈黙した候補数（cap 超過 + 窓外 + 既出 + 窓不足）。 */
  readonly silencedCount: number;
  /** 沈黙理由の安定コード（観測用・件数分・順不同でない＝評価順）。 */
  readonly suppressedReasons: readonly string[];
  /** focus/recovery 中の全抑制（null=抑制なし）。 */
  readonly suppression: "focus_block" | "recovery_block" | null;
}

export interface LifeOpsMomentPreviewInput {
  /** ユーザーが今日採用した（または recommended の）tier の composed。 */
  readonly composedTier: ComposedDayProposal;
  /** 現在分（0..1440・**注入**＝Date.now 禁止）。 */
  readonly nowMinute: number;
  /** 既出候補 key（briefing 代表・過去の moment）→ already_surfaced で沈黙（cooldown 相当）。 */
  readonly excludeKeys?: readonly string[];
  /** 窓接近リード（既定 30 分）。 */
  readonly leadMinutes?: number;
}

/** 重複制御 key（**縦 collector の dedup key と同一定義**: category:menu）。 */
export function lifeOpsMomentKey(c: LifeOpsCandidate): string {
  return `${c.category}:${c.menu ?? ""}`;
}

const PHRASE: Record<LifeOpsMomentKind, (title: string) => string> = {
  window_open: (t) => `今なら「${t}」を入れやすそうです`,
  window_approaching: (t) => `この後の空き時間に「${t}」を入れられそうです`,
  deadline_pressure: (t) => `期日が近い「${t}」だけ、すきまで少し進めておくと安心です`,
};

/** 窓 timing 判定（open は残り時間が coarseMinutes 以上あるときだけ）。 */
function timingOf(p: PlacedLifeOpsCandidate, nowMinute: number, lead: number): LifeOpsMomentKind | "outside_window" | "window_too_short" {
  const w = p.window!;
  if (nowMinute >= w.startMinute && nowMinute < w.endMinute) {
    return w.endMinute - nowMinute >= p.coarseMinutes ? "window_open" : "window_too_short";
  }
  if (nowMinute >= w.startMinute - lead && nowMinute < w.startMinute) return "window_approaching";
  return "outside_window";
}

function toSurfaced(p: PlacedLifeOpsCandidate, kind: LifeOpsMomentKind): LifeOpsMomentSurfacedVm {
  const card = toLifeOpsCardViewModel(p.candidate, assessLifeOpsPermission(p.candidate));
  const cautions: string[] = [];
  for (const n of [...(card.confirmationNote ? [card.confirmationNote] : []), ...card.riskNotes]) {
    if (cautions.length >= MOMENT_CAUTION_MAX) break;
    if (!cautions.includes(n)) cautions.push(n);
  }
  return { title: card.title, kind, phrase: PHRASE[kind](card.title), cautions };
}

/**
 * Moment Trigger preview（**pure・cap 1・通知しない**）。
 *   ① focus/recovery block 中 → 全抑制 ② fitting を urgency 順に timing 判定（既出は沈黙）
 *   ③ fitting が鳴らなければ deadline-kind overflow を fallback ④ 出すのは 1 件・残りは silenced。
 */
export function buildLifeOpsMomentPreview(input: LifeOpsMomentPreviewInput): LifeOpsMomentTriggerPreviewVm {
  const { composedTier, nowMinute } = input;
  const lead = input.leadMinutes ?? MOMENT_LEAD_MINUTES;
  const exclude = new Set(input.excludeKeys ?? []);

  // ── ② 集中・回復は邪魔しない（全抑制）──
  const inBlock = composedTier.proposal.blocks.find(
    (b) => (b.kind === "focus_work" || b.kind === "recovery") && nowMinute >= b.startMinute && nowMinute < b.endMinute,
  );
  if (inBlock) {
    const eligibleCount = composedTier.lifeOps.fitting.length;
    return {
      surfaced: null,
      silencedCount: eligibleCount,
      suppressedReasons: Array.from({ length: eligibleCount }, () => (inBlock.kind === "focus_work" ? "focus_block" : "recovery_block")),
      suppression: inBlock.kind === "focus_work" ? "focus_block" : "recovery_block",
    };
  }

  const reasons: string[] = [];
  let surfaced: LifeOpsMomentSurfacedVm | null = null;

  // ── fitting（urgency 順）──
  for (const p of composedTier.lifeOps.fitting) {
    if (exclude.has(lifeOpsMomentKey(p.candidate))) {
      reasons.push("already_surfaced");
      continue;
    }
    const t = timingOf(p, nowMinute, lead);
    if (t === "outside_window" || t === "window_too_short") {
      reasons.push(t);
      continue;
    }
    if (surfaced) {
      reasons.push("cap_silenced"); // cap 1（silence-by-default）
      continue;
    }
    surfaced = toSurfaced(p, t);
  }

  // ── deadline-kind overflow の fallback（fitting が鳴らなかった時のみ・期日だけは守る）──
  if (!surfaced) {
    for (const p of composedTier.lifeOps.overflow) {
      if (p.candidate.dueReason.kind !== "deadline") continue; // 他 kind の overflow は鳴らさない（その日の形を尊重）
      if (p.window === null) {
        // A-4-c4 以降 overflow は window=null（pool 未着席→tier 着席失敗）を含みうる。
        // 窓がない＝moment の根拠がない（alsoAvailable と同原則）→ 鳴らさない（A-4-c5 S8 観測で発見した crash の修正）。
        reasons.push("no_window");
        continue;
      }
      if (exclude.has(lifeOpsMomentKey(p.candidate))) {
        reasons.push("already_surfaced");
        continue;
      }
      const t = timingOf(p, nowMinute, lead);
      if (t === "outside_window" || t === "window_too_short") {
        reasons.push(t);
        continue;
      }
      surfaced = toSurfaced(p, "deadline_pressure");
      break;
    }
  }

  return { surfaced, silencedCount: reasons.length, suppressedReasons: reasons, suppression: null };
}
