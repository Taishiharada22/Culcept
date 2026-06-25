# HOME-SURFACE-VERIFY — production HOME / Alter swipe / /plan 導線 監査（2026-06-25）

> read-only / docs-only。production 非接続・DB write/apply/SQL/seed ゼロ・コード変更ゼロ・origin push なし。
> 目的: DB schema ではなく **UI code / route / component** の確認。production 時代の HOME 画面・Alter swipe・/plan 導線が最新 local main に **残っているか（欠落していないか）** を実コードで確認し、欠落があれば path 単位 recovery を計画（**/plan/CoAlter/Travel/LifeOps の最新 logic を巻き戻さない**前提）。
> worktree = local main `8c7a0b38d`（branch=main・rule 8 三点確認済み）。

## 0. 結論（headline）
**3 surface すべて PRESENT。code-missing はゼロ。path 単位 recovery は不要。**
- production 時代の HOME（`AneurasyncHome`・Alter 体験）= ✅ 残存（「Alter 体験完全保持」とコード内明記）。
- Alter swipe UI（2 種）= ✅ 残存（Home 内 Alter 体験 + Home↔Plan 横スワイプ wrapper）。
- /plan 導線（route + client + 5 タブ）= ✅ 残存。
- 唯一の「不在」は **/plan の実行時到達性**で、これは **設計通りの flag-dark**（`planRouteLive` / `homeSwipeEnabled` OFF 既定）であり **code loss ではない**。古い commit/branch/backup からの移植は不要。
- CEO 判断が要るのは **recovery ではなく go-live の env flag 点火 + global nav に /plan を載せるかの product 判断**（いずれも前進方向の config/design・巻き戻しゼロ）。

---

## 1. HOME route の実体（production 時代 HOME は残っているか）
✅ **残存**。
- HOME = `app/(culcept)/page.tsx`（server・112 行）→ `app/AneurasyncHome.tsx`（client・1147 行）を render。`AneurasyncHome` が production 時代の Alter 中心 HOME 本体。
- `page.tsx:97` `const homeElement = <AneurasyncHome visualFlowEnabled={…} />` / `:110` auth error fallback も `<AneurasyncHome />`。コメント `:90`「AneurasyncHome 内部は不変 (Alter 体験完全保持)」。
- gate flow 健在: 未ログイン→`/login`(登録済) or `/welcome`(新規)（`:28-34`）/ 匿名→`/stargazer`（`:38`）/ star_maps 無→`/baseline` or `/stargazer`（`:42-59`）/ それ以外→HOME。
- `app/page.tsx`（root home）は **不在**。HOME は (culcept) route group が担う。

### 1-b. orphan（旧 fashion HOME）の判定
- `app/HomePageClient.tsx` / `app/HomePageClientNew.tsx` は **存在するが orphan**（`grep "import.*HomePageClient" app` = 0 件・どの page も import しない）= 旧 fashion 時代 HOME の死蔵コード。
- これらが render する global BottomNav（MAIN_NAV）も **現 HOME 経路では dead**（§5）。**archive 対象**（復活させない）。

---

## 2. Alter swipe UI（残っているか）— 2 surface とも PRESENT
✅ **残存（2 種の独立 surface）**。

| surface | 実体 | 状態 |
|---|---|---|
| (a) Home 内 Alter 体験 | `AneurasyncHome` 内: `AskHero`(`:30`・「もうひとりのあなた（Alter）が答えます」) / `useAlterChat`(`:154`・Home embedded chat) / `AlterInsightCard`(`:33`・composerSeed+href) / 影の声(`shadowEnglishName`/`shadowEmoji`・genome-card fetch `:238`) / `AnimatePresence`(`:4`) / fixed-bottom Composer(`:993`) | ✅ 完全保持 |
| (b) Home↔Plan 横スワイプ | `components/home/HomeSwipeContainer.tsx`（258 行）: framer-motion drag + `dragDirectionLock` + threshold/velocity + iOS edge-back 無視 + `ZoneErrorBoundary` + modal-lock(`useHomeSwipeModalLock`) + `HomePaneIndicator` + 両 pane 常時 mount。pane0=`AneurasyncHome` / pane1=`PlanClient(displayMode="pane")` | ✅ 実装健在・**flag gate あり**（§3） |

> 「Alter swipe」は2解釈とも存在: production 時代の **Alter 体験カード**（AskHero/InsightCard・swipe/composer）も、**Home→Plan 横スワイプ**（HomeSwipeContainer）も両方コードに残っている。

---

## 3. /plan 導線（残っているか・到達できるか）
✅ route + client + タブ **残存** / ⚠️ 実行時到達性は **二重 flag gate・OFF 既定**（設計通り）。

