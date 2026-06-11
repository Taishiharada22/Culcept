# Handoff: Session A — Reality Logic / State Engine（Stage 0）

- 日付: 2026-06-11 / 発行: 契約凍結セッション（claude/xenodochial-chatelet-0023b2）
- 前提: CEO 決定（2026-06-11）により **Session A は契約凍結セッション（本セッション）が継続実行**。起動 GO は設計書 §10.4-2
- 読むべき契約（読み取り専用・変更禁止）: ①`docs/day-state-alter-tab-v0-design.md`（v0.1 = 論理正本）②`docs/alter-tab-visual-contract.md` §4（ViewModel 境界面のみ）

## ミッション

Stage 0: **pure 関数 4 本 + 型 + fixture テストのみ**を実装する。UI なし・CSS なし・PlanClient なし・DB なし・localStorage なし・route 変更なし。

| 関数 | 入力 | 出力 | 契約 § |
|---|---|---|---|
| `buildDayStateRecord()` | facts 入力（anchors / dayIndicators / shift / weather / DayGraph 由来値）+ 既存シグナル（moodCode / bodyEcho / socialBandwidth / **estimatedWalkLevel?**〔dayConditions 由来 optional〕/ **interpersonalLoadHint?**〔対人密度 optional・§3.3 ③〕）+ **heartHint?**〔HDM 由来 optional input。import 禁止〕+ **personaCoefficients?**〔`PersonaCoefficientsV0`（設計書 §8 で凍結）。optional input・実導出は Stage D〕 | `DayStateRecordV0`（estimatesFrozen 凍結含む） | 設計書 §3 |
| `gradeNightCheck()` | `DayStateRecordV0` + Night Check 回答（dayFelt / planVerdict / driftSelections） | `NightCheckGradeV0`（下記。**戻り値型も凍結済み**） | 設計書 §4-5 |
| `deriveMomentState()` | `DayStateRecordV0` + DayGraph + 現在時刻（**引数で渡す**。Date.now 直呼びは fixture を壊すので注入） | `MomentStateV0`（**設計書 §2.1 で 14 フィールド凍結済み**。勝手な増減禁止） | 設計書 §2.1 |
| `buildAlterBatteryViewModel()` | `DayStateRecordV0` + `MomentStateV0` + **yesterdayRecord?**〔前日レコード optional。Morning Reveal 表示用 — 事実の再掲なので Stage 1 で読取可。見立てへの数値利用は B1 後〕 | `AlterBatteryViewModel`（morningReveal 含む） | visual-contract §4 |

## 実装規律（HARD）

1. **新規ファイルのみ**: `lib/plan/dayState/` 配下（dayStateTypes.ts / buildDayStateRecord.ts / gradeNightCheck.ts / deriveMomentState.ts / buildAlterBatteryViewModel.ts / `__tests__/`）。既存ファイルの変更は **import される側を一切変更しない**（型 import のみ可）。
2. **型は必ず `import type` のみ**（TS の型 import はコンパイル時に消去され runtime 依存ゼロ — alterHomeAdapter.ts が巨大でも安全）。**export 済みを確認した型（2026-06-11 grep 証跡）**: `EvidenceSource`（alterHomeAdapter.ts:6904 export type）/ `ConfidentValue`（:6907 export interface）/ `DailyGuidanceMode`（:8039 export type）/ `DailyGuidanceFrame`（:8048 export interface）/ `TimeBucket`（dayGraphTypes.ts:56 export type）/ `ActivityMoodCode`（intent.ts:104 export type）/ `DayConditions`（lib/alter-morning/types.ts:621 export interface。estimatedWalkLevel?: "low"|"medium"|"high" は :633）/ `DensityLevel`（contextModifier.ts:73 export type）/ `WeatherCondition`（weatherService.ts: sunny/cloudy/rainy/snowy）/ `LatencyTolerance`（latencyToleranceMap.ts:34。fixed 判定 = strict|tight）/ `ObservationStateInput`（stateWeighting.ts:17 export interface）。energy_level / social_bandwidth の値 union は単独 export が無いため **indexed access type で取得**する: `DailyGuidanceFrame["energy_level"]["value"]` 等（literal の再宣言禁止）。`import type` で解決できない型が出たら契約差し戻し。新設は設計書 §3.1 の 4 enum のみ。
3. **採点方向の fixture 必須**: over = 見立てが実際より高かった → prior 下げ / under = 低かった → 上げ。**方向検証ケースをテストに必ず含める**（設計書 HIGH-1 の再発防止。dayFelt↔帯の対応表 §4.3 を全行カバー）。
   **dayFeasibility の 9 ケース行列も必須**（actual 写像: as_seen→likely_steady / partial_drift→mixed / major_drift→likely_fragile。順序: likely_steady > mixed > likely_fragile）:
   | 凍結見立て \ actual | as_seen | partial_drift | major_drift |
   |---|---|---|---|
   | likely_steady | match | **over**（堅く見すぎ） | **over** |
   | mixed | **under**（脆く見すぎ） | match | **over** |
   | likely_fragile | **under** | **under** | match |
   （凍結 unknown は採点対象外・記録のみ）
