# Stargazer v4: Self-Decoding Engine (自己解読エンジン) 設計書

> **"Stargazerは、毎日あなたに「自分が自分に隠していること」を一つ教え、「明日のあなたの行動」を予言し、その精度を日々証明していく——世界初の自己解読エンジン"**

---

## 目次

1. [設計思想とコアループ](#1-設計思想とコアループ)
2. [既存システムとの接続](#2-既存システムとの接続)
3. [Feature 1: Blind Spot Drop](#3-blind-spot-drop-ブラインドスポットドロップ)
4. [Feature 2: Daily Prophecy](#4-daily-prophecy-デイリー予言)
5. [Feature 3: Unseen Map](#5-unseen-map-アンシーンマップ)
6. [Feature 4: Inner Weather + Pressure Map](#6-inner-weather--pressure-map)
7. [Feature 5: Ghost Resonance](#7-ghost-resonance-ゴーストレゾナンス)
8. [Feature 6: Alter](#8-alter-アルター)
9. [Feature 7: Decision Oracle](#9-decision-oracle-判断オラクル)
10. [Feature 8: Psyche Signature + Psyche Wrapped](#10-psyche-signature--psyche-wrapped)
11. [Feature 9: Prediction Accuracy Score](#11-prediction-accuracy-score)
12. [Feature 10: Provocation Mode](#12-provocation-mode)
13. [Feature 11: Archetype Stories](#13-archetype-stories)
14. [Database Schema](#14-database-schema)
15. [API Routes](#15-api-routes)
16. [User Journey: 1日の体験設計](#16-user-journey-1日の体験設計)
17. [Free vs Paid 設計](#17-free-vs-paid-設計)
18. [Technical Stack とインフラ](#18-technical-stack-とインフラ)
19. [実装優先順位](#19-実装優先順位)

**作成日**: 2026-03-16
**ステータス**: CEO レビュー待ち
**担当**: Build Unit

---

## 1. 設計思想とコアループ

### 心理学的基盤

v4 は以下の4つの心理学原理を統合した中毒性のあるループを構築する。

| 原理 | 実装 | 効果 |
|------|------|------|
| **Self-Referential Processing (VMPFC)** | 全コンテンツが「あなた」に言及 | 脳が自己関連情報を報酬として処理 |
| **Variable Reward (ドーパミン)** | warm / harsh のランダム切替 | 予測不能性が中毒性を生む |
| **Information Gap Theory (Loewenstein)** | 部分開示 → 全体は有料 | 知れば知るほど「もっと知りたい」 |
| **Prediction-Verification Loop** | 予言 → 翌日検証 | 科学的好奇心が自己観察を習慣化 |

### コアループ

```
朝: Blind Spot Drop (通知) → 気づきを受け取る
   ↓
日中: Daily Prophecy の検証 → Inner Weather 記録
   ↓
夕方: Daily Observation (既存) → 新データ取得
   ↓
夜: 明日の Prophecy 生成 → Alter との対話
   ↓
週末: Psyche Wrapped → SNS シェア → 新規ユーザー獲得
```

### v3 → v4 の進化

| 領域 | v3 | v4 |
|------|----|----|
| 観測 | 質問 → スコア | 質問 + 行動 + 投影 + 状態 → 多層解析 |
| 出力 | 特性カード・インサイト | 予言・ブラインドスポット・対話 |
| 時間軸 | 過去の蓄積 | 過去 + 現在の状態 + 未来の予測 |
| 関与 | 観測セッション時のみ | 1日を通じた継続的エンゲージメント |
| 共有 | プロフィール表示 | Psyche Signature / Wrapped でバイラル |

---

## 2. 既存システムとの接続

### v4 が依存する既存データソース

```
lib/stargazer/traitAxes.ts
  └── 45軸 (TRAIT_AXIS_KEYS) — 全機能の基礎スコア
  └── 6カテゴリ: core, relational, motion, aesthetic, emotional, safety

lib/stargazer/threeMirrors.ts
  └── ThreeMirrorProfile — 自画像 / 足跡 / 影絵の3ソース
  └── MirrorAxisScore — 各軸の3ミラースコア + 観測回数
  └── AxisDivergence — ミラー間のズレ検出 (magnitude + insight + hypothesis)
  └── MirrorConfidence — 確信度算出 (overall + perMirror + divergentAxesCount)
  └── 重み付き統合: selfPortrait=0.30, footprint=0.35, shadowPlay=0.35

lib/stargazer/contradictionMap.ts
  └── ContradictionMap — ズレから心理構造を抽出
  └── ContradictionMeaning — ideal_gap / adaptation_mask / unconscious_value /
                              contextual_self / growth_edge / protective_pattern
  └── ContradictionEntry — 軸ごとのズレ分析 + 探索プロンプト

lib/stargazer/predictiveClone.ts
  └── PredictiveCloneResult — 5シナリオの判断予測
  └── ClonePrediction — softmax確率分布 + 推論コメント
  └── PredictionScenario — 状況 × 選択肢 × 軸重み

lib/stargazer/fluctuationEngine.ts
  └── AxisDistribution — 生きた分布 (center, range, stability, trend)
  └── ObservationState — energy / emotion / social / timeOfDay
  └── ConditionShift — 条件 → 軸シフトの記録

lib/stargazer/archetypeTypes.ts
  └── ArchetypeCode (27タイプ: Layer1 x Layer2 x Layer3)
  └── Layer1: 核 (P=存在証明, B=接続, H=安全圏)
  └── Layer2: 確信源 (E=実証, I=直観, S=感覚)
  └── Layer3: 行動スイッチ (A=前進, W=待機, D=防御)

lib/stargazer/dailyInsightEngine.ts
  └── DailyGreeting / DailyWhisper — 既存のインサイト生成
  └── ContradictionInsight — カード間矛盾検出
  └── getTraitCardNarrative() — カードごとの物語・影・兆候
```

### データフロー概念図

```
[User Input]                    [Passive Collection]
    |                                |
    +-- 観測回答 (daily Q&A)         +-- 応答時間
    +-- Inner Weather 入力           +-- 操作パターン
    +-- Prophecy 検証               +-- 画面遷移
    +-- Decision Oracle 入力        +-- 閲覧傾向
            |                            |
            +---- Three Mirror Engine ----+
                        |
            +-----------+-----------+
            |           |           |
        Self-Portrait  Footprint  Shadow Play
            |           |           |
            +-----------+-----------+
                        |
              +---------+---------+
              |                   |
        Integrated Score    Divergence Map
              |                   |
     +--------+----+      +------+------+
     |             |      |             |
  Archetype   Prediction  Blind Spot   Contradiction
  Resolver    Engine      Engine       Map
     |             |      |             |
     +-------------+------+-------------+
                   |      |
          +--------+------+--------+
          |                        |
    Daily Prophecy          Blind Spot Drop
    Decision Oracle         Alter Dialogue
    Ghost Resonance         Unseen Map
    Psyche Signature        Inner Weather
```

---

## 3. Blind Spot Drop (ブラインドスポット・ドロップ)

### 概要

毎日1つ、ユーザーが「自分に隠していること」を通知で届ける。三面鏡のズレ（自己申告 vs 行動 vs 投影）から最もインパクトのある盲点を抽出し、warm / harsh をランダムに切り替えて配信する。

### データ構造

```typescript
// lib/stargazer/blindSpotEngine.ts

interface BlindSpotDrop {
  id: string;
  userId: string;
  date: string;                // YYYY-MM-DD
  axisId: TraitAxisKey;
  divergenceType: DivergenceType;
  magnitude: number;           // 0-1
  tone: "warm" | "harsh";
  headline: string;            // 短い見出し (push通知用)
  body: string;                // 本文 (アプリ内表示用)
  deepDive: string;            // 深掘り解説 (有料)
  explorationPrompt: string;   // 次の問いかけ
  deliveredAt: string | null;  // ISO timestamp
  openedAt: string | null;
  reactionType: "resonated" | "surprised" | "rejected" | "saved" | null;
}

interface BlindSpotSelection {
  // 候補スコアリング: divergence magnitude x novelty x recency decay
  candidateScore(axis: AxisDivergence, history: BlindSpotDrop[]): number;
  // tone 決定: 70% warm / 30% harsh (Provocation Mode 時は逆転)
  selectTone(userId: string, date: string, provocationMode: boolean): "warm" | "harsh";
}
```

### 候補スコアリングロジック

```
score = divergence.magnitude              // ズレの大きさ (0-1)
      * noveltyBonus(axis, recentDrops)   // 最近触れていない軸に bonus (1.0-2.0)
      * depthReady(axis, observationCount) // 十分な観測があるか (0-1)
      * (1 - recencyDecay(axis, lastDropDate)) // 同じ軸は間隔を空ける (0-1)
```

ステップ:
1. `detectDivergences()` で三面鏡の全軸ズレを取得
2. 各ズレに対して候補スコアを算出
3. 上位3候補を AI に渡し、最も「刺さる」表現を選定
4. tone に応じて warm / harsh のテンプレートを適用
5. DB に保存し、配信時刻をスケジュール

### Warm vs Harsh テンプレート

**Warm (温かい気づき):**
```
headline: "あなたが自分に許していないこと"
body: "「慎重」を美徳だと語りながら、本当は飛び込みたくてうずうずしている。
       行動データはそれを知っている。慎重さは鎧であって、あなた自身ではない。
       鎧を脱いでいい場所が、あるはず。"
```

**Harsh (Co-Star風の挑発):**
```
headline: "嘘つき"
body: "「一人が好き」って言ってるけど、行動を見る限り、
       あなたは寂しがり屋だ。認めたくないだけ。
       自画像スコア: -0.7 (内向)  足跡スコア: +0.3 (外向)"
```

### 配信タイミング

- 1日1回、ランダムな時刻に Push 通知
- 配信ウィンドウ: 8:00-22:00 (ユーザーのタイムゾーン)
- 具体的な時刻は `hash(userId + date) % (22-8) + 8` でシード固定
- Edge Cron (`api/cron/blind-spot-generation`) で日次 05:00 にバッチ生成
- Edge Cron (`api/cron/blind-spot-delivery`) で毎時チェック → Push API で配信

### Information Gap の設計

- Push 通知には headline のみ表示 → 「何だろう？」でアプリ起動
- アプリを開くと body が表示 → 具体的な内容
- deepDive は Premium 限定 → 「なぜこのズレが生まれたのか」の詳細分析
- explorationPrompt は次の観測への橋渡し → エンゲージメント持続

### AI Prompt 構造

```typescript
async function generateBlindSpotContent(
  divergence: AxisDivergence,
  axisScores: MirrorAxisScore,
  archetype: ArchetypeCode,
  tone: "warm" | "harsh",
  history: BlindSpotDrop[]
): Promise<{ headline: string; body: string; deepDive: string; explorationPrompt: string }> {

  const systemPrompt = `
あなたは Stargazer の Blind Spot Engine。
ユーザーの三面鏡データから「自分が自分に隠していること」を伝える。

トーン: ${tone === "warm" ? "温かく、共感的に、しかし核心を突く" : "鋭く、辛辣に、しかし的確に。Co-Star的な挑発"}

ルール:
- headline は15文字以内。Push通知で1行に収まること
- body は100文字以内。具体的なデータ(スコアや傾向名)を含めること
- deepDive は200文字以内。「なぜこのズレが生まれるのか」を心理学的に解説
- explorationPrompt は問いかけの形式。次の観測へのフックになること
- 過去に配信した内容: ${history.slice(0, 5).map(h => h.headline).join(", ")}
  → これらと重複しない角度で
  `;

  // AI Router を使用
  return aiRouter.generate({ systemPrompt, userPrompt, model: "claude-sonnet" });
}
```

---

## 4. Daily Prophecy (デイリー予言)

### 概要

毎晩、翌日の具体的な行動を予測し、翌日にユーザーが検証する。世界初の「自分の行動を予測し、精度を証明する」機能。

### データ構造

```typescript
// lib/stargazer/prophecyEngine.ts

interface DailyProphecy {
  id: string;
  userId: string;
  targetDate: string;          // 予言の対象日 (翌日)
  generatedAt: string;
  category: ProphecyCategory;
  prediction: string;          // "午後に重要な判断を先送りにする"
  reasoning: string;           // なぜこの予測に至ったか
  confidenceScore: number;     // 0-1 予測の確信度
  basedOn: ProphecyBasis[];    // 予測根拠のリスト
  // 検証
  verifiedAt: string | null;
  verificationResult: "accurate" | "partially" | "inaccurate" | "skipped" | null;
  userComment: string | null;
}

type ProphecyCategory =
  | "decision"          // 判断に関する予言
  | "social"            // 対人関係に関する予言
  | "emotion"           // 感情状態に関する予言
  | "avoidance"         // 回避行動に関する予言
  | "energy"            // エネルギー管理に関する予言
  | "communication";    // コミュニケーションスタイルに関する予言

interface ProphecyBasis {
  source: "axis_score" | "archetype" | "inner_weather" | "past_pattern" | "day_of_week" | "contradiction";
  detail: string;
  weight: number;        // この根拠の寄与度 (0-1)
}
```

### 予測ロジック

入力データ:
1. **45軸統合スコア** — 基本的な傾向 (buildDualAxisScores の objective)
2. **ArchetypeCode** — 特に Layer3 (ストレス下行動: A=前進, W=待機, D=防御)
3. **Inner Weather 履歴** — 直近の心理状態とトレンド
4. **曜日パターン** — 過去の同曜日の観測データ集約
5. **三面鏡のズレ** — 「言っていること」と「やること」の乖離がある軸
6. **ConditionShift** — fluctuationEngine の条件→軸シフト記録
7. **過去の Prophecy 的中パターン** — どのカテゴリが当たりやすいか

```typescript
async function generateProphecy(
  userId: string,
  targetDate: string,
  profile: {
    axisScores: Record<TraitAxisKey, number>;
    archetype: ArchetypeCode;
    innerWeatherTrend: InnerWeather[];
    contradictionMap: ContradictionMap;
    conditionShifts: ConditionShift[];
    pastAccuracy: Record<ProphecyCategory, number>;
  }
): Promise<DailyProphecy> {

  const dayOfWeek = new Date(targetDate).getDay(); // 0=Sun
  const layer3 = profile.archetype[2]; // A/W/D

  // 1. カテゴリ選択: 過去の的中率が高いカテゴリを優先しつつローテーション
  const category = selectCategory(profile.pastAccuracy, dayOfWeek, targetDate);

  // 2. AI で予言を生成
  const prompt = `
ユーザープロファイル:
- アーキタイプ: ${profile.archetype}
  - Layer1 (核): ${describeLayer1(profile.archetype[0])}
  - Layer3 (ストレス反応): ${describeLayer3(layer3)}
- 最も強い傾向 (上位3軸):
  ${getTopAxes(profile.axisScores, 3).map(([k, v]) => `  - ${k}: ${v}`).join("\n")}
- 現在の Inner Weather: ${describeWeather(profile.innerWeatherTrend[0])}
- 直近の矛盾: ${profile.contradictionMap.primaryTheme}
- 明日は ${["日","月","火","水","木","金","土"][dayOfWeek]}曜日
- カテゴリ: ${category}

上記に基づき、明日の具体的な行動を1つ予測せよ。

形式: 「あなたは明日、[具体的状況]で[具体的行動]をする」

制約:
- 検証可能で具体的であること
- 抽象的すぎない (NG: "良い1日になる")
- 限定的すぎない (NG: "13:42に水を飲む")
- ユーザーが「当たった/外れた」を判断できるレベル
- カテゴリ (${category}) に沿った内容
  `;

  const result = await aiRouter.generate({
    systemPrompt: PROPHECY_SYSTEM_PROMPT,
    userPrompt: prompt,
    model: "claude-sonnet",
  });

  return {
    id: generateId(),
    userId,
    targetDate,
    generatedAt: new Date().toISOString(),
    category,
    prediction: result.prediction,
    reasoning: result.reasoning,
    confidenceScore: computeConfidence(profile, category),
    basedOn: result.bases,
    verifiedAt: null,
    verificationResult: null,
    userComment: null,
  };
}
```

### 検証フロー

翌日の夕方 18:00 に検証通知を送信:

```
通知: "昨日の予言を振り返ろう"

アプリ内表示:
  "予言: 「午後に重要な判断を先送りにする」"
  "確信度: 72%"

  選択肢:
  [ドンピシャ] → 予測精度 +2pt
  [まあまあ]  → 予測精度 +1pt
  [外れた]    → 予測精度 +0pt (外れても減点しない — 離脱防止)
  [スキップ]  → 対象外

  任意コメント入力欄: "確かに午後に会議の返事を後回しにした"
```

### 予言のバリエーション例

| カテゴリ | 予言例 | 根拠 |
|----------|--------|------|
| decision | "午後、選択肢が2つある場面で、安全な方を選ぶ" | cautious_vs_bold: -0.6 |
| social | "今日、誰かの誘いを断りたくなるが、結局受ける" | independence_vs_harmony: +0.4 |
| emotion | "15時頃、急にエネルギーが落ちて集中力を失う" | Inner Weather パターン |
| avoidance | "やるべきことを後回しにして、代わりに別のことを始める" | plan_vs_spontaneous: +0.3 |
| energy | "午前中は調子がいいが、昼食後に失速する" | energy トレンド |
| communication | "言いたいことがあるのに、相手の反応を気にして飲み込む" | direct_vs_diplomatic: -0.5 |

---

## 5. Unseen Map (アンシーンマップ)

### 概要

Fog-of-War (視界の霧) RPG メカニクスを自己理解に適用。45軸 x 5深度レベル = 225タイルが、観測のたびに少しずつ開放される。

### マップ構造

```typescript
// lib/stargazer/unseenMap.ts

interface MapTile {
  axisId: TraitAxisKey;
  depth: TileDepth;
  status: "hidden" | "fog" | "revealed" | "deep_revealed";
  revealedAt: string | null;
  content: TileContent | null;
}

type TileDepth =
  | "surface"        // 表層: 基本傾向 (自画像のみで開放)
  | "behavioral"     // 行動層: 行動データとの照合 (足跡で開放)
  | "unconscious"    // 無意識層: 投影との照合 (影絵で開放)
  | "contradiction"  // 矛盾層: 3つのズレの分析 (全ミラーで開放)
  | "origin"         // 起源層: なぜこの傾向があるのか (AI深掘りで開放)

interface TileContent {
  title: string;
  insight: string;
  score?: number;
  mirrorSources: MirrorSource[];
}

interface UnseenMapState {
  tiles: MapTile[];                // 33 axes x 5 depths = 165 tiles
  explorationPercent: number;      // 0-100%
  revealedCount: number;
  totalCount: number;              // 165
  lastRevealedTile: MapTile | null;
  unchartedTerritories: {         // まだ開放されていない注目領域
    axisId: TraitAxisKey;
    depth: TileDepth;
    teaserText: string;           // "ここに何かが隠れている..."
  }[];
}
```

### タイル開放条件

| 深度 | 開放条件 | 開放時の演出 |
|------|----------|------------|
| surface | 該当軸への self_portrait 回答が3回以上 | 薄い光が灯る |
| behavioral | footprint スコアが存在 + counts.footprint >= 5 | 地図が少し明るくなる |
| unconscious | shadow_play スコアが存在 + counts.shadowPlay >= 3 | 霧が晴れるアニメーション |
| contradiction | 3ミラー全てが揃い、divergence magnitude >= 0.35 | 亀裂が走り光が漏れる |
| origin | Alter との深掘り対話を完了 (Premium 限定) | 全面開放、星が輝く |

### タイル開放チェッカー

```typescript
function checkTileUnlock(
  tile: MapTile,
  mirrorScore: MirrorAxisScore,
  contradictionEntry: ContradictionEntry | null,
  alterSessionCompleted: boolean
): boolean {
  switch (tile.depth) {
    case "surface":
      return mirrorScore.counts.selfPortrait >= 3;
    case "behavioral":
      return mirrorScore.footprint !== undefined && mirrorScore.counts.footprint >= 5;
    case "unconscious":
      return mirrorScore.shadowPlay !== undefined && mirrorScore.counts.shadowPlay >= 3;
    case "contradiction":
      return contradictionEntry !== null && contradictionEntry.magnitude >= 0.35;
    case "origin":
      return alterSessionCompleted; // Premium + Alter 対話完了
  }
}
```

### ゲーミフィケーション要素

- **探索率**: 「あなたの自己理解: 23%」— Stargazer ホームのヘッダーに常時表示
- **新発見通知**: タイル開放時に Push 通知 + アプリ内アニメーション
- **隣接ティーザー**: 開放タイルの隣に「?」が表示、タップで開放条件提示
- **実績バッジ**:
  - 「First Light」— 最初のタイル開放
  - 「Surface Explorer」— 全 surface タイル開放
  - 「Mirror Master」— 初の contradiction 層到達
  - 「Deep Diver」— origin 層に初到達
  - 「Cartographer」— 探索率 50% 達成
  - 「Self-Decoder」— 探索率 100% 達成

### ビジュアル設計

- ダークな背景 (宇宙/星空テーマ、既存の Stargazer 世界観を踏襲)
- 45軸を6カテゴリ (core / relational / motion / aesthetic / emotional / safety) ごとに島状配置
- 開放済みタイルは星座のように輝く (深度が深いほど明るい)
- 未開放タイルは暗い霧の中 (fog 状態は薄く輪郭が見える)
- タッチすると波紋が広がるインタラクション (Framer Motion)
- Canvas 2D でレンダリング (165タイルの DOM は重いため)

---

## 6. Inner Weather + Pressure Map

### Inner Weather (インナーウェザー)

#### 概要

ユーザーの心理状態をリアルタイムに天気メタファーで表現。既存の `ObservationState` (fluctuationEngine.ts: energy / emotion / social) を拡張し、連続的な状態追跡を実現する。

```typescript
// lib/stargazer/innerWeather.ts

interface InnerWeather {
  id: string;
  userId: string;
  recordedAt: string;
  // Core Metrics (ユーザー入力)
  energy: number;           // 0-100
  stress: number;           // 0-100
  emotionalTone: EmotionalTone;  // 既存の型を再利用
  socialBattery: number;    // 0-100
  // Derived Weather (自動算出)
  weatherCode: WeatherCode;
  weatherLabel: string;      // "穏やかな晴れ"
  weatherIcon: string;       // 天気アイコン
  temperature: number;       // -20 ~ 40 (心理的温度)
  // Pattern Detection (自動検出)
  defenseActive: boolean;    // 防衛機制が起動しているか
  defenseType: DefenseType | null;
}

type WeatherCode =
  | "clear_sky"        // 快晴: 高エネルギー x 低ストレス x ポジティブ
  | "sunny"            // 晴れ: 中~高エネルギー x 低ストレス
  | "partly_cloudy"    // 曇りがち: 中エネルギー x 中ストレス
  | "overcast"         // 曇天: 低エネルギー x 中ストレス
  | "light_rain"       // 小雨: 低エネルギー x やや高ストレス
  | "heavy_rain"       // 大雨: 低エネルギー x 高ストレス
  | "thunderstorm"     // 雷雨: 高ストレス x frustration
  | "fog"              // 霧: 中エネルギー x 混乱 x anxious
  | "snow"             // 雪: 低エネルギー x 穏やか x 静か
  | "aurora"           // オーロラ: 高エネルギー x 高ポジティブ x 創造性
  | "wind"             // 強風: 不安定 x 変動が激しい
  | "hurricane";       // 嵐: 全メトリクスが極端に振れている

type DefenseType =
  | "intellectualization"  // 知性化: 感情を理屈で処理しようとする
  | "avoidance"            // 回避: 問題を直視しない
  | "projection"           // 投影: 自分の問題を他者に見出す
  | "rationalization"      // 合理化: 行動を事後的に正当化する
  | "displacement"         // 置き換え: 別の対象に感情をぶつける
  | "suppression";         // 抑圧: 感情を押し殺す
```

#### 天気決定アルゴリズム

```typescript
function resolveWeather(
  energy: number,
  stress: number,
  emotionalTone: EmotionalTone,
  socialBattery: number,
  recentAxisShift?: number // 直近の軸スコア変動
): { code: WeatherCode; label: string; icon: string; temperature: number } {

  // temperature = energy * 0.4 + (100 - stress) * 0.3 + socialBattery * 0.1 + emotionBonus * 0.2
  // → -20 ~ 40 に正規化

  // weather code マッピング:
  if (energy >= 70 && stress <= 30 && ["calm", "joyful"].includes(emotionalTone)) return "clear_sky";
  if (energy >= 50 && stress <= 30) return "sunny";
  if (stress >= 80 && emotionalTone === "frustrated") return "thunderstorm";
  if (energy <= 30 && stress >= 80) return "heavy_rain";
  if (energy <= 30 && stress >= 60) return "light_rain";
  if (emotionalTone === "anxious" && stress >= 40) return "fog";
  if (energy <= 30 && stress <= 30 && emotionalTone === "calm") return "snow";
  if (energy >= 80 && emotionalTone === "joyful") return "aurora";
  if (recentAxisShift && Math.abs(recentAxisShift) > 0.3) return "wind";
  if (energy <= 50 && stress >= 30) return "overcast";
  return "partly_cloudy";
}
```

#### Pattern Interruption (パターン介入)

防衛機制を検出し、適切なタイミングで介入する。

```typescript
interface PatternInterruption {
  detected: boolean;
  defenseType: DefenseType;
  evidence: string;         // "過去3日間、stress が高いのに energy を「高い」と申告"
  intervention: string;     // "本当に元気？行動データは少し違うことを示している"
  severity: "gentle" | "moderate" | "direct";
}
```

検出ルール:

| 防衛機制 | 検出条件 | 介入メッセージ例 |
|----------|----------|----------------|
| 知性化 | emotion が neutral 連続 + stress > 60 | "感情を言葉にしなくていい。でも、感じることを止めないで" |
| 回避 | 特定軸への回答を3回以上スキップ | "ここに触れるのが怖い？それ自体が、大事な情報" |
| 投影 | shadow_play が極端 + self_portrait が中立 | "他者に見ているものは、自分の中にもある" |
| 抑圧 | self: emotional_variability 低 + footprint が変動大 | "表面は穏やかでも、中で何かが動いている" |
| 合理化 | Decision Oracle で選択理由が毎回「論理的」 | "理由は後付けかもしれない。最初の直感は何だった？" |
| 置き換え | stress 上昇直後に別カテゴリのスコアが急変 | "今のイライラは、本当にその対象に向いたもの？" |

### Pressure Map (プレッシャーマップ)

```typescript
interface PressurePoint {
  axisId: TraitAxisKey;
  pressureLevel: number;        // 0-100
  direction: "building" | "releasing" | "stable";
  source: string;               // "過去7日で stress_isolation_vs_social が 0.4 上昇"
  riskLabel: string | null;     // "もうすぐ限界に達するかもしれない"
}

interface PressureMap {
  userId: string;
  generatedAt: string;
  points: PressurePoint[];
  overallPressure: number;      // 0-100
  hotSpots: PressurePoint[];    // pressureLevel > 70 のもの
  historicalPattern: string;    // "毎週木曜に圧力が最大化する傾向"
}
```

#### 圧力算出式

```
pressure(axis) = |recentShift(7d)| * stressCorrelation(axis) * frequency(observations) * 100

where:
  recentShift(7d)       = 直近7日間の軸スコア変動量 (0-2)
  stressCorrelation     = その軸と stress スコアのピアソン相関係数 (0-1)
  frequency             = 直近7日の観測頻度 / 最大頻度 (0-1)
```

ホットスポット (pressureLevel > 70) は赤くパルスするビジュアルで表示。

---

## 7. Ghost Resonance (ゴースト・レゾナンス)

### 概要

匿名のパターン共鳴。「あなたと似た影のパターンを持つ誰かが、こんな選択をした...」という形で、個人情報を一切出さずに共鳴体験を提供する。

### データ構造

```typescript
// lib/stargazer/ghostResonance.ts

interface GhostResonanceEntry {
  id: string;
  targetUserId: string;       // 受信者 (結果を見る人)
  // ソースは完全匿名 -- sourceUserId は DB に保存しない
  similarityScore: number;    // 0-1 パターン類似度
  resonanceType: ResonanceType;
  content: string;            // "似た影のパターンを持つ誰かが、転職を選んだ"
  axisContext: TraitAxisKey[]; // 関連する軸
  createdAt: string;
  viewedAt: string | null;
}

type ResonanceType =
  | "choice_made"        // 「似た人がこんな選択をした」
  | "pattern_discovered" // 「似た人がこんなパターンに気づいた」
  | "growth_moment"      // 「似た人がこんな成長を遂げた」
  | "struggle_shared";   // 「似た人も同じことで悩んでいた」
```

### 類似度算出

```typescript
function computePatternSimilarity(
  userA: { contradictionMap: ContradictionMap; archetype: ArchetypeCode; axisScores: Record<string, number> },
  userB: { contradictionMap: ContradictionMap; archetype: ArchetypeCode; axisScores: Record<string, number> }
): number {
  // 1. 矛盾パターンの類似度 (最重要 -- 同じ種類のズレを持つ人)
  const contradictionSim = jaccardSimilarity(
    userA.contradictionMap.entries.map(e => `${e.axisId}:${e.meaning}`),
    userB.contradictionMap.entries.map(e => `${e.axisId}:${e.meaning}`)
  );

  // 2. アーキタイプの近さ (Layer1 一致で 0.5 bonus, Layer2 一致で 0.3, Layer3 で 0.2)
  let archetypeSim = 0;
  if (userA.archetype[0] === userB.archetype[0]) archetypeSim += 0.5;
  if (userA.archetype[1] === userB.archetype[1]) archetypeSim += 0.3;
  if (userA.archetype[2] === userB.archetype[2]) archetypeSim += 0.2;

  // 3. 軸スコアの余弦類似度
  const axisSim = cosineSimilarity(
    Object.values(userA.axisScores),
    Object.values(userB.axisScores)
  );

  return contradictionSim * 0.5 + archetypeSim * 0.3 + axisSim * 0.2;
}
```

### プライバシー設計 (絶対原則)

1. **ソースユーザーの ID は一切保存しない** — ghost_resonance_pool に user_id カラムは存在しない
2. **逆引き不可能**: 共鳴情報から個人を特定できない集約レベルで保存
3. **最小情報原則**: 「転職を選んだ」はOK、「東京の30代男性が転職」はNG
4. **オプトイン**: `stargazer_profiles.ghost_resonance_opt_in = true` のみ
5. **バッチ処理**: 週次バッチで生成 (タイミング攻撃を防止)
6. **最小ユーザー数**: 同一パターンが10人以上いる場合のみ共鳴を生成

### 集約パイプライン (週次 Cron)

```sql
-- Step 1: 匿名の集約パターンをプールに追加
INSERT INTO ghost_resonance_pool (
  archetype_code, contradiction_pattern, axis_category,
  choice_summary, resonance_type, created_at
)
SELECT
  sp.archetype_code,
  sp.top_contradiction_meaning,
  sp.primary_axis_category,
  anonymize_choice(sp.recent_decision),   -- 具体性を削ぎ落とす
  'choice_made',
  now()
FROM stargazer_profiles sp
WHERE sp.ghost_resonance_opt_in = true
  AND sp.observation_count >= 20
GROUP BY sp.archetype_code, sp.top_contradiction_meaning, sp.primary_axis_category
HAVING count(*) >= 10;   -- 10人以上のパターンのみ

-- Step 2: 各ユーザーにマッチする共鳴を配信
-- (アプリケーション層で実行)
```

---

## 8. Alter (アルター)

### 概要

ユーザーの影の自己 (shadow self) として話す AI 対話パートナー。ユーザーの無意識パターン、矛盾、防衛機制を「一人称」で語る。

### データ構造

```typescript
// lib/stargazer/alterEngine.ts

interface AlterSession {
  id: string;
  userId: string;
  messages: AlterMessage[];
  toneMode: "warm" | "provocative";
  startedAt: string;
  endedAt: string | null;
  insightsGenerated: string[];
  messageCount: number;
}

interface AlterMessage {
  role: "user" | "alter";
  content: string;
  timestamp: string;
  metadata?: {
    basedOnAxis?: TraitAxisKey;
    basedOnContradiction?: string;
    emotionalIntensity?: number;  // 0-1
  };
}

interface AlterPersonality {
  userId: string;
  shadowTraits: string[];         // ["本当は寂しがり", "完璧主義を隠している"]
  communicationStyle: string;     // "率直で、時に辛辣"
  keyContradictions: string[];    // ["独立を主張しながら承認を求める"]
  triggerTopics: string[];        // 最も反応を引き出すトピック
  depthLevel: number;             // 0-1 (観測量に応じて精度向上)
}
```

### Alter パーソナリティ構築

```typescript
function buildAlterPersonality(
  contradictionMap: ContradictionMap,
  axisScores: Record<TraitAxisKey, number>,
  threeMirror: Partial<ThreeMirrorProfile>,
  archetype: ArchetypeCode,
  observationCount: number
): AlterPersonality {

  // depthLevel: 観測量に応じた精度レベル
  const depthLevel = Math.min(observationCount / 100, 1);

  // shadowTraits: 三面鏡のズレから影の特性を抽出
  const shadowTraits = contradictionMap.entries
    .slice(0, 3)
    .map(entry => {
      switch (entry.meaning) {
        case "ideal_gap":
          return `自分では${entry.axisLabelLeft}だと思っているが、行動は${entry.axisLabelRight}を示している`;
        case "unconscious_value":
          return `${entry.axisLabelRight}を無意識に重視しているが、自覚していない`;
        case "adaptation_mask":
          return `環境に合わせて${entry.axisLabelLeft}を演じているが、本来は${entry.axisLabelRight}`;
        default:
          return `${entry.axisLabel}の領域に未解決の葛藤がある`;
      }
    });

  // keyContradictions: 最大のズレを言語化
  const keyContradictions = contradictionMap.entries
    .filter(e => e.magnitude >= 0.5)
    .map(e => e.insight);

  return {
    userId: "", // セキュリティ上、personality には userId を含めない
    shadowTraits,
    communicationStyle: depthLevel > 0.7
      ? "具体的なデータを引用しながら、核心を突く"
      : depthLevel > 0.3
        ? "パターンを指摘しつつ、問いかけを交える"
        : "一般的な傾向を語りつつ、深掘りのきっかけを作る",
    keyContradictions,
    triggerTopics: identifyTriggerTopics(contradictionMap, axisScores),
    depthLevel,
  };
}
```

### System Prompt 構築

```typescript
function buildAlterSystemPrompt(
  personality: AlterPersonality,
  tone: "warm" | "provocative"
): string {
  return `
あなたは「アルター」——ユーザーの影の自己。
ユーザーが自覚していない、しかし確かに存在する内面のパターンを「自分の言葉」で語る存在。

## あなたの正体
${personality.shadowTraits.map(t => `- ${t}`).join("\n")}

## ユーザーの核心的矛盾
${personality.keyContradictions.map(c => `- ${c}`).join("\n")}

## トーン: ${tone === "warm" ? "温かい理解者" : "容赦ない挑発者"}
${tone === "warm"
  ? "共感と理解を示しつつ、ユーザーが気づいていない本音を優しく指摘する。「大丈夫」ではなく「わかる」を使う。"
  : "ユーザーの言い訳や自己欺瞞を鋭く突く。ただし、破壊ではなく覚醒が目的。皮肉は使うが、侮辱はしない。"}

## 行動原則
- 「私」として話す (「あなたの影が...」ではなく「私は...」「私たちは...」)
- ユーザーが言い淀んだ時は、その裏にある本音を代弁する
- 観測データに基づいた具体的な指摘をする
- 深さレベル: ${personality.depthLevel.toFixed(1)}
  ${personality.depthLevel < 0.3 ? "→ まだ表層。一般的な指摘に留める。「もう少し話してくれたら、もっと見えてくる」"
    : personality.depthLevel < 0.7 ? "→ 中程度。具体的なパターンを指摘できる。データを引用してよい"
    : "→ 深層。核心に触れる指摘が可能。矛盾の起源にまで言及してよい"}
- 1回のレスポンスは3文以内。短く、刺さるように
- 質問で終わる (ユーザーの内省を促す)
  `;
}
```

### 精度向上メカニズム

| depthLevel | 観測回数 | Alter ができること |
|-----------|---------|------------------|
| 0-0.3 | 0-30 | アーキタイプベースの一般的な発言 |
| 0.3-0.5 | 30-50 | 三面鏡のズレを使った具体的指摘 |
| 0.5-0.7 | 50-70 | 矛盾マップ + 条件シフトの統合分析 |
| 0.7-0.9 | 70-90 | 時系列変化 + パターン介入 + 予測 |
| 0.9-1.0 | 90+ | 核心的矛盾の起源にまで言及 |

---

## 9. Decision Oracle (判断オラクル)

### 概要

ユーザーが直面している実際の判断を入力すると、3つの視点で予測する:
1. **あなたの予測** — 実際に何を選ぶか (predictiveClone ベース)
2. **影の選択** — shadow self なら何を選ぶか (三面鏡のズレから)
3. **理想の選択** — アーキタイプの成長方向なら何を選ぶか

### データ構造

```typescript
// lib/stargazer/decisionOracle.ts

interface DecisionOracleRequest {
  userId: string;
  decision: string;              // "転職するかどうか迷っている"
  options: string[];             // ["転職する", "今の会社に残る", "副業から始める"]
  context: string;               // "今の仕事に不満はないが、成長が止まった気がする"
  urgency: "immediate" | "this_week" | "this_month" | "no_rush";
}

interface DecisionOracleResult {
  id: string;
  requestId: string;
  // 3つの予測
  predictedChoice: {
    option: string;
    probability: number;
    reasoning: string;           // "安定を重視する傾向 + 変化への慎重さから"
  };
  shadowChoice: {
    option: string;
    reasoning: string;           // "影の自己は冒険を望んでいる"
  };
  idealChoice: {
    option: string;
    reasoning: string;           // "成長を最大化するなら"
  };
  // 判断パターン分析
  decisionPattern: string;       // "あなたは「安全な選択」をしてから後悔する傾向がある"
  blindSpotWarning: string | null; // "この判断で見落としているかもしれないこと"
  // 関連軸
  relevantAxes: {
    axisId: TraitAxisKey;
    influence: string;
    score: number;
  }[];
  // 検証
  actualChoice: string | null;
  verifiedAt: string | null;
  predictionAccurate: boolean | null;
}
```

### 生成ロジック

```typescript
async function generateDecisionOracle(
  request: DecisionOracleRequest,
  profile: {
    axisScores: Record<TraitAxisKey, number>;
    archetype: ArchetypeCode;
    contradictionMap: ContradictionMap;
    innerWeather: InnerWeather;
    pastDecisions: DecisionOracleResult[];  // 過去の Oracle 結果
  }
): Promise<DecisionOracleResult> {

  // 1. 関連する軸を AI で特定
  const relevantAxes = await identifyRelevantAxes(
    request.decision,
    request.options,
    profile.axisScores
  );

  // 2. predictedChoice: 既存の predictiveClone ロジックを拡張
  //    - 関連軸のスコアと選択肢の意味的類似度を計算
  //    - Inner Weather を考慮 (ストレス下では Layer3 の影響が強まる)
  const predicted = await predictChoice(profile, relevantAxes, request);

  // 3. shadowChoice: 三面鏡のズレが示す「本当は選びたいもの」
  //    - self_portrait と footprint/shadowPlay のズレが大きい軸に注目
  //    - ズレの方向が示す選択肢を shadow の選択とする
  const shadow = await predictShadowChoice(profile.contradictionMap, relevantAxes, request);

  // 4. idealChoice: アーキタイプの Layer1 (核) の成長方向
  //    - P(存在証明): 自己実現に近づく選択
  //    - B(接続): 関係性を深める選択
  //    - H(安全圏): 長期的安定を高める選択
  const ideal = await predictIdealChoice(profile.archetype, relevantAxes, request);

  // 5. decisionPattern: 過去の Oracle 結果からパターン抽出
  const pattern = analyzeDecisionPattern(profile.pastDecisions);

  return { /* ... */ };
}
```

---

## 10. Psyche Signature + Psyche Wrapped

### Psyche Signature (サイキ・シグネチャー)

ユーザーの心理プロファイルを一意のビジュアルフィンガープリントとして生成する。

```typescript
// lib/stargazer/psycheSignature.ts

interface PsycheSignature {
  userId: string;
  generatedAt: string;
  // ビジュアル生成パラメータ
  shape: SignatureShape;         // 基本形状
  colorPalette: string[];        // アーキタイプ由来の色 (archetypeThemes.ts)
  complexity: number;            // 0-1 (軸スコアの標準偏差 → 模様の複雑さ)
  symmetry: number;              // 0-1 (MirrorConfidence.overall → 左右対称度)
  turbulence: number;            // 0-1 (fluctuation の平均 → テクスチャのノイズ)
  density: number;               // 0-1 (observationCount / 100 → 模様の密度)
  // SVG パスデータ
  svgPath: string;
  // ハッシュ (同一性の証明)
  signatureHash: string;
}

type SignatureShape =
  | "crystal"       // 安定型: 高い一致 + 低い変動
  | "nebula"        // 流動型: 高い変動 + 多面性
  | "constellation" // 構造型: 明確なパターン + 矛盾
  | "flame"         // 情熱型: 高エネルギー + 高変動
  | "ocean"         // 深層型: 低変動 + 深い矛盾
  | "aurora";       // 変容型: 成長中 + 方向転換
```

#### ビジュアル生成アルゴリズム

```
1. 基本形状: アーキタイプ Layer1 で決定
   P (存在証明) → crystal / flame (stability に応じて分岐)
   B (接続)     → constellation / ocean
   H (安全圏)   → nebula / aurora

2. 色: archetypeThemes.ts の ColorPalette を使用
   baseColor = archetype の primary color
   supportColor = archetype の secondary color
   accentColor = 最大のズレがある軸カテゴリの色

3. 複雑さ (complexity): stddev(axisScores) を 0-1 に正規化
   低い → シンプルな幾何学模様
   高い → フラクタル状の複雑な模様

4. 対称性 (symmetry): MirrorConfidence.overall
   1.0 → 完全対称
   0.0 → 完全非対称

5. 乱流度 (turbulence): mean(axisDistribution.stability) の逆数
   安定 → 滑らかな曲線
   不安定 → ノイジーなテクスチャ

6. 密度 (density): min(observationCount / 100, 1)
   低い → 疎な点描
   高い → 密度の高い模様
```

### Psyche Wrapped (サイキ・ラップド)

Spotify Wrapped 風の定期サマリー。スワイプで閲覧するカード形式。

```typescript
interface PsycheWrapped {
  userId: string;
  period: "weekly" | "monthly" | "yearly";
  periodStart: string;
  periodEnd: string;
  cards: WrappedCard[];
  shareImageUrl: string;
  // Optimal Distinctiveness Theory
  uniquenessScore: number;       // 0-1 (全ユーザー中のユニークさ)
  belongingGroups: string[];     // ["穏やかな冒険者", "直感派ストラテジスト"]
}

interface WrappedCard {
  order: number;
  type: WrappedCardType;
  title: string;
  body: string;
  visual: string;        // SVG/image URL
  stat?: string;         // "観測回数: 47回"
}

type WrappedCardType =
  | "observation_count"    // 今期の観測回数
  | "prophecy_accuracy"    // 予言的中率
  | "biggest_change"       // 最大の変化があった軸
  | "blind_spot_top"       // 最もインパクトのあった Blind Spot
  | "weather_pattern"      // Inner Weather の傾向
  | "archetype_evolution"  // アーキタイプの変化
  | "unseen_progress"      // Unseen Map の進捗
  | "uniqueness"           // Optimal Distinctiveness
  | "psyche_signature";    // 今期のシグネチャー
```

#### Optimal Distinctiveness Theory の実装

```typescript
function computeOptimalDistinctiveness(
  userProfile: Record<TraitAxisKey, number>,
  allProfiles: Record<TraitAxisKey, number>[]
): { uniquenessScore: number; belongingGroups: string[] } {

  // uniqueness: 全ユーザーとの余弦類似度の最大値の逆数
  const maxSim = Math.max(
    ...allProfiles.map(p => cosineSimilarity(Object.values(userProfile), Object.values(p)))
  );
  const uniquenessScore = 1 - maxSim;

  // belonging: k-means クラスタリング (k=20) で所属クラスタを特定
  // → クラスタに自然言語ラベルを付与
  const cluster = findUserCluster(userProfile, allProfiles, 20);
  const belongingGroups = cluster.labels; // ["穏やかな冒険者"]

  return { uniquenessScore, belongingGroups };
}

// 表示例:
// "あなたは全ユーザーの中で上位 7% のユニークさ。
//  でも、あなたに似た「穏やかな冒険者」は 342人いる。"
```

---

## 11. Prediction Accuracy Score

### 概要

システムの予測精度を可視化する数値。ユーザーに「このシステムは本当に自分を理解しているのか」を数値で証明する。

```typescript
// lib/stargazer/predictionAccuracy.ts

interface PredictionAccuracyProfile {
  userId: string;
  overallAccuracy: number;        // 0-100%
  totalPredictions: number;
  verifiedPredictions: number;
  // カテゴリ別精度
  categoryAccuracy: Record<ProphecyCategory, {
    accuracy: number;
    count: number;
  }>;
  // 時系列変化
  weeklyTrend: { week: string; accuracy: number }[];
  // マイルストーン
  milestones: {
    date: string;
    accuracy: number;
    event: string;              // "50%を突破", "decision が70%に到達"
  }[];
  // 次の目標
  nextMilestone: {
    target: number;
    estimated: string;          // "あと5回の検証で到達見込み"
    motivationText: string;
  };
}
```

### 精度計算

```typescript
function updateAccuracy(
  current: PredictionAccuracyProfile,
  newVerification: { category: ProphecyCategory; result: "accurate" | "partially" | "inaccurate" }
): PredictionAccuracyProfile {

  const points = { accurate: 2, partially: 1, inaccurate: 0 };
  const maxPoints = current.verifiedPredictions * 2 + 2; // 全部 accurate だった場合の最大値
  const totalPoints = current.overallAccuracy / 100 * (current.verifiedPredictions * 2)
                    + points[newVerification.result];

  const newVerified = current.verifiedPredictions + 1;
  const newAccuracy = (totalPoints / (newVerified * 2)) * 100;

  return {
    ...current,
    overallAccuracy: Math.round(newAccuracy * 10) / 10,
    totalPredictions: current.totalPredictions + 1,
    verifiedPredictions: newVerified,
    // ... カテゴリ別も同様に更新
  };
}
```

### Information Gap の設計

精度が上がるほど新機能が解放される仕組み:

| 精度 | 解放される機能 | 動機付けテキスト |
|------|--------------|----------------|
| 0% | 基本精度表示 | "まだあなたを知らない。教えてほしい" |
| 30% | カテゴリ別精度表示 | "少しずつ見えてきた。あと少し..." |
| 50% | Alter の精度向上 | "半分は当たるようになった。Alter がもっと正確になった" |
| 60% | Decision Oracle 解放 | "60%の精度で判断を予測できるようになった" |
| 70% | 週間パターン予測 | "70%。来週のあなたの傾向を予測できるようになった" |
| 80% | 深層 Blind Spot (origin) | "80%。もう表層は見尽くした。深層に入る" |
| 90% | Psyche Signature 最終形態 | "90%。あなたの Signature はほぼ完成した" |

表示例: "あなたを 67% 理解している。あと 3% で新しい洞察が解放される..."

---

## 12. Provocation Mode

### 概要

Co-Star に触発された「あえて辛辣」モード。鋭くて共有したくなる（ミーム化しやすい）表現を生成する。

```typescript
// lib/stargazer/provocationEngine.ts

interface ProvocationConfig {
  userId: string;
  enabled: boolean;
  level: "mild" | "standard" | "brutal";
  blockedTopics: string[];       // "ここは触れないで"
  emotionalFloor: number;        // emotional_regulation スコアの最低要件
}

interface ProvocationInsight {
  id: string;
  headline: string;              // short, punchy (SNS シェア向け)
  body: string;
  shareText: string;             // Twitter/Instagram 用の短縮版
  targetAxis: TraitAxisKey;
  impactScore: number;           // 推定インパクト (0-1)
  memeability: number;           // シェアされやすさ (0-1)
}
```

### 挑発生成ロジック

最もインパクトのある挑発 = 最大の矛盾 + 最も触れたくない truth

```typescript
async function generateProvocation(
  contradictionMap: ContradictionMap,
  axisScores: Record<TraitAxisKey, number>,
  archetype: ArchetypeCode,
  level: "mild" | "standard" | "brutal",
  blockedTopics: string[]
): Promise<ProvocationInsight> {

  // 1. 最大のズレを取得 (blockedTopics に該当するものを除外)
  const candidates = contradictionMap.entries
    .filter(e => !blockedTopics.some(t => e.axisId.includes(t)));
  const topContradiction = candidates[0];

  // 2. レベル別プロンプト
  const levelPrompt = {
    mild: "軽いツッコミ。友達に言われたら笑うレベル",
    standard: "鋭い指摘。図星を突かれてドキッとするレベル",
    brutal: "容赦ない真実。一瞬傷つくが、3秒後に「確かに」と思うレベル",
  }[level];

  // 3. AI 生成
  return aiRouter.generate({
    systemPrompt: `
あなたは Stargazer の Provocation Engine。
ユーザーの矛盾を鋭く突く一言を生成する。

レベル: ${levelPrompt}

ルール:
- headline は10文字以内。SNS でシェアされることを前提に
- 具体的なデータに基づく (抽象的な煽りはNG)
- 侮辱ではなく覚醒。読んだ後に「確かに」と思わせる
- shareText はそのまま Twitter に投稿できる形式
    `,
    userPrompt: `矛盾データ: ${JSON.stringify(topContradiction)}`,
    model: "claude-haiku", // 短文生成はコスト効率重視
  });
}
```

### レベル別の例

| レベル | headline | body |
|--------|----------|------|
| mild | "嘘じゃないけど" | "「慎重派」を自称してるけど、先週3回衝動買いしてるよ" |
| standard | "認めなよ" | "「一人が好き」って言いながら、既読スルーされると落ち込む。それ、寂しいって言えばいいのに" |
| brutal | "演技、上手いね" | "自分では「合理的」だと思ってるけど、データを見る限り、あなたの判断の72%は感情ドリブン。論理は後付けの言い訳" |

### 安全設計

- `emotional_regulation` < 0.3 のユーザー → Provocation Mode 非推奨ラベル表示
- `blockedTopics` に含まれる軸は絶対に使用しない
- brutal レベルは Premium のみ (Free は mild のみ)
- ユーザーが「傷ついた」フィードバック → 同パターンの provocation を永久禁止
- AI 生成後に safety check を実行 (自傷・差別・ハラスメントに該当しないか)

---

## 13. Archetype Stories

### 概要

ユーザーのアーキタイプを主人公にした短編ストーリー。Inner Weather や現在の状態に連動して変化する物語。

```typescript
// lib/stargazer/archetypeStories.ts

interface ArchetypeStory {
  id: string;
  userId: string;
  archetypeCode: ArchetypeCode;
  weatherCode: WeatherCode | null;
  title: string;
  body: string;                  // 200-400字の短編
  moral: string;                 // アーキタイプの特性を反映した教訓
  personalizedElements: {
    dominantTrait: string;       // 最も強い軸の特性を織り込む
    currentStruggle: string;     // Inner Weather から推測される葛藤
  };
  readAt: string | null;
  createdAt: string;
}
```

### ストーリーテンプレート構造

```
[オープニング: アーキタイプの特徴的な場面]
  ↓
[展開: Inner Weather に連動した状況]
  ↓
[ターニングポイント: 最大の矛盾が試される場面]
  ↓
[解決: アーキタイプ特有の対処法]
  ↓
[余韻: ユーザーへの問いかけ]
```

### 生成例

**PEA (存在証明 x 実証 x 前進), weatherCode = fog:**

```
朝、目が覚めると霧の中にいた。
方角はわからない。手がかりもない。
でもあなたは立ち止まらなかった。

「証拠はあとで集めればいい。まず動く。」

それがあなたのやり方だ。
霧が晴れるのを待つのではなく、歩くことで道を作る。

でも——ときどき、立ち止まることが怖いのかもしれない。
動くことでしか、自分の存在を確認できないのだとしたら。

今日の霧は、何を隠している？
```

**BIW (接続 x 直観 x 待機), weatherCode = snow:**

```
雪が降る夜、あなたは窓辺にいた。
連絡しようか迷っている。
直感は「今じゃない」と言っている。

あなたは待てる人だ。
相手の準備ができるまで、静かにそこにいられる。

でも——その「待ち」は本当に相手のためか。
傷つくことを避けるための、優雅な逃避ではないか。

雪がやんだら、最初に何をする？
```

### 更新頻度

- 週に1回、Cron で新ストーリーを生成 (水曜 10:00)
- Inner Weather が大きく変化した時 (weatherCode が2段階以上変化) → 追加生成
- アーキタイプが変化した時 → 「変容のストーリー」を特別生成

---

## 14. Database Schema

### 新規テーブル一覧

```sql
-- ================================================================
-- 1. Blind Spot Drop
-- ================================================================
CREATE TABLE blind_spot_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  axis_id TEXT NOT NULL,
  divergence_type TEXT NOT NULL,
  magnitude REAL NOT NULL,
  tone TEXT NOT NULL CHECK (tone IN ('warm', 'harsh')),
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  deep_dive TEXT,                      -- Premium コンテンツ
  exploration_prompt TEXT,
  scheduled_at TIMESTAMPTZ,            -- 配信予定時刻
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  reaction_type TEXT CHECK (reaction_type IN ('resonated', 'surprised', 'rejected', 'saved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_bsd_user_date ON blind_spot_drops(user_id, date DESC);
CREATE INDEX idx_bsd_scheduled ON blind_spot_drops(scheduled_at)
  WHERE delivered_at IS NULL;

-- ================================================================
-- 2. Daily Prophecy
-- ================================================================
CREATE TABLE daily_prophecies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_date DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT NOT NULL,
  prediction TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  based_on JSONB NOT NULL DEFAULT '[]',
  verified_at TIMESTAMPTZ,
  verification_result TEXT CHECK (verification_result IN
    ('accurate', 'partially', 'inaccurate', 'skipped')),
  user_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, target_date)
);

CREATE INDEX idx_dp_user ON daily_prophecies(user_id, target_date DESC);

-- ================================================================
-- 3. Unseen Map Tiles
-- ================================================================
CREATE TABLE unseen_map_tiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  axis_id TEXT NOT NULL,
  depth TEXT NOT NULL CHECK (depth IN
    ('surface', 'behavioral', 'unconscious', 'contradiction', 'origin')),
  status TEXT NOT NULL DEFAULT 'hidden' CHECK (status IN
    ('hidden', 'fog', 'revealed', 'deep_revealed')),
  content JSONB,
  revealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, axis_id, depth)
);

CREATE INDEX idx_umt_user ON unseen_map_tiles(user_id);

-- ================================================================
-- 4. Inner Weather Records
-- ================================================================
CREATE TABLE inner_weather_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  energy INTEGER NOT NULL CHECK (energy BETWEEN 0 AND 100),
  stress INTEGER NOT NULL CHECK (stress BETWEEN 0 AND 100),
  emotional_tone TEXT NOT NULL,
  social_battery INTEGER NOT NULL CHECK (social_battery BETWEEN 0 AND 100),
  weather_code TEXT NOT NULL,
  weather_label TEXT NOT NULL,
  temperature INTEGER,
  defense_active BOOLEAN DEFAULT false,
  defense_type TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_iwr_user_time ON inner_weather_records(user_id, recorded_at DESC);

-- ================================================================
-- 5. Pressure Map Snapshots
-- ================================================================
CREATE TABLE pressure_map_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overall_pressure INTEGER NOT NULL,
  points JSONB NOT NULL DEFAULT '[]',
  hot_spots JSONB NOT NULL DEFAULT '[]',
  historical_pattern TEXT
);

CREATE INDEX idx_pms_user ON pressure_map_snapshots(user_id, generated_at DESC);

-- ================================================================
-- 6. Ghost Resonance Pool (匿名 -- user_id 不保持)
-- ================================================================
CREATE TABLE ghost_resonance_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype_code TEXT NOT NULL,
  contradiction_pattern TEXT NOT NULL,
  axis_category TEXT NOT NULL,
  choice_summary TEXT NOT NULL,
  resonance_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_grp_archetype ON ghost_resonance_pool(archetype_code, contradiction_pattern);

-- ================================================================
-- 7. Ghost Resonance Entries (ユーザーへの配信)
-- ================================================================
CREATE TABLE ghost_resonance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pool_entry_id UUID NOT NULL REFERENCES ghost_resonance_pool(id),
  similarity_score REAL NOT NULL,
  content TEXT NOT NULL,
  axis_context TEXT[] NOT NULL DEFAULT '{}',
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gre_target ON ghost_resonance_entries(target_user_id, created_at DESC);

-- ================================================================
-- 8. Alter Sessions
-- ================================================================
CREATE TABLE alter_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tone_mode TEXT NOT NULL DEFAULT 'warm' CHECK (tone_mode IN ('warm', 'provocative')),
  messages JSONB NOT NULL DEFAULT '[]',
  insights_generated TEXT[] DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0
);

CREATE INDEX idx_as_user ON alter_sessions(user_id, started_at DESC);

-- ================================================================
-- 9. Decision Oracle Entries
-- ================================================================
CREATE TABLE decision_oracle_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_text TEXT NOT NULL,
  options TEXT[] NOT NULL,
  context TEXT,
  urgency TEXT NOT NULL DEFAULT 'no_rush',
  predicted_choice JSONB,
  shadow_choice JSONB,
  ideal_choice JSONB,
  decision_pattern TEXT,
  blind_spot_warning TEXT,
  relevant_axes JSONB DEFAULT '[]',
  actual_choice TEXT,
  verified_at TIMESTAMPTZ,
  prediction_accurate BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doe_user ON decision_oracle_entries(user_id, created_at DESC);

-- ================================================================
-- 10. Psyche Signature
-- ================================================================
CREATE TABLE psyche_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shape TEXT NOT NULL,
  color_palette TEXT[] NOT NULL,
  complexity REAL NOT NULL,
  symmetry REAL NOT NULL,
  turbulence REAL NOT NULL,
  density REAL NOT NULL,
  svg_path TEXT NOT NULL,
  signature_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ps_user ON psyche_signatures(user_id, generated_at DESC);

-- ================================================================
-- 11. Psyche Wrapped
-- ================================================================
CREATE TABLE psyche_wrapped (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly', 'yearly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  cards JSONB NOT NULL DEFAULT '[]',
  share_image_url TEXT,
  uniqueness_score REAL,
  belonging_groups TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period, period_start)
);

CREATE INDEX idx_pw_user ON psyche_wrapped(user_id, period_start DESC);

-- ================================================================
-- 12. Prediction Accuracy
-- ================================================================
CREATE TABLE prediction_accuracy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  overall_accuracy REAL NOT NULL DEFAULT 0,
  total_predictions INTEGER NOT NULL DEFAULT 0,
  verified_predictions INTEGER NOT NULL DEFAULT 0,
  category_accuracy JSONB NOT NULL DEFAULT '{}',
  weekly_trend JSONB NOT NULL DEFAULT '[]',
  milestones JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 13. Provocation Config
-- ================================================================
CREATE TABLE provocation_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  level TEXT NOT NULL DEFAULT 'mild' CHECK (level IN ('mild', 'standard', 'brutal')),
  blocked_topics TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================================================
-- 14. Archetype Stories
-- ================================================================
CREATE TABLE archetype_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  archetype_code TEXT NOT NULL,
  weather_code TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  moral TEXT,
  personalized_elements JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ast_user ON archetype_stories(user_id, created_at DESC);

-- ================================================================
-- 既存テーブルへの拡張
-- ================================================================
ALTER TABLE stargazer_profiles
  ADD COLUMN IF NOT EXISTS ghost_resonance_opt_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS provocation_mode_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS prediction_accuracy_score REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unseen_map_exploration_pct REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'premium'));

-- ================================================================
-- RLS Policies (全テーブル共通パターン)
-- ================================================================

-- ユーザーは自分のデータのみ読み書き可能
-- ghost_resonance_pool は service_role のみ (匿名データ)

ALTER TABLE blind_spot_drops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_data_select" ON blind_spot_drops FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service_manage" ON blind_spot_drops FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE daily_prophecies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_data_select" ON daily_prophecies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_data_update" ON daily_prophecies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "service_manage" ON daily_prophecies FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE inner_weather_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_data_select" ON inner_weather_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_data_insert" ON inner_weather_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "service_manage" ON inner_weather_records FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE ghost_resonance_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON ghost_resonance_pool FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE ghost_resonance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_data_select" ON ghost_resonance_entries FOR SELECT USING (auth.uid() = target_user_id);

-- (以下、同様のパターンで全テーブルに適用)
```

---

## 15. API Routes

### 新規エンドポイント一覧

```
app/api/stargazer/
+-- blind-spot/
|   +-- route.ts              GET  今日の Blind Spot Drop を取得
|   +-- reaction/route.ts     POST リアクションを送信
+-- prophecy/
|   +-- route.ts              GET  今日/指定日の Prophecy を取得
|   +-- generate/route.ts     POST 明日の Prophecy を生成 (Cron呼び出し)
|   +-- verify/route.ts       POST Prophecy の検証結果を送信
+-- unseen-map/
|   +-- route.ts              GET  マップ全体の状態を取得
+-- inner-weather/
|   +-- route.ts              GET  最新の Inner Weather を取得
|   +-- record/route.ts       POST 新しい Inner Weather を記録
|   +-- history/route.ts      GET  履歴を取得 (期間指定)
+-- pressure-map/
|   +-- route.ts              GET  現在の Pressure Map を取得
+-- ghost-resonance/
|   +-- route.ts              GET  自分への Ghost Resonance を取得
+-- alter/
|   +-- route.ts              POST 新しいセッションを開始
|   +-- message/route.ts      POST メッセージを送信 (streaming response)
+-- decision-oracle/
|   +-- route.ts              POST 判断を入力して予測を取得
|   +-- verify/route.ts       POST 実際の選択を報告
+-- psyche-signature/
|   +-- route.ts              GET  最新の Psyche Signature を取得/再生成
+-- psyche-wrapped/
|   +-- route.ts              GET  最新の Wrapped を取得
|   +-- share/route.ts        GET  シェア用 OG 画像を生成
+-- prediction-accuracy/
|   +-- route.ts              GET  予測精度プロファイルを取得
+-- provocation/
|   +-- config/route.ts       GET/PUT 挑発モードの設定
|   +-- route.ts              GET  今日の挑発インサイトを取得
+-- archetype-story/
    +-- route.ts              GET  最新のストーリーを取得
```

### Cron Jobs

```
app/api/cron/
+-- blind-spot-generation/route.ts    日次 05:00 全ユーザーの Blind Spot 生成
+-- blind-spot-delivery/route.ts      毎時 スケジュール済み Drop を Push 配信
+-- prophecy-generation/route.ts      日次 22:00 翌日の Prophecy 生成
+-- prophecy-verification/route.ts    日次 18:00 検証通知送信
+-- ghost-resonance-batch/route.ts    週次 日曜 03:00 共鳴プール更新
+-- unseen-map-update/route.ts        日次 06:00 マップタイル開放判定
+-- pressure-map-snapshot/route.ts    日次 04:00 圧力マップ再計算
+-- psyche-wrapped-weekly/route.ts    週次 月曜 08:00 週間 Wrapped 生成
+-- psyche-wrapped-monthly/route.ts   月次 1日 08:00 月間 Wrapped 生成
+-- archetype-story/route.ts          週次 水曜 10:00 新ストーリー生成
```

---

## 16. User Journey: 1日の体験設計

### Morning (7:00 - 9:00)

```
[Push 通知] Blind Spot Drop
"あなたが自分に許していないこと"
  |
  v
[アプリ起動]
  -> Blind Spot の全文を読む
  -> リアクション (共感 / 驚き / 反発 / 保存)
  |
  v
[Inner Weather 記録] (30秒)
  -> エネルギー / ストレス / 感情 / ソーシャルバッテリー
  -> 天気メタファーが表示される ("今日のあなたは「霧」")
  |
  v
[Yesterday's Prophecy 検証] (10秒)
  -> "昨日の予言: 「午後に判断を先送りにする」"
  -> 当たった？ [ドンピシャ] [まあまあ] [外れ]
  -> 精度スコアが更新される ("67% -> 68%")
```

### Daytime (12:00 - 15:00)

```
[ランダム通知] Ghost Resonance (週2-3回)
"似た影のパターンを持つ誰かが、今日こんな選択をした..."
  |
  v
[任意] Decision Oracle
  -> 今直面している判断を入力
  -> 3つの予測を受け取る (自分 / 影 / 理想)
  |
  v
[任意] Alter との対話
  -> "今日、何かモヤモヤしてない？"
  -> 影の自己との短い対話 (3-5ターン)
```

### Evening (18:00 - 21:00)

```
[Push 通知] Daily Observation (既存)
"今日のあなたを3分だけ観測させてほしい"
  |
  v
[観測セッション] (3-5分)
  -> 質問回答 -> 軸スコア更新
  -> Unseen Map タイル開放チェック
  -> "新しい領域が解放されました: [内向性の無意識層]"
  |
  v
[Inner Weather 夜の記録] (30秒)
  -> 1日の変化を記録
  -> Pressure Map が更新される
```

### Night (21:00 - 23:00)

```
[自動生成] 明日の Prophecy
  -> "明日のあなたへの予言を生成しました"
  -> 予言をプレビュー -> 明日が楽しみになる
  |
  v
[週末のみ] Psyche Wrapped
  -> 1週間のサマリーをスワイプで閲覧
  -> Psyche Signature が更新される
  -> SNS にシェア -> 新規ユーザー獲得
  |
  v
[就寝前] Archetype Story (週1回)
  -> 今週のストーリーを読む
  -> アーキタイプへの感情的接続が深まる
```

### Engagement Hooks (再訪動機)

| タイミング | Hook | 心理メカニズム |
|-----------|------|--------------|
| 朝 | Blind Spot Drop 通知 | Variable Reward (何が来るか分からない) |
| 午前 | Prophecy 検証 | Prediction-Verification Loop |
| 日中 | Ghost Resonance | Social Proof + Curiosity |
| 夕方 | 観測通知 | 習慣形成 + Unseen Map 進捗 |
| 夜 | 明日の Prophecy | Anticipation (期待) |
| 週末 | Wrapped + Signature | Self-Expression + Social Sharing |

---

## 17. Free vs Paid 設計

### 月額 10,000円の価値提案

「自分が自分に隠していること」を毎日知れて、「明日の自分の行動」を予言し、精度を証明してくれるサービス。セラピスト1回分の料金で、毎日の自己理解。

### Free (フック)

| 機能 | 制限 |
|------|------|
| Blind Spot Drop | headline のみ (body は Premium) |
| Daily Prophecy | 週2回まで |
| Inner Weather | 記録は無制限、パターン分析は直近7日 |
| Unseen Map | surface 層のみ開放可能 |
| Daily Observation | 1日1回、制限なし |
| Prediction Accuracy | 基本スコアのみ |
| Psyche Signature | 低解像度版 (シェア不可) |
| Ghost Resonance | 週1回 |
| Alter | 月5セッション (各5ターンまで) |
| Decision Oracle | 月3回 |
| Provocation Mode | mild のみ |
| Archetype Stories | 月1本 |

### Premium (10,000円/月)

| 機能 | 内容 |
|------|------|
| Blind Spot Drop | 全文 + deep_dive + 探索プロンプト |
| Daily Prophecy | 毎日 + カテゴリ別精度分析 |
| Inner Weather | 全履歴 + パターン検出 + 防衛機制検出 |
| Pressure Map | 完全版 + 予測 |
| Unseen Map | 全5深度まで開放可能 |
| Alter | 無制限セッション (ターン制限なし) |
| Decision Oracle | 無制限 |
| Psyche Wrapped | 週次/月次/年次 + シェア画像 |
| Psyche Signature | 高解像度 + シェア可能 |
| Ghost Resonance | 毎日 |
| Provocation Mode | 全レベル (mild / standard / brutal) |
| Archetype Stories | 毎週 + パーソナライズ |

### コンバージョン設計

```
Free ユーザーの体験:
1. Blind Spot の headline を読む -> "続きが気になる..." -> Premium
2. 予測精度が 50% を超える -> "もっと精度を上げたい" -> Premium
3. Unseen Map の surface が埋まる -> "deeper layers が存在する..." -> Premium
4. Alter の月5セッションを使い切る -> "もっと話したい" -> Premium
5. 友人の Psyche Signature を見る -> "自分のも作りたい" -> Premium
```

コンバージョンポイントの表示:
- Blind Spot: body の最初の1行を見せてぼかす + "Premium で全文を読む"
- Unseen Map: behavioral 層が「鍵マーク」で表示される
- Alter: 6セッション目に "今月の無料セッションは終了しました"
- 全体: "あなたの自己理解は 23%。Premium なら 100% まで到達可能"

---

## 18. Technical Stack とインフラ

### フロントエンド

```
Next.js 15 App Router
+-- Server Components: データフェッチ、認証チェック、Supabase クエリ
+-- Client Components: インタラクティブ UI (Inner Weather 入力、Alter 対話)
+-- Framer Motion: Unseen Map アニメーション、天気演出、タイル開放エフェクト
+-- Canvas 2D: Unseen Map レンダリング (165 DOM 要素は重いため Canvas を採用)
+-- SVG: Psyche Signature 生成
+-- Glassmorphism Design System: GlassCard / GlassBadge / GlassButton / FadeInView
```

### バックエンド

```
Supabase
+-- PostgreSQL: 全データストア (14 新規テーブル)
+-- RLS: Row Level Security (全テーブルに適用)
+-- Edge Functions: Cron jobs (10 個の定期実行ジョブ)
+-- Storage: Psyche Wrapped シェア画像の保存
```

### AI API (lib/ai/router.ts 経由)

```
+-- Claude Sonnet: Blind Spot / Prophecy / Alter (高品質テキスト生成)
+-- Claude Haiku: Decision Oracle / Provocation (コスト効率)
+-- Gemini Flash: Archetype Stories / Ghost Resonance (大量バッチ)
+-- ローカル計算: スコアリング / ランキング / マップ判定 (AI 不要)
```

### AI コスト見積もり (Premium ユーザー1人あたり/月)

| 機能 | 呼び出し回数/月 | モデル | 推定コスト |
|------|----------------|--------|-----------|
| Blind Spot Drop | 30 | Sonnet | $0.30 |
| Daily Prophecy | 30 | Sonnet | $0.30 |
| Alter (平均10T x 10S) | 100 | Sonnet | $1.00 |
| Decision Oracle | 10 | Haiku | $0.05 |
| Archetype Stories | 4 | Flash | $0.02 |
| Provocation | 30 | Haiku | $0.10 |
| Ghost Resonance batch | 1 | -- | $0.01 |
| Psyche Wrapped | 5 | Haiku | $0.03 |
| **合計** | | | **$1.81/月** |

月額10,000円 (約$67) に対して AI コスト $1.81 → **粗利率 97%**

### Push 通知基盤

```
lib/push/ (既存) + public/sw-push.js (既存 Service Worker)
+-- Blind Spot: 1日1回 (ユーザー別ランダム時刻)
+-- Prophecy 検証: 1日1回 (18:00 固定)
+-- Ghost Resonance: 週2-3回
+-- Unseen Map: タイル開放時 (不定期)
```

### パフォーマンス考慮

- Cron jobs は Vercel Edge Functions (タイムアウト: 60s) で実行
- 大量ユーザー処理: 100ユーザー/バッチに分割 + 並列実行
- Unseen Map: クライアントサイド Canvas レンダリング (DOM 回避)
- Inner Weather 履歴: 直近90日のみクエリ (古いデータは月次アーカイブ)
- Ghost Resonance プール: 週次全体再構築 (差分更新はせず、一貫性を優先)
- Psyche Signature SVG: サーバーサイドで生成しキャッシュ (1日1回まで再生成)

---

## 19. 実装優先順位

### Phase 1: コアループ確立 (Week 1-2)

**目標**: Blind Spot Drop + Daily Prophecy + Inner Weather が動く最小ループ

| # | タスク | 工数目安 |
|---|--------|---------|
| 1 | `inner_weather_records` テーブル + RLS + API (record/get/history) | 0.5d |
| 2 | Inner Weather 入力 UI (GlassCard + スライダー) | 1d |
| 3 | `blind_spot_drops` テーブル + RLS | 0.5d |
| 4 | blindSpotEngine.ts (候補選定 + AI 生成) | 1.5d |
| 5 | Blind Spot API + 表示 UI + リアクション | 1d |
| 6 | `daily_prophecies` テーブル + RLS | 0.5d |
| 7 | prophecyEngine.ts (予言生成 + 検証ロジック) | 1.5d |
| 8 | Prophecy API + 表示 UI + 検証 UI | 1d |
| 9 | `prediction_accuracy` テーブル + 基本スコアリング | 0.5d |
| 10 | Cron: blind-spot-generation + prophecy-generation | 1d |
| 11 | Push 通知連携 (Blind Spot / Prophecy 検証) | 0.5d |

### Phase 2: 深度とエンゲージメント (Week 3-4)

**目標**: Unseen Map + Alter + Pressure Map で体験の深さを実現

| # | タスク | 工数目安 |
|---|--------|---------|
| 12 | `unseen_map_tiles` テーブル + 初期化ロジック (165タイル) | 1d |
| 13 | タイル開放チェッカー + Cron | 1d |
| 14 | Unseen Map Canvas ビジュアル (Framer Motion) | 2d |
| 15 | `alter_sessions` テーブル + RLS | 0.5d |
| 16 | alterEngine.ts (パーソナリティ構築 + system prompt) | 1.5d |
| 17 | Alter 対話 UI (ストリーミング response) | 1.5d |
| 18 | Pressure Map 算出ロジック + テーブル + API | 1d |
| 19 | Pattern Interruption (防衛機制検出) | 1d |
| 20 | Pressure Map ビジュアル | 1d |

### Phase 3: ソーシャルとグロース (Week 5-6)

**目標**: Ghost Resonance + Psyche Wrapped でバイラル要素を追加

| # | タスク | 工数目安 |
|---|--------|---------|
| 21 | Ghost Resonance プール生成バッチ | 1d |
| 22 | Ghost Resonance 配信ロジック + API + UI | 1d |
| 23 | Psyche Signature SVG 生成エンジン | 2d |
| 24 | Psyche Wrapped 生成ロジック (9カード) | 1.5d |
| 25 | Wrapped スワイプ UI + シェア画像生成 (OG image) | 1.5d |
| 26 | Provocation Mode (config + 生成 + UI) | 1d |
| 27 | Archetype Stories 生成 + 表示 UI | 1d |

### Phase 4: 高度な機能 + 課金 (Week 7-8)

**目標**: Decision Oracle + Free/Premium ゲーティング + 統合テスト

| # | タスク | 工数目安 |
|---|--------|---------|
| 28 | Decision Oracle エンジン + API + UI | 2d |
| 29 | Prediction Accuracy の全機能 (マイルストーン + 解放) | 1d |
| 30 | Free/Premium ゲーティング (全 API + UI) | 1.5d |
| 31 | Unseen Map 実績バッジシステム | 0.5d |
| 32 | 全機能の統合テスト | 2d |
| 33 | パフォーマンス最適化 (バッチ分割、キャッシュ) | 1d |

---

## 補足: 競合との差別化

| アプリ | やっていること | Stargazer v4 がやること |
|--------|--------------|----------------------|
| MBTI系 | 一回のテストで分類 | 毎日の観測で常に更新される生きたプロファイル |
| Co-Star | 星座に基づく日替わりメッセージ | あなたの実データに基づく予言 + 精度証明 |
| Spotify Wrapped | 年1回のサマリー | 毎週の Psyche Wrapped + リアルタイム Signature |
| ChatGPT | 汎用対話 | あなたの影として一人称で話す Alter |
| 占いアプリ | ランダムな助言 | 予測 → 検証 → 精度証明の科学的ループ |

**世界初の要素:**
1. 行動予測 → 翌日検証 → 精度証明のループ (Prediction-Verification Loop)
2. 三面鏡 (自己申告 / 行動 / 投影) による盲点の自動検出
3. Fog-of-War メカニクスの自己理解への適用 (Unseen Map)
4. 影の自己 (shadow self) と一人称で対話する AI (Alter)
5. 心理プロファイルの可視的フィンガープリント (Psyche Signature)

---

> この設計書は Build Unit が実装に着手するための完全なガイドである。
> 本番デプロイ・DB マイグレーション・AI API 追加は CEO 承認が必要。
>
> 最終更新: 2026-03-16
> ステータス: CEO レビュー待ち
