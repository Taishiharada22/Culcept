# Bug-1 設計 — 感情 × retrieval 並列化

**作成日**: 2026-04-24
**ステータス**: CEO 固定判断待ち（v0.2）
**対象**: 旧 `NO_SEARCH_PATTERNS`（→ 本設計で正本名 `EMOTION_TAG_LEXEMES`）起因の retrieval 不発火（Bug-1 = Pattern A）
**非対象**: Bug-2（catalog→theater=null drop）／P3 以降／感情の長期履歴化

---

## 0. 本書の位置づけ

CEO 裁定「naive fix（`NO_SEARCH_PATTERNS` 全廃）却下、稚拙」を受けて、Bug-1 を **構造から直す** ための設計書。

- **前提 doc**:
  - `docs/coalter-handoff-2026-04-19-retrieval-investigation.md` §5.1 / §7.1 / §8（北極星）
  - `docs/coalter-food-diagnostics.md`（食事側の監査契約 = 回帰観測の軸）
  - `docs/coalter-phase2-freeze-checklist.md`（凍結線）
- **既存コード**:
  - `lib/coalter/webConnector.ts`（decideSearch / searchAndFilter / NO_SEARCH_PATTERNS）
  - `lib/coalter/u3Telemetry.ts`（`hasActionableConstraintsByTheme` 等）
  - `lib/coalter/conversationParser.ts`（analyzeConversation / `ConversationAnalysis`）
  - `lib/coalter/types.ts`（`ConversationAnalysis` 型）
  - `lib/coalter/engine.ts:189-221`（analysis → decideSearch → searchAndFilter → orchestrator の導線）

本書は **実装判断に使える粒度** を目標にする。ファイル単位・関数シグネチャ単位まで落とす。ただし Bug-1 より外側（Bug-2 / P3 以降）は抱え込まない。

---

## 1. 問題定義（Bug-1 が何で、naive fix がなぜ却下されたか）

### 1.1 現象

- `theme = movie`（または food / travel / activity）と判定された会話で、
- 会話テキストに「気分 / 迷う / 仲 / 気持ち / 感情 / 距離感 / すれ違い / 誤解 / 喧嘩」のいずれかが含まれると、
- `decideSearch()` が `NO_SEARCH_PATTERNS` hit で `shouldSearch=false` を返し、
- `movieOrchestrator` / `foodOrchestrator` は起動するが `searchCandidates = []` で
- ユーザーには「質問だけ・候補ゼロ」のカードが届く。

### 1.2 構造的矛盾（CEO 指摘）

```
同じ ConversationAnalysis が、
  dispatch 側  → theme=movie で orchestrator 起動
  retrieval 側 → 感情語 hit で「検索不要」
```

**1 つの analysis が 2 つの判断を出している**。これは設計の矛盾で、データ側の欠陥ではない。

### 1.3 該当コード

`lib/coalter/webConnector.ts:82-86`

```ts
const NO_SEARCH_PATTERNS = [
  /気持ち|感情|気分/,       // 感情の話は検索不要
  /関係|仲|距離感/,         // 関係性の話は検索不要
  /すれ違い|誤解|喧嘩/,     // すれ違いは内部処理
];
```

この 3 系統のパターン hit 時に `shouldSearch=false` へ短絡する。

### 1.4 却下された naive fix と却下理由

**naive fix 案**: 「`NO_SEARCH_PATTERNS` を無視する」もしくは「SEARCH_REQUIRED_THEMES に対しては全廃」

**CEO 却下理由**:

1. 感情は「検索を止める理由」ではない → 単に外すだけでは感情の情報が活きない
2. 感情読み取りは **CoAlter の提案の核** である → 検索のオン・オフの flag で扱うべきものではない
3. 単純に deny list を緩めるだけでは、「感情は読まれたまま放置」され、CoAlter の価値（関係性に即した編集）に接続しない

### 1.5 本書の問題設定

naive fix が扱わなかった「**感情を読み取り、同時に現実世界の情報も取り、両方を提案に織り込む**」を構造として実現する。
つまり、**感情理解 と retrieval を排他（OR）から並列（AND）へ** 転換する。

---

## 2. 設計原則

### 2.1 感情は排他ゲートではなく、抽出器である

- 現在: 「感情語 hit → 検索しない」
- 設計: 「感情語 hit → `emotionTags` を抽出して `analysis` に保存」+「retrieval は別基準で独立判断」

感情語検出の結果物を **`ConversationAnalysis.emotionTags: EmotionTag[]`** として残し、
retrieval / narration の双方が読める構造にする。

### 2.2 感情理解と retrieval は並列（同じ analysis の別フィールド）

両者は独立した責務。`analysis` を 1 つの multiplex パイプとして扱い、
感情タグ抽出と retrieval 判断が **同一 analysis から二つの独立した判断** を出す。

- **感情パイプ**: `extractEmotionTags(analysis) → EmotionTag[]`
- **検索パイプ**: `decideSearch(analysis) → SearchDecision`

両者に階層関係はない。fusion は L5 提案生成で行う（§3.3）。

### 2.3 感情抽出と retrieval の **失敗独立**（Failure Independence）— 条文

