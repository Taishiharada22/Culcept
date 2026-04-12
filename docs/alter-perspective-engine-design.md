# Alter Perspective Engine — 設計書 v2

**日付**: 2026-04-12（v2: CEO + GPT レビュー反映）
**ステータス**: Phase 0 着手中
**起案**: Build Unit（Deep Research 4並列調査に基づく）

### v2 変更点（v1 → v2）
1. 内省系も発火対象に追加（「自分の性質って普通？」等の自己理解×外部視点型）
2. 「結論を変えない」→「ForceBalance の重みを更新しうる」に修正（演出ではなく実質的影響）
3. 実行順を統一（analyzeQueryContext → classifyQuestion → searchGate → retrieve）
4. 内部監査タグ追加（source_type: internal | external_augmented | mixed）
5. Phase 0 評価を5軸比較に強化、confidence閾値をタイプ別に変更、件数制限をトークン予算制に

---

## 0. Executive Summary

Alter に Web 検索を統合し、「本人モデル × 外界の多視点 × AI の統合知能」を実現する。
ただし、リサーチで発見された重大な失敗モードを踏まえ、「Alter が検索する」のではなく
**「Alter が外の世界を自分のレンズで解釈する」** という存在論を採用する。

### 核心の公式

```
Alter = 本人を最も理解している存在
      + 外界の膨大な視点を必要な時だけ持ち帰れる存在
      + その視点を、その人の人生に合う形へ再編集できる存在
```

---

## 1. リサーチで発見された事実

### 1.1 技術的に最適なアーキテクチャ

| 比較軸 | Traditional RAG | Tool-Use | Agentic RAG | **推奨: Hybrid** |
|--------|----------------|----------|-------------|-----------------|
| 検索判断 | 常に検索 | LLMが判断 | エージェントが判断 | **Intent Classifier + LLM** |
| クエリ生成 | 固定的 | LLM依存 | 分解+並列 | **ドメイン別戦略** |
| レイテンシ | 予測可能 | 低い | 高い | **fail-open 2秒上限** |
| Alter適合度 | 低 | 高 | 部分的 | **最高** |

**根拠**: Red Hat 研究(2025)で Tool RAG がツール呼び出し精度3倍・プロンプト長半減を達成。
Azure AI Search の Agentic Retrieval、IBM の Agentic RAG 設計パターンも参照。

### 1.2 Search API 選定

| API | コスト/1K | レイテンシ | LLM最適化 | 推奨 |
|-----|----------|-----------|----------|------|
| **Exa.ai** | $7 | <180ms | 高（セマンティック） | **主系統** |
| **Brave Search** | $5 | <600ms | 高（LLM Context API） | **副系統** |
| Tavily | $7.5 | ~2.3s | 最高 | レイテンシで却下 |
| Perplexity Sonar | $5-14 | <2s | 高 | 回答生成がAlterの声を上書きするリスク |
| Google CSE | $5 | 中 | 低 | LLM最適化不足 |

**Exa を主力にする理由**:
- ニューラルインデックスによるセマンティック検索（キーワードでは見つからない関連情報を発見）
- Instant モードで 180ms 以下（Alter の会話フローを阻害しない）
- 構造化 highlights がそのまま LLM context に注入可能
- $7/1K queries（contents込み）で実質最安クラス

**Brave を副系統にする理由**:
- 独自 35B ページインデックスでファクチュアル情報に強い
- SOC2 TypeII、Zero Data Retention（プライバシー保護）
- Exa 障害時のフォールバック

### 1.3 反証で発見された重大リスク（7類型）

