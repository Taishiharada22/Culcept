/**
 * S3-1 — CoAlter 衝突先回り（Conflict Pre-detection）（**pure・決定論・捏造なし**）
 *
 * 役割: self / partner の `PersonalizationSnapshot` を M2 PersonalizationPort の pure derive に通し、
 *   **2 人が引っ張り合いやすい決定**（行き先 / ペース / 予算 / 段取り / 人の多さ）を
 *   摩擦リスク順に検出し、各々に **橋渡し**（落としどころ）を添える。CoAlter の
 *   「先にすり合わせたい点」専用。
 *
 * S2 readout との責務分離（重複ゼロ）:
 *   - `coalterPairTraitReadout`（S2）= **一致点**（共有する強み）のみ読み上げる。
 *   - 本モジュール（S3-1）= **相違点**を、決定にひも付け・ランク付け・橋渡し付きで出す。
 *   → 一致は readout、差分は forecast。各カードが 1 つの問いに答える。
 *
 * 設計判断（なぜ engine でなく forecast レイヤか）:
 *   - travel engine の comparator は **angle/fit ベースで pair-trait ベースではない**（S2 調査確認）。
 *     partner trait を順位計算へ深く統合するのは comparator 大改造の領域。
 *   - S3-1 は外科的に：self 軸のみ engine scoring（不変）、**2 人の摩擦は順位を変えず説明だけ**。
 *
 * 橋渡しの原理（革新点・損失回避の非対称性）:
 *   - 50/50 折半ではなく、**より慎重・損失回避的な側の床を守りつつ**、他方に限定的な余地を与える。
 *     例: 新奇 vs 定番 → 「定番を軸に、1〜2 か所だけ新しさを混ぜる」（定番側の安心を土台に据える）。
 *   - 損失回避（Kahneman/Tversky）: 失う痛みは得る喜びの約 2 倍。よって保守側の floor を守る方が
 *     全体の摩擦が小さくなる。これが「折半」より対立を減らす落としどころ。
 *
 * 厳守（honesty）:
 *   - **両者とも source==="derived" ∧ confidence≥floor ∧ non-neutral(deadzone 外)** の軸のみ対象。
 *     片側が未観測/低信頼 → それは「摩擦」ではなく「まだ分からない」→ 捏造せず surface しない。
 *   - **opposed（向きが逆）だけ**を摩擦とする。同方向は一致＝readout の領域（ここでは出さない）。
 *   - raw axis score / personality dump は出さない（向き・決定ラベル・橋渡し文のみ）。
 *   - ランクは内部 score（min(confidence) × 平均強度）でのみ使い、**数値は UI へ出さない**。
 *   - 入力 snapshot が demo か実データかは **caller が管理**（この関数は純写像・DB/runtime を読まない）。
 *     出自は VM/UI が `demo` フラグで明示する。
 */

import { derivePlanParams, deriveTravelTraits } from "@/lib/shared/personalization/derive";
import type { DerivedValue, PersonalizationSnapshot } from "@/lib/shared/personalization/types";

export interface CoAlterConflictItem {
  /** どの決定で引っ張り合うか（例「行き先選び」）。 */
  decisionLabel: string;
  /** どちらがどちらへ寄るか（例「あなたは新しい場所・Mio は定番に安心」）。raw 値は出さない。 */
  tension: string;
  /** 落としどころ（損失回避非対称の橋渡し）。 */
  bridge: string;
}

export interface CoAlterConflictForecast {
  /** 摩擦リスク降順。opposed かつ両者 usable な決定のみ。空可（摩擦なし／材料不足）。 */
  items: CoAlterConflictItem[];
}

/** derive と整合: これ未満の confidence は中立として扱い、語らない。 */
const CONFIDENCE_FLOOR = 0.3;
/** |value| がこの範囲は neutral とみなし語らない（readout / bridge と同値）。 */
const NEUTRAL_DEADZONE = 0.2;

// ─────────────────────────────────────────────────────────────────────────────
// honesty gate ヘルパ（confidence を保持＝ランクに使う。readout の usableSign は conf を捨てるため別実装）
// ─────────────────────────────────────────────────────────────────────────────

interface SignedUsable {
  /** +1 / -1 */
  sign: 1 | -1;
  /** 強度 0..1（raw 値は外へ出さない・ランク内部専用） */
  mag: number;
  /** 0..1 */
  conf: number;
}

