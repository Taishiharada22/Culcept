/**
 * timeline-containment — ③ containment band の役割判定（pure・read-only layout の土台）
 *
 * 設計: docs/alter-plan-add-anchor-timeline-redesign-proposal.md ③ / CEO 補正（2026-06-03）
 *
 * 責務（2段・pure）:
 *   1. detectContainmentRelations(blocks): **時間の内包関係だけ**を見る（同時刻 duplicate / 不正時刻は除外）。
 *   2. classifyTimelineBlockRole(block, relations, policy): context/exclusive を踏まえ
 *      container / contained / normal を決める。
 *
 * 不変原則（CEO 補正・2026-06-03）:
 *   - **完全内包だけで band 化しない**。background band 化する parent は「文脈予定」に限定:
 *     ①内包 child≥1 ②duration≥120分 ③context 語 ④**非** exclusive 語 ⑤非同時刻 ⑥v1 は existing のみ。
 *     曖昧なら band しない（誤 band より従来 lane が安全）。
 *   - geometry（minutesToY 等）/ drop / range / height には一切触れない（本modは role 判定のみ・X/style は render 側）。
 *   - layoutLanes は非改変。partial overlap は従来 lane のまま（render 側で非container を layoutLanes に通す）。
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 型

/** 役割判定に必要な最小形（DayTimelineCanvas の TimelineBlock も構造的に適合）。 */
export interface ContainmentBlock {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  /** existing = 保存済み既存予定 / draft = 配置済み新規。v1 は existing のみ band 化。 */
  tone?: "existing" | "draft";
}

export type TimelineBlockRole = "container" | "contained" | "normal";

export interface ContainmentRelations {
  /** parent id → 完全内包する child id[]（同時刻 duplicate・不正時刻は除外）。 */
  childrenOf: Map<string, string[]>;
  /** child id → 自分を内包する parent id[]。 */
  parentsOf: Map<string, string[]>;
  /** id → block（parent props 参照用・有効 block のみ）。 */
  byId: Map<string, ContainmentBlock>;
}

