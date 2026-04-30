# CoAlter Stage 1 観測プロトコル（2026-04-20〜）

## 目的

M1 C3（pair onboarding）本番化後の flag ON 状態を定点観測し、次段階（Stage 1 live / narration 解放、G1 Canary 切り出し）の判断材料を貯める。

## 前提（観測開始時の state）

- `COALTER_PAIR_ONBOARDING` = **ON**（pair activation で `onboarded_at` stamp + seed row 生成）
- `stage1LiveEnabled` = **OFF**
- `stage1NarrationEnabled` = **OFF**
- → flag ON 後も Stage 1 の snapshot / narration は飛ばない。ledger seed だけが増える契約。

## 観測タイムライン

| タグ | 実行タイミング | 目的 |
|---|---|---|
| **T0** | flag ON 当日 | 基準線（migration 直後の数値を固定） |
| **T1** | +24h | 新規 onboard の立ち上がり / UX 断絶確認 |
| **T2** | +3 日 | seed cardinality / retro-seed 漏れ |
| **T3** | +7 日 | Stage 1 live / G1 Canary 解放判断 |

## 観測手順

1. `scripts/coalter/stage1-observation.sql` の Q1〜Q7 を **Supabase SQL editor** で順に実行
2. 結果をそれぞれ本ドキュメント §スナップショット の対応列にコピペ
3. T1 以降は T0 との差分を本ドキュメント §判定 に記入

Q1〜Q7 の意味:
- **Q1**: pair 総数・onboarded 比率（enabled 中の activate 率）
- **Q2**: onboarded ペアの seed/normal ledger 件数（契約: seed=1）
- **Q3**: 未 onboarded ペアに seed row が混入していないか（retro-seed 検知）
- **Q4**: accept→activate ラグ分布（p50/p95、負値は時刻バグ）
- **Q5**: normal ledger の進展（Stage 1 OFF のため増えすぎていないか）
- **Q6**: 24h 内の新規 onboard と session 生成の比較（UX 断絶検知）
- **Q7**: G1 Canary 判断用の集約（契約違反 0 / seed cardinality 違反 0 の確認）

## 判定基準

### Stage 1 live / narration 解放（G1 Canary 切り出し）可とする条件

T3 時点で **すべて** 満たすこと:
- **Q3**（retro-seed） = **0 件**
- **Q7**.contract_violations = **0**
- **Q7**.seed_cardinality_violations = **0**
- **Q4**.max_sec ≥ 0（負値なし）
- **Q5**.total_normal_ledger_rows が T0 時点の値 ± 既存 stage2+ 決定の想定範囲内（Stage 1 OFF のため意図しない増加がない）
- **Q6**.new_onboarded_24h > 0（実測可能量が存在する）

### 解放を **見送る** 条件（いずれか 1 つでも該当）

- **Q3** > 0（retro-seed 発生 = cold-start 保護の抜け）
- **Q2** で `seed_count != 1` の行あり（重複 seed / stamp 漏れ）
- **Q4**.max_sec < 0 または異常値（時刻整合性バグ）
- **Q5**.total_normal_ledger_rows が意図せず増加（Stage 1 が意図せず有効化されている可能性）

### 異常時の対応

- **即停止**: `COALTER_PAIR_ONBOARDING=false` に戻す（migration 自体は維持）
- **ログ取得**: `[CoAlter] pairOnboarding.*` で grep、contract 違反のペアを特定
- **roll forward**: 契約違反が軽微なら hotfix、根因が深い場合は schema を touch せず code 側 rollback

## スナップショット（観測結果記入欄）

### T0: 2026-04-20（flag ON 当日 / Step 4 本番化直後）

generated: `2026-04-20T08:29:16.782Z`（`npx tsx scripts/coalter/stage1-observe.ts T0`）

| 指標 | 値 | 備考 |
|---|---|---|
| Q1.total_pairs | 2 | NEW + OLD（Step 4 対象の 2 ペア） |
| Q1.onboarded_pairs | 1 | NEW だけ activate 済み |
| Q1.not_onboarded_pairs | 1 | OLD は activate 未実行 |
| Q1.enabled_pairs | 2 |  |
| Q1.onboarded_ratio_of_enabled_pct | 50% |  |
| Q2 異常行（seed_count != 1） | 0 ✅ | 契約満たす |
| Q3.unexpected_seed_count | 0 ✅ | retro-seed なし |
| Q4.n / p50 / p95 / max | 1 / 0 / 0 / 0（秒） | accept と onboard がほぼ同時（契約どおり） |
| Q4.negative_values | 0 ✅ | 時刻整合 OK |
| Q5.total_normal_ledger_rows | 160 | 基準線（stage 2+ 決定の累積、flag OFF 契約のもと） |
| Q5.pairs_with_normal_ledger | 2 |  |
| Q5.latest_normal_decided | 2026-04-20T08:11:46Z | T0 直前の最新決定 |
| Q6.new_onboarded_24h | 1 | NEW pair を今日 activate |
| Q6.pairs_with_session_24h | 2 |  |
| Q6.sessions_created_24h | 72 | Step 4 で CEO が叩いた分を含む |
| Q7.contract_violations | 0 ✅ |  |
| Q7.seed_cardinality_violations | 0 ✅ |  |

**T0 判定**: 全契約 PASS。基準線として健全。

### T1: +24h

（T0 と同表を複製して記入）

### T2: +3 日

（同上）

### T3: +7 日 — Stage 1 live / G1 Canary 判断

（同上 + §判定基準 への適合状況を最終行に記載）

## 運用ログ連動

- `[CoAlter] pairOnboarding.*` を grep で追い、SQL 観測と不整合がないか突き合わせる
- 本ドキュメントは weekly-review で参照（観測中は閉じない）

## 出口条件

T3 時点で **解放可条件** 全 PASS → `docs/decision-log.md` に「Stage 1 live 解放 / G1 Canary」記載 → CEO 承認 → flag 切り替え。

T3 時点で **見送り条件** にかかる → 本ドキュメントに原因を記録し、別セッションで切り出し修正。観測は延長。