以下は本設計の**不可侵条文**とする。将来の実装者が暗黙に直列依存を戻すことを防ぐため、
条文として明記する。

1. **`extractEmotionTags` が失敗（例外 / 未実装 / 空返却）しても、`decideSearch` の判定はそれ自体で継続する。**
   感情抽出器の障害が retrieval 判定に波及してはいけない。
2. **`emotionTags = []` は正常系である。**
   空配列は「感情語が検出されなかった」の意味であり、エラーではない。下流が空を「何か壊れた」と解釈してはいけない。
3. **`emotionTags` の有無で `decideSearch` の gate 条件が変わってはいけない。**
   `decideSearch` は `emotionTags` を**入力として参照しない**。参照する実装が増えた瞬間、本設計の失敗独立原則は崩れる。
4. **telemetry は `retrieval_fired` と `emotion_tags_found` を別カラムで分離記録する。**
   集計で両者の相関を事後に見るのは可、事前に一方を他方の関数として定義するのは不可。
5. **`extractEmotionTags` の例外は catch して `emotionTags = []` に倒す。** retrieval を止めない。

この 5 条を満たさない実装は、本設計書の実装とは認めない。

### 2.4 retrieval gate は actionable-first（感情は gate 条件から外す）

既存 `hasActionableConstraintsByTheme()` は theme ごとに
「検索して意味のある具体性」（location / time / target / preference）を判定する。
**retrieval の gate はこの actionable 判定のみで行う**。
感情の有無は retrieval の判断に入れない。

### 2.5 感情タグは「提案の核」として L5 に届く

Narration（`narrationBuilder` / `stage1Narration` / `movieOrchestrator` narration 層）は、
`analysis.emotionTags` を読んで、導入文 / veto / bridge / today_hook に反映する。
「Aさんは今夜迷っている / Bさんは仲の話を持ち込んでいる」といった解釈が narration 由来となる。

### 2.6 凍結線は一切触らない

- `isExecutorThemeEnabled(theme) === "movie"`（`coalterDispatch.ts:141-143`）は触らない
- Phase 2 3-mode body（dispatch / router / modifier / gate）は触らない
- 本設計は **retrieval 層と analysis 層のみで閉じる**（handoff §7.5 線）

---

## 3. 実行フロー

### 3.1 全体図

```
ConversationTurn[]
    ↓
analyzeConversation()
    ↓                 ↘
ConversationAnalysis     └─→ extractEmotionTags(analysis)  ← NEW
   (既存フィールド)                  ↓
    ↓                             EmotionTag[]
    ↓                                   ↓
decideSearch(analysis)  ← 再設計          ↓
    ↓                                   ↓
SearchDecision                    analysis.emotionTags
    ↓                                   ↓
searchAndFilter()  ← 変更なし            ↓
    ↓                                   ↓
SearchCandidate[]                        │
    ↓                                   ↓
movieOrchestrator / foodOrchestrator ← analysis.emotionTags 参照
    ↓
ProposalCard（narration に emotion tag が織り込まれる）
```

### 3.2 責務分離

| 層 | 責務 | 入力 | 出力 |
|----|------|------|------|
| `extractEmotionTags` | 感情語 → 正規化タグへの変換 | `ConversationAnalysis` | `EmotionTag[]` |
| `decideSearch`（再設計後） | **actionable のみで** search 可否を判断 | `ConversationAnalysis` | `SearchDecision` |
| `searchAndFilter` | EXA 検索実行、page type filter | `SearchDecision`, profiles | `SearchCandidate[]` |
| `movieOrchestrator` / `foodOrchestrator` | 候補 → catalog → rank → narration | `analysis`（emotionTags 含む）, `searchCandidates` | `ProposalCard` |
| `narration` 層 | emotion tag を導入文 / bridge に織り込む | `analysis.emotionTags`, ranked候補 | narration 文字列 |

### 3.3 fusion の原則（L5 側）

感情タグと検索結果は L5 で **並列** に読まれ、提案に両方が反映される:

- **導入文**: 感情タグから組む（例: 「気分で迷っているふたりに、気分で選べる 3 本を」）
- **veto**: 感情タグ × プロフィールで選別（例: 「疲れ」気分 × 静かさ志向 → コメディ除外）
- **bridge**: 感情タグを接続語として使う（例: 「仲の話題がここまで出ていたので、共感しやすい作品を選んだ」）
- **候補**: 検索結果 → catalog → rank で物理世界情報（title / theater / price）を保証

どちらかが欠落したら fallback する（§5.4 失敗モード参照）。

---

## 4. 入出力仕様

### 4.1 新規型: `EmotionTag`

`lib/coalter/types.ts` に追加。

