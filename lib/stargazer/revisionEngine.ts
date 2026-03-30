// lib/stargazer/revisionEngine.ts
// Stargazer Revision Engine — 理解の修正を宣言する仕組み
//
// 設計思想:
// "訂正は信頼を壊さない。「ちゃんと見直してくれている」という信頼を爆発的に高める"
// "2週間ごとに理解の修正を宣言する"
//
// 軸スコアの変化を追跡し、有意なシフトを検出して修正宣言を生成する。

import { TRAIT_AXES, type TraitAxisKey } from "./traitAxes";
import { safeSetItem } from "./localStorageHelper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface Revision {
  id: string;
  /** 以前の評価 */
  previousAssessment: string;
  /** 新しい評価 */
  newAssessment: string;
  /** 修正理由 */
  reason: string;
  /** 対象の特性軸 */
  axis: string;
  /** 以前のスコア (-1 to 1) */
  previousScore: number;
  /** 新しいスコア (-1 to 1) */
  newScore: number;
  /** 修正に至った観測回数 */
  observationsThatChanged: number;
  /** 作成日時 (ms epoch) */
  createdAt: number;
  /** ユーザーが確認済みか */
  acknowledged: boolean;
}

export interface RevisionDeclaration {
  title: string;
  body: string;
  impact: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STORAGE_KEY = "stargazer_revisions_v1";
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/** スコア差がこの閾値を超えると修正宣言を生成する */
const SIGNIFICANT_SHIFT_THRESHOLD = 0.25;

/** 緊急修正の閾値（2週間を待たずに宣言する） */
const URGENT_SHIFT_THRESHOLD = 0.45;

/** 修正宣言に必要な最小観測回数 */
const MIN_OBSERVATIONS_FOR_REVISION = 5;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Axis label helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function axisLabel(key: string, score: number): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  if (!def) return key;
  return score < 0 ? def.labelLeft : def.labelRight;
}

function axisName(key: string): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  if (!def) return key;
  return `${def.labelLeft} vs ${def.labelRight}`;
}

