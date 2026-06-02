# Live Plan Controller — Adaptive Trigger Matrix v1

> 起草: Build Unit / 2026-06-02 / **実装未着手・CEO 承認待ち**
> 親設計 `aneurasync-reality-control-os-phase0-design.md` の §1.4（予定ノード起動窓）を精密化。固定窓を排し、**予定ごとに計算される適応起動**にする。3 本の文献研究で接地。

---

## 0. 前提：固定窓を捨て、2 軸アダプティブにする

CEO 指摘：v4 の `preflight −60/−30` 等は**固定タイマー**に寄る。秘書ではない。
正しくは、起動は予定ごとに **重要度・距離・移動不確実性・現在地・ペース・後続波及・ユーザー傾向** を読んで変える。

**ただし「全予定を常時監視」も誤り**（研究の正直な警告：over-engineering）。正解は **2 軸**：

| 軸 | 内容 | 全予定 |
|---|---|---|
| **軸1：LSAT 計算（always・per-event）** | 各予定の「間に合う最終出発限界」を、重要度由来の percentile と移動時間分布から計算 | ✓ 毎予定 |
| **軸2：監視強度（stakes/不確実性で可変）** | 低stakes・近距離・安定 → 1 回の scheduled wake で十分。高stakes・遠距離・不安定 → 密な再評価＋en-route 追従 | 可変 |

> **これは固定タイマーではない。** 低stakesでも「窓」は**計算された**もの（−60 分固定ではない）。高stakesは連続再評価に昇格。両方とも per-event adaptive。研究結論：「**バッファを置き換えるな、包め**」——加算バッファは定常・低stakesの特殊解として残し、その上に適応制御を被せる。
> **監視の実装分離（重要）**：全予定に LSAT 計算（低頻度）。**高頻度連続再評価へ昇格するのは 高stakes/遠/不確実/後続波及大/低confidence のみ。** 位置監視は **今日の Day Graph 上の重要地点だけ動的登録**（iOS 20 / Android 100 geofence 上限 → 近接・高stakes 順に入替）。「全予定 LSAT 計算」≠「全予定常時監視」。

---

## 1. コアモデル（決定モデル — 初期 decision policy）

> **「数学的に正しい」とは言わない。** critical-fractile / LSAT は **意思決定モデルとして構造が筋が良い** だけで、出力の質は Cu/Co・分布・confidence・ユーザー差分の **推定精度に完全依存**（garbage σ → garbage 出力）。現段階は **初期 decision policy（仮説）** であり PRM で更新され続ける。**構造は固定、パラメータは学習＋境界（Safety Floor）。**

### 1.1 LSAT（Latest Safe Action Time）＝間に合う最終出発限界

```
LSAT(p*) = 必要到着時刻 A − Q_T(p*) − 準備/不可視マージン
```
- `Q_T(p*)` = 移動時間分布の **p* パーセンタイル**（平均ではない。右に歪む分布の上裾で予算する）。近似 `Q_T(p*) ≈ μ_T + z_{p*}·σ_T`（`z` は標準正規分位、`z_.80=0.84 / z_.90=1.28 / z_.95=1.64 / z_.99=2.33`）。
- 分布が無く点ETAしか無い時：Google Routes `PESSIMISTIC` を上裾の種に、または履歴 2 点で対数正規較正 `σ = ln(T95/T50)/1.645`。
- **`p*` は critical-fractile で決まる（恣意でない）**：`p* = Cu/(Cu+Co)`、Cu=遅刻コスト、Co=早すぎ/余白浪費コスト。通勤実測 ≈ 0.80（Small: 遅刻は早着の ~4 倍痛い）。

### 1.2 重要度ティア → percentile（軸1 の核・①に展開）

| ティア | 例 | Cu:Co | **p\*** | 含意 |
|---|---|---|---|---|
| **絶対（catastrophic）** | 飛行機/試験/面接/終電/予約厳格 | ~50:1〜∞ | **0.98–0.995** | 不可逆。near-worst で予算。**step コストは percentile でも不足→明示モデル/さらに上裾** |
| **重要** | 商談/相手が待つ/プレゼン | ~9:1 | **0.90** | 強い遅刻回避 |
| **通常** | 定例/買い物/カフェ作業 | ~4:1 | **0.80** | 実測デフォルト |
| **任意** | ドロップイン/寄り道 | ~1.5:1 | **0.60** | 遅刻軽微・余白を浪費しない |
| **回復** | 休憩/ジム/睡眠 | ≤1:1 | **0.50↓** | 余白・エネルギー保護が punctuality と同等以上 |

