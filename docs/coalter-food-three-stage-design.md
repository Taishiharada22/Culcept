# CoAlter 食事ドメイン 三段式アーキテクチャ設計

**作成日**: 2026-04-20
**ステータス**: ドラフト（CEO 審議中）
**起草**: Claude / **承認**: CEO（固定 Who）
**rev 履歴**:
- rev 1 (2026-04-20): 初版。movie 三段式 rev 3.1 を雛形に、food 固有差分を明示化
- rev 2 (2026-04-20): GPT 2次反証 9 点を批判評価の上で採択。原則 9 (Retrieval Hygiene & Constraint Projection) 追加、SLO 3.5 層化（T2a provisional preview 12-15s）、FoodQuery に exactTime / occasion 構造化、clarify gate 明記、observability 6 指標、acceptance test (新宿11時ラーメン醤油)、U3 telemetry 義務化
- rev 3 (2026-04-20): **CEO 方針固定 — depth-first / speed-first 否定 / 非 silence-first**。SLO を「短縮目標」から「担保された設計値」に再定義。T2a の存在意義を「高速化」から「CoAlter らしい理解表現（2人をどう理解して探しているか）」に転換。1 分上限は維持、下限最適化はしない。途中表示は generic chip を禁じ、S1 由来の「理解表現」のみ許可。最重要評価軸を latency 単体から **納得度・由来の深さ・2人特化の精度** に固定

**前提文書**:
- `docs/coalter-movie-three-stage-design.md`（rev 3.1、同じ構造論を共有。Stage 1 は共通基盤）
- `docs/coalter-master-design.md`（v1.1、CoAlter 全体の設計原則）
- `docs/coalter-food-diagnostics.md`（Phase B Commit 2.5 監査契約）
- `docs/coalter-handoff-2026-04-19-retrieval-investigation.md`（U3 感情並列問題の全量記録）

**責務**: 食事ドメインで「2人の理解（Understand）→ 店選定（Curate）→ 予約・時刻確定（Resolve）」の三段分離を定義する。Stage 1 Understand は movie と完全共有（ドメイン非依存）。Stage 2/3 は food 固有で設計する。1 分以内・1 カード UX・5W1H 遵守・二重制約（営業時間 × 予約枠）対応・2人リコメンド理由（Personality-Rooted Narration）復活の 5 条件を同時達成する。

**Phase B との関係**: Phase B Commit 1-4（2026-04-18〜19）で foodCatalog / foodRanker / foodOrchestrator / bookingResolver が既に実装されている。本 doc は既存実装を **三段式の枠で位置づけ直す** ためのもの。実装全書き直しではない。差分は §6 で明示する。

---

## 0. Executive Summary

現行の食事パイプラインは **段階設計の doc が空白** のまま実装だけが先行している。これが 3 つの問題を生む:

1. **S2 と S3 の責務境界が曖昧**: `foodOrchestrator` 内で catalog → rank → booking が一本化されており、「店の結晶化（soft）」と「予約導線確定（hard）」の知識型が同じ段に混在
2. **Stage 1 Understand との接続が宣言のみ**: 既存 `foodOrchestrator` は `ConversationBrief` を受け取るが、`TwoPersonLensToday`（movie と共通の S1 出力）を入力契約にしていない。結果、「2人の理解」と「店選定」が構造的に繋がっていない
3. **食事固有の二重制約（営業時間 × 予約枠）が未設計**: movie は「上映時刻＋劇場」の 1 軸的制約だが、food は「営業時間 × 予約枠 × 立地」の 2+ 軸制約。Tier expansion が時間軸でも必要

**解**: movie と同じ **三段分離** で整理し直す。S1 は共通基盤（追加実装最小）、S2/S3 は food 固有として明文化:

- **Stage 1 Understand**: ドメイン非依存。movie と同じ `TwoPersonLensToday` を使う。food 固有の軽量 lens adapter（空腹度 / 時間帯 / 雰囲気希求 / 気分）を一層だけ足す
- **Stage 2 Curate**: 店の結晶化。既存 `foodCatalog` + `foodRanker` を S2 として位置づけ直す。Personality-Rooted Narration は現状欠落 → Commit 4 の narration 拡張と合わせて整合
- **Stage 3 Resolve**: 予約・時刻確定。既存 `bookingResolver` を S3 として位置づけ直す。**時間軸 Tier expansion**（今夜 → 明日 → 週末）を新設

UX は movie と同じ「1 カード、WHERE skeleton → 予約確定遷移」。

---

## 0.4 評価軸の固定（rev 3 / CEO 方針）

CoAlter の食事提案は **汎用推薦ではなく 2人特化推薦**。よって最重要評価軸を以下に固定する:

| 順位 | 評価軸 | 意味 |
|---|---|---|
| 1 | **納得度** | 2人が「そう、それ」と感じるか |
| 2 | **由来の深さ** | どれだけ多くの観測・文脈から根拠を織り込めたか |
| 3 | **2人特化の精度** | 同じ条件でも別の 2人なら別の答えが出るか（非汎用性） |
| 4 | 体験の継続性 | 途中で無言にさせず、CoAlter らしさが保たれるか |
| 5 | latency | 1 分以内で完結すること（上限制約、最適化対象ではない） |

**反面教師**:
- latency 最適化のために Personality-Rooted の核（5 要素 reasoning / 由来引用 / fairness）を削るのは**禁止**
- 高速化のために汎用チップ（「静か / 賑やか / カジュアル」等の generic UI）を途中表示するのは**禁止**
- 「速いが汎用に見える」より「深く 2人特化で、代わりに 49s かかる」を選ぶ

**ただし silence も禁止**。途中表示は許容（むしろ必要）だが、その中身は次節で定義する。

---

## 0.5 CoAlter の存在論（設計の前提）

**CoAlter は推薦機能ではない**（movie doc §0.5 と同じ）。

汎用推薦サービス（食べログランキング・Google Maps・汎用 LLM）と CoAlter の違いはアルゴリズムではなく、**持っている情報の性質**。

| レイヤ | 汎用サービス | CoAlter |
|---|---|---|
| 嗜好データ | 集計された評価・訪問ログ | **2人それぞれの判断原理（Stargazer 観測）** |
| 文脈 | セッション内 | **2人の関係史・譲り合い履歴・今日の気分** |
| 推薦の由来 | 「評価が高い」「近い」 | **「A さんの◯◯と B さんの◯◯が、今日のこの会話でこう接続するから、この店」** |
| 理由の深さ | ジャンル・価格・評点 | **判断原理レベルでの納得** |

