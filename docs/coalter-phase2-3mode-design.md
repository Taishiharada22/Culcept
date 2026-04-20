# CoAlter Phase 2 — 3-mode 設計本体（確定版 v0.3）

> **位置づけ**: master-design.md / Phase B food adapter 完成を前提とした **Phase 2 設計 gate 通過版**。
> **目的**: コード着手前に論点を固定する。曖昧なまま着手すると clarify / Intent Translation / NVC が混ざって解けなくなるため。
> **ステータス**: **CEO 承認済み（2026-04-19 v0.3）— コード着手 gate 通過**。
>
> ### v0.3 差分（v0.2 → v0.3、gate 通過時の確定条件）
> - **G6 修正確定**: router / gate / modifier は **theme 非依存** infrastructure / executor rollout は **movie 先行**、food は当面 decision fallback
> - **negotiate proposals = 0 件を許容**（§2.2、§4.2）— 既存 catalog で materialize できないときは pieExpansion だけ返し、次ターンで decision 再実行に戻す
> - **modeRouter は RouterTrace を返す**（§1.3.1）— selectedMode / triggeredSignals / suppressedSignals / previousMode / questionBudget / reason
> - **trace 永続化**: `coalter_messages.metadata` に書く（§1.3.2）
> - **clarify neutralTranslation は「言い換え」まで**（§2.2）— 感情調停・提案・中立化の混入禁止
> - **着手順固定**: types → preRouterGate → modeRouter（**trace 単体テストまで先に通す**）→ builder 群
>
> ### v0.2 差分（v0.1 → v0.2、参考）
> - 中核原則: **「mode selection」と「安全/同意ゲート」と「実行器」を分離**
> - §1 を **Pre-router gate / Mode router / Post-router modifier** の 3 層に再編
> - §2.2 clarify に**出口条件**、negotiate を「**方向作成、materialization は decision pipeline に委譲**」に絞る
> - §3.6 **依存禁止表**を新設

---

## 0. Summary

- Phase 1 の `decision` 専用 CoAlter を、**decision / negotiate / clarify** の 3 モード構成に拡張する。
- `reflect` は Phase 3 に明確に後送り（4 モード目は今回触らない）。
- 新設する中核は `modeRouter.ts` 1 本と、`negotiate` / `clarify` それぞれの narration builder / prompt schema。
- 既存 `decision` パイプライン（Phase B で完成した food / movie narration）は**不可侵**。負荷をかけない。
- LLM narrationEnricher の凍結方針は 3 モード全てで継続。`negotiate` の第三案生成は logic-only で組む。

### Non-goals（Phase 2 では触らない）
- `reflect` モード（Phase 3）
- 個別チャネル（片側にだけ聞く本音引き出し路線）— master-design.md 原則 4、Phase 2 以降の「以降」側
- Rendezvous への CoAlter 展開
- 新規ドメイン追加（travel / activity）。domain 軸は Phase B で別途進行する独立軸

---

## 1. 論点 ① modeRouter の入力信号と 3 層分離【v0.2 で再編】

### 1.0 中核原則

**「mode selection」と「安全/同意ゲート」と「実行器」を分離する。**

これを守るため、処理を **Pre-router gate → Mode router → Post-router modifier → Executor** の 4 段階に分ける。

```
┌─────────────────────┐
│ Pre-router gate     │  起動可否（consent） / 安全ブロック（emotion_heat high）
│   → 通ったら次へ    │  通らなければ no-op / 専門機関提示
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Mode router         │  mode 判定のみ（decision / negotiate / clarify）
│                     │  前ターン状態 previousMode を入力に含む
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Post-router modifier│  emotion_heat mid に応じて語調・質問数を絞る
│                     │  mode 判定は変えない。出力の修飾のみ
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Executor            │  mode 別 builder（decision / negotiate / clarify）
└─────────────────────┘
```

### 1.1 受ける 6 信号

