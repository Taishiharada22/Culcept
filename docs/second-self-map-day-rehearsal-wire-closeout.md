# Day Rehearsal 配線 closeout（CalendarTab 選択日 day-level outlook バナー・READ-only・main 着地）

> 2026-06-06 / **配線 main 着地（main `d9354db4`・branch `claude/day-rehearsal-wire`・`44668763`）**。READ-only・表示のみ。
> GO: CEO/GPT Option D（status-only バナー・既存コード非改修）。前提: pure layer main 着地（`f1e87f39`）。

---

## 1. 何を出したか
**Day Rehearsal の初回 UI 露出** = CalendarTab 選択日 section の **day-level outlook バナー 1 行**（DayIndicatorBadge 直下）。「今日のあなたの1日を先に試した」見通しを仮説トーンで。timeline point marker は別 slice。

## 2. 実装（5 ファイル・既存 hook/pipeline 非改修）
| ファイル | 変更 |
|---|---|
| `lib/plan/dayRehearsal/dayRehearsal.ts` | `buildRehearsalInputFromDisplay`(新・display map status → input) 追加 + viability refine（**buffer signal あれば travel unknown でも outlook**＝status-only 対応） |
| `app/(culcept)/plan/components/DayOutlookBanner.tsx`（新） | 仮説トーン copy・slate 中立・unknown 非表示・warning 色/断定語禁止 |
| `app/(culcept)/plan/tabs/CalendarTab.tsx` | additive: dayRehearsal を useMemo（既存 `dayGraphByDate[selectedDate]` + `calendarFeasibilityDisplayByTransitionIndex` 再利用）→ DayIndicatorBadge 直下に `<DayOutlookBanner>` render |
| test ×2 | engine/adapter 26 + render contract 7 |

## 3. Option D の要点（honest degrade）
- **既存コード非改修**: `_useCalendarTabFeasibilityDisplay` / pipeline は触らず、CalendarTab が既に持つ displayMap + dayGraphByDate を additively 消費。
- **raw 分数/transport は display 層に無い** → `slackMin/shortfallMin/travelMin = null`（**未確定・捏造しない**）。buffer は status（slack→sufficient/shortfall→insufficient/不在→not_applicable）のみ。
- **viability は status + strain(DayGraph) から**（buffer signal があれば travel unknown でも outlook を出す）。displayMap 空（geocode 未解決）→ unknown → **バナー非表示**（ノイズ回避）。

## 4. copy（仮説トーン・断定/警告なし）
| outlook | copy |
|---|---|
| holds | 今日はゆとりがありそうです |
| tight | 今日は予定が少し詰まりやすいかもしれません |
| breaks | 今日は余白が少なめで、移動と予定が重なりやすいかもしれません |
| unknown | （非表示） |
- 「疲れます」「危険です」「壊れます」なし・生スコア/分数なし・amber/orange/red なし（slate 中立・feasibility 色と分離）。render contract test で機械保証。

## 5. 検証（main `d9354db4`）
- **33 test PASS**（engine/adapter 26: viability refine/status-only adapter/honest degrade 含む + render 7: 仮説トーン/warning 色禁止/断定語禁止/unknown 非表示）。
- **tsc footprint 0**（total 1114 baseline）・zero-loss・**既存 hook/MapTab/DB/route 非改変**・temp 0・push なし。
- plan suite 4917 PASS（1 失敗は `import(PlanClient)` の負荷起因 timeout flaky・単独 36 PASS で確認・本変更起因でない）。

## 6. 実機 smoke — ✅ PASS（2026-06-06・CEO/GPT 判定）
dev サーバー（main worktree・port 3012・flag 不要）で CEO 実機確認 → **PASS**。下記観点で検証済：
1. Plan → カレンダー → **anchor があり geocode 解決済の日**を選択 → outlook バナーが DayIndicatorBadge 直下に 1 行表示（holds/tight/breaks の仮説トーン）。
2. **anchor なしの日** → DayGraph なし → バナー非表示。
3. **geocode 未解決の日**（displayMap 空）→ viability unknown → バナー非表示（ノイズなし）。
4. **余白不足のある日** → tight/breaks 寄りの copy。
5. バナーは **READ-only**（ボタンなし・予定変更なし）。レイアウト: 既存 DayIndicatorBadge / 日付見出しを崩さない。
6. copy が仮説トーンで、警告色・断定語・生数字を含まない。

## 7. 残（別 GO）
- **timeline point marker**（convergence/recovery を時刻軸に）= バナー smoke 後の別 slice。
- **raw feasibility 公開**（Option A・分数精度↑）/ **transport 統合**（travel strain）/ **InnerWeather energyLevel** = 必要時。
- **「なぜ?」evidence 開示**（known/unknown/inferred を UI で）= 別 slice。
- 較正（config 係数）= calibration backlog。push/PR/Vercel/deploy = 禁止（未実施）。

## 8. 参照
- code: `lib/plan/dayRehearsal/`（rehearseDay/buildRehearsalInputFromDisplay）/ `app/(culcept)/plan/components/DayOutlookBanner.tsx` / CalendarTab
- 配線 mini design: `docs/second-self-map-day-rehearsal-wiring-mini-design.md` / pure closeout: `docs/second-self-map-day-rehearsal-step4-closeout.md`
