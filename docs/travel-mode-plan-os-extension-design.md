# Travel Mode = Plan OS 拡張設計（状態マッチング・予約直前化・当日適応）v1

**作成日**: 2026-06-12
**ステータス**: docs-only design draft。runtime / code 変更なし。
**位置づけ**: [coalter-travel-domain-greenfield-design.md](coalter-travel-domain-greenfield-design.md)（2026-05-15、commit 9d3cdd57、18 アイデア・T0-T7 分解済み）への**増補（addendum）**。置き換えではない。
**契機**: CEO directive 2026-06-12 — ChatGPT の AI カレンダー / 旅行プランナー展開を受けた競合ポジショニング再確認 + 「ユーザー状態×エンティティ状態マッチング」「予約直前化」「旅行中コントロール」の追加構想。
**関連**: [weekday-plan-reality-audit-20260612.md](weekday-plan-reality-audit-20260612.md)（平日プラン監査 — 本設計の M2 が監査最大ギャップの解を兼ねる）

---

## §0 ポジショニング（なぜ「旅行プランナー」ではなく「Travel Plan OS」か）

### §0.1 競合の実態（2026-06-12 リサーチ、要点）

| 主体 | 出荷済み | 出荷していないもの（白地） |
|---|---|---|
| OpenAI/ChatGPT | Apps（Expedia/Booking 連携、2025-10）、memory 全会話参照、Tasks、Pulse（プロアクティブブリーフィング） | 「AI カレンダー専用製品」は一次ソース未確認（噂レベル）。複数人モデル・衝突解決なし |
| Google | AI Mode 旅行 Canvas（米国 Labs 限定）、Gemini trip planner | フライト/ホテル予約完結は "In the future"。複数人選好保持なし |
| Expedia **Romie**（最接近競合） | グループチャット解析、天気/閉鎖での代替案、クロストリップ嗜好記憶 | **各メンバーの選好を別個モデルとして保持・衝突解決する設計は確認されず**。学習は嗜好止まりで性格・疲れ方の深層なし。EG Labs alpha 止まり |
| 楽天 Rakuten AI（2026-04 改称・予約機能追加） | 自然言語宿検索→予約完結、履歴ベースパーソナライズ | グループ調整なし、パーソナライズは取引履歴止まり |
| Mindtrip / Wanderlog | グループ協働計画（共同編集・投票） | **合意形成は人間任せ**。per-person 人格モデルなし |

4 つの白地が現存する: **(a) 複数人の性格・制約の別個保持と機械的衝突解決 (b) 旅行をまたぐ correction memory (c) 疲労を変数にした当日再計画 (d) 性格 state × 場所の「なぜあなたに合うか」説明**。Aneurasync の Stargazer 資産（45軸・HDM・内的天気・ペア観測）はこの 4 白地に正対する唯一の構造。

### §0.2 技術的根拠（LLM 単体は構造的に負ける）

- TravelPlanner benchmark（ICML 2024）: GPT-4 の制約全充足率 **0.6%**。2026-05 の追試（arXiv 2605.03308）でも純プロンプティングは最新モデルで **最大 43%**。失敗主因: 制約抽出・生成バイアス・自己修正失敗。
- 一方、**LLM→コード/ソルバ層を挟むと 97.9%**（OpenSymbolicAI 2026-02）。TTG / TRIP-PAL / Google Research も同型。
- → **赤線**: 旅程の制約充足を LLM に任せない。アーキテクチャは「LLM=選好・制約の構造化」→「決定論的ソルバ=制約解決・スケジューリング」→「LLM=説明生成」の 3 層（§4）。ChatGPT が「聞かれたら調べて組む」型である限り、この層構造そのものが防御壁になる。

### §0.3 定義

> **Aneurasync Travel Mode = 1〜2 人の性格・状態・関係性を別個に理解し、現実に成立する旅程を 2-3 案で提示し、予約直前まで整え、当日は事前計算済みの分岐で守り、旅行後の後悔を次回に反映する Plan OS。**

やらないこと（greenfield §10 継承 + 今回確認）: 予約・決済の代行 / スクレイピング / 1 分単位の常時監視（→ §3.M4 で代替） / 3 人以上 / 海外 / 価格・空室の断定。

---

## §1 CEO 2026-06-12 構想 × greenfield 18 アイデアの対応