| 信号 | 型 | 供給元 | 用途 | 使われる段階 |
|---|---|---|---|---|
| **consent** | `CoAlterSessionState` | 既存 `coalter_sessions` テーブル | 両者同意済みか | **Pre-gate のみ** |
| **emotion_heat** | `EmotionHeat`（新設） | `nvcAnalysis.ts` の四騎士検出を流用 | high=介入拒否 / mid=語調調整 | **Pre-gate（high）＋ Post-modifier（mid）** |
| **misread** | `MisreadSignal`（新設。Intent Translation の副産物を流用） | `lib/talk/intentTranslation/intentReconstruction.ts` | A の発話を B が誤読している兆候 | Mode router |
| **contradiction** | `ContradictionSignal`（新設） | 会話パーサ（新設 `conversationParser.ts`） | A と B の希望が**明示的に対立** | Mode router |
| **stall** | `StallSignal`（新設） | 同上 | 同じ話題が N ターン以上進まない膠着 | Mode router |
| **ambiguity** | `AmbiguityContext` | `lib/stargazer/alterHomeAdapter.ts` (`runAmbiguityEngine`) | 論点が絞れるか / 致命的情報欠落か | Mode router |

### 1.2 Pre-router gate（起動可否 & 安全ブロック）

```
1. consent.state !== "active"           → no-op（起動拒否）
2. emotion_heat.severity === "high"     → no-op（専門機関提示 / 介入拒否）
3. 通過                                 → Mode router へ
```

**Pre-gate は mode を返さない**。通すか止めるかの二値判定。

### 1.3 Mode router（mode 判定のみ）

```
入力:
  previousMode                : CoAlterMode | null    ← 直前ターンの mode（§1.4）
  previousClarifyTurns        : number              ← 連続 clarify の回数（自己増殖防止）
  previousNegotiateNoProposal : boolean             ← 直前が negotiate かつ proposals=0 だったか
  misread                     : MisreadSignal
  contradiction               : ContradictionSignal
  stall                       : StallSignal
  ambiguity                   : AmbiguityContext

判定（短絡評価、上から順）:
  1. previousNegotiateNoProposal === true
     → "decision" に戻す（前ターン negotiate が pieExpansion のみだった場合の
       decision 再実行、§2.2 negotiate proposals 0 件許容の対）
     reason: "negotiate_no_proposal_retry_decision"
  2. previousMode === "clarify" && previousClarifyTurns >= 1
     && misread.confidence >= 0.7
     → "clarify" は継続させず、1 ターン終了として "decision" に戻す
       （§2.2 clarify 出口条件 c）
     reason: "clarify_self_suppression"
  3. misread.confidence       >= 0.7  → clarify
     reason: "misread_dominant"
  4. contradiction.detected   === true → negotiate
     reason: "contradiction_detected"
  5. stall.detected           === true → decision（branch 寄り）
     reason: "stall_detected"
  6. ambiguity.response_mode  === "conclude" | "branch" → decision
     reason: "ambiguity_conclude" | "ambiguity_branch"
  7. ambiguity.response_mode  === "clarify" → decision（1 問だけ聞く）
     └ ※ Ambiguity Engine の clarify と CoAlter の clarify モードは別物。§3.3 参照
     reason: "ambiguity_clarify_delegate_decision"
  8. default                           → decision
     reason: "default_decision"
```

### 1.3.1 RouterTrace 返り値（監査必須）

modeRouter は mode だけでなく **RouterTrace** を返す。これがないと本番 debug / 監査不能。

```typescript
interface RouterTrace {
  selectedMode: CoAlterMode;                  // 最終決定された mode
  reason: string;                             // §1.3 の分岐名（"misread_dominant" 等）
  triggeredSignals: SignalName[];             // 閾値を超えた信号一覧（順序不問）
  suppressedSignals: SignalName[];            // 閾値を超えたが優先順位で抑制された信号
  previousMode: CoAlterMode | null;           // 直前ターン（自己抑制の根拠）
  questionBudget: 0 | 1;                      // Post-modifier が決定する最大質問数
  timestamp: string;                          // ISO8601
}

type SignalName =
  | "misread" | "contradiction" | "stall"
  | "ambiguity_conclude" | "ambiguity_branch" | "ambiguity_clarify"
  | "previous_clarify_self_suppress" | "previous_negotiate_no_proposal";
```

### 1.3.2 RouterTrace 永続化

- 書き込み先: **`coalter_messages.metadata.routerTrace`**
- 既存 metadata 概念に合わせる（追加 column は作らない）
- 監査クエリ例:
  ```sql
  select metadata->'routerTrace'->>'reason' as reason, count(*)
  from coalter_messages where role = 'coalter'
  group by reason;
  ```