| # | リスク | 深刻度 | 緩和策 |
|---|--------|--------|--------|
| 1 | **幻覚増幅** — 検索結果の誤情報を「事実」として取り込む | 高 | Epistemic分類 + confidence gate |
| 2 | **権威バイアス** — 外部情報が内面的価値観より重み付けされる | 最高 | パーソナルモデルFIRST原則 |
| 3 | **情報過多** — 入力長増大だけで LLM 性能が劣化する | 高 | 最大2件制限 + 要約注入 |
| 4 | **新しさバイアス** — 時不変の判断原理が一時的トレンドで上書きされる | 中 | 時間構造との整合性チェック |
| 5 | **エコーチェンバー** — 確認しても挑戦してもダメの二重拘束 | 中 | diversity floor 20% |
| 6 | **プライバシー漏洩** — 深層心理が検索クエリに混入 | 最高 | Privacy Gate（クエリ浄化層） |
| 7 | **レイテンシ劣化** — 「調べてから答える」は存在論的矛盾 | 高 | 非同期 + fail-open |

**最も厳しい反論（Steel-man）**:

> **存在論的矛盾**: HDM は「generative model の内側から世界を受け取る」への転換を宣言した。
> Web 検索は「外側から世界を持ち込む」行為であり、真逆。
> 検索する瞬間、Alter は「内面を映す鏡」から「情報アシスタント」に退化する。

> **ChatGPT クローン化**: 検索精度と速度で ChatGPT に確実に負ける。
> Alter の勝ち筋は「検索では到達できない自己理解の深さ」。
> 検索を入れることは自ら競争軸を不利な方向に移動させること。

> **帰属の崩壊**: 「Alter が言った」のか「ネットの記事がそう言っていた」のか不明確になり、
> Phase 制御・Trust 管理・rupture 検出の精密な制御系が破壊される。

### 1.4 学術的に発見された設計原理

**Integrative Complexity（統合的複雑性）** — Suedfeld & Tetlock:
- 分化: 複数の視点が存在することを認識する能力
- 統合: 分化された視点間にリンクを形成し、一貫した判断に統合する能力
- IC が高い人は危機状況で矛盾する情報をより効果的に処理できる
- → Alter は単に選択肢を並べるのではなく、IC を促進するよう設計すべき

**Toulmin 論証モデル** — ACL 2024 でゼロショット論証分析が最高成功率:
- Claim（主張）← Data（根拠）← Warrant（論拠）+ Qualifier（限定）+ Rebuttal（反駁）
- → 検索結果を ForceBalance の各力に対する「根拠」として構造化

**臨床意思決定支援システム（CDSS）からの並行関係**:
- 医学文献 DB → Alter の Web 検索結果
- 患者データ → Stargazer 性格モデル + HDM Phase
- 臨床ガイドライン → ActionShape + ForceBalance
- → 「エビデンスと個人データの統合」は医療 AI で確立されたパターン

**自律性に関する警告** — Nature (2024), Philosophy & Technology (2025):
- AI 決定支援は「本物の価値形成」能力を侵食する
- アルゴリズムが「ユーザーの authentic self から逸脱させる」リスク
- 判断の帰属ギャップ: 「その決定は本当に自分のものか」
- → 外部情報は「材料」であり「結論」であってはならない

---

## 2. 設計思想: 反証を踏まえた解決策

### 2.1 存在論的矛盾の解消

反論「検索は外側から世界を持ち込む行為」への回答:

**人間のアナロジーで考える。**
人間の「自分らしさ」は、外界の情報を遮断することで保たれるのではない。
本を読み、人に聞き、ネットで調べ、それらを「自分のフィルター」で消化することで深まる。
Alter も同じ。外界を遮断した Alter は「閉じた自己」であり、それは本当の自己理解ではない。

**設計上の解決**:
- 検索結果は Alter の「知覚」として扱う（外部注入ではなく、Alter が世界を見に行った結果）
- Alter の声は常に一人称で語る: 「調べてみたんだけど」ではなく「こういう見方もあるって思った」
- 検索結果は結論を直接上書きしない。だが ForceBalance の重みを更新し、最終裁定を変えうる
- つまり「材料」として個人モデルの内側に取り込まれ、判断の力学を実質的に動かす

### 2.2 ChatGPT クローン化の回避

**Alter は「情報を返す」のではなく「視点を消化して自分の言葉で語る」。**