```ts
/** 感情タグの分類（tag フィールドの取りうる値）。retrieval には影響しない。narration / reasoning 用 */
export type EmotionCategory =
  | "mood"        // 気持ち / 感情 / 気分
  | "indecision"  // 迷い / 分からない / どっちも
  | "relation"    // 関係 / 仲 / 距離感
  | "friction";   // すれ違い / 誤解 / 喧嘩

/** 感情の極性（任意、lexeme から簡易推定）。hard filter 禁止 */
export type EmotionPolarity = "positive" | "negative" | "neutral";

/**
 * 会話から抽出された感情タグ。
 *
 * - 排他ゲートではない。retrieval の shouldSearch には影響させない。
 * - narration / proposalGenerator が導入文や bridge で参照する。
 * - 複数カテゴリを並列に保持する（「気分」と「迷い」は両立する）。
 *
 * 本フィールドセットは本設計の **最小核**。意図的に簡素にし、偽の精密さを排除する（§7.4 参照）。
 */
export interface EmotionTag {
  /** カテゴリタグ */
  tag: EmotionCategory;
  /** hit した literal 語（例: "気分" / "迷う"）— telemetry / narration 用 */
  source_lexeme: string;
  /** どちらの発話に含まれたか（A / B / both / unknown） */
  speaker: "user_a" | "user_b" | "both" | "unknown";
  /** 感情極性（任意）。lexeme から決まる場合のみ付ける。無ければ undefined */
  polarity?: EmotionPolarity;
}
```

**意図的に持たないフィールド**（今回非採用、§7.4 参照）:

- `confidence`: lexeme match ベースなので意味のある連続値にならない。偽の精密さを招くため今回入れない。将来抽出器を高度化する際に別論点で再導入する。

### 4.2 `ConversationAnalysis` 拡張

```ts
export interface ConversationAnalysis {
  // 既存フィールドそのまま...
  theme: ConversationTheme;
  stalemate: string | null;
  recentMessages: ConversationTurn[];
  caringIntensityA: number;
  caringIntensityB: number;
  extractedConstraints: ExtractedConstraints;
  constraintScore: number;
  agreedConstraints?: AgreedConstraint[];
  topicAnchor?: TopicAnchor;
  primaryScopeCount?: number;
  backgroundScopeCount?: number;

  /** Bug-1 設計: 感情タグ（retrieval には影響しない。narration / reasoning 用）*/
  emotionTags: EmotionTag[];  // NEW
}
```

- 空配列は有効（「感情語ゼロ」の状態）
- 既存コードは `emotionTags` を無視しても動作する（非破壊）

### 4.3 `extractEmotionTags`（新規関数）と `EMOTION_TAG_LEXEMES`（正本名）

`lib/coalter/conversationParser.ts` に追加、`analyzeConversation()` の返り値構築時に呼ぶ。

**正本名の扱い**: 旧 `NO_SEARCH_PATTERNS`（`lib/coalter/webConnector.ts:82`）は意味論が誤りを含むため（「検索しない根拠」ではなく「感情タグの語彙」であるべき）、Phase 1 の時点で **正本名を `EMOTION_TAG_LEXEMES` に切り替える**。詳細は §4.4 / §6.3。

```ts
/**
 * 会話から感情タグを抽出する。
 *
 * - `EMOTION_TAG_LEXEMES`（正本）のリテラル語彙をカテゴリ別に構造化
 * - speaker 属性は direct message 単位で検出し、複数話者が同じ語を使ったら "both"
 * - retrieval には影響しない（decideSearch とは独立）
 * - 失敗独立原則（§2.3）: 本関数が例外を投げても呼び出し側は [] を受け取って継続する
 */
export function extractEmotionTags(
  analysis: ConversationAnalysis,
  userAId: string,
  userBId: string,
): EmotionTag[];
```

**語彙表**（初版、`EMOTION_TAG_LEXEMES` の中身）:

| tag | source_lexeme | polarity（任意） |
|-----|---------------|-----------------|
| mood | 気持ち, 気分, 感情 | neutral |
| indecision | 迷う, 迷い, 分からない, どっちも | neutral |
| relation | 関係, 仲, 距離感 | neutral |
| friction | すれ違い, 誤解, 喧嘩 | negative |

初版は旧 `NO_SEARCH_PATTERNS` と 1:1 対応（互換を取るため）。以降の拡張は `indecision` カテゴリへの「どっちでもいい / ピンと来ない」等を別 PR で増やす。

### 4.4 `decideSearch` の再設計

`lib/coalter/webConnector.ts`

**現状**:

```ts
if (!SEARCH_REQUIRED_THEMES.has(theme)) return { shouldSearch: false, ... };
if (NO_SEARCH_PATTERNS hit) {
  if (abolitionActive && hasActionable) continue;   // Step B bypass
  else return { shouldSearch: false, ... };          // 排他ゲート
}
return buildSearchDecisionCore();
```

**再設計後**:

```ts
if (!SEARCH_REQUIRED_THEMES.has(theme)) return { shouldSearch: false, ... };

const { hasActionable, breakdown } = hasActionableConstraintsByTheme(analysis, theme);
if (!hasActionable) {
  // 感情の有無に関係なく、actionable でないなら検索しても意味がない
  return {
    shouldSearch: false,
    reason: "actionable 制約ゼロ — 検索して意味のある具体性が無い",
    queries: [],
    ...
  };
}

// 感情タグがあろうが無かろうが、actionable ならば検索する
return buildSearchDecisionCore(analysis, combined);
```