### 1.4 前ターン状態の読み込み

- `modeRouter` は `CoAlterSession` から直前ターンの mode と `consecutiveClarifyCount` を読む。
- 永続化は `coalter_sessions` or `coalter_messages.metadata` のいずれか。実装時に決定。
- **clarify の自己増殖を止めるのはこの機構の責任**（§2.2 出口条件 c 実装の前提）。

### 1.5 Post-router modifier（出力修飾のみ）

- 入力: `mode`（router 決定済み）, `emotion_heat.severity`
- 出力: 各 builder に渡す `ToneModifier`
  - `emotion_heat.severity === "mid"` → `{ softenClosing: true, maxQuestion: 0 }`
  - `emotion_heat.severity === "low" | undefined` → `{ softenClosing: false, maxQuestion: 1 }`
- **mode は絶対に変えない**。decision → negotiate のような副作用を起こさない。
- builder 側: `ToneModifier.softenClosing` を見て closing 文を柔らかくする / `maxQuestion` を見て question を optional 化する。

### 1.6 未決事項

- **contradiction / stall / misread / emotion_heat 検出器の実装場所**
  - 案 A: `lib/coalter/conversationParser.ts` 新設（Phase 2 スコープ内）
  - 案 B: `lib/talk/intentTranslation/` の既存出力を流用
  - 推奨: **A だが misread だけは B 流用**（intentTranslation の資産を CoAlter は**読むだけ**、書き込まない）
- **複数信号同時真の優先順位（Mode router 内）**
  - 現案: misread > contradiction > stall > ambiguity > default
  - 反証: misread と contradiction の重なり（「誤読した結果、対立している」）は頻発。clarify 優先が根本治療、negotiate 優先が表面的。
  - 推奨: **現案（clarify 先）**。根本を直してから対立を解く順序が治療的に正しい。

---

## 2. 論点 ② 3 モードの責務境界

### 2.1 原則「混ぜない」

各モードは**自分の役割だけ**を果たす。他モードに侵食しない。

| モード | 唯一の役割 | やってはいけないこと |
|---|---|---|
| **decision** | 候補提示と収束（5W1H を埋める） | 対立の調停 / 誤読の翻訳 |
| **negotiate** | 利害分解とパイ拡大と第三案 | 候補の直接推薦（それは decision） / 感情の翻訳（それは clarify） |
| **clarify** | 誤読 / 論点ずれの是正、感情と事実の分離 | 新候補の提示 / 第三案生成 / 感情処理そのもの |

### 2.2 入出力契約

#### decision（Phase 1 既存。不可侵）
- 入力: ConversationBrief / 双方 AlterPersonality / 関係性 / 検索結果
- 出力: ProposalCard（5 ブロック：summary / priorities / candidates / reasoning / closing）
- **変更禁止**（Phase 1 で確定済み）

#### negotiate（新規）【v0.3 で proposals 0 件許容を追加】

**原則**: negotiate は**第三案の"方向"を作るレイヤー**であって、**候補生成エンジンを飲み込まない**。

- 入力: decision と同じ + `ContradictionSignal`（どの軸で対立しているか）
- 出力: **NegotiateCard**（新 shape）
  - `summary`: 2 人の対立の構造（「A は X を重視、B は Y を重視」）
  - `interests`: 利害分解（各人の「譲れない / 譲れる」を 2-3 軸で可視化）
  - `pieExpansion`: 第三案の**方向**（軸を 1 つ増やす / 時間をずらす / 場所を変える）
  - `proposals`: **第三案の materialization 結果（0-3 件）** — **0 件を許容**<sup>※v0.3 追加</sup>
  - `closing`: proposals の有無で分岐
    - proposals >= 1: 「これで合うかは 2 人で決めてね」
    - proposals = 0: 「この方向で再検討してみよう。次のターンで具体案を出す」
      - → Mode router は次ターン `previousNegotiateNoProposal=true` を見て**decision に戻す**（§1.3 ルール 1）

