# Day Rehearsal WPM-1 closeout（詰まり convergence timeline marker・main 着地 live）

> 2026-06-06 / **main 着地 live（main `1414bf38`・branch `claude/dr-timeline-marker`・`4add454e`）+ 実機 smoke PASS（CEO 判定）**。read-only・表示のみ。
> 上位: `docs/second-self-map-day-rehearsal-timeline-marker-mini-design.md`。前提: day-level banner live + smoke PASS。

---

## 1. 何が live になったか
day-level banner（今日全体の見通し）の次に、**時間軸で「どこが詰まるか」**が見えるように。選択日 timeline の該当 transition 直後に小さな read-only marker：
> **この前後は予定が重なりやすいかもしれません**

## 2. 実装（3 ファイル・additive）
| ファイル | 変更 |
|---|---|
| `DayGraphTimeline.tsx` | `convergenceSteps?: ReadonlySet<number>` prop + `ConvergenceMarkerLine`（transition 直後・`FeasibilityDisclosureLine` pattern・slate text-xs・仮説トーン・amber/orange/icon/生スコアなし）+ **sensitiveProximity redaction** |
| `CalendarTab.tsx` | `dayRehearsal.convergencePoints` → `convergenceSteps`(Set) を DayGraphTimeline に渡す（additive・既存 props 不変） |
| test（新） | render contract 8（表示/非表示/redaction/仮説トーン/警告色禁止/構造 grep） |

## 3. 対応関係（read-only 保証）
- `convergencePoints`(stepIndex) = event 出現順 index = DayGraphTimeline の `transitionIndexByFromNodeId` と一致（W-Point-1 audit で検証）。marker は該当 transition 直後に出る。
- convergence「high」= buffer 不足 ∧ 累積 strain 高（Option D では friction 退行のため主に buffer+strain）。→ **詰まった日の該当区間のみ**・軽い日は出ない（正常）。

## 4. 制約遵守
- ✅ **read-only**（tap 無反応・disclosure と独立）・予定変更/repair/optimize/auto-reschedule なし。
- ✅ **banner / timeline / MapTab / DB / Google API / engine 非破壊**（DayGraphTimeline + CalendarTab additive のみ）。
- ✅ slate 中立・amber/orange/red/icon/生スコアなし・断定/警告語なし（render contract + 既存 forbidden 語 grep で機械保証）。
- ✅ sensitiveProximity の transition は marker 非出力（redaction）。

## 5. 検証
- **実機 smoke PASS**（CEO・2026-06-06）: 見た目/レイアウト/警告っぽさ/banner 非破壊 問題なし。
- marker + DayGraphTimeline test **32 PASS**・plan suite **4926 PASS**・tsc footprint 0・zero-loss・temp 0・push なし。

## 6. 残（次フェーズ）
- **WPM-2 = recovery marker**（「ここは一息つけそう」）。Option D で `recoveryWindows` 空（recovery は slackMin 依存・null）→ **gapMin / DayGraph gap / raw feasibility のどれを根拠にするか audit + mini design**（実装は GO 待ち・根拠が弱いなら停止）。
- raw feasibility 公開（Option A）/ transport / InnerWeather / evidence「なぜ?」UI / 較正 = 別 slice。push/PR/Vercel = 禁止（未実施）。

## 7. 参照
- code: `app/(culcept)/plan/components/DayGraphTimeline.tsx`（ConvergenceMarkerLine）/ CalendarTab / `lib/plan/dayRehearsal/`
- mini design: `docs/second-self-map-day-rehearsal-timeline-marker-mini-design.md` / banner: `docs/second-self-map-day-rehearsal-wire-closeout.md`