| ChatGPT / Perplexity | Alter |
|----------------------|-------|
| 「Xという研究によると...」 | 「こういうタイプの人って、実はこうなりがちなんだよね」 |
| 引用リンク付き | 引用なし（Alter の声で統合） |
| 検索結果の要約 | パーソナルモデルを通した解釈 |
| 正確性が目標 | 自己理解の深化が目標 |

**差別化の核心**: ChatGPT は「正しい情報を返す」。Alter は「あなたにとって意味のある視点を、あなたの内側から語る」。

### 2.3 帰属崩壊の防止

**2層分離アーキテクチャ**:

```
┌─────────────────────────────────────────┐
│ Layer 1: Alter の声（常に表示）           │
│ = パーソナルモデルに基づく内面的洞察       │
│ = 検索結果を「消化済み」の形で統合         │
│ → ユーザーはこれを「Alter の言葉」と認識   │
├─────────────────────────────────────────┤
│ Layer 2: 視点の出典（オプショナル）        │
│ = 「もっと知りたい？」で展開              │
│ = 元の情報源へのリンク                    │
│ → ユーザーが自分で確認できる               │
└─────────────────────────────────────────┘
```

Layer 1 と Layer 2 は **決して同じ文章内で混ぜない**。

### 2.4 監査可能性の確保（v2 追加）

表示は自然にAlterの声で統合するが、**内部では帰属を追跡**する:

```typescript
interface AlterResponseAudit {
  source_type: 'internal' | 'external_augmented' | 'mixed';
  perspective_fragments_used: PerspectiveFragment[];  // 使用した外部視点
  forceBalance_delta: Partial<ForceBalance>;          // 外部視点による重み変動
  search_queries_sent: string[];                       // 実際に送信した検索クエリ
  search_latency_ms: number;
}
```

- UI 上: Alter の声で自然に統合（引用禁止は維持）
- UI 補助: 小さな「外部視点あり」インジケーター（控えめに）
- 内部ログ: source_type + fragments + delta を全て記録
- 管理画面: どの質問で外部視点が使われ、ForceBalance がどう動いたか監査可能

### 2.5 ForceBalance への実質的影響（v2 修正）

v1 では「検索結果が結論を変えることはない」としたが、これは強すぎた。
検索結果が演出で終わるなら、コストだけ増えて体験は変わらない。

**v2 の定義**:
- 外部情報は結論を **直接上書き** しない（「ネットでXと書いてあったからX」は禁止）
- 外部情報は ForceBalance の **重みを更新しうる**（evidence → force adjustment）
- 最終裁定は更新された ForceBalance + ActionShape から導出される
- つまり、外部視点は「判断の力学」を動かすが、「判断の枠組み」は動かさない

```
Before search:  opportunity=0.6, cost=0.4 → bounded_go
After search:   opportunity=0.7(+0.1), cost=0.5(+0.1) → prepare_then_go
                ↑ 検索で機会の具体性が増し、同時にリスクの具体性も増した
                → 結論の「形」が変わった（より慎重な前進に）
```

---

## 3. アーキテクチャ

### 3.1 全体パイプライン