export interface ContainmentPolicy {
  /** parent が band 化する最小 duration（分）。既定 120。 */
  minParentDurationMin: number;
  /** label が「文脈予定」候補か。 */
  isContextLabel: (label: string) => boolean;
  /** label が「排他予定」候補か（band 化しない）。 */
  isExclusiveLabel: (label: string) => boolean;
  /** container として許可する tone。v1 は ["existing"]（draft container は band 化しない）。 */
  containerTones: ReadonlyArray<"existing" | "draft">;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ label 分類（context / exclusive）

/** 文脈予定（背景バンド候補）の語。長時間その場に「いる/作業する」枠。 */
const CONTEXT_LABELS: readonly string[] = [
  "仕事", "勤務", "作業", "業務", "勉強", "学校", "滞在", "出張",
  "オフィス", "ワークブロック", "ワーク", "在宅", "家にいる", "自宅作業",
  "デスクワーク", "稼働", "常駐", "自習",
];

/** 排他予定（背景バンドにしない）の語。開始–終了が確定した単一の出来事。 */
const EXCLUSIVE_LABELS: readonly string[] = [
  "映画", "フライト", "飛行機", "電車", "新幹線", "診察", "通院", "試験",
  "テスト", "面接", "予約", "ライブ", "コンサート", "セミナー", "授業",
  "講義", "公演", "観劇", "観戦", "手術", "検査",
];

function normLabel(label: string): string {
  return label.trim().toLowerCase();
}

/** label が文脈予定候補か（部分一致）。 */
export function isContextLabel(label: string): boolean {
  const n = normLabel(label);
  if (n.length === 0) return false;
  return CONTEXT_LABELS.some((k) => n.includes(k.toLowerCase()));
}

/** label が排他予定候補か（部分一致）。 */
export function isExclusiveLabel(label: string): boolean {
  const n = normLabel(label);
  if (n.length === 0) return false;
  return EXCLUSIVE_LABELS.some((k) => n.includes(k.toLowerCase()));
}

/** 既定 policy（v1: 120分・keyword 分類・existing のみ）。 */
export const DEFAULT_CONTAINMENT_POLICY: ContainmentPolicy = {
  minParentDurationMin: 120,
  isContextLabel,
  isExclusiveLabel,
  containerTones: ["existing"],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1. 内包関係（時間のみ）

function isValidBlock(b: ContainmentBlock): boolean {
  return (
    Number.isFinite(b.startMin) &&
    Number.isFinite(b.endMin) &&
    b.endMin > b.startMin
  );
}

/** A が B を完全内包するか（同一時刻＝duplicate は内包扱いしない）。 */
function fullyContains(a: ContainmentBlock, b: ContainmentBlock): boolean {
  if (a.id === b.id) return false;
  const sameSpan = a.startMin === b.startMin && a.endMin === b.endMin;
  if (sameSpan) return false; // ⑥ 同時刻 duplicate は containment 扱いしない
  return a.startMin <= b.startMin && a.endMin >= b.endMin;
}

/**
 * 時間の内包関係だけを抽出（pure）。不正時刻 block は除外（⑨ band 化しない）。
 */
export function detectContainmentRelations(
  blocks: ReadonlyArray<ContainmentBlock>,
): ContainmentRelations {
  const valid = blocks.filter(isValidBlock);
  const byId = new Map<string, ContainmentBlock>(valid.map((b) => [b.id, b]));
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  const pushTo = (map: Map<string, string[]>, key: string, val: string) => {
    const arr = map.get(key);
    if (arr) arr.push(val);
    else map.set(key, [val]);
  };
  for (const a of valid) {
    for (const b of valid) {
      if (fullyContains(a, b)) {
        pushTo(childrenOf, a.id, b.id);
        pushTo(parentsOf, b.id, a.id);
      }
    }
  }
  return { childrenOf, parentsOf, byId };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2. 役割判定（policy 適用）

/**
 * block が background band 化する parent（container）の資格を満たすか。
 * ①内包 child≥1 ②duration≥policy.min ③context 語 ④非 exclusive 語 ⑥許可 tone。
 */
export function qualifiesAsContainer(
  block: ContainmentBlock,
  relations: ContainmentRelations,
  policy: ContainmentPolicy,
): boolean {
  const children = relations.childrenOf.get(block.id);
  if (!children || children.length === 0) return false; // ① 内包 child あり
  if (block.endMin - block.startMin < policy.minParentDurationMin) return false; // ② 長い
  if (!policy.isContextLabel(block.label)) return false; // ③ context
  if (policy.isExclusiveLabel(block.label)) return false; // ④ 非 exclusive
  // ⑥ tone 制限（v1: existing のみ）。tone 不明は不許可（誤 band 回避）。
  if (!block.tone || !policy.containerTones.includes(block.tone)) return false;
  return true;
}

/**
 * block の役割を決定（pure）。container / contained / normal。
 *   - container: 自身が band 資格を満たす。
 *   - contained: 自分を内包する parent のいずれかが container 資格を満たす。
 *   - normal: それ以外（従来表示＝partial overlap は render 側で layoutLanes）。
 */
export function classifyTimelineBlockRole(
  block: ContainmentBlock,
  relations: ContainmentRelations,
  policy: ContainmentPolicy = DEFAULT_CONTAINMENT_POLICY,
): TimelineBlockRole {
  if (qualifiesAsContainer(block, relations, policy)) return "container";
  const parents = relations.parentsOf.get(block.id) ?? [];
  for (const pid of parents) {
    const parent = relations.byId.get(pid);
    if (parent && qualifiesAsContainer(parent, relations, policy)) return "contained";
  }
  return "normal";
}

/** 全 block の役割を一括判定（convenience・render 側はこれを使う）。 */
export function classifyTimelineRoles(
  blocks: ReadonlyArray<ContainmentBlock>,
  policy: ContainmentPolicy = DEFAULT_CONTAINMENT_POLICY,
): Map<string, TimelineBlockRole> {
  const relations = detectContainmentRelations(blocks);
  const out = new Map<string, TimelineBlockRole>();
  for (const b of blocks) {
    out.set(b.id, classifyTimelineBlockRole(b, relations, policy));
  }
  return out;
}
