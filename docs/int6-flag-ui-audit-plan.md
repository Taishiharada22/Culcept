# INT-6 — Flag / UI 監査計画（production 前・画面/flag 検証）

> 生成: INT-5 全体検証（2026-06-24）。worktree=`integration/freeze-roundup-on-a9eedce69-20260623`@`a6657e3d4`。
> 本計画は**監査の手順書**。ON/apply/deploy の実行は含まない（全て CEO GO 案件）。

## 0. 前提（重要な事実）
- **全 feature flag は default OFF**（env 未設定＝既存挙動完全不変）。env-driven flag は計 ~80 件。
- flag は 4 レイヤ: ①server-only env（`PLAN_*`/`REALITY_*`/`STARGAZER_*`/`LIFEOPS_*`・page.tsx が prop で client へ）②client env（`NEXT_PUBLIC_*`・client 直読み・dev 起動で検証）③compile-time const（`export const X_ENABLED`・多くが `&& NODE_ENV!=="production"` の production hard block ペア）④host/ref triple-guard（dev preview route の notFound）。
- MEMORY の `stargazer-travel-preview` route は本 worktree に**不在**。calendar travel 資産は `/plan` の CalendarTab 経由で surface。
- 検証は dev build で。production hard-block 系の真の挙動は production build でしか確認できない → ④で別途。