```
ユーザーの質問
    │
    ▼
┌──────────────────────────────────────────────────┐
│ Phase 1: GATE（検索要否判定）                      │
│                                                    │
│ 既存の classifyQuestion() + analyzeQueryContext()   │
│ に searchNeed スコアを追加                          │
│                                                    │
│ SearchNeedScore = f(                               │
│   temporalSignals,        // 時間的新しさへの言及   │
│   factualDensity,         // 事実確認の密度         │
│   entityMentions,         // 固有名詞の数           │
│   domainExternalRelevance,// ドメインの外部情報有用性│
│   personalModelCoverage   // PMで回答可能な割合     │
│ )                                                  │
│                                                    │
│ Gate 条件:                                         │
│   searchNeed > 0.6                                 │
│   AND responseMode ∉ {clarify, repair}             │
│   AND HDM Phase >= 2                               │
│   AND Trust >= 3                                   │
│   AND NOT greeting/ask_me                          │
│   （※ 内省系でも外部視点が有効な問いは発火対象）    │
│   （例: 「HSPって甘え？」「この性格って普通？」）    │
│                                                    │
│ → 通過: Phase 2 へ                                 │
│ → 不通過: 従来パス（変更なし）                      │
└──────────────────────────────────────────────────┘
    │
    ▼ (Gate 通過時のみ)
┌──────────────────────────────────────────────────┐
│ Phase 2: RETRIEVE（検索実行）                      │
│                                                    │
│ 2a. Privacy Gate — クエリ浄化                      │
│   パーソナルモデル情報を除去した検索クエリを生成     │
│   性格タイプ、感情状態、関係性情報は送信しない       │
│   小さなLLMで分離実行（メインコンテキスト非接触）   │
│                                                    │
│ 2b. Query Expansion — ドメイン別クエリ生成          │
│   単純事実: 単発クエリ                              │
│   判断支援: Multi-Query Decomposition（最大3分岐）  │
│   Personal Model Augmented Query:                  │
│     性格プロファイルを反映したクエリ方向付け         │
│     （プロファイル自体は送信しない）                 │
│                                                    │
│ 2c. Search Execution                               │
│   Exa.ai（セマンティック検索）主系統                │
│   Brave Search（ファクチュアル情報）副系統           │
│   Promise.race([search(), timeout(2000)])           │
│   → 失敗時: 従来パスにフォールバック（fail-open）   │
│                                                    │
│ → 最大 3-5 件の生検索結果                          │
└──────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│ Phase 3: CLASSIFY（認識論的分類）                   │
│                                                    │
│ 各テキスト断片にメタデータを付与（LLM構造化出力）   │
│                                                    │
│ PerspectiveFragment {                              │
│   text: string                                     │
│   epistemicType:                                   │
│     'empirical_fact'      // 検証可能な事実          │
│     | 'statistical_claim'  // 数値を伴う主張         │
│     | 'expert_analysis'    // 専門家の解釈           │
│     | 'normative_claim'    // 「べき」を含む規範     │
│     | 'opinion'            // 個人の見解             │
│     | 'personal_experience'// 体験に基づく記述       │
│     | 'anecdote'           // 特定事例の語り         │
│   confidence: 0-1                                  │
│   sourceAuthority: academic|govt|industry|media     │
│   stanceTowardQuery: support|oppose|neutral|nuanced│
│   forceRelevance: {                                │
│     opportunity: 0-1  // この情報はチャンスを示すか  │
│     cost: 0-1         // この情報はコストを示すか    │
│     relationship: 0-1 // この情報は関係性に関わるか  │
│     value: 0-1        // この情報は価値観に関わるか  │
│     fear: 0-1         // この情報は恐れに関わるか    │
│     growth: 0-1       // この情報は成長に関わるか    │
│   }                                                │
│ }                                                  │
│                                                    │
│ フィルタ（タイプ別 confidence 閾値）:               │
│   empirical_fact / statistical_claim: >= 0.7       │
│   expert_analysis: >= 0.6                          │
│   opinion / experience / anecdote: >= 0.5          │
│   normative_claim: 破棄（Alterは「べき」を語らない）│
│ 制限: 2〜4件、圧縮後トークン上限 400 tokens        │
│ diversity floor: 対立視点を最低1件含む              │
└──────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│ Phase 4: PERSONALIZE（個人モデル適用）              │
│                                                    │
│ Toulmin 構造で ForceBalance に接続:                 │
│                                                    │
│ opportunity_evidence: [Fragment A]                  │
│   → Claim + Data + Warrant + Qualifier + Rebuttal  │
│ cost_evidence: [Fragment B]                        │
│   → Claim + Data + Warrant + Qualifier + Rebuttal  │
│                                                    │
│ ユーザーの判断パターンとの照合:                     │
│ - risk_aversion高い → fear_trigger を認識しつつ     │
│   「あなたはここに反応しやすい」と自覚を促す        │
│ - novelty_seeking高い → opportunity に引かれがち    │
│   と伝えた上で cost も提示                          │
│                                                    │
│ suppressedTraits に関連する視点を軽くブースト        │
│ → 「自分って、そういう人間だったのか」の材料         │
│                                                    │
│ 出力: PersonalizedPerspectiveBlock                  │
│   （システムプロンプトに注入可能な形式）             │
└──────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│ Phase 5: SYNTHESIZE（統合的応答生成）               │
│                                                    │
│ 既存の buildHomeAlterPromptWithContext() に          │
│ PersonalizedPerspectiveBlock を追加注入              │
│                                                    │
│ プロンプト指示:                                     │
│ 「以下の外部視点を参考にしてもよいが、              │
│   あなたの結論は必ずパーソナルモデルから導出せよ。   │
│   外部情報を引用するな。自分の言葉で消化して語れ。  │
│   『調べた』『記事によると』は禁止。                │
│   『こういう見方もあるんだけど』『実はね』で語れ。」 │
│                                                    │
│ IC促進構造:                                        │
│   1. 結論（ActionShape で形を選択）                 │
│   2. 根拠（ForceBalance + 構造化 perspective）      │
│   3. 反対側（「ただ、こういう面もある」）            │
│   4. 個人化（「あなたの場合、ここが鍵」）           │
│                                                    │
│ HDM Phase 別の深度:                                 │
│   P0-1: 外部視点を使わない（信頼構築期）            │
│   P2:   事実のみ提示（分化のみ）                    │
│   P3:   事実+解釈（分化+初期統合）                  │
│   P4+:  深い統合（内面から語る）                    │
│   P5:   Reality Anchoring と接続                    │
└──────────────────────────────────────────────────┘
```

