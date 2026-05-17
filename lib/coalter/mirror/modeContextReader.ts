/**
 * CoAlter AOO Phase B — Mirror modeContext read path (B-2)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 / §9.2
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165, merge `2c2be4de`)
 *     §2.2 (B-2 micro-PR), §6 (Unknown handling), §9 (不変境界)
 *   - 型定義: ./types.ts (B-2 で新設)
 *
 * **北極星 (CEO 2026-05-17)**:
 *   > Mirror が話す前に、そもそも今どの Presence Mode なのかを
 *   > **安全に・副作用なく・誤読せずに**読めるようにする。
 *
 * 役割 (B-2 段階):
 *   `MirrorPresenceMode` (`"normal" | "daily" | "travel"`) を **pure / deterministic /
 *   side-effect-free** に正規化する。
 *
 *   入力:
 *     - `input.presenceMode`: PresenceMode 値 / null / undefined
 *     - `input.source`: 取得経路 (`"presence_state" | "explicit_input" | "missing"`)
 *
 *   出力 (discriminated union, ./types.ts 参照):
 *     - `{ status: "known", mode: ..., source, canProceedToMirrorDecision: true }`
 *     - `{ status: "unknown", mode: null, source, canProceedToMirrorDecision: false }`
 *
 *   unknown 判定条件 (B-0 plan §6 unified policy):
 *     - presenceMode が null / undefined / 不明値 → unknown
 *     - 上記の場合 canProceedToMirrorDecision === false (型レベル literal、
 *       B-4 で実装される Speak Decision Engine の Safe Gate で必ず fail-close される)
 *
 * 設計境界 (CEO 指示 + B-0 §9):
 *   - **既存 presence layer (`lib/coalter/presence/*`) を読み書きしない**:
 *     本関数は input を引数で受け取る pure function。runtime 接続 (presence ↔ mirror
 *     bridge) は **後続 PR (B-3 以降) の adapter layer で実装する**
 *   - **入力に raw text / message id / user id / session id を一切受け取らない**:
 *     型定義 (`MirrorModeContextInput`) で物理的に制限
 *   - **副作用なし**: I/O / network / storage / DOM / event / log / timer 一切なし
 *   - **入力の mutation なし**: input object を変更せず、新規 result object を返す
 *   - **deterministic**: 同じ入力に対して常に同じ出力
 *
 * No-Effect Contract (B-1 から継承):
 *   - listener / state / effect / subscription なし
 *   - network / storage / cookie / IndexedDB なし
 *   - timer / requestAnimationFrame なし
 *   - console 出力なし
 *   - 既存 chat / presence / observer state への mutation なし
 *
 * B-3 / B-4 / B-5 計画 (本関数は変更しない):
 *   - B-3: bucket inference pure functions が本関数を参照する可能性あり (input として
 *     渡される、本関数を import せず CALLER 側で結果を受け取る)
 *   - B-4: ERV / Three-Gate Decision Engine が unknown 時に fail-close する
 *     (Safe Gate で `canProceedToMirrorDecision === false` を AND 条件として強制)
 *   - B-5: canary 時に presence ↔ mirror bridge adapter が runtime 接続する
 *     (本関数は変更不要、入力を渡せばよい)
 *
 * 不可侵境界:
 *   - lib/coalter/presence/ 全 30+ files (本ファイルは import しない)
 *   - app/components/chat/ 17 files
 *   - lib/coalter/observer/ (Phase A)
 *   - components/coalter/mirror/* (B-1 成果物、B-2 では UI 接続なし)
 *   - lib/coalter/flags.ts (B-1 で導入済の strict parser、B-2 では touch しない)
 */

import type {
  MirrorModeContextInput,
  MirrorModeContextResult,
  MirrorModeContextSource,
  MirrorPresenceMode,
} from "./types";

