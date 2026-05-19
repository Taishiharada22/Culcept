# Alter Plan — Home Swipe **Full Plan Pane** Mini Design (W1-Home-Swipe Phase 2)

**作成日**: 2026-05-20
**Status**: 採択待ち（CEO 承認後、実装 wave に進む）
**branch**: `docs/alter-plan-home-swipe-full-plan-pane-mini-design`
**実装範囲**: 本 PR は **docs only**。実装は CEO 承認後の別 PR (1 PR / 3 commits 程度)

---

## 0. 認識訂正 — CEO 完成形の言語化

CEO 2026-05-19 スクショ「ALTER アプリ構造と画面コンプト（最新案）」と GPT 補正 (二度目) で確定した完成形:

```
Home (左 pane、チャット集中、従来不変)
  ↔  横スワイプ  ↔
Plan (右 pane、本体そのもの)
  ├ カレンダー  (月グリッド + 日別 anchor + FAB)
  ├ リスト      (日付セクション + image thumbnail 行)
  └ 地図        (実 Map + route 接続 + ALTER 提案 CTA)
```

**核心の修正点**:
- 現状 `Home → swipe → HomePlanPane (summary) → "Plan を開く" CTA → /plan` は**中間形**
- 完成形は `Home → swipe → PlanClient (full) ` の **直接到達**
- `/plan` 直 URL は従来通り単独画面として**維持** (deep link / bookmark 互換)

### CEO スクショの精読 (情報設計 + ビジュアル抽出)

| 領域 | 抽出内容 |
|------|----------|
| **Plan top chrome** | "Plan" タイトル中央大、左 ≡ menu、右 🗓 calendar icon |
| **Tab UI** | **Pill segmented control**: "カレンダー" / "リスト" / "地図"、active=濃紫 fill、inactive=薄背景 |
| **カレンダー tab** | 月見出し "4月 2026" + 月送り arrow / 7 列週グリッド (日月火水木金土) / 数字行 + 選択 day = 紫丸 / 日付下に anchor 1 行ずつ (時刻 + title + sub) / 右下 FAB "+" 紫 gradient |
| **リスト tab** | 日付セクション "4月23日 (木)" "4月24日 (金)" ... / 各 anchor: 時刻 + title + sub + 右端 image thumbnail / 予定なし日: 薄字 "予定なし >" CTA / 下部: "予定のない日をタップすると..." 案内 card |
| **地図 tab** | 上部: 実 Map (Google Maps 想定) + 紫 route line + pin (時系列) / 下部 card: "ALTER が自動で最適ルートを提案" + 副 text + "ルートを表示" button / 末尾 footnote |
| **空き日 → ALTER flow** | (1) 予定なし日タップ → (2) ALTER 質問 "4月24日は何する？" + 提案チップ → (3) おすすめ提案 (タイトル + 画像) → (4) 1tap で予定作成 → (5) "予定を作成したよ！他にも追加する？" |
| **配色** | 薄白〜薄紫 gradient base、accent = `#6366F1` indigo → `#A855F7` purple gradient |
| **形状** | 全体 rounded-2xl / tab pill rounded-full / card rounded-2xl / FAB 大円 |
| **余白** | 多め (px-5 py-6 系) |
| **トーン** | やさしい、押し付けない、Aneurasync 世界観 |

---

## 1. ゴール逆算

**究極ゴール**: ユーザーが Home → swipe で Plan 本体に到達、別画面遷移なし、同一体験フロー内で予定管理可能。

**Aneurasync philosophy 整合**:
- "Plan を開く" CTA = "外部の Plan へ行く" 感
- direct swipe access = "**第二の自己**が把握する自分の時間が、ここにある" 感
- 「自分の延長」体験の核 (CEO 北極星)

---

## 2. 現状との差分

### 実装済 (本セッション C1-C3 PR #212/#214/#216)

