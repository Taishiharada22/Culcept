# CoAlter 映画ドメイン 三段式アーキテクチャ設計

**作成日**: 2026-04-20
**ステータス**: ドラフト（CEO 審議中）
**rev 履歴**:
- rev 1 (2026-04-20 am): 二段式（Title→Theater）
- rev 2 (2026-04-20 pm): CEO 3点補強（1分 budget / Soft availability / Gate 補強）
- rev 3 (2026-04-20): **三段式に昇格**（Understand → Curate → Resolve）。Understand はドメイン非依存の共通基盤として movie / food / travel で共有

**前提文書**:
- `docs/coalter-handoff-2026-04-19-retrieval-investigation.md`（0件問題の全量記録）
- `docs/coalter-master-design.md`（CoAlter 全体の設計原則）
- `memory/project_phase2-direction.md`

**責務**: 映画ドメインで「2人の理解（Understand）→ 作品選定（Curate）→ 劇場確定（Resolve）」の三段分離を定義する。Stage 1 Understand はドメイン非依存であり、本文書で定義する構造は food / travel / gift の全ドメインで共通利用される。1 分以内・1 カード UX・5W1H 遵守・近隣段階拡張・2人リコメンド理由復活の 4 条件を同時達成する。

---

## 0. Executive Summary

現行の 1 クエリ同時解決（作品＋劇場）は構造的に崩壊している。

- **知識の異質性**: 「何を観るか」は嗜好・感情・気分の領域（soft knowledge）。「どこで観るか」は在庫・時刻・地理の領域（hard knowledge）。同じ検索クエリに両方を要求すると、どちらかが必ず欠落する。
- **EXA 300 字制約**: 作品ページのスニペットに劇場名が入る確率は本番データで極めて低い（`titleWithoutTheaterCount===catalogCount` 事象）。
- **LLM 位置の退行**: 「LLM 入口」構造は 2026-03 以前の品質劣化パターン。入口は論理ガード、出口は LLM ナラティブ、というフード実装の勝ちパターンを映画にも継承する。

**解**: 「2人理解（Understand）→ 作品選定（Curate）→ 劇場確定（Resolve）」の **三段分離** に分解する。
- **Stage 1 Understand**: 完全に内部処理。ユーザーには見えない。Alter / Stargazer / CoAlter / 今の会話 / 他観測を統合し `TwoPersonLensToday` を返す。**ドメイン非依存**
- **Stage 2 Curate**: Stage 1 出力を input に、ドメイン固有の候補生成 + Personality-Rooted Narration を生成
- **Stage 3 Resolve**: 物理世界のロジスティクス（劇場・時刻・予約）を確定

UX は 1 カード維持。WHERE 欄を「探索中…」状態 → 確定状態へと in-card で遷移させる。Stage 1 は UI に表出しない（narration に滲ませる）。

---

## 0.5 CoAlter の存在論（設計の前提）

**CoAlter は推薦機能ではない**。

汎用推薦サービス（Netflix, Filmarks, 汎用 LLM）と CoAlter の違いは、アルゴリズムの差ではなく、**持っている情報の性質の差**。

| レイヤ | 汎用サービス | CoAlter |
|---|---|---|
| 嗜好データ | 集計された行動ログ | **2人それぞれの判断原理（Stargazer 観測）** |
| 文脈 | セッション内 | **2人の関係史・譲り合い履歴・今日の気分** |
| 推薦の由来 | 「似た人が高評価」 | **「Aさんの〇〇と Bさんの〇〇が、今日のこの会話でこう接続するから」** |
| 理由の深さ | ジャンル・タグ | **判断原理レベルでの納得** |

映画推薦は CoAlter の最終出力ではなく、**「2人の理解が結晶化した形の一つ」に過ぎない**。劇場を見つけるシステムでも、作品を選ぶシステムでもない。**「2人を誰よりも理解している存在が、その理解を根拠にプランを立ち上げる」システム**。

### 設計上の帰結

1. **Stage 1 の主役は作品ではなく「2人の理解」** — 作品候補は「2人の理解」から演繹される結果であって、検索で当てるものではない
2. **narration は推薦の後付け説明ではなく、推薦そのものの由来** — veto/bridge/today_hook は「2人のパーソナリティから作品が立ち上がる過程の言語化」
3. **汎用 LLM に絶対真似できない核は「永続的な 2人理解」** — プロンプトに毎回入れられる情報量ではない。Stargazer + 関係観測の累積
4. **推薦が外れた時の謝り方も人格的** — 「今日のおふたりだと〇〇の空気が強かったので、この軸では外したかもしれない」と 2人理解を根拠に振り返る

これを外した瞬間、CoAlter は普通の映画検索アプリに劣化する。

---

## 1. 設計原則

### 原則 0: Understand はドメイン非依存の共通基盤（Domain-Agnostic Understanding）

Stage 1 Understand は **ドメイン（movie / food / travel / gift）に依存しない**。

理由:
- 「2人を理解する」という責務はドメインを跨いで不変
- 同じ 2人に対して、映画と食事で Understanding が別々に走るのは無駄
- ドメイン横断で一貫した人格理解を保つ必要がある（映画で A さんを「慎重」と読んだのに、食事で「冒険家」と読むのは矛盾）

結果:
- `lib/coalter/understanding/` はドメイン横断の共通 module
- movie / food / travel の各 Curator は同じ `TwoPersonLensToday` を input にする
- Understanding のバグ修正はドメイン横断で効く

### 原則 1: 知識の型で段を切る（Knowledge Typology Staging）

| 段 | 知識型 | 主ソース | 主エンジン | 失敗モード | ドメイン依存 |
|---|---|---|---|---|---|
| Stage 1 Understand | Relational（2人の理解） | Alter + Stargazer + CoAlter + 今の会話 + 他観測 | LLM reasoning + 永続プロファイル統合 | 2人の読み違い | **非依存** |
| Stage 2 Curate | Soft（嗜好・関係・気分 → 候補結晶化） | 2人理解 + カタログ + 一般評判 | LLM reasoning + ranker + narration | 趣味外し | 依存（movie/food/travel） |
| Stage 3 Resolve | Hard（在庫・時刻・座標） | 劇場公式・予約サイト・地理 | structured retrieval + geo filter | 近隣に無い | 依存 |

段毎に「ベストな検索戦略」「ベストな評価関数」が異なる。合流させると必ずどれかが壊れる。

**学術的根拠**（Covington et al. 2016 "Deep Neural Networks for YouTube Recommendations"）: recommender は Candidate Generation と Ranking の 2 段が業界標準。CoAlter はそれに「Understanding」を前置する 3 段。
**実務的根拠**: Netflix / Pinterest PinSage / Spotify も全て 2 段 or 3 段。1 段でやる企業は 0。CoAlter の Understanding 前置は「2人理解」という独自価値を構造化するための CoAlter 固有の stage。

### 原則 2: UX は 1 カード・内部は 2 段（UX Unity, Engine Duality）

- ユーザーから見える単位: **1 カード**
- カードの状態遷移: `探索中 → 作品確定 (WHERE 空欄) → 劇場確定 (WHERE 充填)`
- ユーザー操作: 作品確定後に「これで探す」を押すと Stage 2 が発火
- 採用されなかった場合: カード全体を破棄して Stage 1 再実行（中途半端な引き継ぎなし）

**根拠**: Stage 2 の検索失敗で作品まで捨てるのは無駄。かつ作品が気に入らない場合は「劇場がどこであれ却下」なので、承認動作は作品レイヤで取るのが認知的に正しい（Norman 2013, System 1/2）。

### 原則 3: 5W1H は最初から骨格を見せる（Skeleton-First Disclosure）

| 枠 | Stage 1 完了時 | Stage 2 完了時 |
|---|---|---|
| Who（2人の理由） | 「AさんとBさんが今日ハマる理由」を LLM narration で埋める | 維持 |
| What（作品） | 作品タイトル + 1文サマリ | 維持 |
| When（上映枠） | 空欄 or 「本日〜明日の上映枠から探します」 | 具体時刻 |
| Where（劇場） | **空欄（スケルトン UI）** | 劇場名＋駅 |
| Why（推薦理由） | 性格・関係・気分からの 2文 | 維持 |
| How（予約導線） | 「劇場確定後に予約リンク」 | 予約 URL |