食事推薦は CoAlter の最終出力ではなく、**「2人の理解が結晶化した形の一つ」**。店を探すシステムでもジャンルを選ぶシステムでもなく、**「2人を誰よりも理解している存在が、その理解を根拠にプランを立ち上げる」**システム。

**食事ドメイン固有の追加視点**:
- 食事は **滞在体験**（120 分前後その場にいる）であり、映画以上に「雰囲気」「会話しやすさ」「席配置」が 2人の関係体験を左右する
- 映画は 1 度切りだが食事は **繰り返し可能** → 過度な最適化より「外さない中央寄せ」が効く場面が多い
- 体調（空腹度・疲労）・天候・気温の短期状態が決定要因として大きい → S1 の短期 reading の比重が movie より高い

---

## 1. 設計原則

### 原則 0: Understand はドメイン非依存の共通基盤

movie 三段式 §1 原則 0 と**同一**。`lib/coalter/understanding/` は movie / food / travel / gift で共有。food はここに **追加実装を持たない**（lens adapter のみ、§2.2.5）。

理由再掲:
- 「2人を理解する」責務はドメインを跨いで不変
- 同じ 2人に対して映画と食事で理解が別々に走るのは無駄
- ドメイン横断で人格理解の一貫性を保つ必要（映画で「慎重」と読んだのに食事で「冒険家」と読むのは矛盾）

### 原則 1: 知識の型で段を切る（Knowledge Typology Staging）

| 段 | 知識型 | 主ソース | 主エンジン | 失敗モード | ドメイン依存 |
|---|---|---|---|---|---|
| Stage 1 Understand | Relational（2人の理解） | Alter + Stargazer + CoAlter + 今の会話 + 他観測 | LLM reasoning + 永続統合 | 2人の読み違い | **非依存** |
| Stage 2 Curate | Soft（嗜好・関係・気分・雰囲気 → 店の結晶化） | 2人理解 + 店カタログ + 一般評判 | LLM ranking + Personality-Rooted Narration | 趣味外し / 雰囲気ミス | 依存（food） |
| Stage 3 Resolve | Hard（営業時間・予約・座席・立地） | 公式サイト・予約 SaaS・地図 | structured retrieval + 二重制約 filter | 二重制約外し | 依存（food） |

**学術的根拠**: Covington et al. 2016（YouTube 多段 recommender）/ Pinterest PinSage 2018（candidate generation + ranking の 2段標準）。CoAlter は Understanding を前置する 3段。
**食事固有**: Bao et al. 2022 "A Survey of Recommender Systems for Food" — food recommendation は健康・気分・社会性・文脈の 4 軸で「one-size-fits-all が特に通用しない」領域。段分離の必要性が映画より強い。

### 原則 2: UX は 1 カード・内部は 2 段（UX Unity, Engine Duality）

movie と同じ。ユーザー視点は 1 カード、内部は S2 と S3 が時間差で完了し in-card patch で遷移。

食事固有の状態遷移:

| phase | WHERE 表示 | When 表示 | narration 表示 |
|---|---|---|---|
| P1: S1+S2 実行中 | 「2人に合う店を探しています」 | — | skeleton |
| P2: S2 完了・S3 実行中 | 「{店名} の空き枠を探しています」 | 「今夜 or 明日から確認」 | **narration 充填** |
| P3a: S3 成功 | 店名＋最寄駅＋徒歩 | 具体時刻＋席 | narration 維持 |
| P3b: S3 Tier2 fail | 「{area} では今夜の予約が厳しい。別候補/別時間？」 | — | narration 維持 |

**食事固有**: P2 の「空き枠を探しています」は movie の「劇場を探しています」より具体的に**時間の文脈**を出す。ユーザーは「今夜行けるか、週末か」を知りたいため。

### 原則 3: 5W1H は最初から骨格を見せる（Skeleton-First Disclosure）

| 枠 | S2 完了時 | S3 完了時 |
|---|---|---|
| Who（2人の理由） | 「AさんとBさんが今日ハマる理由」を narration で埋める | 維持 |
| What（店＋ジャンル＋価格帯） | 店名 + ジャンル + 価格帯 | 維持 |
| When（時刻枠） | 「今夜 or 明日の空き枠から」 | 具体時刻 |
| Where（立地） | 最寄駅＋エリア（**skeleton で徒歩分は空**） | 徒歩分＋住所 |
| Why（推薦理由） | 性格・関係・気分・雰囲気からの 2文 | 維持 |
| How（予約導線） | 「空き枠確定後に予約リンク」 | 予約 URL（5 分類の高 confidence のみ） |

### 原則 4: 二重制約 Tier 拡張（Temporal × Geographic Expansion）

映画の Concentric Area Expansion は **地理 1 軸**。食事は **時間 × 地理 2 軸** で Tier を切る必要がある:

```
Tier 0: ユーザー指定エリア × 指定時間帯（例: 渋谷 × 今夜 19:00）
  ↓ 店なし or 予約不可
Tier 1a: 指定エリア × 時間帯拡張（渋谷 × 明日 or ランチ枠）
Tier 1b: 隣接エリア × 指定時間帯（新宿・表参道 × 今夜）
  ↓ 両方 fail
Tier 2: 「この時間・エリアでは予約が厳しい。別候補 or 別時間？」+ 代替提示
```

**Tier 境界定義**:
- Tier 0: ユーザーが明示した「エリア × 時間帯」の積集合でマッチする店
- Tier 1a: Tier 0 と同エリアで時間帯だけ隣接枠にスライド（今夜 → 明日 / ディナー → ランチ）
- Tier 1b: Tier 0 と同時間帯で地理だけ拡張（movie と同じ adjacency）
- Tier 2: Tier 1a/1b 両方空なら正直に「薄い」と返す

**全国検索は禁止**（movie と同じ、product judgment）。
**根拠**: Lynch 1960 "Image of the City"（日常圏外の提案は mental map を外れる）+ Bao et al. 2022（食事推薦では時間文脈を外した推薦は満足度が著しく下がる）。

### 原則 5: LLM とロジックの分担（Hybrid Authority）