### 3.2 現行パイプラインへの注入ポイント

`app/api/stargazer/alter/route.ts` の既存フローに対して:

```
既存: loadAlterGrowthState() (line ~987)
  ↓
既存: analyzeQueryContext() → classifyQuestion()  ← ドメイン・質問分類を先に実行
  ↓
★ 新規: Search Gate 判定（queryContext + questionCategory を見て searchNeed 算出）
  ↓
★ 新規: 検索実行（2秒timeout、fail-open）
  ↓
★ 新規: 検索結果の分類 + 個人化（classify + personalize）
  ↓
既存: buildHomeAlterPromptWithContext()
  ↓
★ 新規: PersonalizedPerspectiveBlock をシステムプロンプトに追加
  ↓
既存: runAI() → LLM生成 → postProcessing
  ↓
★ 新規: 監査タグ付与（source_type: internal | external_augmented）
```

**実行順の根拠**: ドメイン検出と質問分類を先に行うことで、Search Gate が「何について
検索すべきか」を正確に判断できる。v1 では検索が先、分類が後だったが、これだと
検索クエリの方向付けが曖昧になる。

**変更しないもの**:
- AlterPersonality 構築ロジック
- ForceBalance / ActionShape 算出ロジック
- Ambiguity Engine / Domain Detection
- Relational Lens
- HDM Phase 制御 / Trust 管理
- 「影の声」制約（1回答1箇所、1文目結論14-28文字）
- Daily Guidance Engine（別パイプライン）

### 3.3 Privacy Gate（プライバシー保護層）

**絶対原則**: ユーザーの深層心理・判断パターン・感情状態・関係性情報を検索エンジンに送信しない。

```
ユーザーの質問: 「上司との関係がしんどい。転職すべき？」
パーソナルモデル: attachment不安型、権威に対して回避傾向

Privacy Gate の処理:
  入力: 質問 + パーソナルモデル（参照のみ）
  
  生成するクエリ（Exa に送信）:
    ✅ "職場の上下関係 ストレス 対処法"
    ✅ "転職 タイミング 判断基準"
    ❌ "attachment不安型 上司 回避" ← パーソナル情報が混入
    ❌ "権威に対して回避傾向がある人の転職" ← パーソナル情報が混入
  
  パーソナルモデルの活用:
    → クエリ生成には使わない
    → 検索結果のフィルタリング・解釈に使う（ローカル処理）
```