**重要**:
- 語彙リストの **正本名を Phase 1 時点で `EMOTION_TAG_LEXEMES` に切る**（`lib/coalter/emotionLexemes.ts` 新設 or `conversationParser.ts` 近辺で定義）
- 旧 `NO_SEARCH_PATTERNS` は **deprecated alias として一時的に残す**（物理削除は Phase 2、preview 観測後）
- `decideSearch` はいずれの名前も **参照しない**（感情語判定は `decideSearch` の責務から除外される）
- 感情検出は `extractEmotionTags` 側へ完全移管
- `isU3AbolitionActive` flag / `u3_gate` telemetry は **本設計で役目を終える**。段階的廃棄する（§6.3）

**名前改訂の意図**:
「検索しない根拠」を表す名前（`NO_SEARCH_PATTERNS`）を残したまま中身を「感情タグ語彙」に変えると、
次の実装者が再び gate と誤読する。**削除は後回しでよいが、意味の改名は先にやる**。

### 4.5 retrieval 不発火時の扱い

`decideSearch` が `shouldSearch=false` を返した場合:

1. `searchCandidates = []`
2. `movieOrchestrator` / `foodOrchestrator` は candidate ゼロでも起動は**できるが**、
   - narration 側で `analysis.emotionTags.length > 0` なら **「感情を読んで質問を返す」clarify 系応答** に倒す
   - `emotionTags.length === 0` かつ actionable ゼロなら「何も分からないので具体化を促す」質問へ
3. カードが「質問だけ・候補ゼロ」になる場合でも、emotion tag を narration 冒頭に使う（「気分で迷ってるみたいだね、どっち寄り？」）

つまり **retrieval 不発火は「沈黙」ではなく「感情読みで応答する」状態** と定義する。

---

## 5. 失敗モード

### 5.1 感情に引っ張られすぎる

**症状**: emotion tag が強すぎて候補選択が極端に絞られる。例: 「悲しい」→ コメディ全除外 → 候補ゼロ。

**対策**:
- emotion tag は narration / bridge / veto で **優先順位付けにのみ使う**。hard filter にはしない。
- 「hard filter として使用しない」ことを **型契約として明文化**する（§4.1 コメント）。
- movieOrchestrator / foodOrchestrator の ranker 層では emotion tag は **reweighting** のみ（±0.1 程度の軸）に留める。
- `EmotionTag.polarity` が `negative` であっても、`positive` な候補を drop する根拠にはならない（narration 側で言及するだけ）。

### 5.2 検索しすぎる

**症状**: `NO_SEARCH_PATTERNS` 撤廃により、感情語を含む全発話で web 検索が走る → コスト / 低品質。

**対策**:
- gate は `hasActionableConstraintsByTheme` に一本化。actionable ゼロなら検索しない（§4.4）。
- TOPIC_BURST_GAP_MS（既存の U1b）で「直前の別話題」混入を排除する既存ガードは維持。
- telemetry `[CoAlter] webConnector.decision` に `hasActionable` / `breakdown` を出し続け、
  「感情語あり && actionable なし」の発生比率を観測する（§7 検証方法）。

### 5.3 逆に抑制しすぎる

**症状**: 新しい actionable gate が狭すぎて、以前 U3 abolition が通していたケースでも skip に戻る。

**対策**:
- `hasActionableConstraintsByTheme` の既存実装を**変更しない**（theme ごとの判定ロジックは現状維持）。
- Step B の U3 abolition flag を OFF にした際に skip 率が跳ね上がらないことを、
  **既存 telemetry（`u3_gate_applied` / `would_have_searched_without_u3`）を使って事前検証**する。
- 移行は flag で段階化する（§6 移行戦略）。

### 5.4 fusion の失敗

**症状**: 検索は成功したが emotion tag がゼロで、narration が機械的になる。逆に emotion tag は豊富だが候補ゼロで、narration が抽象論で終わる。

**対策**:
- **candidates ≥ 1 && emotionTags ≥ 1**: 正常系。両方を narration で使う。
- **candidates ≥ 1 && emotionTags = 0**: 既存の narration flow そのまま（感情は無い、候補は返す）。
- **candidates = 0 && emotionTags ≥ 1**: 候補なし質問カード。narration 冒頭で emotion tag を読み取って質問を絞り込む。
- **candidates = 0 && emotionTags = 0**: 「具体化を促す」質問カード。従来の clarify 系と同じ。

---

## 6. 既存系との接続点

### 6.1 変更する既存ファイル