> **percentile は固定真理でなく初期仮説（Genome prior）。** 5 ティアは UX 便宜。内部は **学習スカラー「遅刻回避 λ」（user × 予定カテゴリ）** から `p*` を計算し、実測の遅刻・早着・通知反応・カテゴリ別成功率で **PRM 更新**（Cu/Co は人により違う）。
> **λ 一本化は初期実装のみ。** パラメータは最初から **ベクトルで定義**し（`lateness_aversion / waiting_tolerance / prep_latency / mobility_uncertainty / notification_sensitivity / cascade_sensitivity`）、初期は λ のみ学習 → 段階的に非破壊拡張。
> **Safety Floor**：catastrophic（飛行機/試験 等の step コスト）は学習が下げても下限 percentile（≈0.98）を割らせない（quantile では fat tail を取りこぼすため明示下限。§1.8）。

### 1.3 リスク信号 ＋ 行動可能性ゲート（残酷な失敗を防ぐ）

```
R(τ) = P(T > b(τ) | context_τ)        b(τ)=A−τ−prep（今出れば間に合う確率の裏）
```
通知は **R(τ) ≥ 閾値(=1−p*_stakes)** かつ **行動がまだ有効**＝ `b(τ) − S(τ) ≥ Q_T(p_act)` の時。
- **`S(τ)`＝自分の作動遅延**（通知配信＋ユーザー反応時間）。これを引かないと「もう間に合わない」を手遅れで撃つ最悪 UX になる。**必ず PoNR にS込み**。

### 1.4 適応的監視カデンス（軸2）

```
次の起床 Δ(τ) ≈ ( 閾値 − R(τ) ) / max(|dR/dτ|, ε)     ＝「リスクが閾値に達するまでの推定時間」
   clamp(Δ, Δ_min, Δ_max)
```
- LSAT に近づく/不確実性 σ が高い/ルートが volatile → Δ 縮小（密に見る）。遠い・安定 → 疎。
- 実装：**連続ポーリングしない**。次の 1 回だけ scheduled wake を置き、起床時に再計算して次を置き直す（SigmaScheduling `t_k=t̂_k+c·σ_k`：不確実性高→決定点を前倒し）。
- 再計算頻度の目安：>2h=15–30分 / LSAT−30分→1–5分 / en-route=30–60秒。**データが古い→σ拡大→LSAT前倒し（fail-safe）**。

### 1.5 ヒステリシス（flapping 防止・「撃ちやすく、消しにくい」）

- **発火** R ≥ X(=1−p*) → **解除は R ≤ Y（Y<X、deadband ~15-20%）** のみ。
- **dwell**：X 超えを ≥1–2 再計算サイクル（60–120秒）持続して初めて発火（ETA スパイクで撃たない）。
- **再通知間隔** ≥5分（上位バンド X_high 超えのみ即エスカレート）。
- **deadline 近傍で latch**：直前に「やっぱり大丈夫」と引っ込めない。
- **LSAT は一方向ラチェット**：早まる方向は即反映、遅らせる方向は確認後（「2:45→2:55→2:48」のチラつき防止）。

---

### 1.6 LSAT は信頼度付き判断（絶対値で出さない）

LSAT は推定。**必ず confidence ＋ reason を持つ**。
```
LSAT = 13:12   confidence = 0.72   reason = 移動データ少 / 天気不安定 / 駅構内移動未確定
```
低 confidence の効果：(a) σ を拡大しバッファを厚く（LSAT 前倒し）／(b) **監視昇格は confidence 単独で決めない** —— `confidence × stakes × actionability × receptivity` で判断（低 confidence でも **低stakes/行動不能/受容性低 なら内部判断 or silent**。過干渉・電池・通知疲れを防ぐ）／(c) 文面に不確実性を反映（「移動が読みきれないので余裕をみて X 出発が安全」）。
**confidence ＋ 仮定移動時間をユーザーに開示** → 誤 ETA をユーザーが検知できる（Apple の 3.5h 早通知のような失敗を構造的に防ぐ）。

### 1.7 データ成熟度：Cold Start → Warm → Mature

