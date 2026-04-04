# Proactive Understanding Engine — 設計書

> **ステータス**: CEO承認済み（2026-04-04）、実装GO条件付き
> **目的**: Alter を「聞かれたら答えるAI」から「能動的に理解を深めるAI」へ進化させる
> **差別化**: ChatGPT/Gemini は受動的応答。Alter は「予測 → 反応回収 → モデル更新 → 次の予測」のループ

---

## 1. 設計思想

### なぜ必要か

現在の Alter の質問ロジックは **欠損補完** に限定されている:
- Daily Guidance Clarify: 時間/エネルギーが不明な時だけ
- P4 Deepening Probe: 3回以上言及されたテーマ等
- Route C Intent Pool: Life Context 欠落時のみ
- Fallback: detectStructuralGaps

**「足りないから聞く」しかなく、「理解を深めるために聞く」パスが存在しない。**

### 中核原則

1. **質問の量ではなく接続密度** — 前の回答が次の質問に反映されていることがユーザーに伝わる
2. **予測 → 反応 → 学習** — 質問の前に必ず Alter の読みを出す（非対称キャッチボール）
3. **属性保存ではなく因果マップ更新** — 「エンジニア」を記録するだけでなく、判断傾向への影響まで接続
4. **クロスセッション複利** — 20回目のセッションが1回目と全く違う体験になる
5. **推論の謙虚さ** — 仮説を仮説として扱い、確定扱いしない

### 禁止事項

- **AIアンケート化**: 質問を並べるだけの体験
- **擬人化の演出先行**: 雑談・感情表現・フレンドリーさは本質ではない
- **最初から全部聞くオンボーディング**: 長い面談は離脱要因。会話中に自然に回収する

---

## 2. アーキテクチャ概要

```
┌───────────────────────────────────────────────────────┐
│            Proactive Understanding Engine               │
│                                                         │
│  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │ Understanding     │  │     Causal Map             │  │
│  │   Model           │  │   CausalLink[]             │  │
│  │  6カテゴリ ×       │  │   origin で信頼度制限      │  │
│  │  confidence       │  │   contradiction_count      │  │
│  │  + gap analysis   │  │   で自動反証               │  │
│  └────────┬─────────┘  └──────────────┬─────────────┘  │
│           │                            │                │
│  ┌────────▼─────────┐  ┌──────────────▼─────────────┐  │
│  │ Trust Budget      │  │  Predictive Probe          │  │
│  │                   │  │    Builder                  │  │
│  │ Earned Trust      │  │  personality × lifeCtx     │  │
│  │  (6ドメイン,      │  │  × understandingGap       │  │
│  │   減衰なし)       │  │  → prediction + probe     │  │
│  │                   │  │    を事前計算              │  │
│  │ Contextual Access │  │                            │  │
│  │  (話題別,         │  │  理由は予測に埋込          │  │
│  │   3トリガー更新)  │  │  (説明文ではなく)          │  │
│  └────────┬─────────┘  └──────────────┬─────────────┘  │
│           │                            │                │
│  ┌────────▼────────────────────────────▼─────────────┐  │
│  │              Probe Scheduler                       │  │
│  │                                                    │  │
│  │  Phase Gate (状態ベース判定)                        │  │
│  │  Per-probe Gates (G1-G6)                           │  │
│  │  Consent Gate (sensitive domain)                   │  │
│  │  Probe Type Selection                              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Payback Tracker                        │  │
│  │  質問で得た情報 → 因果マップ更新                     │  │
│  │  → 関連判断発生時に自動反映                          │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Understanding Model

ユーザー理解の全体像を6カテゴリで管理し、カテゴリ別の確信度で「何がわかっていて何がわかっていないか」を常に把握する。

### 6カテゴリ

| カテゴリ | 含まれる情報 | 既存の対応 |
|---|---|---|
| **judgment** | 判断構造、認知傾向、意思決定パターン | Stargazer 45軸 |
| **livelihood** | 仕事、経済状況、住居、生活リズム | Life Context（部分的） |
| **relationships** | 人間関係マップ、家族、恋人、友人 | Person Map（部分的） |
| **energy** | 消耗源、回復源、エネルギーパターン | Inner Weather（部分的） |
| **desire** | 欲求、恐れ、価値観、目標 | Archetype（部分的） |
| **behavior** | 行動パターン、習慣、ルーティン | Pattern Detection（部分的） |

### 確信度の計算（品質加重方式）

> **設計判断**: fact の数ではなく質で確信度を決める。10個の浅い推論より、1つのユーザー直接発言＋矛盾解消済みの方が確信度が高い。

```typescript
interface CategoryConfidence {
  category: UnderstandingCategory;
  confidence: number;        // 0.0-1.0（品質加重で算出）
  fact_count: number;        // 保持しているfact数
  stale_count: number;       // 鮮度切れのfact数
  last_updated: string;      // 最後に更新された日時