**proposals 0 件許容の理由（v0.3）**:
- 既存 `foodRanker` / `movieRanker` を対立軸で再実行しても 2-3 件が出ない場合がある（対立軸が強すぎる / catalog が薄い）。
- 無理に出すと「利害軸に合わないが無理に出した」候補 = **decision より品質の悪い推薦**になる。
- → **品質保全として 0 件を正規表現**。pieExpansion だけで方向を示し、次ターン decision 再実行に委譲する方が筋が良い。

**第三案 materialization の責任分界（最重要）**:
- negotiate **自体が decision を置き換えない**。
- materialization は **decision pipeline に委譲**する。具体的には:
  - negotiate は `interests` / `pieExpansion` から「再 ranking のヒント」（中間軸 / 代替時刻 / 代替エリア）を生成するだけ。
  - 既存 `foodRanker` / `movieRanker` を**その軸ヒントを渡して再実行**する（logic-only、LLM 呼ばない）。
  - webConnector は**原則呼ばない**（§3.6 依存禁止表）。既存 catalog 内で解けなければ **proposals=0 で返し、次ターンで decision に戻す**。
- 結果として: **negotiate builder はサイズが小さい**（方向生成のみ）。ranker 呼び出しは decision と**同じ関数を異なる軸で呼ぶ**だけ。

#### clarify（新規）【v0.2 で出口条件追加、v0.3 で neutralTranslation 粒度固定】
- 入力: 会話履歴（直近 N 件）+ `MisreadSignal` or `stall + ambiguity`
- 出力: **ClarifyCard**（新 shape）
  - `summary`: ずれの構造（「A は X と言ったが、B は Y と受け取った可能性」）
  - `pointList`: 論点の可視化（**事実 vs 感情**に分けて 2 列）
  - `neutralTranslation`: **言い換え**（paraphrase）のみ<sup>※v0.3 固定</sup>
    - A の元発話 → B に届く形に 1 行で言い直し / **逆方向も 1 行**
    - **やってはいけないこと**:
      - 感情調停（「A は本当はこう感じている」等の推測）
      - 第三案の提示
      - 感情の中立化（「そんなに怒らなくても」のような評価・修正）
    - **やってよいこと**:
      - 語用論的な言い換え（敬語シフト、省略の補完、主語/目的語の明示）
      - 両者に同じ語彙で見せ直すこと
  - `question`: 最小限の確認（**最大 1 問**。該当者を明示：「A さんに聞きたい」）
    - 通常 clarify: 最大 1 問
    - `emotion_heat.severity === "mid"`: **0 問**（`ToneModifier.maxQuestion === 0`、§1.5）
    - target 不明（A/B どちらに聞くべきか決まらない）: **0 問**
  - `closing`: 「ここがズレてそうなので、確認してみて」
- **候補提示をしない**。**第三案も出さない**。**感情調停もしない**。翻訳（paraphrase）のみ。

**clarify 出口条件（次ターンでの再判定基準）** — **連続自己増殖防止**:

| 次ターンの観測 | 次ターンの mode |
|---|---|
| **(a) 誤読が解消した**（misread.confidence < 0.5）かつ対立なし | → **decision に戻す** |
| **(b) 誤読は解消したが、対立が残る**（contradiction.detected === true） | → **negotiate へ遷移** |
| **(c) 誤読がなお強い**（misread.confidence >= 0.7、かつ前ターンも clarify だった） | → **clarify 継続しない。1 ターン終了 = decision に戻して次再判定**（§1.3 判定フロー 1） |

**clarify は最大 1 ターン連続**まで。2 ターン目で自動離脱。Intent Translation Engine がメッセージ粒度で残りを引き受ける。

### 2.3 責務境界の反証チェック

| ありがちな侵食 | 発火条件 | 許すと壊れること | 契約で禁じる文言 |
|---|---|---|---|
| decision が対立を感じて第三案を出す | ambiguity + contradiction 両真 | negotiate との役割重複、候補品質劣化 | 「decision は対立を検出しても第三案を作らない。negotiate へ委譲」 |
| clarify が候補を提示する | 翻訳だけでは場が進まない感 | Intent Translation と候補推薦の混線 | 「clarify は候補 0 件。ranker を呼ばない」 |
| negotiate が感情を翻訳する | 対立の根が誤読 | clarify の食い込み。根本治療漏れ | 「negotiate は感情の翻訳をしない。misread が立つと clarify に委譲」 |