| レイヤ | 担当 | 理由 |
|---|---|---|
| 会話理解 | LLM | ニュアンス・感情・ほのめかし |
| 店候補生成 | ロジック + 軽量 LLM | catalog の事実性は logic、並び替えは LLM |
| 2人への推薦理由 narration | **LLM（現状欠落）** | 性格・履歴・関係・雰囲気の統合は LLM の最強領域 |
| 営業時間・予約可否 | ロジック | hard 事実の領域 |
| 予約導線確定 | ロジック（`bookingResolver` 5 分類） | URL pattern から分類 |
| カード最終生成 | LLM + template | 5W1H テンプレに LLM 生成ナラティブを嵌める |

**現状の欠陥**: `narrationTemplate.ts` の food narration は Phase B Commit 4 で実装されたが、**Personality-Rooted Narration の 5 要素構造**（movie doc §2.3.3）を持っていない。「A さんの lens」「B さんの lens」「relational_fit」「today_hook」「veto_guard」の 5 要素を food 側でも明文化する必要がある（§6 実装整合で詳述）。

### 原則 6: 雰囲気を独立軸として扱う（Atmosphere as First-Class）

食事ドメイン固有の原則。

**根拠**: Mehrabian-Russell 1974 "An Approach to Environmental Psychology" — 環境刺激（明度・音量・混雑度・色）は approach/avoidance 行動の主要決定因子。Bitner 1992 "Servicescapes" でレストラン文脈に拡張確認。Payne et al. 1993 "The Adaptive Decision Maker" — 文脈依存選択。

実装含意:
- `foodRanker` の metric に `quietnessFit`（既存）/ `moodMatch`（既存）を持つが、**「雰囲気」は単一軸ではなく 3 軸**で扱うべき:
  - 音量軸: 静か ↔ 賑やか
  - 密度軸: 個室・間隔広め ↔ カウンター密着
  - 照度軸: 暖色低照 ↔ 明るめ
- 2 人の関係温度（S1 の `relationalLens.temperature`）とこの 3 軸が接続する
  - `warm`（親密モード）→ 低音量・個室・暖色低照
  - `cool`（修復モード）→ 中音量・間隔広め・中照度（圧を減らす）
  - `neutral` → 自由度高い

現状実装は音量 1 軸のみ。密度・照度軸は未実装で、§6 で「S2 負債」として記録。

### 原則 7: 時系列公平性（Sequential Fairness）

movie doc と共通。`FairnessLedger` は既に実装済み。

食事固有の論点: 映画は 2〜3 時間拘束の合意形成なので fairness が強く効くが、食事は**繰り返し可能**ゆえに「今回の譲りを次回で返す」サイクルが短い。`fairnessAdjustment.strength` は food では movie の 70% で初期化するのが妥当（短期に平準化しやすい）。S2 Curate の LLM prompt でこの係数を渡す。

### 原則 8: 感情と retrieval の並列（U3 契約、食事でも同構造）

**handoff 2026-04-19 §5.1** で記録された U3 問題（NO_SEARCH_PATTERNS の排他ゲート）は food でも同じ構造欠陥を持つ。

契約:
- S1 で会話から**感情タグを抽出**する（排他ゲートではない）
- S2 Curate は感情タグを **narration の核**として使う（例: 「疲れた B さんに、静かに温度のある店」）
- S3 Resolve は感情タグに **依存せず独立に起動**する（感情語が含まれても検索は走る）

これで「感情があるから検索しない」→「感情を読みつつ検索も走る」に構造転換する。

実装上、`lib/coalter/webConnector.ts` の `NO_SEARCH_PATTERNS` は food theme でも同様に排他ゲート化している。本 doc 確定後、U3 解決タスクとして **排他ゲート廃止 + 感情タグ抽出器化** を食事経由で行う（movie と同時に解決される）。

**U3 telemetry 義務**: `shouldSearch=false` を返す経路が残る限り、**理由ラベル付き telemetry** を必ず記録する（`webConnector.decideSearch` 呼び出しごとに `{theme, reason, matched_pattern}` を `coalter_diagnostics` に push）。食事経由の U3 廃止作業中に影響測定不能な状態を許さない。

### 原則 9: Retrieval Hygiene & Constraint Projection（S2-b 主責務 / S3 trust 伝播）

食事の retrieval 失敗（handoff 2026-04-19 の Pattern A/B）の根因は「候補選定」より**前段の retrieval 入口の衛生**にある。

**契約**:
- **S2-b 主責務**: FoodQuery から検索クエリへの **制約射影（constraint projection）** を「こぼさない」。location / cuisine / exactTime / atmosphere / priceBand のいずれが query に乗っていないかを projection coverage として測定する
- **ページ種別分類**: retrieval 結果は domain 判定だけでは不足。**page type**（`venue_detail` / `official` / `reservation_partner` / `third_party_listing` / `news` / `listicle`）を URL pattern + snippet heuristics で分類し、`listicle` / `news` は direct candidate 昇格禁止
- **clarify gate**: projection coverage が閾値（例: 0.4）未満で会話から追加抽出可能な場合は、generic query を走らせる前に **clarify 応答**に倒す（「新宿で和食、何時頃ですか？」等）
- **S3 への trust 伝播**: S2-b で分類した page type を `ActivityCandidate.meta.sourceKind` に載せ、S3 は `bookingResolver` の 5 分類と合わせて **二層の source trust** として扱う（S2-b = 候補としての適格性 / S3 = 予約 URL の確度）

既存 `bookingResolver` の 5 分類は S3 側の機構であり、S2-b 入口の衛生は別責務。両者を混同しない。

### 原則 10: Depth-first / 非 silence-first / 非 speed-first（rev 3 / CEO 方針）

**前提**: CoAlter は汎用推薦ではなく 2人特化。よって以下 3 つを同時に守る（本 doc の最終優先原則）:

1. **full quality を優先する** — latency 短縮のために Personality-Rooted の核（5 要素 / 由来引用 / fairness）を削ることは禁止
2. **silence-first にしない** — 27s〜49s の間を無言で待たせない。途中表示（§3.1 の A/B/C 3 系統）を必須とする
3. **speed-first にしない** — 下限最適化は設計目的ではない。1 分上限のみが制約

**含意**:
- 「速いが汎用的」より「深く 2人特化で、代わりに 49s かかる」を選ぶ
- 途中表示は「高速に見せる」ためではなく、「2人をどう理解して探しているか」を可視化するため
- 実装で latency と quality のトレードオフに直面したら **quality を常に優先** する
- SLO の秒数は「短縮目標」ではなく「品質を担保した上での現実的な設計値」
- 他原則と衝突した場合、**原則 10 が優先される**（meta-principle）

