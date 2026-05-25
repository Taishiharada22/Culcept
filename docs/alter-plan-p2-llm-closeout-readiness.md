# P2 LLM Closeout 帯 Readiness

**Status**: 起草中 (= CEO 「次の本丸 P3 の前に LLM 側 closeout 帯」 指示 2026-05-26)
**Date**: 2026-05-26
**Author**: Build Unit (Claude)
**Scope**: Step 3 暫定 pass 後、 P3 着手前に残す **LLM 運用化** の最小帯。 broad work ではなく、 「観測 → 50+ データ蓄積 → 再分析」 を回す枠組み起草。
**CEO 思考原則 ①〜⑦ 適用**: 「シンプルから始める (③)」 「外科的に緻密 (④)」 「ゴール逆算 (⑤)」 を結合する。

## 0. 結論 (= TL;DR)

3 トラックを順に動かす:

1. **preview canary** (= 限定 user で実 alterNote 出力を流す、 既存 flag 経路活用)
2. **50+ 実データ観測設計** (= 「同 anchor 同文率」 / 「semantic delta 多様度」 / 「『思考』 反復率」 を server log / analytics 経由で集める)
3. **再分析** (= 50+ サンプル後の Stage C 要否 + v3.5 要否判断)

全 3 を **小さく** 進める。 厚い実装は P3 着手後に必要なら追加。

---

## 1. 前提整理

### Step 3 暫定 pass 状態 (= main HEAD `284bd41f`)
- `PLAN_FLAGS.alterNoteLive` env `PLAN_ALTER_NOTE_LIVE=true` で V1/V2 LLM 経路 起動
- `PLAN_FLAGS.personalModelIntegration` env `PLAN_PERSONAL_MODEL_INTEGRATION=true` で V2 + PM injection 経路 起動
- real PM (= aneurasync@outlook.com smoke で確認) → judgmentMode + timePreference を Plan-gate 経由で stable 注入
- v3.4.1 prompt 強化 (= 「〜の時間」 禁止 / hedging / 同名詞反復禁止)
- debug-only `PLAN_ALTER_NOTE_CACHE_BYPASS=true` env で 同 anchor variation 検証可能

### 不確定事項 (= 再分析対象)
- semantic delta の 多 anchor / 多 user 安定性
- 「思考」 過剰繰り返しの production scale 顕在化
- 同 anchor 同文問題の UX 許容性
- Stage C (= recentRhythm) 必要性

---

## 2. Track 1: preview canary

### 2.1 設計原則
- **既存 flag 経路活用** (= 新 flag 不要、 env で OFF→ON 切替のみ)
- **段階展開**: 10% 限定 user → 30% → 50% → 100% (= CEO 承認 per gate)
- **rollback 即可**: env false 戻しで V1 baseline 復帰、 broken state 残らない

### 2.2 候補 user pool (= 10% canary 第 1 段)
| 段階 | user 数 (想定) | 選定基準 |
|---|---|---|
| **canary 1 (= 10%)** | 1〜3 user | CEO + 内部信頼テスター (= aneurasync@outlook.com 含む) |
| canary 2 (= 30%) | 10〜30 user | 初期 β user (= 招待制) |
| canary 3 (= 50%) | 50+ user | 初期 β + 既存 active user |
| full (= 100%) | 全 user | 全 production |

### 2.3 実装 (= 思考原則 ③ シンプルから)
**Option A: env で global ON / OFF** (= 現状)
- `PLAN_PERSONAL_MODEL_INTEGRATION=true` で 全 user で V2 経路
- canary 10% にしたい場合: userId allowlist で gate 追加
- 利点: 1 env で control
- 欠点: 10% 限定が難しい

**Option B: userId allowlist gate** (= 推奨)
- 新 const `PLAN_CANARY_USER_IDS` (= e.g., `PLAN_CANARY_USER_IDS=uid1,uid2,uid3`)
- `enhanceAlterNotesAction` 内で userId が allowlist にあるかチェック
- allowlist 不在 → V1 baseline 維持
- 段階拡大は env 値更新だけで OK
- 利点: surgical、 任意 user 単位
- 欠点: env 管理コスト (= 数十 user 程度は OK)