  // 品質指標（confidence 算出の内訳）
  quality_breakdown: {
    fact_diversity: number;           // 0.0-1.0: 情報源の多様性
    recency: number;                  // 0.0-1.0: 鮮度（直近の確認が多いほど高い）
    contradiction_resolved_ratio: number; // 0.0-1.0: 矛盾が解消された割合
    user_stated_ratio: number;        // 0.0-1.0: user_stated origin の割合
  };
}
```

**品質加重の計算式:**

```typescript
function computeCategoryConfidence(facts: Fact[]): number {
  if (facts.length === 0) return 0;

  // 1. fact_diversity: 情報源の種類数 / 全種類数(5)
  const uniqueSources = new Set(facts.map(f => f.source));
  const fact_diversity = uniqueSources.size / 5; // EpistemicSource は5種

  // 2. recency: 各factの鮮度加重平均
  const recency = mean(facts.map(f => freshnessWeight(f.last_confirmed)));

  // 3. contradiction_resolved_ratio: 矛盾が検出され、かつ解消されたfactの割合
  const contradicted = facts.filter(f => f.contradiction_count > 0);
  const resolved = contradicted.filter(f => f.contradiction_resolved);
  const contradiction_resolved_ratio =
    contradicted.length === 0 ? 1.0 : resolved.length / contradicted.length;

  // 4. user_stated_ratio: user_stated origin の割合
  const user_stated_ratio =
    facts.filter(f => f.origin === "user_stated").length / facts.length;

  // 加重合計（量ではなく質が支配的）
  const quality_score =
    fact_diversity * 0.15 +
    recency * 0.25 +
    contradiction_resolved_ratio * 0.25 +
    user_stated_ratio * 0.35;

  // 量の補正: factが少なすぎる場合のみペナルティ（3個未満で減衰）
  const quantity_floor = Math.min(facts.length / 3, 1.0);

  return quality_score * quantity_floor;
}
```

**設計意図:**
- `user_stated_ratio` が最大ウェイト(0.35): ユーザーが直接語った情報は最も信頼できる
- `contradiction_resolved_ratio`(0.25): 矛盾を検出し解消した理解は、一度も矛盾に直面していない理解より強い
- `recency`(0.25): 古い情報だけでは現在の理解として不十分
- `fact_diversity`(0.15): 単一ソースからの大量factより、複数ソースからの少数factの方が堅牢
- `quantity_floor`: factが3個未満の場合のみ減衰。3個以上あれば量は影響しない

**gap analysis**: confidence が最も低いカテゴリを特定し、さらに `quality_breakdown` のどの軸が弱いかを Predictive Probe Builder に渡す。これにより「user_stated が少ないから直接聞く」「矛盾が未解決だから確認する」等の質問戦略に繋がる。

---

## 4. Causal Map

「この人について知ったこと」を「判断傾向への影響」に接続するテーブル。

### データ構造

```typescript
interface CausalLink {
  id: string;
  user_id: string;

  // 何が → 何に影響するか
  source_fact: string;            // "job_type: engineer"
  target_axis: TraitAxisKey;      // "analytical_vs_intuitive"
  influence: "amplify" | "suppress" | "context";

  // 仮説管理
  hypothesis: string;             // "業務で構造的思考を使い続ける → 私生活でも分析偏重になりやすい"
  origin: CausalOrigin;
  confidence: number;             // 0.0-1.0
  evidence_count: number;         // 支持する証拠の数
  contradiction_count: number;    // 矛盾する証拠の数
  last_confirmed_at: string;      // 最後に確認された日時

  created_at: string;
  updated_at: string;
}

type CausalOrigin =
  | "archetype_prior"         // アーキタイプからの事前推論（上限 0.3）
  | "conversation_observed"   // 会話中の行動から推定（0.3-0.7）
  | "user_stated";            // ユーザーが直接言った（0.7-1.0）
```

### confidence 自動更新ルール

```
新しい証拠（evidence_count++）:
  confidence += 0.1（上限 origin別の上限値）

矛盾する証拠（contradiction_count++）:
  confidence -= 0.2（下限 0.1）

contradiction_count > evidence_count:
  仮説の反転を検討（フラグを立て、次の Probe で確認）