- 実体: `app/(culcept)/plan/page.tsx`（158）+ `PlanClient.tsx`（1405）+ tabs（`AlterTab`/`CalendarTab`/`FlowTab`/`MapTab` + `coalter/CoAlterTab`）。
- **二重 gate（現本番既定で /plan は UI から到達不能・ただし設計意図）**:
  1. **直 URL `/plan`** → `plan/page.tsx:55` `if (!PLAN_FLAGS.planRouteLive) notFound()` → `planRouteLive`=env `PLAN_ROUTE_LIVE==="true"`（featureFlags `:21`）= **OFF 既定 → 404**。
  2. **Home 横スワイプ pane** → `page.tsx:98` `if (PLAN_FLAGS.homeSwipeEnabled)` でのみ wrapper 適用 → `homeSwipeEnabled`=env `PLAN_HOME_SWIPE_ENABLED==="true"`（featureFlags `:50`）= **OFF 既定**。
- → **現状 /plan は両経路とも OFF で UI 到達不能**。これは freeze-roundup の「全 flag OFF」方針通りの **flag-dark 状態であり、コード欠落ではない**。env 点火（CEO 承認・production env 変更案件）で到達可能になる。
- `/plan` は **global nav 配列（MAIN_NAV / HOME_MORE_NAV）に未登録**（§5）。参照元は HomeSwipeContainer pane + settings の `href="/plan"` 1 件 + morning capture 系 deep link（AskHero/MorningMapView/MorningPlanCard/CaptureCandidateBanner・morning flag 配下）のみ。

---

## 4. /plan タブ機構（CEO gate 3: Alter ページ→他タブ確認・遷移は正常か）
✅ **/plan 内タブ遷移は正常に機能**（pure client state・route/pane 両モード）。

- タブ型: `PlanTab = "calendar"|"flow"|"map"|"alter"|"coalter"`（`PlanClient.tsx:153`）。
- `visibleTabs`（`:306-313`）: 既定 = **カレンダー/リスト/マップ**（`TABS` `:162-164`）+ `alterTabEnabled` ON で末尾 **バッテリー**(key=`alter`・`:172`)+ `coalterPlanTabEnabled` ON で **CoAlter**。両 flag は **prop 既定 false**（`:293,295`・server が `PLAN_FLAGS` を読み prop で渡す＝client 直読み禁止 `:250`）。
- shell: `useNewShell = true` 固定（`:320`・CEO corrective「最新の状態に」）→ タブバーは header inline pills（`:927-957`）で **常時描画**。
- 遷移機構: 各タブ button `onClick={() => setActiveTab(tab.key)}`（`:943` header pills / `:1030` 旧 shell nav）→ `activeTab` state 切替 → content section（`:1051-1063`・`role=tabpanel`）が当該タブを再描画。ARIA 正（`role=tablist/tab/tabpanel`・`aria-selected`・`aria-controls=plan-panel-{key}`・`id=plan-tab-{key}`）。
- **pane モード（Home swipe pane1）でもタブバー描画**: header tab bar（`:927`）は `useNewShell` 条件のみで `!isPane` gate されない（`!isPane` gate は eyebrow `:902` / ics-import `:973` / shift-import `:986` / subtitle `:997` だけ）。→ **swipe で Plan pane に来てもタブ確認・遷移可**。
- **gate 3 直答**: 「Alter ページ（=バッテリータブ key=`alter`）から他タブ確認・遷移」は **`alterTabEnabled` ON が前提**。ON なら visibleTabs にバッテリーが入り、その状態のタブバーは **全 visibleTab（カレンダー/リスト/マップ/バッテリー[/CoAlter]）を表示**し `setActiveTab` で相互遷移可 = ✅ 正常。OFF（既定）ならバッテリータブ自体が非描画＝「そのページに居る」状態が発生しない（不発・inert）。
- `AlterTab.tsx`（449 行・バッテリー本体）実在。`UX-1c`（`:1072`）で alter タブは予定 0 件でも EmptyState を出さず Battery 本体を描画。

---

## 5. global nav（MAIN_NAV / BottomNav）の所在と現 HOME 非描画
⚠️ **現 HOME（AneurasyncHome）は fashion 時代の global bottom tab bar を描画しない**（仕様転換・regression ではない）。

- `lib/navigation.ts:16-20` `MAIN_NAV` = ホーム(`/`)/観測(`/stargazer`)/メッセージ(`/talk`)/Rendezvous(`/rendezvous`)/マイページ(`/my-page`)。**`/plan` を含まない**。
- `MAIN_NAV` を描画する `components/home/BottomNav.tsx`（`:5,13`）の consumer = **orphan `HomePageClient*` + fashion ページ群**（wardrobe/auction/ranking/products/style-drive/ar-shop/tribes 等）**のみ**。
- **現 HOME 経路では未描画**: `AneurasyncHome.tsx` は BottomNav を import せず、`(culcept)/layout.tsx` も `<PageTransition>{children}</PageTransition>` のみで global nav 非描画。
- 現 HOME のナビ paradigm = **Alter-composer 中心**: fixed-bottom Composer（`AneurasyncHome:993`）+ `HomeQuickAccess`（`:37`・`HOME_MORE_NAV` 経由で 観測/日記/トーク/カレンダー/Genome/Presence/Style 等へ）+ in-content discovery cards + InsightCard href CTA。
- → 現 HOME から他 surface へは HomeQuickAccess + カードで到達。**ただし /plan はどの global nav 配列にも無い**（§3 と整合）。

