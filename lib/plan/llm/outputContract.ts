/**
 * Phase 3-N Plan P2 Step 2 v3.1 — Output Contract V2 (= 3 部明文化 + generic detector)
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §4 + Q5 補正
 *
 * 設計原則 (= GPT 2026-05-25 Q5 補正反映):
 *   - **pure 定数 export** (= LLM / API / DB / network 不使用)
 *   - **既存 lib/stargazer/outputContract.ts pattern 流用** (= OutputContract shape 同一)
 *   - **3 field 構成**:
 *     - fact_acknowledgment (= 予定の事実言及、 required)
 *     - interpretation (= 事実から読める意味、 required)
 *     - style_constraint (= 押しつけない、 prohibitions で機械保証)
 *   - **GPT Q5 補正**: generic self-help 文 detector (= 「自然だけど平均的」 を弾く) を追加
 *
 * 役割:
 *   - promptBuilderV2 が system prompt に promptInstruction を含める
 *   - alterNoteValidatorV2 が fields detector + prohibitions + genericSelfHelpPatterns で post-check
 *
 * 期待効果 (= readiness §4.3):
 *   - v1 出力: 「夕方のカフェで勉強に集中しましょう」 (= 平均 LLM 文)
 *   - v2 出力: 「夕方のカフェ、 学びに静かに沈む時間」 (= fact + interp + style 全部含む、 個別性)
 */

// 注: 本 file は pure 定数 export のみ、 server-only marker 不要 (= prompt 生成 + validation で使う)。

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contract field 型 (= 既存 outputContract.ts pattern と shape 一致)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AlterNoteContractField = {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly detector: RegExp;
};