| CEO 構想（今日） | greenfield での状態 | 本書での扱い |
|---|---|---|
| 各人の好み・NG・体力・予算を別々に保持 | ✅ Idea 5/6/7 + per-person slots（T2） | 継承 |
| 全員の満足度を最大化する 3 案 | ✅ Idea 3 Pareto + Travel-β | §5 で目的関数を精緻化 |
| 揉めやすい条件の事前検知 | ✅ Idea 17 Conflict Pre-detection | 継承 |
| 旅行後の記憶→次回反映 | ✅ Idea 18 Memory Continuity + fairness ledger（実在: `supabase/migrations/20260415100000_coalter.sql`） | §3.M6 で「後悔の構造化」を追加 |
| 詰め込み・疲労の回避 | ✅ Idea 6/16 | §5 で per-person 疲労曲線シミュレーションに拡張 |
| 雨天切替 | △ Idea 15 Anchor-and-Wander のみ | **新規 M4**（分岐事前計算） |
| 共有してよい情報だけグループに出す | ❌ 未設計（Idea 10 の rationale.perPerson はそのまま出すと漏洩する） | **新規 M5**（説明プライバシー） |
| ⭐ ホテル等にも状態を持たせ、ユーザー状態と引き寄せ合う | ❌ 未設計（制約空間はあるが entity 側の状態表現なし） | **新規 M1**（共有 Trait 空間） |
| 予約リンクで予約直前まで整える | △ 「予約は user 側」とだけ規定 | **新規 M3**（Reservation-Readiness） |
| 旅行中 1 分単位で監視・コントロール | ❌ 未設計 | **新規 M4**（チェックポイント駆動に再定義） |
| 1 人でも利用可能 | ❌ CoAlter はペア前提 | §4.2（engine を domain-neutral に） |
| 日常 Plan OS → 複数人 → Travel の順 | — | §6 + 監査結果により **M2 を共通の橋として先行** |

**結論: 今日の構想の約 7 割は 2026-05-15 設計に組込済み。新規は M1〜M5 の 5 モジュール + 配置の再定義（§4.2）。**

---

## §2 前提への異議（CEO 指示①「前提を疑え」の実行結果)

1. **「平日のプランは概ね固まっている」→ 部分的に誤り。** 骨格（anchors/曜日テンプレ/list/map/briefing/Moment）は staging で固まっているが、候補生成・周期推論・accept→plan 化・当日適応・**Stargazer state の消費**が未実装（[監査](weekday-plan-reality-audit-20260612.md)）。「ユーザーを全て理解しているから完全パーソナライズできる」は、観測側は真・接続側は未構築。→ Travel の前提条件ではなく、**Travel と平日が同じ橋（M2）を必要とする**と捉え直す。
2. **「ChatGPT が AI カレンダーに来る」→ 方向は真だが現状は Pulse+Tasks+コネクタの組合せ。** 専用カレンダー製品は一次ソース未確認。脅威の本体は「memory の深化」であり、対抗軸は**構造化された計算可能 state**（チャットログ想起では fatigue curve も Pareto も計算できない）。
3. **「大手はここを取り切れていない」→ 現時点で真。ただし Romie が外堀の半分（グループチャット・天気再計画・嗜好記憶）を埋めている。** 勝ち筋は先行速度ではなく、模倣に観測資産の再構築が必要な深さ: per-person 構造化 state × ペア合意 × correction loop × 説明。
4. **「1 分単位で監視」→ 棄却を提案。** 電池・許諾・気味悪さに加え、LLM の自己修正失敗（arXiv 2605.03308）により当日のリアルタイム再ソルブは技術的にも筋が悪い。→ M4「分岐の事前計算 + チェックポイント駆動」が同じ価値をより堅牢に出す。
5. **「旅行は低頻度（年 1-3 回）では？」→ 真。ただし** (i) 幸福研究（Nawijn 2010）上、価値の主峰は旅行前の期待であり、「次どこ行く？」会話は高頻度に発生する（CoAlter native）。(ii) 旅行は**観測増幅器**: 2 人の疲れ方・譲り方・本音が短期間に濃縮観測でき、Stargazer/ペアモデルに還流する。リテンションの背骨は平日 Plan OS、旅行は深さの証明 + 観測収穫の場。

---

## §3 新規モジュール設計

### M1: Travel Trait Space（ユーザー×エンティティ共有状態空間）⭐ CEO 構想の形式化

**原則: 学習埋め込み（ベクトル DB の opaque embedding）ではなく、解釈可能な共有軸スキーマから始める。** 理由: (1) 説明可能性が製品の魔法（「私たちって、そういう二人だったのか」）に直結 (2) コールドスタートで学習データがない (3) Big Five→旅行選好の予測は実証済み（Alves et al. 2023, UMUAI: n=1,035、性格 5 次元が観光カテゴリ 11 種すべてを有意予測。著者自身が「性格でコールドスタート解消・グループ内衝突緩和」を提案）。