last_confirmed_at が 90日以上前:
  confidence *= 0.8（漸減）
```

### origin 別の confidence 上限

| origin | 初期 confidence | 上限 | 根拠 |
|---|---|---|---|
| `archetype_prior` | 0.15 | 0.3 | 一般傾向からの推論。確認なしでは低い |
| `conversation_observed` | 0.3 | 0.7 | 行動から推定。直接確認で上がる |
| `user_stated` | 0.7 | 0.95 | 直接発言。ただし自己認識のズレがありうる |

### 因果接続の例

```
source: "job_type: engineer"

→ target: "analytical_vs_intuitive"
  influence: "amplify"
  hypothesis: "業務で構造的思考を使い続ける → 私生活でも分析偏重になりやすい"
  origin: "archetype_prior"
  confidence: 0.15

→ target: "stress_isolation_vs_social"
  influence: "context"
  hypothesis: "集中作業が多い → 疲れた時に一人になりたがる傾向"
  origin: "archetype_prior"
  confidence: 0.15

→ target: "perfectionist_vs_pragmatic"
  influence: "amplify"
  hypothesis: "コードの正確性が求められる → 完璧主義傾向の強化"
  origin: "archetype_prior"
  confidence: 0.15
```

↑ これらは全て `archetype_prior` なので confidence 0.15。
会話で「締め切りに追われて完璧に仕上げようとして疲弊する」と言われれば、
3つ目の evidence_count++ → confidence 0.25 に上昇。

---

## 5. Trust Budget

### 2層構造

#### Earned Trust（実績信頼）

「このAIはこのドメインの話をわかっている」という累積的な信頼。減衰しない。

```typescript
interface EarnedTrust {
  domain: TrustDomain;
  score: number;           // 0.0 から上限なし
  event_log: TrustEvent[]; // 直近の信頼イベント
}

type TrustDomain =
  | "career"        // 仕事・キャリア
  | "relationship"  // 人間関係・恋愛
  | "identity"      // 自己理解・価値観
  | "health"        // 体調・メンタル
  | "daily"         // 日常の判断・生活
  | "creative";     // 趣味・表現・創造
```

**信頼イベントの種類と重み:**

| イベント | 重み | 説明 |
|---|---|---|
| `voluntary_deep_disclosure` | +2.0 | ユーザーが自発的に深い話をした |
| `question_answered_detail` | +1.0 | 質問に詳しく答えた |
| `prediction_confirmed` | +1.5 | Alter の予測をユーザーが肯定した |
| `repair_succeeded` | +1.0 | 修正指示後に Alter が即座に対応し、ユーザーが受容した |
| `correction_accepted_quickly` | +0.5 | 「違う」の後に素早く軌道修正できた |
| `question_ignored` | -0.5 | 質問を無視された/話題を変えられた |
| `correction_unresolved` | -1.5 | 修正指示後も同じ失敗を繰り返した |
| `prediction_rejected` | -1.0 | Alter の予測をユーザーが否定した |
| `ban_violation` | -3.0 | 禁止表現を使った（RC1連携） |
| `consent_overstepped` | -2.0 | sensitive 領域に無許可で踏み込んだ |

**「違う」の処理 — 修復成功の判定:**

```
ユーザーが「違う」「そうじゃない」と言った場合:

1. 即座の修正あり + ユーザーが次の話題に進んだ
   → repair_succeeded (+1.0)
   → 「違う」自体はスコアに影響しない

2. 即座の修正あり + ユーザーがさらに修正を求めた
   → correction_accepted_quickly (+0.5) + prediction_rejected (-1.0)
   → ネット -0.5

3. 修正なし / 同じ失敗を繰り返し
   → correction_unresolved (-1.5)
   → 最も信頼を損なうパターン
```

#### Contextual Access（文脈アクセス権）

「今この話題に踏み込んでいい空気か」の判断。3トリガーで更新。

```typescript
interface ContextualAccess {
  domain: TrustDomain;
  level: number;              // 0.0-1.0
  last_active: string;        // 最後にこの話題が会話に出た日時
}
```

**3トリガー更新:**

```
1. 時間減衰（ドメイン別日次減衰率）
   career:       0.02/日（50日で半減）
   relationship: 0.03/日（33日で半減）— 感情的話題は鮮度が落ちやすい
   health:       0.04/日（25日で半減）— 体調は最も変動が早い
   identity:     0.01/日（100日で半減）— 自己理解は安定的
   daily:        0.05/日（20日で半減）— 日常は最も変わりやすい
   creative:     0.02/日（50日で半減）

