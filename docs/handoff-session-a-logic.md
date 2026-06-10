# Handoff: Session A — Reality Logic / State Engine（Stage 0）

- 日付: 2026-06-11 / 発行: 契約凍結セッション（claude/xenodochial-chatelet-0023b2）
- 前提: CEO が Session A 起動を承認していること（設計書 §10.4-2）
- 読むべき契約（読み取り専用・変更禁止）: ①`docs/day-state-alter-tab-v0-design.md`（v0.1 = 論理正本）②`docs/alter-tab-visual-contract.md` §4（ViewModel 境界面のみ）

## ミッション

Stage 0: **pure 関数 4 本 + 型 + fixture テストのみ**を実装する。UI なし・CSS なし・PlanClient なし・DB なし・localStorage なし・route 変更なし。

| 関数 | 入力 | 出力 | 契約 § |
|---|---|---|---|
| `buildDayStateRecord()` | facts 入力（anchors / dayIndicators / shift / weather / DayGraph 由来値）+ 既存シグナル（moodCode / bodyEcho / socialBandwidth）+ 軸事前分布（flag OFF 時は無効） | `DayStateRecordV0`（estimatesFrozen 凍結含む） | 設計書 §3 |
| `gradeNightCheck()` | `DayStateRecordV0` + Night Check 回答（dayFelt / planVerdict / driftSelections） | verdicts + carryOverOut + 翌日 prior 補正値 | 設計書 §4-5 |
| `deriveMomentState()` | `DayStateRecordV0` + DayGraph + 現在時刻（**引数で渡す**。Date.now 直呼びは fixture を壊すので注入） | MomentState（保存しない導出値） | 設計書 §2.1 |
| `buildAlterBatteryViewModel()` | `DayStateRecordV0`（+ MomentState） | `AlterBatteryViewModel` | visual-contract §4 |

## 実装規律（HARD）

1. **新規ファイルのみ**: `lib/plan/dayState/` 配下（dayStateTypes.ts / buildDayStateRecord.ts / gradeNightCheck.ts / deriveMomentState.ts / buildAlterBatteryViewModel.ts / `__tests__/`）。既存ファイルの変更は **import される側を一切変更しない**（型 import のみ可）。
2. **enum は import**: ConfidentValue / EvidenceSource（alterHomeAdapter.ts:6904-6911）、energy_level・social_bandwidth・DailyGuidanceMode（同 :8048-8058, :8039-8045）、density は export 型 `DensityLevel`（lib/plan/context/contextModifier.ts:73）を import（dayGraphAttributes.ts の computeDensity は非 export。export 追加が必要なら契約差し戻し）、TimeBucket（dayGraphTypes.ts:56-63）、ActivityMoodCode（lib/coalter/activity/intent.ts:104）。新設は設計書 §3.1 の 4 enum のみ。
3. **採点方向の fixture 必須**: over = 見立てが実際より高かった → prior 下げ / under = 低かった → 上げ。**方向検証ケースをテストに必ず含める**（設計書 HIGH-1 の再発防止。dayFelt↔帯の対応表 §4.3 を全行カバー）。
4. **凍結の fixture 必須**: 本人補正後も estimatesFrozen が不変であること / user_confirmed 由来の凍結値が match 率系列から除外されること（§3.3 凍結の規律）。
5. **軸係数は flag 構造だけ用意**: `WIRE_DAY_STATE_PRIORS = false` 既定（Stage D。personalModelStargazerAdapter の Stage C は先約あり）。belief への書き戻し禁止。confidence 閾値は bodyLens 3 段（<0.2 不使用 / 0.2-0.5 半係数 / ≥0.5 通常）。
6. HDM heart 状態（heartIntegration.ts）の利用は **read-only・confidence 0.3 上限**（emotionalReserve の参考材料。設計書 §3.3）。
7. テストは既存規約（vitest）に従う。`npx tsc` は `--max-old-space-size=8192` 必須。

## 触ってはいけないもの

PlanClient.tsx / FlowTab・CalendarTab・MapTab（A0-A4 dogfood 表面）/ plan_drift_events への書き込み / supabase migrations / `REALITY_ALTER_BRIDGE_LIVE` / morningPipeline / Home AskHero / push・notification 経路 / production env / `alter_morning_plan_history` スキーマ。

## 作業規律（リポジトリ共通）

- 開始時と commit 前に `git branch --show-current` / `git status --short -uall` / `git log --oneline -5`（CLAUDE.md Rule 8）
- `git add` はファイル個別指定。stash / reset --hard 禁止（Rule 7）
- 30 分以上 or 3 ファイル以上で必ず commit

## Definition of Done

- 4 関数 + 型が pure で完結し、fixture テスト全 PASS（方向検証・凍結検証・band↔visualFill 整合検証を含む）
- `npx tsc` の新規エラー 0
- runtime 不接続（どの route / UI / 保存からも呼ばれていない）
- closeout doc（`docs/day-state-stage0-closeout.md`）に実装ファイル・テスト結果・契約との差分ゼロ確認を記録

## 契約変更が必要になったら

実装で契約の穴を見つけた場合、**勝手に型や規約を変えず**、closeout に「契約差し戻し事項」として記録して停止する（契約の正本は契約凍結セッションが管理）。