---

## 2. アーキテクチャ詳細

### 2.1 Pipeline 図

```
[User 発話]
    ↓
[Stage 0: Analysis]  ← 既存 ConversationAnalysis  ~2s
    ↓
[Stage 1: Understand]  ← 内部処理。UI 非表出  ───────── target ≤ 5s
  ├─ 1a. Observation Bundle 収集（Alter + Stargazer + CoAlter + 今の会話 + 環境）
  ├─ 1b. Structured Fusion（logic + 軽量 LLM）
  ├─ 1c. TwoPersonLensToday 出力（ドメイン非依存）
  └─ 1d. ★ food lens adapter ★（空腹度 / 時間帯 / 雰囲気希求 / 気分）を薄く付ける
    ↓
[Stage 2: Curate (food)]  ── target ≤ 20s
  ├─ 2a. Food Query Derivation（TwoPersonLensToday + food lens → 検索軸）
  ├─ 2b. Candidate Generation (logic) + Soft Availability Filter
  │       - webConnector で食べログ / 公式 / ぐるなび / ホットペッパーに発射
  │       - parseFoodVenues で FoodVenue[] 化 → ActivityCandidate でラップ
  ├─ 2c. foodRanker（9 hard filter + 9 metrics + 関係性軸 compromiseQuality）
  └─ 2d. LLM Personality-Rooted Narration（5 要素：A lens / B lens / relational / today / veto）
    ↓
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ★ ここで 2 つが同時に起こる ★
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ↓                                  ↘
[Card Render v1 に即座に push]       [Stage 3: 裏で自動発火]
  - What: 店名 + ジャンル + 価格帯       ├─ 3a. Tier 0 fetch（公式 / tablecheck / 食べログ予約）
  - Why: 2人への理由（narration）        ├─ 3b. 営業時間 × 予約枠の二重制約 filter
  - Where: skeleton「空き枠を確認中…」   ├─ 3c. 必要なら Tier 1a（時間拡張）or 1b（地理拡張）
  - When: 「今夜 or 明日」                └─ 結果を非同期 push
    ↓                                  ↙
  ユーザーが narration を読む（認知的に吸収 ≈ 10〜15s）
    ↓
[Card Render v2 パッチ適用]
  - When: 具体時刻＋席種                ← Tier 0/1 成功
  - Where: 徒歩分＋住所
  - How: 予約 URL（`bookingResolver` の high/medium confidence のみ）
    または
  - Tier 2 fail → 「別時間 / 別エリアで探す？」チップ提示
    ↓
[User 承認 / 別候補選択 / 代替提示]
```

**食事固有の差分（movie 比）**:
- S2 の LLM 時間予算を **12s → 10s** に圧縮（食事はジャンル選定の解像度が映画より低い）
- S3 の時間予算を **15s → 12s** に圧縮（食事の予約サイトは構造化度が高く parse が速い）
- 合計 max 50 秒（movie は 57s）、体感は narration 読了に吸収

### 2.2 Stage 1 詳細: Understand（共通基盤 + food lens adapter）

#### 2.2.1〜2.2.4: 共通基盤

`ObservationBundle` / `runUnderstanding` / `TwoPersonLensToday` の定義は **movie doc §2.2 と完全同一**。再掲しない。`lib/coalter/understanding/` の既存実装をそのまま使う。

#### 2.2.5 food lens adapter（新規、食事固有の薄い一層）

S1 出力の `TwoPersonLensToday` から、food ドメインで追加必要な 4 軸を派生する。**LLM は使わない**（軽量 logic のみ、latency 加算 ≤ 100ms）。

```ts
// lib/coalter/understanding/foodLensAdapter.ts（新規提案）
type FoodLensToday = {
  lens: TwoPersonLensToday          // そのまま保持
  foodContext: {
    // ── 短期状態（S1 の environmental + conversation から派生）──
    hungerLevel: "very_hungry" | "hungry" | "peckish" | "satisfied" | "unknown"
    timeWindow: "breakfast" | "lunch" | "late_lunch" | "tea" | "dinner" | "late_night"

    // ── ★ exact time（rev 2 新規、原則 9）★ ──
    //   会話中の「11時くらい」「19:30」「明日の昼」等を timeWindow enum とは別に保持。
    //   現状 timeWindow 丸めで落ちていた情報を取り戻す（handoff 2026-04-19 Pattern A 核）
    requestedTimeSlots: Array<{
      localDate: string | null     // "2026-04-20" 等、null = 今日扱い
      startHour: number            // 0-23
      endHour: number              // start + tolerance（例: 11時くらい → 10-12）
      confidence: "explicit" | "approximate" | "inferred"
    }>
    targetLocalTime: string | null   // ISO local（代表値、S3 Tier0 初期目標）

    // ── ★ occasion 構造化（rev 2 新規）★ ──
    //   「誕生日」「記念日」「デート」「久しぶりの再会」「気楽な昼」等。
    //   narration 由来引用と Tier 判断の両方で使う。
    occasion: string | null
    occasionConfidence: "explicit" | "inferred" | "none"
    occasionSource: "user_utterance" | "calendar" | "s1_derivation" | null

    // ── 関係温度 × 雰囲気希求（S1 の relationalLens × todayReading から）──
    atmosphereDesire: {
      quietness: "quiet" | "moderate" | "lively" | "either"       // 原則 6 音量軸
      density: "private" | "spacious" | "intimate" | "either"     // 原則 6 密度軸
      lighting: "warm_low" | "neutral" | "bright" | "either"      // 原則 6 照度軸
    }

    // ── 今日の気分（S1 の implicitMood から派生）──
    moodTags: string[]   // ["疲労回復", "祝祭", "静かに整える", "話したい"] 等
  }
  derivationSource: {     // 各軸がどの S1 フィールドから派生したか（narration 由来引用用）
    hungerLevel: string[]
    timeWindow: string[]
    requestedTimeSlots: string[]
    occasion: string[]             // ★ rev 2
    atmosphereDesire: string[]
    moodTags: string[]
  }
}
```

**派生ロジック（例）**:
- `hungerLevel`: `environmental.timeOfDay` + 直近会話に「お腹すいた / 軽く / がっつり」等の regex signal
- `timeWindow`: `environmental.timestamp` + 会話内の時間指示（「今夜」「ランチに」）
- `atmosphereDesire.quietness`: `relationalLens.temperature === "warm"` + `todayReading.mode === "recover"` → `quiet`
- `moodTags`: `todayReading.implicitIntent` + `relationalLens.careAxes` を翻訳（S2 で narration 材料になる）

