# Alter Plan Home Swipe — Visual Smoke Runbook

**作成日**: 2026-05-19 (initial) / 2026-05-20 (Phase 1 完成形対応)
**Status**: Phase 1 完了後の smoke 手順
**実装**: `feat/alter-plan-full-plan-pane` ブランチ (Phase 1)
**関連**:
  - `docs/alter-plan-home-integration-mini-design.md` (Phase 0 設計)
  - `docs/alter-plan-home-swipe-full-plan-pane-mini-design.md` (Phase 1 設計)

## 履歴

| 段階 | Pane 1 内容 | smoke 重点 |
|------|-------------|------------|
| 初版 (2026-05-19) | HomePlanPane (summary view) | summary 表示 + CTA tap で /plan へ |
| Phase 1 (2026-05-20) | PlanClient (full、displayMode="pane") | 本体 CRUD + Modal 動作 + Modal 開時 swipe disable |
| **Phase 2-A (2026-05-20)** | **PlanClient + CalendarTab を Compact Week Strip + Selected Day Agenda + FAB に refactor** | **月送り / selectedDate clamp / FAB / Today button / 月送り animation** |

---

## 0. Pre-flight

| 項目 | 確認 |
|------|------|
| PR CI lint-and-test PASS | ☐ |
| Vercel preview deploy 成功 | ☐ |
| Vercel preview canonical URL を取得 | ☐ |
| CEO 個人 Production Supabase に anchor が 1 件以上ある (理想は今日 / 明日 / 今週) | ☐（無くても empty state 検証可） |

---

## 1. Preview で flag を投入

Vercel Preview の branch-scoped env として **PLAN_HOME_SWIPE_ENABLED=true** を追加 (CEO 操作)。

```bash
# CEO 操作、Preview の branch=feat/alter-plan-home-swipe-integration scope のみ
echo "true" | npx vercel env add PLAN_HOME_SWIPE_ENABLED preview feat/alter-plan-home-swipe-integration
```

その後、PR で `.canary-trigger.json` 系の再 trigger は不要 (Vercel が自動 re-deploy)。

### 1.1 やらないこと

- ❌ Production env / all-Preview env に投入しない
- ❌ Development env に投入しない
- ❌ NEXT_PUBLIC_ prefix で投入しない（本 flag は server-side 評価）

---

## 2. Smoke 手順（CEO 操作、約 5 分）

### Step 1: canonical URL を private window で開く

- Safari Private or Chrome Incognito で Vercel preview URL を開く
- ログイン → Home 到達

### Step 2: Home pane の不変確認（重要）

- 既存 Home 体験（greeting / 心の天気 / AnswerCard / 会話 / AskHero）が**従来通り**表示
- Composer 入力欄が pointable / typable
- 既存 zone (`answer` / `ask`) の `ZoneErrorBoundary` が機能
- 画面下部に **dot indicator** が overlay (• ○、左 active = Home)

✅ PASS 条件: 既存 Home 体験が何ら変わっていない

### Step 3: 左 swipe で Plan pane (full PlanClient) に遷移

- 画面上で**左方向**に swipe (画面幅の 30% 以上 OR 速度 500 px/s 以上)
- 画面が Plan pane (右側) にスライド
- dot indicator が "○ •" に変化 (右 active = Plan)

✅ PASS 条件 (Phase 1):
- Plan pane に切り替わる
- header「Plan」(pane mode 簡素 chrome) + 「+ 教える」/「📋 教えた予定」 button
- Pill segmented tab "カレンダー / リスト / 地図" が表示、Calendar が default active
- pane mode の薄紫 gradient bg
- (anchor あれば) Calendar tab に anchor 表示、リスト tab / 地図 tab も切替で機能
- (anchor 無し) Plan empty state 表示
- ※ 旧版の "この先" header / "Plan を開く" CTA は **削除済** (HomePlanPane 廃止)

### Step 4: Plan pane で tab 切替

- "リスト" tab tap → FlowTab content 表示
- "地図" tab tap → MapTab content 表示
- "カレンダー" tab tap → CalendarTab に戻る

✅ PASS 条件: 3 tab すべて切替動作、active tab が pill 紫 fill