**v1 スキーマ案（24 軸・4 群、各軸 0-1 + confidence）**:

| 群 | 軸（例） |
|---|---|
| 体験 | 静寂↔賑わい / 自然↔都市 / 新奇↔定番 / 文化↔身体 / 映え↔落ち着き / 食中心度 / 温泉・湯度 / ローカル↔洗練 |
| 負荷 | 歩行負荷 / 移動時間耐性 / 行程密度耐性 / 朝の早さ / 混雑耐性 / 階段・坂負荷 |
| 資源 | 価格帯 band / コスパ感度 / キャンセル柔軟性要求 / 事前確定度（計画↔即興） |
| 関係 | 会話が生まれる場度 / プライベート度 / 共同作業度（体験型） / 写真共有度 |

- **User 側ベクトル U** = ①Stargazer 45 軸からの導出 prior（軸→travel 軸の写像表。例: 慎重↔大胆→新奇度・事前確定度、HSP 系→混雑耐性・静寂）②travel 固有 micro 質問（confidence が低い軸のみ、entropy 駆動で 3-5 問。既存 itemDiscrimination/bayesianAxisUpdater 流用）③correction memory による差分（M6）④当日 dynamic state（内的天気: energy/stress）。
- **Entity 側ベクトル E** = 宿・エリア・店・体験を同一 24 軸でスコア。生成方法: Provider Foundation（Anthropic Web Search + Citation + uncertainty、movie 実績 ~90% 流用）で取得したテキストから LLM 抽出 → 軸スキーマに正規化。**規約準拠**: Google Places の生データ蓄積は禁止（place_id + 緯度経度のみ保存可）。Entity Trait は「当社が一次情報から導出した解釈レイヤ + citation」であり、原文の複製を保存しない設計とする。
- **マッチング** = hard filter（red-line: 予算上限・日程・アクセス）→ soft 距離（軸 importance × confidence 重み付き）→ ペア集約（§5）→ Pareto 多様化（greenfield Idea 3）→ 上位寄与軸から説明生成（M5 経由）。
- 将来: 解釈可能軸の残差として学習埋め込みを追加する余地を残す（v1 ではやらない）。

**重要な波及**: この Trait Space は travel 専用にしない。レストラン・週末の外出・デートスポット（CoAlter food / 平日プラン候補）も同一スキーマで表現可能 → **投資が日常 Plan OS に複利で効く**。

### M2: PersonalizationPort（state→plan 接続の正本）

監査が特定した最大ギャップ（Stargazer state が plan 生成にほぼ未配線）と、Travel の必要条件は同一物。**read-only port を 1 つ正本として作り、平日（empty-day / life-ops 候補）と Travel の両方が consume する。**

```
PersonalizationPort（read-only・lib/shared 系の正本原則に従う）
  getTravelTraits(userId): { axes: TraitVector, confidence, sources }
  getDynamicState(userId): { energy, stress, socialBattery, asOf }   // 内的天気
  getPlanParams(userId): { paceDefault, morningness, densityCap, budgetBand, ... }
  getPairContext(pairId): { fairnessLedger, sharedConsent, hdmPhase }
```

- 実装は Stargazer 側の既存永続化（`stargazer_axis_snapshots` ほか — 2026-06-12 精密監査で確定、詳細は [m2-personalization-port-design.md](m2-personalization-port-design.md)）からの読み出し + 写像のみ。書き込みなし。
- これにより「ユーザーを全て理解している」という差別化主張が、初めてコードの事実になる。

### M3: Reservation-Readiness（予約直前化）

「予約はしないが、予約ボタンの直前まで整える」を状態機械として定義:

```
slot(宿・主要体験ごと):
  candidate → compared(3 案比較済) → ok_self → ok_partner → ready(導線提示)
  → booked_self_report(ユーザー申告) → confirmed(将来: 確認メール取込)
```

- ready 時の導線: **Google Maps URLs（key 不要・規約安全）+ 公式サイト URL（Web Search citation 由来）** を MVP とする。OTA deep link（Booking affiliate `deep_link_url` 4.8% / 楽天新 API ※旧 API は 2026-05-14 完全停止済み・新規登録必須）は **CEO 承認後の future phase**（API key・ToS・アフィリエイト契約はすべて承認事項）。
- **断定禁止ルール**: 価格・空室・キャンセル条件は band + 取得時刻 + citation で表示し、確定値として語らない（greenfield Idea 7/8 と接続）。
- プラン全体の「予約可能性」= critical slot がすべて ready → 「この旅は予約に進める状態です」と宣言できる。これが「旅行意思決定 OS」の完成状態。

