# CoAlter Travel Domain Greenfield Architecture 設計 docs

**作成日**: 2026-05-15
**ステータス**: docs-only design draft、runtime / code 変更なし
**起草 branch**: `docs/coalter-travel-domain-greenfield-design`
**前提**:
- PR #120 (`0d925e0c`、original plan completion audit v2) main 反映済
- PR #121 (`df00a8f3`、runtime integration priority decision) main 反映済
- PR #122 (`a9f27d44`、normal/daily/travel audit) main 反映済
- PR #123 (`78cf93b6`、Gap 4 production context detection design) main 反映済
- 候補 G-2 (Travel domain greenfield design docs) として CEO directive 受領 (2026-05-15)
- CEO 補正: **初期 MVP は 1〜2 泊の国内旅行に限定、海外旅行は当面先**

## §0 本書の position

### §0.1 目的

CoAlter 全体完了に向けて、movie / food 以外の **大きな未実装領域である Travel domain** の元設計 / MVP 範囲 / 実装順序 / 依存関係を確定する。本書は実装ではなく、**Travel domain 全体の greenfield design**確定 + MVP scope 確定 + phase 分解までを範囲とする。

PR #122 §1.3 / §2.3 で確認:
- `lib/coalter/` に **travel-specific orchestration / retrieval / candidate model 一切なし** (movie / food より深刻)
- preview には S0-S8 Travel mock 完了 (`app/(dev)/coalter-preview/upper-layer/components/modes/travel/`)
- modeReducer / modeEscalationDetector / ModeSwitcher で Travel mode 切替は **production code 完了**、ただし domain body 不在

→ **Travel domain = lib に impl が一切ない、純粋 greenfield**。

### §0.2 Source-of-truth Hierarchy (PR #120 §0.2 + PR #122 §0.2 + PR #123 §0.2 継承)

| Tier | 種別 | 本書での扱い |
|---|---|---|
| 1 | **main merge 済 commit / PR** | **最上位正本**、SHA + PR# + date 記録 |
| 2 | 実コード (`lib/` / `app/`) | file 存在 / type 定義 / function export を grep 実証 |
| 3 | 最新 docs | Tier 1/2 と整合する範囲で参照 |
| 4 | memory / project memory | 補助参照 |
| 5 | 古い docs / 古い handoff | Tier 1/2 で書き換えられている前提 |