---

## 3. 論点 ③ Intent Translation / NVC / Clarify の棲み分け【最重要】

### 3.1 現状の 3 者の住み分け（事実確認）

| 資産 | 対象 | 責務 | ランタイム位置 |
|---|---|---|---|
| **Intent Translation Engine** | Talk メッセージ単体 | 送信前チェック / 受信側ヒント / 調停 — **1 メッセージの意図復元** | `lib/talk/intentTranslation/` |
| **NVC 分析** | Talk メッセージ単体 | 四騎士検出 / 非暴力翻訳 — **1 メッセージの暴力性除去** | `lib/talk/intentTranslation/nvcAnalysis.ts` |
| **CoAlter clarify**（新規） | 2 人の会話全体 | **会話の構造上の論点ずれを可視化** | `lib/coalter/clarifyBuilder.ts`（新設） |

### 3.2 混線しないための 3 原則

1. **粒度で切る**
   - Intent Translation / NVC = **1 メッセージ**
   - CoAlter clarify = **会話全体の構造**
   - clarify は「この 1 文を翻訳して」とは言わない。「2 人の話がどこでズレたか」を言う。

2. **方向で切る**
   - Intent Translation = **私信・片方向**（送信者→受信者の意図復元）
   - NVC = **発話者内の暴力性除去**
   - CoAlter clarify = **両者に同じものを見せる・双方向**

3. **出力形式で切る**
   - Intent Translation / NVC = **送信前の赤入れ / 受信後のヒント**（UI に差し込まれる注釈）
   - CoAlter clarify = **ClarifyCard**（チャット中に登場する独立メッセージ）

### 3.3 Ambiguity Engine の clarify との棲み分け

- **Ambiguity Engine の `response_mode === "clarify"`** = 致命的情報欠落時に **1 問聞く**（Home Alter の挙動）
- **CoAlter clarify モード** = **2 人の誤読を翻訳する**（Home Alter の clarify とは別機能）

両者は名前が同じだが責務が違う。設計書 / 実装では `ambiguityClarify` と `coAlterClarifyMode` で呼び分ける。

### 3.4 具体的な委譲ルール

| 状況 | 担当 | 理由 |
|---|---|---|
| A が書いた 1 文を B に届く形に直したい | Intent Translation | 1 メッセージ粒度 |
| A の暴力的な表現を柔らかくしたい | NVC 分析 | 発話者内処理 |
| 2 人が 3 ターン話しても論点が揃わない | CoAlter clarify | 会話全体の構造 |
| 2 人の希望が対立している | CoAlter negotiate | 対立解消は clarify ではない |
| 何を決めたいかが曖昧 | CoAlter decision + Ambiguity Engine clarify | 1 問だけ聞いて decision へ |

### 3.5 clarify が Intent Translation を**呼ばない**契約

- CoAlter clarify builder は `lib/talk/intentTranslation/` を **import しない**。
- misread 信号の取得のみ、**intentReconstruction の戻り値（既に計算済み）を読む**。
- clarify は Intent Translation の結果を**要約・再編集しない**。粒度を混ぜない。

### 3.6 依存禁止表【v0.2 新設、コードレビュー時の boolean 判定器】

**各モード builder が**呼んでよい / 呼んではいけない依存を固定する。コードレビューは**この表に照らして機械的に判定**できる形式にする（lint ルール / import boundary で将来自動化可能）。