WHERE を空欄にすることで「まだ決まっていない」がユーザーに明示される。スケルトン UI の慣習（shimmer animation）を使えば「壊れ」と誤解されない。

### 原則 4: 近隣段階拡張（Concentric Area Expansion, Fail Honestly）

```
Tier 0: ユーザー指定エリア（例: 渋谷）
  ↓ 劇場見つからず
Tier 1: 隣接エリア / 近接主要駅（渋谷 → 新宿・表参道・恵比寿・原宿・下北沢）
  ↓ 劇場見つからず
Tier 2: 「この近辺ではこの作品の上映館が弱い」+ 別作品提案
  ↓ Stage 1 へ戻る（ただし「この作品を諦めた」signal を渡す）
```

**Tier 境界定義**:
- Tier 0: ユーザーが明示したエリア文字列とマッチする劇場
- Tier 1: Tier 0 から 3km 以内 or 同路線 2 駅以内（静的 adjacency table で管理）
- Tier 2: Tier 1 まで空ならば正直に劇場不足を返す

**全国検索は禁止**: ユーザーの行動可能半径を無視した提案は「信頼性」を毀損する。これは product judgment であり技術的 fallback ではない。

**根拠**: Fandango / TOHOシネマズ等の主要予約サイトも「駅 or 区」での階層検索 UI。認知地理学的にも「自分の日常圏＋隣の圏」を超える提案はユーザーの mental map から外れる（Lynch 1960 "Image of the City"）。

### 原則 5: LLM とロジックの分担（Hybrid Authority）

| レイヤ | 担当 | 理由 |
|---|---|---|
| 会話理解 | LLM | 言葉のニュアンス・感情・ほのめかし |
| 作品候補生成 | ロジック + 軽量 LLM | カタログ検索の事実性は logic、並び替えは LLM |
| 2人への推薦理由 narration | **LLM（ここが今欠落**） | 性格・履歴・関係の統合は LLM の最強領域 |
| 劇場検索 | ロジック | 在庫・時刻・地理は事実の領域 |
| 劇場選定の微調整 | LLM（弱） | 「駅から徒歩5分の方が疲れないかも」等の関係文脈 |
| カード最終生成 | LLM + template | 5W1H テンプレに LLM 生成ナラティブを嵌める |

現行実装は **「推薦理由 narration」が LLM から logic に落ちている** のが最大の欠陥。これはロジック/LLM 分離を「全て」と誤解した結果であり、フード実装でも実は narration は LLM が出している（`lib/coalter/narrationTemplate.ts` 参照）。

映画でも narration を LLM に戻す。ただし作品検索の fact authority は logic に残す。

---

## 2. アーキテクチャ詳細

### 2.1 Pipeline 図（時系列・3 段・作品先出し / 劇場裏走行）

**CEO 指示 A への対応**: 1 分ずっと無言にしない。**作品が先に確定したら即カードを出し、劇場探索は裏で並行**させる。
**CEO 指示 D への対応**: Stage 1 Understand は完全に内部処理。ユーザーには見えない。

```
[User 発話]
    ↓
[Stage 0: Analysis]  ← 既存 ConversationAnalysis（theme/constraints/intensity）  ~2s
    ↓
[Stage 1: Understand]  ← 内部処理のみ。UI 非表出  ───────── target ≤ 5s
  ├─ 1a. Observation Bundle 収集
  │     Alter（personality lens） + Stargazer（判断軸）
  │     + CoAlter（関係史・fairness ledger・sharedHistory）
  │     + 今の会話（recentMessages・constraints・intensity）
  │     + 他観測（location / wardrobe / styleProfile / calendar 等、利用可能なもの全て）
  ├─ 1b. Structured Fusion（logic + 軽量 LLM）
  └─ 1c. Output: TwoPersonLensToday {
           今日の mode, ケア軸, 回避要素, 関係温度,
           fairness 調整方針, 身体・時間コンテキスト,
           understanding_confidence
         }
  ※ ドメイン非依存。food / travel / gift でも同じ Stage 1 を使う
    ↓
[Stage 2: Curate (movie)]  ← ここで初めてカードが出る ────── target ≤ 23s
  ├─ 2a. Query Derivation（TwoPersonLensToday → movie 軸に翻訳）
  ├─ 2b. Candidate Generation (logic) + Soft Availability Filter
  ├─ 2c. LLM Ranking with Personality-Rooted Narration
  └─ 2d. Top-1 pick + confidence + narration
    ↓
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ★ ここで 2 つが同時に起こる ★
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ↓                                  ↘
[Card Render v1 に即座に push]       [Stage 3: 裏で自動発火]
  - What: 作品タイトル+要約              ├─ 3a. Tier 0 fetch
  - Why: 2人への理由（narration）        ├─ 3b. Parse
  - Where: スケルトン「劇場を探しています…」 ├─ 3c. Schedule filter
  - When: 「上映時刻取得中」              └─ 結果を非同期 push
    ↓                                  ↙
  ユーザーが narration を読む ← 認知的に埋められる時間 ≈ 8〜15s
    ↓
[Card Render v2 パッチ適用]
  - WHERE: 劇場名＋駅               ← Tier 0/1 成功
    または
  - WHERE: 「この近辺ではこの作品の上映が弱い」+ 別作品ボタン  ← Tier 2 fail
  - When: 具体時刻
  - How: 予約 URL
    ↓
[User 承認 / 別作品選択 / 代替提示]
```

### 2.1.1 UX 状態遷移（カード 1 枚の中で）

| phase | WHERE 表示 | narration 表示 | ユーザー操作 | 内部処理 |
|---|---|---|---|---|
| P1: Stage 0+1+2 実行中（〜28s） | 「2人に合う作品を探しています」 | skeleton shimmer | — | Understand → Curate |
| P2: Stage 2 完了・Stage 3 実行中 | 「{title} の劇場を探しています」 | **narration 充填（2人への理由を読める）** | 読む・却下・承認 | Resolve |
| P3a: Stage 3 成功 | 劇場名＋時刻 | narration 維持 | 予約・承認 | — |
| P3b: Stage 3 Tier2 fail | 「{area} では弱い。別作品？」+ 理由（2人向け） | narration 維持 | 別作品 / エリア拡大 | Curate 再実行 |

**重要 1**: Stage 1 Understand は P1 の内側で完結し UI には出さない。「今日のおふたりは〇〇な空気ですね」のような理解表明カードは出さない。理解は narration の中に滲ませる。
**重要 2**: P2 の時間（narration 読了時間）が Stage 3 の作業時間を吸収する。ユーザーは「待っている」のではなく「読んでいる」。これが 1 分 budget を認知的に 20 秒に感じさせる設計。

合計 max 55 秒（壁時計）。ユーザー体感: narration 読了で Stage 3 完了を迎える設計。

### 2.2 Stage 1 詳細: Understand（ドメイン非依存、内部処理のみ）

**CoAlter の核心**。**このモジュールは movie / food / travel / gift で完全共有される**。`lib/coalter/understanding/` に実装し、ドメイン別 Curator から import する。

#### 2.2.1 Input: Observation Bundle（ユーザーから得られるもの全て）

**CEO 指示**: 「ユーザーから得られるもの全てが情報となる」。Alter + CoAlter + Stargazer + 今のチャット + 他観測 を構造化して受け取る。

