# Alter Plan P2 — Step 2 Readiness v2 (= 「世界トップ級」 補強版)

**Status**: readiness 補強起草 (= 着手前、 実装は preview canary 実データレビュー後の再判断)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: Step 2 readiness v1 を CEO + GPT 「世界トッププロダクトに劣らないものに」 要求で 4 軸補強。
**CEO 思考原則 ①〜⑦ 適用**: 「人間同等推論 (⑥)」 「人間能力を超越する革新 (⑦)」 を ここで本格達成する設計書。

---

## 0. 結論 (= TL;DR)

CEO + GPT 結論:
- Step 1 merge GO (= default false 安全)
- preview / 限定 canary live ON GO
- production 全面 ON はまだ NO
- Step 2 実装着手は **本 readiness v2 補強 + canary 実データレビュー後の再判断**

本 v2 が補強する 4 軸:
1. **Personal Model 3 層構造** (= Stable / Recent / Contextual)
2. **User Correction Memory** (= LLM を賢くする前に 「LLM に渡す材料を賢くする」)
3. **評価セット 20-50 件 + LLM-as-judge ハーネス**
4. **Output Contract 3 部明文化** (= fact_acknowledgment / interpretation / style_constraint)

「世界トップ級」 の定義 (= CEO 補正):
- LLM 単発 prompt ではなく、 **personal memory + retrieval + evaluation の loop** で進化する Alter
- 「ちょっと賢いテンプレ」 ではなく、 user 個別の 「あなたの判断原理を持つ存在」
- training (= fine-tune) は後段、 まず **入力材料と評価の品質** を引き上げる

---

## 1. 補強 1: Personal Model 3 層構造 (= GPT 補強要求 1)

### 1.1 v1 の不足

readiness v1 は 4 short tag (= judgmentMode / timePreference / energyRecovery / recentRhythm) のみ。 GPT 指摘: 「**粗い個人化**。 ちょっと賢いテンプレ止まり」。

### 1.2 v2 の 3 層構造

| Layer | 時間スケール | 役割 | 文体への影響 |
|---|---|---|---|
| **Stable** | 数ヶ月〜数年 | 「あなたという人」 の長期傾向 | 「あなたの軸では…」 framing 可 |
| **Recent** | 直近 7-14 日 | 「今のあなた」 の状態 | 「最近◯◯気味のあなた」 hedging |
| **Contextual** | 当日 + 似た日履歴 | 「この予定の文脈」 | 「久しぶりの…」 「いつもの流れの…」 |

### 1.3 各層の Stargazer 既存資産 mapping (= 検証済)

#### Stable layer (= 12 module 既存)
| 観点 | Stargazer module | Plan で使う short tag |
|---|---|---|
| 判断軸 (45 軸 → 10 次元) | `axisRegistry.ts` + `axisInferenceEngine.ts` + `axisLabels.ts` | judgmentMode (= 「集中型」 / 「分散型」 等) |
| 軸更新 (= Bayesian) | `bayesianAxisUpdater.ts` | (= 軸値の根拠、 直接 tag 化しない) |
| 深層心理サイン | `psycheSignature.ts` | psycheTone (= 「内向 + 整理欲求」 等) |
| 朝型 / 夜型 | `chronotypeFitness.ts` | timePreference (= 「朝強い」 等) |
| Demographic 正規化 | `baselineContext.ts` | lifeStageHint (= 「working_adult」 等、 PII 化避けて hint のみ) |
| 性格軸 | `traitAxes.ts` + `traitEvolution.ts` | traitTone (= 「内省的」 等) |
| アーキタイプ | `archetypeFigure.ts` + `archetypeResolver.ts` | archetype (= 「賢者型」 等、 抽象 ラベル) |
| 判断モード | `decisionOracle.ts` | decisionMode (= 「直感先行」 等) |
| 強み | `uniqueStrengthDetector.ts` | strengthAxis (= 「深い集中」 等) |
| 仕事適性 | `careerAptitude.ts` + `workStyleFitness.ts` | workStyle (= 「solo deep work」 等) |
| 判断の歴史 | `judgmentArchaeology.ts` | (= 過去判断 pattern、 archetype 補強) |

