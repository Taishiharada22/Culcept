# P7 — PRODUCTION UX GAP AUDIT / Phase A 静的監査（2026-06-26）

> read-only code 監査。production 変更なし。canonical = https://culcept.vercel.app / clean prod = plodugvgmdkusifdrdfz。
> 訂正: CoAlter redesign は deploy 済（精密差分で確定。前 close doc の「未マージ＝未到達」を訂正）。

## 1. 12 ターゲット gap matrix（6層 × status）
status: green / yellow / flag-off / fixture / write-blocked / drift-watch / process
| # | 体験 | 1画面 | 2導線 | 3ロジック | 4LLM | 5DB | 6flag | 総合 |
|---|---|---|---|---|---|---|---|---|
| 1 | canonical health/封じ込め | n/a | green | green | n/a | green(grant) | scope_only=on | green |
| 2 | Home->Plan swipe | present | green | green | n/a | n/a | homeSwipe=on | green |
| 3 | /plan 表示 | present | green | green | n/a | green | route=on | green |
| 4 | 予定追加 | present(compose) | green | green | n/a | green(external_anchors) | compose=on | green |
| 5 | Alter応答 | present | green | green(V2) | OpenAI | green(35table grant) | V2=on | green + drift-watch |
| 6 | LLM note | present | green | green | OpenAI(Gemini yellow) | n/a | alterNote=on | green/yellow |
| 7 | Runtime Logs | - | - | - | - | - | - | process(Phase B でerror仕分け) |
| 8 | 古いUI/未反映UI | present | flags=on | green | - | - | compose/month/tab=on | green(要 Phase B 目視) |
| 9 | CoAlterタブ | present(redesign 済) | green(coalterPlanTab=on) | fixture(live OFF) | n/a(fixture) | n/a(fixture) | tab=on / live=off | 画面green / データfixture |
| 10 | Travel/Map/Shift | 分離(下記2節) | 一部flag | 一部 | n/a | - | 個別 | 混在 |
| 11 | /wardrobe·/rendezvous 封じ込め | n/a | 404 | n/a | n/a | n/a | scope_only | green(再curl推奨) |
| 12 | Gemini primary | n/a | n/a | fallback | yellow | n/a | AI_DEFAULT_PROVIDER | yellow |

## 2. CoAlter タブ（訂正・確定）
- redesign は deploy 済: CoAlterHome/PlanOverlay/coalterHomeFixture が redesign branch と差分ゼロ。commit 64cc12fb2(6/22 UI×Logic 統合)で main に到達。CoAlterTab は main が統合版(UI+logic)。
- 画面 = green（Apple 風 Home 始まり overlay が出る・coalterPlanTabEnabled=on）。
- データ = fixture（coalterEngineLive / coalterChatLive / coalterReadMessages / coalterRelationLive / coalterSendMessages = 全 OFF）。見た目は本物だが、ペア/チャット/提案は fixture。設計どおりの dormant（live は session 作成インフラ + 別 GO 前提）。
- gap = live CoAlter（実ペア・実チャット・engine 提案）= 機能 gap（意図的 OFF）。視覚 gap ではない。

## 3. Travel / Map / Shift import（出せる画面 vs 出してはいけない write）
| flag | 種別 | 本番可否 |
|---|---|---|
| NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED | 表示(日別詳細) | ON 可(display) |
| NEXT_PUBLIC_PLAN_TRAVEL_MAP_LIVE_ENABLED | 表示+Maps | ON 可(GOOGLE_MAPS_API_KEY 前提・geocode route が要求) |
| NEXT_PUBLIC_PLAN_TRAVEL_SUPABASE_REPO_ENABLED | write/repo | OFF 維持(skeleton が throw・ON で壊れる) |
| NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED | 表示(取込入口) | ON 可(display のみ) |
| PLAN_SHIFT_IMPORT_SAVE | write/DB | OFF 維持(migration 6B 未適用=保存失敗) |
| PLAN_SHIFT_DRAFT_LIVE_ENABLED | write/VLM | OFF 維持(VLM live・cost GO 前提) |
- 出せる: travel day detail / travel map(Maps key 要) / shift 入口。
- 出してはいけない write: travel supabase repo / shift save / shift draft VLM。
- 注意 shift は「入口だけ出すと取り込んでも保存できない」=save は migration 適用後。表示と write の gate が分離済なので入口のみ安全に出せる。

## 4. production に届いていない最大要因（順）
1. 意図的 OFF の write/live 機能（最大）: CoAlter live(実ペア/チャット/engine)・shift save・travel supabase repo。コード/見た目でなく infra/migration/別 GO 待ち。
2. Maps key 未確認: travel map / 場所検索が key 無しだと degrade(geocode 401/空)。
3. drift-watch(Alter): 35 table は grant 済だが、後続 migration の列追加(scoring_engine_upgrade の axis_beliefs / median_response_time_ms 等)が clean prod に適用済か未実証 -> 42703 リスク(Phase B Runtime Logs で確認)。
4. Gemini yellow: 体験は OpenAI fallback で成立・劣化のみ。
- 注 「古い見た目/未マージ redesign」は要因でない（CoAlter redesign は deploy 済・/plan modern flags on）。

## 5. 次に出すべき体験 canary 優先順位（flag-spam しない・体験単位）
1. C1: Alter drift 確定（Phase B・SQL/Logs read-only）— 35 table の列存在を確認。42703 が出れば該当 ALTER 列 migration を staging->prod(別 GO)。最優先(Alter は中核体験・既に V2 ON ゆえ静かに失敗していないか)。
2. C2: Maps key 確認 -> travel map / 場所検索 canary（key 存在のみ確認・display flag ON は別 GO）。
3. C3: travel day detail / shift 入口の表示 canary（display のみ・write OFF 厳守）。
4. C4: Gemini yellow 解消（AI_DEFAULT_PROVIDER=openai 寄せ or Gemini budget/model 修正・別 canary）。
5. C5(大): CoAlter live（session 作成インフラ + read/send + engine の段階点火・複数別 GO・最後）。
- いずれも体験 1 つずつ canary(smoke->green->次)。REALITY/LIFEOPS/STARGAZER は OFF 維持。

## 6. Phase B チェックリスト（CEO が production 実機 + Runtime Logs で・read-only）
実機（culcept.vercel.app・ログイン）:
- [ ] /plan: 予定追加 UI が新 compose(2カラム/タイムライン)か(旧 Modal でないか)=compose flag 実効
- [ ] カレンダーに週/月 toggle が出るか=month grid flag 実効
- [ ] タブにバッテリー / CoAlter が出るか=alterTab / coalterPlanTab 実効
- [ ] CoAlter タブが Apple 風 Home 始まり overlay か(redesign 到達の目視確認)
- [ ] Alter 導線(+Alterに教える / morning)で応答が返るか・LLM note が出るか
- [ ] Travel/Map/Shift: 出ている画面と、保存しようとして失敗しないか(save は OFF のはず)
Runtime Logs（体験別 error 仕分け）:
- [ ] Alter 操作後に 42703(列なし=drift) / 42P01(table なし) / 42501(grant 漏れ) が無いか
- [ ] LLM: Gemini Budget 0 以外の auth error(OpenAI invalid key 等)が無いか
- [ ] 予定追加/各 route で 500 が無いか
- [ ] 封じ込め: /wardrobe /rendezvous が 404(curl 2本)

---
本書: read-only 静的監査のみ。env変更/redeploy/SQL/db push/flag/CoAlter live/REALITY·LIFEOPS·STARGAZER 点火/origin push — 一切なし。