```ts
type ObservationBundle = {
  // ──────── 個人観測（A, B 各自分）────────
  personA: PersonObservation
  personB: PersonObservation

  // ──────── 関係観測（2人の間） ────────
  relationship: RelationshipObservation

  // ──────── 今この瞬間 ────────
  conversation: ConversationObservation

  // ──────── 環境コンテキスト（ドメイン横断） ────────
  environmental: EnvironmentalObservation

  // ──────── メタ ────────
  dataFreshness: DataFreshness              // どの観測が何日古いか
  completeness: Record<keyof ObservationBundle, number>  // 0-1, 欠損耐性のため
}

type PersonObservation = {
  identity: { userId: string, displayName: string }

  // ── Stargazer 観測（判断原理層） ──
  stargazer: {
    decisionAxes: StargazerAxes           // 「安心↔刺激」「論理↔感情」等の重み
    comfortSources: string[]              // 安心の源
    fatigueTriggers: string[]             // 疲れの原因
    recoveryConditions: string[]          // 回復条件
    unspokenDesires: string[]             // 未言語化の欲求
    breakingConditions: string[]          // 崩れやすい条件
    stateVariability: StateVariability    // 状態による変化の型
    confidenceByAxis: Record<string, number>  // 各軸の観測信頼度
  }

  // ── Alter 観測（personality lens, 心の状態） ──
  alter: {
    personalityLens: PersonalityLens      // Alter が保持する人格像
    recentEmotionalState: EmotionalState  // 直近の心の天気
    trustLevel: TrustLevel                // Alter との信頼度
    phaseState: HdmPhaseState             // Phase 0-5 の現在値
    recentNarratives: NarrativeFragment[] // 自己語りの最近
  }

  // ── 行動観測 ──
  behavioral: {
    recentActivity: ActivityEvent[]       // Origin 日記から抽出
    calendarContext: CalendarSummary      // 今日・明日の予定密度
    wearHistory: WearEvent[]              // 着用履歴（気分の外形）
  }

  // ── 環境情報 ──
  context: {
    location: LocationProfile | null      // 居住地・今いる場所
    wardrobe: WardrobeSummary | null
    styleProfile: StyleProfile | null
  }
}

type RelationshipObservation = {
  // CoAlter 固有観測
  sharedHistory: Moment[]                 // 2人の印象的瞬間
  fairnessLedger: FairnessRecord[]        // 過去の譲り合い履歴（時系列公平性）
  currentTemperature: "warm" | "neutral" | "cool"
  interactionPattern: InteractionPattern  // 会話スタイル・ペース
  unresolvedThreads: UnresolvedThread[]   // 持ち越し話題
  rupturesAndRepairs: RuptureRepairEvent[] // 衝突と修復の履歴
}

type ConversationObservation = {
  turns: ConversationTurn[]               // 直近メッセージ
  theme: ThemeTag                         // movie / food / travel / null
  extractedConstraints: Constraints       // date / location / budget / timeSlot / preferences
  caringIntensity: { a: number, b: number }
  implicitMood: string                    // 行間の気分
  energyLevel: "high" | "mid" | "low"
  conversationArc: ArcShape               // 開始→膨らみ→収束 等
  questionGuard: QuestionGuardState
}

type EnvironmentalObservation = {
  timestamp: string
  weather: WeatherSummary | null
  seasonality: "spring" | "summer" | "autumn" | "winter"
  dayType: "weekday" | "weekend" | "holiday"
  timeOfDay: "morning" | "afternoon" | "evening" | "night"
}
```

**重要**: 各フィールドは null / empty 耐性を持つ（新規ペア・観測不足ケース対応）。`completeness` スコアを Understanding が参照し、薄い場合は confidence を下げる。

#### 2.2.2 Processing（内部）

```ts
async function runUnderstanding(bundle: ObservationBundle): Promise<TwoPersonLensToday> {
  // 1. 永続層の統合（logic）
  const personalLenses = {
    a: fusePersonLens(bundle.personA),  // Stargazer + Alter + 行動 を統合
    b: fusePersonLens(bundle.personB),
  }

  // 2. 関係層の統合（logic）
  const relationalLens = fuseRelationalLens(
    bundle.relationship,
    personalLenses,
  )

  // 3. 今日の読み（軽量 LLM）
  //    永続層 + 今日の会話 + 環境 → 「今日のおふたり」の mode 抽出
  const todayReading = await llm.readToday({
    personalLenses,
    relationalLens,
    conversation: bundle.conversation,
    environmental: bundle.environmental,
  })

  // 4. fairness 調整方針（logic）
  const fairnessAdjustment = computeFairnessAdjustment(
    bundle.relationship.fairnessLedger,
  )

  return {
    personalLenses,
    relationalLens,
    todayReading,
    fairnessAdjustment,
    understanding_confidence: computeConfidence(bundle.completeness),
  }
}
```

Stage 1 の LLM は **軽量 1 本**（今日の読み取りだけ）。重い narration 生成は Stage 2 に譲る。これで Stage 1 の latency 予算を ≤ 5s に収める。

#### 2.2.3 Output: TwoPersonLensToday（ドメイン非依存）

```ts
type TwoPersonLensToday = {
  // ── 永続の読み（各自分の固有理解） ──
  personalLenses: {
    a: PersonalLens
    b: PersonalLens
  }

  // ── 関係の読み ──
  relationalLens: {
    temperature: "warm" | "neutral" | "cool"
    dominantDynamic: string               // 「今日は A が主導、B が共感受容」等
    careAxes: string[]                    // 「Bの疲労への配慮」等
    avoidElements: string[]               // 避けるべき要素（合流した veto）
  }

  // ── 今日の読み ──
  todayReading: {
    mode: TodayMode                       // "recover" | "celebrate" | "connect" | "challenge" | "maintain"
    energyBudget: "high" | "mid" | "low"
    timeBudget: "ample" | "limited" | "tight"
    implicitIntent: string                // 「本当に求めてること」の推測
    latentNeeds: string[]                 // 未言語化の欲求
  }

  // ── 調整方針 ──
  fairnessAdjustment: {
    favorSide: "a" | "b" | null
    rationale: string | null              // narration でも使える
    strength: number                       // 0-1, 調整の強さ
  }

  // ── メタ ──
  understanding_confidence: number        // 0-1
  dataGaps: string[]                      // 「A の直近観測が薄い」等、Curator が注意すべき欠損
}

type PersonalLens = {
  userId: string
  displayName: string
  coreDecisionPrinciples: string[]        // 「静かに整えたい人」等の凝縮
  currentEmotionalHue: string             // 「今日は少し疲れ気味」等
  todaySensitivities: string[]            // 今日特に敏感な要素
  comfortPathways: string[]               // 回復に効きそうな方向
  sourcedFrom: {                          // どの観測由来か（narration で引用できる）
    stargazer: string[]
    alter: string[]
    behavioral: string[]
  }
}
```

**`sourcedFrom` が重要**: narration が「Aさんの Stargazer 観測では…」等、由来を引用可能になる。これが汎用 LLM には出せない「観測の累積からくる重み」。

#### 2.2.4 ドメイン横断で同じ出力を使う

| ドメイン | Stage 1 Understand Output | Stage 2 Curate が足すドメイン軸 |
|---|---|---|
| movie | `TwoPersonLensToday` (共通) | ジャンル・長さ・重さ・時代 |
| food | `TwoPersonLensToday` (共通) | 料理ジャンル・予算・空腹度・アレルギー・雰囲気 |
| travel | `TwoPersonLensToday` (共通) | 距離・期間・移動負荷・目的 |
| gift | `TwoPersonLensToday` (共通) | 予算・用途・関係フェーズ |

**Understanding を一度動かせば、全ドメインで同じ理解を使える**。

### 2.3 Stage 2 詳細: Curate (movie)

#### 2.3.1 Query Derivation（TwoPersonLensToday → movie 軸）

Stage 1 の出力を movie ドメイン固有の検索軸に翻訳する（HyDE / Decomposed Prompting 応用）:

```ts
type MovieQuery = {
  genres: string[]          // ["ヒューマンドラマ", "ミステリー"]
  mood: "upbeat" | "mellow" | "thrilling" | "comforting" | "thought-provoking"
  weight: "light" | "medium" | "heavy"   // 鑑賞後の疲労度
  length_minutes_max: number | null
  era: "now-showing" | "any" | "classic"
  couple_fit_hints: string[]  // ["静かに泣ける", "話題を作れる", "会話のきっかけになる"]
  exclude: string[]           // 過去視聴 or 既却下
}
```

軸の決定は `TwoPersonLensToday.todayReading.mode` × `relationalLens.temperature` × `energyBudget` から派生。例: mode="recover" + temperature="warm" + energyBudget="low" → mood="comforting", weight="light", length_max=120。

#### 2.3.2 Candidate Generation（logic 主体）+ Soft Availability Filter

