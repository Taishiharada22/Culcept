/**
 * CoAlter AOO Phase B — Mirror layer 型定義 (B-2)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164)
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165, merge `2c2be4de`)
 *
 * 役割 (B-2 段階):
 *   Mirror layer (`lib/coalter/mirror/*`) で共有する型定義のみ。
 *   pure / 副作用なし / runtime logic なし。
 *
 * 設計原則:
 *   - **既存 presence layer (`lib/coalter/presence/types.ts`) には touch しない**
 *     - Mirror layer は独自に `MirrorPresenceMode` を定義する
 *     - 値の集合は `lib/coalter/presence/types.ts` の `PresenceMode`
 *       (= `"normal" | "daily" | "travel"`、2026-05-17 時点) と一致させる
 *     - 構造的 drift が発生した場合は別 PR で adapter layer (B-2 後続 / B-3)
 *       で吸収する。本 PR では runtime 接続なし
 *   - **discriminated union による型レベル epistemic safety**:
 *     `MirrorModeContextResult` は `status` で discriminate するため、
 *     `mode` への access には事前に `status === "known"` の判定が必要となる。
 *     `canProceedToMirrorDecision` は型レベル invariant (known => true / unknown => false)。
 *   - **unknown は明示型 (PresenceMode に null や undefined を混ぜない)**:
 *     - 入力で undefined / null / 不明値 → 出力 status = "unknown"
 *     - Mirror Channel の Speak 判定は unknown 時に必ず fail-close
 *       (B-4 で実装、本 PR では canProceedToMirrorDecision: false を返すだけ)
 *
 * 不可侵境界 (B-0 §9 / Phase A 継承):
 *   - lib/coalter/presence/ 全 30+ files 不可侵 (本ファイルは presence type を import しない)
 *   - app/components/chat/ 17 files 不可侵
 *   - lib/coalter/observer/ (Phase A) 不可侵
 *   - components/coalter/mirror/* (B-1 成果物) 不可侵 (B-2 では UI 接続なし)
 */

/**
 * Mirror layer 内部で使う PresenceMode 相当の値型。
 *
 * **構造的に `lib/coalter/presence/types.ts` の `PresenceMode` と一致させる**:
 *   現行 (2026-05-17): `"normal" | "daily" | "travel"`
 *
 * presence layer 側の型変更が起きた場合は別 PR で adapter / migration を作る。
 * 本ファイルが presence type を直接 import すると、Mirror layer が presence layer に
 * runtime / type のいずれかで依存することになるため、意図的に独立定義としている。
 */
export type MirrorPresenceMode = "normal" | "daily" | "travel";

/**
 * `readMirrorModeContext` 入力の source 列挙。
 *
 * - `"presence_state"`: 既存 presence layer / observer 由来 (B-3 以降で runtime 接続予定)
 * - `"explicit_input"`: 明示的に上位 logic から渡されたモード (例: テスト / 将来の手動入力)
 * - `"missing"`: source が未指定 / 取得失敗
 *
 * 上記 3 値以外が入力された場合、reader は `"missing"` に正規化する (fail-closed)。
 */
export type MirrorModeContextSource = "presence_state" | "explicit_input" | "missing";

/**
 * `readMirrorModeContext` 入力。
 *
 * すべて optional (caller 都合で undefined もあり得る):
 *   - presenceMode: `MirrorPresenceMode | null | undefined`
 *   - source: `MirrorModeContextSource | undefined`
 *
 * **重要 (CEO 北極星)**: raw text / message id / user id / session id 等の
 * **PII を含む情報は受け取らない**。型レベルで限定し、内部実装でも
 * これらを参照する経路を持たない (pure function 制約)。
 */
export interface MirrorModeContextInput {
  readonly presenceMode?: MirrorPresenceMode | null;
  readonly source?: MirrorModeContextSource;
}

/**
 * `readMirrorModeContext` 出力 (discriminated union)。
 *
 * 型レベル invariant:
 *   - `status === "known"` ⇔ `mode !== null` ⇔ `canProceedToMirrorDecision === true`
 *   - `status === "unknown"` ⇔ `mode === null` ⇔ `canProceedToMirrorDecision === false`
 *
 * Consumer は `result.status` で discriminate してから `mode` にアクセスする。
 * `canProceedToMirrorDecision` は型レベル literal (true / false) なので、
 * TypeScript narrowing で誤読を構造的に防げる。
 */
export type MirrorModeContextResult =
  | {
      readonly status: "known";
      readonly mode: MirrorPresenceMode;
      readonly source: MirrorModeContextSource;
      readonly canProceedToMirrorDecision: true;
    }
  | {
      readonly status: "unknown";
      readonly mode: null;
      readonly source: MirrorModeContextSource;
      readonly canProceedToMirrorDecision: false;
    };