### 3.4 Kill Switch

P4-6 の counterfactualLive と同様のパターン:

```typescript
// lib/stargazer/featureFlags.ts
STARGAZER_FLAGS = {
  // ... 既存フラグ ...
  perspectiveEngineLive: false,  // CEO判断で有効化
}

// 環境変数
STARGAZER_PERSPECTIVE_ENGINE_LIVE=false
```

---

## 4. 検索が発火するケース / しないケース

### 4.1 発火する（searchNeed > 0.6）

| ドメイン | 質問例 | 検索クエリ例 | 目的 |
|---------|--------|-------------|------|
| career | 「転職すべきか」 | "転職市場 2026 動向" | 判断の外部根拠 |
| creation | 「起業したいけど不安」 | "スタートアップ 初期 リスク管理" | 事実+体験談 |
| health | 「HSPって甘えなの？」 | "HSP 高感受性 科学的根拠" | 専門家見解 |
| lifestyle | 「一人暮らし始めたい」 | "一人暮らし 初期費用 準備" | 実用情報 |
| relationship | 「距離を置きたいと言われた」 | "パートナー 距離感 心理学" | 多視点 |
| self+external | 「HSPって甘えなの？」 | "HSP 高感受性 科学的根拠" | 自己理解の立体化 |
| self+external | 「内向的な人って損してる？」 | "内向型 強み キャリア 研究" | 外部視点で自己理解を補強 |
| self+external | 「こういう性格って普通？」 | "性格特性 分布 心理学" | 正規化と安心 |

### 4.2 発火しない

| カテゴリ | 質問例 | 理由 |
|---------|--------|------|
| 純粋感情 | 「今日しんどい」 | 共感が目的、情報は不要 |
| 純粋内省 | 「僕の強みって何？」 | パーソナルモデルで完結する自己理解 |
| greeting | 「おはよう」 | 明らか |
| ask_me | 「質問してほしい」 | 観測モード |
| clarify | （曖昧性解消中） | 検索ではなく対話が必要 |
| repair | （rupture修復中） | 信頼回復が最優先 |
| Phase 0-1 | 全質問 | 信頼構築期は内面のみ |
| Trust < 3 | 全質問 | 十分な関係性がない |

### 4.3 ChatGPTとの比較データ

ChatGPT の実績データ（8,500+プロンプト調査）:
- 全プロンプトの 31% で Web 検索が発火
- 初回質問で発火、フォローアップではほとんど発火しない
- 1クエリあたり平均2回の検索実行

**Alter の想定**:
- 全質問の **15-20%** で発火（ChatGPTの半分）
- Phase/Trust ゲートでさらに絞られ、実効発火率は **10%以下**
- 1クエリあたり 1-2 回の検索（コスト: ~$0.007/回）

---

## 5. Perspective Engine の認識論的分類

### 5.1 学術的根拠

- **Stance Detection**: LLMベースの手法が2019-2025年で急速発展（arxiv 2505.08464）
- **Propositional Claim Detection**: F1=0.91 を達成（Springer s42001-024-00289-0）
- **Fact vs Opinion**: 論証構造の特徴量で分類精度が大幅向上（ACL 2020）
- **Toulmin ゼロショット**: 全モデルで最高成功率（ACL 2024）

### 5.2 7段階の認識論的ラベル

| ラベル | 定義 | Alter での活用 |
|--------|------|---------------|
| `empirical_fact` | 検証可能な事実 | 「実はこうなんだよね」 |
| `statistical_claim` | 数値を伴う主張 | 「数字で見ると...」 |
| `expert_analysis` | 専門家の解釈 | 「専門的に見ると...って考え方もある」 |
| `normative_claim` | 規範的主張 | フィルタ対象（Alterは「べき」を語らない） |
| `opinion` | 個人の見解 | 「こう考える人もいるんだけど」 |
| `personal_experience` | 体験記述 | 「似た経験をした人の話だと」 |
| `anecdote` | 特定事例 | 「こういうケースもあって」 |