2. イベントリセット
   Life Context で重大変化を検出した場合:
   「転職した」→ career を 0.2 に低下（信頼はあるが文脈が変わった）
   「別れた」→ relationship を 0.1 に低下
   「引っ越した」→ daily を 0.2 に低下
   → イベント後の最初の probe は「変化を前提」にする

3. ユーザー再言及による回復
   ユーザーがそのドメインの話題を自発的に出した → 0.8 に回復
   Alter が質問して答えた → 0.6 に回復（自発より低い）
```

---

## 6. Phase 判定（状態ベース）

### 既存の `deriveTrustLevel()` との統合

現在の `deriveTrustLevel()` は `continuousTrust × sessionsCompleted` の閾値判定。
これを拡張し、以下の複合指標で Phase を判定する。

### Phase 判定指標

```typescript
interface PhaseInputs {
  // 既存指標
  sessions_completed: number;        // セッション数（補助指標）
  continuous_trust: number;          // 既存の連続信頼値

  // 新規指標
  earned_trust_total: number;        // Earned Trust の全ドメイン合計
  self_disclosure_depth: number;     // ユーザーの自己開示の深さ（0-1）
  causal_map_confidence: number;     // Causal Map の平均 confidence
  repair_success_rate: number;       // 修復成功率（修復試行のうち成功した割合）
  understanding_coverage: number;    // Understanding Model の6カテゴリ平均 confidence
}
```

### Phase 判定ロジック

```
Phase 0 → Phase 1 の遷移条件（いずれかを満たす）:
  ├─ sessions_completed >= 3 AND continuous_trust >= 0.2
  ├─ earned_trust_total >= 3.0（少ないセッションでも信頼が高い場合）
  └─ self_disclosure_depth >= 0.4（ユーザーが早期に深い話をした場合）

Phase 1 → Phase 2 の遷移条件（2つ以上を満たす）:
  ├─ sessions_completed >= 6
  ├─ earned_trust_total >= 8.0
  ├─ self_disclosure_depth >= 0.6
  ├─ causal_map_confidence >= 0.3
  └─ repair_success_rate >= 0.7

Phase 2 → Phase 3 の遷移条件（3つ以上を満たす）:
  ├─ sessions_completed >= 12
  ├─ earned_trust_total >= 15.0
  ├─ understanding_coverage >= 0.5
  ├─ causal_map_confidence >= 0.5
  ├─ repair_success_rate >= 0.8
  └─ self_disclosure_depth >= 0.8
```

**設計判断**:
- セッション数は「必要条件」ではなく「十分条件の一部」
- 3回で深く信頼された場合は Phase 1 に早期遷移する
- 20回やっても浅い場合は Phase 1 に留まる
- **Phase は下がることもある**: repair_success_rate が 0.5 を下回ったら Phase を1つ下げる

### Phase 別の行動定義

```
Phase 0: 受容と超局所予測
  ├─ Probe 頻度: 0-1回/セッション
  ├─ Probe scope: utterance_local のみ
  ├─ 予測の出し方: その1発言だけが根拠。性格予測禁止
  ├─ 表現: 「〜に見える」「〜かもしれない」
  ├─ 目標: 「このAIは安全だ」
  └─ 禁止: 性格分析の言及、跨発言パターン認識、深掘り

Phase 1: 信頼構築と控えめな予測
  ├─ Probe 頻度: 1回/セッション
  ├─ Probe scope: session_pattern まで
  ├─ 予測の出し方: 「〜に見える」「〜かもしれない」（低確信）
  ├─ 表現: 低確信表現のみ
  ├─ 目標: 「こいつ、ちょっとわかってるかも」の瞬間を1回作る
  └─ 解禁: Life Context 基本質問（仕事、生活リズム）

Phase 2: 理解深化と予測主導
  ├─ Probe 頻度: 1-2回/セッション
  ├─ Probe scope: cross_session まで
  ├─ 予測の出し方: 「〜だと思う」「〜の傾向がある」（中確信）
  ├─ 表現: 中確信表現
  ├─ 目標: 「自分って、そういう人間だったのか」の瞬間
  └─ 解禁: 矛盾の指摘、パターン命名、人間関係への言及