#### Recent layer (= 13 module 既存)
| 観点 | Stargazer module | Plan で使う tag |
|---|---|---|
| 直近イベント | `lifeEvents.ts` | recentEvents (= 「異動直後」 等) |
| 内的天気 (= 日次) | `innerWeather.ts` | innerWeather (= 「曇り続き」 「晴れ」) |
| 直近感情 (= EMA) | `microEMA.ts` + `microEMABridge.ts` | recentMood (= 「やや疲れ」 等) |
| 夜の振り返り | `eveningReflection.ts` | recentReflection (= 「未完了感ある」 等) |
| 反応時間信号 | `responseTimeEngine.ts` | reactionSpeed (= 「即答 / 遅延」 等) |
| Streak | `streakIntelligence.ts` + `streakAsInstrument.ts` | streakTone (= 「連日集中」 等) |
| 揺らぎ | `fluctuationEngine.ts` | fluctuation (= 「安定」 / 「揺れ大」) |
| 日次運営 | `dailyInsightEngine.ts` + `dailyOrchestrator.ts` | (= 補助 signal) |
| 反応パターン | `reactionPatternEngine.ts` + `reactionTypes.ts` (= W5 Reaction Learning) | recentReactionPattern |
| Rupture | `ruptureDetection.ts` | recentRupture (= 「直近 rupture あり」 で hedging 強) |
| Circadian | `circadianAnalysis.ts` | circadianState |
| ストレス | `stressResponseCascade.ts` | stressLoad (= 「高」 「低」) |
| Life context | `lifeContext.ts` (= W1) | recentRhythm (= 「集中続き」 等、 v1 の tag を継承) |

#### Contextual layer (= 9 module 既存)
| 観点 | Stargazer module | Plan で使う tag |
|---|---|---|
| 似た day / event 想起 | `episodicRecall.ts` | similarDayRecall (= 「先週金曜の同時刻」 等) |
| 時間的自己鏡 | `temporalSelfMirror.ts` | pastSelfDelta (= 「3 ヶ月前と違う」 等) |
| Session context | `sessionContext.ts` | (= 当日の連続性) |
| Context 集約 | `contextProfileAggregator.ts` | aggregatedContext |
| Context shift | `contextShiftAnalyzer.ts` | shiftSignal (= 「shift 検出」 等) |
| Narrative threading | `narrativeThreading.ts` | narrativeContinuity |
| Pattern 検出 | `patternDetectionEngine.ts` + `patternPredictions.ts` | similarPatternTag |
| Alter 記憶 | `alterMemory.ts` | alterPastObservation |
| Session diff | `sessionDiff.ts` | sessionDeltaSignal |

#### HDM 統治層 (= 7 module、 全層を制御、 流用必須)
| 観点 | Stargazer module | Step 2 での使い方 |
|---|---|---|
| Phase 0-5 | `hdmPhase.ts` | gating: Phase ≥ 2 で個別化解禁 |
| Depth 制御 | `depthPhaseController.ts` | 個別化の深さ調整 |
| Trust + understanding | `alterUnderstanding.ts` | Trust ≥ 3 で踏み込み解禁 |
| 5 レンズ統合 | `heartIntegration.ts` | Affect/Body/Narrative の信号統合 |
| 観測の限界 | `negativeCapability.ts` | 「読めない」 を明示 |
| 自己理解からの着地 | `realityAnchoring.ts` | Phase 5 で 「あなたはこういうタイプだから」 |
| Output 契約 | `outputContract.ts` | **本 readiness §4 で流用** |

### 1.4 Step 2 で実装する 3 層 PersonalModelV2 型

