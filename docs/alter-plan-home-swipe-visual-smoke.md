# Alter Plan Home Swipe — Visual Smoke Runbook

**作成日**: 2026-05-19
**Status**: 採択待ち（CEO smoke 実施時の手順）
**実装**: `feat/alter-plan-home-swipe-integration` ブランチ
**関連**: `docs/alter-plan-home-integration-mini-design.md`

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

### Step 3: 左 swipe で Plan pane に遷移

- 画面上で**左方向**に swipe (画面幅の 30% 以上 OR 速度 500 px/s 以上)
- 画面が Plan pane (右側) にスライド
- dot indicator が "○ •" に変化 (右 active = Plan)

✅ PASS 条件:
- Plan pane に切り替わる
- header「この先」/ subheader「あなたの予定が、ここにあります」
- (anchor あれば) 次の予定 / 今日 / 明日 / 今週 summary が表示
- (anchor 無し) "あなたのこの先がここに置かれていきます" の empty state
- "Plan を開く" CTA が画面下部に固定表示

### Step 4: 右 swipe で Home に戻る

- 画面上で**右方向**に swipe (画面幅の 30% 以上)
- Home pane に戻る
- Home の状態（scroll position / Alter chat 入力中の場合は入力内容も）が**保持**されている
- dot indicator が "• ○" に戻る

✅ PASS 条件: Home 状態が swipe 前と一致

### Step 5: dot indicator click でも切替可能

- dot indicator の右 dot を click → Plan pane へ
- dot indicator の左 dot を click → Home pane へ

✅ PASS 条件: click 切替動作 (swipe できない環境のフォールバック)

### Step 6: keyboard 切替（desktop）

- Plan pane で **←** 矢印 key 押下 → Home へ
- Home pane で **→** 矢印 key 押下 → Plan へ
- ただし input / textarea にフォーカス中は keyboard 切替**無効**

✅ PASS 条件: keyboard nav 動作 + 入力時は無効

### Step 7: 縦スクロール vs 横スワイプの衝突確認

- Home pane で会話 transcript を**縦 scroll**
- 縦 scroll 中に小さな横揺れがあっても、pane は切り替わらない (threshold 30% 強制)

✅ PASS 条件: 縦 scroll が横 swipe を誘発しない

### Step 8: Plan pane → "Plan を開く" CTA で /plan へ遷移

- Plan pane の "Plan を開く" CTA tap
- `/plan` route に navigate (PlanClient 単独表示、wrapper なし)
- Browser back で Home に戻る (Home swipe 状態は維持されない、初期 pane=0 で開く想定)

✅ PASS 条件: /plan 直 URL が wrapper なしで render

### Step 9: /plan 直 URL access の独立性確認

- 新 tab で `https://<preview>/plan` を直接開く
- PlanClient が wrapper なしで表示
- HomeSwipeContainer / HomePaneIndicator が render されない

✅ PASS 条件: /plan は本 wave の影響を受けない (deep link 整合)

---

## 3. PASS 判定

§2 全 Step PASS なら **D-O-D 合格**:
- Home 既存体験 不変 ✅
- Plan pane 表示動作 ✅
- swipe / dot / keyboard 3 経路で pane 切替動作 ✅
- 縦 scroll 衝突なし ✅
- /plan 直 URL 不影響 ✅
- a11y (aria-live announcement、focus 管理) 動作 ✅

---

## 4. FAIL 時の即時 action

| 事象 | action |
|------|--------|
| Home pane の既存 UI が壊れる | flag を false に戻す (env rm)、再 deploy、root cause investigation |
| swipe が動かない | DevTools Console で motion / drag 系 error 確認、再現条件記録 |
| 縦 scroll で誤って pane 切替する | threshold / velocity の現実値を Console で計測、調整 PR |
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