/** derived ∧ conf≥floor ∧ non-neutral な符号付き数値 → 符号 + 強度 + 信頼度。 */
function signedUsable(d: DerivedValue<number>): SignedUsable | null {
  if (d.source !== "derived" || d.confidence < CONFIDENCE_FLOOR) return null;
  if (Math.abs(d.value) <= NEUTRAL_DEADZONE) return null;
  return { sign: d.value > 0 ? 1 : -1, mag: Math.abs(d.value), conf: d.confidence };
}

interface EnumUsable<T extends string> {
  value: T;
  conf: number;
}

/** derived ∧ conf≥floor な enum → 値 + 信頼度。 */
function enumUsable<T extends string>(d: DerivedValue<T>): EnumUsable<T> | null {
  return d.source === "derived" && d.confidence >= CONFIDENCE_FLOOR ? { value: d.value, conf: d.confidence } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 決定次元（5 軸）。各次元は最大 1 件の摩擦を出す。
//   priority = 同 score 時の決定論的タイブレーク（旅行で揉れやすい順の事前知識）。
// ─────────────────────────────────────────────────────────────────────────────

type Pace = "slow" | "normal" | "intense";
type Budget = "save" | "balanced" | "quality";

const PACE_RANK: Record<Pace, number> = { slow: 0, normal: 1, intense: 2 };
const BUDGET_RANK: Record<Budget, number> = { save: 0, balanced: 1, quality: 2 };
const PACE_JA: Record<Pace, string> = { slow: "ゆっくり", normal: "ほどよく", intense: "活動的に" };
const BUDGET_JA: Record<Budget, string> = { save: "抑えめ", balanced: "ほどほど", quality: "奮発" };

/**
 * ランク設計（重要度主軸 + evidence 従）:
 *   rank = importance + evidence × 0.3
 *   - importance（決定の重さ・0.7〜1.0）が主軸。旅行で本質的な決定ほど上位（行き先 > 予算 > ペース > 段取り > 人）。
 *   - evidence（min(confidence) × 強度・0〜1）は **同重要度内の tiebreak** に効く小項（×0.3）。
 *   理由: evidence のみで並べると「確信度は高いが些末な摩擦」が「重大だがやや確信が薄い摩擦」を上回る。
 *     ユーザーが先に揃えたいのは **重大な決定**＝重要度を主軸に据える。evidence は出すか否かの honesty gate
 *     としては依然厳格（gate は変えない）。あくまで **並び順**の改善。
 */
interface ScoredItem extends CoAlterConflictItem {
  /** 決定の重さ（0.7〜1.0）。 */
  importance: number;
  /** min(confidence) × 強度（0〜1）。UI 非出力。 */
  evidence: number;
  /** 完全決定論の最終 tiebreak（小さいほど優先）。 */
  order: number;
}

/** rank = importance 主軸 + evidence 従（×0.3）。 */
function rankOf(x: ScoredItem): number {
  return x.importance + x.evidence * 0.3;
}

/** 「あなた」と相手名を、寄る向きに応じて割り当てる（self が which 側か）。 */
function sides(selfIsFirst: boolean, partnerName: string): { first: string; second: string } {
  return selfIsFirst ? { first: "あなた", second: partnerName } : { first: partnerName, second: "あなた" };
}

/**
 * self / partner snapshot → 摩擦予報。決定論・副作用なし。
 *   @param partnerName tension で相手を呼ぶ表示名（既定「お相手」）。
 */
export function buildCoAlterConflictForecast(
  self: PersonalizationSnapshot,
  partner: PersonalizationSnapshot,
  partnerName = "お相手",
): CoAlterConflictForecast {
  const selfPlan = derivePlanParams(self);
  const partnerPlan = derivePlanParams(partner);
  const selfTraits = deriveTravelTraits(self);
  const partnerTraits = deriveTravelTraits(partner);

  const scored: ScoredItem[] = [];

  // ── ① 行き先選び（novelty: +新奇 / -定番）── 旅行で最も揉れやすい → priority 0
  {
    const s = signedUsable(selfPlan.noveltyBias);
    const p = signedUsable(partnerPlan.noveltyBias);
    if (s && p && s.sign !== p.sign) {
      const selfNovel = s.sign > 0; // self が新奇側か
      const { first: forward, second: classic } = sides(selfNovel, partnerName);
      scored.push({
        decisionLabel: "行き先選び",
        tension: `${forward}は新しい場所・${classic}は定番に安心`,
        bridge: "定番を軸に、1〜2 か所だけ新しい場所を混ぜると両方が満たされます",
        importance: 1.0, //  行き先 = 旅行で最も本質的な決定
        evidence: Math.min(s.conf, p.conf) * ((s.mag + p.mag) / 2),
        order: 0,
      });
    }
  }

  // ── ② 予算感（save / balanced / quality）── 両極(save↔quality)のみ摩擦 → priority 1
  {
    const s = enumUsable<Budget>(selfPlan.budgetPosture);
    const p = enumUsable<Budget>(partnerPlan.budgetPosture);
    if (s && p && Math.abs(BUDGET_RANK[s.value] - BUDGET_RANK[p.value]) === 2) {
      const selfSave = BUDGET_RANK[s.value] < BUDGET_RANK[p.value];
      const { first: saver, second: spender } = sides(selfSave, partnerName);
      scored.push({
        decisionLabel: "予算感",
        tension: `${saver}は${BUDGET_JA.save}め・${spender}は${BUDGET_JA.quality}したい`,
        bridge: "1〜2 か所だけ奮発し、ほかは抑える「メリハリ」で折り合います",
        importance: 0.9, // 予算 = 金銭は対立が尾を引きやすい
        evidence: Math.min(s.conf, p.conf),
        order: 1,
      });
    }
  }

  // ── ③ 段取り（planningStyle: +即興 / -計画）── priority 2
  {
    const s = signedUsable(selfTraits.traits.planningStyle);
    const p = signedUsable(partnerTraits.traits.planningStyle);
    if (s && p && s.sign !== p.sign) {
      const selfSpont = s.sign > 0; // self が即興側か
      const { first: spont, second: planner } = sides(selfSpont, partnerName);
      scored.push({
        decisionLabel: "段取り",
        tension: `${spont}は即興で動きたい・${planner}は事前に決めたい`,
        bridge: "大枠は事前に決め、現地で 1 枠だけ自由にすると両方が安心できます",
        importance: 0.7, // 段取り = メタ決定（行き先/予算ほど本質ではない）
        evidence: Math.min(s.conf, p.conf) * ((s.mag + p.mag) / 2),
        order: 2,
      });
    }
  }

  // ── ④ ペース（slow / normal / intense）── 両極(slow↔intense)のみ摩擦 → priority 3
  {
    const s = enumUsable<Pace>(selfPlan.paceDefault);
    const p = enumUsable<Pace>(partnerPlan.paceDefault);
    if (s && p && Math.abs(PACE_RANK[s.value] - PACE_RANK[p.value]) === 2) {
      const selfSlow = PACE_RANK[s.value] < PACE_RANK[p.value];
      const { first: slow, second: fast } = sides(selfSlow, partnerName);
      scored.push({
        decisionLabel: "1 日の組み立て",
        tension: `${slow}は${PACE_JA.slow}・${fast}は${PACE_JA.intense}動きたい`,
        bridge: "詰め込みすぎず、要所だけしっかり。余白を 1 つ残すと崩れにくいです",
        importance: 0.85, // ペース = 1 日全体の体験を左右する
        evidence: Math.min(s.conf, p.conf),
        order: 3,
      });
    }
  }

  // ── ⑤ 人の多さ（socialOrientation: +外向 / -内向）── priority 4
  {
    const s = signedUsable(selfTraits.traits.socialOrientation);
    const p = signedUsable(partnerTraits.traits.socialOrientation);
    if (s && p && s.sign !== p.sign) {
      const selfOut = s.sign > 0; // self が外向側か
      const { first: outgoing, second: quiet } = sides(selfOut, partnerName);
      scored.push({
        decisionLabel: "人の多さ",
        tension: `${outgoing}は人と動くと回復・${quiet}は静かめが落ち着く`,
        bridge: "人の多い場所は短めにし、静かな時間も挟むと両方が消耗しません",
        importance: 0.7, // 人の多さ = 局所的に調整しやすい
        evidence: Math.min(s.conf, p.conf),
        order: 4,
      });
    }
  }

  // rank（重要度主軸 + evidence 従）降順。完全同値は order 昇順で決定論的に。
  scored.sort((a, b) => (rankOf(b) - rankOf(a)) || (a.order - b.order));

  // 内部フィールド（importance/evidence/order）を落として UI-safe な items に。
  const items: CoAlterConflictItem[] = scored.map(({ decisionLabel, tension, bridge }) => ({
    decisionLabel,
    tension,
    bridge,
  }));

  return { items };
}