| 段階 | データ | LSAT 算出 | confidence |
|---|---|---|---|
| **Cold** | 実測なし | Routes API 推定 ＋ **予定種別別の保守マージン** ＋ 不可視セグメント default | 低 |
| **Warm** | 個人の移動履歴 | 実測 ＋ PRM 補正 | 中 |
| **Mature** | user×場所×時間帯×手段×天気 の分布 | 条件付き分布 | 高 |

Genome＝prior、実測＝evidence。成熟するほど evidence が支配（共役更新）。**「分布がある前提」で設計しない。分布が無い時の fallback が必須。**

### 1.8 閾値・パラメータの責務分離（固定値にしない）

全パラメータ（percentile, 通知閾値, cadence, deadband, マージン）を 4 層で解決：

| 層 | 役割 |
|---|---|
| **Policy default** | 全体既定（初期仮説） |
| **PRM override** | user × カテゴリ の学習で上書き |
| **Event-specific override** | この予定固有（ユーザー明示・重要度・予約 grace 等） |
| **Safety Floor** | 学習が割ってはならない安全下限（catastrophic buffer 下限・最小 Final Check 等） |

解決順：**Event > PRM > Policy。ただし Safety Floor は常に最優先**（学習結果が catastrophic を危険側に下回らせない）。

## 2. 起動窓タイプ（動的 LSAT に錨）

| 窓 | タイミング | 目的 |
|---|---|---|
| **Long-range** | 朝/数時間前 | 今日の流れ・大きな破綻の事前把握 |
| **Mid preflight** | LSAT−可変（重要/遠/不確実ほど早い） | 出発・準備・移動リスク確認 |
| **Leave-by** | LSAT（=最終出発限界） | 「今出るべき」 |
| **Final Check（CEO 必須・数分前・4 種に細分）** | 予定 −5/−3分 | **出発通知ではない**。下記 4 種を状況で選択 |
| ┗ Arrival Check | 〃 | 目的地に着いているか（geofence/最後既知位置） |
| ┗ Readiness Check | 〃 | 開始できる状態か（準備・持ち物・前提） |
| ┗ Mismatch Check | 〃 | 違う場所にいないか（場所取り違え・別入口） |
| ┗ Communication Check | 〃 | 遅れる/着けないなら相手に連絡すべきか（予約 grace は連絡で延長可） |
| **Post-event** | 終了直後 | 超過したか・後続への波及再計算・満足度 |
| **状態変化イベント（割込）** | geofence/activity/遅延publish時 | LSAT 再計算、必要なら次の窓を前倒し |

> 時刻窓＝backbone（PWA 可）、ジオ＝確証（native）。全ジオに時刻フォールバック対（iOS15 無音故障の前例）。

---

## 3. CEO 指定の 8 マトリクス

### ① 重要度ティア × 窓の強さ
→ §1.2 の `p*`。重要なほど：percentile↑（早い LSAT）／Mid preflight を早く＆多段／監視密度↑／通知閾値↓／Final Check 厳格。任意・回復：単一 leave-by、柔らかく、しばしば silent。

### ② 距離・移動不確実性 × 早期検知（＋不可視セグメント padding）
buffer = `z_{p*}·σ_T` は **σ_T（その経路の変動）に自動比例** —— 遠距離/乗換多/雨/交通不安定＝σ大→LSAT 自動前倒し＆監視密化。
**不可視マージン（routing ETA が見ない時間を first-class に加算・監視）**：

| セグメント | 加算（実測） | Phase |
|---|---|---|
| 準備/egress | ユーザー設定 | 0 |
| 駐車探索 | ~9–15分（NYC 15） | 2 |
| 館内移動（空港/病院/会場） | 数分〜十数分 | 2 |
| 保安/チェックイン/列 | 飛行機=実 deadline は出発でなく **bag-drop −40〜60分/gate −15分** | 3 |
| 予約 grace | レストラン ~15分（連絡で延長可） | 3 |
| rideshare 待ち | request→pickup 別ETA、~5分 | 1 |
| 徒歩ペース | 高齢 18–24%・荷物 3–14% 遅い | 1 |

### ③ 現在状態 × 補正（state partition）
| 状態 | 判断 |
|---|---|
| まだ出発地/前の場所に滞在（leave-by 接近/超過） | LSAT 再計算→Repair。重要なら早期 push |
| 移動開始済・on pace | silent（live surface のみ） |
| 移動中・behind pace（projected>deadline） | 「Hurry up」エスカレート（§④） |
| 目的地接近 | Final Check 準備 |
| 目的地から離れる/逆方向（L3・foreground のみ） | 弱い確認 |
| 同一場所に滞在しすぎ | linger 検知→後続影響を Repair |
| 信号デッド（地下） | dead-reckoning/時刻フォールバック、silent にしない |