```typescript
// lib/plan/llm/types.ts に追加 (= Step 2)
export type PersonalModelV2 = {
  readonly stable?: {
    readonly judgmentMode?: string;        // axisRegistry 由来
    readonly psycheTone?: string;          // psycheSignature 由来
    readonly timePreference?: string;      // chronotypeFitness 由来
    readonly traitTone?: string;           // traitAxes 由来
    readonly archetype?: string;           // archetypeFigure 由来 (= 抽象 ラベル)
    readonly decisionMode?: string;        // decisionOracle 由来
    readonly strengthAxis?: string;        // uniqueStrengthDetector 由来
    readonly workStyle?: string;           // workStyleFitness 由来
    readonly lifeStageHint?: string;       // baselineContext 由来 (= PII 化避けて hint のみ)
  };
  readonly recent?: {
    readonly innerWeather?: string;        // innerWeather 由来
    readonly recentMood?: string;          // microEMA 由来
    readonly recentEvents?: string;        // lifeEvents 由来
    readonly reactionPattern?: string;     // reactionPatternEngine 由来 (= W5)
    readonly fluctuation?: string;         // fluctuationEngine 由来
    readonly stressLoad?: string;          // stressResponseCascade 由来
    readonly recentRupture?: boolean;      // ruptureDetection 由来
    readonly recentRhythm?: string;        // lifeContext 由来 (= v1 の tag を継承)
  };
  readonly contextual?: {
    readonly similarDayRecall?: string;    // episodicRecall 由来 (= 「先週同曜日」 等)
    readonly pastSelfDelta?: string;       // temporalSelfMirror 由来
    readonly shiftSignal?: string;         // contextShiftAnalyzer 由来
    readonly narrativeContinuity?: string; // narrativeThreading 由来
    readonly sameSlotHistory?: string;     // 当日の前後 anchor + 同時間帯履歴
  };
  readonly meta?: {
    readonly hdmPhase: number;             // hdmPhase 由来 (= 0-5)
    readonly trustLevel: number;           // alterUnderstanding 由来 (= 0-5)
    readonly observationCompleteness: number; // 0-1 (= 軸データ充足度)
    readonly negativeCapabilityFlag?: boolean; // 「読めない」 を許容するか
  };
};
```

### 1.5 段階的 readout (= prompt に渡す compactness)

3 層全部を毎回 prompt に注入すると token 浪費。 段階注入:

| HDM Phase | 注入する layer |
|---|---|
| 0-1 | meta のみ (= 個別化 skip、 deterministic 維持) |
| 2 | meta + stable 部分 (= 4 tag、 v1 同等) |
| 3 | meta + stable 全 + recent core (= mood / rhythm) |
| 4-5 | meta + stable 全 + recent 全 + contextual (= 「あなたはこういうタイプだから」 framing 可) |

実装: `lib/plan/llm/personalModelExtractorV2.ts` で Phase ごとに最適 subset を return。

---

## 2. 補強 2: User Correction Memory (= GPT 補強要求 2)

### 2.1 v1 の不足

readiness v1 は user reaction (= 「これは違う」 「正解」) を観測しない。 1 way LLM 出力で終わる。 GPT 指摘: 「**LLM を賢くするより、 LLM に渡す材料を賢くする**。 personal memory + retrieval + evaluation を先に固める」。

### 2.2 v2 で導入する 3 層 Correction Memory

#### Correction Layer A: 暗黙的反応 (= 観測のみ、 UI 追加なし)
- 既存 `personalizationTracker.ts` pattern 流用
- 静的観測:
  - alterNote 表示後、 anchor を tap して詳細を開く (= 「気になった」 signal)
  - alterNote 表示後、 anchor を edit (= 「違うと感じた」 signal)
  - alterNote 表示後、 anchor を delete (= 「不要と判断」 signal)
- 動的観測: anchor 滞在時間、 scroll depth (= 後段)

#### Correction Layer B: 明示的反応 (= UI 追加、 Step 3+ 候補)
- alterNote 各 EventCard に subtle 「これは違う」 button (= Aneurasync UX 整合、 押し付けない設計)
- 違う tap → modal で 「どう違ったか」 free text + 5 階 emoji
- 違う pattern 蓄積 → 次回 prompt の system prompt 「あなたが好まない傾向」 として注入

#### Correction Layer C: alterNote 編集記憶 (= Step 3+ 候補)
- user が EventCard を edit 開く → 既存 title / location 編集
- 編集前 / 編集後の diff (= 「ユーザーが直した」 signal)
- LLM 訓練 dataset として exportObservationDataset.ts に流す

### 2.3 Step 2 範囲 (= scope 絞り)

**Step 2 では Layer A のみ実装** (= 暗黙的反応の観測 frame + Reaction Learning pattern 流用)
- DB schema 不要 (= 既存 `home_alter_judgment` analytics 同 pattern)
- Layer B / C は Step 3 / 4 別 readiness

### 2.4 Memory Policy 整合

