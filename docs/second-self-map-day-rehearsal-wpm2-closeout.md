# Day Rehearsal WPM-2 closeout（raw feasibility 公開 + recovery marker・main 着地 live・smoke PASS）

> 2026-06-06 / **main 着地 live（main `59e97dc4`・branch `claude/dr-recovery-marker`・`45a661fb`）+ 実機 smoke PASS（CEO）**。read-only・表示のみ。
> 前提: WPM-1 詰まり marker live。WPM-2 audit（gapMin 弱い→Option A 解禁）。

---

## 1. 何が live になったか
詰まり marker（WPM-1）に加え、**時間軸で「どこで一息つけるか」**が見えるように。選択日 timeline の transition 直後に：
> **ここは一息つけそうです**（真の余白 slack ≥ 60min の区間のみ）

## 2. 実装（2 段階・7 ファイル）
### WPM-2a: raw feasibility additive 公開
| ファイル | 変更 |
|---|---|
| `feasibilityDisplayPipeline.ts` | `FeasibilityDisplayPipelineResult` に `feasibilityRaw: DayFeasibilityResult` を **additive 追加**（既に内部計算済の raw を返すだけ・display 不変） |
| `_useCalendarTabFeasibilityDisplay.ts` | 戻りを `{ displayByTransitionIndex, rawByTransitionIndex }` に（display は不変・raw を additive）。overlay 再利用・新 async なし |
| `CalendarTab.tsx` | destructure（display 名は不変）+ raw を受領 |

### WPM-2b: recovery marker
| ファイル | 変更 |
|---|---|
| `dayRehearsal.ts` | `recoveryStepsFromFeasibilityRaw`（sufficient ∧ **真の slack=gap−travel ≥ 60min** のみ・gapMin でない） |
| `DayGraphTimeline.tsx` | `recoverySteps` prop + `RecoveryMarkerLine`（slate・仮説トーン・convergence と排他=詰まり優先・sensitiveProximity redaction） |
| `CalendarTab.tsx` | recoverySteps を渡す（additive） |

## 3. 設計の核（honest + 非破壊）
- ✅ **真の slack 根拠**（gapMin でない）: slack = gap − travel = 真の余白。移動が大半の gap を誤って一息扱いしない（honest）。実機 smoke で実証（**余白165分＝間隔180分−移動15分**で一息 / **間隔14分<移動15分**で詰まり）。
- ✅ **WPM-1 / banner 非破壊**: recovery は strain forward 積分と **decouple**（直接 slack 判定）→ viability/convergence/strain を変えない。
- ✅ **display byte 不変**: WPM-2a は raw を additive 公開のみ（既存「余白N分」disclosure 不変・plan suite 4939 PASS で確認）。
- ✅ **read-only**・予定変更/repair/optimize/auto-reschedule なし・fake recovery/duration なし・slate 中立・成功色/生スコアなし・sensitiveProximity redaction。

## 4. 検証
- **実機 smoke PASS**（CEO・2026-06-06）: 一息（余白165分）/ 詰まり（間隔14分）/ banner / 既存 disclosure すべて正常・排他・layout 非破壊。
- 71 + plan suite **4939 PASS**・tsc footprint 0・zero-loss（WPM-2 7 ファイル）・banner/MapTab/DB/route 非改変・temp 0・push なし。

## 5. 残（次フェーズ）
- **Evidence「なぜ？」UI**（mini design 先行）: banner/marker の根拠（known/unknown/inferred）を read-only disclosure で自然な日本語に。生スコアなし・断定なし。
- raw feasibility を convergence の magnitude にも使う（精度↑）/ transport 統合 / InnerWeather / 較正 = 別 slice。push/PR/Vercel 禁止（未実施）。

## 6. 参照
- code: `lib/plan/dayRehearsal/dayRehearsal.ts`（recoveryStepsFromFeasibilityRaw）/ `DayGraphTimeline.tsx`（RecoveryMarkerLine）/ `feasibilityDisplayPipeline.ts`（feasibilityRaw）/ `_useCalendarTabFeasibilityDisplay.ts`
- 前提: `docs/second-self-map-day-rehearsal-wpm2-audit.md` / `…-wpm1-closeout.md`