function scoreToPercent(score: number): number {
  return Math.round(((score + 1) / 2) * 100);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Revision templates (10+)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TemplateParams {
  axis: string;
  axisDisplayName: string;
  oldLabel: string;
  newLabel: string;
  oldPercent: number;
  newPercent: number;
  observationCount: number;
  direction: "increased" | "decreased";
}

type RevisionTemplate = (p: TemplateParams) => {
  body: string;
  reason: string;
};

const REVISION_TEMPLATES: RevisionTemplate[] = [
  // 1. 基本修正
  (p) => ({
    body: `2週間前、あなたを「${p.oldLabel}」と分析しましたが、最近の${p.observationCount}回の観測から修正します。あなたは「${p.newLabel}」です。`,
    reason: `${p.observationCount}回の新しい観測データが、以前の分析と異なるパターンを示しました`,
  }),
  // 2. スコア修正
  (p) => ({
    body: `あなたの${p.axisDisplayName}について、私の理解が変わりました。以前は${p.oldPercent}%と見ていましたが、実は${p.newPercent}%でした。`,
    reason: `直近の観測で${p.direction === "increased" ? "より強い" : "より弱い"}傾向が確認されました`,
  }),
  // 3. 正直な告白
  (p) => ({
    body: `正直に言います。あなたの「${p.oldLabel}」について、私は間違っていました。新しい観測から、実際には「${p.newLabel}」に近いことがわかりました。`,
    reason: `以前のデータでは表出していなかった側面が、${p.observationCount}回の追加観測で明確になりました`,
  }),
  // 4. 深層発見
  (p) => ({
    body: `表面的には「${p.oldLabel}」に見えていましたが、深層では「${p.newLabel}」が動いていたことがわかりました。あなたは思ったより複雑です。`,
    reason: `観測の深度が上がり、表面的な行動の下にある本来の傾向が見えてきました`,
  }),
  // 5. 変化の記録
  (p) => ({
    body: `あなたは変わりつつあります。「${p.oldLabel}」だったあなたが、「${p.newLabel}」に移行しているのを${p.observationCount}回の観測で確認しました。`,
    reason: `時間経過に伴うパーソナリティの自然な変化を検出しました`,
  }),
  // 6. 矛盾の解決
  (p) => ({
    body: `あなたの${p.axisDisplayName}で矛盾を感じていましたが、解決しました。${p.oldPercent}%ではなく${p.newPercent}%が正確な数値です。`,
    reason: `以前の矛盾的なデータが整理され、より一貫したパターンが浮上しました`,
  }),
  // 7. 状況依存の発見
  (p) => ({
    body: `「${p.oldLabel}」は特定の状況下でのみ現れる面であり、あなたの基本傾向は「${p.newLabel}」であることが判明しました。`,
    reason: `状況を横断した観測により、コンテキストに依存しない基本傾向が明確になりました`,
  }),
  // 8. 過小評価の修正
  (p) => ({
    body: `あなたの「${p.newLabel}」の傾向を過小評価していました。${p.oldPercent}%だと思っていましたが、${p.newPercent}%が正しい評価です。`,
    reason: `新しい状況での観測が、この傾向の強さを裏付けました`,
  }),
  // 9. 見落としの訂正
  (p) => ({
    body: `見落としていました。あなたの${p.axisDisplayName}において、「${p.oldLabel}」よりも「${p.newLabel}」が支配的です。私の観測が不十分でした。`,
    reason: `データ量の増加により、以前は気づけなかったパターンを検出しました`,
  }),
  // 10. 複合パターンの発見
  (p) => ({
    body: `単純に「${p.oldLabel}」と分類していましたが、実際にはもっと微妙でした。「${p.newLabel}」が${p.newPercent}%の水準で存在しており、状況次第で顕著に現れます。`,
    reason: `複数の軸を交差分析した結果、より正確なプロファイルが構築できました`,
  }),
  // 11. 成長の認識
  (p) => ({
    body: `あなたは成長しています。かつて「${p.oldLabel}」だった領域が「${p.newLabel}」に変わりつつある。これは意識的な変化です。`,
    reason: `${p.observationCount}回の観測を通して、一貫した方向への変化を確認しました`,
  }),
  // 12. 再発見
  (p) => ({
    body: `あなたの「${p.axisDisplayName}」について再考しました。以前の${p.oldPercent}%という評価は表面的でした。${p.newPercent}%という新しい理解は、あなたの行動をより正確に説明します。`,
    reason: `行動パターンの蓄積により、初期評価では捉えきれなかった傾向が浮上しました`,
  }),
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RevisionCheckParams {
  currentScores: Record<string, number>;
  historicalScores: Record<string, { score: number; date: number }[]>;
  lastRevisionAt: number;
  observationsSinceLastRevision: number;
}

/**
 * 修正が必要かチェックする。
 * 2週間ごと、または大きなシフトが検出された場合に Revision を返す。
 */
export function checkForRevision(
  params: RevisionCheckParams,
): Revision | null {
  const {
    currentScores,
    historicalScores,
    lastRevisionAt,
    observationsSinceLastRevision,
  } = params;

  const now = Date.now();
  const timeSinceLastRevision = now - lastRevisionAt;
  const isScheduledCheck = timeSinceLastRevision >= TWO_WEEKS_MS;

  // 最小観測回数に達していなければスキップ
  if (observationsSinceLastRevision < MIN_OBSERVATIONS_FOR_REVISION) {
    return null;
  }

  // 全軸を走査して最大シフトを検出
  let maxShiftAxis: string | null = null;
  let maxShiftAmount = 0;
  let oldScoreForMax = 0;

  for (const [axisKey, currentScore] of Object.entries(currentScores)) {
    const history = historicalScores[axisKey];
    if (!history || history.length === 0) continue;

    // 直近の修正以降の最初のスコアを「以前の評価」とする
    const relevantHistory = history.filter((h) => h.date <= lastRevisionAt);
    const previousScore =
      relevantHistory.length > 0
        ? relevantHistory[relevantHistory.length - 1].score
        : history[0].score;

    const shift = Math.abs(currentScore - previousScore);
    if (shift > maxShiftAmount) {
      maxShiftAmount = shift;
      maxShiftAxis = axisKey;
      oldScoreForMax = previousScore;
    }
  }

  if (!maxShiftAxis) return null;

  // 定期チェック: 閾値以上のシフトがあれば修正
  // 緊急: 大きなシフトは2週間を待たない
  const shouldRevise =
    (isScheduledCheck && maxShiftAmount >= SIGNIFICANT_SHIFT_THRESHOLD) ||
    maxShiftAmount >= URGENT_SHIFT_THRESHOLD;

  if (!shouldRevise) return null;

  const currentScore = currentScores[maxShiftAxis] ?? 0;
  const oldLabel = axisLabel(maxShiftAxis, oldScoreForMax);
  const newLabel = axisLabel(maxShiftAxis, currentScore);

  // テンプレート選択 (日付シードで決定論的)
  const dateStr = new Date().toISOString().split("T")[0];
  const seed = hashStr(`revision_${dateStr}_${maxShiftAxis}`);
  const templateIdx =
    Math.floor(seededRandom(seed) * REVISION_TEMPLATES.length);
  const template = REVISION_TEMPLATES[templateIdx];

  const templateResult = template({
    axis: maxShiftAxis,
    axisDisplayName: axisName(maxShiftAxis),
    oldLabel,
    newLabel,
    oldPercent: scoreToPercent(oldScoreForMax),
    newPercent: scoreToPercent(currentScore),
    observationCount: observationsSinceLastRevision,
    direction: currentScore > oldScoreForMax ? "increased" : "decreased",
  });

  return {
    id: `rev_${dateStr}_${maxShiftAxis}`,
    previousAssessment: oldLabel,
    newAssessment: newLabel,
    reason: templateResult.reason,
    axis: maxShiftAxis,
    previousScore: oldScoreForMax,
    newScore: currentScore,
    observationsThatChanged: observationsSinceLastRevision,
    createdAt: now,
    acknowledged: false,
  };
}

/**
 * 修正宣言テキストを生成する。
 */
export function generateRevisionDeclaration(
  revision: Revision,
): RevisionDeclaration {
  const oldLabel = axisLabel(revision.axis, revision.previousScore);
  const newLabel = axisLabel(revision.axis, revision.newScore);
  const displayName = axisName(revision.axis);
  const oldPercent = scoreToPercent(revision.previousScore);
  const newPercent = scoreToPercent(revision.newScore);

  // テンプレート選択
  const seed = hashStr(`decl_${revision.id}`);
  const templateIdx =
    Math.floor(seededRandom(seed) * REVISION_TEMPLATES.length);
  const template = REVISION_TEMPLATES[templateIdx];

  const result = template({
    axis: revision.axis,
    axisDisplayName: displayName,
    oldLabel,
    newLabel,
    oldPercent,
    newPercent,
    observationCount: revision.observationsThatChanged,
    direction:
      revision.newScore > revision.previousScore ? "increased" : "decreased",
  });

  return {
    title: "理解の修正",
    body: result.body,
    impact: `これにより、あなたの${displayName}に関する予測精度が向上します。今後の判断パターン予測が更新されます。`,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Persistence (localStorage)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 修正を保存する */
export function saveRevision(revision: Revision): void {
  if (typeof window === "undefined") return;
  const all = loadRevisions();
  const idx = all.findIndex((r) => r.id === revision.id);
  if (idx >= 0) {
    all[idx] = revision;
  } else {
    all.push(revision);
  }
  // 最大50件に制限
  const trimmed = all.slice(-50);
  safeSetItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/** 修正を読み込む */
export function loadRevisions(): Revision[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Revision[];
  } catch {
    return [];
  }
}

/** 修正を確認済みにする */
export function acknowledgeRevision(id: string): void {
  if (typeof window === "undefined") return;
  const all = loadRevisions();
  const target = all.find((r) => r.id === id);
  if (!target) return;
  target.acknowledged = true;
  safeSetItem(STORAGE_KEY, JSON.stringify(all));
}

/** 未確認の修正を取得する */
export function getUnacknowledgedRevisions(): Revision[] {
  const all = loadRevisions();
  return all.filter((r) => !r.acknowledged);
}

/** 最後の修正日時を取得する */
export function getLastRevisionTimestamp(): number {
  const all = loadRevisions();
  if (all.length === 0) return 0;
  return Math.max(...all.map((r) => r.createdAt));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}
