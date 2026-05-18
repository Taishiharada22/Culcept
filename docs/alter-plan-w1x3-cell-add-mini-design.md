# Alter Plan W1-X3 — Cell Add Affordances Mini Design

**作成日**: 2026-05-18
**Status**: 採択（W1-X3 実装の起点）
**関連**: `docs/alter-plan-w15-ui-mini-design.md` / `docs/alter-plan-w1x1-mini-design.md`
**実装範囲**: 同一 PR (`feat/alter-plan-w1x3-cell-add`) で着地

---

## 1. 目的（なぜ W1-X3 が要るか）

W1-5 で 3 レンズ（Calendar / Flow / Map）の読み体験、W1-X1 で header からの書き体験を整えた。
**W1-X3 は読み体験のレンズそのものに書き込みのリターン路を通す**：

- Calendar の「4 月 8 日(水)」を見ながらその日に教える
- Flow の「14:00 〜 16:00 の空白」を見ながらそこに教える
- Map の「家」カードを見ながら家で何かする予定を教える

「Plan を見ているとアイデアが浮かぶ → そのまま教えられる」という Aneurasync 的体験を 3 軸すべてに開く。

---

## 2. UX 仕様（CEO 補正反映済）

| Tab | 導線 | Pre-fill | 補正 |
|-----|------|----------|------|
| **Calendar** | 各日 cell の右上「+」ボタン（明示的、cell 全体タップは入れない） | `{kind:one_off, date:<その日>}` | 補正 1 |
| **Flow** | anchor 間 gap に「+ 時刻を教える」badge / Empty 日に CTA | `{kind:one_off, date:<選択日>, startTime:<gap 中央 15 分丸め>}` | 補正 2: gap<30 分は表示しない |
| **Map** | category カード内「+ <カテゴリ>での予定を教える」link | `{locationCategory:<cat>}` のみ（locationText は自動入力しない） | 補正 3 |

**Modal 内**:
- Pre-fill は **ヒント**。ユーザーは自由に変更可能
- Modal title 下に context subtitle 表示（"カレンダー / 4月8日(水) から" 等）で起点を明示
- Modal close 時に initialState は **必ず reset**（補正 4）

---

## 3. 設計原則

| # | 原則 | 機械的保証 |
|---|------|----------|
| 1 | AddAnchorModal は **single component**（cell add も header add も同一） | initialState? prop を追加するだけ |
| 2 | pre-fill は薄い merge（empty state ⊕ initial） | mergeInitialState helper、pure 関数 |
| 3 | kind 切替時に排他 field を自動クリア | 既存 switchKind ロジック（W1-X1 で実装済）が自動処理 |
| 4 | Modal close 時に state を必ず reset（次回 open に漏れない） | useEffect で isOpen=false → reset、close handler 内で reset |
| 5 | a11y: 全 add affordance に aria-label | 「<月日/時刻/カテゴリ> に予定を教える」 |

---

## 4. やらない（W1-X3 範囲外）

- 編集 UI（PATCH/PUT API、W1-X2）
- 「教えた motion」（POST 成功時のパルス演出）— 別 wave 候補
- Cell 全体タップでの起動（補正 1）
- locationText 自動入力（補正 3）
- Calendar の月/日ビュー追加
- Map の地理 API 追加
- Home / nav / 横スワイプ / W1-6 / W1-8

---

## 5. 将来分岐点

| 後 | きっかけ |
|----|---------|
| W1-X2 編集 UI | beta 試験で「直したい」要望、PATCH API 整備 |
| 「教えた motion」 | 体験を一段濃くしたい時、framer-motion 整備済 |
| DraftPlan generator | 設計再合意 |

---

## 6. ファイル構成

```
docs/alter-plan-w1x3-cell-add-mini-design.md         # 新規
lib/plan/anchor-input-form.ts                        # 拡張: mergeInitialState
app/(culcept)/plan/tabs/_helpers.ts                  # 拡張: suggestGapStartTime / shouldShowGapAdd
app/(culcept)/plan/components/AddAnchorModal.tsx     # 拡張: initialState? + reset + context subtitle
app/(culcept)/plan/PlanClient.tsx                    # refactor: pending initialState state + handler
app/(culcept)/plan/tabs/CalendarTab.tsx              # 拡張: cell + button + onAddRequest prop
app/(culcept)/plan/tabs/FlowTab.tsx                  # 拡張: gap badge + Empty CTA + onAddRequest
app/(culcept)/plan/tabs/MapTab.tsx                   # 拡張: category 内 link + onAddRequest
tests/unit/plan/anchorInputForm.test.ts              # 拡張: mergeInitialState
tests/unit/plan/planTabsHelpers.test.ts              # 拡張: suggestGapStartTime / shouldShowGapAdd
```

---

## 7. 受容判定（DoD）

- ✅ Calendar の各日 cell に `+` button、tap で modal が date pre-fill で開く
- ✅ Flow の gap (≥ 30 分) に「+ 時刻を教える」badge、tap で modal が date + startTime pre-fill
- ✅ Flow の Empty 日に CTA、tap で modal が date pre-fill
- ✅ Map の category カードに「+ <カテゴリ>での予定を教える」link、tap で modal が locationCategory pre-fill (locationText は空)
- ✅ Modal title 下に context subtitle 表示
- ✅ Modal close 時に initialState reset
- ✅ aria-label が全 add affordance に付く
- ✅ `npx tsc --noEmit` 0 errors
- ✅ `npx vitest run tests/unit/plan/` 全 PASS
- ✅ `npm run build` (local) PASS
- ✅ Home / nav / 横スワイプ 不変

---

**結論**: W1-X3 で 3 レンズが書き込みに開く。「見る→教える」の往復が 1 アクションになり、Aneurasync 世界観の本体が機能する。
