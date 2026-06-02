# Aneurasync Reality Control OS — Phase 0 詳細設計 v5

> 起草: Build Unit / 2026-06-02 / **実装未着手・CEO 承認待ち**
> v4: 二層構造（Daily Plan Engine ＋ Live Plan Controller）に再定義。**予定ノードごとの起動窓**を明示（3 回起動の誤読を排除）。エンジンを「ゼロから組む」でなく「既存予定を土台に Build/Complete/Repair/Optimize する 4 モード」に訂正。Google Maps 類比を中核に。
> v5: Adaptive Trigger Matrix（別書）を統合（§1.6）。7 補正適用＝percentile は初期仮説で PRM 更新／LSAT に confidence＋reason／Cold-Warm-Mature fallback／「gap-free」撤回（枠組み完全・カタログ学習増殖）／全予定 LSAT 計算≠常時監視／Final Check を 4 種に細分／閾値を Policy・PRM・Event・Safety Floor の 4 層に。

---

## 0. 前提（最初に固定する）

| 項目 | 確定 |
|---|---|
| **正体** | 秘書は **1 つ**。側面が 会社 × 管制塔 × 神経系 × 記憶装置 × 最高知能の秘書。**ユーザーを支配する力を持つ、人間のための OS**（支配ではなく、正しく・効率よく・合理的な方向へコントロール。最終決定はユーザー） |
| **設計主軸** | **Full-Day Secretary OS = 2 層**：`Daily Plan Engine`（基準を組む中枢）＋ `Live Plan Controller`（予定ノード前後・移動・滞在・空白・遅延で起動する制御層） |
| **起動モデル** | 常時監視ではない。**3 回起動でもない**。**予定ノードごとに前後の起動窓**を持ち、各窓で現在地・状態・移動・滞在・次予定への影響を再把握する |
| **エンジンの本質（重要）** | **ゼロから全部組む AI ではない。既存予定を尊重し、土台に推論する。** ユーザーが作った予定を**完成品とみなさず**、Aneurasync 独自ロジックで——Google Map の最適ルートのように——最適解・アイデア・動き方・無数の修正を加える |
| **介入条件** | 空白・余白・破綻リスク・未充足の目的・状態不一致がある時だけ介入。**問題なければ介入しない（silent）** |
| **中核モデル** | **PRM**（実行動・修正・移動・反応・現実差分）。Genome は prior（補助） |
| **設計の主語** | Native-first Control Loop。PWA は先行検証 adapter |
| **配信原則** | **DECIDE（沈黙・常時・最大アグレッシブ）／ DELIVER（受容性ゲート・高精度低頻度）を分離** |
| **研究の扱い** | 方向性の補強として用い一般化しない（「30% 低下」は医療アラート文脈／「SDT が実証」でなく「示唆」） |

---

## 1. 本丸：Full-Day Secretary OS（二層）

### 1.1 二層構造

```
┌─────────────────────── Full-Day Secretary OS ───────────────────────┐
│                                                                      │
│  ① Daily Plan Engine（中枢）                                          │
│     既存予定を土台に、その日の基準プランを 4 モードで成立させる         │
│     Build / Complete / Repair / Optimize（介入不要なら何もしない）     │
│                                                                      │
│  ② Live Plan Controller（制御層）                                     │
│     予定ノードごとの前後起動窓で起動し、現在地・状態・移動・滞在・        │
│     次予定への影響を再把握 → 必要なら Repair/Optimize/Complete を起動    │
│     → 受容性ゲート経由で通知・1 タップ修正・再構成                      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Daily Plan Engine** ＝ 基準を作る/整える中枢（主に朝、および予定追加・大変化時）。
- **Live Plan Controller** ＝ その基準を一日を通して**ノード単位で**守り続ける制御層。**ここが「3 回起動」ではない核心**。

### 1.2 エンジンの 4 モード（既存予定を尊重し、必要な所だけ介入）

```
既存予定を読む
   ├─ 予定なし/極少          → Build      （一日を組む）
   ├─ 予定あり・余白多い      → Complete   （空白を意味づけて埋める）
   ├─ 予定あり・破綻リスク     → Repair     （成立する形に直す）
   ├─ 予定あり・状態不一致     → Optimize   （移動過多/休憩なし/詰まり等を調整）
   └─ 問題なし               → 介入しない（silent・一級の出力）
