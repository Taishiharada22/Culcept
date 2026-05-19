# Alter Plan — Home 統合 Mini Design (W1-Home-Swipe)

**作成日**: 2026-05-19
**Status**: 採択待ち（CEO 承認後、別 PR で実装）
**branch**: `docs/alter-plan-home-integration-mini-design`（予定、本 docs commit 用）
**実装範囲**: 本 PR は **docs only**。実装は CEO 承認後の別 PR (1 PR / 3 commits 程度)

---

## 1. ゴール

`/plan` 直 URL で完結している Alter Plan を、**Aneurasync Home の横スワイプ体験に統合**する。

- ユーザーは Home で横スワイプして Plan に到達
- 既存 Home の Alter 体験 (greeting / 心の天気 / AnswerCard / AskHero / RendezvousQuickStatus / Composer) は**従来通り維持**
- Plan は**追加のスワイプ先 (pane)** として登場、既存 zone を改変しない

### CEO 北極星との整合
- 今月の成功条件 **#3「世界観の確立」** — Plan が「便利機能」ではなく「Aneurasync 一貫体験の一部」になる
- 今月の成功条件 **#1「コア機能の完成」** — Plan を Home 動線に置くことで実用性が立ち上がる
- 今月の成功条件 **#4「デプロイ可能状態」** — 既存 Home 不変 + 追加 pane の最小増分

---

## 2. 既存 Home 構造（read-only 調査結果）

### 2.1 アクティブ Home 経路

```
URL "/" (app/(culcept)/page.tsx)
  ↓ server: auth / baseline / star_maps チェック
  ↓ redirect 分岐: 未ログイン → /login or /welcome, 匿名 → /stargazer, baseline未 → /baseline, 観測未 → /stargazer
  ↓
<AneurasyncHome visualFlowEnabled={…} />  (app/AneurasyncHome.tsx, 1142行)
```

- `app/HomePageClient.tsx` / `HomePageClientNew.tsx` は別経路で active ではない (新規 user / marketing 系)
- アクティブ Home は **AneurasyncHome.tsx 一本**

### 2.2 AneurasyncHome 内構造

| 要素 | 役割 | 場所 |
|------|------|------|
| **vertical scroll container** (`overflow-y-auto`) | 単一カラムの会話キャンバス | line 705 |
| `InlineInnerWeather` | 心の天気 | line 717-719 |
| `ZoneErrorBoundary zoneName="answer"` | AnswerCard (Alter の今日の一手 compact) | line 722-736 |
| `RendezvousQuickStatus` | Rendezvous compact 通知 | line 741 |
| `PlanOutfitViewer` (conditional) | **既に存在する Plan 系 viewer** (overlay、retrievalViewer state で表示) | line 746-755 |
| 挨拶 (`greetDisplay`) | 未会話時の typing greeting | line 758-783 |
| `ContextReel` (alter insights) | 気づきカード | line 810-815 |
| `LocationOptInBanner` (conditional) | inline opt-in banner | line 824-841 |
| `ZoneErrorBoundary zoneName="ask"` | AskHero (会話 transcript) | line 844-947 |
| `Composer` (below scroll) | 入力 UI | line 700 以下 (outside scroll) |

→ **vertical scroll の single-column**、horizontal swipe は **不在**。zone は `answer` と `ask` の 2 つ。

### 2.3 既存 nav 構造（`lib/navigation.ts`）

| nav | 用途 | Plan 言及 |
|-----|------|-----------|
| `MAIN_NAV` (5項目: ホーム / 観測 / メッセージ / Rendezvous / マイページ) | 下部 dock、**tap navigation** | なし |
| `HOME_QUICK_NAV` (5項目: コーデ / 観測 / 日記 / トーク / 出会う) | Home 上部 quick access、**tap** | なし |
| `HOME_MORE_NAV` (3項目) / `EXPLORE_NAV` (4項目) | 補助 nav、**tap** | なし |

→ Plan は現在どの nav にも統合されていない。直 URL `/plan` 経由のみ。