**衝突時の rule**: 古い doc が「未着手」と書いていても main 反映 commit がある場合は main を優先 (PR #120 で発生した「Step D-1 未着手」誤判定の再発防止)。

### §0.3 制約再確認 (CEO directive 2026-05-15)

- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ ChatClient / UpperLayerMount / flags / ProviderSelector / movieOrchestrator 修正
- ❌ env 変更 / Production env 変更 / Vercel deploy 操作
- ❌ Anthropic Console / Google Places / 楽天 / じゃらん 等 API key 取得 / 接続
- ❌ Supabase migration 新規追加 / 既存 migration touch
- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ 本 doc の merge (CEO 判断)
- ❌ **任意期間旅行 / 海外旅行 / 宿泊・交通 API 予約連携** は本 MVP scope 外 (future)
- ✅ docs-only autonomous (claude 自律進行)

---

## §1 Travel domain の位置づけ

### §1.1 CoAlter 既定 5 領域の中の Travel

**正本**: `docs/coalter-master-design.md` §1 + PR #120 audit v2

CoAlter Master Design §1 で対象領域として明示:
1. 共同意思決定 (映画、食事、**旅行**、予定調整、プレゼント)
2. すれ違い整理
3. 関係温度調整
4. 共同の振り返り (Phase 3 reflect)
5. 折衷案の生成

→ **旅行は CoAlter 既定 5 領域の 1 つ**、Stargazer pivot ではなく **CoAlter 内 native domain**。

### §1.2 現状実装の不在

| 要素 | 状態 | 根拠 |
|---|---|---|
| `lib/coalter/travel/` ディレクトリ | ❌ **完全不在** | `ls lib/coalter/` で `travel/` ディレクトリなし |
| `lib/coalter/travel*.ts` flat file | ❌ **完全不在** | food のような flat 配置もなし |
| Travel-specific provider | ❌ 完全不在 | `lib/coalter/movie/providers/` に movie 用しかない |
| Travel-specific candidate type | ❌ 完全不在 | `lib/coalter/types.ts` に Travel candidate 型なし |
| Travel U3 abolition env key | ✅ 識別子だけ存在 (`COALTER_U3_ABOLITION_TRAVEL`) | `lib/coalter/flags.ts:274` |
| PresenceMode `"travel"` | ✅ 識別子のみ | `lib/coalter/presence/types.ts:56` |
| Travel mode UI / state machine | ✅ Stage 4 production deploy 済 (PR #95) | ModeSwitcher / AutoEscalationBanner / ModeReturnPrompt / S0-S8 mock |

→ **「UI ガワは production にあるが、中身が空」状態**。

### §1.3 CoAlter Travel は単なる旅行検索ではない

**重要 (CEO 設計思想 整合)**:

CoAlter Travel は **「2 人の合意形成 + 制約調整 + 行程提案」の関係性支援 OS**。`じゃらん` / `楽天トラベル` / Google Map のような **単一 user 向け旅行検索とは本質的に別物**。

| 一般旅行検索 | CoAlter Travel |
|---|---|
| 1 user の希望反映 | 2 人の合意形成 (Master Design 原則 1 翻訳者) |
| 候補リスト提示 | 行程案 2-3 を **比較形式**で提示、議論を起こす |
| 価格最適化 | **時系列公平性**反映 (日 1 A 寄り / 日 2 B 寄り) |
| 単一 itinerary | **Pareto 最適 trip variants** (安いが遠い / 近いが高い 等) |
| 予約完結 | 予約は user 側、CoAlter は「合意までの議論支援」(MVP scope) |

---

## §2 Travel の構造的特殊性

### §2.1 movie / food との質的差異

PR #122 §B で先行発見、本 §2 で詳述:

| 特性 | movie | food | **travel** |
|---|---|---|---|
| candidate の単位 | 単一 item (作品) | 単一 item (店舗) | **複合 graph (場所 + 移動 + 時間 + 予算)** |
| 時間軸 | 単一時刻 (上映) | 単一時刻 (来店) | **複数日 / 時系列構造** |
| 場所軸 | 単一場所 (劇場) | 単一場所 (店舗) | **複数場所 (経路)** |
| 予算軸 | 比較的固定 | 比較的固定 | **大規模変動 (日帰り 1 万 vs 2 泊 5 万 vs 海外 30 万)** |
| 二人合意難度 | 中 (ジャンル選好) | 中 (料理選好) | **高 (時間 + 予算 + 距離 + 体力 + 天候 の交差制約)** |
| 既存 retrieval source | 映画 API (TMDB 等) + Web | tabelog / retty | **多様 (場所 + 宿 + 交通 + 食事 が並走)** |
| Curate 単位 | 1 候補 (top pick) | 1 候補 (top pick) | **複数候補 (2-3 plan、比較形式)** |
| Resolve 単位 | 詳細表示 | 予約準備 | **議論を経た合意確定** |

### §2.2 candidate = itinerary graph

travel candidate は **「点」ではなく「graph」**:

```
[Day 1]                         [Day 2]
  ├─ 09:00 出発 (東京駅)            ├─ 08:00 朝食 (宿)
  ├─ 11:30 到着 (温泉地)            ├─ 10:00 観光 (神社)
  ├─ 12:00 昼食 (郷土料理)          ├─ 12:00 昼食 (蕎麦)
  ├─ 14:00 観光 (滝)                ├─ 14:00 帰路出発
  ├─ 16:00 チェックイン (宿)        └─ 17:00 到着 (東京駅)
  ├─ 18:00 温泉
  └─ 19:00 夕食
```

各ノード = (時刻, 場所, 活動種別, 予算, 体力負荷)。
各エッジ = 移動 (手段, 所要時間, 費用)。

→ **Itinerary Graph** が travel candidate の native 表現。

### §2.3 制約空間 (Constraint Space)

travel candidate には **多軸制約** が交差:

| 制約軸 | 例 | 衝突パターン |
|---|---|---|
| 時間 | 出発・帰宅時刻、活動時間枠 | A=朝型 vs B=夜型 |
| 予算 | 総予算、項目別配分 | A=節約 vs B=贅沢 |
| 距離 | 移動範囲、累積移動時間 | A=近場 vs B=遠出 |
| 体力 | 1 日の歩行量、活動密度 | A=ゆっくり vs B=詰め込み |
| 天候 | 雨天時 fallback、季節依存 | (制御外、結果対応) |
| 好み | 文化系 / 自然系 / 食 / 温泉 | A=美術館 vs B=登山 |
| 混雑 | 観光地混雑度、SNS 映え混雑 | A=人気 vs B=穴場 |

→ **constraint satisfaction problem** として candidate 生成可能。

---

## §3 初期 MVP 範囲 (1〜2 泊国内旅行、CEO 確定)

### §3.1 MVP scope 確定 (CEO directive 2026-05-15)

| 項目 | 含む | 含まない (future) |
|---|---|---|
| 日数 | **1 泊 2 日 / 2 泊 3 日** | 日帰り / 3 泊以上 / 任意期間 |
| 地域 | **国内** | 海外旅行 |
| 行程詳細度 | **ざっくり行程案 (時間 + 場所 + 活動 ベース)** | 分単位精密、宿泊・交通の確定予約 |
| candidate 数 | **2〜3 案 提示** | 1 案だけ / N 案 (N>3) 大量提示 |
| 比較軸 | **予算帯 / 移動負荷 / 体験タイプ** | 詳細項目 (天候 forecast / 混雑予測 等) |
| 外部 API | **初期 MVP では必須にしない** | Google Places / 楽天 / じゃらん 接続必須 |
| Citation / source | **後続実装で接続** (Provider Foundation 再利用) | Citation UI 露出 (a4 phase) |
| 予約 | **しない** (合意までの議論支援に専念) | API 予約連携 |

### §3.2 MVP scope を絞る根拠 (deep reasoning)

**1-2 泊国内に絞ることの構造的優位性**:

| 観点 | 任意期間/海外 | **1-2 泊国内 (MVP)** |
|---|---|---|
| Itinerary graph 複雑度 | 制限なし | max ~6 ノード (1 日 2-3 場所訪問想定) |
| 通貨 / 言語 | 複数通貨 / 言語 / 為替リスク | **円 / 日本語統一** |
| 移動手段 | 国際線 / 鉄道 / バス / 車 + 多様 | **電車・バス・車・国内便 限定** |
| パスポート / ビザ | 必要 | **不要** |
| 宿泊予約パターン | 国別多様 (Booking.com / Airbnb 等) | **国内宿泊サイト想定可** |
| Citation source 多様性 | 多言語 / 信頼度ばらつき | **日本語 source 中心、信頼度判定容易** |
| 制約空間サイズ | 巨大 (組合せ爆発) | **限定的** |
| Greenfield design 焦点 | 分散 | **集中可能** |

→ MVP として 1-2 泊国内 = **複雑度が大幅減少、greenfield design の焦点絞り込み度が極めて高い**。

---

## §4 Scope 比較

### §4.1 Scope A-D 比較

| Scope | 内容 | 工数 | CoAlter 完了寄与 | risk | 初期 MVP 適性 |
|---|---|---|---|---|---|
| **A** (日帰り) | 1 日のみ、日帰り旅行 | 小 | 小 (movie/food と差が薄い) | 低 | △ (movie/food 既存設計とのoverlap 多、独自価値薄) |
| **B** (1-2 泊国内、推奨) | 1 泊 2 日 / 2 泊 3 日 国内旅行 | 中 | **大** (Travel ドメイン本領発揮 + 制約空間限定) | 中 | **★最適** (CEO 確定) |
| **C** (任意期間国内) | 3 泊以上 / 長期 国内旅行 | 大 | 大 (B の延長) | 中〜高 (graph 複雑度増、制約緩和必要) | × (greenfield 過大) |
| **D** (海外 + 予約連携) | 海外旅行 + 宿泊・交通 API 予約 | 大 | 大 (但 MVP として過大) | 高 (legal / API ToS / 通貨 / 言語) | × (CEO 明示 future) |

### §4.2 Scope B 選択の根拠

1. **CoAlter 設計思想整合**: 2 人合意形成の本領発揮できる行程複雑度 (1 候補生成では足りない、N 候補比較が意味を持つ)
2. **既存資源との連続性**: movie / food と同じ「Stage 1 → Stage 2 → Stage 3」三段式踏襲可能、本質的に同 architecture
3. **MVP 価値**: 1-2 泊 = 多くの user が「次の週末どこ行く?」と話す日常 use case、CoAlter native fit
4. **future 拡張余地**: B が完了後、C (任意期間) → D (海外) へ自然拡張可能、design が future-proof

---

## §5 三段式 Approach 比較

### §5.1 Approach α-δ 比較

| Approach | Understand | Curate | Resolve | 適合性 |
|---|---|---|---|---|
| **Travel-α** (movie 三段式踏襲) | 共通 Stage 1 | 1 候補生成 (top pick) | Resolve で詳細 | 不適合 (travel 本質= 複数案比較、1 候補では議論起きない) |
| **Travel-β** (Travel 専用 slots + 複数案比較、推奨) | Stage 1 拡張 (旅行特有 slots) | **複数案 (2-3) 生成 + 比較情報** | **議論を経た合意確定** | **★推奨** |
| **Travel-γ** (反復改善型) | 旅行 Stage 1 | Stage 2 反復改善 (iteration) | (Resolve 統合) | 不適合 (議論プロセスを iteration に押し付ける、二人の対話を阻害) |
| **Travel-δ** (4 段式、Stage 0 追加) | Stage 0 旅行宣言検出 + Stage 1-3 | Curate + Resolve | 行程確定 | 検討余地あり、ただし Stage 0 は Action Mode の clarify で代替可能 |

### §5.2 Travel-β 推奨の根拠

1. **複数案 (2-3) 提示** = travel native UX (1 案だと議論起きない、N>3 だと選択疲れ)
2. **Curate stage で比較情報併設** = 「予算帯 / 移動負荷 / 体験タイプ」軸での比較が二人の議論を起こす
3. **Resolve = 合意確定** = movie/food の Resolve (詳細表示/予約準備) と意味的に異なる、travel ならではの段
4. **movie 三段式 scaffold 構造の踏襲可能** = queryDerivation / candidatePool / curator / resolver パターンを Travel-specific 拡張で再利用
5. **Travel-δ Stage 0 追加 vs β** = Stage 0 は実は Action Mode clarify (「旅行行きたい?」「いつ?」「誰と?」)で代替可能、新 stage 増設不要

→ **Travel-β + clarify mode 連携** で 4-stage 構造の機能を実現しつつ、stage 数は 3 に抑える。

---

## §6 人間超越設計 18 アイデア

CEO 必須 11 + claude 追加 7 = 18 アイデアを Travel-β 設計に組込。

### §6.1 CEO 指定 11 アイデア

#### Idea 1: Itinerary Graph

candidate を **graph** (場所 + 移動 + 時間 + 活動) で表現。各ノード = (時刻, 場所, 活動種別, 予算, 体力負荷)、各エッジ = 移動 (手段, 所要時間, 費用)。

**実装方針**: `TravelItinerary` 型を **DAG (有向非循環 graph)** として定義 (time axis 沿い)。

#### Idea 2: Constraint Satisfaction

Curate stage で **CSP (Constraint Satisfaction Problem)** として candidate 生成。soft / hard / red-line 制約を層別化、violation を chain rerank。

**実装方針**: 候補生成 → constraint check → violation 数 + severity で rank。

#### Idea 3: Pareto Optimal Trip Variants

candidate を 1 つではなく **Pareto 最適集合** で提示 (「安いが遠い」/「近いが高い」/「ゆっくり vs 詰め込み」)、二人が trade-off 議論可能。

**実装方針**: 各軸 (cost / distance / fatigue / experience type) で dominate されない 2-3 案を選出。

#### Idea 4: Sequential Fairness (時系列公平性)

旅行は複数日にわたるため、「日 1 は A 寄り / 日 2 は B 寄り」の **時系列公平性** を反映。Master Design §3 原則 3 の本領発揮。

**実装方針**: `coalter_fairness_ledger` table を Travel session 単位で読み込み、過去の bias_score を Curate に折込。

#### Idea 5: Veto / Red-line Constraints

制約に **層別**: red-line (絶対不可、例 \"金額上限\")、hard (満たすべき、例 \"出発時刻\")、soft (望ましい、例 \"温泉あり\")、preference (考慮、例 \"和食寄り\")。

**実装方針**: `TravelConstraint` 型に `severity: "red_line" | "hard" | "soft" | "preference"` を持たせる。

#### Idea 6: Fatigue-aware Planning

各活動に **体力負荷**を tag、1 日累積体力を計算、過密 plan を自動回避。

**実装方針**: 活動辞書に `fatigueLoad: 1-5` を tag、1 日累積上限を constraint 化。

#### Idea 7: Budget-risk Bands

予算を **bands** (\"~2 万 / ~5 万 / ~10 万\") で扱う、point estimate ではない。citation 情報も band で評価 (\"宿泊 ~1.5-2 万\")。

**実装方針**: 各 candidate に `budgetBand: { lo: number; hi: number; confidence: number }` を持たせる。

#### Idea 8: Uncertainty Labeling

各 candidate 情報の **uncertainty** を明示 (\"信頼度高 / 中 / 低\")。Citation 多 + retrieval 確実 = 高、LLM 推定 = 低。

**実装方針**: 各 field に `uncertainty: 0-1` を tag、UI で可視化。

#### Idea 9: Progressive Narrowing

ふわっとした希望 → 段階的に範囲を絞る。Curate stage 内で **多段階 narrowing**:
- 候補地域 (5-10) → 候補日 (2-3) → 候補 plan (2-3) → 合意

**実装方針**: Curate stage を sub-phase 化、各段で user input を待つ。

#### Idea 10: Conflict Explanation

「なぜこの案を提示したか」を **自然言語で説明**。「A さんが温泉希望、B さんが歴史希望なので、温泉 + 歴史地区両方ある城下町を選びました」のような。

**実装方針**: 各 candidate に `rationale: { perPerson: { userId, why }[], synthesis: string }` を持たせる。

#### Idea 11: 説明可能性 (Explainability)

各 ranking / 選定理由を **構造化説明** (rationale chain) で保持、user が「なぜ?」と聞けば回答可能。

**実装方針**: candidate 内に `decisionTrace: { step, reason, source }[]` を embed。

### §6.2 claude 追加 7 アイデア (人間超越強化)

#### Idea 12: Temporal Compatibility Map

**「時間軸 compatibility」** = 1 日目朝は A 寄り / 1 日目午後は B 寄り / 2 日目朝は B 寄り 等、**時間 cell × 個人 preference** を 2D map で扱う (Sequential Fairness の具体化)。

**実装方針**: `temporalFairnessMap: Record<TimeCell, { userAWeight, userBWeight }>` で表現、Curate stage で各活動を最適 cell に配置。

#### Idea 13: Constraint Hierarchy + Conflict Resolution Order

制約衝突時の解決順序を **logic 化**:
1. red-line violation → reject (candidate 排除)
2. hard violation → soft 制約緩和を試行
3. soft violation → preference 譲歩を試行
4. preference 衝突 → fairness ledger を見て譲歩側を決定

**実装方針**: constraint resolver を pure function、解決履歴を `conflictTrace` で保持。

#### Idea 14: Plan Diff Visualization

candidate 2-3 案を **「何が違うか」軸で diff 表示**、二人が議論しやすい:
- 案 A vs B: 「宿が違う」「2 日目の昼が違う」
- 案 A vs C: 「予算が違う (A: 3 万 / C: 5 万)」「体力負荷が違う」

**実装方針**: candidate 間 diff を `compareCandidates(a, b)` で計算、UI に dimension 別 highlight。

#### Idea 15: Anchor-and-Wander Pattern

主目的地 (anchor) 1 つを確定 + 周辺は仮確定 (wander) で柔軟性確保。「温泉地は決めたが、何見るかは当日決める」が許される設計。

**実装方針**: 各ノードに `confidence: "anchor" | "wander"` を tag、wander ノードは現地で alternate options を提示。

#### Idea 16: Pace Setting (体力負荷感の言語化)

「ゆっくり / 普通 / 詰め込み」の **3 段階** を pair で合意、各 pace で 1 日の最大活動数を制約化。

**実装方針**: `pace: "slow" | "normal" | "intense"` を Stage 1 で抽出、Curate の hard 制約に。

#### Idea 17: Conflict Pre-detection

user A の preferences と user B の preferences を Travel slot ごとに比較、conflict を Curate stage で **事前可視化**:
- 「お二人とも温泉希望 → 一致」
- 「A: 歴史 / B: 自然 → 衝突、両立案検討」
- 「A: 予算 3 万 / B: 予算 7 万 → 衝突、中間案検討」

**実装方針**: Stage 1 Understand bundle で per-person slots を抽出後、Curate 入口で `detectConflicts(slotsA, slotsB)` を実行、UI で\"衝突 / 一致 / 不明\"を可視化。

#### Idea 18: Reversal Cost (取消コスト) + Memory Continuity

各案の **「翌日キャンセル可能性 / 取消料」** を可視化、二人の決断不安を軽減。+ **過去の旅行 history** (`coalter_fairness_ledger`) を Curate に折込、「前回 A の希望優先したから今回 B」のような時系列公平性を実現。

**実装方針**:
- `reversalCost: { cancellable: boolean; deadline: Date; fee: number }` per candidate
- `pastTrips: FairnessLedgerRow[]` を Curate に input、bias_score を反映

---

## §7 Data Source Strategy

### §7.1 Data source 比較 5 軸

| Source | 提供データ | API key 必要 | ToS 確認 | pricing | MVP 適合 |
|---|---|---|---|---|---|
| **Anthropic Web Search** | 一般 web 情報 (場所 / 観光 / 宿) | ✅ (movie で取得済) | 確認済 | usage-based | **★MVP 中心** |
| OpenAI / EXA | 同等 web 情報 | future | future | future | future (Provider Foundation 拡張先) |
| Google Places | 場所詳細 (営業時間 / レビュー / 写真) | ❌ 未取得 | 確認要 | per-request | future Phase |
| OpenStreetMap | 地理 / 経路 (無料) | ❌ 不要 | OSM 互換 ToS | 無料 | future Phase (Path A 候補) |
| 楽天トラベル / じゃらん | 宿泊 (予約連携) | ❌ 未取得 | ToS 厳密 | API tier | future Phase (予約連携 phase) |
| TripAdvisor | 観光 (口コミ) | ❌ 未取得 | ToS 厳密 | API tier | future Phase |
| **LLM 直接生成** | 知識ベース | (API key 既存) | N/A | usage-based | **MVP fallback** |

### §7.2 MVP data source 推奨

- **Primary**: Anthropic Web Search (movie で実績、Provider Foundation 経由)
- **Secondary**: LLM 直接生成 (Anthropic chat completion で 知識ベース answer)
- **Citation**: Provider Foundation の `Citation` 型を Travel でも適用、source URL を candidate に attach
- **Verification**: 各 candidate の field に `uncertainty` tag (Idea 8)、citation 多 + retrieval 確実 = 高 confidence

### §7.3 API key 取得は本書 scope 外

本書では API 接続しない。API key / env / ToS / pricing / legal 確認が必要なものは **future / CEO decision required** に分類。

| 必要承認 | 対象 | timing |
|---|---|---|
| CEO 承認必要 | Google Places key 取得 / 楽天 / じゃらん ToS 確認 / TripAdvisor 取得 | Phase T3 以降 |
| 既存活用 | Anthropic API key (movie で取得済) | Phase T2 以降可 |

---

## §8 既存資源再利用度

### §8.1 movie scaffold (PR #102) の再利用

| movie 要素 | file | Travel 再利用可否 | 再利用方針 |
|---|---|---|---|
| `queryDerivation.ts` | `lib/coalter/movie/queryDerivation.ts` | ✅ 高 | Travel intent extraction の base、Travel slot 追加 |
| `candidatePool.ts` | `lib/coalter/movie/candidatePool.ts` | ✅ 中 | 多候補生成、ただし graph 構造扱い拡張要 |
| `curator.ts` | `lib/coalter/movie/curator.ts` | ✅ 中 | 候補 ranking / curation logic を踏襲、Travel-specific scoring 追加 |
| `theaterResolver.ts` | `lib/coalter/movie/theaterResolver.ts` | ✅ 中 | 場所 resolver パターン踏襲、観光地 / 宿の resolver に拡張 |
| `adjacencyTable.ts` | `lib/coalter/movie/adjacencyTable.ts` | ✅ 高 | 場所隣接性、Travel での周辺観光地展開に活用 |
| `areaExpansion.ts` | `lib/coalter/movie/areaExpansion.ts` | ✅ 高 | エリア拡張、Travel での「広域から狭域へ」narrowing で活用 |
| `tierFailNarration.ts` | `lib/coalter/movie/tierFailNarration.ts` | ✅ 中 | Tier fail 説明、Travel candidate 不足時に活用 |
| `stage3Prefetch.ts` | `lib/coalter/movie/stage3Prefetch.ts` | ✅ 中 | Prefetch pattern、Travel resolve 高速化に活用 |
| `threeStagePipeline.ts` | `lib/coalter/movie/threeStagePipeline.ts` | ✅ 高 | 三段式 pipeline 構造、Travel-β 踏襲の base |
| `threeStageOrchestratorAdapter.ts` | 同 | ✅ 高 | Adapter pattern、Travel orchestrator にそのまま流用可 |

→ **movie scaffold の 60-80% 構造が踏襲可能**。Travel 固有の拡張 (graph 構造 / multi-candidate / fairness ledger 統合) を追加するだけ。

### §8.2 Provider Foundation (PR #110-#119) の再利用

| 要素 | file | Travel 再利用可否 | 再利用方針 |
|---|---|---|---|
| `ProviderId` enum | `lib/coalter/movie/providers/types.ts:34` | ✅ 完全 | 同 enum (`"anthropic" \| "openai" \| "exa"`) を Travel でも使用 |
| `MovieRetrievalProvider` interface | 同 line 50 | ⚠ refactor 必要 | `TravelRetrievalProvider` interface を平行追加、共通 base interface に refactor 可能 |
| `ProviderRetrievalInput` / `Output` | 同 line 81 / 96 | ⚠ 拡張 | Travel-specific input fields (date range / 人数 等) 追加 |
| `Citation` 型 | 同 line 134 | ✅ 完全 | 同型をそのまま Travel candidate に attach |
| `ProviderRawDiagnostics` (9 fields) | 同 line 155 | ✅ 完全 | observability 完全踏襲 (token / cost / cache / inference_geo / WebSearch error) |
| `SourceCandidate` | 同 line 251 | ✅ 完全 | source verification logic そのまま |
| `safeProviderCall` / `costGuard` / `citationNormalizer` / `providerSelector` | 同 dir | ✅ 完全 | 全 utility そのまま使用可 |

→ **Provider Foundation は ~90% 再利用可能**。Travel 用 provider 実装 (`travelAnthropicProvider.ts`) を追加するだけで、existing infrastructure (cost / citation / diagnostics / selector) が動作。

**人間超越点**: PR #110-#119 で構築した Provider Foundation を Travel で活用することで、 **provider observability の知見が Travel domain に shortcut**。Step E rollout pattern (shadow → canary → flip) を Travel でも適用可能。

### §8.3 foodOrchestrator pattern の再利用

| food 要素 | Travel 再利用可否 | 方針 |
|---|---|---|
| `foodOrchestrator.ts` | ⚠ 部分 | single retrieval、Travel は multi-candidate なので構造拡張要 |
| `foodCatalog.ts` | ⚠ 中 | Travel catalog (場所 / 観光地) に拡張、parser logic 部分流用可 |
| `foodRanker.ts` | ⚠ 中 | Travel ranker (multi-axis)、scoring 思想流用可 |
| `foodTierExpander.ts` | ✅ 高 | Travel での area / time tier expansion に直接適用可 |
| `bookingResolver.ts` | ⚠ 低 | food は予約 resolver、Travel MVP は予約しない、思想のみ |

→ food pattern の **直接再利用は限定的**、ただし設計思想は参考になる。

### §8.4 Gap 4 detection (PR #123) との関係

Travel domain は Gap 4 の `PatternContext` 7 fields と直交:
- Gap 4 = **Layer 5 (Layout / UpperLayer)** の context 検出
- Travel = **Domain 層** の candidate 生成

両者は **並行進行可能**。ただし Travel candidate 不足時の `infoMissing` / 二人 preference 衝突時の `needFraming` 等は、Travel detector から Gap 4 detector へ signal を流せる設計余地あり (T2 phase で検討)。

### §8.5 Daily mode との接続

PR #122 で「Daily × Domain cross-axis dispatch」未実装と確認。Travel domain 完成後、**Daily mode 中の travel-like 提案** (週末小旅行 / 日帰り) を Daily routing に統合可能。

### §8.6 Normal mode (decision / negotiate / clarify) との接続

Travel candidate 提示は **decision mode** で発火。preference 衝突時は **negotiate mode** に escalate (Idea 17 conflict pre-detection と連動)。意図不明確時は **clarify mode** で問い直し (Stage 0 旅行宣言検出を clarify mode で代替、§5.2 参照)。

→ Travel domain は Action Mode 3 種と本質的に統合可能、新 mode 追加不要。

---

## §9 実装 Phase (T0-T7)

### §9.1 Phase 一覧

| Phase | 内容 | files likely touched | tests | CEO 承認 | risk | rollback |
|---|---|---|---|---|---|---|
| **T0** (本 PR) | docs-only design | `docs/` 1 file | N/A | merge 判断 | 0 | 本 PR revert |
| **T1** | Pure domain types (TypeScript types only、runtime 0) | `lib/coalter/travel/types.ts` (新規) | unit tests for type compatibility | 承認 | 低 (types 単体、import 元なし) | file 削除 |
| **T2** | Travel intent / slot extraction (Stage 1 拡張) | `lib/coalter/understanding/` 拡張 + `lib/coalter/travel/intent.ts` (新規) | unit test on slot detection | 承認 | 中 (Stage 1 touch、既存 lens 互換維持) | 拡張部分 revert |
| **T3** | Itinerary candidate generator (Stage 2 Curate、複数案) | `lib/coalter/travel/itineraryGenerator.ts` (新規) + provider (`travelAnthropicProvider.ts`) | unit + integration test | 承認 | 中 (新 generator、provider foundation 拡張) | feature flag OFF |
| **T4** | Comparison + Fairness scorer (複数案比較 + Sequential Fairness) | `lib/coalter/travel/comparator.ts` + `lib/coalter/travel/fairnessScorer.ts` (新規) | unit test, fairness ledger integration | 承認 | 中 | flag OFF |
| **T5** | Resolve / confirmation (Stage 3、1 案確定) | `lib/coalter/travel/resolver.ts` (新規) | integration test, confirmation flow | 承認 | 中 | flag OFF |
| **T6** | UI presentation (複数案カード UI) | `components/coalter/TravelComparisonCard.tsx` + 関連 UI | UI test, visual regression | 承認 + Product Unit 連携 | 中 (新 UI、Layout 系既存に影響なし) | UI 別 route |
| **T7** | Production observation (Step E 統合) | telemetry + feature flag | observability test | **CEO 戦略判断** | 大 (実 user reach) | mode enum (Gap 4 と同設計) |

### §9.2 各 Phase の詳細

#### T1 (Pure domain types)

新規 file 1-2 個、既存コード touch 0:
- `TravelItinerary` (graph 構造)
- `TravelNode` (時刻 / 場所 / 活動 / 予算 / 体力)
- `TravelEdge` (移動手段 / 所要時間 / 費用)
- `TravelConstraint` (severity: red_line / hard / soft / preference)
- `TravelCandidate` (itinerary + constraint + rationale + uncertainty + Pareto axis)
- `TravelComparison` (multi-candidate diff)
- `Pace` (slow / normal / intense)
- `BudgetBand` (lo / hi / confidence)

#### T2 (Travel intent / slot extraction)

Stage 1 Understand bundle に Travel-specific slots 追加:
- destination (希望地域 / 具体地名)
- dateRange (start / end)
- numNights (1 or 2)
- members (per-person preferences)
- budget (band, confidence)
- pace (slow / normal / intense、Idea 16)
- redLines (絶対不可制約)

per-person slots を抽出する logic を `lib/coalter/travel/intent.ts` で実装。

#### T3 (Itinerary candidate generator)

Stage 2 Curate の Travel-specific 実装:
- Anthropic Web Search で source 収集
- LLM (Anthropic / OpenAI / EXA) で itinerary graph 生成 (Provider Foundation 拡張)
- 制約適用 (Idea 5 Veto / Red-line)
- 多候補 (2-3) Pareto 最適選出 (Idea 3)
- Conflict pre-detection (Idea 17)

#### T4 (Comparison + Fairness scorer)

複数 candidate を比較する logic:
- Plan diff (Idea 14、各軸の違いを highlight)
- Pareto 評価 (Idea 3 完成)
- Sequential Fairness (Idea 4、過去 Fairness Ledger 反映)
- Temporal Compatibility Map (Idea 12)

#### T5 (Resolve / confirmation)

二人の議論を経た合意確定 stage:
- user 選択 → 1 案確定
- 確定後の rationale 記録 (Idea 11 説明可能性)
- Fairness Ledger 更新 (今回の bias_score 記録、次回 fairness に影響)

#### T6 (UI presentation)

UI implementation は Product Unit 連携:
- 複数案カード UI (2-3 案並列表示)
- Plan diff highlight
- Conflict explanation 表示
- Uncertainty labeling (Idea 8)
- Pareto axis visualization (Idea 3)

#### T7 (Production observation)

Step E rollout pattern と統合:
- Gap 4 と同 mode enum 設計 (`COALTER_TRAVEL_DOMAIN_MODE=off|observe|live`)
- 3-stage rollout (off → observe → live)
- canary / allowlist
- Sentry telemetry / cost log / fairness ledger 観測

---

## §10 まだやらない (本 PR scope 外)

### §10.1 runtime / production 操作

- ❌ Travel domain 実装着手 (T1-T7、各別 PR)
- ❌ `lib/coalter/travel/` ディレクトリ作成
- ❌ `lib/coalter/movie/providers/` を Travel に refactor
- ❌ Stage 1 Understand bundle 拡張
- ❌ Stage 2 Curate 実装
- ❌ Stage 3 Resolve 実装
- ❌ Travel UI 新規実装 (`components/coalter/TravelComparisonCard.tsx` 等)
- ❌ `flags.ts` への新規 env mode enum 追加 (`COALTER_TRAVEL_DOMAIN_MODE`、T7 phase、別 PR)
- ❌ `lib/coalter/types.ts` への Travel types 追加 (T1 phase、別 PR)

### §10.2 既存 file touch

- ❌ `lib/coalter/movie/**` 全 file touch (movie scaffold は既存のまま、Travel は別 dir に新規)
- ❌ `lib/coalter/food*.ts` 全 file touch
- ❌ `lib/coalter/presence/**` 全 file touch (Gap 4 と直交)
- ❌ ChatClient / UpperLayerMount / ModeSwitcher / 既存 components touch
- ❌ `lib/coalter/flags.ts` 既存 flag touch (新規 env のみ将来追加、本 PR は提案のみ)
- ❌ `lib/coalter/types.ts` 既存 type touch

### §10.3 production / env / API

- ❌ env 変更 (`COALTER_TRAVEL_DOMAIN_MODE` 等の追加なし、本 PR は設計提案のみ)
- ❌ Production env / Vercel deploy 操作
- ❌ Anthropic Console / Google Places / 楽天 / じゃらん 等 API key 取得
- ❌ 実 API call / `ANTHROPIC_API_KEY` 参照 / `process.env` 参照
- ❌ Supabase migration 新規追加 / 既存 migration touch

### §10.4 別領域 (CEO directive 2026-05-15)

- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ movieOrchestrator / movie domain 修正
- ❌ ProviderSelector / Anthropic provider 修正
- ❌ Gap 4 detector 実装 (PR #123 D2-D7、別 PR)
- ❌ reflect mode 着手 (Phase 3 後送り)
- ❌ Daily × Domain cross-axis dispatch 着手 (G-3、別 PR)
- ❌ 本 doc の merge (CEO 判断)

### §10.5 Travel future scope (本 MVP 外)

- ❌ 日帰り (Scope A)、3 泊以上 (Scope C)、海外 (Scope D)
- ❌ API 予約連携 (楽天 / じゃらん / Booking 等)
- ❌ Google Places / TripAdvisor / OpenStreetMap 接続
- ❌ 天候 forecast / 混雑予測 API 接続
- ❌ Citation UI 露出 (a4 phase、別 phase)

---

## §11 推奨結論

### §11.1 最終推奨案

CEO 補正 + GPT 推奨 + claude deep reasoning による結論:

| 軸 | 推奨 | 根拠 |
|---|---|---|
| **Scope** | **Scope B (1-2 泊国内旅行)** | CEO 確定、greenfield 焦点絞り込み度最高 |
| **三段式 Approach** | **Travel-β (Travel 専用 slots + 複数案比較 + Resolve 確定)** | 複数案比較が travel native UX、movie scaffold 踏襲可能 |
| **Data source (MVP)** | **Anthropic Web Search 中心 + LLM 直接生成** | Provider Foundation 既存活用、API key 取得不要 |
| **Provider Foundation 拡張** | **Travel Anthropic Provider 追加 (PR #110-#119 拡張)** | 9 fields observability / Citation / SourceCandidate 完全踏襲、~90% 再利用 |
| **API 予約連携** | **future scope** | CEO 明示、MVP は議論支援に専念 |
| **Stage 0 旅行宣言** | **不要** (Action Mode clarify で代替) | stage 数増設の複雑度 vs 機能を比較、clarify mode 連携で十分 |
| **rollout 戦略** | **Gap 4 同 mode enum 3-stage (`off`/`observe`/`live`)** | PR #123 設計と統合、Step E rollout pattern 接続 |
| **fairness 統合** | **Sequential Fairness + Memory Continuity** | 過去旅行履歴を Fairness Ledger から folding、複数日 / 複数回旅行で公平性実現 |

### §11.2 人間超越設計 18 アイデア 全組込

CEO 必須 11 + claude 追加 7 = 全 18 アイデアを Travel-β 設計に組込:

- candidate 表現: Itinerary Graph (1)
- 候補生成: Constraint Satisfaction (2) + Pareto Optimal (3) + Constraint Hierarchy (13)
- 公平性: Sequential Fairness (4) + Temporal Compatibility Map (12) + Memory Continuity (Idea 18 一部)
- 制約: Veto / Red-line (5) + Fatigue-aware (6) + Pace Setting (16)
- 不確実性: Budget-risk Bands (7) + Uncertainty Labeling (8) + Anchor-and-Wander (15) + Reversal Cost (Idea 18 一部)
- 議論支援: Progressive Narrowing (9) + Conflict Explanation (10) + 説明可能性 (11) + Plan Diff Visualization (14) + Conflict Pre-detection (17)

→ 既存 travel app (じゃらん / 楽天トラベル / Google Trips) には **存在しない 18 機能**。CoAlter Travel = 「**2 人合意形成に特化した人間超越設計**」を実現する。

### §11.3 期待される CoAlter 全体寄与

PR #122 §6 集計 (CoAlter 全体未完了 14 件) のうち本 PR + Travel impl 完了で解消されるもの:

| 未完了領域 | 状態変化 |
|---|---|
| Domain travel (lib に impl 一切なし) | ❌ → ✅ (T1-T7 完了で完了) |
| PresenceMode travel domain body | ❌ → ✅ (Travel domain と直接統合) |
| Daily × Travel cross-axis | ❌ → ⚠ 部分 (Travel domain あれば G-3 で接続可能) |

→ CoAlter 全体未完了 **14 件 → 11 件** に減少 (3 件解消)。Gap 4 D7 完了と合わせれば **9 件**まで減少可能。

---

## §12 verify 結果 + CEO 判断請求

### §12.1 verify 結果 (8 項目)

本 commit 前自己確認 (commit 後再確認):

| # | 項目 | 結果 |
|---|---|---|
| 1 | docs-only | ✅ `docs/coalter-travel-domain-greenfield-design.md` 1 file 追加のみ |
| 2 | lib touch 0 | ✅ |
| 3 | src touch 0 | ✅ |
| 4 | tests touch 0 | ✅ |
| 5 | package touch 0 | ✅ |
| 6 | supabase/migrations touch 0 | ✅ |
| 7 | Alter Morning 実 path touch 0 | ✅ (本 file 内 言及は本 verify 行 meta-reference のみ) |
| 8 | secrets 値 露出 0 | ✅ (token 名 / env var 名 reference のみ、actual value なし) |

### §12.2 CEO 判断請求事項 (7 項)

1. **本 doc の merge 判断**
2. **推奨案承認** — Scope B + Travel-β + Anthropic Web Search 中心 + Provider Foundation 拡張 + Gap 4 同 mode enum rollout
3. **MVP scope 確定** — 1-2 泊国内旅行 / 2-3 案比較 / 議論支援に専念 / API 予約連携 future
4. **人間超越 18 アイデア承認** — CEO 必須 11 + claude 追加 7 全組込
5. **T1 (Pure domain types) 着手 timing 判断** — 本 doc merge 後の next phase 着手承認
6. **Provider Foundation 拡張 timing 判断** — `MovieRetrievalProvider` interface を `RetrievalProvider<T>` のような generic base に refactor し、`TravelRetrievalProvider` を追加する設計余地承認
7. **Step E / Gap 4 / Travel 三者の rollout 統合戦略** — 全 domain で同 mode enum 設計を共有する方針承認

### §12.3 次の docs-only autonomous 候補 (本 doc merge 後)

PR #122 §8.1 で挙げた候補のうち、本 Travel design 確定後に進める順:

| # | 候補 | Travel との関係 |
|---|---|---|
| G-3 | Daily × Domain cross-axis dispatch 設計 docs | Travel domain あれば Daily × Travel routing 設計可、優先度↑ |
| G-4 | L4-m legacy 退役 status audit docs | 独立、軽量並列可 |
| G-5 | Reflect mode Phase 3 pre-review docs | Phase 3 開始判断材料、独立 |
| G-6 | Activity domain 対象範囲 mapping docs | Travel と類似構造 (場所 + 活動)、Travel 完了後の方が解像度上がる |
| F-2 | D-2-e3-b/c/d/e audit docs | movie path 補完、独立 |
| F-5 | PR #102 scaffold + PR #110-#119 関係 audit docs | movie Path α vs β 判断、独立 |

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
