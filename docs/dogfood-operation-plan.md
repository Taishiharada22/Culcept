# Dogfood Operation Plan — Phase A 観測フェーズの運用 runbook

> 2026-06-09 / Build Unit / CEO 指示。Phase A の dogfood 軸ごとに「何を・どれくらい・どう貯めて・何を見て次に進むか」を明文化。
> ★全 flag は gate `flag ∧ NODE_ENV!=="production"` で **production hard block**（dev/dogfood のみ ON）。
> ★全データは local（localStorage）・60 日 cap・rollback は flag `=false` 1 行。

---

## 0. データの貯まり方（共通・1 分で分かる）
| 操作（CEO の日常使用） | 貯まるデータ |
|---|---|
| Map タブで leg を開き **mode を選ぶ** | MobilityObservation（mode×timeband×weekday×weatherKind）→ **MT/ER/Place/weather 反応の主原料** |
| 仮説表示と**違う** mode を選ぶ → 「なぜ変えた？」chip を 1-tap | hypothesisFeedback + **reason**（A0）→ insight/corroboration の原料 |
| leg カードで「実際の所要を記録」 | movementEvent（manual）→ **personal pace** の原料 |
| 予定追加で場所候補を使う | place affinity shadow + safety journal entry |
| カレンダーで日を見る | A3/A2 は**蓄積不要**（その日の構造から毎回計算・読むだけ） |

→ ★**最重要習慣は「leg を開いて mode を選ぶ」**（1 日 2〜3 leg で主要 4 軸が同時に貯まる）。

## 1. 軸別 runbook

### A0 reason / correction
- **観測**: 訂正時の reason 分布・reflection 行（「この区間では、{理由}を理由に…」）の妥当性。
- **貯め方**: 仮説と違う mode 選択→reason 1-tap（triple-gate ゆえ最も sparse・意識して tap する）。
- **最低件数**: insight=leg あたり 3（established=5 ∧ share≥0.67）/ corroboration=全体 5 ∧ tired 3。
- **stable 条件**: established insight の文言が実感と合う。**caution/rollback**: 的外れな reason 反映・「いつも」感の出現（→ reflection は established-only 維持で対処）。
- **flag**: なし（データ gate のみ）。**B/C/D 接続**: D 鏡の核素材。tired は MT corroboration に接続済み。

### A1 personal pace
- **観測**: manual log の貯まり・dogfood readiness 4 check（opt_in / activation_ready_groups / shadow_confirmed_safe / capture_quality）。
- **貯め方**: leg カード「実際の所要を記録」（GPS capture は flag OFF のまま）。
- **最低件数**: 同一 legKey/odKey の繰り返し観測（recurring 区間 3+ 回）が activation_ready の前提。
- **stable→activation 候補**: 4 check 全 pass（`ready_for_dogfood`）→ shadow ON（CEO）→ shadow_confirmed_safe → 反映 ON（CEO）。**caution**: ratio が極端（clamp [0.85,1.25] 外に頻出）・capture 品質低。
- **flag**: PERSONAL_PACE / GPS_CAPTURE / PACE_SHADOW = **全 OFF 維持**。**接続**: C（cross-device 永続化・較正）は production 復帰後。
- ★**運用判断**: 手動ログは負担が高い。**7 日時点で 0 件なら「pace は GPS capture 解禁（CEO 判断）まで休眠」と割り切る**（無理に貯めない）。

### A2 context / weather
- **観測**: 「今日の文脈 ·」行の妥当性（多め/少なめが実感と合うか）・天気 reason の自然さ・**沈黙率**（普段通りの日に出ていないか）。
- **貯め方**: 自動（カレンダーを見るだけ）。density baseline は表示日数 ≥5 日で personalize。weatherKind は mode 選択時に自動付与。
- **最低件数**: baseline=5 日 / weather 反応（personal）= 天候条件下 4 ∧ baseline 4。
- **stable**: 文言違和感なし・過剰 personalize なし。**caution**: 「あなたにしては」が的外れ → baseline 蓄積不足のサイン（一般則 fallback が正常動作か確認）。
- **flag**: CONTEXT_MODIFIER=**true**。**接続**: personal weather overlay live 反映は実データ後+CEO。

### A3 What-if UI（inverse / comparison）
- **観測**: ★蓄積不要（毎日その日の構造から計算）。見るのは (a) **出現頻度**（差がある日にだけ出るか）、(b) 文言（断定/数字に見えないか）、(c) **最大 2 行**遵守、(d) 納得感（「守る意味」が実際の日と合うか）。
- **stable**: 2 週間で違和感報告ゼロ。**caution/rollback**: 毎日出る（contrast gate が緩い）・「最適案」に読める・予定変更に見える → flag OFF。
- **flag**: INVERSE / SCENARIO_COMPARISON = **true**。**接続**: soft connection（設計済・実装は CEO）→ 本流反映は別 gate。

