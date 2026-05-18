# Alter Plan W1-5 — Plan UI Mini Design

**作成日**: 2026-05-18
**Status**: 採択（W1-5 実装の起点）
**関連**: `docs/alter-plan-foundation-design.md`（Wave 1 全体設計）
**実装範囲**: 同一 PR (`feat/alter-plan-w15-ui`) で着地

---

## 1. 存在理由（why W1-5 exists）

Plan UI は「予定一覧」でも「Google Calendar クローン」でもない。
**固定予定 (ExternalAnchor) を 3 つの自己理解レンズで投影して、ユーザーが自分の生活パターンを別角度から眺める装置** である。

> 「自分って、そういう人間だったのか」とユーザー自身が気づく瞬間 — Aneurasync 設計思想

---

## 2. 3 レンズ（the three lenses）

| レンズ | 視点 | UI | 答える問い |
|--------|------|----|-----------|
| **Calendar** | 俯瞰（時間の鳥瞰） | 週 × 時間 grid | 「今週どう過ごす？」 |
| **Flow** | 主観（その日を生きる） | 1 日の縦タイムライン + 空白時間 | 「今日 1 日がどう流れる？」 |
| **Map** | 地理（自分の聖地） | location_category 集約カード + 訪問頻度 | 「あなたはどこによく行く？」 |

同じ ExternalAnchor 集合を 3 軸で投影する。データ取得は 1 回 (`GET /api/plan/anchors`)、3 タブで共有。

---

## 3. ExternalAnchor の表示処理

- **one_off**: `date` を直接使う
- **recurring**: `expandRecurrence(anchor, dateRange)` で **pure 関数** として `Date[]` に展開。RFC 5545 のうち W1-5 では `FREQ=WEEKLY;BYDAY=...` を主にサポート（W1-4pre-2 で生成される範囲と一致）
- `exceptionDates` は展開後に除外
- `validFrom` / `validUntil` で範囲制限

すべて `lib/plan/recurrence-expander.ts` の pure 関数として閉じる。Side-effect なし、time-zone は **UTC 内部、表示時にローカル化**。

---

## 4. Map = "地図 API なし版" の独自体験

Google Maps / Mapbox API は **追加しない**。代わりに：

- location_category 別に anchor を group-by → カードで列挙
- 各カードに「週 N 回 / 月 N 回」の visit count を出す
- 例: `Home: 週 7 回 / Office: 週 5 回 / Cafe: 週 2 回 / Hospital: 月 1 回`

これは map より「自分の聖地マップ」が見えやすい独自体験。Aneurasync は **地理的位置よりも生活の重力点** を可視化する。

---

## 5. State (Empty / Loading / Error)

| state | 表示 | 不変原則 |
|-------|------|---------|
| Loading | skeleton または "読み込み中..." | tab 切替で再 fetch しない（1 回 fetch、3 tab で共有） |
| Empty | 「まだ予定が登録されていません」+ 説明文 | **Home に誘導しない**（Home 不変更原則）。Plan 内で完結 |
| Error | エラーメッセージ + 再試行ボタン | エラー詳細は console、UI には人間向け文言のみ |

---

## 6. やらない（W1-5 範囲外）

- 編集 UI / 削除 UI（read-only 表示のみ）
- DraftPlan generator（W1-X）
- 横スワイプ（CEO 禁止）
- Google Maps / Mapbox API（CEO 禁止）
- W1-6 passive drift logging（凍結）
- W1-8 Home 導線（凍結）
- Conflict detection
- MAIN_NAV / HOME_QUICK_NAV への追加（Home 不変更原則 → `/plan` は URL 直接アクセスのみ。Nav 追加は W1-8）

---

## 7. 将来分岐点

- **W1-6**: Calendar / Flow に「動かした履歴」を重ねる layer として開く。本 wave の Tab 構造を再利用
- **W1-8**: Home → Plan 遷移。MAIN_NAV / HOME_QUICK_NAV への追加判断
- **W1-Y**: RPC atomicity 化。本 wave の UI 側は不変
- **W1-X (DraftPlan)**: Alter が自動生成する Plan 候補を Calendar に提示

---

## 8. ファイル構成

```
app/(culcept)/plan/
  page.tsx                          # Server Component (auth + 初期 props)
  PlanClient.tsx                    # Client root: tab state + fetch
  tabs/
    CalendarTab.tsx                 # 週ビュー
    FlowTab.tsx                     # 日タイムライン
    MapTab.tsx                      # 聖地カード集約

lib/plan/
  recurrence-expander.ts            # pure 関数。RRULE + dateRange → Date[]
  anchor-fetch.ts                   # client-side fetch helper

tests/unit/plan/
  recurrenceExpander.test.ts        # pure unit tests
  planTabs.test.tsx                 # component tests (empty/loading/error/data)
```

---

## 9. 受容判定（DoD）

- ✅ `/plan` で 3 tab 切替が動く
- ✅ recurring anchor が週ビューに正しく展開される
- ✅ Empty / Loading / Error 全 state 表示
- ✅ `npx tsc --noEmit` 0 errors outside `.next/`
- ✅ `npx vitest run tests/unit/plan/` 全 PASS（既存 246 + 新規）
- ✅ CI lint-and-test PASS / Vercel PASS

---

**結論**: W1-5 は「ユーザーが Plan 体験に初めて触れる」入口。3 軸レンズで「自分の生活」を見る独自体験を最小実装で立ち上げる。