既存 `memoryPolicy.ts` の 4 段階ライフサイクル (= candidate → tentative → active → weakening) を Plan correction に適用:
- 1 回の dismissal = candidate (= 個別事故扱い)
- 7 日内 3 回同 pattern = tentative (= 仮説形成)
- 14 日内 5 回 = active (= prompt 注入材料)
- 30 日未観測 = weakening (= 影響弱める)

これにより 「単発の不機嫌」 で prompt が変質するのを防ぐ。

---

## 3. 補強 3: 評価セット + LLM-as-judge ハーネス (= GPT 補強要求 3)

### 3.1 v1 の不足

readiness v1 は 「自然さ」 「あなたらしさ」 を勘で判定。 GPT 指摘: 「**評価ハーネスがまだ弱い**。 20〜50 件の代表予定セット必要」。

### 3.2 v2 で構築する評価 dataset

#### 3.2.1 代表 anchor dataset (= 50 件、 Step 2 着手前に作成)

カテゴリ別:
| Category | 件数 | バリエーション軸 |
|---|---|---|
| cafe | 12 | 朝 / 昼 / 午後 / 夜、 ひとり / 友人 / 仕事、 location 明示 / 抽象 |
| meal | 10 | 朝 / 昼 / 夜、 ひとり / 家族 / ビジネス、 sensitive 含む |
| work | 12 | 集中作業 / 会議 / 出張、 朝 / 午後 / 残業 |
| home | 8 | 朝の準備 / 帰宅 / 休日 / 深夜 |
| other | 8 | 旅行 / 病院 / 友人 / イベント / 試験 / 引越 |

#### 3.2.2 評価軸 (= 3 軸 × 5 階)

| 軸 | 説明 | 5 階基準 |
|---|---|---|
| **自然さ** | 文として綺麗、 日本語として違和感ない | 5 = mock 級、 1 = 機械翻訳級 |
| **あなたらしさ** | user 個別性 (= 同じ anchor でも user 違えば異なる解釈) が出るか | 5 = 第二の自己、 1 = 万人共通 |
| **押しつけ感の弱さ** | 命令的 / 評価的でない、 観測寄り | 5 = 静かな観測、 1 = 強い推奨 |

#### 3.2.3 比較対象

| 出力 | 内容 |
|---|---|
| deterministic | 既存 getNarrative / getMeaningText |
| Step 1 LLM | 4 short tag なし、 一般文 |
| Step 2 LLM | 3 層 PersonalModel 注入後 |

#### 3.2.4 評価方法 (= 2 段)

**段 1: 既存 `lib/ai/judge.ts` (= LLM-as-judge) 流用**
- judge LLM (= Gemini Pro or Claude) に 「自然さ / あなたらしさ / 押しつけ感」 を採点させる
- 自動評価 + dataset 規模拡大可能
- 既存 patterns: alter-morning / Stargazer alter で使用済

**段 2: CEO + Build Unit 採点 + 修正文収集**
- CEO + Build Unit が 50 件全件を 3 軸 × 5 階で採点
- 修正文 (= 「こう書いて欲しい」 を CEO 自身が記述) を 5-10 件で収集
- 修正文は few-shot example として system prompt に注入候補 (= future Step 3 fine-tune dataset)

#### 3.2.5 採点合格基準 (= Step 2 採用判定)

| 軸 | deterministic | Step 1 LLM | Step 2 LLM (= 採用基準) |
|---|---|---|---|
| 自然さ | 3.5 (基準値) | ≥ 4.0 | **≥ 4.2** |
| あなたらしさ | 1.5 (= 個別化なし、 ほぼ 0) | 2.0-2.5 (= 一般 LLM) | **≥ 3.5** |
| 押しつけ感の弱さ | 4.0 (= 既存規約強) | ≥ 3.5 (= validator で担保) | **≥ 4.0** |

3 軸すべて基準を超えたら Step 2 採用 (= 「Aneurasync ならでは」 達成の機械保証)。

### 3.3 評価 dataset の管理

- `tests/eval/plan-alter-note-dataset.ts` (= 50 件 dataset、 fixed)
- `tests/eval/plan-alter-note-judge.test.ts` (= LLM-as-judge 自動評価、 npm test では skip、 別 script で run)
- `docs/alter-plan-p2-step2-eval-results.md` (= 採点結果、 CEO 採点込み、 採用判定根拠)