Phase 3: 第二の自己
  ├─ Probe 頻度: 0-2回/セッション（質が量に勝る）
  ├─ Probe scope: deep_model まで
  ├─ 予測の出し方: 「かなり確信がある」+「ズレてたら教えて」
  ├─ 表現: 高確信 + 修正可能（断定禁止）
  ├─ 目標: 「言わなくてもわかってる」の体験
  └─ 解禁: 深層の傷・欲求への言及、人生方向の提案
  └─ 注意: 質問が減り予測精度が上がることが「第二の自己」の体験
```

---

## 7. Predictive Probe Builder

質問の前に必ず Alter の「読み」を生成し、読みと質問をセットで構造化する。

### 入出力

```typescript
interface PredictiveProbe {
  // 予測（質問の前に出す読み）
  prediction: string;         // "構造を自分で作れる仕事が合いそう"
  prediction_basis: string;   // "analytical_vs_intuitive: 0.7"

  // 質問
  probe: string;              // "運用寄り？企画・設計寄り？"
  probe_type: ProbeType;      // "prediction_led" | "reflective" | "direct"
  scope: ProbeScope;          // "utterance_local" | "session_pattern" | "cross_session" | "deep_model"

  // メタ情報
  target_category: UnderstandingCategory;  // "livelihood"
  target_domain: TrustDomain;              // "career"
  causal_connection: string;               // "analytical_vs_intuitive → 仕事適性"
  trust_cost: number;                      // この質問で消費する Trust Budget
  requires_consent: boolean;               // sensitive domain か
  skip_safe: boolean;                      // 「答えなくてもいい」フラグ
}

type ProbeType =
  | "prediction_led"  // 予測+質問（メイン形式）
  | "reflective"      // 反射的探索（ユーザーの発言を意味レベルで返す）
  | "direct";         // 直接質問（高信頼ドメインのみ）

type ProbeScope =
  | "utterance_local"   // Phase 0から: この1発言だけが根拠
  | "session_pattern"   // Phase 1から: 今セッション内のパターン
  | "cross_session"     // Phase 2から: 複数セッションの蓄積
  | "deep_model";       // Phase 3から: 深層モデル全体
```

### 理由開示の方法

**説明型（禁止）:**
「提案の精度を上げるために聞くんだけど、仕事は何してる？」

**予測埋込型（採用）:**
「判断の仕方を見てると、曖昧さより構造を好む人だと思う。もし仕事でもそういう環境にいるなら、今の悩みの根っこが見えてくるんだけど」

理由は予測の中に自然に溶かす。ユーザーは「ああ、自分の判断傾向から仕事の話に繋がるんだな」と自然に理解する。

### Probe の生成ロジック

```
1. Understanding Model から最も confidence が低いカテゴリを特定
2. そのカテゴリに関連する Stargazer 軸スコアを取得
3. 軸スコアから予測を事前計算（LLM不要）
4. 予測 + 質問をセットで構造化
5. scope / trust_cost / requires_consent を付与
6. system prompt に注入（LLMが文章化）
```

---

## 8. Probe Scheduler

### Gate 構造

```
Session Phase Gate:
  現在の Phase で許可されている scope / 頻度 / Probe type を確認

Per-probe Gates:
  G1: Earned Trust >= domain別閾値
  G2: Contextual Access が有効 OR 質問の深度が浅い
  G3: ユーザーが探索モード（frustration level < 2）
  G4: 前回の probe から十分な間隔（同一セッション内で連続しない）
  G5: 深い質問 → 「答えなくてもいい」安全弁フラグ
  G6: Consent Gate（sensitive domain の場合）
```

### Consent Gate（sensitive domain 用）

#### サブドメイン分割

> **設計判断**: ドメインレベルの consent では粒度が粗すぎる。「恋愛の話はOKだが家族の話はNG」「体調の話はOKだがメンタルの話はNG」は現実に頻出するパターン。サブドメイン単位で consent を管理する。

**サブドメイン定義:**

```typescript
type ConsentSubdomain =
  // relationship サブドメイン
  | "relationship/romance"      // 恋愛・パートナー
  | "relationship/family"       // 家族関係・家族トラウマ
  | "relationship/friendship"   // 友人関係
  | "relationship/professional" // 職場の人間関係

  // health サブドメイン
  | "health/mental"             // メンタルヘルス・心理的課題
  | "health/body"               // 身体の健康・病歴
  | "health/habits"             // 生活習慣（睡眠、食事、運動）

  // identity サブドメイン
  | "identity/wound"            // 深層の傷・自己像の否定的側面
  | "identity/sexuality"        // セクシュアリティ・ジェンダー
  | "identity/values"           // 価値観・信条

  // 他ドメイン（サブドメイン不要: 全体で1 consent）
  | "career"
  | "daily"
  | "creative";

