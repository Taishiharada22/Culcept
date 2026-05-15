# CoAlter Activity Domain 対象範囲 Mapping 設計 docs

**作成日**: 2026-05-15
**ステータス**: docs-only design draft、runtime / code 変更なし
**起草 branch**: `docs/coalter-activity-domain-mapping`
**前提**:
- PR #120 (`0d925e0c`、original plan completion audit v2) main 反映済
- PR #121 (`df00a8f3`、runtime integration priority decision) main 反映済
- PR #122 (`a9f27d44`、normal/daily/travel audit) main 反映済
- PR #123 (`78cf93b6`、Gap 4 production context detection design) main 反映済
- PR #124 (`fa8f301b`、Travel domain greenfield design、1-2 泊国内 MVP) main 反映済
- PR #125 (`3de29349`、Daily × Domain cross-axis dispatch design、Alt D Hybrid) main 反映済
- 候補 G-6 (Activity domain 対象範囲 mapping docs) として CEO directive 受領 (2026-05-15)

## §0 本書の position

### §0.1 目的

PR #125 で確定した Daily × Domain cross-axis dispatch (Alt D Hybrid) において、**activity は核心 use case の 1 つ** ("今日何しよう" / "暇つぶし" / "軽く出かけたい") だが、**activityOrchestrator は完全不在**。DD3 phase (DailyPlanner impl) 着手前に activity domain の **対象範囲を確定** する必要がある。

本書は実装ではなく、**Activity domain の対象範囲 mapping + MVP scope + 他 domain との境界 + 実装 phase 分解** までを範囲とする (docs-only = design completion only)。

### §0.2 Source-of-truth Hierarchy (PR #120-#125 §0.2 継承)

| Tier | 種別 | 本書での扱い |
|---|---|---|
| 1 | **main merge 済 commit / PR** | **最上位正本**、SHA + PR# + date 記録 |
| 2 | 実コード (`lib/` / `app/`) | file 存在 / type 定義 / function export を grep 実証 |
| 3 | 最新 docs | Tier 1/2 と整合する範囲で参照 |
| 4 | memory / project memory | 補助参照 |
| 5 | 古い docs / 古い handoff | Tier 1/2 で書き換えられている前提 |

### §0.3 制約再確認 (CEO directive 2026-05-15)

- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ ChatClient / UpperLayerMount / flags / ProviderSelector / movieOrchestrator / foodOrchestrator 修正
- ❌ env 変更 / Production env 変更 / Vercel deploy 操作
- ❌ Anthropic Console / Google Places / 楽天 / じゃらん 等 API key 取得 / 接続
- ❌ Supabase migration 新規追加 / 既存 migration touch
- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ 本 doc の merge (CEO 判断)
- ✅ docs-only autonomous (claude 自律進行)

---

## §1 Activity Domain とは何か

### §1.1 既存実装の状態 (一次資料)

| 要素 | 状態 | file path |
|---|---|---|
| `ConversationTheme = "activity"` 識別子 | ✅ 存在 | `lib/coalter/types.ts:245` |
| `ActivityCandidate` 型 (Phase B 2026-04-18) | ✅ 存在 | `lib/coalter/types.ts:480+` |
| `ActivityDomain = "food" \| "movie" \| "activity"` (Phase B submission domain) | ✅ 存在、**activity 部分は「将来」** | `lib/coalter/types.ts:485` |
| Phase B 三段式 framework (foodOrchestrator 等) | ✅ Phase B 1-4 完了 (food のみ実装) | `lib/coalter/foodOrchestrator.ts` 等 |
| `COALTER_U3_ABOLITION_ACTIVITY` env key | ✅ 識別子のみ | `lib/coalter/flags.ts:118` |
| **`activityOrchestrator`** | ❌ **完全不在** | (本 PR で設計、impl は別 PR) |
| Activity-specific catalog / ranker / candidate generator | ❌ 完全不在 | (本 PR で設計) |
| Activity-specific provider | ❌ 完全不在 | (本 PR で設計) |

### §1.2 既存 `ActivityCandidate` との関係 (重要な名前衝突)

**注意**: 既存 `ActivityCandidate` (Phase B 2026-04-18) は **「提案単位の wrapper 型」** であり、本書の **Activity domain (= "今日何しよう" の domain)** とは別概念:

| 概念 | 意味 | scope |
|---|---|---|
| `ActivityCandidate` (Phase B) | 提案単位の wrapper (candidateId / sourceUrl / confidence / 時間制約)、**全 domain 共通の Stage 2 wrapper** | Phase B 三段式 framework |
| `ActivityDomain` (Phase B) | 提案対象の domain enum (food/movie/activity)、**activity は将来** とコメント明記 | Phase B 三段式 framework |
| **Activity domain (本書)** | **ConversationTheme = "activity"、"今日何しよう" の核心 domain、独自 candidate / orchestrator** | **CoAlter 設計の新規 domain** |