---

## 4. 補強 4: Output Contract 3 部明文化 (= GPT 補強要求 4)

### 4.1 v1 の不足

readiness v1 の validator は禁止語 / 長さ / 文字種だけ check。 GPT 指摘: 「validator は safety には役立つが、 **上質さの保証まではしていない**」。

### 4.2 v2 で導入する Output Contract

#### 4.2.1 既存資産 `lib/stargazer/outputContract.ts` 流用

既存 `OutputContract` 型 (= domain / fields[ name + description + required + detector regex ] / maxLength / prohibitions / promptInstruction) を Plan alterNote 用に拡張。

#### 4.2.2 `ALTER_NOTE_CONTRACT` 設計

```typescript
// lib/plan/llm/outputContract.ts (= 新規、 Step 2)
import "server-only";

export const ALTER_NOTE_CONTRACT_V2: OutputContract = {
  domain: "plan_alter_note",
  fields: [
    {
      name: "fact_acknowledgment",
      description: "予定の事実 (= カテゴリ / 時刻帯 / 場所) を一言で言及",
      required: true,
      // 「カフェ」 「夕方」 「自宅」 等の事実語を含むか
      detector: /カフェ|食事|仕事|会議|学習|自宅|朝|昼|午後|夜|深夜|出発|帰宅/,
    },
    {
      name: "interpretation",
      description: "事実から読める意味 (= 状態 / 流れ / 質感) を一言",
      required: true,
      // 「集中」 「整える」 「ひと息」 「リズム」 等の状態語を含むか
      detector: /集中|整え|ひと息|リズム|切り替え|流れ|時間|過ご|穏や|整理|準備|締め/,
    },
    {
      name: "style_constraint",
      description: "押しつけない / 観測寄り (= 評価形容詞 / 強命令の不在で間接的に検証)",
      required: true,
      // ここは prohibitions と validator で機械保証 (= detector は negation pattern として placeholder)
      detector: /./,
    },
  ],
  maxLength: 30, // 8-30 字
  prohibitions: [
    /おすすめ|これをした方がいい|推奨|改善|警告|危険|注意|リスク|最適化/, // 禁止語 10 件
    /しなさい|すべき|してください|するな/, // 強命令
    /最適|重要|大事|ベスト|良いプラン|悪い/, // 評価形容詞
    /[0-9０-９]+\s*(?:%|％|分|時間|日|秒|円)/, // 数値
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, // 絵文字
  ],
  promptInstruction: [
    "## 出力契約: plan_alter_note (= 3 部構成)",
    "",
    "**必ず 3 部を 1 文に統合してください**:",
    "1. fact_acknowledgment — 予定の事実 (= カテゴリ / 時刻帯 / 場所) を一言で言及",
    "2. interpretation — 事実から読める意味 (= 状態 / 流れ / 質感) を一言",
    "3. style_constraint — 押しつけない / 観測寄り (= 評価形容詞 / 強命令禁止)",
    "",
    "**統合後 1 文、 8〜30 字**。",
    "**禁止**: 命令形 (しなさい / すべき) / 評価語 (最適 / 重要) / 押しつけ語 / 数値 / 絵文字。",
    "",
    "**良い例 (= 3 部統合)**:",
    "- 「夕方のカフェで、 一日を静かに整える時間」 (= fact: カフェ + 夕方、 interp: 静かに整える、 style: 観測)",
    "- 「朝の自宅で、 ゆっくり準備を始める」 (= fact: 自宅 + 朝、 interp: 準備、 style: 観測)",
    "",
    "**悪い例 (= 違反)**:",
    "- 「朝のカフェに行きましょう、 集中の時間です」 (= fact 弱い、 interp 平凡、 style 命令含む)",
    "- 「最適な午後の会議時間」 (= 評価語 「最適」 違反)",
    "",
    "出力 JSON: { \"text\": \"<8-30 字>\" }",
  ].join("\n"),
};
```

#### 4.2.3 validator 拡張 (= 既存 `alterNoteValidator.ts` 強化)