| ファイル | 変更内容 | 非破壊性 |
|---------|---------|---------|
| `lib/coalter/types.ts` | `EmotionCategory` / `EmotionPolarity` / `EmotionTag` 型追加 / `ConversationAnalysis.emotionTags` 追加（空配列 default） | 非破壊 |
| `lib/coalter/emotionLexemes.ts`（新規 or `conversationParser.ts` 内） | `EMOTION_TAG_LEXEMES`（正本名）を新設し、カテゴリ別語彙を構造体として export | 新規 |
| `lib/coalter/conversationParser.ts` | `extractEmotionTags` 追加、`analyzeConversation` 返り値に組み込む。try/catch で失敗独立を保証 | 非破壊（既存呼び出し元は emotionTags を無視可能） |
| `lib/coalter/webConnector.ts` | (1) 旧 `NO_SEARCH_PATTERNS` を **deprecated alias** に降格し `EMOTION_TAG_LEXEMES` を import して再エクスポート。(2) `decideSearch` を actionable-only に再設計、旧語彙リストを参照しない | **ここが動作変更の本体**。U3 Step A/B telemetry は段階廃棄（§6.3） |
| `lib/coalter/u3Telemetry.ts` | `hasActionableConstraintsByTheme` はそのまま retrieval gate の判定関数として使う | 非破壊。telemetry 側の `matched_pattern` / `matched_terms` は emotion tag 観測列に読み替え |
| `lib/coalter/flags.ts` | `isU3AbolitionActive` は段階廃棄（§6.3） | 段階的 |

### 6.2 narration 層での参照（非必須・段階導入）

以下は emotion tag が出るようになってから順次接続:

| ファイル | 使い方 |
|---------|------|
| `lib/coalter/narrationBuilder.ts` | 冒頭 `intro` 生成で `emotionTags` を参照 |
| `lib/coalter/narrationEnricher.ts` | bridge / today_hook に emotion category を織り込む |
| `lib/coalter/stage1Narration.ts` | Stage 1 narration prompt に emotion tag を含める |
| `lib/coalter/movieOrchestrator.ts` | narration prompt 組立時 `analysis.emotionTags` を渡す |
| `lib/coalter/foodOrchestrator.ts` | 同上 |
| `lib/coalter/proposalGenerator.ts` | 既存 decision executor の narration でも emotion tag を導入文に使う |

**重要**: narration 側の接続は **Bug-1 本体とは独立** に段階導入可能。本設計の最小スコープは「emotion tag が analysis に載り、retrieval が actionable-only で動く」ところまで。narration 接続は次の PR で段階実装する。

### 6.3 正本名切替 と `isU3AbolitionActive` の段階廃棄計画

**原則**: 削除は後でよいが、**意味の改名は Phase 1 で先に行う**。名前を残したまま中身だけ差し替えると、次の実装者が gate と誤読する。

段階廃棄:

1. **Phase 1（本設計の最小実装 / 改名含む）**:
   - 正本名 `EMOTION_TAG_LEXEMES` を新設し、語彙の正本に昇格する
   - 旧 `NO_SEARCH_PATTERNS` は **deprecated alias** として `EMOTION_TAG_LEXEMES` を再エクスポート（後方互換のため一時保持）
   - `decideSearch` を actionable-only に書き換える（正本・alias のどちらも参照しない）
   - `isU3AbolitionActive` / `u3_gate` telemetry 周りのコードは残すが、分岐が全て通らない **死コード** になる
   - 新規 telemetry `retrieval_fired` / `emotion_tags_found` / `hasActionable` を `[CoAlter] webConnector.decision` 系に追加（§2.3 条文 4）
2. **Phase 2（死コード + alias 削除）**:
   - Preview の回帰観測で 2 週間問題が出なければ、
   - `NO_SEARCH_PATTERNS`（deprecated alias）を物理削除
   - `isU3AbolitionActive` / `u3_gate` telemetry / Step A/B 分岐 のコードを物理削除
3. **Phase 3（flag 撤去）**:
   - `flags.ts` の `isU3AbolitionActive` を完全削除
   - Rendezvous / Stargazer 側で同 flag を参照している箇所が無いことを grep で最終確認

### 6.4 food-diagnostics との接続

`docs/coalter-food-diagnostics.md` の 4 層監査契約（search / parse / rank / narration）と本設計の接続:

| diagnostics 層 | Bug-1 の影響 |
|---------------|-------------|
| search | `rawSearchCandidates` がゼロから **hasActionable ? N : 0** に変わる。母数の見方を変える必要あり |
| parse | 変更なし（Bug-2 領域） |
| rank | 変更なし（Bug-2 領域） |
| narration | `emotionTagsUsedInNarration: boolean` を diagnostics に追加（任意、後続 PR） |

food-diagnostics の監査テーブルは **変更しない**。Bug-1 は retrieval 入口の変更なので、既存監査列の分母が変わるだけで、列自体は保つ。

### 6.5 retrieval investigation handoff との接続

`docs/coalter-handoff-2026-04-19-retrieval-investigation.md` §7.1 / §8 の北極星を、本書で **正式設計書** として確定する。
handoff 側は引き継ぎ記録として保存し、削除も上書きもしない。

---

## 7. 非目標（本設計書で扱わないこと）

1. **Bug-2（catalog→theater=null drop）**: `coalter-movie-three-stage-design.md` の Stage 3 Resolve で扱う。本書では触れない。
2. **P3 reflect / 長期感情履歴**: `coalter-master-design.md §572` の概念段階。Phase 2 観測結果を待って別設計書。
3. **感情モデルの精緻化**: valence / arousal / PAD モデル等の感情次元化は **やらない**。語彙カテゴリ 4 種で十分（感情エンジン化は CoAlter の価値ではない）。
4. **`EmotionTag.confidence` フィールド — 今回非採用**:
   - lexeme match ベースで連続的な確信度が出せないため、入れると **偽の精密さ** が型契約に混入する。
   - 未決として残すと将来の実装者が 0.7 / 0.8 等の恣意的な値を埋めるリスクがある。
   - 将来、抽出器が LLM ベースや valence/arousal に拡張された際に **別論点として再導入** する。今回の設計からは意図的に外す。