### Step 5: Plan pane で Modal 動作 (CRUD verify)

- "+ 教える" tap → AddAnchorModal が pane 内 overlay 表示
- modal に anchor 入力 → 登録 → Plan content が refresh、新 anchor 表示
- "📋 教えた予定" tap → SourceListModal 表示、登録済 source 一覧
- anchor row tap → AnchorDetailModal 表示
- "教え直す" tap → EditAnchorModal に遷移
- "この登録元ごと忘れさせる" → confirm → 削除 → Plan refresh

✅ PASS 条件: 全 4 modal (Add / Edit / Detail / SourceList) が動作、CRUD 完走

### Step 6: **Modal 開時の swipe disable 確認** (Phase 1 C3 新規)

- AddAnchorModal / EditAnchorModal / AnchorDetailModal / SourceListModal のいずれかを開く
- modal 表示中に**横 swipe を試す** → **pane が動かない**
- modal 表示中に**矢印キー ← →** → **pane 切替しない**
- modal を閉じる → swipe / keyboard nav が**復活**

✅ PASS 条件: modal 開時の swipe / keyboard 両方が完全に disable

### Step 7: 右 swipe で Home に戻る

- modal を閉じてから右 swipe → Home pane に戻る
- Home の状態 (scroll position / Alter chat 入力中の場合は入力内容も) が**保持**
- dot indicator が "• ○" に戻る

✅ PASS 条件: Home 状態が swipe 前と一致、Plan pane の tab 選択 / Modal state も保持

### Step 8: dot indicator click でも切替可能

- dot indicator の右 dot click → Plan pane へ
- dot indicator の左 dot click → Home pane へ

✅ PASS 条件: click 切替動作 (swipe できない環境のフォールバック)

### Step 9: keyboard 切替 (desktop)

- Plan pane で **←** 矢印 key → Home へ
- Home pane で **→** 矢印 key → Plan へ
- input / textarea にフォーカス中は keyboard 切替**無効**
- Modal 開時も keyboard 切替**無効** (Step 6 と同)

✅ PASS 条件: keyboard nav 動作 + 入力時 / modal 時は無効

### Step 10: 縦スクロール vs 横スワイプの衝突確認

- Plan pane で content を**縦 scroll**
- 縦 scroll 中に小さな横揺れがあっても、pane は切り替わらない (threshold 30% 強制)
- Home pane も同様

✅ PASS 条件: 縦 scroll が横 swipe を誘発しない

### Step 11: /plan 直 URL access の独立性確認

- 新 tab で `https://<preview>/plan` を直接開く
- PlanClient が **route mode** で表示 (full chrome: "ALTER · PLAN" tag + 大見出し + 説明文)
- HomeSwipeContainer / HomePaneIndicator が render されない
- Modal 動作 / Tab 切替は同様に機能

✅ PASS 条件: /plan は wrapper の影響を受けない (deep link 整合)

---

## 3. PASS 判定 (Phase 1 D-O-D)

§2 全 Step PASS なら **Phase 1 完成**:
- Home 既存体験 不変 ✅
- Plan pane に **full PlanClient** 表示 ✅
- 3 tab (Calendar / List / Map) 切替動作 ✅
- 4 Modal CRUD 動作 ✅
- **Modal 開時の swipe / keyboard disable** ✅ (Phase 1 C3 新規)
- swipe / dot / keyboard 3 経路で pane 切替動作 ✅
- 縦 scroll 衝突なし ✅
- /plan 直 URL 不影響 (route mode で従来表示) ✅
- a11y (aria-live announcement / focus 管理 / inert) 動作 ✅

## Phase 2-A 追加 smoke check (Compact Week Strip + FAB + Today button)

### 月送り navigation (◀ / ▶ tap)

- [ ] 月 header の ◀ ▶ tap で月送り動作 (Plan pane / /plan 両方)
- [ ] 月送り transition が 200ms slide animation で滑らか
- [ ] prefers-reduced-motion 設定時は instant (no animation)
- [ ] 12 月 → 1 月で年が +1、1 月 → 12 月で年が -1

### selectedDate clamp (GPT 補正 3)

