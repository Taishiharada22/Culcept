# Alter Plan W1-X4 — Exception Dates UI Mini Design

**作成日**: 2026-05-19
**Status**: 採択（W1-X4 実装の起点）
**関連**: `docs/alter-plan-w1x1-mini-design.md` / `docs/alter-plan-w1x2-edit-anchor-mini-design.md`
**実装範囲**: 同一 PR (`feat/alter-plan-w1x4-exception-dates`) で着地

---

## 1. 目的

recurring anchor に **「この日だけスキップ」** を Alter に教える機能を提供。

例:
- 祝日（5/3 ゴールデンウィーク）
- 休講
- 出張で予定なし
- その日だけの欠席

W1-X4 は **UI のみ追加** で完結する。データ層（DB schema / API / recurrence-expander）は既に exception_dates に対応済。

---

## 2. 何が既に動いているか

| 層 | 状態 |
|----|------|
| DB schema | `external_anchors.exception_dates DATE[]` 既存（W1-3 migration） |
| validateCreateExternalAnchorInput | `exceptionDates: string[]` を accept 済（W1-4pre-1） |
| recurrence-expander | `exceptionDates` を展開後に自動除外 済（W1-5） |
| buildWeekdayRRule | RRULE 生成は exception 無関係（OK） |
| Repository updateAnchor | 既存 `validateCreateExternalAnchorInput` 経由で透過対応 |

→ **W1-X4 は UI と form 層の薄い追加のみ**。

---

## 3. UX 仕様

### 配置

recurring の form セクション内（曜日選択の直下、折り畳み optional の上）に：

```
[曜日選択 / ショートカット]

例外日（任意）  ← ヒント: 「祝日や出張をスキップ」
┌─────────────────┐
│ [date picker]  [+ 追加] │
└─────────────────┘
追加済:
  - 5月3日(日)  [×]
  - 7月17日(月)  [×]
  ※ 空の場合は "例外日なし（毎週繰り返し）" placeholder

[折り畳み optional セクション …]
```

### UX 細部

| 機能 | 仕様 |
|------|------|
| 追加 | date picker で日付選択 → 「+ 追加」button で list に追加 |
| 重複 | 既存に同 date があれば **silent ignore**（error 表示せず） |
| Sort | 追加後 canonical ascending sort 自動 |
| 曜日表記 | `5月3日(日)` 形式（誤入力防止） |
| 削除 | 各 date 行の `[×]` button で即削除（confirm なし、軽量操作） |
| 範囲制限 | 過去・未来とも追加可能（recurrence-expander が範囲外を自動除外） |
| Empty placeholder | "例外日なし（毎週繰り返し）" |

### Edit modal での挙動

- 既存 anchor の `exceptionDates` を `domainToFormState` で form 初期化
- 編集中の追加/削除は UI で即反映
- submit → buildAnchorInputFromForm → updateAnchor (PATCH) で DB 反映

---

## 4. やらない（W1-X4 範囲外）

- **自動祝日 API**（日本祝日連携）— 別 wave
- **繰り返しパターン例外**（毎月 1 日等）— RRULE EXRULE 範囲、別 wave
- **bulk import**（CSV）
- **削除 confirm**（軽量操作なので不要、誤操作頻度低い）
- **過去日付の warning**（recurrence-expander が自動処理、UI で過剰説明しない）
- migration / external API / Home / nav / 横スワイプ / W1-6 / W1-8

---

## 5. ファイル構成

```
docs/alter-plan-w1x4-exception-dates-mini-design.md   # 新規
lib/plan/anchor-input-form.ts                         # AnchorFormState.exceptionDates + helper
lib/plan/domain-to-form-state.ts                      # exceptionDates 反映
app/(culcept)/plan/components/AnchorFormFields.tsx    # recurring 内に exception UI 追加
tests/unit/plan/anchorInputForm.test.ts               # 拡張: addException / removeException
tests/unit/plan/domainToFormState.test.ts             # 拡張: exceptionDates 反映
tests/unit/plan/anchorPrefillIntegration.test.ts      # 拡張: prefill → exception 追加 → submit
```

---

## 6. データフロー

```
[AnchorFormState]
  exceptionDates: string[]  // YYYY-MM-DD canonical sort
   ↓ user 操作
[toggleExceptionDate(state, "2026-05-03")]
  → 重複なら silent ignore、新規なら canonical 位置に追加
   ↓ submit
[buildAnchorInputFromForm]
  recurring の場合のみ exceptionDates を input に含める（空配列なら省略）
   ↓
[CreateExternalAnchorInput]
  recurring + exceptionDates: ["2026-05-03", "2026-07-17"]
   ↓
[POST / PATCH API]
   ↓
[DB]
   ↓ 表示時
[recurrence-expander]
  exceptionDates に該当する日を自動除外
```

---

## 7. 受容判定（DoD）

- ✅ AddAnchorModal recurring で exception date を追加・削除できる
- ✅ EditAnchorModal で既存 anchor の exception dates が初期表示される
- ✅ submit 後、3 tab で例外日に予定が表示されない（recurrence-expander が処理）
- ✅ 重複追加は silent ignore、canonical sort 自動
- ✅ `5月3日(日)` 表記
- ✅ Empty placeholder 表示
- ✅ AddAnchorModal の既存挙動 regression なし
- ✅ `npx tsc --noEmit` 0 errors
- ✅ `npx vitest run tests/unit/plan/` 全 PASS
- ✅ ローカル `npm run build` PASS

---

**結論**: W1-X4 で recurring anchor の「教え方」が完成。祝日 / 休講 / 出張への適応が UI で可能になる。