### 2.4 既存 swipe 系コンポーネント

| component | 用途 | 横スワイプ zone 切替か？ |
|-----------|------|----------------------|
| `components/ui/SwipeStack.tsx` | カード単位 swipe (Rendezvous / 商品系) | ❌ |
| `components/home/InstrumentRail.tsx` | Home instrument rail (vertical drag position) | ❌ (vertical drag) |
| `components/home/InstrumentFlyout.tsx` | instrument tap → flyout 展開 | ❌ |
| `components/home/morning/PlaceDetailSheet.tsx` | 場所詳細 sheet | ❌ (sheet) |

→ **Home zone を横スワイプで切り替える機構は不在**。本 wave で新規導入する必要あり。

### 2.5 既に存在する Plan-Home の弱い結合

- `PlanOutfitViewer` (line 746): Home の scroll 内に conditional overlay、retrieval (過去のコーデ閲覧) 用途
- `handleComposerSubmit("${date} の予定について相談したい")` (line 752): Alter Chat 経由で Plan 議論を起動
- これらは「Plan を Home から扱う最小 connection」だが、**Plan UI 本体 (anchor 登録 / recurring / delete) は Home から到達できない**

---

## 3. ゴール逆算 — Plan 統合 4 候補

CEO 提示の 4 option を、Aneurasync philosophy + 制約 + 既存構造に照らして評価。

### Option α — 新規 zone として Home の vertical scroll に追加

AneurasyncHome.tsx の zone リストに `<ZoneErrorBoundary zoneName="plan">` を追加し、Plan summary を scroll 内に inline。

| 項目 | 評価 |
|------|------|
| 横スワイプ統合 | ❌ (vertical scroll の延長) |
| 既存 Home 体験不変 | ⚠️ (Home が長くなる、scroll 深さ増、AnswerCard / AskHero の認知比重低下) |
| Plan の独立性 | ❌ (Plan が Home 体験に従属、anchor 操作 UI は Home 内で表示困難) |
| 実装コスト | 中 (zone 1 追加、ただし AneurasyncHome.tsx 改変必須) |
| philosophy 整合 | △ ("scroll で Plan が出てくる" は Aneurasync の "余韻" pattern と整合するが、CEO 意図と不一致) |

**評定**: CEO 目的「横スワイプ統合」に反する。**不採用**。

### Option β — 既存 nav (InstrumentRail / OrbitDock / HOME_QUICK_NAV) に Plan アイコン追加

`HOME_QUICK_NAV` に Plan 1項目追加 or `InstrumentRail` / `OrbitDock` に Plan instrument 追加、tap で `/plan` 遷移。

| 項目 | 評価 |
|------|------|
| 横スワイプ統合 | ❌ (tap navigation のみ) |
| 既存 Home 体験不変 | ✅ (rail / nav 1 アイテム追加のみ) |
| Plan の独立性 | ✅ (別 route で full feature) |
| 実装コスト | 最小 (nav config に 1 行追加) |
| philosophy 整合 | ⚠️ (Plan が "ボタンの 1 つ" になる、世界観統合が弱い) |

**評定**: CEO 目的「**スワイプ**統合」と不一致。最低限の入口は確保できるが、横スワイプ体験ではない。**補助案として保持**(本命の δ と併用可)。

### Option γ — 直接 /plan に遷移するだけ

`MAIN_NAV` または `HOME_QUICK_NAV` に Plan 追加、最も保守的。

| 項目 | 評価 |
|------|------|
| 横スワイプ統合 | ❌ |
| 既存 Home 体験不変 | ✅ |
| 実装コスト | 最小 (β と実質同等、tap で別 page) |

**評定**: β のサブセット。**不採用** (β 含めて再考)。

### Option δ — Plan を swipe pane として Home にラップ統合

AneurasyncHome の戻り値全体を pane 0 とし、新規 horizontal swipe wrapper の pane 1 として Plan summary を追加。ユーザーは Home で**左スワイプ** → Plan pane、**右スワイプ** → Home pane に戻る。