| 依存 | decisionBuilder | negotiateBuilder | clarifyBuilder |
|---|---|---|---|
| `lib/coalter/foodRanker` / `movieRanker`（既存 ranker） | ✅ **可** | ⚠️ **条件付き可**<sup>※1</sup> | ❌ **不可** |
| `lib/coalter/webConnector`（新規 web 検索） | ✅ **可** | ❌ **原則不可**<sup>※2</sup> | ❌ **不可** |
| `lib/coalter/foodCatalog` / `movieCatalog`（catalog 生成） | ✅ **可** | ⚠️ **条件付き可**<sup>※1</sup> | ❌ **不可** |
| Candidate materialization（新規候補を作る） | ✅ **可** | ⚠️ **条件付き可**<sup>※1</sup> | ❌ **不可** |
| `lib/talk/intentTranslation/*`（direct import） | ❌ **不可**<sup>※3</sup> | ❌ **不可** | ❌ **不可** |
| `MisreadSignal`（intentTranslation の戻り値を読むだけ） | ❌ 不要 | ⚠️ 読み取りのみ可 | ✅ **読み取りのみ可** |
| `nvcAnalysis` direct import | ❌ 不可 | ❌ 不可 | ❌ 不可 |
| `EmotionHeat`（nvcAnalysis の戻り値を読むだけ） | ⚠️ 読み取りのみ可 | ⚠️ 読み取りのみ可 | ⚠️ 読み取りのみ可 |
| LLM 呼び出し（narrationEnricher / 他） | ❌ **不可**（Phase 1 凍結継続） | ❌ **不可** | ❌ **不可** |
| `AlterPersonality` / `RelationshipContext` | ✅ 可 | ✅ 可 | ✅ 可（翻訳の根拠に使う） |
| `ConversationBrief` | ✅ 可 | ✅ 可 | ✅ 可 |
| 会話履歴（`coalter_messages`） | ✅ 可 | ✅ 可 | ✅ 可 |

**条件の明示**:
- <sup>※1</sup> **条件付き可（negotiate のみ）**: 既存 ranker / catalog / materialization を使うのは**「利害軸ヒント付きで再実行する」用途に限る**。decision と**同じ関数を異なる軸で呼ぶ**だけ。新規 catalog を別スコアで作り直すのは**不可**。
- <sup>※2</sup> **原則不可（negotiate の webConnector）**: 新規 web 検索は decision の責務。negotiate 内で新検索すると decision の独自版になるため。既存 catalog で解けなければ「次ターンで decision に戻す」。**例外申請は CEO 承認必須**。
- <sup>※3</sup> **decision も intentTranslation direct import は不可**: Phase 1 時点で既に不可（Phase 1 実装に intentTranslation 依存なし）。Phase 2 で 3 モード全て同じルールに統一。

**違反検出の運用**:
- コードレビュー時に表と照合して reject。
- 将来 `eslint-plugin-boundaries` 等で自動化可能（Phase 2 スコープ外、自動化は負債として積む）。

---

## 4. 論点 ④ 出力契約

### 4.1 decision の既存 5 ブロック — 変更なし

```
ProposalCard = { summary, priorities, candidates, reasoning, closing, theme }
```

Phase B で確定済み。Phase 2 で触らない。

### 4.2 negotiate の新ブロック（許容範囲）

```typescript
interface NegotiateCard {
  mode: "negotiate";
  summary: string;                       // 対立構造の描写（候補に触れない）
  interests: {
    a: { nonNegotiable: string[]; negotiable: string[] };
    b: { nonNegotiable: string[]; negotiable: string[] };
  };
  pieExpansion: {
    axisShift: string | null;            // 「軸を 1 つ増やす」提案の 1 行
    timeShift: string | null;
    placeShift: string | null;
  };
  proposals: ProposalCandidate[];        // 第三案 0-3 件【v0.3: 0 件許容】
  closing: string;                       // proposals.length === 0 のときは「次ターンで具体案」文
}
```

**許容の根拠**: decision の `candidates` を**第三案**として再利用できる（同一 shape）。対立構造は decision の `summary` / `reasoning` では表現しきれないため `interests` / `pieExpansion` を独立ブロックで持つ。

**proposals.length = 0 のケース**【v0.3 追加】:
- 既存 catalog で利害軸 materialize できなかった場合のみ。
- `pieExpansion` 3 要素のうち少なくとも 1 つは non-null である必要がある（完全空の NegotiateCard は許さない）。
- builder 実装: `assert(card.proposals.length > 0 || nonNullFieldsCount(card.pieExpansion) > 0)`。
- UI: proposals 0 のときは `pieExpansion` を主表示、candidates 枠を非表示。

### 4.3 clarify の新ブロック（許容範囲）