### M4: Contingency-Precompiled Day-of Loop（当日適応 — 「1 分監視」の置換）

**プラン時に分岐を事前計算し、当日は選択 + 局所修復のみ行う。**

- 各案に最初から同梱: **雨天版 / 短縮版（疲労時）/ 入替版（混雑・閉店時）**。ソルバ予算が潤沢なプラン時に作るため品質が高く、当日の LLM 再生成（自己修正の弱さ）に依存しない。
- 当日はチェックポイント駆動: 朝ブリーフィング（天気確認→wander node 差替提案）/ 昼・午後の 1 タップ疲労チェック（「ちょっと疲れた」→短縮版へ切替）/ イベントトリガ（雨・大幅遅延）。**監視ではなく、適切な瞬間にだけ現れる同行執事。** 世界観整合: 旅行中の surface は A-4-c39 Moment（今の一枚）の拡張として設計でき、新規 surface を増やさない。
- 疲労シグナルは v1 では自己申告 + 行程上の予測値（§5 疲労曲線）。センサー/位置情報による自動推定は将来検討（プライバシー設計とセット、CEO 判断）。

### M5: Explanation Privacy Layer（説明の二層化 + 共有同意）

**問題**: 2 人グループは匿名性が最小であり、greenfield Idea 10 の `rationale.perPerson` を両者にそのまま出すと「B さんは朝が弱いから」等の**非共有情報が説明から漏洩**する。グループ推薦の説明とプライバシーのトレードオフは実在の研究課題（ACM UMAP 2021 ほか）。

**設計**:
- 各制約・特性に `visibility: "shared" | "private"`。private 制約は**プランの形には影響してよいが、相手向け説明文の根拠に使ってはならない**。
- 説明は二層: **本人向け**（自分の private 根拠を含む完全版）/ **相手向け・共同向け**（shared 情報と一般化理由のみ。例: 「2 日目の朝はゆっくり出発にしました（移動が多い旅程のため）」）。
- 説明生成後に **leak check**（post-check: private 軸への言及検出）を通す。HDM P4 の post-check 設計パターンを流用。
- Rendezvous の絶対原則（片想い非表示・追跡的情報非表示）の travel 版として位置づける。

### M6: Regret→Constraint 変換（correction memory の構造化）

旅行後の振り返り（CoAlter Phase 3 reflect と接続）で「移動が多すぎた / 宿は良かった / 朝が早すぎた」を取得し、**自然文ではなく Trait 軸への差分 + 次回 hard/soft 制約として保存**。fairness ledger（実在テーブル）と並ぶ第二の台帳 = **後悔台帳**。次回プラン時に M2 経由で自動 consume。競合（ChatGPT memory / Romie）の「嗜好の蓄積」と異なり、「判断原理の更新」として効く。

---

## §4 アーキテクチャ

### §4.1 3 層構造（赤線）

```
[1] Understand: LLM — 自然文・会話・観測から per-person slots + Trait 重み + red-lines を構造化（greenfield T2）
[2] Solve: 決定論層 — hard filter → TTDP/OPTW 型スケジューリング（営業時間・移動時間・チェックイン）
      → ペア集約効用（§5）→ Pareto 2-3 案 → contingency 分岐の事前計算（M4）
[3] Explain: LLM — 上位寄与軸から rationale 生成 → M5 leak check → 提示
```

LLM に旅程の整合性責任を持たせない。v1 のソルバは厳密最適化でなくてよい（候補ノード数 ~6/日 のため、貪欲 + 局所探索で十分。MILP は将来）。

### §4.2 配置（greenfield との整合 + solo 対応）

- **engine core を domain-neutral に置く**（`lib/travel/` または `lib/shared/travel*` — Shared Style Domain の「shared=正本のみ・UI ロジック禁止」原則に従う）: Trait Space(M1) / solver / contingency / readiness(M3) / regret(M6)。
- **CoAlter Travel domain（greenfield Travel-β、T1-T7）= ペアの会話・合意 surface** としてこの core を consume。movie scaffold 60-80% 再利用の方針は不変。
- **Plan/Reality track = 実行 surface**: 合意済み旅程を `external_anchors`（companions 列、migration 監査済み）として着地 → 当日は Moment 拡張（M4）が表示。
- **solo 利用**: 集約・同意・fairness をスキップした同一 engine。CoAlter を経由せず Plan surface から直接呼べる。
- これにより「CoAlter にしか旅行がない」「ペアでないと使えない」の両方を回避し、CEO の実行順（日常 Plan OS → 複数人 → Travel）と整合する。