- 既存 5 段 (= empty / length / forbidden_word / forbidden_tone / forbidden_char) 維持
- v2 追加: contract field detector で `fact_acknowledgment` と `interpretation` の **不在**を 「貧弱な解釈」 として reject

```typescript
// 追加 reason
export type AlterNoteValidationReason =
  | "empty"
  | "length_out_of_range"
  | "forbidden_word"
  | "forbidden_tone"
  | "forbidden_char"
  | "missing_fact_acknowledgment"   // ← 新規
  | "missing_interpretation";       // ← 新規
```

### 4.3 期待される効果

GPT 「ちょっと賢いテンプレ」 ↔ 「世界トップ級」 の差別化:
- v1: 「夕方のカフェで勉強に集中しましょう」 (= LLM 平均文)
- v2 (= ALTER_NOTE_CONTRACT 適用): 「夕方のカフェ、 学びに静かに沈む時間」 (= fact + interp + style 全部含む、 個別性高い)

---

## 5. 統合 architecture (= 3 補強 + Output Contract、 1 view 1 round)

```
[FlowTab mount + flag ON]
  ↓
[server action: enhanceAlterNotesAction]
  ↓
[extractPersonalModelV2(userId, hdmPhase)]
  ├ Stable layer 抽出 (= 既存 axisRegistry 等から)
  ├ Recent layer 抽出 (= 既存 lifeContext 等から)
  ├ Contextual layer 抽出 (= 既存 episodicRecall 等から)
  └ meta (= Phase / Trust / completeness)
  ↓
[isPersonalModelV2Allowed(userId, hdmPhase)]
  └ Phase ≥ 2 なら ON、 未満 deterministic
  ↓
[1 day anchors] × generateAlterNoteV2(ctx_with_pm)
  ├ buildAlterNotePromptV2(ctx, pm) — Phase 別 layer 注入
  ├ ALTER_NOTE_CONTRACT_V2 → system prompt に promptInstruction
  ├ runAI (Gemini Flash、 cache、 failover) — Step 1 と同 entry
  ├ validateAlterNoteOutputV2 — contract field detector + 既存 5 段
  └ failure → deterministic fallback
  ↓
[Promise.all 並列 5、 cap 20]
  ↓
[1 setState commit (= popcorn 防止)]
  ↓
[Plan UI 表示]
  ↓
[user reaction observation] — correction memory layer A (= 暗黙)
  └ home_alter_judgment 同 pattern analytics
```

---

## 6. preview canary plan (= GPT 「production 全面 ON はまだ NO」 通り)

### 6.1 段階展開 3 step

| Step | env | 期間目安 | 観測 |
|---|---|---|---|
| Local smoke | `.env.local` のみ | 2-3 day | dev で実 LLM 経路、 本 doc §3 評価 dataset 全件 (= 50 件) を CEO 採点 |
| Preview canary | Vercel preview env で `PLAN_ALTER_NOTE_LIVE=true` | 1-2 week | 限定 user (= CEO + 知人 5-10 名) 実利用、 latency / fallback / 反応観測 |
| Production canary | production env、 user ID hash で 10% rollout | 1-2 week | scale で observe (= cache hit 率、 LLM cost、 fallback) |
| Production 全面 | 100% rollout | — | 全 user、 ただし kill switch 維持 |

### 6.2 各 step の判定基準

#### Local smoke → Preview canary GO
- 評価 dataset 50 件で Step 2 LLM 採点合格 (= §3.2.5 基準)
- forced-failure smoke 5 件 PASS (= timeout / 503 / validation_failed / cost_cap / sensitive)

#### Preview canary → Production canary GO
- 1-2 week 観測で:
  - cache hit 率 ≥ 50% (= 重複 anchor の cost 削減)
  - LLM latency p95 ≤ 6s (= UX 許容)
  - fallback 発生率 ≤ 5%
  - CEO + 知人 「自然 + あなたらしい」 評価 4.0/5 以上

#### Production canary → 全面 GO
- 1-2 week 10% rollout 観測で:
  - error 率 ≤ 1%
  - cost ≤ monthly $50 (= 安全枠)
  - user 反応 (= dismissal / edit 率) で 「明らかに劣化」 signal なし

### 6.3 forced-failure smoke (= GPT 「fallback の live 実証」)

Production canary 前に **強制失敗 smoke** を 1 回実施:

| Forced failure | 方法 | 期待挙動 |
|---|---|---|
| Gemini timeout | runAI timeoutMs を 1ms に一時設定 | deterministic fallback、 UI 不変 |
| OpenAI fail | OPENAI_API_KEY を一時無効化 | Gemini primary は通る (= failover 不要) |
| Both fail | 両 API key 一時無効化 | 全 anchor "unavailable"、 deterministic 表示 |
| validation_failed | mock prompt が違反語入り | validator reject、 deterministic 表示 |
| cost cap | 21+ anchor で 21+ 件目 silent degrade | 21+ 件目 deterministic 表示 |

---

## 7. CEO 判断 (= 7 件、 着手前停止)

readiness v1 の 5 件 → v2 で 7 件に拡張:

### Q1. Personal Model 構造採用
- 案 A: 3 層 (= Stable / Recent / Contextual) ← 推奨、 「世界トップ級」 必須
- 案 B: 1 層 (= v1 通り 4 short tag)
- 案 C: 2 層 (= Stable + Recent のみ、 Contextual は Step 3 預け)

### Q2. Correction Memory 範囲
- 案 A: Layer A (= 暗黙的反応のみ) ← Step 2 推奨
- 案 B: Layer A + B (= 明示的 「違う」 button 追加)
- 案 C: Layer A + B + C (= 編集記憶も含む完全版)

### Q3. 評価 dataset 規模
- 案 A: 50 件 (= category 別 8-12 件) ← 推奨
- 案 B: 20 件 minimum
- 案 C: 100 件以上 (= 厳密版、 工数大)

### Q4. CEO 採点 vs LLM-as-judge
- 案 A: 両方併用 (= judge 自動 + CEO 5-10 件サンプル) ← 推奨
- 案 B: judge のみ (= 速い、 CEO 工数 0)
- 案 C: CEO のみ (= 高品質、 工数大)

### Q5. Output Contract 厳格度
- 案 A: 3 field detector + 既存 5 段 ← 推奨
- 案 B: 既存 5 段のみ (= v1)
- 案 C: 4+ field (= structured JSON 完全強制)

### Q6. preview canary 実施前提
- 案 A: §3 評価 dataset 50 件採点合格してから canary ← 推奨
- 案 B: 採点なしで canary、 canary 中に dataset 評価
- 案 C: dataset + forced-failure 両方クリア後に canary

### Q7. Step 2 実装 timing
- 案 A: 本 readiness v2 採用 → CEO Q1-Q6 確定 → 評価 dataset 採点 → canary → 採点合格 → 実装着手 ← 推奨 (= GPT 補正通り)
- 案 B: 本 readiness v2 採用 → 即実装着手 → smoke で評価
- 案 C: Step 1 の canary 結果次第で Step 2 着手判断

---

## 8. 工数見積もり (= 補強反映後)

| Phase | 内容 | 想定 day |
|---|---|---|
| 0 | 本 readiness v2 CEO 採用 + Q1-Q7 確定 | — |
| 1 | 評価 dataset 50 件作成 (= category × time × location 網羅) | 1-2 |
| 2 | LLM-as-judge harness 構築 (= 既存 lib/ai/judge.ts 流用) | 1 |
| 3 | Step 1 出力で 50 件採点 (= baseline) | 0.5 |
| 4 | preview canary deploy + 1-2 week 観測 | — (= waiting) |
| 5 | Canary 採点 → CEO 判定 → Step 2 着手 | — |
| 6 | Step 2 実装 (= 3 層 PM + Output Contract + correction memory layer A) | 4-6 |
| 7 | 50 件採点 (= Step 2)、 §3.2.5 基準 確認 | 1 |
| 8 | Step 2 ON-path smoke + atomic commit | 1 |
| 9 | Step 2 preview canary 採用判定 | — |

合計実装工数 (= Phase 1+2+3+6+7+8): **8-10 day** (= readiness v1 「3-5 day」 から増加、 補強分相応)

---

## 9. 「世界トップ級」 達成の機械保証

CEO 「接続資産、 LLM 学習に使う内容を世界のトッププロダクトに劣らないものに」 への応答:

### 9.1 LLM 単独ではなく Personal Memory loop