**CEO 指示 B への対応**: Stage 2 Curate は「完全に劇場無視」ではない。**ゆるい availability filter** を通す。これを抜くと Stage 3 Resolve での失望が増え、承認が空振りしやすくなる。

##### Pool ソース

- 優先度 1: **映画.com / eiga.com 公開中ランキング** の軽量スクレイプ（「今上映してる作品リスト」だけ取る）
- 優先度 2: EXA で「2026年4月 公開中 映画 {genre}」
- 優先度 3: 2人の履歴 + Stargazer personality からの抽出候補

→ 30〜50 件の raw pool

##### Soft Availability Filter（Stage 2 に残す足切り）

pool に対して以下を軽く通す。**完全精密な劇場探索はしない**（それは Stage 3）。**「この作品がユーザー地域で見られる可能性が十分あるか」だけ見る**:

```ts
function softAvailabilityScore(title, userArea): number {
  // 3 シグナル、合計 0-1
  const nowShowing   = isInNowShowingList(title) ? 0.4 : 0   // 今全国で上映中か
  const wideRelease  = estimatedScreenCount(title) >= 20 ? 0.3 : 0.1  // ワイド公開か
  const areaHint     = areaHasAnyCinema(title, userArea, "fuzzy") ? 0.3 : 0
  return nowShowing + wideRelease + areaHint
}
```

- `nowShowing`: 公開中ランキングに入っているか（バイナリ）
- `wideRelease`: 全国公開規模（単館・限定公開はスコア下げるが排除はしない）
- `areaHint`: ユーザー地域 or Tier1 の主要劇場サイトに作品名が出るか（fuzzy、1 回の軽いクエリ）

**閾値 0.4 未満は pool から除外**。これを「ゆるい」と呼ぶ理由: 誤排除（Stage 3 なら見つかる作品を落とす）< 誤採用（Stage 3 で絶対見つからない作品を推薦して失望させる） のリスクバランス。

この filter は **LLM ranking 前に走る**。LLM は availability を判断する responsibility を持たない（hallucination の温床になる）。

##### Pool 最終サイズ

30〜50 件 raw → soft filter 通過 15〜30 件 → LLM ranker に投入

#### 2.3.3 LLM Ranking + 2人への Why（Personality-Rooted Narration）

**CoAlter の核心**。Stage 1 Understand が返した `TwoPersonLensToday` を input として、movie 固有のドメイン情報（watch history / genre sensitivity）を足し、作品を結晶化する。

##### Input（Stage 1 + 映画ドメイン固有情報）

```ts
type MovieCurateInput = {
  lens: TwoPersonLensToday               // ← Stage 1 Understand の成果物
  movieDomain: {
    personA_cinematic: {
      watchHistory: WatchEvent[]         // 過去の満足/不満足
      genreSensitivity: Record<Genre, { affinity: number, aversion: number }>
      rejectedTitles: string[]           // 過去却下
    }
    personB_cinematic: { /* 同上 */ }
    sharedWatches: WatchEvent[]          // 2人で観た履歴（関係史の映画断面）
  }
  candidatePool: MovieCandidate[]        // soft filter 通過済み
  query: MovieQuery                      // 2.3.1 で派生
}
```

汎用 LLM にはない優位: `lens` が「観測の累積」、`movieDomain` が「ペアの映画履歴」。両方で既存 LLM との差を作る。

##### Output（narration が「由来」を持つ形）

```ts
type PersonalityRootedPick = {
  title: string
  confidence: number                 // 0-1
  reasoning: {
    // 必須 5 要素。どれが欠けても「CoAlter らしさ」が消える
    personA_lens: string             // 「Aさんは〇〇な時に△△を求める傾向があって」
    personB_lens: string             // 「Bさんは□□を大事にする人で」
    relational_fit: string           // 「2人の間の◇◇な空気に、この作品は」
    today_hook: string               // 「今日の会話の〇〇という流れから」
    veto_guard: string               // 「〇〇（A/B の片方が避けたい要素）は外した」
  }
  // カード表示用に統合された 2〜3 文ナラティブ（LLM が reasoning から書き起こす）
  narrative: string
  fairnessNote: string | null        // 「前回は Bさん寄りだったので今回は Aさんの〇〇を優先」
}
```

##### プロンプト設計（要点）

```
あなたは CoAlter。A/B 2人を誰よりも理解している存在。
Stage 1 Understand が、何ヶ月にもわたる観測の累積から「今日のおふたり」を読んだ結果を渡す。
この読みを信じて、作品を結晶化せよ。

【Stage 1 Understand の読み】
  A の Personal Lens: {lens.personalLenses.a}
  B の Personal Lens: {lens.personalLenses.b}
  2人の Relational Lens: {lens.relationalLens}
  今日の Reading: {lens.todayReading}
  Fairness 調整方針: {lens.fairnessAdjustment}
  観測の由来: {lens.personalLenses.*.sourcedFrom}   ← narration 引用に使う
  データ欠損: {lens.dataGaps}                        ← 薄い部分には触れすぎない

【映画ドメイン固有】
  A の cinematic: {movieDomain.personA_cinematic}
  B の cinematic: {movieDomain.personB_cinematic}
  2人の shared watches: {movieDomain.sharedWatches}

【今日の会話】{conversation.turns}
【候補作品 pool】{candidatePool}

タスク:
1. 候補から top 3 を選ぶ。単なるマッチングではなく、「この 2人がこの作品を今日観ると、何が起こるか」を想像して選ぶ
2. 各作品について reasoning 5 要素を埋める:
   - personA_lens: Aさんの lens の coreDecisionPrinciples or comfortPathways を 1 つ具体的に引用
   - personB_lens: Bさんの lens を同様に
   - relational_fit: relationalLens.dominantDynamic or careAxes から
   - today_hook: todayReading.mode or implicitIntent を引用
   - veto_guard: relationalLens.avoidElements から「外した理由」を 1 つ
3. 「Aさん・Bさん」の名前を narration に使う（displayName 使用）
4. fairnessNote: fairnessAdjustment が non-null なら rationale を反映
5. lens.sourcedFrom に基づき「過去の〇〇の観測で…」等の由来引用を narration に必ず 1 箇所以上

禁止事項:
- 「多くのカップルに人気」のような集計的理由
- ジャンル名だけの理由（「ヒューマンドラマが好きそう」）
- 2人のどちらにも触れない一般論
- 候補 pool 外のタイトルを出す（hallucination 防止）
- Stage 1 lens を使わない一般論
- dataGaps にある薄い部分を根拠にする（hallucination 温床）
```

##### なぜこれが「完全上位互換」になるのか

汎用 LLM（ChatGPT 等）に同じ情報を渡しても再現できない。理由:

1. **情報量**: 2人のパーソナリティ観測は累積データ。プロンプト 1 回に収まらない。CoAlter は DB に永続化されている
2. **観測の時系列**: Stargazer は「判断原理」レベルの低解像度抽象を数ヶ月かけて獲得している。セッション内で引き出せるものではない
3. **関係の観測**: 2人の fairness ledger や sharedHistory は対話の外で蓄積される。汎用 LLM はアクセス不能
4. **personhood の一貫性**: CoAlter は「2人を知っている同じ存在」として一貫する。汎用 LLM は毎回初対面

この差は **技術ではなく観測の累積** による。だから真似できない。

##### logic 側の責務

- 候補 pool の fact 正しさ（タイトル・ジャンル・長さ・上映中か）
- LLM 出力のバリデーション（pool 外タイトル reject、narration 5 要素欠落時 retry）
- Fairness Ledger の更新（どちらに寄ったか記録）

#### 2.3.4 Output

```ts
type Stage2CurateResult = {
  topPick: {
    title: string
    summary: string           // 1文
    genres: string[]
    lengthMin: number
    narration: string         // 2〜3文、LLM生成 ★ 差別化の核心
    reasoning: {              // 5 要素の詳細（audit 用）
      personA_lens: string
      personB_lens: string
      relational_fit: string
      today_hook: string
      veto_guard: string
    }
    fairnessNote: string | null
    confidence: number
  }
  alternates: Array<Stage2CurateResult["topPick"]>  // 2〜3件、user が「違うのある？」と言った時用
  theaterSearchHint: {        // Stage 3 に渡すヒント
    releaseStatus: "now-showing" | "limited" | "upcoming"
    distributor: string | null
    officialUrl: string | null
  }
}
```