- [ ] selectedDate = 1/31 → ▶ → 2/28 (非閏年 2026)
- [ ] selectedDate = 1/31 → ▶ → 2/29 (閏年 2028 想定、unit test で固定)
- [ ] selectedDate = 1/15 → ▶ → 2/15 (普通の day 維持)
- [ ] selectedDate = 5/31 → ▶ → 6/30 (6 月は 30 日まで)

### Selected day section

- [ ] Week strip cell tap で selectedDate 更新、紫円 移動
- [ ] SelectedDay header に "X月Y日" 表示
- [ ] 選択日が予定なし → 灰背景 + "予定なし" + 「+ この日に予定を追加」link
- [ ] 選択日が予定あり → anchor list (時刻 + title + locationText)
- [ ] anchor row tap で AnchorDetailModal 起動 (W1-X5 既存挙動)

### FAB (右下 紫 gradient)

- [ ] FAB が pane 右下 (bottom-20、HomePaneIndicator と重ねない位置) に表示
- [ ] FAB tap で AddAnchorModal 起動、date pre-filled (selectedDate)
- [ ] FAB が pane 内に閉じ込まる (PR #214 containing block 効果、Plan pane swipe 中も pane と一緒に移動)
- [ ] FAB の安全領域 (iOS notch / home bar): safe-area-inset-bottom 適用

### Today button (Beyond 採用)

- [ ] selectedDate ≠ today OR currentMonth ≠ today's month → "今日" button 表示
- [ ] selectedDate = today AND currentMonth = today's month → "今日" button 非表示
- [ ] "今日" button tap で currentMonth = 今月, selectedDate = 今日 にジャンプ

### a11y (Phase 2-A 範囲)

- [ ] 月送り button: aria-label "前月" / "翌月" (screen reader 読み上げ)
- [ ] Week strip: role="grid"、各 cell role="gridcell" + aria-selected + aria-current="date"
- [ ] Cell hit area ≥ 44×44px (min-h-[44px])
- [ ] FAB aria-label に選択日含む

---

## Phase 2-B 追加 smoke check (FlowTab 7 日リスト + AnchorThumbnail + 静的 ALTER card + FAB)

### 基本構造 (リスト tab 切替)

- [ ] Plan pane / /plan route で "リスト" tab tap → FlowTab content 表示
- [ ] 旧 timeline / 旧「昨日 / 今日 / 明日」セレクタが画面上に存在しない
- [ ] 旧 W1-X3 "+ HH:MM 頃を教える" link が画面上に存在しない (helpers は code-level で残るが render 0、CEO 補正 #3)
- [ ] 7 日 (今日含む) 分の `<section>` が縦に並ぶ (data-testid="plan-flow-section-{iso}")

### Section header (sticky、count badge、曜日色)

- [ ] 各 section header に "今日 · 5月20日(水)" / "明日 · 5月21日(木)" / "5月22日(金)" 形式の label
- [ ] 今日 section: text-indigo-700 font-semibold (Beyond §11.5)
- [ ] 日曜 section: text-rose-500 (JP locale 標準)
- [ ] 土曜 section: text-blue-500 (JP locale 標準)
- [ ] 平日 section: text-slate-900
- [ ] 予定あり日: 件数 badge "N 件" 表示 (text-xs text-slate-400、控えめ)
- [ ] 予定なし日: 件数 badge なし、代わりに "予定なし ›" button

### Sticky header behavior (Beyond §11.11)

- [ ] FlowTab を縦 scroll すると、現在の日の header が top に張り付く (sticky position)
- [ ] 次の日の header が来ると、現在 header が push されて入れ替わる
- [ ] backdrop-blur 効果で下層 anchor が薄く透けて見える (bg-white/95 + backdrop-blur-sm)
- [ ] /plan route mode (document scroll) でも sticky 動作
- [ ] Home pane mode (PlanClient h-full overflow-y-auto) でも sticky 動作

### AnchorRow (時刻 + title + sub + 右端 thumbnail)

- [ ] 各 anchor 行に左から: 時刻 / title / locationText (sub) / 右端 thumbnail
- [ ] 時刻: text-sm font-mono text-indigo-700 ("09:30" or "09:30 – 12:30")
- [ ] title: text-base font-medium text-slate-900 truncate
- [ ] locationText 存在時: text-xs text-slate-500 truncate
- [ ] rigidity="hard" の anchor は "固定" badge 表示
- [ ] thumbnail: w-14 h-14 rounded-xl bg-slate-100、中央 emoji 配置
- [ ] anchor row tap → AnchorDetailModal 起動 (W1-X5 既存)

### AnchorThumbnail (locationCategory emoji + sensitive privacy)

- [ ] locationCategory=cafe → ☕ icon (data-testid="plan-flow-thumb-cafe")
- [ ] locationCategory=office → 🏢 icon (data-testid="plan-flow-thumb-office")
- [ ] locationCategory=school → 🎓 icon
- [ ] locationCategory=outdoor → 🌿 icon
- [ ] locationCategory=transit → 🚃 icon
- [ ] locationCategory=public → 🏛️ icon
- [ ] locationCategory=home → 🏠 icon
- [ ] locationCategory なし、locationText あり → 📍 icon (unknown)
- [ ] locationCategory なし、locationText なし → · icon (none)
- [ ] sensitiveCategory 設定済 → 🔒 generic icon (data-testid="plan-flow-thumb-sensitive"、privacy 配慮)
- [ ] thumbnail aria-label が screen reader で正しく読み上げ ("カテゴリ: 〇〇" or "敏感カテゴリ")

### 「予定なし ›」 inline button (CEO 補正 #1)

- [ ] 予定なし日の header 右に "予定なし ›" button が表示 (data-testid="plan-flow-empty-{iso}")
- [ ] button hit area ≥ 44pt 縦 (min-h-[44px]、Apple HIG / WCAG 2.5.5 AAA)
- [ ] button tap → AddAnchorModal 起動、date=該当日 prefill
  - 例: "5月22日(金)" 行の "予定なし ›" → AddAnchorModal で date=2026-05-22, subtitle="リスト / 5月22日(金) から"
- [ ] Phase 3 の ALTER 提案 flow ではなく、既存 AddAnchorModal の流用
- [ ] hover で text-slate-600 + bg-slate-50 (subtle transition)
- [ ] aria-label に該当日含む ("5月22日(金) に予定を追加")

### 静的 ALTER 提案 card placeholder (CEO 補正 #2)

- [ ] 7 日内に "予定なし" 日が 1 つでもある → 末尾に static card 表示 (data-testid="plan-flow-static-alter-card")
- [ ] 全日に anchor あり → static card 非表示
- [ ] card の最初の "予定なし" 日 label を参照: 例 "5月22日(金) は何する？"
- [ ] card 文言:
  - "予定のない日には、ALTER が提案を置きにくる予定です"
  - "(Phase 3 で動作予定 — 今は説明だけ)"
- [ ] **絶対 NG (CEO 補正 #2 違反)**:
  - [ ] card 全体に onClick / cursor:pointer / hover effect が **無いこと**
  - [ ] DevTools で確認: outer `<section>` に cursor:default、内側 div に shadow なし
  - [ ] tabIndex なし → Tab navigation で focus 取らない
  - [ ] select-none で text 選択も防止
- [ ] role="region" + aria-label "ALTER 提案 (今後の機能、Phase 3 で実装予定)"

### FAB (Phase 2-A 同 pattern、今日 prefill)

- [ ] FAB 右下 fixed (data-testid="plan-flow-fab")、bottom-20 right-6 z-30
- [ ] 56px (w-14 h-14) rounded-full、紫 gradient (indigo-500 → purple-500)
- [ ] hover で shadow-xl + active:scale-95 (tactile feedback)
- [ ] FAB tap → AddAnchorModal 起動、date=今日 prefill (`subtitle="リスト / 今日 から"`)
- [ ] FAB が pane 内に閉じ込まる (PR #214 containing block 効果、Plan pane swipe 中も pane と一緒に移動)
- [ ] FAB の安全領域 (iOS notch / home bar): marginBottom: env(safe-area-inset-bottom) 適用
- [ ] aria-label に "今日 (5月20日(水)) に予定を追加" 形式

### 既存導線の不変 (Phase 2-A / Phase 1 整合性)

- [ ] PlanClient header「+ 教える」 button は両 mode で機能 (FAB と並行)
- [ ] anchor row tap → AnchorDetailModal 起動 → 編集 / 削除 動作 (W1-X5 既存)
- [ ] AddAnchorModal の signature 不変 (`initialState` / `contextSubtitle` を流用)
- [ ] Phase 2-A の CalendarTab に不影響 (本 wave touch なし)
- [ ] Phase 1 の HomeSwipeContainer / Modal lock に不影響

### Recurring + exception_dates + validity (既存 anchorsForDay 動作)

- [ ] FREQ=WEEKLY recurring anchor が当週同曜日 (該当 day) に表示
- [ ] FREQ=DAILY recurring anchor が 7 日全日に表示
- [ ] exception_dates 適用 (除外日は anchor 非表示)
- [ ] valid_until 後の日は anchor 非表示
- [ ] one-off anchor が指定日のみ表示

### A11y (Phase 2-B 範囲)

- [ ] 各 section: `<section aria-label="今日 · 5月20日(水) · 3 件">` 形式で screen reader 識別
- [ ] anchor row: role="button" + tabIndex=0 + Enter/Space tap (W1-X5 既存)
- [ ] thumbnail: role="img" + aria-label カテゴリ表現
- [ ] 「予定なし ›」 button: 該当日 aria-label
- [ ] FAB: aria-label に今日含む
- [ ] 静的 ALTER card: role="region" + aria-label "ALTER 提案 (今後の機能、Phase 3 で実装予定)"
- [ ] touch target 44pt 最小 (button / row 全て)
- [ ] prefers-reduced-motion でも UI 変化なし (FlowTab は animation 控えめ)

### Network / Console (Phase 2-B)

- [ ] Network: Production Supabase (aljavfujeqcwnqryjmhl) のみ、Alter staging (hjcrvndumgiovyfdacwc) 0 hit
- [ ] Network: `/api/coalter` / `/api/talk` / `/api/mirror` → 0 hit
- [ ] Console: `[Mirror]` / `[CoAlter]` / `[Phase 3]` 系 0 error
- [ ] Console: React 19 warning (e.g. 旧 inert / sensitive PropTypes) 0
- [ ] Console: framer-motion warning 0

---

## W1-Z 未適用問題 (Phase 1 PASS 後の課題、CEO 補正 #3)

Phase 1 は UI / 構造統合まで。**Production Supabase に Plan tables 未 migrate** な状態では:
- `/api/plan/anchors` GET が 500 を返す
- PlanClient が ErrorState 表示 ("読み込みに失敗しました")

これは **Phase 1 D-O-D の合否に影響しない** (UI 統合は完成)。Production で完全稼働させるには **W1-Z production migration apply** が必要 (CEO 判断、別 wave)。

W1-Z 判断材料:
- `docs/alter-plan-w1z-production-migration-decision.md` §11 Decision Tree
- Phase 1 smoke の Step 5 (CRUD) が ErrorState で止まる場合、W1-Z apply 判断材料

---

## 4. FAIL 時の即時 action

| 事象 | action |
|------|--------|
| Home pane の既存 UI が壊れる | flag を false に戻す (env rm)、再 deploy、root cause investigation |
| swipe が動かない | DevTools Console で motion / drag 系 error 確認、再現条件記録 |
| 縦 scroll で誤って pane 切替する | threshold / velocity の現実値を Console で計測、調整 PR |
| Plan pane が空白 / Home UI が漏れる | PR #214 の containing block fix が効いていない、CSS 退行確認 |
| Modal 開時に swipe で pane が動く | registerHomeSwipeModalOpen の hook 漏れ確認 (該当 modal の useEffect 追加) |
| Plan pane で Modal が開かない | PlanClient 内 button click の event propagation 確認 |
| Plan pane で `/api/plan/anchors` が 500 | Production tables 未 migrate (W1-Z 待ち)、UI 統合 PASS 判定には影響なし |
| /plan 直 URL が壊れる | wrapper の影響経路を audit (本来不影響なため、code bug の signal) |
| Composer 入力欄が swipe で誤発火する | composer focused state check 追加 (別 PR) |
| **Phase 2-A: 月送り tap で日付が壊れる** | clampDateToMonth helper の異常、unit test 再走で確認 |
| **Phase 2-A: FAB が tap できない / 位置が変** | z-index 衝突 / position fixed 退行、PR #214 containing block 効果を確認 |
| **Phase 2-A: 月送り animation がガクッとする** | reducedMotion の OS 設定 / framer-motion version 退行 |
| **Phase 2-A: 「今日へ」 button が表示されない** | selectedDate === today AND currentMonth === today's month の判定漏れ |
| **Phase 2-A: 月跨ぎ recurring anchor が表示されない** | anchorsForDay の expandRecurrence 退行、本 wave で touch していないので前提復元 |
| **Phase 2-B: リスト tab が空白 / blank** | FlowTab.tsx import error or render error、Console 確認、buildFlowDateRange / anchorsForDay の deps を再走 |
| **Phase 2-B: sticky header が機能しない** | scroll context (route mode = document、pane mode = main h-full overflow-y-auto) の上位に overflow:hidden が混入していないか確認 |
| **Phase 2-B: 「予定なし ›」 tap で modal が起動しない** | onAddRequest の渡し漏れ、PlanClient の `<FlowTab onAddRequest={openAdd} />` が真値か確認 |
| **Phase 2-B: 「予定なし ›」 tap で別日 modal が開く (date prefill 不一致)** | handleEmptyDayClick の `day` capture を確認 (closure 退行)、`initial.date` が isoDate(day) に一致するか DevTools で確認 |
| **Phase 2-B: 静的 ALTER card が tap で何か起こる (CEO 補正 #2 違反)** | StaticAlterSuggestionCard の cursor:default / tabIndex なし / onClick なし を即時確認、退行は revert |
| **Phase 2-B: thumbnail emoji が表示されない** | CATEGORY_META / categoryOf 退行、unit test 再走、locationCategory 値が enum 外でないか確認 |
| **Phase 2-B: sensitive anchor の内容が thumbnail に漏れる (CEO 補正 §4.4 違反)** | AnchorThumbnail の sensitiveCategory 早期 return を確認、🔒 generic icon に統一 |
| **Phase 2-B: FAB が tap できない / pane 外に出る** | Phase 2-A FAB と同 pattern、PR #214 containing block 効果を確認 (Phase 2-A の FAIL 対処と同じ) |
| **Phase 2-B: 旧 W1-X3 gap link が render される (CEO 補正 #3 違反)** | FlowTab.tsx で gap helpers (gapMinutes 等) を import していないか確認、render 0 を保つ |

---

## 5. 本番 enable 判断

- ✅ Preview smoke PASS
- ✅ CEO が 3 日以上 Preview で実用 (Plan pane を実際に使ってみる)
- ✅ Composer / Alter Chat / 会話体験に negative 影響なし

すべて満たしたら **Production env に PLAN_HOME_SWIPE_ENABLED=true 投入**を CEO 判断。

---

## 6. Rollback

```bash
# Preview env から flag を削除 (= flag OFF = wrapper 無効 = 従来 Home)
npx vercel env rm PLAN_HOME_SWIPE_ENABLED preview feat/alter-plan-home-swipe-integration --yes
```

Code は merge されていても、env が無ければ wrapper は active にならず、従来通り `<AneurasyncHome />` 単独 render。完全に reversible。

---

## 7. やらないこと（明示）

- ❌ AneurasyncHome.tsx の内部改変
- ❌ PlanClient.tsx の改変
- ❌ Production env に flag を初手で入れる (Preview smoke 後の CEO 判断)
- ❌ MAIN_NAV / HOME_QUICK_NAV / InstrumentRail に Plan アイコン追加
- ❌ Plan pane の編集 UI / モーダル展開 (CEO 補正で summary 限定)
- ❌ CoAlter / Mirror / /talk / D-* / canary 系
- ❌ Supabase migration / production data 変更
- ❌ service_role / DB password / connection string