5. **LLM による感情推論**: 本設計は `lexeme match` ベース。LLM 呼び出しは追加しない（コスト / レイテンシ / 監査性の理由）。
6. **narration 層の全面書き換え**: emotion tag の接続は段階導入可能。本設計の最小スコープ外。
7. **他 CoAlter テーマ（schedule / general / gift）への拡張**: `SEARCH_REQUIRED_THEMES` 内のみ扱う。
8. **negotiate / clarify executor の拡張**: G6 凍結線により movie 先行。本設計は `decision` theme の retrieval パスのみ。

---

## 8. 検証方法

### 8.1 単体テスト（PR 前必須）— 3 系統で recall / precision 両面を担保

Bug-1 は「不発火（低 recall）」問題だが、naive fix の反対側である「過発火（低 precision）」に転ばないことも同時に検証する。
以下の **3 系統 × 各代表ケース** を必須とする。

#### 系統 A: `actionable + emotional` → retrieval **発火**（recall 改善の検証）

| テストケース | 期待結果 |
|-------------|---------|
| 「何見たい気分?」「迷うね」（handoff Pattern A 再現） | `emotionTags = [mood, indecision]` / `shouldSearch = true`（movie + actionable target） |
| 「今夜ラーメン食べたいけど気分が乗らない」 | `emotionTags = [mood]` / `shouldSearch = true`（food + target=ラーメン） |
| 「渋谷で夕方に会おうって話で、仲の話もちょっと」 | `emotionTags = [relation]` / `shouldSearch = true`（food or activity + location + time） |

#### 系統 B: `non-actionable + emotional` → retrieval **発火しない**（precision 劣化のガード）

| テストケース | 期待結果 |
|-------------|---------|
| 「関係性について話したい」 only | `emotionTags = [relation]` / `shouldSearch = false`（actionable=false） |
| 「なんか気分が乗らない」「わかる」 only | `emotionTags = [mood]` / `shouldSearch = false`（target / location / time すべて不在） |
| 「最近すれ違いが多いよね」 only | `emotionTags = [friction]` / `shouldSearch = false` |

**なぜ B 系統が重要か**: Bug-1 を「`NO_SEARCH_PATTERNS` を外した」と誤解した実装が、
この系統のケースで検索を走らせると、無意味な EXA クエリが連発される。
emotion tag は発火するが retrieval は発火しない、という状態を条文（§2.3）と同時に **テストで保証** する。

#### 系統 C: `actionable + low-emotion` → retrieval **発火**（従来の健全系の維持）

| テストケース | 期待結果 |
|-------------|---------|
| 「今夜ラーメン食べに行こう」 only | `emotionTags = []` / `shouldSearch = true`（食事 + target）|
| 「土曜 19 時に渋谷でディナー予約しよう」 | `emotionTags = []` / `shouldSearch = true`（food + location + time + target 候補）|
| 「ホラー映画見に行こうよ、新宿で」 | `emotionTags = []` / `shouldSearch = true`（movie + target + location）|

#### 境界系統（追加 2 ケース）

| テストケース | 期待結果 |
|-------------|---------|
| 「気分」語のみで theme=general | `emotionTags = [mood]` / `shouldSearch = false`（SEARCH_REQUIRED_THEMES 外）|
| 空の会話 | `emotionTags = []` / `shouldSearch = false` |

### 8.1.5 失敗独立テスト（§2.3 条文のテスト保護）

以下も必須とする:

| テストケース | 期待結果 |
|-------------|---------|
| `extractEmotionTags` が例外を throw する mock | `decideSearch` は emotion を見ずに正常判定を返す / `analysis.emotionTags = []` で下流継続 |
| `emotionTags = []` で `decideSearch` / narration が正常動作 | エラーなく空配列を空として扱う |
| `emotionTags = [strong mood]` と同じ analysis を二回投げ、一方は抽出器無効化 | `shouldSearch` の値は両ケースで同一（失敗独立の保証） |

### 8.2 回帰観測（preview 30 件 full observation gate）— recall と precision を両方見る

`scripts/coalter-phase2-kpis.sql` の既存 KPI + 新規 telemetry で回帰を見る:

**recall 側（Bug-1 改善の確認）**

| KPI | Bug-1 前 | Bug-1 後 期待値 |
|-----|---------|---------------|
| `[CoAlter] movie.diagnostics.searchCandidatesCount` 中央値 | 0 多発 | **≥ 5**（handoff §8 北極星） |
| `[CoAlter] food.diagnostics.searchCandidatesCount` 中央値 | 0 多発 | **≥ 5** |
| `[CoAlter] movie.diagnostics.catalogCount` 中央値 | 0 多発 | ≥ 5（**Bug-2 後に達成**、Bug-1 単独では保証しない） |
| `[CoAlter] movie.diagnostics.rankedCount` 中央値 | 0 | ≥ 3（**Bug-2 後に達成**） |