### 2.4 Stage 3 詳細: Resolve（劇場・時刻・ロジスティクス）

#### 2.4.1 Concentric Area Expansion

```ts
const TIER0 = resolveUserArea(userLocation)           // "渋谷"
const TIER1 = adjacencyTable.get(TIER0)               // ["新宿", "表参道", "恵比寿", "原宿", "下北沢"]

async function resolve(title, tier) {
  const theaters = await searchTheaters(title, tier)
  if (theaters.length > 0) return { tier, theaters }
  return null
}

let result = await resolve(title, [TIER0])
if (!result) result = await resolve(title, TIER1)
if (!result) return { state: "tier2_fail", message: "この近辺では上映が弱い", altSignal: true }
```

#### 2.4.2 Structured retrieval（劇場公式が主、EXA は補助）

優先順:
1. **作品公式サイト → 上映劇場リスト**（distributor が維持、最も正確）
2. **eiga.com / Yahoo映画 の作品ページ → 劇場タブ**（構造化されてる）
3. **EXA 劇場特化クエリ**（最終手段、エリア付き）

300 字スニペットに頼らず、**作品公式ページを直接 fetch して HTML から劇場リスト領域を切る**。これは movie ドメインでは実現可能（映画公式は定型が強い）。

#### 2.4.3 Screening time filter

取得した劇場 × 上映時刻から、
- 今日〜明後日の枠に絞る
- できれば空席ありのものを top に

---

## 3. 1 分 budget の内訳（3 段・作品先出し / 劇場裏走行）

```
Stage 0 Analysis:            2s    (既存、ほぼ instant)
Stage 1 Understand:          5s    (内部処理、軽量 LLM 1 本 + logic 統合)
  ├─ 1a Observation collect: 1s    (DB fetch 並列)
  ├─ 1b Structured fusion:   1s    (logic)
  └─ 1c Today reading LLM:   3s    (軽量)
Stage 2 Curate:             23s    (Card v1 push ポイント)
  ├─ 2a Query derivation:    1s    (logic)
  ├─ 2b Candidates:         10s    (並列 3 source) + Soft filter 3s
  ├─ 2c LLM Rank+Narration: 12s    (personality-rooted、2人の由来を織り込む)
  └─ 2d output:              1s
─────────── 30s 壁時計（Card v1 push → narration 読める）

★ ここから並行 ★
Stage 3 Resolve:
  ├─ 3a Tier0 fetch:        10s ┐
  ├─ 3b Parse:               3s │ 裏で走行。ユーザーは narration を読んでいる
  └─ 3c Schedule:            2s ┘
─────────── +15s 壁時計（Tier0 成功時、合計 45s）

Tier1 追加時:                +12s → 57s 合計（まだ 1 分以内）
Tier2 fail 判定:              即時（Tier1 空振り確定時点）
```

**ユーザー体感**: Stage 3 の 15〜25s は narration 読了時間に吸収される。体感待ち時間 ≒ Stage 0+1+2 の 30s のみ。

**投機的 prefetch**: Stage 2c で top-1 confidence ≥ 0.8 が確定した時点で、2d と並行して Stage 3a の Tier0 fetch を起動できる。この場合 Card v1 push と同時にほぼ劇場も揃う。

**Stage 1 キャッシュ**: 同じ 2人が同じセッション内で複数提案を求めた場合（「他にある？」）、Stage 1 結果は 5 分間キャッシュする。2 回目以降は Stage 2 から走行、体感速度は 2 倍に。

---

## 4. 失敗時の挙動

| 失敗 | ユーザー体験 | 内部動作 |
|---|---|---|
| Stage 1 観測薄い（新規ペア等） | 通常通り提案（understanding_confidence 低い旨を narration に控えめに反映） | dataGaps を Stage 2 に渡し薄い根拠を使わせない |
| Stage 1 LLM timeout | logic のみで lens を組み立て Stage 2 へ | 劣化モード、narration 固有情報率が下がる可能性 |
| Stage 2 候補 0 件 | 「今 2人に合う作品が絞れなかった。もう少し教えて」 | 質問で情報追加 |
| Stage 2 低 confidence | top-1 + alternate も見せる | ユーザーが選ぶ |
| Stage 3 Tier0 空 | 「渋谷では上映なし。近隣も探します」in-card | Tier1 自動発火 |
| Stage 3 Tier1 も空 | 「この近辺ではこの作品の上映が弱い。別作品を探す？」 | Stage 2 再実行ボタン |
| Tier2 fail → Stage 2 再 | 前回 top-1 は除外リストに。Stage 1 は再利用（同じ lens） | 別ジャンル寄りに ranker を振る |
| 1 分 timeout | 「少し時間がかかってる。このまま待つ？中断する？」 | 進行中のものは継続 |

---

## 5. 他ドメインへの横展開（構想。詳細設計は後続）

### 5.1 共通基盤（本文書で確定）

```
lib/coalter/
├── understanding/              ← Stage 1（全ドメイン共通）
│   ├── observationBundle.ts    ← ObservationBundle 収集・組み立て
│   ├── personFusion.ts         ← PersonObservation → PersonalLens
│   ├── relationalFusion.ts     ← RelationshipObservation → relationalLens
│   ├── todayReader.ts          ← 軽量 LLM で「今日の読み」
│   ├── fairnessAdjustment.ts   ← fairness ledger → 調整方針
│   └── types.ts                ← TwoPersonLensToday, PersonalLens, ObservationBundle 定義
├── movie/                      ← Stage 2+3（movie 固有）
│   ├── curator.ts              ← Stage 2: query derivation + candidates + ranker + narration
│   ├── theaterResolver.ts      ← Stage 3: concentric area expansion + fetch + schedule
│   └── types.ts
├── food/                       ← 後続（食べログスニペット勝ちパターンを保ちつつ narration 統合）
├── travel/                     ← 後続
└── gift/                       ← 構想
```

### 5.2 Food / Travel の適用方針（構想のみ）

**food**:
- Stage 1 は共通基盤をそのまま利用
- Stage 2 Curate 再設計: 現行 narration 欠落（推測）を同じ Personality-Rooted Narration に統一
- Stage 3 Resolve: 既に店舗 = 作品 + 劇場が一体なので Tier 拡張のみ使う
- 食べログの構造化スニペット勝ちパターンは Stage 2 の candidate generation で維持

**travel**:
- Stage 1 は共通基盤
- Stage 2 Curate: 行き先（候補作品に相当）選定
- Stage 3 Resolve: 宿・交通（劇場・時刻に相当）確定 + 階層拡張（駅徒歩圏 → 同市内 → 同地域）

**gift**:
- Stage 1 共通
- Stage 2 Curate: ギフト候補
- Stage 3 Resolve: 購入先（店舗・EC）

### 5.3 Understanding の安定性保証

Understanding が同じ 2人に対してドメイン毎にブレたら CoAlter の人格の一貫性が崩れる。対策:
- `TwoPersonLensToday` の永続キャッシュ（セッション内 5 分）
- `PersonalLens.coreDecisionPrinciples` は Stargazer 由来なのでほぼ不変、ドメイン間で差が出ない
- `todayReading.mode` だけはドメインによって解釈が変わる可能性あり（映画の "recover" と食事の "recover" は違う）→ Stage 2 で再解釈する余地を残す

---

## 6. 実装計画（CEO 承認後）

### Phase M0: Stage 1 Understand 共通基盤（1 週間）

**movie 着手前の前提。共通基盤なので最優先**。

- `lib/coalter/understanding/` 新設（全ファイル）
  - `types.ts` / `observationBundle.ts` / `personFusion.ts` / `relationalFusion.ts` / `todayReader.ts` / `fairnessAdjustment.ts`
- ObservationBundle 収集実装（Alter / Stargazer / CoAlter / conversation / 環境 を DB から引く）
- 軽量 LLM todayReader プロンプト
- Understanding の単体テスト（snapshot based、lens 安定性）
- diagnostics: `[CoAlter] understanding.diagnostics` ログ追加