### 5.3 ForceBalance との接続（Toulmin構造）

```
質問: 「転職すべきか？」

[opportunity の根拠]
  Claim: 年収が上がる可能性が高い
  Data: 業界平均年収データ（empirical_fact, confidence: 0.9）
  Warrant: 現職より高い業界へ移るため
  Qualifier: 「一般的に」
  Rebuttal: 経験年数が足りない場合は除く

[cost の根拠]
  Claim: 新環境への適応リスクがある
  Data: 転職後1年以内の離職率25%（statistical_claim, confidence: 0.8）
  Warrant: 環境適応には心理的コストがかかる
  Rebuttal: 適応力が高い人は影響が小さい

→ Alter の出力:
  「やってみていいと思う。ただ、君の場合さ、
   新しい環境に飛び込むこと自体は得意じゃないよね。
   でもそれって、慎重だからこそ一度決めたらブレない強さでもある。
   実際、同じような状況で動いた人って、
   最初の半年がきつくても1年後には安定してることが多いんだよね。
   問題は年収とかじゃなくて、君が今の場所で消耗し続けることのコストだと思う。」
```

---

## 6. コスト試算

### 6.1 検索API コスト

| 項目 | 計算 | 月額 |
|------|------|------|
| Exa.ai | 1000セッション × 10%発火率 × 1.5クエリ/回 × $0.007 | ~$1.05 |
| Brave | フォールバック用、月50回想定 × $0.005 | ~$0.25 |
| **合計** | | **~$1.30/月** |

### 6.2 LLM コスト（分類用）

| 項目 | 計算 | 月額 |
|------|------|------|
| Privacy Gate（クエリ浄化） | Haiku、100回 × ~$0.001 | ~$0.10 |
| 認識論的分類 | Haiku、100回 × ~$0.002 | ~$0.20 |
| **合計** | | **~$0.30/月** |

**総コスト: ~$1.60/月**（1000セッション規模で）

---

## 7. 実装フェーズ

### Phase 0: 最小検証 —「返答の質がどれだけ変わるか」を測る
- [ ] Exa.ai API 統合（perspectiveEngine.ts にコアロジック）
- [ ] Search Gate 実装（searchNeed スコア + ドメイン/質問分類連動）
- [ ] Privacy Gate 実装（クエリ浄化）
- [ ] 認識論的分類 + ForceBalance 接続
- [ ] **A/B 比較テスト**: 同一質問 × 同一ユーザープロファイルで
  - A: 現行 Alter（検索なし）
  - B: Perspective Engine 統合 Alter（検索あり）
  - **5軸で比較**:
    1. **具体性** — 抽象論で終わらず、具体的な情報・数字・事例が含まれるか
    2. **多視点性** — 1方向の意見ではなく、複数の角度から語れているか
    3. **本人適応** — その人のパーソナルモデルに合った解釈になっているか
    4. **直答率** — 質問に対して明確な結論を出せているか（「いろんな意見があるね」化してないか）
    5. **テンプレ減少** — 定型的な励まし・一般論が減り、固有の洞察が増えているか
- [ ] **失敗4パターン検出**:
  - ❌ ChatGPT劣化版化（検索結果をそれっぽく喋るだけ）
  - ❌ 「いろんな意見があるね」bot 化（結論が弱くなった）
  - ❌ 監査不能（どこが内面推論でどこが外部視点か区別不能）
  - ❌ 抽象的なまま（コスト増えて体験変わらない）

### Phase 1: パイプライン構築（2週間）
- [ ] Privacy Gate 実装
- [ ] 認識論的分類（LLM 構造化出力）
- [ ] PersonalizedPerspectiveBlock の生成
- [ ] システムプロンプトへの注入
- [ ] Kill switch（`STARGAZER_FLAGS.perspectiveEngineLive`）