→ 本書は **Activity domain (= "今日何しよう" 等 conversation theme)** を扱う。Phase B `ActivityCandidate` wrapper とは concept 違い、ただし **impl 時に再利用可能** (§7.1 で詳述)。

### §1.3 food / movie / travel との本質的違い

| Domain | candidate の単位 | 時間軸 | 場所軸 | 二人合意の難度 | 候補空間サイズ |
|---|---|---|---|---|---|
| **food** | 単一 item (店舗) | 単一時刻 | 単一場所 | 中 (料理選好) | 中 |
| **movie** | 単一 item (作品) | 単一時刻 | 単一場所 | 中 (ジャンル選好) | 中 |
| **travel** | 複合 graph (場所 + 移動 + 時間 + 予算) | 複数日 | 複数場所 | 高 (制約交差) | 大 |
| **activity (本書)** | **多軸 categorical entity (場所 × 時間 × cost × weather × novelty)** | **任意 (1-3 時間中心)** | **任意 (近距離中心)** | **中** | **極めて大 (residual category 風)** |

→ Activity は **「他 domain にカテゴリ化されない、それでいて user の日常選択として重要」** な領域。**残余カテゴリではなく独自定義が必要**。

### §1.4 Daily / Normal / Travel mode 内での Activity の扱い

| Presence Mode | Activity の典型 use case |
|---|---|
| **normal** | "暇なときに何しよう" (時間軸あいまい) |
| **daily** | **"今日何しよう" / "今夜何する" / "暇つぶし"** (本 PR の核心 MVP scope) |
| **travel** | "旅行先で何しよう" (= 観光、travel domain に統合可能、本 PR scope 外) |

→ MVP は **daily mode 内の activity = 軽い outing** に絞る (§3 詳述)。

### §1.5 Relationship / mediation / normal mode との混同回避

| Action / Domain | 扱い |
|---|---|
| 関係性 mediation ("最近すれ違ってる") | **Action Mode** `clarify` で処理、Activity domain は触らない |
| 関係温度調整 ("ちょっと話そう") | **Action Mode** `negotiate` or `clarify`、Activity ではない |
| Normal mode の関係話題 | Action Mode が処理、Activity ではない |
| "カフェで話そう" | food (cafe = 食事系インフラ) **先勝ち**、activity は non-food outing に絞る |
| "散歩でも行こうか" | **activity** (核心 MVP) |

→ Activity domain は **「2 人で軽く外出する系の対象」** に絞り込み、関係 mediation や conversation 自体は Action Mode に任せる。

---

## §2 Activity の対象範囲 (7 軸 Taxonomy)

### §2.1 7 軸 categorical space

| 軸 | 値 | 例 |
|---|---|---|
| **A: indoor / outdoor** | indoor / outdoor / hybrid | 美術館 (indoor) / 公園散歩 (outdoor) / shopping mall (hybrid) |
| **B: duration** | short (1h 以下) / medium (1-3h) / half-day (3-6h) | 散歩 (short) / 美術館 (medium) / 動物園 (half-day) |
| **C: cost** | free / low (~1k) / medium (1-5k) / high (5k+) | 公園 (free) / カフェ (low) / 美術館 (medium) / 演劇 (high) |
| **D: weather dependency** | weather-dependent / -independent | 花見 (依存) / 美術館 (非依存) |
| **E: pair compatibility** | solo-friendly / pair-compatible / explicitly-pair | 読書 (solo) / 散歩 (pair-compat) / cooking class (explicitly-pair) |
| **F: novelty** | routine / familiar / novelty | 馴染みの喫茶店 (routine) / 行きつけ美術館 (familiar) / 初めての街歩き (novelty) |
| **G: fatigue load** | 1 (very low) / 2 / 3 / 4 / 5 (high) | カフェ滞在 (1) / 散歩 (2) / 美術館 (3) / ハイキング (5) |

→ Activity は **7 軸の組合せで定義される複合 entity**。各 candidate は (A, B, C, D, E, F, G) を tag。

### §2.2 軸の組合せ例 (具体 candidate)

| 候補 | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| カフェ訪問 | indoor | short | low | -indep | pair-compat | routine | 1 |
| 公園散歩 | outdoor | short | free | dep | pair-compat | familiar | 2 |
| 美術館鑑賞 | indoor | medium | medium | -indep | pair-compat | novelty | 3 |
| 神社参拝 | outdoor | short | free | dep | pair-compat | familiar | 2 |
| 動物園 | outdoor | half-day | medium | dep | pair-compat | familiar | 4 |
| 映画館 | indoor | medium | medium | -indep | pair-compat | familiar | 2 |
| ボウリング | indoor | medium | low | -indep | explicitly-pair | novelty | 3 |
| 街歩き | outdoor | medium | free | dep | pair-compat | novelty | 3 |
| 演劇 / コンサート | indoor | medium | high | -indep | pair-compat | novelty | 3 |