4. **凍結の fixture 必須**: 本人補正後も estimatesFrozen が不変であること / user_confirmed 由来の凍結値が match 率系列から除外されること（§3.3 凍結の規律）。
5. **MomentState の fixture 必須**: ①timeBucket 境界（特に late_night 23:00-05:00 跨ぎ = 夜勤日）②departureDeadline の null 正直性（resolved 移動 segment なし → null。分数の捏造禁止）③currentMode 遷移（open→pre_event→in_event→post_event）④timePressure / interventionWindow の閾値境界（15/45 分）⑤isNightCheckWindow の 17:00 / 05:00 境界 ⑥**主観日境界**: 02:00 の導出が前日 date のレコードに属すること（夜勤ケース。設計書 §3.2 date 注記）⑦frozenKind の 3 区分（05:00-11:00 / 11:00-17:00 / 17:00-05:00）と「morning_baseline のみがヘッドライン match 率に入る」層別 ⑧outingTolerance の「grounded signal 2 未満 → unknown」⑨Morning Reveal: 前日 nightCheck 未回答・前日レコード欠如・朝（05:00-11:00）以外 → morningReveal=null（undefined 不可）。B1 解錠前の adjustmentNote が「記録した」系固定文であること ⑩sleep / recoveryQuality: source=unknown 入力で band=unknown が強制されること（偽データの型縛り検証）。
6. **軸係数は flag 構造だけ用意**: `WIRE_DAY_STATE_PRIORS = false` 既定（Stage D。personalModelStargazerAdapter の Stage C は先約あり）。belief への書き戻し禁止。confidence 閾値は bodyLens 3 段（<0.2 不使用 / 0.2-0.5 半係数 / ≥0.5 通常）。**Stage 0 では personaCoefficients を受領して型 fixture を書くのみで estimates へ未適用**（適用式・gradeNightCheck への受け渡し or record 内保持を含む配達経路は Stage D 契約で定義）。
7. HDM heart 状態（heartIntegration.ts）の利用は **optional input・confidence 0.3 上限**（emotionalReserve の参考材料。設計書 §3.3）。**deriveMomentState は `receptivity-gate.ts` / `authority-escalation.ts` も import しない**（MomentStateV0 の値域は inline 定義が正本。本物のゲートは後段が MomentState を消費する側）。
8. **「3」の取り違え禁止**: 人体 3 系統（focusReserve/emotionalReserve/energyLevel）≠ 採点 3 対象（energyLevel/recoveryNeed/dayFeasibility）。重なるのは energyLevel のみ。脳・心は Night Check で採点しない（設計書 §4.3 冒頭注記）。
9. テストは既存規約（vitest）に従う。`npx tsc` は `--max-old-space-size=8192` 必須。

## 凍結済み戻り値型（補足）

```ts
// gradeNightCheck() の戻り値（v0.2 凍結）
type NightCheckGradeV0 = {
  verdicts: NightCheckResultV0["verdicts"];
  carryOverOut: NonNullable<DayStateRecordV0["carryOverOut"]>;
  nextDayPriorAdjustments: Array<{
    field: "energyLevel" | "recoveryNeed" | "dayFeasibility";
    contextKey: string;          // 同条件キー = shift 種別 × density 帯（例 "shift_night|packed"）
    direction: "raise" | "lower";
    confidenceDelta: number;     // match 時 +0.1 等（内部値・非表示）
  }>;
};
// 消費規律: nextDayPriorAdjustments / carryOverOut を「翌日の見立て」に使うのは
// Stage 3（B1 gate）。v0 では record に保存される（Stage 1 では localStorage）のみで、
// buildDayStateRecord は B1 解錠まで前日分を読まない。
```

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
- ViewModel への futureSlots（adjustmentDiffSlot / placeCandidateSlot / requestFrameSlot — 設計書 §2.5(c)）の型追加は**今はしない**（契約凍結維持）。A3/A4 の CEO 判断後に additive な契約改訂として行う。
- **closeout 必須項目**: ①上表の境界を遵守したこと（再実装ゼロ・新設ノードゼロ）②MomentState が v0 でどこまで持ったか（14 フィールド + 値域）③Request / Event-adapter / Place / Diff は未実装であり、どの Stage で閉じるか（設計書 §2.5 の Stage 割当表を転記）④**「Alter がセンサーになる」は未完**であること（Composer は既存 route への入口にすぎず、会話 → DayStateRecord 構造抽出は Stage 1.5 の別契約）⑤dayFeasibility は day-level proxy であること。

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
