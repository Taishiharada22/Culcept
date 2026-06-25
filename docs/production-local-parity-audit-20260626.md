# 6/24 local vs 現production 退化監査 + 最新保持の保証（2026-06-26）

> 6 agent 並列監査 + 反証検証（workflow wf_59e49a6a-759）。read-only。production 変更なし。

## 1. 保証：退化なし（NO REGRESSION）
HEAD=f988e4edd（main・2026-06-26）。
- 指定 6 commit（HOME-SWIPE-PLAN-PARITY d3595c8d9/9365cc411・CoAlter UI×Logic 64cc12fb2・star_maps 8c7a0b38d・freeze-roundup aa331c3d3・UX bcf84157c）は全て HEAD の ancestor。
- plan/page.tsx の最新 = 6/25 9365cc411（home の swipe pane が /plan と同一 source＝plan が home に連結）。
- HEAD に欠落する画面/lib file ゼロ（全 unmerged branch を comm -23 で照合・唯一 dev-coalter-brain-preview/page.tsx のみ＝flag OFF の dev scaffold・非ユーザー画面）。
- screen 削除は 6/21 UX-1b の意図的 union 1 件のみ（後継 component は HEAD に存続・退化ゼロ明記・6/24-25 窓外）。
- 反証エージェントも no-regression を覆せず。
- 限定（唯一の未検証）: 静的 git/FS 検証ゆえ Battery タブの xeno版 vs session-b版 視覚等価と authed 実機/full test はログイン壁で未実行。確実にするなら Battery タブの目視 1 点のみ。

→ 最新状態は確実に保持。コード退化は無い。

## 2. なぜ local では全部出たのに production で出ないのか（2層）
層1: flag 差。local .env.local は約80 flag を true（LifeOps/Reality/Stargazer/CoAlter live/personalization まで全部）。production scope は未点火 or redeploy 未済。NEXT_PUBLIC_* は build 時 inline ゆえ Preview に入れても Production build に無ければ無効。
層2: CODE hard-gate（重要）。flag を true にしても production の code が構造的に deny する画面がある：
- NODE_ENV === 'production' で無条件 false にする箇所
- staging project ref を要求し production ref を deny する gate
Vercel の Production build は NODE_ENV=production 固定なので、これらは env では絶対に開かない。

## 3. CEO の具体例＝両方とも code hard-gate（flag では不可）
| 画面 | 正体 | 何が要るか |
|---|---|---|
| 予定追加後の候補レンズが古い(①捲る/②なぜ/③比較表+地図) | lib/plan/candidateLens/candidateLensUi.ts:33 が `&& NODE_ENV !== 'production'` で hard block。production では素の ul リストに戻る(explanation/prefObs/prefApply/enrichment も同様) | code 変更必須(NODE_ENV 条件を明示 env gate へ置換)→ flag 点火 + redeploy。地図は NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY。migration 不要。CEO GO |
| Life のやつ(生活まわり card / 今の一枚) | lib/plan/reality/lifeops/lifeops-mainline-gate.ts:32 isLifeOpsMainlineAllowed が staging ref 要求 + production ref deny。LIFEOPS_MAINLINE=true でも production では常に false → card 非計算 | code+env+migration の3点: (1)isLifeOpsProductionStageAllowed(存在するが caller ゼロ=未配線)を配線 (2)LIFEOPS_PROD_READ_VISIBILITY=true+LIFEOPS_PROD_USER_ALLOWLIST に userId (3)lifeops_* テーブルの production apply。CEO 二段階 GO |

→ これは「flag 設定し忘れ」でも「退化」でもなく、これらの機能が dev/staging 限定として production を明示 block する設計だったため。出すには CODE 変更 + 前提(migration/allowlist)が要る。

## 4. 「TIER3 を true にすべきか？」への答え（3分類）
### A. 安全に出せる → TIER2 へ昇格（今すぐ Production scope に true + redeploy）
PLAN_ROUTE_LIVE(最優先・/plan の最上位ゲート・404の元) / PLAN_HOME_SWIPE_ENABLED / PLAN_COMPOSE_TIMELINE_ENABLED / NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED / PLAN_ALTER_TAB_ENABLED / PLAN_DAY_STATE_STORAGE / NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED / NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED / PLAN_ALTER_NOTE_LIVE
→ 全て display/読み取り・DB write なし・RLS 保護内。これで /plan 体験が大きく回復。

### B. flag では出せない → CODE 変更 + CEO GO（前提つき）
候補レンズ(NODE_ENV block 解除) / Post-Visit Check Card(同) / Fit-Arc Readout(同) / LifeOps card・Moment(gate 配線+allowlist+migration)。
→ いずれも「ユーザーに届けたい正当な体験」だが production 露出は意図的に保留されていた。出すには PR + 前提。

### C. 危険で OFF 維持（write/前提未達）
PLAN_SHIFT_IMPORT_SAVE / PLAN_SHIFT_DRAFT_LIVE_ENABLED / LIFEOPS_*_WRITE / REALITY_CAPTURE_LIVE / REALITY_LEARNING_EVENT_WRITE / REALITY_REVIEW_WRITE / REALITY_TENDENCY_FEEDBACK_WRITE / PLAN_COALTER_PERSONALIZATION_REAL_READ / PLAN_TRAVEL_PERSONALIZATION_REAL_READ / REALITY_OS_SURFACE_PROD(fixture)。
→ migration 未適用 / consent 未 / canary 前提。true にすると DB write 失敗・漏洩・fixture 表示。B-7 完了まで OFF。

## 5. local 体験を本番再現する順序（厳守 A→B→C）
- 段階A（今すぐ・低リスク）: §4-A の safe flag を Production scope に true + redeploy（NEXT_PUBLIC は build cache off）。+ AI key（提案中身）。→ /plan の見た目・タブ・compose・月view・CoAlter overlay・battery が出る。
- 段階B（PR + CEO GO）: 候補レンズ / Post-Visit / Fit-Arc の NODE_ENV==='production' block を明示 prod gate に置換。LifeOps は production-stage gate 配線 + allowlist。code 変更ゆえ PR レビュー。
- 段階C（migration + canary GO）: LifeOps 実書込 / Reality capture write / Shift 保存 / VLM。production schema apply（B-7）+ allowlist + canary が揃って初めて。

---
本書: read-only 監査。env変更/redeploy/SQL/db push/code 変更/push 一切なし。secret 非記載。
