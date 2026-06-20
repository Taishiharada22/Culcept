# Day Rehearsal — timeline point marker mini design（選択日 timeline・read-only）

> 2026-06-06 / **設計のみ・実装は次 GO** / 前提: day-level outlook banner live + smoke PASS（main `d9354db4`〜）。W-Point-1 audit: **YES（条件付き・安全）**。
> CEO 方針: banner は壊さない・選択日 timeline のみ・read-only・予定変更なし・警告色/断定禁止・生スコアなし・layout 破壊なら停止。

---

## 0. 目的
day-level banner は「今日全体の見通し」まで。次は **時間軸で「どこが詰まりやすいか」「どこで一息つけるか」**を選択日 timeline 上に小さな read-only marker で可視化。

## 1. W-Point-1 audit 結論（安全性根拠・read-only 検証済）
| 項目 | 結論 |
|---|---|
| timeline 描画 | `DayGraphTimeline.tsx`（presentational・props のみ）。CalendarTab.tsx:747-770 で使用。per-transition disclosure（`FeasibilityDisclosureLine`）既存 |
| **stepIndex 対応** | ✅ `buildRehearsalInputFromDisplay`(events.map (ev,i)) と DayGraphTimeline(`transitionIndexByFromNodeId`) が**同一 event 出現順** → `convergencePoints`/`recoveryWindows` の stepIndex = timeline の transition 位置 |
| 安全な挿入点 | `FeasibilityDisclosureLine`(per-transition 補助行・conditional render) と同パターンで marker 行追加 → **layout 破壊 0** |
| 表記規約 | slate only（amber/orange/red 禁止）・警告 icon/badge 禁止・中立観測語・sensitiveProximity は redaction |
| layout リスク | 0（flex inline or 条件付き新行・text-xs slate・motion-reduce 継承） |

## 2. marker の意味 / データ対応
| marker | source | Option D（status-only）での挙動 |
|---|---|---|
| **詰まり（convergence）** | `DayRehearsal.convergencePoints`（stepIndex・buffer不足∧strain∧friction の重なり） | ✅ 動く（buffer insufficient + strain で発火） |
| **回復（recovery）** | `DayRehearsal.recoveryWindows`（stepIndex） | ⚠️ **現状空**（recovery は slackMin 依存・Option D で null）→ §6 の gapMin 拡張が必要 |
- いずれも stepIndex = event i → **event i の後の transition** に対応（rehearseDay は transitionAfter で convergence/recovery 算出）。marker は該当 transition の位置に出す。

## 3. 配線（additive・既存非破壊）
1. CalendarTab は既に `dayRehearsal`(useMemo) を持つ（banner 用）→ **DayGraphTimeline に optional prop で渡す**（`convergenceSteps?: ReadonlySet<number>` / `recoverySteps?: ReadonlySet<number>`、または `dayRehearsal?: DayRehearsal`）。
2. DayGraphTimeline: 既存の transition render の直後に **marker 行を条件付き render**（`FeasibilityDisclosureLine` pattern）。
3. **disclosure toggle と独立**（marker は常時表示の小要素・toggle 不要）。**sensitiveProximity の transition は marker 非出力**（privacy）。

## 4. marker 描画 / copy（仮説トーン・中立観測）
- 小さな 1 行（text-xs・slate-400/500・tiny dot ●）。警告色/icon なし・生スコアなし。
| marker | copy 案（仮説トーン） |
|---|---|
| 詰まり | この前後は予定が重なりやすいかも |
| 回復 | ここは一息つけそう |
- 断定/警告語禁止（「危険」「詰まる(断定)」「疲れ」なし）。aria-label も中立語。
- 多発でノイズにならぬよう **convergence は high のみ**（既存 convergencePoints 条件）・recovery は明確な gap のみ。

## 5. 制約遵守（CEO/audit 条件）
- banner 非破壊（別行・別 component）。選択日 timeline のみ（month/week grid 不可）。
- **read-only**（tap で何も起きない or 既存 disclosure と独立）。予定変更/repair/optimize/auto-reschedule なし。
- slate only・警告色/断定/生数字なし。sensitiveProximity redaction。motion-reduce 継承。
- MapTab/DB/Google/push 不接触。**layout が崩れる/表現が強すぎるなら停止して報告**。

## 6. 判断点（実装 GO 前）
1. **回復 marker を出すか**: 出すなら recovery を **gapMin(DayGraph gap 長) fallback** で算出する小 engine 拡張（slackMin null 時に gap から recovery・evidence=inferred）。出さないなら**初回は詰まり marker のみ**（recovery は raw feasibility 公開後）。→ 推奨: **初回は詰まり(convergence) marker のみ**で最小・安全に出し、回復は次 slice（gapMin 拡張 or raw feasibility 後）。
2. **marker 位置**: transition 直後の新行（FeasibilityDisclosureLine pattern）で良いか。
3. **prop 形**: DayGraphTimeline に `convergenceSteps`/`recoverySteps`(Set<number>) を渡す（DayRehearsal 全体でなく必要 set のみ）で良いか。
4. **copy**: §4 の仮説トーンで良いか。

## 7. 段階（実装 GO 後）
| slice | 内容 |
|---|---|
| WPM-1 | DayGraphTimeline に convergenceSteps prop + 詰まり marker 行（read-only・slate・仮説トーン）+ render test |
| WPM-2 | CalendarTab 配線（dayRehearsal の convergencePoints を渡す）+ smoke |
| 着地 | green なら main squash 着地 + closeout |
| 次 slice | 回復 marker（gapMin 拡張 or raw feasibility 後）|

## 8. 参照
- audit 対象: `app/(culcept)/plan/components/DayGraphTimeline.tsx`（FeasibilityDisclosureLine pattern）/ `lib/plan/dayGraph/dayGraphTimelinePresentation.ts`（class 規約）
- rehearsal: `lib/plan/dayRehearsal/`（convergencePoints/recoveryWindows）/ banner: `DayOutlookBanner.tsx`
- 上位: `docs/second-self-map-day-rehearsal-wire-closeout.md`