### ④ 後続予定への波及度 × 通知/修復強度
**cascade**：1 つ遅延→後続全部遅延（単一leg copilot は未対応＝差別化）。
波及大（後続に hard/重要予定が連鎖）→ 通知閾値↓・早期化・修復アグレッシブ（partial satisfaction で最低価値項を defer）。波及無（最終予定/後続なし）→ 弱く、しばしば silent。

### ⑤ ユーザー過去傾向 × 補正（PRM）
| PRM シグナル | 補正 |
|---|---|
| この種で遅れやすい | σ_T↑・p*↑・LSAT 前倒し |
| 準備に時間がかかる | prep マージン↑ |
| 移動前に余白が要る | leave-by を早める |
| 通知に反応しにくい/疲れ気味 | 通知閾値↑・push→on-open 降格・budget 配慮 |
| 過去にこの時間帯は受容的 | push 許可 |
| 個人の徒歩/運転ペース | σ・μ を個別化 |

### ⑥ 通知 / 内部判断 / silent 分岐（DECIDE 常時 × DELIVER ゲート）
- **DECIDE は常に走る**（LSAT・R・最適行動を計算、沈黙）。
- **DELIVER**：`R≥X(=1−p*)` ∧ 行動有効(§1.3) ∧ receptivity≥閾値 ∧ Permission ∧ 通知信頼残高 ∧ hysteresis 通過 → push（緊急度で L1–L5）。
  - 高stakes＋自動修復可＋authority≥Lv2＋可逆 → 自動実行（L5、事後通知）。
  - 行動が無効（手遅れ）→ push でなく「相手に連絡/再計画」モードに切替。
  - 条件未達 → **silent**（内部判断のみ）or on-open フォールバック（提案を失わない）。
- **1 trip の push 上限**＋ live surface（lockscreen の常時カード）＋ action-only push（Transit/Citymapper 流：行動の瞬間だけ起こす）。

### ⑦ Build / Complete / Repair / Optimize × 起動タイミング
| モード | 主な発火 |
|---|---|
| **Build**（予定なし） | 朝 Daily Secretary（受容性ゲート付き push） |
| **Complete**（余白多い） | 朝／空白発生時（gap-entry）、多くは on-open |
| **Repair**（破綻リスク） | 予定ノード窓（preflight/leave-by/Final Check/post-event）・移動中・遅延publish。緊急は push |
| **Optimize**（状態不一致） | 朝の基準時／昼の再評価／夜の翌日準備。多くは on-open/弱 push |
| **介入なし**（問題なし） | silent（一級の出力） |

### ⑧ 代表シナリオ（16・期待動作）

| # | シナリオ | モード/動作 |
|---|---|---|
| 1 | 予定なしの日 | Build。朝 gated push「今日を組む」 |
| 2 | 11:00 歯医者/18:00 食事 だけ | Complete。間を提案（朝 or 空白時、on-open 寄り） |
| 3 | 遠方の**重要**面接（電車+乗換2） | p*=0.90、σ大→LSAT 早。Mid preflight 早期＋密監視＋Final Check 厳格 |
| 4 | 近場の任意カフェ（徒歩5分） | p*=0.60、単一 leave-by、弱、しばしば silent。常時監視しない |
| 5 | 前の予定が長引き leave-by 超過 | Repair push「このままだと次に遅れる。短縮 or 連絡」 |
| 6 | **重要×遠方なのにまだ家**（現在地遠・未出発） | R 急上昇→早期 push（−60分では遅い。LSAT 由来で前倒し）＝CEO の例 |
| 7 | 移動中だがペース遅い（behind pace） | projected>deadline→「Hurry up」エスカレート＋代替（速いルート/連絡） |
| 8 | 移動中に交通/運休 publish（GTFS-RT delay→乗換危険） | 数値更新でなく **re-plan**。代替便/到着見込み更新 |
| 9 | 空白が生まれた | Complete/Optimize、on-open「この余白の使い方」 |
| 10 | **予定数分前にまだ未到着**（Final Check fail） | 「近くにいますか？開始に入れますか？遅れるなら相手に連絡？」 |
| 11 | 過密の日（充填>80%） | Optimize＋容量真実告知（特定事例提示）。落とす/翌日へ |
| 12 | 雨天 | σ↑→LSAT 自動前倒し、徒歩ペース補正 |
| 13 | 飛行機 | catastrophic p*≈0.99。**deadline=bag-drop −45分**（出発時刻でない）。多段＋保安列 padding |
| 14 | レストラン予約（grace 15分） | soft deadline。遅延時「連絡で延長可」を提示、push は緊急度中 |
| 15 | 駐車が要る目的地 | +12分 padding を first-class。LSAT 前倒し |
| 16 | 地下（信号デッド） | dead-reckoning/時刻フォールバックで Final Check、**silent にしない** |

