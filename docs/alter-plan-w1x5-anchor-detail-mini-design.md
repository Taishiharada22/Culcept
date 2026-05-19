# Alter Plan W1-X5 — Anchor Detail Modal Mini Design

**作成日**: 2026-05-19
**Status**: 採択（W1-X5 実装の起点）
**関連**: `docs/alter-plan-w1x1-mini-design.md` / `docs/alter-plan-w1x2-edit-anchor-mini-design.md` / `docs/alter-plan-w1x3-cell-add-mini-design.md` / `docs/alter-plan-w1x4-exception-dates-mini-design.md`
**実装範囲**: 同一 PR (`feat/alter-plan-w1x5-anchor-detail`) で着地

---

## 1. 目的

W1-X1〜W1-X4 で「教える / 教え直す / 例外日 / レンズから教える」が揃った。
W1-X5 は **anchor 単位の閲覧と操作** を 3 レンズに開く：

- Calendar / Flow / Map の **anchor 行 click** → 詳細 modal
- 詳細から「**教え直す**」（既存 EditAnchorModal を anchor 単位で起動）
- 詳細から「**この登録元ごと忘れさせる**」（既存 source 単位 DELETE、削除影響を明示）

beta user 渡し前の **操作性と削除誤操作防止** を仕上げる最後の wave。

---

## 2. 文言（CEO 補正反映）

### Primary action
- **「教え直す」**（既存 W1-X2 文言と統一）

### Secondary action（destructive）
- **「この登録元ごと忘れさせる」**（CEO 補正 1, 2）
  - 単なる「忘れさせる」では anchor 単独削除と誤解される
  - 「登録元ごと」で source 単位削除を明示

### Confirm dialog（CEO 補正 3: 削除影響の 3 要素）

```
この予定を Alter から忘れさせますか？

ただし、これは **登録元 (source) ごと** 忘れさせるため、
同じ登録元から登録された 合計 N 件の予定が同時に消えます。

消える予定:
- 歯科予約 (5/25)
- 歯科予約 (6/10)
- 歯科の検診 (7/15)
（代表 3 件まで表示、残りは「他 M 件」）

[ やめる ] [ はい、登録元ごと忘れさせる ]
```

---

## 3. 詳細 modal の表示内容

| 項目 | 表示 |
|------|------|
| Modal title | 「<title> の詳細」 |
| Kind | 「1 回だけ / 毎週繰り返し」 |
| 日付 / 曜日 | one_off: `5月25日(月)` / recurring: `毎週 月・水・金` |
| 開始 - 終了 | `14:30 – 15:30`（endTime なしなら開始のみ） |
| 動かせなさ | 「動かせない / 動かせる」 |
| 場所 | locationCategory + locationText（あれば） |
| sensitive | あれば badge |
| Validity (recurring) | 開始日 → 終了日（なければ「終了未定」） |
| **例外日** (recurring) | 「5月3日(日) / 7月17日(月)」一覧、なければ「例外日なし」 |
| **登録元** | `manual / 2026-05-18 に登録` (sourceType + capturedAt)、notes あれば追加 |

---

## 4. Click 干渉防止（CEO 補正 5）

| Tab | Anchor click 領域 | 既存 click 要素 | 排他保証 |
|-----|------------------|----------------|---------|
| Calendar | anchor card (cell 内) | cell 右上 `+` button (W1-X3) | `+` button は cell header、anchor card は別領域。両 onClick で `stopPropagation` |
| Flow | anchor card (timeline 内) | gap badge (anchor 間) | gap badge は anchor card の前 (li sibling 構造)、両 onClick で `stopPropagation` |
| Map | anchor 行 (category card 内) | category 末尾「+ X での予定を教える」 button | 別領域、両 onClick で `stopPropagation` |

**実装**: anchor click handler / `+` button handler / gap badge handler 全てに `e.stopPropagation()`。

---

## 5. Keyboard 操作（CEO 補正 6）

各 anchor 行に：
- `tabIndex={0}` — Tab で focus 可能
- `role="button"` — screen reader が button として認識
- `aria-label={`${title} の詳細を見る`}` — 明示的な ラベル
- `onKeyDown` — Enter / Space で click と同じ handler を呼ぶ
- focus visible CSS（既存 design system）

---

## 6. やらない（W1-X5 範囲外）

- **anchor 単独 DELETE API**（CEO 指示遵守、source 単位のみ）
- **history / changelog 表示**
- **添付ファイル / raw_storage_path**
- **PATCH source 編集**
- Home / nav / 横スワイプ / W1-6 / W1-8 / 外部 API / migration / production / Vercel env

---

## 7. ファイル構成

```
docs/alter-plan-w1x5-anchor-detail-mini-design.md         # 新規
lib/plan/anchor-detail-format.ts                          # 新規: 詳細表示 helper
app/(culcept)/plan/components/AnchorDetailModal.tsx       # 新規
app/(culcept)/plan/PlanClient.tsx                         # 拡張: detail modal state + handlers
app/(culcept)/plan/tabs/CalendarTab.tsx                   # 拡張: anchor card click + a11y
app/(culcept)/plan/tabs/FlowTab.tsx                       # 拡張: anchor item click + a11y
app/(culcept)/plan/tabs/MapTab.tsx                        # 拡張: anchor 行 click + a11y
tests/unit/plan/anchorDetailFormat.test.ts                # 新規
tests/unit/plan/anchorDetailFlow.test.ts                  # 新規 integration
```

---

## 8. 受容判定（DoD）

- ✅ Calendar / Flow / Map 各 anchor click で detail modal 開く
- ✅ Modal title に anchor title、表示内容が網羅
- ✅ 「教え直す」→ EditAnchorModal 起動
- ✅ 「この登録元ごと忘れさせる」→ confirm（件数 + 代表タイトル + 同じ登録元の予定も消える旨）→ DELETE → 3 tab 反映
- ✅ Calendar `+` button click は detail を開かない、cell header の add 動作のみ
- ✅ Flow gap badge click は detail を開かない、gap add のみ
- ✅ Map category add link は detail を開かない、locationCategory pre-fill add のみ
- ✅ keyboard: anchor row に Tab で focus、Enter / Space で detail modal が開く
- ✅ a11y: aria-label 完備
- ✅ Home / nav / 横スワイプ 不変
- ✅ `npx tsc --noEmit` 0 errors / `npx vitest run tests/unit/plan/` 全 PASS / `npm run build` PASS

---

**結論**: W1-X5 で 3 レンズが書き込み + 読み込み（詳細） + 編集 / 削除 の全フローを開く。beta user 渡し前の操作性が完成。
