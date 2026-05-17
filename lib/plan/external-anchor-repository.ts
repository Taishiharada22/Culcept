/**
 * ExternalAnchorRepository Interface (Wave 1 / W1-4pre-3)
 *
 * 将来 Supabase 実装に差し替えられる ExternalAnchor 保存境界。
 * 本ファイルは interface + types のみ。実装は別ファイル。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.1, §11.2
 *
 * 不変原則:
 *   1. すべての method は userId を明示的に受け取る（auth context への暗黙依存禁止）
 *   2. source と anchors は bundle 作成（atomic）。途中 invalid なら全体 reject
 *   3. source 削除 → anchors も cascade 削除（DB の ON DELETE CASCADE と等価）
 *   4. user 越境アクセス禁止（list は userId でフィルタ、delete は userId 不一致なら no-op）
 *   5. 全 method async（Supabase 実装契約に合わせる）
 *
 * Wave 1 W1-4pre-3 範囲外:
 *   - Supabase 実装（lib/plan/external-anchor-repository-supabase.ts は別タスク）
 *   - API route / UI / Plan 画面接続 / Home 変更
 *   - DB / localStorage / 実 fetch
 *
 * 設計判断のメモ:
 *   - userId は method-level 引数とする（instance scope ではない）
 *     → 1 instance で複数 user データを安全に扱えるため
 *     → user 越境防御を method 内ガードで実現
 *   - 戻り値は discriminated union（W1-7, W1-4pre-1, W1-4pre-2 と同パターン）
 *   - id / now は実装の依存として inject 可能にする（deterministic test）
 */

import type { ExternalAnchor } from "./external-anchor";
import type {
  ExternalAnchorSource,
  ExternalAnchorSourceType,
  RawRetention,
} from "./external-anchor-source";
import type {
  AnchorInputValidationError,
  CreateExternalAnchorInput,
} from "./external-anchor-input";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Source 入力（型付き、unknown ではない）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Source 作成用の入力。
 * id / userId / capturedAt は repository が補完する。
 */
export interface CreateExternalAnchorSourceInput {
  sourceType: ExternalAnchorSourceType;
  originalFilename?: string;
  extractedAt?: string;
  /** default: "discarded"（W1-3 設計、§11.1） */
  rawRetention?: RawRetention;
  rawStoragePath?: string;
  rawExpiresAt?: string;
  notes?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Bundle 入力 / 戻り値（atomic 性の表現）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Source + N anchors の atomic bundle。
 * anchors は空配列でも OK（PDF 抽出失敗時の source-only ログ等の将来用途）。
 */
export interface CreateSourceWithAnchorsInput {
  source: CreateExternalAnchorSourceInput;
  anchors: CreateExternalAnchorInput[];
}

/**
 * Bundle 作成エラー。どの anchor / source の何が問題かを明示する。
 */
export type BundleError =
  | {
      kind: "source_invalid";
      errors: AnchorInputValidationError[];
    }
  | {
      kind: "anchor_invalid";
      /** anchors 配列内のインデックス */
      index: number;
      errors: AnchorInputValidationError[];
    };

/**
 * Bundle 作成結果。失敗時は store に一切書き込まない（atomic）。
 */
export type CreateSourceWithAnchorsResult =
  | {
      ok: true;
      source: ExternalAnchorSource;
      anchors: ExternalAnchor[];
    }
  | {
      ok: false;
      errors: BundleError[];
    };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// deleteSource 戻り値（W1-4pre-3b で明示化）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Source 削除の結果。
 *
 *   - deletedSource: source が実際に削除されたか
 *   - deletedAnchors: cascade で削除された anchors の数（0 可）
 *
 * 戻り値の組み合わせ:
 *   - source あり + user 一致 + anchors N 件 → { deletedSource: true,  deletedAnchors: N }
 *   - source あり + user 一致 + anchors 0 件 → { deletedSource: true,  deletedAnchors: 0 }
 *   - source なし                              → { deletedSource: false, deletedAnchors: 0 }
 *   - source あり + user 不一致                → { deletedSource: false, deletedAnchors: 0 }
 *
 * 意図的に「user 不一致」と「source 不在」を同じ戻り値にしている。
 * これは情報漏洩防止（攻撃者に「この sourceId は他人のもの」と判定させない）。
 * 内部 logging では区別してよいが、API 戻り値には含めない。
 */
export type DeleteExternalAnchorSourceResult = {
  deletedSource: boolean;
  deletedAnchors: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Repository Interface
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ExternalAnchor の保存境界。
 *
 * すべての method は user-scoped（userId 必須）。
 * 同一 instance に複数 user データが共存しても、method ガードで隔離される。
 *
 * 全 method は async（Supabase 実装契約と一致）。memory 実装も Promise でラップする。
 */
export interface ExternalAnchorRepository {
  /**
   * Source + N anchors を atomic に作成する。
   *   - source 入力 + 各 anchor 入力を validate
   *   - 1 件でも invalid → 全体を reject、store に書き込まない
   *   - 全件 valid → source.id を共通参照として anchors を保存
   *
   * 補完される field:
   *   - source.id          = idFactory()
   *   - source.userId      = 引数 userId
   *   - source.capturedAt  = now()
   *   - source.rawRetention default "discarded"
   *   - anchor.id          = idFactory()（各 anchor 個別）
   *   - anchor.userId      = 引数 userId
   *   - anchor.sourceId    = source.id
   *   - anchor.confirmedAt = now()
   */
  createSourceWithAnchors(
    userId: string,
    input: CreateSourceWithAnchorsInput
  ): Promise<CreateSourceWithAnchorsResult>;

  /** 自分の source 一覧（他 user の source は見えない） */
  listSources(userId: string): Promise<ExternalAnchorSource[]>;

  /** 自分の anchor 一覧（他 user の anchor は見えない） */
  listAnchors(userId: string): Promise<ExternalAnchor[]>;

  /**
   * Source を削除する（cascade で関連 anchors も削除）。
   *
   * 戻り値仕様は DeleteExternalAnchorSourceResult を参照。
   * 「source-only」「anchors 0 件削除」「user 不一致」「source 不在」
   * の 4 ケースを {deletedSource, deletedAnchors} で曖昧さなく区別する。
   */
  deleteSource(
    userId: string,
    sourceId: string
  ): Promise<DeleteExternalAnchorSourceResult>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dependencies（id / now の inject）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Repository 実装に注入できる依存。
 * テストの deterministic 化に使う（global state や時刻を排除）。
 */
export interface ExternalAnchorRepositoryDependencies {
  /** default: globalThis.crypto.randomUUID() */
  idFactory?: () => string;
  /** default: new Date().toISOString() */
  now?: () => string;
}