```

| モード | 局面 | 例 |
|---|---|---|
| **Build** | 予定なしの日 | 「今日は予定なし。13:30 カフェ→15:00 買い物→16:00 帰宅 が崩れにくい」 |
| **Complete** | 11:00 歯医者 / 18:00 食事 だけ | 間に「13:00–14:30 作業／15:00 買い物／17:20 出発」を提案 |
| **Repair** | 10:00 作業→11:15 打合せ（移動 30 分で破綻） | 「このままだと間に合いません。作業を 10:35 終了が安全」 |
| **Optimize** | 成立はするが移動過多/休憩なし/夜詰まり | 配置を調整して負荷を均す |

> **これが「支配する力 ＋ ユーザー尊重」の両立点**：制御は「最適化（空白・破綻・洗練）」に対して支配的に効かせる。ユーザーが置いた予定そのものは奪わない。

### 1.3 Google Maps 類比（エンジンの identity）

```
Google Maps：目的地を置く → 最適ルート ＋ 代替案 ＋「今出発」＋ 渋滞回避
Aneurasync ：既存予定を置く → 最適な一日 ＋ 代替案 ＋ 出発/修復 ＋ 洗練・アイデア
```
ユーザーの予定 ＝ **入力（素材）であって完成品ではない**。Aneurasync 独自ロジックで最適解・動き方・多数の修正を加えて返す。

### 1.4 Live Plan Controller：予定ノードごとの起動窓（3 回起動でない核心）

各予定ノードが**前後に複数の起動窓**を持つ。N 予定の日は ~2N＋空白＋境界の起動点を持つ（≫3）。
**起動タイミングは固定でなく予定ごとに計算する**（重要度・距離・移動不確実性・現在地・ペース・後続波及・ユーザー傾向で可変）。厳密な計算ロジック（LSAT/critical-fractile・適応カデンス・ヒステリシス・8 マトリクス・シナリオ）は **→ `aneurasync-live-plan-controller-adaptive-trigger-matrix.md`** に分離。

| 起動窓 | タイミング | 動作 |
|---|---|---|
| **build-up / preflight** | LSAT−可変（重要/遠/不確実ほど早い） | 次予定の準備・出発逆算を再把握 |
| **Final Check（数分前）** | 予定 −5/−3 分 | 到着済か/場所違いないか/準備/開始可能/遅れるなら連絡（出発通知でない） |
| **departure-line** | leave-by 時刻 | 「出発未確認なら発火」（Repair） |
| **arrival** | 目的地 ENTER（native） | 到着確認・後続再把握 |
| **linger / overstay** | 滞在中/予定終了後 | 滞在しすぎ検知（DWELL/CLVisit＋時刻） |
| **post-event impact** | 予定終了時 | 超過したか・後続への波及を再計算（Repair/Optimize） |
| **gap-entry** | 空白が開いた時 | Complete/Optimize |
| **movement** | 出発/到着検知 | World State 更新 |
| **external** | 直近ノードの遅延/天気急変 | Repair |
| **day 境界** | 朝/夜 | 朝＝基準 Build/Complete、夜＝学習＋翌日先組み |

> 常時監視ではなく、**OS とサーバに待たせ、ノード窓で起きて判断**（時刻＝backbone、ジオ＝確証。全ジオに時刻フォールバック）。

### 1.5 1 spine ＋ N generators／状態機械

共有 spine：World State／判断スコア核／Receptivity Gate／Permission／PRM 学習。
generator：Build／Complete／Repair（Departure を含む）／Optimize（＋Phase1: Routine/Travel）。
状態機械：`PlanSeed(active) →[Engine]→ DraftPlan(pending) →[1-tap/調整]→ ExternalAnchor + if-then →[drift]→ plan_drift_events → PRM`。既存型：[plan-seed.ts](../lib/plan/plan-seed.ts)／[draft-plan.ts](../lib/plan/draft-plan.ts)（`basedOn:{anchorIds,seedIds,rhythmSnapshot}` 既存）／[external-anchor.ts](../lib/plan/external-anchor.ts)／[plan_drift_events](../supabase/migrations/20260430110100_plan_drift_events.sql)。

---

### 1.6 Adaptive Trigger Matrix の統合（どこで使われるか）

別書 [`aneurasync-live-plan-controller-adaptive-trigger-matrix.md`](./aneurasync-live-plan-controller-adaptive-trigger-matrix.md) の logic が本 OS に接続される箇所：

| 使用箇所 | Matrix の何を使うか |
|---|---|
| **Daily Plan Engine（中枢）** Build/Complete | LSAT・percentile・不可視マージンで「実現可能な配置」と feasibility 判定。容量真実告知は RCF/percentile |
| **Live Plan Controller（制御層）** | **Matrix 本体** ＝ per-node 窓・R(τ) 監視・適応カデンス・ヒステリシス・behind-pace・通知/内部/silent 分岐・Final Check×4 |
| **Repair モード** | Live Controller の窓（leave-by 破綻・behind-pace・遅延 publish）が起動 → 最小摂動修復 |
| **Optimize モード** | 朝/昼/夜の窓で過密・slack 健全性を再評価 |
| **横断パラメータ** | confidence・Cold/Warm/Mature・閾値 4 層（Policy/PRM/Event/Safety Floor）が Engine と Controller 双方を parameterize |

## 2. アーキテクチャ（1 つの秘書 = 5 側面）

```
① Reality Signal Sources     Trigger Source 抽象（native/PWA 差し替え）
② World State【管制塔基盤・常時保持】予定/現在地/服の好み/天気/過去行動/今日の目的/次予定/移動余裕/状態/権限/通知信頼残高
③ 神経系：Specialist Monitors【常時・静か・DECIDE】各部署が監視対象を持ち concern-event を上げる
     移動部署「15 分後 遅延リスク」/予定部署「滞在延長が後続に影響」/服部署「今日の天気でこの服は微妙」