| 項目 | 評価 |
|------|------|
| 横スワイプ統合 | ✅ (CEO 目的と完全一致) |
| 既存 Home 体験不変 | ✅ (AneurasyncHome.tsx は touch しない、外側 wrapper のみ) |
| Plan の独立性 | ✅ (`/plan` 直 URL は不変、Home pane 経由は summary view) |
| 実装コスト | 中 (新規 wrapper component + Plan summary view + pane indicator) |
| philosophy 整合 | ✅ ("Home の隣に自分の時間がある" = Aneurasync 第二の自己体験) |

**評定**: **本命**。CEO 制約「既存zone不変 + Plan を追加スワイプ先」を満たし、世界観統合度が最大。

---

## 4. 推奨設計 — Option δ + 自立推論 Beyond 設計

### 4.1 構造

```
<HomeSwipeContainer>           ← 新規、horizontal swipe wrapper
  <Pane index={0}>             ← Home (既存 AneurasyncHome 不変)
    <AneurasyncHome />
  </Pane>
  <Pane index={1}>             ← Plan (新規 summary view)
    <HomePlanPane />
  </Pane>
  <PaneIndicator />            ← 新規、画面下部の dot indicator (2 pane あることを示す)
</HomeSwipeContainer>
```

- `HomeSwipeContainer`: framer-motion ベース。`drag="x"` + `dragConstraints` + `dragElastic`、pane index state 管理
- `Pane`: 1 pane 単位、`overflow-y-auto` で内部 vertical scroll
- `HomePlanPane`: Plan の Home 用 summary view (今日 / 明日 / 今週 anchors、"Plan を開く" CTA で `/plan` へ full navigate)
- `PaneIndicator`: 2 dot、現在 pane を highlight

### 4.2 配置とファイル

| ファイル | 種別 | スコープ |
|----------|------|----------|
| `components/home/HomeSwipeContainer.tsx` | 新規 | horizontal swipe wrapper、pane state、gesture lock |
| `components/home/HomePlanPane.tsx` | 新規 | Plan の Home 用 summary、`useExternalAnchors` で今日/明日/今週の上位 5 件、"Plan を開く" tap で `router.push("/plan")` |
| `components/home/HomePaneIndicator.tsx` | 新規 | 画面下部 dot indicator (2 個)、active pane highlight |
| `app/(culcept)/page.tsx` | 修正 (1-3 行) | `<AneurasyncHome />` を `<HomeSwipeContainer>` でラップ |
| `app/AneurasyncHome.tsx` | **不変** | CEO 制約「既存 Alter 体験不変」遵守 |
| `app/(culcept)/plan/PlanClient.tsx` | **不変** | CEO 制約「/plan 本体機能は極力変更しない」遵守 |

LOC 見込み: 新規 約 300-450 行、変更 1-3 行。

### 4.3 Beyond — 自立推論で組み込む 5 設計

#### B1. Plan pane を "**この先の自分の時間**" として position する (Aneurasync philosophy 整合)

`HomePlanPane` の見え方は**予定リスト**ではなく**第二の自己が把握している自分のこの先の時間**として designed。

- zone label を「予定」ではなく「**この先**」or 「**自分の時間**」(CEO 確認)
- anchor 0 件 empty state copy: 「あなたのこの先がここに置かれていきます」(philosophy 文脈、`/plan` 直 URL の機能 copy とは別)
- 上位 anchor の表示も「14:30 に歯科」ではなく Aneurasync 一貫トーン (CEO 補正可)

#### B2. **Gesture 競合解消** (vertical scroll vs horizontal swipe)

- framer-motion `drag="x"` + `dragDirectionLock` で X 軸 swipe と Y 軸 scroll を排他
- `dragElastic` 適度 (0.2 程度) で過度な flex を防止
- swipe threshold: 画面幅の 30% (or velocity > 500) で pane 切替確定、それ未満は元 pane に戻る
- Plan pane 内の縦 scroll (今後の week anchors 一覧等) は pane 内で独立

#### B3. **Pane indicator (visual disclosure)**