- 平均的 LLM プロダクト: prompt + LLM call + 表示
- 本 Plan Step 2 v2: **personal memory + retrieval + LLM + evaluation + correction loop**
- 「LLM を賢くするより LLM に渡す材料を賢くする」 (= GPT 明示)

### 9.2 既存資産の徹底活用 (= 90+ Stargazer module)

- Stable layer: 12 module から抽出
- Recent layer: 13 module から抽出
- Contextual layer: 9 module から抽出
- HDM 統治: 7 module + outputContract.ts 流用
- 評価: lib/ai/judge.ts + lib/ai/eval.ts 既存
- memory: memoryPolicy.ts 4 段階ライフサイクル

これら 50+ module が既に確立されている = Aneurasync の競争優位そのもの。

### 9.3 「進化する Alter」 (= 静的なテンプレではない)

- correction memory で user 反応蓄積 → 次回 prompt 進化
- Phase 移行で個別化深度が変わる (= HDM v1 整合)
- evaluation harness で品質が機械保証され続ける
- training dataset としても流用可 (= future fine-tune の素材)

---

## 10. 不変原則 (= 全遵守)

- env 1 件追加予定 (= `PLAN_PERSONAL_MODEL_INTEGRATION`、 default false)
- DB / package / dependency 変更 0 (= 既存 module + 既存 analytics で完結)
- 規約 24 + 中立文体 + 禁止語 → validator + Output Contract で機械保証
- 既存 Stargazer module **完全 frozen** (= 参照のみ、 改変 0)
- 既存 frozen file 不触
- alter plan scope 限定 (= Calendar / Rendezvous / Stargazer 本体 改変 0)
- HDM v1 + Aneurasync philosophy 整合

---

## 11. 関連 readiness / 設計書

- `docs/alter-plan-p2-llm-readiness.md` v2 (= Step 1 親 readiness)
- `docs/alter-plan-p2-llm-step1-on-path-smoke.md` (= Step 1 smoke 結果)
- `docs/alter-plan-p2-llm-step2-readiness.md` v1 (= 本 v2 の前身)
- `docs/heart-dynamics-model-v1.md` (= HDM Phase + 5 lens + Memory Policy)
- `docs/stargazer-human-os-design.md` (= Personal Model 全体像)
- `memory/aneurasync-philosophy.md` (= 「第二の自己」 思想)
- `lib/stargazer/outputContract.ts` (= Output Contract pattern、 流用必須)
- `lib/stargazer/memoryPolicy.ts` (= 4 段階ライフサイクル)
- `lib/ai/judge.ts` (= LLM-as-judge 既存)
- `lib/ai/eval.ts` (= eval harness 既存)

---

## 12. CEO 思考原則 ①〜⑦ への応答 (= v2 補強で本格達成)

- ① 前提を疑え: 「4 short tag で十分」 ではない (= 粗い個人化) → 3 層構造へ
- ② 自立推論 + リサーチ: Stargazer 90+ module 全インベントリ + 3 層 mapping 完了
- ③ シンプル法案: 各 layer 独立 module、 段階注入 (= Phase 別 readout)、 既存資産流用
- ④ 外科的修正: 既存 module 完全 frozen、 新規 Plan 配下 module 5-7 個追加のみ
- ⑤ ゴール逆算: ゴール (= 「世界トップ級個人化体験」) → 3 層 + memory + eval + contract 4 軸補強
- ⑥ 人間同等推論力: 3 層 PM + correction memory + Output Contract で 「あなたの判断原理を持つ存在」 が初めて成立
- ⑦ 人間能力を超越する革新:
  - **personal memory + retrieval loop** (= 平均 LLM プロダクト超え)
  - **evaluation harness による品質機械保証** (= 勘ではなく数値)
  - **HDM Phase 連動の段階解禁** (= user の準備度に応じた深化)
  - **Negative Capability** (= 「読めない」 を明示する Alter、 「分かったふりしない」 革新性)

---

**結語**: 本 v2 補強で Step 2 は 「ちょっと賢いテンプレ」 から 「世界トッププロダクト級の個人化体験」 へ昇格できる readiness が確立。 着手は CEO Q1-Q7 確定 + 評価 dataset 採点合格 + preview canary 完了 後の再判断 (= GPT 補正通り)。