注: 映画館は **movie domain と境界**、§4 で boundary 規則。

### §2.3 7 軸 ≠ Activity 内分類の硬直化

7 軸は **candidate scoring の input** であって、user 側に「indoor vs outdoor 選んで」と聞くものではない。Daily planner が user signal から軸を infer + filter:

- "外に出たい" → outdoor 優先
- "雨だから" → weather-independent 優先
- "疲れてる" → fatigue load 1-2 優先
- "ちょっと新しいことしたい" → novelty 優先
- "予算ない" → free / low 優先

→ Daily planner が **inferred constraints** で 7 軸 filter、candidate space 絞り込み。

---

## §3 初期 MVP 範囲

### §3.1 MVP scope 確定 (CEO directive 2026-05-15)

| 項目 | 含む | 含まない (future) |
|---|---|---|
| 時間範囲 | **1-3 時間程度** (short + medium) | half-day 以上、宿泊伴う activity |
| 場所範囲 | **近距離** (徒歩 / 短距離公共交通) | 遠出 (travel domain) |
| candidate 数 | **2-3 案** 提示 | 1 案だけ / N>3 |
| 提案数 | Daily mode 内の **軽い活動提案** | Travel mode 内 (travel に統合) |
| 予約 | **しない** | 予約 API 連携 |
| 外部 API | **MVP では必須にしない** | Google Places / TripAdvisor 接続必須 |
| Citation | **後続実装で接続** (Provider Foundation 再利用) | Citation UI 露出 (a4 phase) |
| 評価軸 | **fatigue / cost / novelty / weather** (4 軸) | 7 軸全部 (full taxonomy は future) |
| food / movie / travel に該当するもの | **各 domain に委譲** | activity 内で処理 |

### §3.2 MVP scope を絞る根拠 (deep reasoning)

| 観点 | full activity (7 軸 + half-day + 遠出) | **MVP (4 軸 + 1-3h + 近距離)** |
|---|---|---|
| 候補空間サイズ | 巨大 (residual category 風) | **限定的 (1-3h × 近距離)** |
| weather 依存処理 | 全季節 forecast 必要 | **MVP では簡易判定 (晴/雨 binary)** |
| 場所 retrieval | Google Places / OSM 必要 | **MVP では LLM 直接生成 + Web Search** |
| 予約連携 | TripAdvisor / 動物園 / 美術館 API | **しない** |
| novelty 評価 | 過去 history full tracking | **MVP では Daily 直近 N session のみ** |
| 二人合意難度 | 7 軸交差 で複雑 | **4 軸 (fatigue/cost/novelty/weather) で限定** |

→ MVP = **「Daily mode 内の軽い outing 提案 (1-3 時間、近距離、4 軸評価)」**。

---

## §4 Domain Boundary (他 domain との境界)

### §4.1 Domain Boundary Decision Tree

ambiguous な user input を Daily planner がどの domain に dispatch すべきか:

```
[user input "今日何しよう"]
    ↓
[Daily planner intent extraction]
    ↓
[Domain inferrer]
    ↓
  ┌──────────────────────────────────────────┐
  │ user input に明示 keyword あり?          │
  ├──────────────────────────────────────────┤
  │ "食べたい" / "ランチ" / "ディナー"       │ → food
  │ "映画"                                   │ → movie
  │ "旅行" / "週末出かけ" / "1 泊" / "2 泊"  │ → travel (PresenceMode escalate)
  │ "プレゼント"                             │ → gift
  │ "予定" / "空いてる"                      │ → schedule
  │ "話そう" / "すれ違い" / "話したい"       │ → Action Mode clarify / negotiate
  │                                          │
  │ 上記いずれも該当しない                   │ → activity (本書 domain)
  └──────────────────────────────────────────┘
```

### §4.2 ambiguous 解決 (progressive narrowing)

明示 keyword なし / 複数該当の場合:

| user input | 推定 domain | 解決方針 |
|---|---|---|
| "今日何しよう" | activity (ambiguous の代表) | Daily planner が time slot / weather / pair preference から activity 候補生成、user に "外出する? 家でゆっくり?" 確認 |
| "暇つぶしに何かしよう" | activity | 同上 |
| "ちょっと出かけよう" | activity | outdoor / indoor を progressive narrowing |
| "カフェで話そう" | **food (先勝ち)** | cafe = 食事系インフラ、foodOrchestrator が carry |
| "美術館か映画" | activity vs movie | user に "両方候補出す?" 確認、または 2 つ domain dispatch (multi-domain chain) |
| "本屋行きたい" | activity (shopping) | activity 内 shopping category |
| "ボウリング行こう" | activity | activity 内 entertainment category |
| "海行きたい" | activity (outdoor) or travel (遠ければ) | 距離 infer、近距離 = activity、遠距離 = travel |

### §4.3 Domain boundary 規則 (formal rules)