export type AlterNoteOutputContract = {
  readonly domain: string;
  readonly fields: ReadonlyArray<AlterNoteContractField>;
  readonly minLength: number;
  readonly maxLength: number;
  readonly prohibitions: ReadonlyArray<RegExp>;
  /** GPT Q5 補正: generic self-help 文を弾く pattern */
  readonly genericSelfHelpPatterns: ReadonlyArray<RegExp>;
  readonly promptInstruction: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ALTER_NOTE_CONTRACT_V2 (= readiness §4.2.2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Plan alterNote 用 Output Contract V2
 *
 * 構造:
 *   - 3 field (= fact / interp / style)
 *   - 6-30 字
 *   - prohibitions: 禁止語 10 件 + 強命令 + 評価形容詞 + 数値 + 絵文字
 *   - genericSelfHelpPatterns: 平均的自己啓発文 (= GPT Q5 補正)
 */
export const ALTER_NOTE_CONTRACT_V2: AlterNoteOutputContract = {
  domain: "plan_alter_note",
  fields: [
    {
      name: "fact_acknowledgment",
      description: "予定の事実 (= カテゴリ / 時刻帯 / 場所) を一言で言及",
      required: true,
      // 「カフェ」 「夕方」 「自宅」 等の事実語を含むか
      // (注: 文中の任意位置で一致すれば OK、 純粋な内省文 「集中の時間」 等を reject する目的)
      detector: /カフェ|食事|仕事|会議|学習|学び|自宅|家|朝|昼|午後|夜|深夜|出発|帰宅|食卓|ランチ|オフィス|職場|準備|休息|休憩|散歩|外出/,
    },
    {
      name: "interpretation",
      description: "事実から読める意味 (= 状態 / 流れ / 質感) を一言",
      required: true,
      // 「集中」 「整える」 「ひと息」 「リズム」 等の状態語を含むか
      detector: /集中|整え|整う|ひと息|リズム|切り替え|流れ|時間|過ご|穏や|整理|準備|締め|静か|沈む|戻る|温|落ち着|余白|区切|手放|始ま|広が|向き合|味わ|積み重|呼吸|たどる/,
    },
    {
      name: "style_constraint",
      description: "押しつけない / 観測寄り (= prohibitions で機械検証)",
      required: true,
      // ここは prohibitions 経由で間接検証、 detector は placeholder (= 全文 match)
      detector: /./,
    },
  ],
  minLength: 6,
  maxLength: 30,
  prohibitions: [
    // 禁止語 10 件 (= 押しつけ / 推奨 / 警告 / 危険 / 注意 / リスク / 最適化)
    /おすすめ|これをした方がいい|推奨|改善|警告|危険|注意|リスク|最適化/,
    // 強命令
    /しなさい|すべき|してください|するな|するべからず/,
    // 評価形容詞
    /最適|重要|大事な|ベスト|良いプラン|良い予定|悪い|完璧/,
    // 数値
    /[0-9０-９]+\s*(?:%|％|分|時間|日|秒|円)/,
    // 絵文字 / 改行
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\n\r\t]/u,
  ],
  /**
   * Generic self-help 文 pattern (= GPT Q5 補正、 「自然だけど平均的」 を弾く)
   *
   * 平均的自己啓発文の特徴:
   *   - 文脈なしに 「集中の時間」 「整える時間」 等の状態語が並ぶ短文
   *   - 「ましょう」 単独 + 状態語なし
   *   - 「今日も頑張る」 「明日も新しい」 等の自己啓発書 phrase
   *   - 「あなたの一日が良いものに」 等の generic open-ended
   *
   * 注: detector は補完的 = 全 pattern を網羅できない。 LLM-as-judge 採点と併用。
   */
  genericSelfHelpPatterns: [
    // 「〜時間」 単独で 8 字以下の極短文 (= context なき抽象)
    /^[^、。\s]{0,6}時間$/,
    // 「ましょう」 単独で 状態 / 場 が薄い (= 6 字以下 + 句読点なし)
    /^[^、。]{0,5}しましょう$/,
    // 「今日も〜」 「明日も〜」 + 自己啓発 phrase
    /(今日も|明日も)\s*(頑張|新しい|素敵|素晴|良い|前向)/,
    // 「あなたの一日が」 等の generic open-ended
    /あなたの[^、。]*(一日|毎日)\s*が\s*[^、。]*ように/,
    // 「いい一日を」 等の closing phrase 単独
    /^(いい|良い|素敵な|素晴らしい)\s*(一日|時間)\s*を?$/,
    // 「楽しんで」 単独命令 (= 押し付け系自己啓発)
    /^(さあ|さて)?\s*(楽しんで|頑張って)\s*$/,
  ],
  promptInstruction: [
    "## 出力契約 plan_alter_note (= 3 部統合 1 文)",
    "",
    "**必ず 3 部を 1 文に統合してください** (= 8〜30 字):",
    "",
    "1. **fact_acknowledgment** — 予定の事実 (= カテゴリ / 時刻帯 / 場所) を一言で言及",
    "   - 例: 「夕方のカフェ」 「朝の自宅」 「午後の会議」",
    "2. **interpretation** — 事実から読める意味 (= 状態 / 流れ / 質感) を一言",
    "   - 例: 「学びに静かに沈む時間」 「ゆっくり準備を始める」 「ペースを整える時間」",
    "3. **style_constraint** — 押しつけない / 観測寄り (= 評価形容詞 / 強命令禁止)",
    "",
    "**禁止**:",
    "- 命令形 (= しなさい / すべき / してください)",
    "- 評価形容詞 (= 最適 / 重要 / 良い / 悪い / 完璧)",
    "- 押しつけ語 (= おすすめ / 推奨 / 改善 / 警告 / 危険 / 注意 / リスク / 最適化)",
    "- 数値 (= 30 分 / 2 時間 / 78%)",
    "- 絵文字 / 改行",
    "- 自己啓発書的な generic 文 (= 「今日も頑張ろう」 「いい一日を」 等)",
    "",
    "**良い例 (= 3 部統合)**:",
    "- 「夕方のカフェ、 学びに静かに沈む時間」 (= fact: 夕方+カフェ、 interp: 学び+静かに沈む)",
    "- 「朝の自宅で、 ゆっくり準備を始める」 (= fact: 朝+自宅、 interp: ゆっくり準備)",
    "- 「午後のオフィス、 集中を取り戻す時間」 (= fact: 午後+オフィス、 interp: 集中を取り戻す)",
    "",
    "**悪い例 (= 違反)**:",
    "- 「朝のカフェに行きましょう、 集中の時間です」 (= 命令 「行きましょう」 含む)",
    "- 「最適な午後の会議時間」 (= 評価語 「最適」 違反)",
    "- 「集中の時間」 (= fact 不在、 generic self-help)",
    "- 「今日も頑張ろう」 (= generic 自己啓発 phrase)",
    "",
    "出力 JSON: { \"text\": \"<8-30 字>\" }",
    "意味を読み取れない場合: { \"text\": \"\" } (= 空文字、 deterministic fallback)",
  ].join("\n"),
};
