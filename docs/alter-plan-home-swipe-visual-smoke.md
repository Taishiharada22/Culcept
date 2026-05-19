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
| **Phase 1 (2026-05-20)** | **PlanClient (full、displayMode="pane")** | **本体 CRUD + Modal 動作 + Modal 開時 swipe disable** |

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
| **Modal 開時に swipe で pane が動く** | **registerHomeSwipeModalOpen の hook 漏れ確認 (該当 modal の useEffect 追加)** |
| Plan pane で Modal が開かない | PlanClient 内 button click の event propagation 確認 |
| Plan pane で `/api/plan/anchors` が 500 | **Production tables 未 migrate (W1-Z 待ち)、UI 統合 PASS 判定には影響なし** |
| /plan 直 URL が壊れる | wrapper の影響経路を audit (本来不影響なため、code bug の signal) |
| Composer 入力欄が swipe で誤発火する | composer focused state check 追加 (別 PR) |

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