### Phase 2: 品質検証（1週間）
- [ ] 検索発火率の確認（目標: 10-20%）
- [ ] 応答品質の A/B 比較（検索あり vs なし）
- [ ] 「Alter の声が壊れていないか」の主観評価
- [ ] レイテンシ計測（目標: +2秒以内）
- [ ] プライバシー漏洩チェック（検索クエリの監査）

### Phase 3: 本番有効化（CEO判断）
- [ ] `STARGAZER_PERSPECTIVE_ENGINE_LIVE=true`
- [ ] Phase 5 ユーザーから段階的に開放
- [ ] 「自己理解が深まったか」の計測開始

---

## 8. 絶対に守る設計制約

1. **パーソナルモデル FIRST**: 外部情報は ForceBalance の重みを更新しうるが、結論を直接上書きしない
2. **声の統一**: 「調べた」「記事によると」は禁止。Alter の一人称で語る
3. **帰属の明確性**: Layer 1（Alterの声）と Layer 2（出典）を同一文章内で混ぜない
4. **内部監査**: source_type タグ + perspective_fragments_used + forceBalance_delta を全応答に記録
5. **Privacy Gate 必須**: パーソナルモデル情報を検索エンジンに送信しない
6. **fail-open**: 検索失敗時は従来パスにフォールバック。検索がないと答えられない状態を作らない
7. **Phase/Trust ゲート**: P0-1 と Trust<3 では検索を一切使わない
8. **トークン予算制**: 2〜4件、圧縮後 400 tokens 以内（情報過多防止）
9. **diversity floor**: 対立視点を最低1件含む（エコーチェンバー防止）
10. **normative_claim フィルタ**: 「べき」を含む規範的主張は破棄。Alter は「べき」を語らない
11. **直答率の維持**: 多視点を入れた結果「いろんな意見があるね」で終わることを禁止。必ず結論を出す
12. **Kill switch**: CEO判断で即座に無効化可能

---

## 9. 学術的参考文献

### アーキテクチャ
- Agentic RAG: Letting LLMs Choose What to Retrieve (TechAhead, 2025)
- Tool RAG: The Next Breakthrough in Scalable AI Agents (Red Hat, 2025)
- Agentic Retrieval Overview (Azure AI Search, Microsoft)
- Query Optimization in LLMs Survey (arxiv 2412.17558)

### 失敗モード
- Context Length Alone Hurts LLM Performance (EMNLP 2025)
- Lost in the Middle: How Language Models Use Long Contexts (Stanford)
- Making RAG Robust to Irrelevant Context (ICLR 2025)
- When Retrieval Succeeds and Fails (arXiv 2025)

### 自律性・意思決定
- Autonomy by Design (Philosophy & Technology, 2025)
- Inevitable Challenges of Autonomy in Personalized Algorithmic Decision-Making (Nature, 2024)
- Owning Decisions: The Attributability-Gap (PMC, 2024)

### 認識論・論証
- LLMs Meet Stance Detection Survey (arxiv 2505.08464, 2025)
- Propositional Claim Detection (Springer, 2024)
- Harnessing Toulmin's Theory for Zero-Shot Argument (ACL 2024)
- Argumentation Schemes (Walton, Reed, Macagno)
- Computational Argumentation-based Chatbots (JAIR 2024)

### 認知科学
- Integrative Complexity and Decision-Making (Frontiers in Psychology, 2024)
- Perspective Taking as Problem Solving (PMC)
- User Modeling and User Profiling Survey (arxiv 2402.09660)
- Big Five and AI Agent Decision-Making (arxiv 2503.15497)

### 多視点・バイアス
- Search Engines in the AI Era (ACM FAccT 2025)
- AI Echo Chambers (TechRxiv)
- Filter Bubble and Novelty-Seeking (Wiley, 2024)
- News Source Citing Patterns in AI Search (arxiv 2507.05301)

### 検索API
- Exa.ai vs Tavily Comparison (exa.ai, 2026)
- Brave Search LLM Context API (brave.com, 2026)
- Agentic Search Benchmark: 8 APIs (AIMultiple, 2026)
- How Perplexity Built an AI Google (ByteByteGo)
