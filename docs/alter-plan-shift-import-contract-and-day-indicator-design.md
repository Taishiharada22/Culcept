# シフト取り込み — 抽出 contract + 休み(day_indicator)保存/表示 設計書

- **対象**: VLM 抽出の canonical contract と、休み(day_indicator)の保存/表示モデルを**セットで**固める設計。
- **状態**: 設計（readiness）。**VLM 本実装には入らない**（GPT 補正）。CEO 確認後に実装。
- **branch**: `feat/plan-pdf-image-import`。
- **根拠**: CEO 指示（休み=色+バッジ、両方カスタム可 / 2026-05-30）+ GPT 補正（contract 先行・Step2+4 セット・H/BD/HREQ 区別・off は anchor に載せない）+ 私の精緻化（⑤目標駆動で end から逆算）。
- **日付**: 2026-05-30。CEO 方針 ①〜⑧。

---

## §0. 結論 — 採用 + 精緻化

GPT「Step2 と Step4 をセットで」を採用。ただし**理由を精緻化**:

> **真の理由は「末端（休みの保存/表示）を先に確定し、そこから抽出 contract を逆算する」= ⑤目標駆動**。
> 末端未定で抽出 contract を作ると、後段が必要とするフィールドを取りこぼし、出力契約を作り直す。

CEO「色+バッジ、両方カスタム」と GPT「H/BD/HREQ を潰すな」は**両立できる**:
- **表示スタイル（色+アイコン）を off-type ごとに**持たせる → カスタム可能性 + 意味差保持が同時成立
- 色+アイコンは**層3（表示）**、意味（H=公休）は層2 で不変 → 3層分離を維持

---

## §1. Canonical pipeline データモデル（end から逆算）

```
[画像/PDF]
  │  Step2: VLM = parser（contract を埋めるだけ）
  ▼
ExtractedShiftCell[]            ← §2 抽出 contract（不変・layer1+本人行）
  │  Step3: 本人行で filter（assisted）
  ▼
ShiftCellReading[]             ← projection 入力（§2 の subset）✅ Step1 実装済
  │  Step5: projectShiftRoster + 辞書 ✅ Step1 実装済
  ▼
{ timedEvents, dayIndicators, candidates, unresolved }
  │  Step6: 確認画面（反映前 preview）
  ▼
保存:
  timedEvents   → CreateExternalAnchorInput[] → anchors（既存経路）
  dayIndicators → ShiftDayMarker[]            → §3 新・日レベル保存（off は anchor に載せない）
  candidates    → v1: marker（候補トーン）or skip
  │
  ▼
描画:
  anchors        → タイムライン（既存）
  ShiftDayMarker → §4 日ヘッダの「色 + バッジ」（ユーザーカスタム）
```

→ **この1本を先に固定**するから、各 contract が後段と整合し、作り直しが起きない。

---

## §2. 抽出 contract（ExtractedShiftCell）— VLM はこれを埋めるだけ

GPT 提案フィールド（date / rawCode / rowLabel / bbox / color / notesRef）を採用 + `confidence` 追加（確認画面で低信頼セルを優先表示するため）:

```typescript
interface ExtractedShiftCell {
  date: string;        // 列ヘッダ + 月/年 から解決した YYYY-MM-DD
  rawCode: string;     // "N" / "E-18" / ""（空セル）
  rowLabel: string;    // 読めた人名（本人=原田 の照合用）
  rawColor?: string;   // セル塗り色（fidelity + 文字なし時の凡例色照合 §1.5）
  bbox?: [number, number, number, number]; // 出典領域（検証/「どこから」表示）
  notesRef?: string;   // 連絡事項欄エントリへの参照（該当時）
  confidence?: number; // VLM 信頼度（低信頼セルを確認画面で優先）
}
```

- **VLM の責務 = parser**: 意味判定（H=公休 等）はしない。**rawCode を正確に読むだけ**。意味は辞書（層2）が解決
- projection 入力 `ShiftCellReading`（date/rawCode/rawColor）は本 contract の subset → **既に Step1 で実装済**
- rowLabel/bbox/notesRef/confidence は**検証 + 確認画面**用

---

## §3. 休み(day_indicator)の保存モデル — off は anchor に載せない

**構造的事実（GPT も同意）**: 既存 anchor は `startTime` 必須の時間付きモデル。**休みは anchor に載らない**。別の日レベル保存パスを作る。