- HomeSwipeContainer 構造 ✅
- 2-pane (Home / Plan) horizontal swipe ✅
- Pane isolation (containing block 修正) ✅
- Gesture 競合対策 (threshold / velocity / direction lock / edge back ignore) ✅
- Graceful degradation (fetch fail → empty state) ✅
- HomePlanPane = **summary view** (CEO 完成形では不要、置換対象)

### 完成形との差分マトリクス

| 項目 | 現状 (PR #216 後) | 完成形 (CEO スクショ) | 差分種別 |
|------|---------|-----------|----------|
| Pane 1 内容 | HomePlanPane (summary + CTA) | **PlanClient (full)** | 構造変更 |
| Header chrome | "この先" + subtitle | "Plan" タイトル + 3 tab | UI 変更 |
| Tab 表示 | (なし) | Calendar / List / Map の 3 タブ | 構造拡張 |
| Tab UI style | (なし) | **Pill segmented** | 新規実装 |
| 主操作 | "Plan を開く" tap | direct swipe access | 構造変更 |
| Anchor 操作 | (read-only summary) | full CRUD via modals | 構造拡張 |
| /plan 直 URL | 動作 OK | **同上を維持** | 不変 (互換) |
| 配色 | 白→薄紫 gradient | 薄紫 base | 微調整 |

### 現状の `PlanClient` (route mode) との差分

| 項目 | 現状 (PlanClient route mode) | 完成形 mock |
|------|---------------------|-----------|
| Header | "ALTER · PLAN" + "あなたの生活、3 つのレンズ" + 2 button | "Plan" 単純タイトル + 3 tab |
| Tab style | `border-b-2` underline | **pill segmented (rounded-full)** |
| 配色 | white→slate-50 gradient | 薄紫 gradient |
| CalendarTab 内部 | 週ビュー (現状) | **月ビュー** (大きい差) |
| FlowTab 内部 | 1 日 timeline (現状) | **リスト** (日付セクション + image thumbnail) |
| MapTab 内部 | location_category group (no actual map) | **実 Google Maps + route 描画** (大きい差) |
| 空き日 → ALTER flow | (なし) | 質問 → 提案 → 1tap 作成 (大きい差) |

---

## 3. Full Plan Pane 化の最小安全設計

### 3.1 設計判断

**Phase 分割で risk 管理**:
- **Phase 1 (本 wave)**: 構造完成 — Pane 1 を summary から full PlanClient に置換、tab UI を pill 化、配色 nudge
- **Phase 2 (別 wave)**: tab 内部の mock 寄せ — CalendarTab を月ビューに / FlowTab を image thumbnail に / MapTab に Google Maps integration
- **Phase 3 (別 wave)**: 空き日 → ALTER flow integration — Stargazer / Alter engine 接続

本 PR は **Phase 1 の設計** に限定。Phase 2/3 は本 wave 完了後、別 design docs で起票。

### 3.2 `PlanClient` に `displayMode` prop 追加

```tsx
type PlanDisplayMode = "route" | "pane";

interface PlanClientProps {
  displayMode?: PlanDisplayMode; // default: "route"
}

export default function PlanClient({ displayMode = "route" }: PlanClientProps = {}) {
  const isPane = displayMode === "pane";

  return (
    <main className={
      isPane
        ? "h-full overflow-y-auto bg-gradient-to-b from-white via-indigo-50/40 to-purple-50/30"
        : "min-h-screen bg-gradient-to-b from-white to-slate-50"
    }>
      {/* Header chrome: mode で出し分け */}
      {isPane ? <PaneHeader ... /> : <RouteHeader ... />}

      {/* Tab nav: 両 mode 共通、pill segmented */}
      <PillTabNav activeTab={activeTab} onSelect={setActiveTab} />

      {/* Content: 両 mode 共通 */}
      <Section>{/* tab 切替 */}</Section>

      {/* Modals: 両 mode 共通 */}
      ...
    </main>
  );
}
```

**Mode 別差分**:

| 項目 | route mode | pane mode |
|------|-----------|-----------|
| Root container | `min-h-screen` | `h-full overflow-y-auto` |
| Background | white→slate-50 gradient | white→indigo→purple-tinted gradient (薄紫 nudge) |
| Header | "ALTER · PLAN" tag + 大見出し + 説明文 + 2 button | "Plan" タイトル + 2 button (CEO mock 寄せ) |
| Footer area | (なし) | (なし、CTA「Plan を開く」廃止) |
| Outer padding | `px-4 py-8` | `px-4 py-6` (やや圧縮、pane 内余白考慮) |

### 3.3 `app/(culcept)/page.tsx` で wrapper を更新

```tsx
import PlanClient from "../(culcept)/plan/PlanClient";

if (PLAN_FLAGS.homeSwipeEnabled) {
  return (
    <HomeSwipeContainer
      homePane={<AneurasyncHome visualFlowEnabled={visualFlowEnabled} />}
      planPane={<PlanClient displayMode="pane" />}
    />
  );
}
return <AneurasyncHome visualFlowEnabled={visualFlowEnabled} />;
```

### 3.4 `HomePlanPane` の処理

- **本 wave で削除** (`components/home/HomePlanPane.tsx` を delete)
- 関連 helper `lib/plan/home-plan-summary.ts` も削除 (もう使われない)
- 関連 test `tests/unit/plan/homePlanSummary.test.ts` も削除

ただし `lib/plan/home-swipe-intent.ts` と `tests/unit/plan/homeSwipeIntent.test.ts` は **保持** (HomeSwipeContainer の gesture logic は不変)。

### 3.5 Tab UI を Pill Segmented Control に refactor

両 mode (route / pane) 共通で適用:

```tsx
<nav role="tablist" className="mx-auto mb-6 max-w-3xl">
  <div className="inline-flex rounded-full bg-slate-100 p-1 shadow-inner">
    {TABS.map((tab) => {
      const isActive = activeTab === tab.key;
      return (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => setActiveTab(tab.key)}
          className={
            "px-5 py-2 rounded-full text-sm font-medium transition-all " +
            (isActive
              ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-800")
          }
        >
          {tab.label}
        </button>
      );
    })}
  </div>
</nav>
```

→ CEO mock の pill segmented control に整合、active = 紫 gradient fill。

### 3.6 Tab label / hint の調整

CEO mock は label のみ ("カレンダー" / "リスト" / "地図")、hint subtitle なし。

```tsx
const TABS = [
  { key: "calendar", label: "カレンダー" },
  { key: "flow",     label: "リスト" },   // "Flow" → "リスト" (CEO mock 寄せ)
  { key: "map",      label: "地図" },     // "聖地" → "地図" (CEO mock 寄せ)
];
```

label 変更 は CalendarTab / FlowTab / MapTab の内部表示には影響しない (識別子 key で参照)。

---

## 4. Risks と緩和策

| Risk | 影響 | 緩和策 |
|------|------|--------|
| Modal が pane 内に閉じ込められる (PR #214 containing block 効果) | Modal 開いている時に swipe で pane が動き、modal が一緒に流れる | 短期: 既知挙動として受容 (CEO smoke で観測) / 中期: modal 開時 HomeSwipeContainer drag を disable する仕組みを Phase 1 末か Phase 2 で追加 |
| PlanClient の `min-h-screen` が pane mode で overflow | overflow / scroll の二重発生 | displayMode で `h-full overflow-y-auto` に切替 (§3.2) |
| `Map tab` の地図 pan / zoom (将来 Phase 2) と Home swipe の競合 | gesture 衝突 | Phase 2 で Google Maps integration 時に touch event を捕捉、Home swipe を一時 disable |
| /plan 直 URL の表示が変わる | deep link 互換性 | route mode は従来 chrome を維持 (`isPane=false` で旧 header + 2 button 表示) |
| AnonymousRegistrationPage が pane mode で機能するか | anonymous user の Home pane 1 表示 | pane mode は server-side で auth 確認済 (page.tsx で is_anonymous チェック必須)。本 wave 範囲外、要 audit |
| PlanClient の初回 fetch が pane 表示前に走る | 不要な fetch / network noise | pane は常時 mount、Home 表示時にも PlanClient mount → fetch。実は **prefetch として positive** (pane 切替が瞬時) |
| W1-Z migration 未 apply の Production Supabase で 500 エラー | Plan pane が EmptyState / ErrorState で表示 | PlanClient の既存 ErrorState は CEO mock との差異あり、Phase 2 で nudge or W1-Z apply で解消 |

---

## 5. デザイン反映方針 (Phase 1 範囲)

### 5.1 Phase 1 で**やる**こと

- ✅ Pane 1 = PlanClient(displayMode=pane)
- ✅ Pane mode の bg を薄紫 gradient に nudge
- ✅ Tab UI を pill segmented control に refactor (両 mode 共通)
- ✅ Tab label を "カレンダー / リスト / 地図" に変更
- ✅ Pane mode の header chrome を簡素化 ("Plan" タイトル + 既存 2 button)
- ✅ HomePlanPane / home-plan-summary / 関連 test を削除

### 5.2 Phase 1 で**やらない**こと (Phase 2 / 3 預け)

- ❌ CalendarTab を週ビュー → 月ビューに refactor
- ❌ FlowTab を timeline → image thumbnail リストに refactor
- ❌ MapTab に Google Maps integration (location_category group のまま)
- ❌ 空き日 → ALTER 質問 → 提案 → 1tap 作成 flow
- ❌ Modal 開時の swipe disable logic (まず観測、必要なら Phase 1 末で追加)
- ❌ Header の ≡ menu icon / 🗓 calendar icon (mock の細部、Phase 2 寄せ)
- ❌ FAB の独立配置 (現 "+ 教える" button のままで動作確認、Phase 2 で FAB 化)

### 5.3 Aneurasync philosophy 整合 (Phase 1 で重視)

- "Plan を開く" CTA 消滅 → "**自分の延長**" 感が立ち上がる
- 薄紫 base + rounded pill → Aneurasync 世界観 (Stargazer / Origin / Genome と同系統色調)
- Header の簡素化 → "押し付けない" 体験

---

## 6. Commit 階段 (1 PR / 3 commits)

### C1: 構造完成 (PlanClient pane mode + Home wrapper 統合 + HomePlanPane 削除)

**Files**:
- `app/(culcept)/plan/PlanClient.tsx` — `displayMode` prop 追加、mode 別 chrome 出し分け
- `app/(culcept)/page.tsx` — `planPane` を `<PlanClient displayMode="pane" />` に
- `components/home/HomePlanPane.tsx` — **削除**
- `lib/plan/home-plan-summary.ts` — **削除**
- `tests/unit/plan/homePlanSummary.test.ts` — **削除**

**Verification**:
- `npx vitest run` → regression 0
- `npx eslint` → 0 errors
- `npm run build` → ✓ Compiled

### C2: Tab UI Pill Segmented + 配色 nudge

**Files**:
- `app/(culcept)/plan/PlanClient.tsx` — Tab UI を pill segmented control に refactor、`hint` subtitle 削除、`label` を "カレンダー / リスト / 地図" に
- (optional) `app/(culcept)/plan/tabs/*.tsx` — 内部 label 整合 (識別子 key は不変、表示文言が依存していれば調整)

**Verification**:
- 既存 test 不変 (label 文字列を test していなければ)
- 視覚的に pill tab が表示されることを local dev で確認

### C3: visual smoke docs 更新 + polish

**Files**:
- `docs/alter-plan-home-swipe-visual-smoke.md` — Phase 1 完成形に合わせて smoke checklist 更新
- (もし C2 で発見された micro issue があれば本 commit で対処)

**Verification**:
- docs only、CI lint-and-test PASS
- Vercel deploy PASS

---

## 7. Manual Smoke 項目 (CEO 実施、Preview redeploy 後)

既存 Preview branch `preview/plan-home-swipe-smoke` + 5 envs に本 PR merge を反映後の smoke。

### 7.1 Home pane (左、現状不変、回帰確認)

- [ ] ログイン後 Home が従来通り表示 (greeting / 心の天気 / AnswerCard / AskHero / Composer)
- [ ] Alter chat 入力 + 送信が動作
- [ ] Composer / RendezvousQuickStatus / BottomNav が正常
- [ ] 画面下部に dot indicator (• ○、Home active)

### 7.2 Plan pane (右、本 wave で full PlanClient に変更)

- [ ] 左 swipe で Plan pane に遷移
- [ ] Plan pane top: "Plan" タイトル + **pill segmented** 3 tab "カレンダー / リスト / 地図"
- [ ] Calendar tab が default 表示
- [ ] "+ 教える" button + "📋 教えた予定" button が表示
- [ ] dot indicator (○ •、Plan active)
- [ ] pane mode の bg が薄紫 gradient

### 7.3 Tab 切替

- [ ] "リスト" tap → FlowTab 表示
- [ ] "地図" tap → MapTab 表示
- [ ] "カレンダー" tap → CalendarTab に戻る
- [ ] tab 切替 transition が滑らか

### 7.4 Modal 動作 (Plan pane 内、CRUD verify)

- [ ] "+ 教える" tap → AddAnchorModal が pane 内 (overlay) に表示
- [ ] anchor 入力 → 登録 → Plan content が refresh (新 anchor 表示)
- [ ] "📋 教えた予定" → SourceListModal が表示、登録済 source 一覧
- [ ] anchor row tap → AnchorDetailModal 表示
- [ ] "教え直す" → EditAnchorModal に遷移
- [ ] "この登録元ごと忘れさせる" → confirm → 削除 → Plan refresh

### 7.5 Home ⇄ Plan 往復

- [ ] Plan pane modal を閉じる → 通常 Plan 表示に戻る
- [ ] 右 swipe → Home pane に戻る
- [ ] Home の状態 (scroll position / Alter chat 入力中の場合は入力内容) **保持**
- [ ] 再度左 swipe → Plan pane (tab 選択 / 表示中 anchor data **state 保持**)

### 7.6 Gesture 競合確認

- [ ] Plan pane の縦 scroll → 横 swipe 誤発火しない
- [ ] iOS edge back (左端から右 swipe) → browser back に任せる (Home から離脱、危険行動)
- [ ] Modal 開時の swipe → **要観測** (modal が pane と一緒に流れる挙動、Phase 1 末で対応判断)

### 7.7 /plan 直 URL (deep link、変更なし確認)

- [ ] 別 tab で `/plan` 直接開く → 単独 PlanClient (wrapper なし)
- [ ] /plan の header chrome は route mode (フル: "ALTER · PLAN" tag + 大見出し + 説明文)
- [ ] /plan の機能完走 (anchor 登録 / edit / delete) — 既存通り

### 7.8 Network 監視 (DevTools)

- [ ] Network filter `*.supabase.co` → `aljavfujeqcwnqryjmhl` (Production) のみ
- [ ] Network filter `hjcrvndumgiovyfdacwc` → 0 hit (Alter staging 不在)
- [ ] Network filter `/api/coalter` / `/api/talk` → 0 hit (CoAlter 経路を踏まない)
- [ ] Network filter `/api/plan/anchors` GET → 200 OK (Production migration 未 apply なら 500、PlanClient ErrorState 表示、W1-Z 判断材料)

### 7.9 Console 監視 (DevTools)

- [ ] `[Mirror]` / `[CoAlter]` 関連 error → 0
- [ ] `[Plan]` warning → 通常運用範囲のみ
- [ ] `[HomePlanPane]` warning → **消滅** (本 wave で HomePlanPane 削除)

### 7.10 Accessibility (a11y) 確認

- [ ] dot indicator click で pane 切替動作
- [ ] keyboard ← → で pane 切替動作 (input/textarea focused 中は無効)
- [ ] aria-live announce が screen reader で発火 (option)

---

## 8. やらないこと (制約再宣言)

### CEO 補正 (2026-05-20) で明示された制約

- ❌ CoAlter / Mirror / /talk / D-* 関連
- ❌ production env 変更
- ❌ all Preview env 変更
- ❌ Production migration apply (W1-Z 判断は別 wave のまま)
- ❌ service_role / DB password / connection string
- ❌ DraftPlan generator / W1-6 passive drift logging

### Phase 1 で自重するもの (Phase 2/3 預け)

- ❌ CalendarTab を月ビューに refactor (現週ビュー継続)
- ❌ FlowTab を image thumbnail リスト化
- ❌ MapTab に Google Maps integration
- ❌ 空き日 → ALTER 質問 → 提案 → 1tap 作成 flow
- ❌ Modal 開時の swipe disable logic (要観測後判断)
- ❌ Header の ≡ menu icon / 🗓 calendar icon (mock 細部)
- ❌ FAB の独立配置 (現 "+ 教える" button 継続)
- ❌ AneurasyncHome.tsx 内部改変 (Home pane の中身)
- ❌ PlanClient の fetch path / Modal の機能ロジック
- ❌ lib/plan/external-anchor-* / lib/plan/anchor-fetch.ts (core 不変)

---

## 9. CEO 判断点

本 mini design を CEO がレビューし、以下を決定：

### 判断 1: Phase 1 設計方針

| 選択 | 帰結 |
|------|------|
| **承認** (推奨) | 実装 wave 起票、§6 commit 階段 (3 commits) で着地 |
| 修正要求 | 本 docs に追加 commit で修正 |
| Phase 設計を変更 | Phase 1 のスコープ拡張 / 縮小、再起票 |

### 判断 2: Phase 2 / 3 の優先順位

(本 wave 完了後の判断材料)

| Phase | 内容 | CEO 判断時期 |
|------|------|---------------|
| **Phase 2-A**: CalendarTab 月ビュー化 | mock の月グリッド再現 | Phase 1 着地後 |
| **Phase 2-B**: FlowTab image thumbnail 化 | mock のリスト image 再現 | Phase 1 着地後 |
| **Phase 2-C**: MapTab Google Maps integration | mock の実 Map + route | Google Maps API 判断含む、別 design docs |
| **Phase 3**: 空き日 → ALTER flow | 質問 → 提案 → 1tap 作成 | Stargazer / Alter engine 接続設計後 |

### 判断 3: Modal 開時の swipe disable

本 Phase 1 で対応するか、Phase 2 預けにするか。

| 選択 | 帰結 |
|------|------|
| Phase 1 末で対応 | C3 に追加、modal 開時 HomeSwipeContainer drag を disable |
| Phase 2 預け | smoke で観測、UX 影響を CEO 判断 |

---

## 10. References

- `docs/alter-plan-home-integration-mini-design.md` (Phase 1 元 design、本 doc の前段)
- `docs/alter-plan-home-swipe-visual-smoke.md` (visual smoke runbook、本 wave で更新)
- `app/(culcept)/plan/PlanClient.tsx` (本命修正対象、displayMode prop 追加)
- `app/(culcept)/page.tsx` (Home wrapper、planPane を PlanClient に変更)
- `components/home/HomeSwipeContainer.tsx` (PR #214 の pane isolation 維持、本 wave で touch しない)
- `components/home/HomePlanPane.tsx` (本 wave で削除)
- `lib/plan/home-plan-summary.ts` (本 wave で削除)
- CEO スクショ (2026-05-20、「ALTER アプリ構造と画面コンプト（最新案）」)

---

## 11. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-20 | W1-Home-Swipe Phase 2 (full Plan pane) mini design 起票、CEO 補正「summary pane ではなく PlanClient 本体を pane に置く」(2026-05-20) | CEO レビュー待ち |

---

**End of Mini Design**. CEO レビュー → 判断 1-3 → 実装 wave (3 commits) GO/NO-GO 判断をお待ちします。
