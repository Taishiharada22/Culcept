# Alter Plan W1-X1 — Manual Anchor Input UI MVP Mini Design

**作成日**: 2026-05-18
**Status**: 採択（W1-X1 実装の起点）
**関連**: `docs/alter-plan-w15-ui-mini-design.md` (W1-5 3 レンズ設計)、`docs/alter-plan-foundation-design.md`
**実装範囲**: 同一 PR (`feat/alter-plan-w1x-manual-input`) で着地

---

## 1. 目的（なぜ W1-X1 が要るか）

W1-5 で `/plan` の 3 レンズ表示は完成したが、ユーザーは **DevTools Console から `fetch("/api/plan/anchors", ...)` を叩かないと** anchor を登録できない。Preview URL を beta user に渡せる状態にするには、UI からの登録経路が必須。

W1-X1 はその **最小経路** を提供する：
- 「Alter に教える」入力 UI
- 「教えた予定」一覧と「忘れさせる」削除
- 編集（PATCH/PUT）は別 wave に先送り
- DraftPlan 自動生成も別 wave

---

## 2. UX 主軸: 「予定管理」ではなく「Alter に教える」

| 用語 | NG（一般的 SaaS） | OK（Aneurasync） |
|------|------------------|-----------------|
| Add | "予定追加" | "Alter に教える" |
| Delete | "削除" | "忘れさせる" |
| Form 名 | "予定編集フォーム" | （フォームではなく入力モーダル） |
| Submit | "保存" | "教える" |

ただし **濃すぎない**。入力は短く軽く保つ。世界観の演出は文言レベルに留め、操作は標準的 UI で（modal + form input）。

---

## 3. UI 構造

### Plan header に 2 button 追加

```
ALTER · PLAN
あなたの生活、3 つのレンズ
[ + 教える ]  [ 📋 教えた予定 ]
[カレンダー][Flow][聖地]
```

`+ 教える` → AddAnchorModal を開く  
`📋 教えた予定` → SourceListModal を開く

両 button は header 内の小型 secondary button。tab nav には混ぜない。

### AddAnchorModal

```
Segmented control: [ 1 回だけ ] [ 繰り返し ]

必須 4 欄:
  予定名 *
  日付 *（one_off）/ 開始日 + 曜日 *（recurring）
  開始時刻 *
  動かせなさ *  [ 動かせない ] [ 動かせる ]
                ↓ヒント例
                "歯医者 / 授業 / フライト"  /  "ジム / 習い事"

▼ もっと細かく教える（折り畳み、optional）:
  終了時刻
  終了日（recurring）
  場所カテゴリ（家 / 職場 / 学校 / カフェ / 屋外 / 公共 / 移動 / 未分類）
  場所名（自由入力）
  ソース [ 手動 ] [ テンプレ ]  // anchorKind の default に追従、上書き可

ボタン: [ 教える ]   [ やめる ]
```

recurring 時の曜日 UI:
```
曜日:
[ 月 ] [ 火 ] [ 水 ] [ 木 ] [ 金 ] [ 土 ] [ 日 ]
ショートカット: [ 平日 ] [ 週末 ] [ 毎日 ]
```

### SourceListModal

```
教えた予定一覧:

歯科予約 (1 件)
  manual / 2026-05-25 14:30
  [ 忘れさせる ]

週次ミーティング (3 件)
  template / 月水金 10:00
  [ 忘れさせる ]

[ 閉じる ]
```

「忘れさせる」→ confirm:
```
「週次ミーティング」と、これに紐づく 3 件の予定を、
Alter から忘れさせますか？
[ はい、忘れさせる ]  [ やめる ]
```

---

## 4. State machine

PlanClient に集約：

```
fetchState:    loading → ok / error                      // 既存
addModalState: closed / open / submitting / ok / error   // 新規
deleteState:   idle / confirming / deleting / ok / error // 新規

POST 成功 → modal 自動 close → fetchAnchors() 再 fetch → 3 tab 即時反映
DELETE 成功 → confirm close → fetchAnchors() → 3 tab 即時反映
```

---

## 5. データフロー

```
[Form input (controlled)]
   ↓ submit
[buildAnchorInputFromForm()]  ← pure 関数、client-side validation
   ↓
[createAnchorBundle()]        ← anchor-fetch.ts (POST helper)
   ↓
[setState({ kind: "ok" })] + refetch
   ↓
[fetchAnchors()] → setState({ anchors }) → 3 tab 再描画
```

DELETE も同パターン。

---

## 6. やらない（W1-X1 範囲外）

- 既存 anchor の編集（PATCH / PUT API 不在）
- DraftPlan generator / Alter 自動提案
- 各 tab セルから「この日に追加」（後 wave）
- exception dates の UI 入力（後 wave、生成は data 層に既存）
- Home / nav / 横スワイプ / W1-6 / W1-8
- Google Maps / Mapbox / migration / production / env / .env.local

---

## 7. 将来分岐点

| 後の wave | きっかけ |
|-----------|---------|
| W1-X2 編集 UI | beta 試験で「直したい」要望 |
| W1-X3 各 tab セルからの add 導線 | 編集 UI 着地後 |
| W1-Z DraftPlan generator | 設計再合意（Aneurasync 世界観への影響大） |

---

## 8. ファイル構成

```
docs/alter-plan-w1x1-mini-design.md          # 本ファイル
lib/plan/
  anchor-input-form.ts                       # 新規: form state + pure transform/validate
  anchor-fetch.ts                            # 拡張: createAnchorBundle / deleteAnchorSource
  weekday-template.ts                        # 既存、再利用 (buildWeekdayRRule)
app/(culcept)/plan/
  PlanClient.tsx                             # refactor: 2 button + modal trigger + refetch
  components/
    AddAnchorModal.tsx                       # 新規
    SourceListModal.tsx                      # 新規
tests/unit/plan/
  anchorInputForm.test.ts                    # form helper tests
  anchorFetchPostDelete.test.ts              # POST/DELETE wrapper tests
```

---

## 9. 受容判定（DoD）

- ✅ `/plan` の header に `+ 教える` / `📋 教えた予定` button 2 個
- ✅ AddAnchorModal で one_off + recurring 両方を登録可能
- ✅ 必須 4 欄が空なら submit disabled + field 下にエラー表示
- ✅ 曜日ショートカット（平日 / 週末 / 毎日）が動作
- ✅ POST 成功で modal close + 3 tab 即時反映
- ✅ SourceListModal で「忘れさせる」→ 2 段確認 → DELETE → 3 tab 即時反映
- ✅ Empty state から `+ 教える` で初回登録可能
- ✅ `npx tsc --noEmit` 0 errors
- ✅ `npx vitest run tests/unit/plan/` 全 PASS
- ✅ ローカル `npm run build` PASS
- ✅ Home / nav / 横スワイプ 不変

---

**結論**: W1-X1 で /plan を read+write 完備の最小状態にする。これで Preview URL が beta user に渡せる。