```typescript
interface ShiftDayMarker {
  date: string;          // YYYY-MM-DD
  semanticType: string;  // holiday / blank_day / holiday_request / paid_leave
  rawCode: string;       // "H" / "BD" / "HREQ"（出典トレース）
  countsAsPublicHoliday: boolean; // checksum 用に保持
  sourceDictionaryId: string;     // どのユーザー辞書で解決したか
}
```

### 保存場所の選択肢（CEO 判断・migration は承認後）

| 案 | 内容 | 評価 |
|---|---|---|
| A: 新 DB テーブル `shift_day_markers` | user_id × date × semanticType。堅牢・端末跨ぎ | **推奨**（anchor と同じく DB に正本）。migration 要 |
| B: client localStorage | v1 高速・表示専用 | migration 不要だが端末跨ぎ不可 |

→ **推奨 A**（anchor と一貫）。ただし v1 を急ぐなら B から入り後で A に移すのも可。**migration apply は CEO 承認後**。

---

## §4. 表示システム — 色 + バッジ（ユーザーカスタム・off-type 別）

CEO 指示を**層3 表示ポリシー**として実装（層2 の意味は不変のまま）:

```typescript
interface ShiftOffDisplayPolicy {
  // semanticType ごとに表示スタイルを持つ（H/BD/HREQ で別 = 意味差を残す）
  byType: Record<string, {
    color: string;          // ユーザー選択色（パレット or カスタム）
    icon: ShiftOffBadgeIconName; // 選んだバッジアイコン
    label: string;          // "公休" / "休み" / "希望休"
  }>;
}
```

- **色**: §5 パレットから選択 + カスタム色可。`currentColor` 継承でアイコン・薄背景・枠線に反映
- **バッジ**: §5 の 6 アイコンから選択
- **H/BD/HREQ は別スタイル**（GPT）: 例 H=スレート+「休」/ BD=ティール+家 / HREQ=アンバー+星
- **時間枠は作らない**（CEO）: 日ヘッダに小バッジを置くのみ。タイムラインは予定専用

### 保存（表示ポリシー = ユーザー設定）

`ShiftOffDisplayPolicy` は**ユーザー設定**として保存（辞書 = 層2 とは別。3層分離維持）。デフォルトを用意し、ユーザーが上書き。

---

## §5. 実装済アセット（このターン作成）— `shiftOffBadge.tsx`

CEO「Claude でアイコンを何種類か作っておいて選べるように」を実装:

| アイコン | 用途イメージ |
|---|---|
| `moon`（月） | 休息・夜 |
| `coffee`（コーヒー） | 一服・オフ |
| `home`（家） | 在宅・自宅 |
| `sofa`（ソファ） | くつろぎ |
| `star`（星） | 希望（HREQ 向き） |
| `kyu`（休） | 文字バッジ |

**色パレット（starter）**: スレート / スカイ / ティール / アンバー / ローズ / バイオレット（落ち着いたトーン、休みが予定より静かに見える）+ カスタム色可。

→ `ShiftOffBadge`（色+アイコン+ラベルの pill）+ `ShiftOffBadgeIcon`（単体）。純粋 presentational。render test 済。**次ステップで picker UI に載せて CEO が live 選択**。

---

## §6. このステップでやらないこと（GPT スコープ制限）

- VLM 本実装（抽出ロジック）← 次の Step 2 実装で
- 確認画面 / picker UI の配線（Step 6 / Step 4 実装で）
- 汎用 PDF / 手書き / チラシ / Stargazer 統合 / pattern 分析

---

## §7. CEO 判断仰ぐ点

1. **目標駆動の canonical model（§1）** の方向で良いか（end から逆算）
2. **抽出 contract（§2）** のフィールド（GPT 6 + confidence）で良いか
3. **休みの保存（§3）**: 推奨 A（新 DB テーブル）で良いか、v1 は B（client）から入るか
4. **表示（§4-5）**: 色+バッジを **off-type 別**にカスタム（H/BD/HREQ で別スタイル）で良いか
5. **6 アイコン + 色パレット**（§5）の方向で良いか。**次に picker を作って live 選択**に進めて良いか

---

## §8. 今回の stop

- 本書 = **抽出 contract + 休み保存/表示の設計** + バッジアセット実装。**VLM 本実装には入らない**。
- 次: CEO 確認 → ① VLM 抽出実装（Step2）or ② 休み表示 picker（Step4 UI）のどちらを先に進めるか CEO 判断
- push/PR は GitHub 復旧後。