**重要**: この adapter は **食事ドメインの S2 でのみ使われる**。S1 本体（`TwoPersonLensToday`）はドメイン非依存を保つ。food lens adapter は「S1 出力を食事の視点で読み直す薄い翻訳器」の位置づけ。

### 2.3 Stage 2 詳細: Curate (food)

#### 2.3.1 Food Query Derivation

`TwoPersonLensToday` + `FoodLensToday.foodContext` を food 検索軸に翻訳:

```ts
type FoodQuery = {
  cuisines: string[]              // ["イタリアン", "和食", "カフェ"]（希求 top-3）
  excludeCuisines: string[]       // veto（アレルギー・嫌い）
  priceBand: { minYen: number, maxYen: number } | null
  area: string                    // ユーザー指定 or 推定
  timeWindow: FoodLensToday["foodContext"]["timeWindow"]
  requestedTimeSlots: FoodLensToday["foodContext"]["requestedTimeSlots"]  // ★ rev 2（原則 9）
  targetLocalTime: string | null                                          // ★ rev 2
  occasion: FoodLensToday["foodContext"]["occasion"]                      // ★ rev 2
  atmosphere: FoodLensToday["foodContext"]["atmosphereDesire"]
  reservationUrgency: "tonight" | "this_week" | "flexible"

  // ★ projection coverage（原則 9、S2-b 衛生指標）★
  //   各軸が最終クエリ文字列に射影できたか。observability に載る。
  projectionCoverage: {
    location: boolean
    cuisine: boolean
    exactTime: boolean           // requestedTimeSlots が query に乗ったか
    atmosphere: boolean
    priceBand: boolean
    overallScore: number          // 0-1
  }
}
```

軸の決定は `TwoPersonLensToday.todayReading.mode` × `atmosphereDesire` × `hungerLevel` から派生。

**clarify gate（原則 9）**:
- `projectionCoverage.overallScore < 0.4` かつ会話から追加抽出可能な欠損軸がある場合、generic query を走らせる前に clarify 応答に倒す
- clarify は「新宿で和食、何時頃ですか？」のように **欠損軸を 1〜2 個**に絞って聞く（質問過多は避ける）
- CoAlter の「2人を理解している」存在論に反しないよう、`derivationSource` にある観測は **前提として示し**、欠損だけを聞く

#### 2.3.2 Candidate Generation + Soft Availability Filter

**検索 source 多様性**（GPT 批評を部分採用した Phase B Commit 3 の形を維持）:
1. 食べログ直撃クエリ
2. エリア × ジャンル × 価格帯
3. 営業中・予約可クエリ

`webConnector` の `NO_SEARCH_PATTERNS` 排他は **原則 8（U3 契約）** に従い感情タグ抽出器化する（実装整合タスク §6）。

**Soft Availability Filter**（S2 に残す足切り）:
```ts
function softAvailabilityScore(venue, userArea, timeWindow): number {
  const openNow = hasOpeningHoursMatching(venue, timeWindow) ? 0.4 : 0.1
  const areaFit = venue.station ? areaDistance(venue.area, userArea) < 3_000 ? 0.3 : 0.1 : 0
  const knownDomain = KNOWN_FOOD_DOMAINS.has(venue.sourceDomain) ? 0.3 : 0.1
  return openNow + areaFit + knownDomain   // 0-1
}
```
閾値 0.4 未満は pool から除外。厳密な予約可否検証は S3 に残す。

#### 2.3.3 LLM Ranking + Personality-Rooted Narration（food 版 5 要素）

**CoAlter の核心**。S1 の `TwoPersonLensToday` + `FoodLensToday` + 店カタログを入力として、店を結晶化する。narration は 5 要素構造を **movie と揃える**（汎用性を保つため）:

```ts
type PersonalityRootedFoodPick = {
  venue: FoodVenue
  activityCandidate: ActivityCandidate<FoodVenue>
  confidence: number
  reasoning: {
    personA_lens: string         // 「A さんは〇〇な時に△△を求める傾向があって」
    personB_lens: string         // 「B さんは□□を大事にする人で」
    relational_fit: string       // 「2人の今日の◇◇な空気に、この店は」
    today_hook: string           // 「今日の会話の『〇〇』から、〇〇の店を」
    veto_guard: string           // 「〇〇（A/B の avoid）は外した」
  }
  narrative: string              // 2〜3 文、LLM が reasoning から書き起こす
  fairnessNote: string | null    // 「前回は B さん寄りだったので今回は A さん寄りで」
  atmosphereMatch: {             // 原則 6 の雰囲気 3 軸（narration 引用用）
    quietness: string
    density: string
    lighting: string
  }
}
```

**プロンプト設計**（movie doc §2.3.3 の構造を food 用に移植）:
```
あなたは CoAlter。A/B 2人を誰よりも理解している存在。
Stage 1 Understand が、何ヶ月もの観測から「今日のおふたり」を読んだ結果を渡す。

【Stage 1 Understand の読み】
  A の Personal Lens: {lens.personalLenses.a}
  B の Personal Lens: {lens.personalLenses.b}
  関係の読み: {lens.relationalLens}
  今日の Reading: {lens.todayReading}
  観測の由来: {lens.personalLenses.*.sourcedFrom}
  Fairness 調整: {lens.fairnessAdjustment}

【food 固有の読み】
  空腹度: {foodContext.hungerLevel}
  時間枠: {foodContext.timeWindow}
  雰囲気希求: {foodContext.atmosphereDesire}（音量 / 密度 / 照度）
  気分タグ: {foodContext.moodTags}
  派生由来: {derivationSource}

【今日の会話】{conversation.turns}
【候補店 pool】{candidatePool}（FoodVenue[]）

タスク:
1. 候補から top 3 を選ぶ。単なるジャンル・価格マッチではなく、「この 2人がこの店で 90〜120分過ごすと、何が起こるか」を想像して選ぶ
2. 各候補について reasoning 5 要素を埋める（personA_lens / personB_lens / relational_fit / today_hook / veto_guard）
3. atmosphereMatch で音量・密度・照度の希求との一致を 1 文ずつ
4. 「A さん・B さん」の名前を narration に使う（displayName）
5. fairnessNote: non-null なら rationale を反映
6. lens.sourcedFrom に基づき「過去の〇〇観測から…」の由来引用を narration に必ず 1 箇所以上

禁止:
- 「人気」「ランキング上位」のような集計理由
- ジャンル名だけの理由
- 2人のどちらにも触れない一般論
- pool 外の店を出す（hallucination 防止）
- dataGaps にある薄い根拠の使用
```

