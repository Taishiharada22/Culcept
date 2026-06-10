# Handoff: Session A — Reality Logic / State Engine（Stage 0）

- 日付: 2026-06-11 / 発行: 契約凍結セッション（claude/xenodochial-chatelet-0023b2）
- 前提: CEO 決定（2026-06-11）により **Session A は契約凍結セッション（本セッション）が継続実行**。起動 GO は設計書 §10.4-2
- 読むべき契約（読み取り専用・変更禁止）: ①`docs/day-state-alter-tab-v0-design.md`（v0.1 = 論理正本）②`docs/alter-tab-visual-contract.md` §4（ViewModel 境界面のみ）

## ミッション

Stage 0: **pure 関数 4 本 + 型 + fixture テストのみ**を実装する。UI なし・CSS なし・PlanClient なし・DB なし・localStorage なし・route 変更なし。

| 関数 | 入力 | 出力 | 契約 § |
|---|---|---|---|
| `buildDayStateRecord()` | facts 入力（anchors / dayIndicators / shift / weather / DayGraph 由来値）+ 既存シグナル（moodCode / bodyEcho / socialBandwidth / **estimatedWalkLevel?**〔dayConditions 由来 optional〕）+ **heartHint?**〔HDM 由来 optional input。import 禁止〕+ 軸事前分布（flag OFF 時は無効） | `DayStateRecordV0`（estimatesFrozen 凍結含む） | 設計書 §3 |
| `gradeNightCheck()` | `DayStateRecordV0` + Night Check 回答（dayFelt / planVerdict / driftSelections） | verdicts + carryOverOut + 翌日 prior 補正値 | 設計書 §4-5 |
| `deriveMomentState()` | `DayStateRecordV0` + DayGraph + 現在時刻（**引数で渡す**。Date.now 直呼びは fixture を壊すので注入） | MomentState（保存しない導出値） | 設計書 §2.1 |
| `buildAlterBatteryViewModel()` | `DayStateRecordV0`（+ MomentState） | `AlterBatteryViewModel` | visual-contract §4 |

## 実装規律（HARD）

1. **新規ファイルのみ**: `lib/plan/dayState/` 配下（dayStateTypes.ts / buildDayStateRecord.ts / gradeNightCheck.ts / deriveMomentState.ts / buildAlterBatteryViewModel.ts / `__tests__/`）。既存ファイルの変更は **import される側を一切変更しない**（型 import のみ可）。
2. **型は必ず `import type` のみ**（TS の型 import はコンパイル時に消去され runtime 依存ゼロ — alterHomeAdapter.ts が巨大でも安全）。**export 済みを確認した型（2026-06-11 grep 証跡）**: `EvidenceSource`（alterHomeAdapter.ts:6904 export type）/ `ConfidentValue`（:6907 export interface）/ `DailyGuidanceMode`（:8039 export type）/ `DailyGuidanceFrame`（:8048 export interface）/ `TimeBucket`（dayGraphTypes.ts:56 export type）/ `ActivityMoodCode`（intent.ts:104 export type）/ `DayConditions`（lib/alter-morning/types.ts:621 export interface。estimatedWalkLevel?: "low"|"medium"|"high" は :633）/ `DensityLevel`（contextModifier.ts:73 export type）/ `ObservationStateInput`（stateWeighting.ts:17 export interface）。energy_level / social_bandwidth の値 union は単独 export が無いため **indexed access type で取得**する: `DailyGuidanceFrame["energy_level"]["value"]` 等（literal の再宣言禁止）。`import type` で解決できない型が出たら契約差し戻し。新設は設計書 §3.1 の 4 enum のみ。
3. **採点方向の fixture 必須**: over = 見立てが実際より高かった → prior 下げ / under = 低かった → 上げ。**方向検証ケースをテストに必ず含める**（設計書 HIGH-1 の再発防止。dayFelt↔帯の対応表 §4.3 を全行カバー）。
   **dayFeasibility の 9 ケース行列も必須**（actual 写像: as_seen→likely_steady / partial_drift→mixed / major_drift→likely_fragile。順序: likely_steady > mixed > likely_fragile）:
   | 凍結見立て \ actual | as_seen | partial_drift | major_drift |
   |---|---|---|---|
   | likely_steady | match | **over**（堅く見すぎ） | **over** |
   | mixed | **under**（脆く見すぎ） | match | **over** |
   | likely_fragile | **under** | **under** | match |
   （凍結 unknown は採点対象外・記録のみ）
4. **凍結の fixture 必須**: 本人補正後も estimatesFrozen が不変であること / user_confirmed 由来の凍結値が match 率系列から除外されること（§3.3 凍結の規律）。
5. **軸係数は flag 構造だけ用意**: `WIRE_DAY_STATE_PRIORS = false` 既定（Stage D。personalModelStargazerAdapter の Stage C は先約あり）。belief への書き戻し禁止。confidence 閾値は bodyLens 3 段（<0.2 不使用 / 0.2-0.5 半係数 / ≥0.5 通常）。
6. HDM heart 状態（heartIntegration.ts）の利用は **read-only・confidence 0.3 上限**（emotionalReserve の参考材料。設計書 §3.3）。
7. **「3」の取り違え禁止**: 人体 3 系統（focusReserve/emotionalReserve/energyLevel）≠ 採点 3 対象（energyLevel/recoveryNeed/dayFeasibility）。重なるのは energyLevel のみ。脳・心は Night Check で採点しない（設計書 §4.3 冒頭注記）。
8. テストは既存規約（vitest）に従う。`npx tsc` は `--max-old-space-size=8192` 必須。

## Reality Graph 境界（Session A で実装するもの / しないもの）

CEO 構想の Reality Graph 7 ノードに対する Session A の境界（設計書 §2.4 が正本）:

| ノード | Session A | 対応物 / 将来の流入点 |
|---|---|---|
| User State | **実装する** | `DayStateRecordV0`（buildDayStateRecord） |
| Moment State | **実装する** | `deriveMomentState()`（injected now で 1 分精度導出・保存なし） |
| Prediction Ledger v0 | **実装する** | `gradeNightCheck()`（DB 書込・本格学習は Stage 2+） |
| Alter 表示変換 | **実装する** | `buildAlterBatteryViewModel()` |
| Event Reality Node | **再実装禁止** | 既存 DayGraph（eventNode/gapNode/latencyTolerance/slack）を入力として消費するのみ |
| Intent / Request Frame | **再実装禁止** | compose 取込 + DG frame 抽出（既存トラック）。会話→構造抽出は Stage 1.5+ |
| Place Candidate Reality | **再実装禁止** | A4 Place Affinity トラック。将来タブの場所候補スロットへ流入 |
| Reality Diff | **再実装禁止** | A3 What-if トラック。将来「調整案を見る」CTA へ流入 |

- これらを Session A 内で**勝手に新設しない**。必要に感じたら契約差し戻し。
- ViewModel への `realityGraphSlots` 追加は**今はしない**（契約凍結維持）。A3/A4 の CEO 判断後に additive な契約改訂として行う。
- **closeout 必須項目**: 上表の境界を遵守したこと（再実装ゼロ・新設ノードゼロ）を明記する。

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