**Option C: GrowthBook etc. feature flag service** (= 後段)
- 動的 % rollout、 user attribute 経由
- 利点: production-grade
- 欠点: 設定コスト、 まだ user 数少なくて overkill

**推奨**: **Option B** (= canary 1-2 段は user allowlist で十分、 50+ 到達後に Option C 検討)

### 2.4 実装範囲 (= 最小)
- `lib/plan/featureFlags.ts` に `PLAN_CANARY_USER_IDS` 追加 (= comma-separated env)
- `app/(culcept)/plan/_actions/enhanceAlterNotes.ts` で userId が allowlist にあるか check、 なければ options.userId を渡さず V1 fallback
- 単体 test 追加

### 2.5 不変
- default OFF (= production 影響 0)
- env 経由 (= deploy 不要で control)
- rollback 即可

---

## 3. Track 2: 50+ 実データ観測設計

### 3.1 観測指標
| 指標 | 計算方法 | 閾値 (= 推測) |
|---|---|---|
| **同 anchor 同文率** | 同 (category + startTime + location) の異 anchor で alterNote text が完全一致する割合 | 50% 超過で variation 不足 |
| **semantic delta 多様度** | profile 別 alterNote の vocabulary 分布 (= 集中型 user の動詞 set 偏り) | top-3 動詞が 80% 超過なら過剰繰り返し |
| **「思考」 反復率** | 1 user の 1 day 内で 「思考」 を含む alterNote の比率 | 50% 超過で 「思考」 一辺倒 |
| **「〜の時間」 残存率** | alterNote 末尾が 「〜の時間 / 〜する時間 / 〜ための準備」 で終わる割合 | 10% 超過で v3.4.1 効果不足 |
| **validator reject 率** | LLM 出力が validator で reject される割合 | 30% 超過で prompt が厳しすぎ |
| **fallback (= V1 baseline) 比率** | 「unavailable」 後 deterministic に落ちる割合 | 監視のみ |
| **latency P50 / P95** | LLM call の応答時間分布 | P50 < 1500ms、 P95 < 4000ms |

### 3.2 データ収集方法
**Option A: server log 集約** (= 既存 `[plan/alterNote] path` log + 新たに alterNote 出力 log)
- 既存 `console.info` を維持 + 出力 text を追加 log
- 個別 user 関連 PII は出さない (= userId prefix 8 文字 + 短 tag のみ)
- 利点: 既存仕組み流用、 server-only
- 欠点: log scraper が必要、 retention 限定

**Option B: DB persistence (= 新 table or 既存 home_alter_judgment pattern)** ← 推奨
- 既存 home alter で `home_alter_judgment` analytics テーブルが類似 pattern
- 新 table `plan_alter_note_analytics` (= optional、 prod 影響 0):
  - `user_id`, `anchor_category`, `start_hour_band`, `path` (v1/v2), `text`, `latency_ms`, `created_at`
  - RLS は user_id 経由、 admin が 集計閲覧
- 50+ サンプル蓄積後に集計 query を docs 化
- 利点: 構造化、 retention 長期、 集計容易
- 欠点: migration + RLS 設計コスト

**Option C: 既存 analytics 流用**
- 既存 ai_run_log や stargazer_observations を流用
- 利点: 新 migration 不要
- 欠点: 既存 schema が alterNote 出力に最適化されていない

**推奨**: 最初は **Option A (server log)** で開始 (= 既存仕組みのみ)、 50+ 到達見込みが出たら **Option B (新 table)** へ migration 検討。 思考原則 ③ シンプルから。