**Gate（Understanding 単体）**:

| 指標 | 閾値 | 意図 |
|---|---|---|
| U1. `TwoPersonLensToday` 生成成功率 | ≥ 95% | 欠損観測でも落ちない |
| U2. `sourcedFrom` 埋まり率 | ≥ 90% | narration が由来引用できる状態 |
| U3. `understanding_confidence` の分布 | 中央値 ≥ 0.6 | 観測累積が機能している |
| U4. latency p95 | ≤ 5s | budget 内 |
| U5. ドメイン間一貫性（同日・同ペアで movie/food 両方走らせた際の `coreDecisionPrinciples` 一致率） | ≥ 95% | 人格の一貫性 |

### Phase M1: Stage 2 Curate (movie)（1 週間）
- `lib/coalter/movie/curator.ts` 新設
- Query Derivation（TwoPersonLensToday → movie 軸）
- Candidate pool 3 source + **Soft Availability Filter**（CEO 指示 B）
- LLM Ranker with Personality-Rooted Narration
- カード UI: WHERE 空欄状態（スケルトン）
- Stage 3 は現行のまま（エラー時振る舞いのみ修正）

**Gate（複合指標、全て満たす必要あり）**:

| 指標 | 閾値 | 意図 |
|---|---|---|
| G1. top-1「観たい」率 | ≥ 50% | 作品選定の本質品質 |
| G2. Stage 3 到達率（承認クリック率） | ≥ 60% | 「観たいけど近くでやってない」の誤認採用を検出 |
| G3. narration 5 要素充足率 | ≥ 90% | personA_lens / personB_lens / relational_fit / today_hook / veto_guard の全部入りか |
| G4. narration 固有情報率 | ≥ 80% | Aさん/Bさん固有の観測（Stargazer 軸・履歴）を narration が引用しているか（手動評価 or LLM-judge） |
| G5. Soft filter 精度 | pool 通過後の Stage 3 成功率 ≥ 75% | filter が緩すぎ/厳しすぎでないか |
| G6. narration の lens 由来引用率 | ≥ 70% | `sourcedFrom` を narration が実際に引用しているか |

G2 が CEO 指示 C の「観たいけど近くでやってない」検出指標。G1 だけだと見落とす。G4 と G6 が CoAlter の核心（§0.5）を測る指標。

### Phase M2: Stage 3 Resolve（1 週間）
- `lib/coalter/movie/theaterResolver.ts`
- adjacency table（主要駅 50）
- 作品公式サイト fetcher
- Tier fail state の UI（別作品再起動は 2人理解を根拠に謝る narration）
- Stage 3 prefetch 投機実行

**Gate（複合指標）**:

| 指標 | 閾値 | 意図 |
|---|---|---|
| H1. Tier 0 劇場確定率 | ≥ 55% | ユーザー指定エリアで取れる率 |
| H2. Tier 0+1 劇場確定率 | ≥ 75% | 近隣拡張まで入れた確定率 |
| H3. Tier 2 fail 時の「別作品へ」再起動率 | ≥ 60% | 誠実な失敗告知がユーザーに受容されるか |
| H4. 1 分 budget 超過率 | ≤ 10% | 品質優先でも budget 守れる |
| H5. narration 一貫性（Stage 2 narration + Tier2 謝罪 narration が同じ人格として読めるか） | 手動評価 PASS | 人格の一貫性 |

### Phase M3: 監査と定着（1 週間）
- A/B: 現行 vs 三段式
- diagnostics 拡張: stage 毎の latency / confidence / fail reason
- kill switch: `COALTER_THREE_STAGE=false`（Understanding もバイパス可）

---

## 7. リスクと対策

| リスク | 対策 |
|---|---|
| LLM ranker が hallucination で架空作品を top に | candidate pool 外のタイトルは reject |
| 公式サイト構造変更で劇場リスト取れず | eiga.com / Yahoo映画 fallback 3 段 |
| Tier1 adjacency table が陳腐化 | 静的 JSON、半年毎に監査、PR で更新 |
| 2人 narration が型にハマる | prompt に「今日の会話特有の要素を必ず 1 つ」 |
| 承認率が上がらない | confidence 低い時は alternate 2 件も同時表示 |
| 1 分 budget 超過 | Stage 2 timeout 20s、超えたら Tier を進めず Tier2 fail 扱い |

---

## 8. 外部文献・事例エビデンス（2026-04-20 調査結果）

### 8.1 Two-stage Candidate Generation + Ranking（産業標準）

YouTube DNN (Covington et al. 2016), Netflix Row+In-row ranking, Pinterest PinSage すべてが「軽い広い網 → 重い精密網」の 2 段。1 段で高カーディナリティと高精度要求を両立させた例は存在しない。
- https://research.google/pubs/pub45530/
- https://netflixtechblog.com/netflix-recommendations-beyond-the-5-stars-part-1-55838468f429
- https://medium.com/pinterest-engineering/pinsage-a-new-graph-convolutional-neural-network-for-web-scale-recommender-systems-88795a107f48

**CoAlter への含意**: 1 クエリで作品＋劇場を解く現行は、業界がとうに捨てた反パターン。

### 8.2 Modern RAG（質問分解の原理）

- **HyDE** (Gao 2022): クエリ → 仮想ドキュメント → embedding 検索。「静かで余韻がある」等の抽象要件を作品 embedding にぶつける用途に直結 — https://arxiv.org/abs/2212.10496
- **ReAct** (Yao 2022): Reason→Act→Observe 反復で hallucination を抑える — https://arxiv.org/abs/2210.03629
- **Self-Ask** (Press 2022): LLM に自分でサブ質問を立てさせる。compositional gap の発見 — https://ofir.io/self-ask.pdf
- **Decomposed Prompting** (Khot 2023): 各サブタスクを独立最適化 — https://arxiv.org/abs/2210.02406

**CoAlter への含意**: Self-Ask / DecomP の「LLM が自分でサブ質問を立てる」構造は、エリア拡張ループ（近隣→隣接→別作品）の制御フローにそのまま流用できる。

### 8.3 LLM + Logic Hybrid（Authority 分離）

RecLLM (Google) は dual-encoder 候補生成 + LLM re-ranker + 説明生成の分業。ChatGPT 単体は positional bias と fairness 問題で sequential recommendation では不安定。Constrained generation は「symbolic control が推論空間を定義し、LLM はその内部で合成する」を推奨。
- https://arxiv.org/html/2406.12433v2
- https://arxiv.org/html/2402.18590v2
- https://arxiv.org/html/2403.06988v1

**CoAlter への含意**: 劇場名を LLM に生成させるのは構造的に破綻する。Stage 1 LLM = reranker + narration / Stage 2 API = factual authority、を厳守する。

### 8.4 映画ドメイン業界 UX

TOHOシネマズ / Fandango は「作品選択 → 上映スケジュール → お気に入り劇場 → 近隣 → 全劇場」の三段表示、作品起点の**片方向フロー**。週次バッチ更新なので Stage 2 キャッシュも許容される。Letterboxd は作品推薦に劇場を混ぜない。
- https://www.tohotheater.jp/
- https://www.fandango.com/movie-theaters
- https://nanocrowd.com/nanocrowd-letterboxd/

**CoAlter への含意**: CEO 条件 (1)(3)（WHERE ブランク → 採用後確定、近隣→隣接→…）は業界 UX と完全一致。むしろ作品＋劇場同時提示は非標準。

### 8.5 認知科学: System 1 / System 2 の分離

Kahneman の二重過程。映画選択は「何を観るか = 情緒的 System 1」「どこでいつ観るか = 論理的 System 2」。同一カード内で混ぜると認知負荷が跳ね、両方劣化する。
- https://thedecisionlab.com/reference-guide/philosophy/system-1-and-system-2-thinking

**CoAlter への含意**: CEO 条件 (1) の認知科学的裏付け。WHERE ブランクは「見せていない」のではなく「System 2 を保留している」状態。

### 8.6 Group Recommendation: Least Misery とカップル最適化