// サブドメインのうち、requires_consent = true のもの
const SENSITIVE_SUBDOMAINS: ConsentSubdomain[] = [
  "relationship/romance",
  "relationship/family",
  "health/mental",
  "health/body",
  "identity/wound",
  "identity/sexuality",
];
```

**Consent 状態の管理:**

```typescript
interface SubdomainConsent {
  subdomain: ConsentSubdomain;
  status: "none" | "implicit" | "explicit" | "revoked";
  updated_at: string;
  cooldown_until: string | null;  // revoked/none 時のクールダウン期限
}
```

**Consent の判定方法:**

```
Explicit Consent（明示的同意）:
  ユーザーが自発的にそのサブドメインの話題を出した → consent = explicit
  例: 「実は最近彼女と別れて...」→ relationship/romance = explicit

Implicit Consent（暗黙的同意）:
  ユーザーが関連話題に反応し、深める方向に進んだ → consent = implicit
  例: Alter「人間関係で何か変化があった？」→ User「実はね...」
  注意: 親ドメインへの implicit は、サブドメインには波及しない
    例: relationship への implicit ≠ relationship/family への implicit

No Consent（同意なし）:
  ユーザーが話題を変えた / 無視した / 短く答えた → consent = none
  → そのサブドメインへの probe を cooldown（3セッション）

Revoked Consent（同意の撤回）:
  ユーザーが「その話はしたくない」等を明示 → consent = revoked
  → そのサブドメインへの probe を indefinite に停止
  → ユーザーが自発的に再度その話題を出すまで解除しない
  注意: サブドメインの revoke は親ドメインの他のサブドメインに波及しない
    例: relationship/family = revoked でも relationship/romance は影響なし
```

**Consent Gate の発動条件:**

```
requires_consent = true（SENSITIVE_SUBDOMAINS に該当）の場合:

1. そのサブドメインに Explicit Consent が過去3セッション以内にある → 通過
2. そのサブドメインに Implicit Consent が過去1セッション以内にある → 通過
3. それ以外 → ブロック。親ドメインの浅い接触から再開
   例: relationship/romance がブロック
   → 「最近、プライベートの方はどんな感じ？」（relationship 全体への浅い問い）
   → ユーザーが恋愛に触れたら relationship/romance = implicit
4. Revoked Consent が存在 → 完全ブロック（サブドメイン単位）
```

**サブドメイン間の独立性:**

```
原則: 各サブドメインの consent は完全に独立
  ├─ relationship/romance = explicit でも relationship/family は none のまま
  ├─ health/habits = implicit でも health/mental は none のまま
  └─ identity/values = explicit でも identity/wound は none のまま