- 画面下部に 2 個の dot、active pane を highlight
- Aneurasync の signature 色 (`#6366F1` purple gradient) で世界観 continuity
- pane 切替 transition は cross-fade + slide、Aneurasync の "余韻" feel に合わせる
- ユーザーに「もう 1 つの pane がある」を視覚的に伝える

#### B4. **Pane の独立性と deep link 整合**

- Plan pane の URL は変えない (Home `/` のまま、pane state は client state のみ)
- `/plan` 直 URL access は pane wrapper なし、単独 PlanClient 表示 (既存通り)
- Plan pane → tap で `/plan` 直 URL に full navigate、back で Home に戻る
- pane index は localStorage で保持しない (毎回 Home pane 0 から開く、user 認知一貫性)

#### B5. **Zone isolation (Home 不変保証)**

- `HomePlanPane` の render error が Home pane に影響しない (各 pane を `ZoneErrorBoundary` でラップ、`zoneName="plan-pane"` 等)
- Plan pane が Supabase fetch error しても Home pane (Alter 体験) は完全に動く
- pane 0 (Home) は AneurasyncHome.tsx の戻り値をそのまま wrap、内部 props / state は touch しない

---

## 5. やらないこと（CEO 制約 + 自立推論で追加）

### CEO 明示制約

- ❌ CoAlter / Mirror / `/talk` / CoAlter D-* / canary smoke 系
- ❌ production migration apply
- ❌ service_role / DB password / connection string 使用
- ❌ Plan 機能本体の大幅改修 (`PlanClient.tsx` / `lib/plan/` 触らない)
- ❌ DraftPlan generator
- ❌ W1-6 passive drift logging
- ❌ 既存 Home 体験の破壊 (AneurasyncHome.tsx 不変)
- ❌ β 運用 docs 主導
- ❌ env 変更
- ❌ Supabase migration 追加

### 自立推論で追加する非目標

- ❌ MAIN_NAV / HOME_QUICK_NAV / EXPLORE_NAV / HOME_MORE_NAV の改修 (本 wave では nav config に Plan を追加しない、swipe pane で代替)
- ❌ InstrumentRail / OrbitDock に Plan instrument 追加 (Plan は "tool" ではなく "zone" として扱う)
- ❌ HomePlanPane に anchor 登録 UI / edit UI を埋め込む (CEO 制約「/plan 機能本体不変」遵守、登録は `/plan` 直 URL で実施)
- ❌ pane 数を 3 以上にする (本 wave は 2 pane 限定、将来 wave で観測 / Genome / Rendezvous 等を pane 化検討)
- ❌ Home/Plan pane 間の data sync (各 pane は独立 fetch、状態共有なし)
- ❌ swipe transition の音響 effect (CEO 補正可、本 wave では visual のみ)
- ❌ AneurasyncHome 内の既存 `PlanOutfitViewer` / `RendezvousQuickStatus` の改修 (既存通り維持)

---

## 6. 想定 user flow (実装後の体験)

### 6.1 Home → Plan (左 swipe)

```
1. user が Home (pane 0) を見ている
   - Alter greeting / 心の天気 / AnswerCard / 会話 transcript
   - 画面下部に dot indicator (• ○)
2. user が左 swipe (X 軸 drag)
   - pane indicator が "○ •" にスライド
   - Home content が右に slide-out、Plan content が左から slide-in
3. user は Plan pane (pane 1) を見ている
   - "この先" label + 今日 / 明日 / 今週の anchor 上位 5 件
   - "Plan を開く" CTA
4. user が "Plan を開く" tap
   - router.push("/plan") で full PlanClient へ遷移
```

### 6.2 Plan → Home (右 swipe)

```
1. user が Plan pane (pane 1) を見ている
2. user が右 swipe
   - pane indicator が "• ○" に戻る
   - Plan content が右に slide-out、Home content が左から slide-in
3. user は Home pane (pane 0) を見ている
   - Home 状態は swipe 前と同一 (Alter chat 入力中なら入力中のまま)
```