**precision 側（false-positive / 過発火のガード）**

| KPI | 期待値 |
|-----|--------|
| `[CoAlter] webConnector.decision.hasActionable=false` 時の発火率 | **0%**（条文 §2.4 違反検出） |
| EXA 検索総数 / CoAlter 起動回数 | Bug-1 前の 1.5 倍以下（乱発監視） |
| `retrieval_fired=true && emotion_tags_found=0 && hasActionable=true` の比率 | 変化なし（従来健全系の維持、系統 C） |
| `retrieval_fired=true && hasActionable=false` のケース | **観測されたら直ちにアラート**（設計違反） |

**状態分布（観測のみ、閾値は事前固定しない）**

| 観測項目 | 備考 |
|---------|------|
| `retrieval_fired=true && emotion_tags_found≥1` の比率 | 系統 A の実測 |
| `retrieval_fired=false && emotion_tags_found≥1 && hasActionable=false` | 系統 B の実測（新しい健全系） |
| `retrieval_fired=true && emotion_tags_found=0` の比率 | 系統 C の実測 |
| `emotion_tags_found≥1` セッション比率 | ≥ 30% を目安（感情会話が実態として存在することの確認） |
| KPI-6 / KPI-7（`coalter-phase2-observation-spec.md`）| **変化なし**（Phase 2 凍結線の外） |

### 8.3 live smoke（段階導入）

`scripts/coalter/f6-live-smoke.ts` の既存 harness に、emotion tag を観測する項目を追加（任意、後続 PR）:

- report 7 項目目: `analysis.emotionTags` の count / category 内訳

### 8.4 「Bug-1 が直った」の定義

以下 **4 条件** を同時に満たしたとき、Bug-1 を closed とする（recall + precision + 失敗独立 + narration）:

1. **recall 合格（再現ケース）**: handoff §4.1 Pattern A（「何見たい気分?」「迷うね」）で `searchCandidatesCount ≥ 5` が観測される。（`rankedCount ≥ 3` は Bug-2 後）
2. **precision 合格（過発火ガード）**: preview 観測で `retrieval_fired=true && hasActionable=false` のケースが **ゼロ**。§8.1 系統 B の単体テストも PASS。
3. **回帰なし**: 既存 unit tests PASS（669+ + 新規 3 系統テスト）+ preview 30 件観測で KPI-6 / KPI-7 の悪化なし + 失敗独立テスト §8.1.5 PASS。
4. **感情の提案核接続（段階可）**: 10 件サンプリングで narration の冒頭に emotion tag が自然に反映されている（qualitative 確認、CEO 判定）。

条件 4 は narration 接続の段階導入次第で遅延する。最小スコープ（条件 1 + 2 + 3）で **Bug-1 コア修正** を閉じ、narration 接続は **Bug-1 フォローアップ** として分ける。

### 8.5 合格ライン（handoff §8 北極星の再掲）

```
theme = movie と判定された会話で、
  会話に感情語が含まれていても
    → 感情はタグとして抽出・保持される
    → Web 検索は theater 情報付きで適切に発火する
    → catalog は missing_where で drop されず、5+ 件残る   ← ただし Bug-2 領域
    → ranked candidates が 3 件以上出る
    → 提案カードは「感情の解釈 + 候補 3 件 + 決め方」の 3 要素揃って返る
  この結果、[CoAlter] movie.diagnostics は:
    searchCandidatesCount >= 5
    catalogCount >= 5                  ← Bug-2 後に達成
    rankedCount >= 3                   ← Bug-2 後に達成
    missingWhereRejectCount は catalog の 30% 以下  ← Bug-2 領域
  を満たす
```

**注**: `catalogCount >= 5` / `rankedCount >= 3` / `missingWhereRejectCount` は Bug-2（theater 抽出改善）と合わせて初めて達成される。
Bug-1 単独では `searchCandidatesCount >= 5` まで。残りは Bug-2 設計書側で担保する。

---

## 9. 実装スコープの最小化（Phase 分け）

CEO 方針「小さく、整合性優先」に従い、Bug-1 を 3 Phase に分ける。

### Phase 1 — コア修正 + 正本名切替（本設計の必須実装）

- `types.ts` に `EmotionCategory` / `EmotionPolarity` / `EmotionTag` 型追加、`ConversationAnalysis.emotionTags` 追加
- **`EMOTION_TAG_LEXEMES` 正本を新設**（`emotionLexemes.ts` 新規 or `conversationParser.ts` 内）
- 旧 `NO_SEARCH_PATTERNS` を **deprecated alias** に降格（`EMOTION_TAG_LEXEMES` を再エクスポート、物理削除は Phase 2）
- `conversationParser.ts` に `extractEmotionTags` 追加、`analyzeConversation` 内で呼ぶ（try/catch 失敗独立）
- `webConnector.ts` の `decideSearch` を actionable-only に再設計、語彙リストを参照しない
- `webConnector.ts` 内の `NO_SEARCH_PATTERNS` 周りの分岐を **死コード化**
- 新規 telemetry `retrieval_fired` / `emotion_tags_found` / `hasActionable` を追加
- 単体テスト追加（§8.1 の 3 系統 + 境界 + §8.1.5 失敗独立 = 計 10+ ケース）
- preview 観測 2 週間