### 3.3 観測期間
| 段階 | 期間 | サンプル目標 |
|---|---|---|
| canary 1 (= 10%) | 1 週間 | 30+ alterNote 出力 |
| canary 2 (= 30%) | 1 週間 | 100+ 出力 |
| 計 | 2 週間 | **50+ 蓄積を最低条件**、 100+ で再分析 |

---

## 4. Track 3: 再分析

### 4.1 再分析判断 5 軸 (= 50+ データ後)

| 軸 | 判定 | アクション |
|---|---|---|
| 同 anchor 同文率 | < 50% | OK / continue | < 30% | 高品質 / promote |
| semantic delta 多様度 | top-3 動詞 < 80% | OK | > 80% | prompt 弱さ残る → v3.5 検討 |
| 「思考」 反復率 | < 50% | OK | > 50% | 動詞集 vocabulary 多様化 patch |
| 「〜の時間」 残存率 | < 10% | OK | > 10% | v3.4.1 効果不足 / validator 強化 |
| validator reject 率 | < 30% | OK | > 30% | prompt が厳しすぎ → 緩和 |

### 4.2 分岐
- **全 5 軸 PASS** → preview canary 拡大 (= 30% → 50% → 100%)、 LLM closeout 完了
- **一部 PASS** → 該当軸の small patch (= 思考原則 ④ 外科的)
- **多くで FAIL** → Stage C (= recentRhythm) で日ごと差を入れる方が先か検討

### 4.3 不変
- 再分析後の判断は CEO 承認 (= 数値だけで自動採用しない)
- 50+ サンプルでも patch 判断は **small + surgical** (= broad rewrite 禁止)

---

## 5. 工数見積もり

| Track | 内容 | 想定 day |
|---|---|---|
| Track 1 | preview canary (= userId allowlist gate) | 0.5-1 day |
| Track 2 (= server log 拡張) | 出力 text を `console.info` 追加 + docs | 0.5 day |
| Track 2 (= DB persistence、 必要時) | migration + RLS + 集計 query | 1-2 day |
| Track 3 | 再分析 + 判断 | 0.5 day (= 50+ 後) |

**合計**: 即時着手は **1-2 day** (= preview canary + server log)、 50+ データ後の再分析は **0.5 day** で完了予定。 P3 着手の妨げにならない軽量帯。

---

## 6. 不変原則 (= LLM closeout 帯 確定)

- 既存 default false 維持 (= production 影響 0)
- canary 段階展開 (= 10% → 30% → 50% → 100% per CEO gate)
- 再分析判断 は CEO 承認 (= 数値だけで自動採用しない)
- DB schema 変更は CEO 承認 (= migration は別 patch)
- broad rewrite なし
- alter plan scope 限定 (= P3 へ拡張は別 readiness)

---

## 7. CEO 判断仰ぐ (= 着手前)

| # | 質問 | 候補 |
|---|---|---|
| Q1 | LLM closeout 帯 着手 GO? | GO / 保留 |
| Q2 | preview canary 方式 | **Option B (= userId allowlist gate)** / Option A (= global env) / Option C (= GrowthBook 等) |
| Q3 | canary 1 user pool | aneurasync@outlook.com のみ / aneurasync + 内部 1-2 user |
| Q4 | 50+ データ観測方法 | **Option A (= server log)** 先行 / Option B (= 新 table) 一気に |
| Q5 | P3 着手 timing | LLM closeout 全完了後 / canary 1 起動と並行 (= 推奨、 closeout は監視のみで data 蓄積中に P3 進める) |

私の推奨:
- Q1: GO
- Q2: Option B (= userId allowlist、 surgical)
- Q3: aneurasync@outlook.com のみで開始
- Q4: Option A (= server log) 先行、 50+ 見込み時に Option B 検討
- Q5: 並行 (= canary 起動後 P3 に着手、 data 蓄積中の妨害なし)

---

## 8. 次

- CEO Q1-Q5 確定後、 readiness を 「確定」 化
- Track 1 (= preview canary) から実装着手
- Track 2 (= server log) を並行
- Track 3 (= 再分析) は 50+ 到達後