Masthoff の古典三戦略（Average / Least Misery / Most Pleasure）のうち、**親密関係では Least Misery が最大満足**（1 人の不満が関係満足を支配するため）。2024 年の cross-domain adaptive weight fusion 研究も同方向。
- https://pro.unibz.it/projects/schoolrecsys17/JudithMasthoff.pdf
- https://link.springer.com/article/10.1007/s11257-023-09380-z

**CoAlter への含意**: 「2人への推薦理由」は単なる和集合ではなく、**veto 根拠（片方が耐えられないジャンルを外した理由）＋ bridge 根拠（2人を接続する要素）の二軸提示**を narration に要求する。既存サービスは group aggregation を内部に隠しているので、ここが差別化点。

### 8.7 採用する 5 原則（確定）

1. **Authority の完全分離** — Stage 1=LLM reasoning+reranking / Stage 2=構造化 API。劇場名を LLM に生成させない。
2. **Query Decomposition を明示** — Self-Ask / DecomP 思想で「作品」「劇場」「エリア拡張」を独立サブタスク化。
3. **Cognitive Split = UX Split** — WHERE ブランク→採用後確定は System 1/2 分離の認知科学的必然。
4. **Least Misery + Bridge の二軸 narration** — veto 根拠と bridge 根拠を両方明示。これが「2 人リコメンド理由の復活」の具体化。
5. **Stage 2 の段階的候補拡張ループ** — ReAct 型 Reason→Act→Observe を Tier0→Tier1→別作品で回す。全国拡張は DecomP の停止条件として禁止化。

---

## 9. 「絶対負けない」ポイント

差別化は技術ではなく **観測の累積と人格の一貫性** にある。

### 9.1 構造的に真似できない核（観測の累積）

1. **Domain-Agnostic Understanding 共通基盤** — Stage 1 が movie / food / travel / gift 全てで同じ 2人理解を返す。ChatGPT/Gemini は永続的な 2人理解を持たない
2. **Personality-Rooted Recommendation** — Stargazer 数ヶ月観測から作品が立ち上がる。narration が「Aさんの〇〇の観測では…」と由来を引用できる
3. **Relational History の蓄積** — sharedHistory / fairnessLedger / 関係温度の時系列は対話の外で積み上がる
4. **Personhood の一貫性** — CoAlter は「2人を知り続ける同じ存在」として振る舞う。ドメイン間でも人格がブレない

### 9.2 設計判断による差別化（真似しようとすれば可能だが誰もやらない）

5. **Personality-Rooted Narration 5 要素** — personA_lens / personB_lens / relational_fit / today_hook / veto_guard の全部入り
6. **Veto + Bridge の二軸表出化** — Masthoff Least Misery を内部集約で終わらせず narration に露出
7. **Concentric Area Expansion の誠実さ** — 全国検索で埋めない product judgment
8. **失敗時も 2人理解で謝る** — Tier2 fail の代替提案は「今日のおふたりだと〇〇が強かったから」と人格的に言語化
9. **Fairness Ledger** — 過去の譲り合いを narration に反映
10. **`sourcedFrom` の引用** — 観測由来を narration で明示

### 9.3 技術的な最適化（副次的）

11. **Authority 完全分離** — LLM が劇場を捏造しない構造保証（RecLLM / Constrained Generation）
12. **作品先出し / 劇場裏走行** — narration 読了時間で Stage 3 を吸収する認知的最適化
13. **Understanding キャッシュ** — 同セッション内の反復提案で Stage 1 を再計算しない
14. **投機的 prefetch** — confidence ≥ 0.8 時の先行 fetch

**核心**: 1-4 は「情報の質の差」で構造的に真似不能。5-10 は「設計思想の差」。11-14 は装飾。
CoAlter を普通の映画検索アプリに劣化させないためには、**1-4 を忘れた瞬間終わる** と認識すること。

---

## 10. CEO 承認事項（2026-04-20 時点）

### 10.1 承認済み（これまでの CEO 決定）

- [x] **二段分離方針**: GO → **三段に昇格**
- [x] **1 分 budget**: GO（ただし「作品先出し / 劇場裏走行」で無言を避ける形 — §2.1.1）
- [x] **movie 先行**: GO
- [x] **Veto + Bridge narration（＝Personality-Rooted Narration）**: 最優先で GO
- [x] **Stage 1 内部処理**: ユーザー非表出、narration に滲ませる方針 GO
- [x] **Stage 1 をドメイン横断の共通基盤**: food/travel にも適用できる構造で設計

### 10.2 反映済みの CEO 指示（rev 1〜3 通算）

- [x] **A. 作品先出し / 劇場裏走行** — §2.1 Pipeline 図 + §2.1.1 UX 状態遷移 + §3 budget 内訳
- [x] **B. Stage 2 Soft Availability Filter** — §2.3.2 に追加
- [x] **C. M1/M2 Gate 補強** — §6 Phase M1 に G1〜G6、Phase M2 に H1〜H5
- [x] **D. Stage 1 を独立・ドメイン非依存** — §1 原則 0 + §2.2 全体
- [x] **E. ObservationBundle による「ユーザーから得られるもの全て」の構造化** — §2.2.1

### 10.3 本 rev 以後の CEO 判断待ち

- [ ] 実装着手ブランチ: 新規 `feat/coalter-three-stage` を起動して良いか（旧 `feat/coalter-movie-two-stage` から改名）
- [ ] Phase 順序: **M0 Understanding 共通基盤 → M1 movie Curate → M2 movie Resolve → M3 監査**（food/travel は M3 以降）で良いか
- [ ] preview 本カウント 30 件 / 3 日 gate との並行可否
- [ ] Stage 1 Understanding の先行実装を preview 本カウント中に走らせてもよいか（behavior 変更しない shadow モード）

---

**次アクション**: CEO 10.3 判断後、`feat/coalter-three-stage` を起動して Phase M0（Understanding 共通基盤）着手。M0 完了までは movie の現行は触らず preview 本カウント gate は並行維持。

---

## 11. M0 固定事項（CEO lock 2026-04-20）

実装開始前に固定された制約。**違反時は即 rollback**。

### 11.A M0 禁止事項（既存回帰の完全遮断）

M0 期間中、以下は **絶対に触らない**:

| 対象 | 禁止内容 |
|---|---|
| 既存 movie retrieval | `lib/coalter/webConnector.ts`, `lib/coalter/movieCatalog.ts`, `lib/coalter/movieOrchestrator.ts` 等の **behavior を一切変えない** |
| 既存 narration | `lib/coalter/narrationTemplate.ts` を差し替えない。出力文面も変えない |
| 既存 card schema | `/coalter/proposal` 系 API response 型、UI 表示フィールドを変えない |
| preview 本カウント metadata | diagnostics 既存フィールド、KPI SQL 対象、session tagging を壊さない |

M0 の全実装は `lib/coalter/understanding/` 配下に閉じる。既存コードからの import は **M0 期間中は無し**（shadow テストでも non-invasive に作る）。

### 11.B M0 納品単位（最初の報告）

本章 §12 を最初の報告として提出する（実装着手前の plan artifact）。内容は 3 点:

1. **変更ファイル一覧**（新規のみ、既存変更は禁止）
2. **`TwoPersonLensToday` 型定義**（実装される形）
3. **U1〜U5 の測定方法**（何をどう計るか）

CEO がこの 3 点を承認してから実装着手。

### 11.C M0 ログ仕様（個人情報を生で吐かない）

`[CoAlter] understanding.diagnostics` を追加してよい。ただし **個人情報を生で出さない**。以下に絞る:

| 許可フィールド | 内容 | 型 |
|---|---|---|
| `understanding_confidence` | Stage 1 の確信度 | number 0-1 |
| `completeness` | ObservationBundle 各セクションの欠損度 | Record<section, number 0-1> |
| `source_coverage` | どの観測層が input に揃ったか | Record<source, boolean> |
| `latency_ms` | Stage 1 全体＋小節毎 | Record<stage, number> |
| `missing_domains` | 欠損したデータ源ラベル | string[] |

**禁止**: `displayName`, `utterance`, `narrative_text`, `watchHistory` 等の生値。`dataGaps` は `sections` 名のみ、内容文字列は吐かない。

---

## 12. M0 最初の報告（plan artifact、CEO 承認待ち）

### 12.1 変更ファイル一覧（全て新規）