```typescript
interface ClarifyCard {
  mode: "clarify";
  summary: string;                       // ずれの構造（1-2 文）
  pointList: {
    facts: string[];                     // 事実として整理できる論点
    feelings: string[];                  // 感情として整理できる論点
  };
  neutralTranslation: {
    aToB: string | null;                 // A の発話を B 向けに 1 行
    bToA: string | null;                 // B の発話を A 向けに 1 行
  };
  question: { target: "a" | "b"; text: string } | null; // 最大 1 問
  closing: string;
}
```

**許容の根拠**: clarify は**候補を持たない**。`candidates` / `priorities` ブロックが不在なのは意図的。decision と shape が違うことが「クラリファイ中です」のシグナルになる。

### 4.4 共通: ProposalCard 上位型

```typescript
type CoAlterCard =
  | ({ mode: "decision" } & ProposalCard)
  | NegotiateCard
  | ClarifyCard;
```

- 既存 `ProposalCard` は `{ mode: "decision" }` を追加して discriminated union 化する**だけ**。shape 本体は不変。
- UI 側は `switch (card.mode)` で分岐。Phase 1 UI は `mode === "decision"` 側だけ描画できれば後方互換。

### 4.5 Non-goals（Phase 2 出力契約として禁じる）
- 1 カード内で decision + negotiate / decision + clarify を同時に出す
- LLM に narration を書かせる（Phase 1 enricher 凍結方針継続）
- 候補に venue / film 以外の事実（4 fields 以外の推測）を混ぜる

---

## 5. 実装構成（予定）

```
lib/coalter/
  preRouterGate.ts        ★ 新設（§1.2 consent + emotion_heat high）
  modeRouter.ts           ★ 新設（§1.3 mode 判定のみ）
  postRouterModifier.ts   ★ 新設（§1.5 ToneModifier 生成）
  conversationParser.ts   ★ 新設（contradiction / stall 検出）
  negotiateBuilder.ts     ★ 新設（§2.2 negotiate の logic-only builder、方向作成＋既存 ranker 再実行）
  clarifyBuilder.ts       ★ 新設（§2.2 clarify の logic-only builder）
  narrationTemplate.ts    (既存) — preRouter → modeRouter → postModifier → builder の dispatch 追加
  types.ts                (既存) — CoAlterCard discriminated union、ToneModifier、信号型追加

tests/unit/coalter/
  preRouterGate.test.ts              ★
  modeRouter.test.ts                 ★（前ターン状態、自己増殖防止を含む）
  postRouterModifier.test.ts         ★
  conversationParser.test.ts         ★
  negotiateBuilder.test.ts           ★（decision pipeline 委譲契約の検証）
  clarifyBuilder.test.ts             ★（出口条件・依存禁止の検証）
  narrationTemplate.modeDispatch.test.ts ★
```

既存 `decision` パイプライン（`foodRanker` / `movieRanker` / `narrationBuilder` etc）には**触らない**。negotiate は**既存 ranker を異なる軸で呼ぶだけ**（§2.2、§3.6）。

---

## 6. Phase 2 着手順（v0.3 確定：**router trace を先に通す**）

### フェーズ 6.A — 骨格（**ここまでで最初の gate：router trace が出る単体テスト**）

1. **設計書確定** ✅ 本文書 v0.3
2. **型定義確定** — `types.ts` に:
   - `CoAlterCard` discriminated union
   - `NegotiateCard` / `ClarifyCard` shape
   - `ToneModifier`
   - `RouterTrace` + `SignalName`（§1.3.1）
   - `MisreadSignal` / `ContradictionSignal` / `StallSignal` / `EmotionHeat`
3. **preRouterGate.ts** — consent + emotion_heat high の二値判定
4. **modeRouter.ts** — §1.3 フロー実装 + `RouterTrace` 返却 + 前ターン状態読み込み（§1.4）
5. **★ 単体テスト: router trace が全分岐で正しく出る** — **ここを通してから次に進む**
   - 8 分岐 × 入力パターンで `selectedMode` / `reason` / `triggeredSignals` / `suppressedSignals` が正しい
   - `previousNegotiateNoProposal=true` → `decision + reason="negotiate_no_proposal_retry_decision"`
   - `previousMode="clarify" && previousClarifyTurns>=1 && misread>=0.7` → `decision + reason="clarify_self_suppression"`
   - `emotion_heat mid` → `questionBudget=0`

### フェーズ 6.B — 実行器