### A4 Place Affinity
- **観測**: reason 行（「よく行く/この条件で選ばれやすい」）の妥当性・safety journal の蓄積（/ceo Console の状態遷移）。
- **貯め方**: 場所候補から選ぶ（destKey 訪問）+ 予定追加時の候補表示（shadow/journal 自動）。
- **最低件数**: P2=総訪問 8 ∧ 場所 2 回以上 / P3 条件付き=条件下 3 ∧ skew≥0.6 / **safety journal=10 entries**。
- **stable→activation 候補**: journal ≥10 ∧ 懸念 0 = `stable_safe` → **ranking ON は CEO 判断**。**caution/rollback**: excessiveShift（rankShift>2）・未訪問の良候補が沈む体感・reason と上位化の不整合（PLACE_AFFINITY_ROLLBACK_CONDITIONS）。
- **flag**: reason=**true** / ranking=**false 維持**。**接続**: P4 DB 永続化は C（production）後。

### Movement Tolerance
- **観測**: 条件別 reason 行（「雨の日は移動負荷の少ない手段を…」）の出現と妥当性。
- **貯め方**: mode 選択（effort 判定可能 = walk/bike/train/bus/shinkansen/car/taxi）。
- **最低件数**: 全体 8 ∧ 条件下 4（skew≥0.2）/ corroboration=A0 reason 5 ∧ tired 3。
- **stable**: 条件と実感が合う。**caution**: 「苦手」と読める表現が出たら設計違反（出ない設計・出たら即報告）。
- **flag**: MOVEMENT_TOLERANCE reason=**true**。**接続**: Day Rehearsal friction 反映は CEO stop gate。

### Energy Rhythm
- **観測**: 「{朝/夜}は活動の記録が多い/少なめ」行の妥当性・**MT 優先（AT MOST 1 行）**が機能しているか。
- **貯め方**: mode 選択（timeband は自動付与・redacted でも算入）。
- **最低件数**: 全体 **12**（4 bucket ゆえ高め）∧ skew 0.15。
- **stable**: profile が実感と合う。**caution**: 「朝型/夜型」と読める表現（設計違反）・schedule 由来の偏りを energy と誤読しそうな文言。
- **flag**: ENERGY_RHYTHM reason=**true**。**接続**: weekend-scoped（裁量信号）は pure 増分候補。

### PRG Readiness Console（/ceo）
- **観測**: 5 状態の遷移（accumulating→dogfooding が蓄積の進捗バロメータ）。**週 1 で /ceo を見る**のが能動チェックの全て。
- **最低件数**: 各軸の閾値に従属（console 自体は集計のみ）。
- **stable**: 表示が各軸の実態と一致。**caution**: needs_attention が出たら当該軸を review（activation しない）。
- **flag**: PRG_READINESS_CONSOLE=**true**。**接続**: B data gate の表示拡張（次設計・pure）。

## 2. 7 / 14 / 30 日の判断基準

### 7 日（うるささ・沈黙の検証）
- ✅ 確認: 全 reason 行が**沈黙すべき時に沈黙**しているか（薄いデータ・差なし・普段通り）。1 画面に同時表示される PRG 行が**過剰でない**か（leg カード 1 行・banner 最大 2+1 行）。文言に断定/数字/人格が**ゼロ**か。
- 📋 アクション: 違和感を見たら**メモ→セッション報告**（即 rollback 級: 断定・数字・予定変更に見える、の 3 つのみ）。pace manual log が 0 件なら休眠宣言。
- 判定: 問題なし → 継続。うるさい → 該当 flag OFF（rollback 1 行）。

### 14 日（Phase B readiness の入口判断）
- ✅ 確認: /ceo Console で **accumulating→dogfooding 遷移**がいくつ起きたか。MobilityObservation の**観測日数**（B の lag-1 最低要件 = 14 観測日に対する進捗）。A0 reason 件数。
- 📋 判断: `docs/phase-b-readiness-gate.md` の data gate と照合 → **B 解凍 / 継続蓄積 / DB read 承認検討** の三択を CEO に提示。
- 文言検証: ready に達した軸の reason 行が**実データで**妥当か（synthetic でなく）。

### 30 日（cross-day / early warning / calibration の本格判断）
- ✅ 確認: 60 日 cap の半分到達。連続観測日ペア数（B1 cross-day の実行可能性）・place safety journal の stable_safe 到達・pace の activation_ready_groups 有無。
- 📋 判断: (a) **B1 cross-day 着手**（gate 満了なら）、(b) **calibration backlog 着手**（実データで閾値較正: strain/recovery/skew 閾値・v0-F tuning 判断点）、(c) **ranking ON**（place stable_safe なら）、(d) 貯まらない軸の**капture 改善 or 休眠**判断。

## 3. ★stop gate（運用中ずっと）
Phase B 実装 / Day Rehearsal 本流反映 / DB・Supabase read / production / Reality apply / 新規データ保存 / UI 追加 / 本番 activation → 全て CEO 判断まで停止。

## 関連
- Phase B 解凍条件: `docs/phase-b-readiness-gate.md`
- A3 soft connection: `docs/a3-soft-connection-mini-design.md`
- Phase A 状態: `docs/phase-a-closeout.md`