/**
 * 受理可能な PresenceMode の whitelist。
 * 厳密 string equality でのみ match。typo / 大文字小文字 / whitespace 違いは reject。
 */
const KNOWN_MODES: ReadonlySet<MirrorPresenceMode> = new Set<MirrorPresenceMode>([
  "normal",
  "daily",
  "travel",
]);

/**
 * 受理可能な source の whitelist。
 * これ以外 (undefined / 不明値) は `"missing"` に正規化する (fail-closed)。
 */
const KNOWN_SOURCES: ReadonlySet<MirrorModeContextSource> = new Set<MirrorModeContextSource>([
  "presence_state",
  "explicit_input",
  "missing",
]);

/**
 * source 値を whitelist で正規化する pure helper。
 *
 * - 既知の source なら そのまま返す
 * - undefined / 不明値 → `"missing"` (fail-closed: provenance 失われたが
 *   下流の処理は `"missing"` として明示的に扱う)
 */
function normalizeSource(rawSource: unknown): MirrorModeContextSource {
  if (typeof rawSource !== "string") return "missing";
  // ReadonlySet.has の型は MirrorModeContextSource なので、unknown を直接渡せず check 経由で narrow
  if (rawSource === "presence_state" || rawSource === "explicit_input" || rawSource === "missing") {
    return rawSource;
  }
  return "missing";
}

/**
 * presenceMode 値が `MirrorPresenceMode` whitelist に一致するかを判定する pure type guard。
 *
 * 厳密 string equality (case sensitive, no trim) で判定:
 *   - `"normal"` / `"daily"` / `"travel"` のみ true
 *   - null / undefined / 空文字 / `"Normal"` / `" normal "` / 不明 string → false
 */
function isKnownMode(raw: unknown): raw is MirrorPresenceMode {
  return typeof raw === "string" && KNOWN_MODES.has(raw as MirrorPresenceMode);
}

/**
 * Mirror Channel 用 modeContext を **pure / deterministic / side-effect-free** に読む。
 *
 * 入力検証 → 結果 (discriminated union) を返す。runtime 接続なし、I/O なし、
 * mutation なし、副作用一切なし。
 *
 * @param input - {@link MirrorModeContextInput}
 *   - `presenceMode`: 値 / null / undefined を受け付ける
 *   - `source`: 取得経路の hint (未指定 / 不明値は `"missing"` に正規化)
 *
 * @returns {@link MirrorModeContextResult}
 *   - `status === "known"`: presenceMode が whitelist に一致
 *   - `status === "unknown"`: それ以外すべて (Mirror の Speak 判定は fail-close 必須)
 *
 * @example
 *   readMirrorModeContext({ presenceMode: "normal", source: "presence_state" })
 *     // → { status: "known", mode: "normal", source: "presence_state",
 *     //     canProceedToMirrorDecision: true }
 *
 *   readMirrorModeContext({ presenceMode: null, source: "presence_state" })
 *     // → { status: "unknown", mode: null, source: "presence_state",
 *     //     canProceedToMirrorDecision: false }
 *
 *   readMirrorModeContext({})
 *     // → { status: "unknown", mode: null, source: "missing",
 *     //     canProceedToMirrorDecision: false }
 */
export function readMirrorModeContext(
  input: MirrorModeContextInput,
): MirrorModeContextResult {
  // input.source を whitelist で正規化 (未指定 / 不明値 → "missing")
  const normalizedSource: MirrorModeContextSource = normalizeSource(input.source);

  // input.presenceMode を whitelist で判定
  if (isKnownMode(input.presenceMode)) {
    return {
      status: "known",
      mode: input.presenceMode,
      source: normalizedSource,
      canProceedToMirrorDecision: true,
    };
  }

  // unknown 経路: null / undefined / 不明値 / 不正型 すべてここに落ちる
  return {
    status: "unknown",
    mode: null,
    source: normalizedSource,
    canProceedToMirrorDecision: false,
  };
}