ambiguous 解決のための **明示ルール**:

| Rule | Domain priority |
|---|---|
| 食事 keyword 含む | **food 先勝ち** (cafe を含む) |
| 映画 keyword 含む | **movie 先勝ち** |
| 旅行 keyword + 1-2 泊以上 含む | **travel 先勝ち** (PresenceMode 切替) |
| 旅行 keyword + 日帰り含む | **activity 先勝ち** (Daily 内軽量 outing) |
| 関係話題 keyword (話そう / すれ違い等) | **Action Mode (clarify / negotiate) 先勝ち、Domain なし** |
| 上記全て該当なし | **activity** (default) |
| 複数 domain 該当 (例: "夕食 + 映画") | **multi-domain chain** (Daily Dispatch Idea 12) |

### §4.4 Handoff design (activity → 他 domain への委譲)

Daily planner が activity と判定したが、途中で他 domain 該当が判明した場合の handoff:

```
[user] "今日何しよう"
[planner] activity と推定、候補生成中
[user] "あ、お腹空いたかも"
[planner] keyword "お腹空いた" 検出 → food domain に handoff
[planner] activity request を food request に変換 (時間 / 場所 / 予算 carry-over)
[food orchestrator] foodCandidate 生成
```

→ Daily planner が **domain 横断 handoff** をサポート、user 体験の不連続性を回避。

---

## §5 人間超越設計 16 アイデア (CEO 必須 10 + claude 追加 6)

### §5.1 CEO 指定 10 アイデア

#### Idea 1: Fatigue-aware selection

activity candidate の `fatigueLoad` (1-5、§2.1 軸 G) を pair state から infer した `energyBudget` で filter。"疲れてる" signal → fatigue load 1-2 優先、過密 plan 回避。

#### Idea 2: Weather-aware fallback

weather-dependent activity (outdoor / 花見等) は天候 forecast でデフォルト reject、weather-independent (indoor 美術館等) を fallback 優先。MVP では「晴 / 雨 / 曇」の 3 値判定。

#### Idea 3: Budget sensitivity