④ Selective Activation Router【MoE 的】trigger/ノード窓に関係する specialist・DB・記憶だけ起動（全部呼ばない）
⑤ Day Graph（既存）→ Specialist Logic（決定論・JSON）
⑥ Daily Plan Engine（管制塔）：モード判定 → generator → スコア → 最適案 1 つ＋理由＋別案（Skill Library 参照）
⑦ Verifier → ⑧ Receptivity Gate（deliver-now/hold/on-open/silent）→ ⑨ Permission Gate（Lv0–5）
⑩ Notification Secretary（autonomy-supportive 文面・理由・1 タップ。LLM は文面/例外のみ）
⑪ Action / Repair → if-then 化
⑫ PRM Learning（実行/拒否/修正/無視/通知反応/現実差分 → ②③⑥⑧ と Skill Library へ還流）
```
- **常時の判断は状態 DB・検知ロジック・判断エンジン・ルール・検証器**。曖昧理解・説明・例外のみ LLM（MRKL/ReAct）。
- 神経系（③）は常時だが静か。届くかは ⑧ DELIVER が決める＝「常時監視せず気づく」。
- **Skill Library（Voyager 的）**：成功手順を `(状況→手順)` で蓄積・再利用（Phase 1 本格化、Phase 0 は記録）。

---

## 3. Trigger 体系（5 分類）＋ Source 抽象（位置は 3 段階信頼度）

| # | 分類 | 例 | 実機信頼 |
|---|---|---|---|
| 1 | **Time** | ノード窓（preflight/leave-by/post-event）/朝/夜/空白 | 🟢 backbone |
| 2 | **Location** | L1 確実(到着/離脱/接近)・L2 推定(滞留/未出発)・**L3 弱(逆方向…Phase0 外・foreground のみ)** | 段階別 |
| 3 | **External** | 天気/交通遅延/運休 | 🟡 Routes＋GTFS-RT・cache |
| 4 | **Behavior** | 通知無視/未更新/滞在傾向/反復遅延 | PRM 由来 |
| 5 | **State** | 疲労/集中低下/過密/予定なし/回復不足 | PRM＋Context 由来 |

Source 抽象：`ScheduledPushSource`(Time,🟢PWA)／`ServerEventSource`(External)／`BehaviorStateSource`(PRM)／`GeofenceSource`(L1-2,native)／`ActivitySource`(移動開始,native)。Control Loop は `RealityEvent` を入力とし出所を問わない。

---

## 4. World State（常時保持・管制塔の基盤）
ユーザーが聞く前に既に内部に状態を持つ。保持：当日/次予定・移動余裕（anchors+Day Graph+slackAnalysis）／現在地（Geo）／天気（jma）／服の好み（wardrobe 補助）／過去傾向（PRM）／今日の目的・Plan Mode（seeds+朝入力）／状態（aneurasyncIntegration）／権限・通知信頼残高。神経系が各部署で常時軽く評価し concern-event を上げる。

---

## 5. PRM ＋ Skill Library
Genome=prior／PRM=evidence／行動=posterior（`bayesianAxisUpdater` 踏襲）。スパイン＝既存 `plan_drift_events`（append-only）→派生 `personal_reality_model`（rollup）。保持：Plan 操作／現実差分／**通知反応**（表示・推奨タップ・別案・無視・遅れて開いた・適用・取消）／**所要時間モデル**（活動種別分布・個人補正係数・median→p75、cold-start は PERT/×1.5/×2）／**通知信頼残高**／**習慣化状態**／派生シグナル／**Procedural Memory(Skill Library)**。correctionMemoryFrame を合流配線。

---

## 6. Daily Plan Engine（4 モード generator ＋ スコア）

- **Build**：hard 先置き → seed を RCF 見積り合算（segmentation 回避）→ 構造化候補サンプリング（締切/優先度→締切/rhythm 適合/類似クラスタ）→ slack 挿入（充填 ≤~80%）→ 最適 1 案＋理由。
- **Complete**：既存予定の間の空白を分類（移動余白/回復/作業/食事/寄り道/危険な詰まり）→ 次便逆算込みで意味づけ。
- **Repair**（Departure 含む）：drift 分類 → undone tail のみ再配置（安定性=移動+削除の最小化）→ 進行中/直近を凍結 → slack 吸収 → 不足なら tail を Δ シフト → 溢れたら partial satisfaction（最低価値項を defer＋通知）→ 大規模乖離のみ再計画 → 全移動 rate-limit＋理由。
- **Optimize**：成立済みだが状態不一致（移動過多/休憩なし/夜詰まり）を調整。Google Maps 的「より良い動き方」の提示。
- **スコア**（feasibility は gate）：締切充足＋優先度加重 seed 価値＋rhythm 適合＋slack ＋**−過密**（>~80%、不可能な日は提示拒否→真実告知）＋**−切替数**＋−修正不整合＋**−不安定**（修復時の支配項）。重みは PRM 個別化。
- **容量の真実告知**：統計でなく**特定事例**（「"報告書"に 45 分。直近 3 回 80/95/70 分。約 2.5h 超過」）。

---

## 7. Delivery / Notification（DECIDE 沈黙 × DELIVER ゲート）
配信＝{ push-now / hold / on-open / **silent**（一級出力） }。
- **push-now**：朝 Daily Secretary（§9.2 条件付き）／時間的緊急（Departure 等の不可逆 miss）／受容性高 ∧ breakpoint。
- **on-open**：push 条件を満たさない時のフォールバック（提案を失わない）。
通知 5 階層 `f(urgency,confidence,reversibility,authority)`：L5 自動実行(取消可)/L4 自動準備/L3 強い介入/L2 1 タップ(既定)/L1 見るだけ。
文面：①状態承認 →②本人パターン由来の理由（自己理解）→③推奨案 →④1 タップ「これで進む/調整」（menu でなく 1＋fork）→ 高 stakes は⑤自由の肯定。承認で if-then 化。default は透明。

---

## 8. Permission Gate / Secretary Authority
Lv0 提案／Lv1 1 タップ／Lv2 5 分可逆自動／Lv3 低優先移動自動／Lv4 旅行中自動修復／Lv5 完全秘書。初期＝全員 Lv0–1、**昇格は PRM 的中率で領域別解放**。常に確認必須：他人との予定/予約/支払い/長距離移動/目的地変更/hard anchor/明示固定。**依存防止**：決定者に保つ／理由で学ばせる／習慣化でプロンプト減衰／時々決定を返す。

---

## 9. Phase 0 範囲（主軸＝Full-Day Secretary OS の二層）

### 9.1 スコープ
```
PRM spine + Best Action spine（モード判定＋scoring）+ Receptivity Gate
+ Daily Plan Engine：Build/Complete/Repair/Optimize generator
+ Live Plan Controller：予定ノードごとの起動窓
+ 通知反応学習
```
**実装順は Departure（Repair）から許容。設計主軸は二層 OS に固定**（移動アシスタント化しない）。

### 9.2 Daily Secretary Morning Loop（基準 Build/Complete の起動・具体化）
**(a) 朝 push 条件（受容性ゲート）** — 全充足で push、欠ければ on-open に降格（提案は失わない）：
```
✓ 当日が空 or under-planned（介入余地あり）
✓ 「朝の秘書」を許可済（onboarding 説明後、既定 on）
✓ 受容性スコア ≥ 閾値（PRM：朝の通知応答履歴。初期は許可=正で楽観、dismiss で適応低下）
✓ 確信度 ≥ 閾値（generic でない一日を組めるだけの anchors/seeds/rhythm がある）
✓ 行動可能な 1 タップ導線あり
✓ 通知信頼残高が枯渇していない
```
> 研究整合：アラーム疲労の害は**低品質・非行動可能・高頻度**通知。**許可済・高確信・行動可能・1 日 1 回・当日直結**の朝 push は研究が**容認する高精度 push**。on-open 既定は本丸否定であり誤り（v2 訂正）。

**(b) 受容性ゲート**：安い特徴（時刻/直近利用/曜日/当日状態）で応答確率推定。未満は hold/on-open。silent は一級出力。
**(c) 最適案生成**：§6 Build/Complete（既存予定を土台に）。
**(d) 1 タップ確定**：「…この流れが崩れにくいです ［この案で今日を組む］［調整］」。組む→DraftPlan を anchors 化＋if-then。調整→軽い編集（IKEA、完了必須）。
**(e) PRM 学習**：朝 push 表示／組む／調整（編集内容）／無視／遅れて開いた → rhythm・朝受容性・嗜好重み・信頼残高。夜に planned-vs-actual。

### 9.3 Live Plan Controller（日中の per-node 制御・具体化）
各予定ノードの起動窓（§1.4）で：World State 再把握 → モード判定（Repair/Optimize/Complete）→ スコア → Receptivity Gate → 通知（緊急は push、他は hold/on-open）→ 1 タップ修正 → 学習。問題なければ silent。

---

## 10. PWA 先行検証 / Native 必須
PWA 先行：Engine 4 モード／PRM／受容性ゲート／**朝 Daily Secretary push**／ノード窓の Time トリガー（preflight/leave-by/post-event）／容量真実告知／5 階層／if-then／seed 捕捉／External(天気)。
Native 必須：到着・滞留の位置確証（Geofence/CLVisit）／逆方向(L3・foreground)／交通遅延 realtime。
> ノード窓の大半は時刻ベースで PWA 起動可。位置確証のみ native upgrade（全ジオに時刻フォールバック対）。

---

## 11. 既存コード接続点・影響範囲
再利用：Day Graph [PlanClient.tsx:412](../app/(culcept)/plan/PlanClient.tsx)/[buildDayGraph.ts](../lib/plan/dayGraph/buildDayGraph.ts)／slackAnalysis [transportTypes.ts:254](../lib/plan/transport/transportTypes.ts)／Seed・Draft・Anchor 型／Genome prior [personalModelStargazerAdapter.ts](../lib/plan/llm/personalModelStargazerAdapter.ts)／LLM 作法 [enhanceAlterNotes.ts](../app/(culcept)/plan/_actions/enhanceAlterNotes.ts)・[alterNoteGenerator.ts](../lib/plan/llm/alterNoteGenerator.ts)／**scheduled push queue＋cron（実証済）** [rendezvous-notification-dispatch](../app/api/cron/rendezvous-notification-dispatch/route.ts)・[sendPush.ts](../lib/notifications/sendPush.ts)・[sw.js](../public/sw.js)／PRM スパイン [plan_drift_events](../supabase/migrations/20260430110100_plan_drift_events.sql)／Context [location.ts](../lib/shared/location.ts)・[jma.ts](../lib/weather/jma.ts)。
新規：`lib/plan/engine/`（4 モード generator＋モード判定＋scoring＋RCF）／`lib/plan/liveController/`（ノード窓スケジューラ）／`lib/plan/delivery/`（Receptivity Gate＋朝 push ゲート＋silent ログ）／seed 捕捉（`plan_seeds`＋repo＋UI）／PRM 派生＋rollup＋Skill Library／`lib/plan/triggers/`（Source 抽象＋汎用 ScheduledPush：per-user TZ・分粒度）／Notification mapper＋文面／Permission Gate＋依存防止／hdmPhaseGate 実 wire／(native track) Capacitor＋`@transistorsoft`＋Routes/GTFS-RT。

---

## 12. 着手順（実装順）＋ 非実装確認
1. PRM スパイン配線（plan_drift_events 拡張＋correctionMemory＋通知反応＋所要時間ログ）
2. Best Action spine 純粋核（4 モード generator＋モード判定＋scoring、I/O 無し、テスト）＋ Receptivity Gate ロジック
3. **Repair generator（Departure）＋ Live Plan Controller のノード窓**（Time backbone）で的中率＝制御力を実証
4. seed 捕捉ファネル
5. **Build/Complete generator ＋ 朝 Daily Secretary push**（本丸の基準層）
6. **Optimize generator**
7. 容量真実告知 ＋ Permission Lv2 解禁
8.（並走）native track：Capacitor → Geofence/Activity snap-in
> 純 TS（型・純関数・テスト）は additive/可逆。**DB マイグレーション実行・native・商用 SDK・Routes 課金は CEO 承認必須。本 v4 では実装に入らない。**

---

## 実装状況（Phase 0 限定実装・additive/test-first・本番未接続）

`lib/plan/reality/`（純関数＋型のみ。DB/push/native/Routes/既存 Plan 本番接続/自動変更なし）:
- `lsat.ts` — critical-fractile / resolvePercentile(4 層+Safety Floor) / invNormalCdf(Acklam) / computeLsat（INV-3/8/21）✅
- `authority.ts` — origin/authority/flexibility/**protectionReasons[]** / isImmovable / repairTouchOrder / promoteOnUserAdoption（INV-5/7/18/23）✅
- `source-trace.ts` — SourceTrace / isTraceable / traceConfidence(noisy-OR) / isWeaklyGrounded / summarizeReasons（INV-4/23）✅
- `change-set.ts` — ChangeOp / ChangeSet / invertChangeSet(atomic undo) / validateUndoability(snapshot 完全性) / changeSetRequiresConfirmation / UndoEntry（INV-24/5）✅
- `prm-event.ts` — PrmEvent 16 kinds / signalPolarity(edited=mixed/undo=unknown) / dedupe / ignoredReason / validatePrmEvent（INV-12, privacy）✅
- `best-action.ts` — **Gate first→score**：evaluateGates(6: safety/permission/traceability/reversibility/whole_part/recovery_core) → scoreCandidate(ScoreBreakdown) → rankCandidates(gate 不通過は best に出さず rejected に理由付きで残す)（INV-1/4/5/16/19/24）✅
- `receptivity-gate.ts` — **DELIVER 層の配信判断**：evaluateReceptivityGate → mode(silent/on_open/push/urgent_push/permission_prompt)。high stakes だけで push しない(stakes×actionability×confidence×receptivity×budget×source-trace×1tap)。urgent も hard block を越えない。朝 Daily Plan push は条件付き許可。no-action 通知禁止（INV-1/9/10/14）✅

未実装（次スライス）: Invariant checker → Golden Scenario fixtures。

## 13. CEO 判断ポイント
1. **v4 採用可否**（二層 OS／4 モード／予定ノード起動窓／既存予定尊重・Google Maps 類比）
2. **起動窓の粒度（§1.4）** — preflight/leave-by/post-event/linger/gap/movement のセットでよいか
3. **朝 push ゲート 6 条件（§9.2-a）**の妥当性
4. **着手順**（§12）でよいか
5. **native track 並走の可否**
6. 承認後の次：§12-1 PRM スパインの実装設計へ。**実装は別途承認**

---

## 14. 出典（方向性の補強として — 一般化しない）
JITAI: Nahum-Shani 2018. 割り込み/受容性: Iqbal & Bailey 2008; Okoshi(Attelia) 2015; Dingler & Pielot 2015; Mehrotra 2016. 閾値/アラート疲労(医療文脈・一般化注意): Nesse 2019; Ancker 2017; Cvach 2012. SDT(自律支持が持続行動に向くことを示唆): Ryan & Deci 2020; Ntoumanis 2021. reactance: Brehm 1966; BYAF Carpenter 2013/Gibson 2023. 選択: Patall 2008; Iyengar & Lepper 2000; Keller 2011. 実装意図 Gollwitzer & Sheeran 2006. IKEA 効果 Norton 2012. nudge/透明 default Thaler & Sunstein 2008; Wachner 2021. 計画錯誤 Buehler 1994; RCF Flyvbjerg; segmentation Forsyth & Burt 2008. 計画修復 Fox/Gerevini ICAPS 2006; Kambhampati; NESA arXiv:1809.01316. スキル蓄積 Voyager(Wang 2023). MoE Switch Transformer(Fedus 2021). ネイティブ: Apple Core Location; Android Geofencing/Activity Recognition; Google Routes; gtfs.org Realtime; Transistorsoft。