#### 2.3.4 Output

```ts
type Stage2FoodCurateResult = {
  topPick: PersonalityRootedFoodPick
  alternates: PersonalityRootedFoodPick[]   // 2〜3 件
  bookingSearchHint: {                      // Stage 3 に渡すヒント
    candidateUrls: string[]                 // 公式 / 予約 SaaS / 食べログ詳細
    reservationNeed: ReservationNeed
    preferredTimeSlots: TimeWindow[]
  }
}
```

### 2.4 Stage 3 詳細: Resolve（予約・時刻・立地）

#### 2.4.1 Concentric Temporal × Geographic Expansion

食事固有の二重制約 Tier（原則 4 再掲）:
```
Tier 0: 指定エリア × 指定時間帯（積集合）
Tier 1a: 指定エリア × 時間帯隣接（時間拡張）
Tier 1b: 隣接エリア × 指定時間帯（地理拡張）
Tier 2: Tier 1a/1b 両 fail → 「薄い」と返す + 代替提示
```

`adjacencyTable`（地理）は movie と共有。`timeAdjacency`（時間）は食事固有:
- dinner 19:00 指定 fail → 18:00 / 20:00 / 明日同時刻
- lunch 12:30 指定 fail → 11:30 / 14:00 / 明日同時刻

#### 2.4.2 Structured Retrieval（公式・予約 SaaS が主、食べログは補助）

優先順:
1. **公式サイトの予約ページ**（最も正確、5 分類 `official`）
2. **公式採用の予約 SaaS**（TableCheck / Toreta / OpenTable、5 分類 `official_reservation_partner`）
3. **食べログ・ぐるなび・ホットペッパー詳細ページ**（5 分類 `third_party_listing`、confidence medium cap）
4. **EXA 補助クエリ**（最終手段）

既存 `bookingResolver.ts` の 5 分類ロジックをそのまま S3 に組み込む。

#### 2.4.3 営業時間 × 予約枠の二重制約 filter

取得した店 × 営業時間 × 予約可枠から:
- 「営業中 AND 予約可」の積集合のみ残す
- `openingHours` が `null` の店は reject しない（Phase B 実装ガード #5、`violates_opening_hours` にしない）
- `reservationNeed === "required"` で予約枠取得失敗なら Tier 1a へ

#### 2.4.4 Output

```ts
type Stage3FoodResolveResult = {
  state: "resolved" | "tier2_fail"
  resolvedAt?: {
    venue: FoodVenue
    tier: "T0" | "T1a" | "T1b"
    confirmedTime: string           // ISO
    seatType: string | null         // 「個室」「カウンター」等
    bookingUrl: string | null
    bookingConfidence: BookingConfidence
    walkingMinutes: number | null
  }
  tier2Fail?: {
    reason: "no_opening" | "no_seat" | "area_thin" | "time_thin"
    alternatives: { type: "different_time" | "different_area" | "different_venue"; suggestion: string }[]
  }
}
```

---

## 3. 1 分 budget の内訳（食事版・depth-first SLO / rev 3）

**SLO の意味（rev 3 で再定義）**: 以下の秒数は **短縮目標ではなく、担保された設計値**。品質（納得度・由来の深さ・2人特化）を削らずに到達できる現実的な値として扱う。

**原則**:
- 下限最適化をしない（「27s を 20s に」は目的ではない）
- 上限は 60s（`Tier1a/1b` 込みで 49s、緊急時 59s まで許容）
- 途中表示は latency 短縮目的ではなく、**「CoAlter が今どう 2人を理解して探しているか」を見せるため**の必須要素
- 途中表示の中身は §3.1 で規定する「理解表現テンプレ」に限定。generic chip（「静か / 賑やか」等の汎用タグ）は禁止

```
┌─ T1: context skeleton (8s 以内) ─────────────────────────────
│   Stage 0 Analysis:            2s
│   Stage 1 Understand:          5s   (movie と共通)
│     └─ 1d food lens adapter:   ≤ 0.1s
│   Query Derivation (S2-a):     1s
│   → Card skeleton push: "2人に合う店を探しています"
│     + derivationSource から「今日の読み」2 行を先出し
└──────────────────────────────────────────────────────────────

┌─ T2a: provisional preview (12-15s) ★ rev 2 新規 ★ ───────────
│   S2-b Candidate Generation:   5-7s（並列 source、soft filter）
│   S2-b projection coverage 判定:  即時
│   → in-card patch:
│     - area / cuisine / priceBand を先出し（narration なし）
│     - 「{area} の {cuisine} で {N}候補」を skeleton に挿入
│     - projection coverage < 0.4 なら **clarify に倒す**（Card 充填せず）
│   目的: narration LLM を待たせず「取れている軸」を視覚化
└──────────────────────────────────────────────────────────────

┌─ T2b: Card v1 full (27s) ───────────────────────────────────
│   S2-c LLM Rank+Narration:     10s（Personality-Rooted 5 要素）
│   S2-d output:                 1s
│   → Card v1 push: What / Why(narration) / When 大枠 / Where skeleton
└──────────────────────────────────────────────────────────────

★ T2b push と同時に S3 並行起動 ★

┌─ T3: Resolve (+12s, 合計 39s) ──────────────────────────────
│   S3a Tier0 fetch:             8s
│   S3b 二重制約 filter:         2s
│   S3c 予約 URL 確定:           2s
│   → Card v2 patch: 具体時刻 / 徒歩分 / 予約 URL
│
│   Tier1a/1b 追加時:            +10s → 49s 合計（1 分以内）
│   Tier2 fail:                  即時
└──────────────────────────────────────────────────────────────
```

**T2a の実装要点（rev 3 で意味を再定義）**:
- T2a の目的は **高速化ではなく、silence を避けつつ「CoAlter が今どう 2人を理解して探しているか」を見せること**
- narration LLM を起動せず、logic のみで「取れている軸」を in-card patch に流す
- 2-pass LLM ではない（軽量）。T2a はロジックレベルで完結、T2b で初めて narration LLM が動く
- projection coverage が薄い場合は T2a 時点で clarify に倒し、T2b/T3 は走らない