### 6.3 `/plan` 直 URL access (deep link)

```
1. user が "/plan" を直接開く (browser bookmark / share URL / etc.)
2. PlanClient が単独 render (HomeSwipeContainer wrapper なし)
3. PlanClient の戻り (browser back / nav home) は既存通り
```

---

## 7. 実装 wave 案 (CEO 承認後の別 PR)

### 7.1 Commit 構成 (3 commits)

| commit | 内容 | LOC |
|--------|------|-----|
| 1 | 新規 component 3 個 (`HomeSwipeContainer` / `HomePlanPane` / `HomePaneIndicator`) + unit tests | 約 350 |
| 2 | `app/(culcept)/page.tsx` で `AneurasyncHome` を wrapper 統合 + visual smoke 手順記述 | 約 5-10 (page.tsx) |
| 3 | (optional) Aneurasync philosophy 整合 copy / label / transition timing 微調整 | 約 20-50 |

### 7.2 Branch / PR 命名

- branch: `feat/alter-plan-home-swipe-integration`
- PR title: `feat(plan): Home 横スワイプ統合 — Plan を 2 pane 目として追加 (W1-Home-Swipe)`

### 7.3 Test 戦略

| 種別 | 内容 |
|------|------|
| unit | `HomeSwipeContainer` の pane 切替 logic / `HomePlanPane` の anchor fetch + render / `HomePaneIndicator` の active pane highlight |
| integration | `app/(culcept)/page.tsx` で wrapper 経由 render、既存 Home 経路 (server redirect 全 case) 不変確認 |
| visual smoke (CEO 手動) | (a) Home → 左 swipe → Plan pane → 右 swipe → Home / (b) `/plan` 直 URL 不変 / (c) Plan pane 内 "Plan を開く" tap → `/plan` 遷移 / (d) `PlanOutfitViewer` (既存) / `RendezvousQuickStatus` (既存) 表示不変 |
| regression | 既存 zone (answer / ask) の機能完走、`ZoneErrorBoundary` 動作、Alter chat / composer 不変 |

---

## 8. Risks と緩和策

| risk | 影響 | 緩和策 |
|------|------|--------|
| gesture 競合 (vertical scroll vs horizontal swipe) | user 操作不能 | `dragDirectionLock`、swipe threshold 30%、velocity gate |
| Plan pane 描画 error が Home pane に伝搬 | Home 全壊 | 各 pane を `ZoneErrorBoundary` でラップ、独立 fallback |
| `/plan` 直 URL の影響 | 既存機能崩壊 | wrapper は `app/(culcept)/page.tsx` のみで適用、PlanClient.tsx 不変 |
| Plan pane の Supabase fetch 失敗 | empty state 表示 | empty state を philosophy 文脈 copy、retry button、Home pane は完全不変 |
| pane indicator が SSR で hydration mismatch | UI flicker | client-only render (`useEffect` で active pane 反映) |
| swipe transition の performance (低速端末) | gesture lag | framer-motion の `layoutId` 不使用、transform CSS のみ、`will-change` 適用 |
| Alter Chat 入力中の swipe 暴発 | 入力 lost | Composer focused state で swipe 無効化 (focus event listener) |

---

## 9. 受容判定 (DoD、実装 PR で確認)

- ✅ Home (pane 0) で Alter greeting / 心の天気 / AnswerCard / 会話 / AskHero / RendezvousQuickStatus が**従来通り**完走
- ✅ 左 swipe で Plan pane (pane 1) に遷移、Plan summary 表示
- ✅ 右 swipe で Home pane に戻る、Home 状態 (Alter 会話入力中 等) 不変
- ✅ Plan pane の "Plan を開く" CTA で `/plan` full PlanClient に遷移
- ✅ `/plan` 直 URL access は wrapper なしで単独 PlanClient (既存通り)
- ✅ `PlanOutfitViewer` / `RendezvousQuickStatus` / `Composer` / `AskHero` / `AnswerCard` 全て不変
- ✅ pane indicator dot が active pane を視覚化
- ✅ gesture 競合 0 (vertical scroll と horizontal swipe が衝突しない)
- ✅ zone isolation (Plan pane の error が Home pane に影響しない)
- ✅ `npx tsc --noEmit` 0 errors
- ✅ `npm run test:unit` 既存 + 新規 全 PASS
- ✅ `npm run build` ✓ Compiled successfully
- ⏳ CEO visual smoke (Home → Plan → Home の swipe 体験 + Plan 直 URL 不変)