---

## §5 目的関数（学術根拠つき）

旅程スコア = 重み付き合成:

1. **ペア集約効用**: average を主、ただし **least-misery 閾値**（どちらかの満足が閾値未満なら棄却）。根拠: Masthoff — 少人数・親密グループでは不満回避が満足を支配。「片方が大満足 + 片方が我慢」より「両者がほどほど満足」を上位に。
2. **ピーク・エンド設計**: 強いピーク体験 1 つ + 良い最終半日 + 深い谷の回避を加点。平均満足の最大化はしない（Kahneman 1993; Lin 2025 観光実証）。詰め込みは記憶に残らない中間を増やすだけ。
3. **疲労曲線シミュレーション（per-person）**: 各人の開始エネルギー（朝型度）− ノードごとの消耗（fatigueLoad × 個人感受性）+ 回復（食事・温泉・休憩）。**全時点で閾値以上**を制約とし、2 人の予測エネルギー曲線を旅程に重ねて可視化する（「2 日目 14 時に A さんの疲労が閾値を超える予測 → ここに休憩を挿入済み」）。greenfield Idea 6 の累積上限を曲線に拡張。効用の逓減・飽和研究と整合。
4. **公平性**: fairness ledger による時系列公平（greenfield Idea 4/12、Stratigi 2022 が実証する形）。**cross-domain 化**: movie/food/travel で同一 ledger を共有し、「前回の映画は A さん寄りだったので、宿は B さん好みに」を関係レベルで成立させる — OTA には構造的に不可能な差別化。
5. **多様性**: 3 案は乱数ではなく**名前のあるトレードオフ**として生成（例: 案 A=成立性最大の安全案 / 案 B=どちらかの希望に明示的に寄せた案 / 案 C=新奇寄りの攻め案）。どの希望をどこで採用したかの台帳行を必ず付す。

---

## §6 実装順序（greenfield T-phase への挿入）

| Phase | 内容 | 新規/継承 |
|---|---|---|
| T1 | domain types + **M1 Trait Schema v1（軸定義・写像表）** | 継承+M1 |
| T2 | intent/slot 抽出 + **solo path** | 継承+§4.2 |
| **T2.5** | **M2 PersonalizationPort（平日プランと共用の正本）** | **新規・最優先級** |
| T3 | itinerary generator（3 層構造・ソルバ・**M4 分岐事前計算**） | 継承+M4 |
| T4 | 比較 + fairness + **M5 説明プライバシー** | 継承+M5 |
| T5 | resolve + ledger 更新 + **M6 後悔台帳** + anchor export（Plan surface 着地） | 継承+M6 |
| T6 | UI（3 案カード・疲労曲線オーバーレイ・**M3 readiness 表示**） | 継承+M3 |
| T7 | rollout（off/observe/live、Step E パターン） | 継承 |

**MVP 受け入れ基準（案)**: 「7 月に 2 人で温泉、1 泊 2 日、予算 1 人 3 万」という入力に対し、(i) 3 案が名前のあるトレードオフで出る (ii) 各案に宿候補 3 + 理由 + Maps/公式リンク (iii) 雨天版・短縮版が同梱 (iv) どちらの希望をどこで採用したかが書いてある (v) private 制約が相手向け説明に漏れない — の 5 点。

---

## §7 CEO 判断請求

1. 本増補設計（M1-M6 + §4.2 配置 + §6 順序）の承認
2. **M2 PersonalizationPort を Travel に先行して着工する**ことの承認（平日プラン監査ギャップの解と兼用、影響は read-only）
3. 「1 分単位監視」を「分岐事前計算 + チェックポイント駆動」に置換することの承認（M4）
4. greenfield doc の CEO 判断請求 7 項（§12.2）のうち未決分の処理（特に T1 着手 timing）
5. future phase の外部接続（Booking affiliate / 楽天新 API / Google Places key）— すべて承認事項として保留のまま
6. `external_anchors.companions` migration の remote apply 判断（監査済み・待機中）

---

*リサーチ出典（競合・学術の詳細とソース URL 一覧）はセッションログの Research Unit 報告 2 本を参照。主要根拠: TravelPlanner (ICML 2024) / arXiv 2605.03308 (2026-05) / OpenSymbolicAI (2026-02) / Masthoff GRS Handbook / Stratigi+ 2022 / Alves+ 2023 (UMUAI) / Kahneman+ 1993 / Nawijn+ 2010 / ACM UMAP 2021 / Skift・楽天・Google 公式各リリース。*

🤖 Generated with [Claude Code](https://claude.com/claude-code)