`budgetCeiling` (DailyDomainRequest からの carry-over、PR #125 §5.2) を 4 cost band (free/low/medium/high) と照合、上限超 candidate reject。

#### Idea 4: Novelty vs comfort balance

`novelty` 軸 (routine / familiar / novelty) を **過去履歴 + user disposition** で balance:
- pair が routine 偏重なら novelty 1 案を mix
- pair が novelty 偏重なら routine 1 案 (comfort) を mix
- 50:50 で baseline

#### Idea 5: Pair fairness

`coalter_fairness_ledger` の bias_score を読み込み、連続選択で fairness 維持。例: 過去 3 回 A 寄り → 今回は B 寄り activity 優先。

#### Idea 6: Veto / Red-line constraints

`redLines` (DailyDomainRequest carry-over) を **絶対 reject filter** で適用。"アルコール避ける" → bar 系 candidate 排除、"歩きたくない" → 徒歩 5 分以上の candidate 排除。

#### Idea 7: Conflict pre-detection

per-person preferences を比較、衝突検出:
- A=outdoor / B=indoor → indoor + 屋根あり outdoor (hybrid) 案を生成
- 衝突解決困難 → Action Mode `negotiate` escalate

#### Idea 8: Explanation: なぜこの activity か

各 candidate に rationale 付加 (Idea 11 of PR #124、Daily Dispatch Idea 8 共通):
- "二人とも outdoor 好き、今日晴れ、徒歩圏内なので公園散歩を選びました"
- "前回美術館で疲れたので今回はゆっくりカフェにしました"

#### Idea 9: Plan graph 接続 (Daily Dispatch との連携)

activity 単独ではなく **graph chain** で plan を組む (Daily Dispatch Idea 9 + 12):
- "散歩 → カフェ → 帰宅"
- "美術館 → ランチ → カフェ"

activity が chain の **head / mid / tail** いずれの位置にあるか位置別 candidate 評価。

#### Idea 10: Memory continuity

過去 Daily session の activity 履歴を `pastSessions` から集約、次回 Daily で:
- 直近で routine 連発 → novelty 推奨
- 直近で fatigue 5 連発 → low fatigue 推奨
- 直近で同地域連発 → 別地域推奨

### §5.2 claude 追加 6 アイデア (人間超越強化)

#### Idea 11: Activity affinity map (時間帯 × 体力 × 天候 × 気分)

時間帯 × 体力 × 天候 × 気分 → activity candidate affinity を **4D map** で表現:

```
affinity(activity, timeSlot, energyLevel, weather, mood): number
```

各 activity candidate に **multi-dimensional affinity score** を attach、Daily planner が highest affinity top-N 選出。

#### Idea 12: Curated activity templates (community-curated patterns)

community で curated された **activity pattern templates** を built-in library として提供:
- "rainy Sunday afternoon" template (indoor + low fatigue + medium cost 候補集)
- "summer evening with friends" template (outdoor + medium fatigue + dinner combo)
- "winter cozy date" template (indoor + warm spots + cafe combo)

template matching で MVP の候補空間を **大幅縮小** (residual category 問題を解消)。

#### Idea 13: Activity novelty score

**novelty seeking** を pair preference として測定:
- past activities の novelty/routine ratio
- past activities の category 多様性
- 各 candidate に novelty score (0-1)
- novelty seeker pair → high novelty candidate 優先
- comfort seeker pair → routine candidate 優先

#### Idea 14: Local-knowledge gap detection

user の知っている店 vs 知らない店を区別:
- 過去訪問 history (memory items) を読む
- 「知らない」activity の surprise factor を評価
- "新しい店" / "新しい場所" を望むときに optimal な candidate
- novelty seeker pair に local-knowledge gap candidate 提示

#### Idea 15: Activity composition with other domains (chain examples)

activity を他 domain と組合せる pattern library:
- "**散歩 + カフェ**" = activity → food (低 cognitive load)
- "**美術館 + ランチ**" = activity → food (medium fatigue)
- "**動物園 + ディナー + 映画**" = activity → food → movie (high cognitive load、graph chain 3 stage)
- "**カフェ + 散歩**" = food → activity (food 先発)

Daily plan composition library (PR #125 Idea 17) で activity 含む patterns を提供。

#### Idea 16: Cognitive load per activity type

activity の **cognitive load** (= 認知負荷) を tag:
- 新地 (新しい場所) = 高 cognitive load
- 馴染み地 = 低 cognitive load
- 新店 (新しい店) = 中 cognitive load
- 馴染み店 = 低 cognitive load

`recentHistory` で疲労蓄積判定、cognitive load 高すぎなら避ける。Fatigue load (Idea 1) とは別軸 (体力 vs 認知)。

---

## §6 Data Source Strategy

### §6.1 Data source 比較 5 軸

| Source | 提供データ | API key 必要 | ToS 確認 | pricing | MVP 適合 |
|---|---|---|---|---|---|
| **Anthropic Web Search** | 一般情報 (場所 / 観光 / 活動) | ✅ (movie で取得済) | 確認済 | usage-based | **★MVP 中心** |
| **LLM 直接生成** | 知識ベース + 創造的提案 | (API key 既存) | N/A | usage-based | **MVP fallback + creative source** |
| **Local curated categories** | built-in activity template library (Idea 12) | ❌ 不要 | N/A | 無料 | **MVP supplement (template matching)** |
| Google Places | 場所詳細 (営業時間 / レビュー / 写真) | ❌ 未取得 | 確認要 | per-request | future Phase |
| OpenStreetMap | 地理 / 経路 | ❌ 不要 | OSM 互換 | 無料 | future Phase |
| TripAdvisor | 観光 (口コミ) | ❌ 未取得 | ToS 厳密 | API tier | future Phase |
| OpenAI / EXA | web 情報 (alternative) | future | future | future | future (Provider Foundation 拡張先) |

### §6.2 MVP data source 推奨

**3 source 混合**:
1. **Anthropic Web Search** (movie で実績、Provider Foundation 経由) - **primary**
2. **LLM 直接生成** (Anthropic chat completion で creative 提案) - **fallback + creative**
3. **Local curated categories** (built-in template library) - **template matching**

→ API key 取得 / 接続なしで MVP 起動可能。

### §6.3 API key 取得は本書 scope 外

本書では API 接続しない。Google Places / TripAdvisor は **future / CEO decision required** に分類。

---

## §7 Daily × Domain Dispatch (PR #125) との関係

### §7.1 `DailyDomainRequest(domain=activity)` の受け口

PR #125 §5.2 で定義した `DailyDomainRequest` を activity orchestrator が受領:

```typescript
// PR #125 で定義済
const request: DailyDomainRequest = {
  domain: "activity",
  dailyContext: { timeSlot, targetDate, isWeekend, pairAvailability },
  constraints: { budgetCeiling, timeWindow, energyBudget, redLines },
  chainPosition: { index, total, prevDomain },
  fairnessHints: { recentBias, cooldownDomains },
  inferRationale: { confidence, signals, alternates },
};
```

`activityOrchestrator(request)` を **AD3 phase** で実装。

### §7.2 既存 `ActivityCandidate` (Phase B) との関係

Phase B `ActivityCandidate` wrapper を Activity domain でも再利用可能:

```typescript
// Phase B 既存 (lib/coalter/types.ts:480+)
ActivityCandidate {
  candidateId, sourceUrl, sourceDomain, confidence, 時間制約, ...
}

// Activity domain MVP 拡張 (AD1 phase で設計確定)
ActivityCandidate & {
  activityTaxonomy: { indoor, duration, cost, weather, pair, novelty, fatigue }; // §2.1 7 軸
  rationale: { perPerson, synthesis };
  affinity: { byTimeSlot, byEnergy, byWeather, byMood };
}
```

→ Phase B wrapper を **既存資源として再利用**、追加 field のみ activity-specific 拡張。

### §7.3 DomainRouter (PR #125) との接続

DomainRouter (PR #125 §5.3) の `deps.activityOrch` を AD3 phase で実装後 wire:

```typescript
const deps: DomainRouterDeps = {
  movieOrch: movieOrchestrator,
  foodOrch: foodOrchestrator,
  travelOrch: travelOrchestrator,  // PR #124 T3 phase で impl
  activityOrch: activityOrchestrator, // ← AD3 phase で impl、本書設計 target
  scheduleOrch: undefined,
  giftOrch: undefined,
};
```

### §7.4 Gap 4 (PR #123) との関係

Gap 4 の 7 fields は Activity domain 内 candidate ranking で reuse 可能:

| Gap 4 field | Activity domain での利用 |
|---|---|
| `infoMissing` | Activity 候補不足検知 → template fallback / 他 domain handoff 提案 |
| `uncertaintyHigh` | candidate confidence 低 → user 確認 prompt |
| `oneSidedFatigue` | Cross-domain fairness 反映 (Idea 5) |
| `relationshipNoiseHigh` | activity の novelty 抑制 (familiar 優先で cognitive load 下げる) |

→ Gap 4 完成後 (D5 `observe` 以降) に activity orchestrator が Gap 4 signal を input として受領する hook を追加 (additive、AD3 phase 設計余地)。

### §7.5 Travel / Food / Movie との handoff (再掲)

§4.4 Handoff design 参照。activity → 他 domain への handoff は Daily planner が制御。

---

## §8 実装 Phase (AD0-AD6)

### §8.1 Phase 一覧

| Phase | 内容 | files likely touched | tests | CEO 承認 | risk | rollback |
|---|---|---|---|---|---|---|
| **AD0** (本 PR) | docs-only design | `docs/` 1 file | N/A | merge 判断 | 0 | 本 PR revert |
| **AD1** | Activity taxonomy / types (TypeScript types only) | `lib/coalter/activity/types.ts` (新規) | unit test on type | 承認 | 低 | file 削除 |
| **AD2** | Activity intent / slot extraction | `lib/coalter/activity/intent.ts` (新規) + Stage 1 拡張 | unit test on intent + integration | 承認 | 中 | flag OFF |
| **AD3** | Activity candidate generator + scorer | `lib/coalter/activity/orchestrator.ts` + `candidatePool.ts` + `templateLibrary.ts` + provider | unit + integration test | 承認 | 中 | flag OFF |
| **AD4** | Scorer / fairness / multi-axis ranking | `lib/coalter/activity/ranker.ts` + `lib/coalter/activity/fairnessScorer.ts` (新規) | unit test、fairness ledger integration | 承認 | 中 | flag OFF |
| **AD5** | UI presentation (activity card / explanation) | `components/coalter/ActivityCard.tsx` 等 | UI test | 承認 + Product Unit | 中 | UI 別 route |
| **AD6** | Production observation (Step E 統合、mode enum) | telemetry + feature flag | observability test | **CEO 戦略判断** | 大 | mode enum |

### §8.2 各 Phase の詳細

#### AD1 (Activity taxonomy / types)

新規 file 1 個 (`lib/coalter/activity/types.ts`):
- `ActivityTaxonomy` 型 (§2.1 7 軸)
- `ActivityCandidate` 拡張 (§7.2 参照)
- `ActivityRationale` (per-person + synthesis)
- `ActivityAffinity` (4D map)
- `ActivityTemplate` (curated template library)
- `ActivityIntent` (user intent から extracted)

#### AD2 (Activity intent / slot extraction)

Stage 1 Understand bundle に activity-specific slots 追加:
- activityType inferred (indoor/outdoor/hybrid)
- durationPreference (short/medium/half-day)
- noveltyPreference (routine/familiar/novelty)
- weatherTolerance (dependent/independent acceptable)
- moodKeyword (relaxed / energetic / curious 等)

per-person 抽出 → conflict pre-detection (Idea 7)。

#### AD3 (Activity candidate generator + scorer)

Stage 2 Curate (activity-specific):
- Anthropic Web Search で candidate source 収集
- LLM 直接生成 (creative 提案)
- Local curated templates (Idea 12) で template matching
- 7 軸 categorical filter
- 4 軸 (fatigue/cost/novelty/weather) 評価

#### AD4 (Scorer / fairness / multi-axis ranking)

- `fairnessScorer` (Pair fairness、Idea 5)
- `noveltyScorer` (Novelty vs comfort balance、Idea 4)
- `cognitiveLoadScorer` (Idea 16)
- multi-axis ranking → 2-3 candidate Pareto 最適選出

#### AD5 (UI presentation)

Product Unit 連携:
- ActivityCard (single candidate)
- ActivityChainView (multi-domain chain、PR #125 Idea 12 連携)
- ActivityExplanation (Idea 8 rationale 表示)
- Pareto axis visualization (cost / fatigue / novelty)

#### AD6 (Production observation + mode enum)

Gap 4 / Travel / Daily Dispatch と同 mode enum 設計:

```
COALTER_ACTIVITY_DOMAIN_MODE = "off" | "observe" | "live"
```

3-stage rollout、Step E rollout pattern と直接 mapping。

---

## §9 まだやらない (本 PR scope 外)

### §9.1 runtime / production 操作

- ❌ Activity domain 実装着手 (AD1-AD6、各別 PR)
- ❌ `lib/coalter/activity/` ディレクトリ作成
- ❌ `lib/coalter/types.ts` への Activity types 追加
- ❌ `coalterDispatch.ts` 修正 (Activity path 追加は AD3 別 PR)
- ❌ Domain orchestrator (movie/food/travel) の修正
- ❌ Daily UI 新規実装 (AD5 phase 別 PR)
- ❌ `flags.ts` 新規 env mode enum 追加 (`COALTER_ACTIVITY_DOMAIN_MODE`、AD6 phase 別 PR)

### §9.2 既存 file touch

- ❌ `lib/coalter/**` 全 file touch
- ❌ `lib/coalter/movie/**` / `lib/coalter/foodOrchestrator.ts` 等 全 touch
- ❌ `lib/coalter/presence/**` 全 touch
- ❌ ChatClient / UpperLayerMount / ModeSwitcher / 既存 components touch
- ❌ `lib/coalter/flags.ts` 既存 flag touch
- ❌ `lib/coalter/types.ts` 既存 type touch (Phase B `ActivityCandidate` / `ActivityDomain` 等)

### §9.3 production / env / API

- ❌ env 変更 / Production env 変更 / Vercel deploy 操作
- ❌ Anthropic Console / Google Places / TripAdvisor 等 API key 取得
- ❌ Supabase migration / API key / 実 API call

### §9.4 別領域 (CEO directive 2026-05-15)

- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ movieOrchestrator / foodOrchestrator / ProviderSelector / flags 修正
- ❌ Travel domain T1-T7 着手 (PR #124 別 phase)
- ❌ Gap 4 detector D2-D7 着手 (PR #123 別 phase)
- ❌ Daily Dispatch DD1-DD6 着手 (PR #125 別 phase、ただし DD3 は本 PR 完了が前提条件)
- ❌ reflect mode 着手 (Phase 3 後送り)
- ❌ 本 doc の merge (CEO 判断)

### §9.5 Activity future scope (本 MVP 外)

- ❌ half-day 以上の activity (4 時間以上)
- ❌ 遠出 activity (travel domain に統合)
- ❌ Google Places / OpenStreetMap / TripAdvisor 接続
- ❌ 天候 forecast API 接続 (MVP では晴/雨 binary)
- ❌ 予約連携 (動物園 / 美術館 / イベント等)
- ❌ Schedule / Gift domain との handoff (頻度低、future)

---

## §10 推奨結論

### §10.1 最終推奨案

CEO directive + GPT 推奨 + claude deep reasoning による結論:

| 軸 | 推奨 | 根拠 |
|---|---|---|
| **Scope** | **Daily mode 内軽量 outing (1-3h、近距離、2-3 案)** | CEO 確定、core MVP focus |
| **Taxonomy** | **7 軸 categorical space** (indoor/outdoor × duration × cost × weather × pair × novelty × fatigue) | 残余カテゴリ問題を構造化解消、scoring input として活用 |
| **MVP 評価軸** | **4 軸 (fatigue / cost / novelty / weather)** | 候補空間絞り込み、二人合意難度抑制 |
| **Domain boundary** | **food / movie 先勝ち、関係話題は Action Mode 任せ、他は activity** | 明示 keyword で routing、ambiguous 解決 progressive narrowing |
| **Data source (MVP)** | **Anthropic Web Search + LLM 直接生成 + Local curated templates** | API key 取得不要、Provider Foundation 再利用、template matching で候補空間縮小 |
| **既存 `ActivityCandidate` 再利用** | **Phase B wrapper を base、activity-specific 拡張のみ追加** | 既存資源活用、互換性維持 |
| **rollout 戦略** | **Gap 4 / Travel / Daily Dispatch と同 mode enum 3-stage** | 4 PR で統一 rollout 設計、運用 simple |
| **DD3 phase との連動** | **AD1-AD3 完了が DD3 (DailyPlanner impl) の前提条件** | activity orchestrator 不在では Daily planner が dispatch しても fallback、実質機能薄維持 |

### §10.2 人間超越設計 16 アイデア 全組込

CEO 必須 10 + claude 追加 6 = 全 16 アイデアを MVP 設計に組込:

- **Routing / Filter**: Fatigue-aware (1) / Weather-aware (2) / Budget sensitivity (3) / Affinity map (11)
- **Balance**: Novelty vs comfort (4) / Novelty score (13)
- **Fairness**: Pair fairness (5) / Veto / Red-line (6) / Conflict pre-detection (7)
- **UX**: Explanation (8) / Plan graph 接続 (9) / Activity composition (15)
- **History**: Memory continuity (10) / Local-knowledge gap (14)
- **Templates**: Curated templates (12)
- **Cognitive**: Cognitive load (16)

→ 既存 activity app (じゃらん遊び / Holiday / Tabelog 体験) には **存在しない 16 機能 (設計レベル)**。CoAlter Activity = **「2 人の軽い outing 合意形成に特化した人間超越設計」** を実現 (**runtime 実装は未**)。

### §10.3 期待される CoAlter 全体寄与 (CEO 補正反映、design vs runtime 分離)

**重要 (PR #125 §11.3 補正継承)**: 本 PR は **docs-only = design completion only**。下記は **「設計上の未整理項目」** が減少することを指し、**実装完了 (runtime completion) ではない**。

| 領域 | 設計レベル状態変化 | runtime impl 状態 |
|---|---|---|
| Activity domain 範囲 mapping | ❌ → ✅ (本 PR で design completion) | **runtime 未実装** (AD1-AD6 別 PR で着手) |
| Daily Dispatch DD3 phase 前提条件 | ❌ (activity 範囲不明) → ✅ (範囲確定、DD3 設計依存解決) | runtime 未実装 |
| Daily mode "今日何しよう" use case 設計 | ⚪ → ⚠ 設計上の道筋確定 | runtime 未実装、AD1-AD6 完了が前提 |

→ **設計上の未整理項目**: 12 件 → 11 件 (本 PR で 1 件減少、Travel 完了 + Daily Dispatch 完了 + Gap 4 D7 + 本 Activity 完了で **6 件**まで減少可能)。**ただし runtime 完了件数は不変** (impl は全て future PR 待ち)。

**docs-only PR の正しい寄与解釈**: design path を構造化することで CEO 戦略判断 / 後続 impl PR の前提を整える。runtime user reach / 機能完了は **本 PR の範囲外**。

---

## §11 verify 結果 + CEO 判断請求

### §11.1 verify 結果 (8 項目)

本 commit 前自己確認:

| # | 項目 | 結果 |
|---|---|---|
| 1 | docs-only | ✅ `docs/coalter-activity-domain-mapping.md` 1 file 追加のみ |
| 2 | lib touch 0 | ✅ |
| 3 | src touch 0 | ✅ |
| 4 | tests touch 0 | ✅ |
| 5 | package touch 0 | ✅ |
| 6 | supabase/migrations touch 0 | ✅ |
| 7 | Alter Morning 実 path touch 0 | ✅ (本 file 内 言及は本 verify 行 meta-reference のみ) |
| 8 | secrets 値 露出 0 | ✅ (env var 名 reference のみ、actual value なし) |

### §11.2 CEO 判断請求事項 (6 項)

1. **本 doc の merge 判断**
2. **MVP scope 確定** — Daily mode 内軽量 outing (1-3h、近距離、4 軸評価)、2-3 案、API 予約連携 future
3. **7 軸 Taxonomy 承認** — indoor/outdoor × duration × cost × weather × pair × novelty × fatigue の 7 軸 categorical space
4. **Domain boundary 規則承認** — food / movie / travel 先勝ち、関係話題は Action Mode、ambiguous は activity default
5. **AD1 (Activity taxonomy / types) 着手 timing 判断** — 本 doc merge 後の next phase 着手承認 + **DD3 (Daily Dispatch DailyPlanner impl) の前提条件としての先行着手承認**
6. **Step E / Gap 4 / Travel / Daily / Activity 五者の rollout 統合戦略** — 全 domain で同 mode enum 設計 (`off`/`observe`/`live`) を共有する方針承認

### §11.3 次の docs-only autonomous 候補 (本 doc merge 後)

PR #122 §8.1 で挙げた残候補:

| # | 候補 | Activity domain との関係 |
|---|---|---|
| G-4 | L4-m legacy 退役 status audit docs | 独立、軽量並列可 |
| G-5 | Reflect mode Phase 3 pre-review docs | 独立、Phase 3 開始判断材料 |
| F-2 | D-2-e3-b/c/d/e audit docs | movie path 補完、独立 |
| F-5 | PR #102 scaffold + PR #110-#119 関係 audit docs | movie Path α vs β 判断、独立 |

→ G-2 / G-3 / G-6 完了で **Domain greenfield + cross-axis dispatch + Activity scope** の 3 大 docs-only design 完了。次は軽量 audit 系 (G-4 / G-5 / F-2 / F-5) で残未整理項目を潰す phase。

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