**体感**: S3 の 10〜15s は narration 読了時間に吸収される。
**投機的 prefetch**: S2c で top-1 confidence ≥ 0.8 確定時、S3a Tier0 fetch を同時起動可。
**S1 キャッシュ**: movie doc §3 と同様、同 2人の同セッション内 5 分間キャッシュ有効。

### 3.1 途中表示の中身（「理解表現テンプレ」/ rev 3 新規）

silence を避けつつ、generic chip に落ちないための規約。途中表示は以下 3 系統のいずれかに限定する:

| 系統 | 表示タイミング | 中身 | 禁止事項 |
|---|---|---|---|
| **A: 理解表現** | T1 完了時 (8s) | 「A さんの{lens.a 由来}と B さんの{lens.b 由来}が、今日{todayReading}で交差する店を探しています」等、S1 出力の **由来 1-2 点を引用** | 「静か / 賑やか」等の汎用タグ、ジャンル名だけの表示 |
| **B: 軸進捗** | T2a (12-15s) | 「{area} で {cuisine}、{timeWindow} の枠から {N} 候補を絞っています」等、FoodQuery の **射影成功軸**を 1 行 | projectionCoverage に乗っていない軸を名乗ること（偽進捗禁止） |
| **C: 深掘り中** | T2b 直前 (25s 付近) | 「{候補数} 件から、おふたりの{fairness 履歴 or relational temperature}に合う 1 店を選んでいます」 | 候補名を先出しすること（期待を裏切る） |

**原則**:
- 各表示は S1 由来フィールドへの参照を **必須 1 箇所以上**持つ。参照できないなら表示しない（silence より偽表現が悪い）
- 表示は覆い隠し（overlay）ではなく、Card skeleton の一部として漸進的に充填される
- 「今どう理解して探しているか」であり「進捗バー」ではない（数字・%・spinner は使わない）
- 3 系統合計で表示コストは latency に載せない（T1/T2a/T2b の壁時計の内側で完結）

**latency 再掲（rev 3 設計値、短縮目標ではない）**:
- T1 skeleton + 理解表現 A: 8s
- T2a provisional + 軸進捗 B: 12-15s
- T2b Card v1 (full narration): 27s
- T3 Card v2 (resolved): 39s / Tier1 拡張時 49s / 上限 60s

---

## 4. 失敗時の挙動

| 失敗 | ユーザー体験 | 内部動作 |
|---|---|---|
| S1 観測薄い（新規ペア） | 通常通り提案（understanding_confidence 低い旨を narration に控えめに反映） | dataGaps を S2 に渡し薄い根拠を使わせない |
| S1 LLM timeout | logic のみで lens 組み立て S2 へ | 劣化、narration 由来引用率が下がる |
| S2-b projection coverage 薄い | 「{area} で {cuisine}、何時頃で探しますか？」等で欠損軸を 1-2 個聞く | clarify gate 発動、generic query を走らせない（原則 9） |
| S2 候補 0 件 | 「今おふたりに合う店が絞れなかった。もう少し教えて」 | clarify 応答 |
| S2 低 confidence | top-1 + alternate 表示 | ユーザーが選ぶ |
| listicle / news を candidate 昇格しそう | 黙って除外、venue_detail を優先 | page type classifier が direct 昇格を block |
| S3 Tier0 空 | 「今夜の渋谷では予約が厳しい。明日 or 別エリアも探しますか？」 | Tier 1a/1b 自動発火 |
| S3 Tier2 fail | 別時間 / 別エリア / 別候補の 3 チップ提示 | S2 再実行 or 代替 |
| 予約 URL 不明瞭 | 「予約リンクは確定できず、お店ページを案内」 | `bookingResolver` が `unknown` → CTA 非表示 |

---

## 5. U3 感情並列設計の契約（food でも同構造）

**問題（再掲）**: `lib/coalter/webConnector.ts` の `NO_SEARCH_PATTERNS` は「気分 / 感情 / 仲」等の感情語を検出すると `shouldSearch=false` を返す排他ゲート。これにより food theme でも「疲れたから何か食べたい」のような発話で retrieval がスキップされる。

**契約**:
1. **S1 で感情タグ抽出**: `FoodLensToday.foodContext.moodTags` に感情語を正規化して格納
2. **S2 は感情タグを narration の核として使う**: 「疲れた B さんに、静かに温度のある店」等
3. **S3 retrieval は感情タグに依存せず独立起動**: 感情語があっても検索は走る

**実装への転換**:
- `webConnector.decideSearch` の `NO_SEARCH_PATTERNS` 排他ロジックを**廃止**
- 代わりに `lib/coalter/understanding/foodLensAdapter.ts` で moodTags 抽出（軽量 regex + keyword）
- S2 LLM prompt に `moodTags` を明示的に渡す

**これは movie でも同時に解決される**（§1 原則 0 のドメイン非依存性ゆえ）。

---

## 6. 実装マッピング（既存コードの位置づけ直し）

### 6.1 既存 → 三段式の写像

| 既存ファイル | 三段式の位置 | 現状 | 必要な整合 |
|---|---|---|---|
| `lib/coalter/understanding/*` | **S1 共通基盤** | shadow 稼働中（`stage1LiveEnabled=OFF`） | S1 live 昇格は T3 観測後。本 doc とは別線 |
| `lib/coalter/foodCatalog.ts` | **S2-b Candidate Generation** | `parseFoodVenues` + `ActivityCandidate` wrapper 実装済 | 位置づけ直しのみ（構造変更不要） |
| `lib/coalter/foodRanker.ts` | **S2-c Ranking (事実軸)** | 9 hard filter + 9 metrics + compromiseQuality 実装済 | 位置づけ直し + 雰囲気 3 軸対応（密度・照度は負債化） |
| `lib/coalter/foodOrchestrator.ts` | **S2 統合層** | 4-layer thin integration 稼働中 | 入力契約を `ConversationBrief` → `TwoPersonLensToday + FoodLensToday` に昇格（段階的） |
| `lib/coalter/narrationTemplate.ts` | **S2-d Narration** | Commit 4 で logic-based 最小 narration 実装 | **Personality-Rooted 5 要素**に拡張（現状は logic の穴埋め型） |
| `lib/coalter/bookingResolver.ts` | **S3 Resolve** | 5 分類 + confidence 実装済 | 位置づけ直しのみ。二重制約 Tier は新設 |
| `lib/coalter/webConnector.ts` | **S0 Analysis + S2-b retrieval** | `NO_SEARCH_PATTERNS` 排他ゲート稼働中 | **U3 契約で排他廃止 → 感情タグ抽出器化**（§5） |