## 1. Feature Flag Matrix（抜粋・実データ）
### Plan track（`lib/plan/featureFlags.ts`）
planRouteLive(`PLAN_ROUTE_LIVE`・/plan gate・**INT-6 前提として ON 必須**)・homeSwipeEnabled・composeTimelineEnabled(`PLAN_COMPOSE_TIMELINE_ENABLED`・予定追加2カラム)・calendarMonthGridEnabled(`NEXT_PUBLIC_*`)・alterTabEnabled(Battery)・alterNoteLive/personalModelIntegration(LLM)・shiftImport系(entry/save/draft 3独立gate)・LIST_NEW_TIMELINE_ENABLED(const true 固定・FlowTab は planRouteLive 配下)。
### Travel track（`calendar/_lib/travel/flags.ts`）
isTravelDayDetailEnabled(`NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED`・旅行日詳細)・isTravelMapLiveEnabled(実地図)・isTravelSupabaseRepoEnabled(ON=skeleton throw)・travelPersonalizationPreview(`/plan/dev-travel-personalization`)・travelPersonalizationRealRead(caller 未配線＝ON でも no-op)。
### CoAlter track
coalterPlanTabEnabled・coalterEngineLive(`NEXT_PUBLIC_PLAN_COALTER_ENGINE_LIVE`・Plan Intelligence)・coalterReadMessages/SendMessages(+server gate `PLAN_COALTER_READ/SEND_LOCAL`)・coalterPersonalizationRealRead(#9 配線)。全て default OFF。
### Reality/LifeOps/Stargazer
Reality: realityCaptureKill(kill switch 最優先)他多数・大半 server-only・production hard block。Stargazer: counterfactualLive/perspectiveEngineLive/useStudentProvider 等9件・全 default OFF。LifeOps: 全 dormant（consumer なしの設計のみ）。
### Candidate Lens / dogfood（const + NODE_ENV hard block）
PLACE_CANDIDATE_LENS_UI_ENABLED=true → `isCandidateLensUiEnabled()` は `&& NODE_ENV!=="production"`。dayRehearsal/affinity reason UI 群も同様。dogfood(`NEXT_PUBLIC_ANEURASYNC_POST_VISIT_DOGFOOD`/`FIT_ARC_DOGFOOD`)は production hard block + 値 "1" のみ dev 点火。

## 2. INT-6 で確認すべき画面（実ファイル）
### 本線（/plan 配下）
`/plan`(page.tsx→PlanClient・planRouteLive gate)・タブ群(FlowTab/CalendarTab/MapTab/AlterTab(Battery)/CoAlterTab)・予定追加(AddAnchorModal / compose sheet)・Candidate Lens overlay(PlaceCandidatesPanel/CandidateLensPanel・dev-only)・Calendar 月ビュー・シフト取込・Travel 旅行日詳細(ConciergeDashboard/TravelDayDetail/LocationNotesScreen・CalendarTab から surface・`isTravelDayDetailEnabled()`∧旅行日 6/24-26)・LifeOps 本線 card(dormant)。
### dev/preview（production hard-block 確認対象）
`/plan/dev-travel-personalization`(**flag のみ・NODE_ENV/host guard なし**)・`/lifeops-preview`(**guard なし・nav 非登録・fixture 固定**)・triple-guard 群(dev-second-self 他多数)・`(dev)` group(coalter-preview 系)。
→ **B-4**: dev-travel-personalization と lifeops-preview は flag-only / guard なしで production URL 露出しうる（要 Phase C 検証）。

## 3. 監査マトリクス（4 状態）
| # | 状態 | env | 期待 |
|---|---|---|---|
| ① | 全 flag OFF（既定） | 全未設定 | `/plan`=notFound・全 dev=Disabled・既存挙動完全不変（退化ゼロ） |
| ② | feature 単体 ON | 1 flag ずつ + `PLAN_ROUTE_LIVE=true` | その UI のみ出現・他不変・fixture・write 0 |
| ③ | safe combined ON | 下記セット（全 read-only/fixture） | 4 track 共存・相互非破壊・CoAlter send は server gate なしで POST 404 |
| ④ | production-only OFF 厳守 | production build・全未設定 | hard-block 系（lens/dayRehearsal/dev triple-guard/reality write）が必ず OFF |

### ③ safe combined セット（全 fixture/read-only/非破壊）
```
PLAN_ROUTE_LIVE=true
PLAN_ALTER_TAB_ENABLED=true
NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED=true
NEXT_PUBLIC_PLAN_COALTER_ENGINE_LIVE=true
NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED=true
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true
PLAN_COMPOSE_TIMELINE_ENABLED=true
PLAN_TRAVEL_PERSONALIZATION_PREVIEW=true
```
**③で混ぜない（write/real read/production-only）**: `PLAN_COALTER_SEND_LOCAL`/`READ_LOCAL`・`PLAN_SHIFT_IMPORT_SAVE`・`*_PERSONALIZATION_REAL_READ`・`*_TRAVEL_SUPABASE_REPO_ENABLED`(throw)・全 `REALITY_*` write/capture・全 `LIFEOPS_*PROD*`・`STUDENT_PROVIDER_ENABLED`・`STARGAZER_COUNTERFACTUAL_LIVE`。

## 4. 手順
- **Phase A 静的（read-only）**: worktree 健全性 → flag 棚卸し grep → consumer 追跡 → NODE_ENV hard-block grep 検証 → tsc55/vitest 退化ゼロ。
- **Phase B dev 実機（要 CEO env 投入承認）**: 状態①→②→③ を dev 起動で screenshot + network log。
- **Phase C production build（別途承認）**: 状態④ を `npm run build && NODE_ENV=production npm start` で hard-block 確認・**B-4 の URL 露出可否を実測**。
### 証跡
screenshot を `docs/int6-flag-ui-audit/<状態>_<flag>_<画面>.png`・network log で fetch/POST が fixture/read のみ（write 0）・console error 0・gate は URL 直叩き→notFound を記録。結果表は各セルに PASS/FAIL/N/A + 証跡 + 1 行所見（`feedback_verification-protocol.md` 準拠）。

## 5. 要確認事項（CEO 判断 / blocker 候補）
1. `stargazer-travel-preview` 不在 — scope 外か別 track 確認。
2. **B-4**: `/plan/dev-travel-personalization`・`/lifeops-preview` の production 露出 — Phase C で実測・NODE_ENV guard 要否。
3. `/lifeops-preview` は nav 非登録だが production build に含まれる — 削除 or guard。
4. ③④の env 投入・build は **CEO GO 後に Phase B/C** で実施。