---

## 4. 被覆設計：枠組みは構造的完全・カタログは学習で増殖

> **「漏れゼロ」とは言わない。** 現実の予定・移動・体調・人間関係・天気・交通に enumerated completeness は存在しない。正しくは 2 層に分ける：

- **枠組み（決定構造）＝構造的に完全**：`(Phase × State × Importance)` の各セルに起動窓・モード・通知分岐が定義済み。新事象も必ずどれかのセルに落ちる。
- **カタログ（具体 failure mode）＝開いており、学習で増殖**：未知の失敗は **PRM / Drift Event / user correction** から観測し、新カテゴリとして追加。**うまく処理できた手順は Skill Library（Voyager）に蓄積し再利用** ——「シナリオ網羅」でなく「**シナリオを増やし続ける OS**」。

主要 failure mode の現時点の体系（研究 R2、Phase 別）：
- **Phase 0 出発前**：前の予定超過/準備過小/忘れ物で帰宅/stale データ誤 leave-by/rideshare 未手配
- **Phase 1 移動中**：rideshare 待ち/徒歩ペース遅延/途中渋滞/遅延publish/**多段 cascade**/逆方向/信号デッド/天候/電池切れ
- **Phase 2 最終接近**：駐車探索/館内移動/建物違い/降車≠入口
- **Phase 3 会場**：保安列/チェックイン/入場列/予約 grace/複数人依存

> Aneurasync は「漏れを無くした」OS ではなく「**漏れを観測して学習し続ける**」OS。これが硬直しない設計。

---

## 5. ユーザーが嫌うもの → 設計ルール（研究 R2 の苦情クラス）

| 苦情（実例） | 設計ルール |
|---|---|
| 桁違いの leave-by（Apple が 3.5h 早く誤通知） | **直線距離で ETA を sanity-bound**。仮定移動時間を表示してユーザーが誤りを検知できるように |
| 手遅れ通知 | **予測 slack が負に向かう時点で撃つ**（閾値到達後でなく先行）。lead, not lag |
| 設定してない場所への幻の「leave now」 | **明示コミット予定にのみ発火**。目的地を推測して撃たない |
| 望まぬ既定・切れない | per-event opt-in/1 タップ dismiss |
| 通知過多 | live surface 1 枚＋action-only push＋quiet hours＋trip 毎 push 上限 |
| flapping | §1.5 ヒステリシス（deadband/dwell/latch/ratchet） |
| 無音故障（鳴らない） | **事前「準備完了、見張ります」確認**＋権限チェック＋ローカル fallback キャッシュ（バックエンド/信号断でも silent にしない） |

---

## 6. 出典
適応決定点: SigmaScheduling(Gazi 2025, arXiv:2507.10798) `t_k=t̂_k+c·σ_k`. JITAI: Nahum-Shani 2018. critical-fractile/newsvendor `p*=Cu/(Cu+Co)`. 出発時刻=分位点: EJTL 2025; Fosgerau & Karlström 2010(効用は μ,σ に線形); Small 1982(β/α≈0.61,γ/α≈2.4→~80%ile); Vickrey 1969. 信頼性指標(buffer/planning index, T95, LOTTR): FHWA. 分布: 対数正規(Hunter arXiv:1302.6617), SOTA(arXiv:1408.4490). ヒステリシス/anti-flap: Datadog; SDT(PMC4304641). GTFS-RT delay 伝播/uncertainty: gtfs.org; Routes traffic-model PESSIMISTIC. en-route pace: Kalman/map-matching. 競合パターン(action-only/Hurry up/offline): Transit GO, Citymapper GO, Moovit, Waze Planned Drives, Google/Apple "Time to leave". 失敗モード: 駐車(SpotHero/INRIX ~9分), 館内(wayfinding), 予約 grace, cascade(Delay Management arXiv:2501.18987), prospective memory(remind を要求過多にしない, M&C 2025)。