### Phase 2 — 死コード + alias 削除

- preview で回帰なしを確認後、`NO_SEARCH_PATTERNS`（alias）/ `u3_gate` telemetry / `isU3AbolitionActive` を物理削除
- `u3Telemetry.ts` は `hasActionableConstraintsByTheme` のみ残す
- U3 関連 flag を `flags.ts` から削除

### Phase 3 — narration 接続（段階）

- `narrationBuilder` / `narrationEnricher` / `stage1Narration` に emotion tag を受ける変更
- `movieOrchestrator` / `foodOrchestrator` の narration prompt に `analysis.emotionTags` を注入
- `proposalGenerator`（decision executor）にも同様に接続
- CEO 定性確認 → Bug-1 クローズ

---

## 10. 凍結線との整合（handoff §7.5 踏襲）

| 凍結線 | 触るか | 根拠 |
|--------|-------|------|
| `isExecutorThemeEnabled(theme) === "movie"` | 触らない | G6 線 |
| Phase 2 3-mode dispatch / router / modifier / gate | 触らない | `coalterDispatch.ts` 変更なし |
| `movieOrchestrator` の 4-layer pipeline | 触らない（narration prompt への emotion tag 注入は Phase 3、同ファイルだが非破壊） | Phase A 完了線 |
| `foodOrchestrator` の 4-layer pipeline | 同上 | Phase 2 Commit 3 線 |
| `parseMovieScreenings` / `theaterResolver` | 触らない | Bug-2 領域 |

---

## 11. 未決論点（CEO 裁定待ち）

1. **Phase 2（死コード + alias 物理削除）のタイミング**: preview 2 週間で十分か、もっと長く保持するか。
2. **narration 接続（Phase 3）の PR 分割単位**: movie / food を同時 PR にするか、theme ごとに分けるか。
3. **`EmotionTag.speaker` の「both」判定粒度**: 同じメッセージ内 / 異なるメッセージで両者が使ったら both、のどちらを採用するか。
4. **CoAlter 以外での参照確認**: Grep で `webConnector.ts` 内のみの確認は済み。実装着手直前に `NO_SEARCH_PATTERNS` の他の coalter/ 配下・Rendezvous / Stargazer 側での間接参照がないか最終 grep を行う。

**※ `EmotionTag.confidence` は v0.2 で未決から外し、§7.4 で「今回非採用」として固定した。**

---

## 12. 改訂履歴

| 日付 | 版 | 変更 | 承認 |
|-----|-----|------|------|
| 2026-04-24 | v0.1 | 初版。handoff §5.1 / §7.1 / §8 の北極星を設計仕様に落とす。Phase 1-3 分け、失敗モード 4 系統、検証 3 条件を定義 | CEO 審議用 |
| 2026-04-24 | v0.2 | CEO 部分修正指示 4 点を反映: (1) 正本名 `EMOTION_TAG_LEXEMES` を Phase 1 で切替え、旧 `NO_SEARCH_PATTERNS` は deprecated alias へ降格 (§4.3/§4.4/§6.1/§6.3/§9)、(2) §2.3 として失敗独立 5 条文を不可侵として明記 (§2.3)、(3) 検証条件を 3 系統（A: actionable+emotional / B: non-actionable+emotional / C: actionable+low-emotion）+ 失敗独立テストに再編、precision 側 KPI を追加 (§8.1/§8.1.5/§8.2/§8.4)、(4) `EmotionTag.confidence` は今回非採用、§7.4 で明文化、§11 未決論点から除外 (§4.1/§5.1/§7/§11) | CEO 固定判断待ち |

---

## 結論

Bug-1 は「感情を読まずに検索するか／検索を止めて感情扱うか」の二択を選ばなかった naive fix を却下したことに端を発する。
本設計は、感情理解と retrieval を **排他（gate）から並列（extract + fuse）** に構造転換する。

核心は 4 つ:

1. **感情タグ抽出器への格下げ + 正本名改訂**: 旧 `NO_SEARCH_PATTERNS` は gate ではなく `EMOTION_TAG_LEXEMES` として Phase 1 で名前を切る。物理削除は後、意味の改名は先。
2. **retrieval gate は actionable-only**: 既存 `hasActionableConstraintsByTheme` に一本化。感情の有無は参照しない。
3. **失敗独立条文（§2.3）**: `extractEmotionTags` の成否が `decideSearch` の結果を左右してはいけない。将来の暗黙の直列依存を条文で封じる。
4. **検証は recall + precision 両面**: 3 系統（actionable+emotional / non-actionable+emotional / actionable+low-emotion）+ 失敗独立テスト で、不発火の解決と過発火の抑制を同時に担保する。

凍結線は一切触らず、Phase 2 3-mode body / G6 / executor 本線の骨格を保ったまま retrieval 層のみで閉じる。

**CEO 固定判断後、Phase 1 コア修正 + 正本名切替の PR 起草に入る。**

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
