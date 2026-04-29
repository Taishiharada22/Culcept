/**
 * DraftPlan — Alter が組み立てた今日の流れ
 *
 * Level 0 / 1 / 2 の段階で発火する：
 *   - Level 0: 表示なし（Anchors のみ表示、Alter は組み立てない）
 *   - Level 1: candidate（UI 表現「候補」「ヒント」、断定しない）
 *   - Level 2: draft（UI 表現「下書き」、Alter が代理思考として組み立てた状態）
 *
 * Wave 3 では candidate のみ本実装。draft は contract / stub / 表示枠予約まで。
 * Wave 4 で draft generator 本実装 + Drift Learning（A/E/D 軸）。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.4, §5
 *
 * Wave 1: 型定義のみ（W1-1）。
 *   - generator / repository は Wave 3 以降。
 *   - DB 永続化はまだ行わない。
 */

/**
 * DraftPlan の段階
 *   - candidate: 「候補」「ヒント」表示、Wave 3 で実装
 *   - draft: 「下書き」表示、Wave 4 で実装
 *
 * Level 1 で「下書き」と呼ばないルール（§5）を型レベルで分離する。
 */
export type DraftPlanLevel = "candidate" | "draft";

/** DraftPlan を生成したエンジン種別 */
export type DraftPlanGenerator =
  | "rule"           // ルールベース生成（Wave 3 candidate）
  | "alter_engine";  // Alter generator 本実装（Wave 4 draft）

/** DraftPlan のライフサイクル */
export type DraftPlanStatus =
  | "pending"
  | "viewed"
  | "modified"
  | "accepted"
  | "rejected";

/** DraftPlanItem の発生元 */
export type DraftPlanItemOrigin =
  | "anchor"            // ExternalAnchor 由来
  | "seed"              // PlanSeed 由来
  | "rhythm_inferred";  // Rhythm Fabric から推論

/**
 * DraftPlanItem の rigidity
 *   - hard: ExternalAnchor "hard" 由来、絶対固定
 *   - soft: ExternalAnchor "soft" 由来、再配置候補
 *   - suggestion: PlanSeed / Rhythm 由来、Alter の提案
 */
export type DraftPlanItemRigidity =
  | "hard"
  | "soft"
  | "suggestion";

export interface DraftPlanItem {
  id: string;

  startTime: string;
  endTime?: string;

  title: string;

  origin: DraftPlanItemOrigin;
  rigidity: DraftPlanItemRigidity;

  /** なぜ Alter がここに置いたか */
  reason?: string;

  /** Item ごとの自信度（0-1） */
  confidence: number;
}

/** DraftPlan の生成元参照 */
export interface DraftPlanBasedOn {
  anchorIds: string[];
  seedIds: string[];

  /** 派生元 Rhythm 集計の時点識別子（Wave 4） */
  rhythmSnapshot?: string;
}

export interface DraftPlan {
  id: string;
  userId: string;

  /** 対象日（YYYY-MM-DD） */
  date: string;

  level: DraftPlanLevel;

  items: DraftPlanItem[];

  generatedAt: string;
  generatedBy: DraftPlanGenerator;

  basedOn: DraftPlanBasedOn;

  status: DraftPlanStatus;
}