```
lib/coalter/understanding/                  ← 新規 module（既存コード touch 0）
├── types.ts                                ← 本報告 §12.2 の型定義
├── observationBundle.ts                    ← Alter/Stargazer/CoAlter/conversation/env を束ねる
├── personFusion.ts                         ← PersonObservation → PersonalLens (logic)
├── relationalFusion.ts                     ← RelationshipObservation → RelationalLens (logic)
├── todayReader.ts                          ← 軽量 LLM 「今日の読み」（Claude Haiku 1 コール）
├── fairnessAdjustment.ts                   ← fairness ledger → 調整方針 (logic)
├── diagnostics.ts                          ← §11.C のログスキーマ + emitter
└── index.ts                                ← runUnderstanding(bundle) 公開 API

tests/unit/coalter/understanding/           ← 新規テスト（既存テスト touch 0）
├── personFusion.test.ts                    ← snapshot + 欠損耐性
├── relationalFusion.test.ts                ← snapshot + fairness 合流
├── todayReader.test.ts                     ← LLM mock + dataGaps 反映
├── fairnessAdjustment.test.ts              ← ledger シナリオ 5 本
├── understanding.integration.test.ts       ← end-to-end（U1-U5 の一部を unit で検証）
└── fixtures/                               ← 観測 fixture（合成データ、実ユーザー無し）

docs/
└── coalter-movie-two-stage-design.md       ← 既存。本報告のために更新済み（§11 §12 追記）
```

**既存コード変更: 0**。Diagnostics emitter も `lib/coalter/understanding/diagnostics.ts` 内で完結し、`movieOrchestrator` 等の既存 diagnostics には干渉しない。

### 12.2 `TwoPersonLensToday` 型定義（実装形）

```ts
// lib/coalter/understanding/types.ts

export type UserId = string & { readonly __brand: "UserId" }

export type TwoPersonLensToday = {
  // 永続の読み（各自）
  personalLenses: {
    a: PersonalLens
    b: PersonalLens
  }
  // 関係の読み
  relationalLens: RelationalLens
  // 今日の読み（軽量 LLM 由来）
  todayReading: TodayReading
  // 公平性の調整方針
  fairnessAdjustment: FairnessAdjustment
  // メタ
  understanding_confidence: number          // 0-1
  dataGaps: DataGapSection[]                // 欠損セクション名のみ
  computedAt: string                        // ISO timestamp
  lensVersion: "1.0.0"                      // schema version
}

export type PersonalLens = {
  userId: UserId
  displayName: string
  coreDecisionPrinciples: string[]          // 「静かに整えたい」等の凝縮 3〜5 本
  currentEmotionalHue: string               // 「少し疲れ気味」等 1 文
  todaySensitivities: string[]              // 今日敏感な要素 0〜5 本
  comfortPathways: string[]                 // 回復方向 2〜4 本
  sourcedFrom: {                            // narration 引用用の由来
    stargazer: StargazerSourceRef[]
    alter: AlterSourceRef[]
    behavioral: BehavioralSourceRef[]
  }
}

export type StargazerSourceRef = {
  axisKey: string                           // ex: "caution_vs_stimulus"
  axisValue: number                         // -1..1
  observedAt: string
  quote: string | null                      // 元質問の凝縮（10-40字）、なければ null
}

export type AlterSourceRef = {
  lensKey: string                           // ex: "affect", "parts", "mentalization"
  summary: string                           // 短文
  observedAt: string
}

export type BehavioralSourceRef = {
  kind: "origin_diary" | "calendar" | "wear_event"
  summary: string
  observedAt: string
}

export type RelationalLens = {
  temperature: "warm" | "neutral" | "cool"
  dominantDynamic: string                   // 「今日は A が主導、B が共感受容」等
  careAxes: string[]                        // 「B の疲労への配慮」等
  avoidElements: string[]                   // veto 合流
  interactionPace: "quick" | "steady" | "slow"
}

export type TodayMode =
  | "recover"                               // 整える
  | "celebrate"                             // 祝う・膨らむ
  | "connect"                               // 近づく
  | "challenge"                             // 挑む・刺激
  | "maintain"                              // 平常

export type TodayReading = {
  mode: TodayMode
  energyBudget: "high" | "mid" | "low"
  timeBudget: "ample" | "limited" | "tight"
  implicitIntent: string                    // 推測された真意 1 文
  latentNeeds: string[]                     // 未言語化欲求 0〜3 本
  confidence: number                        // 0-1（LLM 自己報告）
}

export type FairnessAdjustment = {
  favorSide: "a" | "b" | null
  rationale: string | null                  // narration でも使える（「前回 B 寄りだったので」等）
  strength: number                          // 0-1
  basedOnSessionCount: number               // ledger 何件を根拠にしたか
}

export type DataGapSection =
  | "personA.stargazer"
  | "personA.alter"
  | "personA.behavioral"
  | "personA.context"
  | "personB.stargazer"
  | "personB.alter"
  | "personB.behavioral"
  | "personB.context"
  | "relationship.sharedHistory"
  | "relationship.fairnessLedger"
  | "relationship.rupturesAndRepairs"
  | "conversation.turns"
  | "environmental"

// 本 plan では ObservationBundle の詳細型は省略（§2.2.1 を参照）。実装時に同等の型を定義する。
```

### 12.3 U1〜U5 の測定方法

| ID | 指標 | 閾値 | 測定方法 | 測定場所 |
|---|---|---|---|---|
| **U1** | `TwoPersonLensToday` 生成成功率 | ≥ 95% | `runUnderstanding` invocation 全件で try/catch、success = return 非 null かつ型検証 pass。`successes / invocations` を集計 | `understanding.diagnostics` の `outcome: "success"\|"degraded"\|"failed"` を KPI SQL で集計 |
| **U2** | `sourcedFrom` 埋まり率 | ≥ 90% | 成功 lens に対し、`personalLenses.a.sourcedFrom` と `.b.sourcedFrom` のそれぞれで「stargazer / alter / behavioral のうち少なくとも 2 カテゴリが空でない」かを判定。`filled / total` | diagnostics の `source_coverage.{a,b}` 配列サイズから導出 |
| **U3** | `understanding_confidence` 分布 中央値 | ≥ 0.6 | diagnostics の `understanding_confidence` を percentile 集計（p50/p25/p75） | KPI SQL: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY understanding_confidence)` |
| **U4** | latency p95 | ≤ 5s | `latency_ms.total` の p95。内訳として `latency_ms.{collect, fusion, todayReader, fairness}` も集計し遅延源を特定 | KPI SQL `PERCENTILE_CONT(0.95)` |
| **U5** | ドメイン間一貫性 | ≥ 95% | 同一ペア × 同日に Stage 1 が複数回走った場合、各 run の `personalLenses.{a,b}.coreDecisionPrinciples` を集合として Jaccard 類似度を計算。ペア毎に min-Jaccard が 0.95 以上 | `understanding_runs` テーブル（本 PR で追加 or diagnostics から再構成）を SQL で join |

**測定用クエリの置き場**: `scripts/understanding-kpis.sql`（新規、既存 `scripts/coalter-phase2-kpis.sql` とは別ファイル）

**測定期間**: M0 実装完了後、**10 pair × 3 session 程度の合成 fixture + 5 pair の実 preview 観測** で U1〜U5 を初回報告。fixture は `tests/unit/coalter/understanding/fixtures/` に置き、実 preview 観測は本カウント gate と並行で取る。

**fixture 合成**: 実ユーザーデータを使わず、Stargazer 観測・Alter lens・関係史の synthetic data を生成（M0 unit test の資材として作り、そのまま U1-U5 の baseline 計測に再利用）。

---

## 13. CEO 最終承認ポイント（この 3 点承認で実装着手）

- [ ] §12.1 変更ファイル一覧で OK（新規のみ、既存 touch 0）
- [ ] §12.2 `TwoPersonLensToday` 型定義で OK（足りないフィールドあれば指摘）
- [ ] §12.3 U1〜U5 測定方法で OK（閾値・測定方式）

承認後、`feat/coalter-three-stage` を起動し M0 着手。着手時の初手は **型定義ファイルのみを先に PR** して CEO に静的レビューしてもらう形。