---

## 6. 欠落判定（path 単位 recovery の要否）
✅ **code-missing ゼロ → recovery 不要**。
- production 時代 HOME / Alter swipe（2 種）/ /plan route+client+5 タブ は全て local main `8c7a0b38d` に **実在**。古い commit/branch/backup からの path 移植は **不要**。
- 「到達できない」現象の正体は **flag-dark（planRouteLive/homeSwipeEnabled/alterTabEnabled/coalterPlanTabEnabled OFF 既定）** であり、消失ではない。**巻き戻し（/plan/CoAlter/Travel/LifeOps の最新 logic を旧 production に合わせて戻す）は不要かつ禁止方針通り回避**。

---

## 7. flag 既定値一覧（go-live に向けた点火対象・全て OFF 既定）
| flag | env | 既定 | 効果 |
|---|---|---|---|
| `planRouteLive` | `PLAN_ROUTE_LIVE` | OFF | 直 URL `/plan` を開通（OFF=404） |
| `homeSwipeEnabled` | `PLAN_HOME_SWIPE_ENABLED` | OFF | Home↔Plan 横スワイプ pane |
| `alterTabEnabled`（prop 経由） | `PLAN_FLAGS.alterTabEnabled` | OFF | /plan に「バッテリー」タブ追加 |
| `coalterPlanTabEnabled`（prop 経由） | `PLAN_FLAGS.coalterPlanTabEnabled` | OFF | /plan に「CoAlter」タブ追加 |
| `visualFlow` 系 | （server allowlist/global） | OFF | MorningMapView dynamic import 等 |

> いずれも **production env 変更＝CEO 承認案件**（本書では点火しない）。

---

## 8. CEO 判断事項（recovery ではなく go-live config / product 判断）
1. **/plan を本番 UI から到達可能にするか** → `PLAN_ROUTE_LIVE=true`（直 route）and/or `PLAN_HOME_SWIPE_ENABLED=true`（Home swipe）。env flip・CEO 承認。
2. **/plan に Alter(バッテリー)/CoAlter タブを出すか** → `alterTabEnabled`/`coalterPlanTabEnabled`。env flip。出すなら gate 3 のタブ相互遷移は ✅ 機能する。
3. **global nav に /plan を載せるか**（product 判断・任意 code 変更）: 現状 MAIN_NAV/HOME_MORE_NAV に /plan 無し。/plan を「メイン」にするなら (a) nav 配列に追加（小 code 変更・別タスク）or (b) Home-swipe paradigm に委ねる、のいずれか。**regression ではない**ので急がない。
4. **現 HOME の global bottom nav 非描画は仕様**（Alter-composer 中心へ転換）。fashion 時代の bottom tab bar（orphan `HomePageClient*` の MAIN_NAV BottomNav）は復活させない方針。新 HOME に永続 bottom nav が要るかは design 判断。

---

## 9. 検証範囲と留保
- 本書は **静的コード読解**（route/component/flag の存在と配線）。**実機ブラウザ描画・swipe ジェスチャ・タブ click の動的検証は未**（/plan は flag OFF で route が 404・authed 必須・Claude はログイン不可）。動的 smoke は CEO env（flag ON + login）で実施推奨。
- tsc/test は **コード変更ゼロ**ゆえ不変（baseline 55・本書は docs のみ）。
- production 非接続を厳守（DB/SQL/migration/apply/seed/origin push 一切なし）。

---

## 10. 次フェーズ
- 残ゲート（CEO 提示）: ① CEO authed staging smoke（login→baseline→観測→home/plan・R5 から継続）/ ② 本 HOME-SURFACE-VERIFY（本書で完了）/ ③ gate 3 = /plan タブ相互遷移（§4 で「alterTabEnabled ON 前提で ✅ 機能」と code 確認・実機は CEO env）。
- clean production 実構築（staging 274 + `stargazer_star_maps` 昇格）は引き続き **CEO GO + DB owner 同席**（R2-R5 + B-7 方針）。
- 本書は監査のみ・点火/巻き戻し/移植いずれも実施せず。

---
read-only / docs-only。production 非接続・コード変更ゼロ・DB write/apply/SQL/seed/origin push ゼロ。