### 6.2 新規実装が必要なもの（食事 S1 live 昇格前でも着手可な範囲）

| 新規 | 位置 | 粒度 |
|---|---|---|
| `lib/coalter/understanding/foodLensAdapter.ts` | S1-d | 軽量 logic。latency ≤ 100ms |
| `lib/coalter/foodTierExpander.ts`（仮） | S3 | 二重制約 Tier（時間 × 地理） |
| narrationTemplate の Personality-Rooted 5 要素拡張 | S2-d | LLM prompt 改修 + 5 要素型 |

### 6.3 負債として記録（今やらない）

- **雰囲気 3 軸の密度・照度**: 現状 `foodRanker` は音量軸（quietnessFit）のみ。密度・照度は catalog 情報が薄く、parse から作り直しが必要。Phase B の外に出す
- **closed_permanently 検出精度**: 現状 snippet regex 依存。公式サイト HTTP で死活確認する方法は S3 拡張で後追い
- **cross-source dedup**: 同一店が tabelog と retty に出ると別 candidateId 扱い。Phase B スコープ外
- **3 モード対応**: 本 doc は 1 セッション単位の三段式。daily/travel への接続契約（ActivityCandidate の mode-aware 拡張）は daily 設計 doc で詳述

### 6.4 実装整合の順序（CEO 指示による今日の順序に従う）

1. 本 doc CEO 承認
2. **foodLensAdapter.ts 新設**（S1-d、軽量 logic）— requestedTimeSlots / occasion 抽出を含む（rev 2）
3. **foodOrchestrator 入力契約の段階拡張**: 既存の `ConversationBrief` 経路を残しつつ、`TwoPersonLensToday + FoodLensToday` を optional input として追加（互換性維持）
4. **narrationTemplate Personality-Rooted 拡張**: 5 要素構造に切り替え（LLM prompt 変更）
5. **foodTierExpander.ts 新設**（S3 二重制約 Tier）
6. **S2-b Retrieval Hygiene & Constraint Projection**（rev 2 で再命名、今日の主対象）
   本日の本丸は「候補選定」より前段の retrieval 入口。以下 5 点構成:
   - **6-1. Query builder のリファクタ**: FoodQuery の全軸を検索クエリ文字列に射影する責務を独立関数化。`projectionCoverage` を同時算出
   - **6-2. Page type classifier**: URL pattern + snippet heuristics で `venue_detail` / `official` / `reservation_partner` / `third_party_listing` / `news` / `listicle` に分類。`listicle` / `news` は direct candidate 昇格禁止
   - **6-3. Clarify gate**: `projectionCoverage.overallScore < 0.4` で会話から抽出可能な欠損がある場合、generic query を走らせず clarify 応答へ倒す
   - **6-4. Observability 6 指標追加**: `coalter_diagnostics` に以下を常時計測
     - `queryProjectionCoverage`（0-1）
     - `exactTimeProjectedRate`（exactTime 軸が query に乗った率）
     - `pageTypeDistribution`（候補の page type 分布）
     - `missingWhereBySourceKind`（listicle からの where 欠落率）
     - `insufficientInfoBySourceKind`（where/when/price 不足率）
     - `detailPageHitRate`（venue_detail ページ到達率）
   - **6-5. Acceptance test**: 新宿・11時・ラーメン・醤油の regression gate を CI に入れる
     - 期待: query に location+cuisine+time が同時に乗る
     - 期待: listicle は direct candidate に昇格しない
     - 期待: rankedCount > 0
     - 期待: `missingWhereBySourceKind` が rev 1 基準線から激減
7. **U3 排他ゲート廃止**: `NO_SEARCH_PATTERNS` を感情タグ抽出器に置換（movie と同時解決）。廃止完了までは `decideSearch` の `shouldSearch=false` 全件に理由ラベル付き telemetry を必須化

「実装整合」と言える最小範囲は (2)+(3)+(4)+(5) の 4 点。(6) が本日の主対象。(7) U3 は別線・movie と共同。

---

## 7. 文献根拠

| 原則 | 文献 | 食事ドメインでの適用 |
|---|---|---|
| §1 多段分離 | Covington et al. 2016 "Deep Neural Networks for YouTube Recommendations" | candidate generation + ranking の 2段は業界標準 |
| §1 多段分離 | Pinterest PinSage 2018 | multi-stage recommender の実装パターン |
| §1 食事固有性 | Bao et al. 2022 "A Survey on Recommender Systems for Food" | food 推薦は one-size-fits-all が特に通用しない |
| §4 Tier 拡張 | Lynch 1960 "Image of the City" | 日常圏外の提案は mental map を外れる |
| §6 雰囲気 | Mehrabian-Russell 1974 "An Approach to Environmental Psychology" | 環境刺激は approach/avoidance 行動の主要決定因子 |
| §6 雰囲気 | Bitner 1992 "Servicescapes" | レストラン文脈への拡張 |
| §6 文脈依存選択 | Payne, Bettman, Johnson 1993 "The Adaptive Decision Maker" | 選択は文脈で変わる |
| §7 公平性 | Masthoff 2011 (Recommender Systems Handbook) | 逐次推薦の公平性原理 |
| §7 公平性 | Basu Roy et al. VLDB 2010 | Sequential Dynamic Adaptation |
| §0.5 関係性 | Bowen 家族システム理論 | 三角関係介入の禁忌 |
| §0.5 交渉 | Harvard PON 統合的交渉 (De Dreu 2014 Dual Concern Model) | パイ拡大優先 |
| §2.3.3 narration | Extended Mind (Clark & Chalmers 1998) | 理解の累積が CoAlter の核 |

---

## 8. 次ステップ

本 doc は起草完了。CEO レビュー後、以下を実施:

1. **本 doc CEO 承認** → rev 2 として doc 固定
2. **食 実装整合**（§6.4 の順序で）
3. **daily 段階設計 doc 起草**（モード = スコープ境界の契約 + ドメイン adapter 接続）
4. **travel 段階設計 doc 起草**（数日プラン、ActivityCandidate 連結）
5. **実装**（画面上部常駐・@-mention・× 退場の UX も含む）

本 doc は Phase B 期間中は生きた文書として更新し、3 モード設計が確定した時点でクローズする。

---

**本 doc 作成時点の HEAD**: `feat/baseline-edit`
**起草者**: Claude
**承認者**: CEO（判断待ち）