---

## 10. CEO 判断点

本 mini design を CEO がレビューし、以下を決定：

### 判断 1: 設計方針

| 選択 | 帰結 |
|------|------|
| **Option δ + Beyond (推奨)** | 実装 wave 起票 (本 docs §7 構成)、新規 wrapper / Plan pane / pane indicator |
| Option β (簡易) | 実装 wave 起票、nav config に Plan アイコン追加のみ (横 swipe 統合は将来) |
| Option α (zone 追加) | 実装 wave 起票、AneurasyncHome.tsx 内に Plan zone 追加 (Home 改修必要) |
| **保留** | 別 wave 優先、本 mini design は保留 |

### 判断 2: Beyond 設計の採否

| Beyond | 採否 | 備考 |
|--------|------|------|
| B1. "この先" philosophy 文脈 copy | ☐ 採用 / ☐ 不採用 | label / copy の最終文言は CEO |
| B2. Gesture 競合解消 | ☐ 採用 (必須) / ☐ 不採用 | 不採用なら UI 動作不能 risk |
| B3. Pane indicator | ☐ 採用 / ☐ 不採用 | 不採用なら "swipe できることを user が気付かない" risk |
| B4. Deep link 整合 | ☐ 採用 (必須) / ☐ 不採用 | 不採用なら `/plan` 直 URL 壊れる |
| B5. Zone isolation | ☐ 採用 (必須) / ☐ 不採用 | 不採用なら Home 壊れる risk |

### 判断 3: Plan pane の表示内容範囲

| 候補 | 内容 |
|------|------|
| (i) Summary view (推奨) | 今日 / 明日 / 今週 anchor 上位 5 件 + "Plan を開く" CTA |
| (ii) Full PlanClient embed | Plan の全機能 (Calendar / Flow / Map tab 全部) を pane に embed (cognitive overload risk) |
| (iii) Empty + CTA のみ | "Plan を開く" CTA のみ、anchor 表示なし (極端に保守的) |

### 判断 4: 実装着手 timing

| 選択 | 帰結 |
|------|------|
| **即着手** (本 docs merge 後すぐ別 PR) | 1-3 日で実装 wave 着地 |
| 保留 (他 wave 優先) | 本 mini design は merge して docs として保管、実装は後日 |

---

## 11. References

- `app/(culcept)/page.tsx` (Home server entry、auth redirect 一本化)
- `app/AneurasyncHome.tsx` (本命 Home client、本 wave で touch しない)
- `app/_home/instrumentRailConfig.ts` / `orbitDockConfig.ts` (既存 Home tool 配置)
- `lib/navigation.ts` (MAIN_NAV / HOME_QUICK_NAV / EXPLORE_NAV)
- `components/home/InstrumentRail.tsx` (existing vertical-drag rail)
- `components/ui/SwipeStack.tsx` (card swipe primitive、本 wave では参照のみ)
- `app/(culcept)/plan/PlanClient.tsx` (Plan body、本 wave で touch しない)
- `docs/alter-plan-foundation-design.md` (Plan 全体設計)
- `docs/alter-plan-beta-readiness.md` (β / W1-Z 判断資料、本 wave とは独立)

---

## 12. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-19 | W1-Home-Swipe (Home 横スワイプ統合) mini design 起票、CEO 補正「Home swipe/nav 解禁の初 wave、Plan を追加 pane として統合」(2026-05-19) | CEO レビュー待ち |

---

**End of Mini Design**. CEO レビュー → 判断 1-4 → 実装 wave GO/NO-GO 判断をお待ちします。