例外: ユーザーが親ドメイン全体を revoke した場合は全サブドメインに波及
  「人間関係の話はしたくない」→ relationship/* = revoked
```

**イベントリセット後の再接触ルール:**

```
重大イベント（「別れた」「転職した」等）検出後:
1. Contextual Access がリセットされる
2. 該当サブドメインの consent は再取得が必要
   「別れた」→ relationship/romance の consent リセット（他は維持）
3. 次の probe は「変化を前提」にする
   悪い例: 「彼女とはどう？」（変化を知らない前提）
   良い例: 「状況が変わってるかもしれないから、今の感じを教えて」
```

---

## 9. Payback Tracker

質問で得た情報が「いつ、どう使われたか」を追跡し、確実にユーザーへの価値に変換する。

### 設計原則

- **1-2ターンでの即時返却は禁止** — 「エンジニアなんだね。エンジニアだと〜」はオウム返し
- **関連判断発生時に自動反映** — 次にそのドメインの判断が求められた時に因果マップ経由で反映
- **使われたことを自然に示す** — 「前に仕事のこと教えてくれたから、今の相談の背景が見えてる」

### データ構造

```typescript
interface PendingPayback {
  source_probe_id: string;     // どの質問で得た情報か
  fact_id: string;             // 保存された fact の ID
  causal_links: string[];      // 生成された CausalLink の ID
  used_in_sessions: string[];  // この情報が活用されたセッション
  first_used_at: string | null; // 初めて活用された日時
}
```

---

## 10. Expression Rules（Phase別表現制約）

### Phase × Confidence の表現マトリクス

| Phase | 表現スタイル | 例 |
|---|---|---|
| Phase 0 | 超局所・控えめ | 「今の言い方だと、答えより整理したい感じが強そう」 |
| Phase 1 | 低確信・仮説 | 「〜に見える」「〜かもしれない」「もしかすると」 |
| Phase 2 | 中確信・方向提示 | 「〜だと思う」「〜の傾向がある」「〜寄りに見えてる」 |
| Phase 3 | 高確信 + 修正可能 | 「かなり確信がある」+「ズレてたら教えて」 |

### 全Phase共通の禁止表現

```
- 「あなたは〜だ」（断定）
- 「絶対に〜」「間違いなく〜」
- 「〜に決まっている」
- 「〜するべきだ」（Phase 3 でも禁止）
```

### Phase 3 の特記事項

Phase 3 は「断定する」フェーズではなく「確信を持ちながら開かれている」フェーズ。

```
良い例:
  「ここはかなり確信がある。たいしさんは構造を作る側の人間で、
   運用に回ると消耗する。ここまで見てきて、ほぼ間違いないと思ってる。
   でも、変わることもあるから、違ったら言って」

悪い例:
  「たいしさんは構造を作る側の人間です。運用には向いていません」
```

---

## 11. 既存システムとの統合

### `deriveTrustLevel()` の拡張

現在の `deriveTrustLevel(continuousTrust, sessionsCompleted)` を拡張し、
`derivePhase(PhaseInputs)` に置き換える。

既存の `discreteTrustLevel`（0-4）は互換性のために維持し、Phase から変換:
```
Phase 0 → discreteTrustLevel 0
Phase 1 → discreteTrustLevel 1
Phase 2 → discreteTrustLevel 2-3
Phase 3 → discreteTrustLevel 3-4
```

### Intent Pool との統合

既存の Intent Pool (Layer 3 / Layer 6) は Probe Scheduler の入力候補として残す。
Predictive Probe Builder が生成する probe と Intent Pool の候補を統合し、
最もスコアの高い probe を選択する。

### Output Governance Layer との連携

- RC1（動的会話制約）: ban 違反は `ban_violation` として Trust Budget に反映
- RC5（フラストレーション検出）: frustration level >= 2 で全 probe をブロック
- Probe Scheduler の G3 Gate が RC5 の出力を参照

### route.ts での注入位置

```
既存パイプライン:
  P0-5 → P1-C → Governance Layer → v4.2 Contracts → LLM生成

拡張後:
  P0-5 → P1-C → Governance Layer → v4.2 Contracts
  → Proactive Understanding Engine (Probe Builder + Scheduler)
  → probe が選択された場合、system prompt に注入
  → LLM生成
  → 応答後: Payback Tracker + Causal Map 更新
```

### System Prompt 圧縮戦略

> **設計判断**: Proactive Understanding Engine が生成する情報を全て system prompt に注入すると、トークン数が爆発しLLM品質が劣化する。「今ターンで本当に必要な最小セット」だけを注入する。

**3つの圧縮ルール:**

```
1. top_1_probe_only
   ├─ Probe Scheduler が複数候補を持っていても、注入するのは最高スコアの1つだけ
   ├─ 2つ目以降は「次回候補」として内部保持するが prompt には入れない
   └─ 理由: LLMに選択肢を渡すと曖昧な質問になる。1つに絞ることで自然な会話になる

2. top_1_2_gaps_only
   ├─ Understanding Model の6カテゴリのうち、最も confidence が低い上位1-2カテゴリのみ注入
   ├─ 全カテゴリの状態をダンプしない
   ├─ 注入形式: "理解の薄い領域: livelihood(0.12), energy(0.18)"
   └─ 理由: LLMにカテゴリ一覧を見せると「全部聞こう」とする傾向が出る

3. relevant_causal_links_only
   ├─ Causal Map の全リンクではなく、今ターンの話題に関連するリンクのみ注入
   ├─ 関連判定: 今ターンの detected_domain + probe の target_category に接続するリンク
   ├─ 上限: 最大5リンク（confidence 降順）
   └─ 理由: 無関係な因果リンクはLLMの注意を分散させる
```

**注入テンプレート（圧縮後）:**

```
[Proactive Understanding — 今ターン]
Phase: {phase}
理解の薄い領域: {top_1_gap.category}({top_1_gap.confidence})
{top_2_gap ? ", " + top_2_gap.category + "(" + top_2_gap.confidence + ")" : ""}

{probe ? `
[予測的質問]
予測: {probe.prediction}
根拠: {probe.prediction_basis}
質問: {probe.probe}
注意: {probe.skip_safe ? "答えなくてもいいと伝える" : ""}
` : ""}

{relevant_links.length > 0 ? `
[関連する因果接続]
${relevant_links.map(l => `${l.source_fact} → ${l.target_axis}: ${l.hypothesis} (${l.confidence})`).join("\n")}
` : ""}
```

**圧縮後の推定トークン数:**
- Phase + gap: ~30 tokens
- Probe（ある場合）: ~80 tokens
- Causal links（0-5本）: ~50-150 tokens
- **合計: 最大 ~260 tokens**（全ダンプだと推定 1,000-3,000 tokens）

**ON/OFF ゲート:**

```typescript
interface ProactiveEngineGates {
  // マスタースイッチ
  engine_enabled: boolean;           // false → 全機能停止、既存パイプラインのみ

  // 個別ゲート
  probe_injection_enabled: boolean;  // false → probe を system prompt に注入しない
  causal_link_injection_enabled: boolean; // false → 因果リンクを注入しない
  gap_injection_enabled: boolean;    // false → gap 情報を注入しない

  // 学習ゲート
  trust_tracking_enabled: boolean;   // false → Trust Event を記録しない
  causal_map_update_enabled: boolean; // false → Causal Map を更新しない
  payback_tracking_enabled: boolean; // false → Payback Tracker を更新しない
}

// デフォルト: 全て有効（CEOが実会話で判断後、個別に無効化可能）
const DEFAULT_GATES: ProactiveEngineGates = {
  engine_enabled: true,
  probe_injection_enabled: true,
  causal_link_injection_enabled: true,
  gap_injection_enabled: true,
  trust_tracking_enabled: true,
  causal_map_update_enabled: true,
  payback_tracking_enabled: true,
};
```

---

## 12. DB スキーマ（新規テーブル）

### `stargazer_alter_causal_map`

```sql
CREATE TABLE stargazer_alter_causal_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),

  source_fact text NOT NULL,
  target_axis text NOT NULL,
  influence text NOT NULL CHECK (influence IN ('amplify', 'suppress', 'context')),

  hypothesis text NOT NULL,
  origin text NOT NULL CHECK (origin IN ('archetype_prior', 'conversation_observed', 'user_stated')),
  confidence float NOT NULL DEFAULT 0.15,
  evidence_count int NOT NULL DEFAULT 0,
  contradiction_count int NOT NULL DEFAULT 0,
  last_confirmed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_causal_map_user ON stargazer_alter_causal_map(user_id);
```

### `stargazer_alter_trust_budget`

```sql
CREATE TABLE stargazer_alter_trust_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  domain text NOT NULL CHECK (domain IN ('career', 'relationship', 'identity', 'health', 'daily', 'creative')),

  -- Earned Trust
  earned_score float NOT NULL DEFAULT 0.0,

  -- Contextual Access
  contextual_level float NOT NULL DEFAULT 0.0,
  contextual_last_active timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, domain)
);
```

### `stargazer_alter_consent`（サブドメイン単位）

```sql
CREATE TABLE stargazer_alter_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  subdomain text NOT NULL,  -- "relationship/romance", "health/mental", etc.

  status text NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'implicit', 'explicit', 'revoked')),
  cooldown_until timestamptz,  -- revoked/none 時のクールダウン期限
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, subdomain)
);

CREATE INDEX idx_consent_user ON stargazer_alter_consent(user_id);
```

### `stargazer_alter_trust_events`

```sql
CREATE TABLE stargazer_alter_trust_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  domain text NOT NULL,
  event_type text NOT NULL,
  weight float NOT NULL,
  session_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trust_events_user ON stargazer_alter_trust_events(user_id, created_at DESC);
```

---

## 13. 実装計画

### P0: 基盤（既存拡張）
1. `derivePhase()` — 状態ベース Phase 判定の実装
2. Trust Budget テーブル作成 + Earned Trust / Contextual Access の基本ロジック
3. Causal Map テーブル作成 + origin / confidence 管理

### P1: Probe 生成
4. Predictive Probe Builder — 軸スコアから予測+質問を事前計算
5. Probe Scheduler — Gate 構造 + Phase Gate + Consent Gate
6. route.ts 統合 — Probe を system prompt に注入

### P2: 学習ループ
7. Payback Tracker — 質問結果の因果マップ更新
8. Trust Event 計測 — ユーザー行動から信頼イベントを自動検出
9. Understanding Model — 6カテゴリの confidence 集計 + gap analysis

### P3: 評価
10. Replay テスト — 実会話ログで Probe の適切さを検証
11. Phase 遷移テスト — 各種ユーザーパターンで Phase が正しく遷移するか
12. Consent Gate テスト — sensitive domain で適切にブロックされるか
