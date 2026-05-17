/**
 * CoAlter AOO Phase B B-5b — Linguistic Stop Detector (explicit command only, no inference)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §10.3
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *
 * 役割 (B-5b 段階):
 *   ユーザーの明示的「黙ってもらう」要求を **substring exact match** で検出する pure function。
 *
 *   B-5b では本 detector は **runtime 接続なし** (chat layer 経由で safe な raw text を
 *   受ける API がまだ確立されていない、chat layer touch 禁止)。実装は pure function として
 *   存在させ、test で behavior を保証する。runtime 接続は B-5c smoke or 別 PR で chat layer
 *   側の safe input pipe が整ってから。
 *
 * 設計原則 (Phase B 北極星「誤読を避ける」):
 *   - **明示的 substring match のみ**: sentiment / mood / tone 推測一切なし
 *   - **LLM 一切使わない**: NLP / sentiment classifier / embedding 一切なし
 *   - **persistence なし**: raw utterance を保存しない (argument のみ受け取り即評価、return only)
 *   - **false positive 慎重**: 短すぎる単語 (「やめて」「いらない」単体) は除外
 *     → 文脈次第で「やめて (笑)」など意図しない blocking を防ぐ
 *   - **conservative**: 検出しないより検出しすぎる方が**ユーザー体験的に重大**
 *     → 「黙る」が北極星なので、検出時は ALWAYS sleep ON (撤回機構あり、明示再開のみ)
 *
 * 検出 pattern (3 command categories):
 *   1. `silence_request`: 「黙ってて」「黙って」「黙れ」
 *   2. `not_needed_now`: 「今は不要」「今はいらない」「いまは不要」「いまはいらない」
 *      (※「いらない」単体は false positive 多 → 「今は」修飾子必須)
 *   3. `explicit_suppression`: 「出さないで」「言わないで」「コメントしないで」「アドバイスしないで」
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1〜B-5a zero diff (本 file は新規)
 *   - LLM / NLP / sentiment 一切なし
 *   - raw utterance 保存なし (argument のみ受け取り、return 後即廃棄)
 *
 * 接続注意事項 (B-5b では実施しない):
 *   - chat message に subscribe する pipe は **chat layer touch が必要** → B-5b では禁止
 *   - runtime 接続が必要になった時点で chat layer 側に safe API を新規追加するか、
 *     既存の安全な channel (sleep UI button) を main path として扱うかを CEO 判断する
 */

import type {
  LinguisticStopCommand,
  LinguisticStopDetectionResult,
} from "./visibleMirrorTypes";

/**
 * 明示的 stop command の substring set (各 command category と 1:n mapping)。
 *
 * 配列順は match priority に影響しない (全 set を順次 scan、最初に match した category を返す)。
 *
 * false positive 慎重原則:
 *   - 「いらない」「やめて」「うるさい」等の単体短語は **除外** (誤検出多)
 *   - 「今は」「これは」等の修飾子付き表現を要求 (意図明示)
 */
const STOP_COMMAND_PATTERNS: ReadonlyArray<{
  readonly category: LinguisticStopCommand;
  readonly patterns: ReadonlyArray<string>;
}> = [
  {
    category: "silence_request",
    patterns: ["黙ってて", "黙って", "黙れ", "黙りなさい"],
  },
  {
    category: "not_needed_now",
    patterns: ["今は不要", "今はいらない", "いまは不要", "いまはいらない"],
  },
  {
    category: "explicit_suppression",
    patterns: [
      "出さないで",
      "言わないで",
      "コメントしないで",
      "アドバイスしないで",
      "口を出さないで",
    ],
  },
] as const;

/**
 * 明示的言語停止コマンドを検出する pure function。
 *
 * **検出方針**:
 *   - 各 category の patterns を順次 substring scan
 *   - 最初に match したカテゴリを返す
 *   - 1 つも match しない → `{ detected: false }`
 *
 * **絶対不変**:
 *   - sentiment / mood / tone 推測なし
 *   - LLM / NLP / embedding 一切なし
 *   - text mutation なし
 *   - persistence なし (argument のみ参照、return 後は raw text への参照を保持しない)
 *   - log / remote 送信なし
 *
 * @param text - ユーザー発話 (caller の責任で渡される、本 function は保存しない)
 * @returns {@link LinguisticStopDetectionResult}
 *
 * @example
 *   detectLinguisticStop("少し黙ってて")
 *   // → { detected: true, command: "silence_request" }
 *
 *   detectLinguisticStop("今は不要です")
 *   // → { detected: true, command: "not_needed_now" }
 *
 *   detectLinguisticStop("コメントしないで欲しい")
 *   // → { detected: true, command: "explicit_suppression" }
 *
 *   detectLinguisticStop("ちょっと疲れた")
 *   // → { detected: false }  (sentiment 推測しない、明示コマンドなし)
 *
 *   detectLinguisticStop("いらない")  // 単体は false positive リスクで非検出
 *   // → { detected: false }
 */
export function detectLinguisticStop(
  text: string,
): LinguisticStopDetectionResult {
  // empty / falsy → false (defensive)
  if (typeof text !== "string" || text.length === 0) {
    return { detected: false };
  }

  for (const { category, patterns } of STOP_COMMAND_PATTERNS) {
    for (const p of patterns) {
      if (text.includes(p)) {
        return { detected: true, command: category };
      }
    }
  }

  return { detected: false };
}

/**
 * **Test only**: 全 stop command category を取得 (exhaustiveness check 用)。
 */
export function __getAllStopCommandCategoriesForTest(): ReadonlyArray<LinguisticStopCommand> {
  return STOP_COMMAND_PATTERNS.map((g) => g.category);
}

/**
 * **Test only**: 各 category の pattern list を取得 (regression テスト用)。
 */
export function __getStopCommandPatternsForTest(): ReadonlyArray<{
  readonly category: LinguisticStopCommand;
  readonly patterns: ReadonlyArray<string>;
}> {
  return STOP_COMMAND_PATTERNS;
}