6. **postRouterModifier.ts** — emotion_heat mid → `ToneModifier` 生成
7. **conversationParser.ts** — contradiction / stall 検出（misread は intent translation 流用）
8. **negotiateBuilder.ts** — logic-only、既存 ranker を利害軸で再実行（新規 webConnector 不可、§3.6）
   - proposals = 0 許容、`pieExpansion` 非空 assertion
9. **clarifyBuilder.ts** — logic-only、翻訳辞書 + 論点抽出 + 出口条件 + neutralTranslation paraphrase 制約
10. **narrationTemplate.ts dispatch 追加** — preRouter → modeRouter → postModifier → builder
11. **RouterTrace 永続化** — `coalter_messages.metadata.routerTrace` に書く実装

### フェーズ 6.C — 統合

12. **E2E テスト** — 3 モード全てで提案が出ること / 連続 clarify が止まること / emotion_heat mid で語調が絞られること / negotiate 0 件→次ターン decision 再実行
13. **UI 対応** — ClarifyCard / NegotiateCard 描画
14. **G6 rollout 制御** — executor は **movie 先行**。food は当面 decision fallback（§7.G6）

---

## 7. CEO 判断結果（v0.3 gate 通過）

| # | 論点 | **確定内容** |
|---|---|---|
| G1 | Mode router 複数信号優先順位 | ✅ **確定**: misread > contradiction > stall > ambiguity > default(decision) |
| G2 | contradiction / stall 検出の実装場所 | ✅ **確定**: `lib/coalter/conversationParser.ts` 新設、misread は intentTranslation の戻り値を読むだけ |
| G3 | negotiate 第三案の logic-only 縛り | ✅ **確定**: LLM は入れない。Phase 2 は構造固定が先 |
| G4 | clarify の最大 1 問制約 | ✅ **確定**: 通常 1 問、emotion_heat mid = 0 問、target 不明 = 0 問 |
| G5 | CoAlterCard union 化のタイミング | ✅ **確定**: Phase 2 開幕で一括（後から足すと decision 前提が残るため） |
| **G6** | **3 モードの theme 適用範囲** | ✅ **修正確定**: **router / gate / modifier は theme 非依存 infrastructure**、**executor rollout は movie 先行**。food は当面 decision のまま fallback。mode infrastructure は共通、mode-specific executor の本実装は movie 先行。blast radius を抑える |
| G7 | clarify 自己増殖ストッパー位置 | ✅ **確定**: modeRouter 内で見る（Pre-gate に置くと gate が肥大化） |
| G8 | 依存禁止表の強制手段 | ✅ **確定**: Phase 2 は手動レビュー。**負債明示**: eslint-plugin-boundaries 等で自動化予定（Phase 2 スコープ外） |

### v0.3 で追加された確定条件

| # | 確定内容 |
|---|---|
| C1 | **negotiate proposals 0 件許容**（§2.2、§4.2）— 既存 catalog で materialize できないときは pieExpansion だけ返し、次ターンで decision 再実行に戻す |
| C2 | **modeRouter は RouterTrace を返す**（§1.3.1）— selectedMode / reason / triggeredSignals / suppressedSignals / previousMode / questionBudget |
| C3 | **trace 永続化**: `coalter_messages.metadata.routerTrace`（§1.3.2） |
| C4 | **clarify neutralTranslation は「言い換え」のみ**（§2.2）— 感情調停・提案・感情中立化の混入禁止 |
| C5 | **着手順**: types → preRouterGate → modeRouter → **router trace 単体テスト先行** → builder 群（§6） |

---

## 8. 完了定義

- **v0.3 で CEO 承認済み → Phase 2 コード着手 gate 通過**（2026-04-19）
- 次の gate: **フェーズ 6.A（router trace 単体テスト）完了** → executor 実装に進む
- さらに次: フェーズ 6.C（E2E + G6 movie 先行 rollout）→ Phase 2 完了

### 着手中のコード動作が設計書に反した場合

- 設計書を直さず実装を通してはいけない（設計書 ≧ コード）
- 反した場合は v0.4 を起こして再 gate。
- v0.3 の確定内容（C1-C5、G1-G8）は**合意事項**。これを変えるときは CEO 再承認が必須。

---

（以上、設計文書 v0.3 確定版）
