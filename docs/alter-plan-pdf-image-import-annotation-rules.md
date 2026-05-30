# Golden 注釈ルール定義書（shift roster 取り込み評価の正解化基準）

- **対象**: P0-2 golden dataset の **正解 JSON を作る際のルール**。これが揺れると評価がブレ、arch 比較が無意味化する。
- **状態**: ルール定義（実装・dataset 構築の前段ゲート）。**CEO 確認後に golden 構築へ**。
- **branch**: `feat/plan-pdf-image-import`。
- **根拠**: GPT 補正 3「golden JSON の注釈ルールを先に固定」（P0-2 GO の条件）。
- **日付**: 2026-05-30。CEO 方針 ①〜⑧。

---

## §0. 原則

1. **「原稿に書いてある通り」が最上位**。解釈を足さない。書いてあるものを書いてある通り。
2. **曖昧な項目は `policy` で両面 golden 化**（休み系/注記）。ユーザー設定に対応し、評価も policy 別に取る。
3. **本人行のみが対象**。他人の行・他人の予定は golden に含めない（プライバシー + scope）。
4. **凡例で時間が読めるものは時間付き、読めないものは時間 null + ラベルのみ**。推測で時間を埋めない。

---

## §1. 曖昧項目の確定ルール

### 1.1 休み系略号（`AL`, `HREQ`, 公休, 振休 等）

| 項目 | golden ルール |
|---|---|
| `AL`（有給） | **policy 依存**。`off_as_event=true` → 終日 isOff イベント / `off_as_event=false` → イベント化しない（その日は空） |
| `HREQ`（希望休） | **同上 policy 依存**。ただし `kind="off_request"` を付与（確定休でなく希望段階） |
| 公休 / 法定休 | policy 依存、`kind="statutory_off"` |
| **default policy** | **`off_as_event=true`**（休みも「その日は休み」とカレンダーに出すのが第二の自己として自然）。ただし両面 golden を持ち、評価は両方で取る |

→ **理由**: 「休みを見たい人」と「勤務だけ見たい人」両方いる。golden を 1 つに固定すると片方で誤判定になる。policy で吸収。

### 1.2 セル内複数名（代務: 「松田/田口」「香田/松田」）

| ケース | golden ルール |
|---|---|
| 本人を含む（例: 本人=松田、セル「松田/田口」） | **イベント化する**。title に代務情報を付与（例: 「日勤（田口と）」）。`coWorkers: ["田口"]` を meta に |
| 本人を含まない | **イベント化しない**（他人の予定。本人行のセルにのみ着目するので通常発生しないが、注記欄等で混在時は無視） |

### 1.3 注記欄 / 連絡事項欄（「18日デスクMTG 14-15時」等）

| 項目 | golden ルール |
|---|---|
| 日付 + 時刻 + 内容が明確（「18日 MTG 14-15」） | **イベント化する**が `confidence` は中、`source="notes_field"` を付与。日付は注記内の日付を採用 |
| 日付不明 / 内容のみ | **イベント化しない**（候補メモ扱い、low confidence、ambiguities に登録） |
| 本人宛と明示（「石原: …」） | 本人宛のみ採用 |
| 全員宛 | 本人にも適用してイベント化 |

→ **policy `notes_as_event`**: default true（日付明確時のみ）。

### 1.4 空セル

- 何も書かれていないセル → **イベントなし**（休みでもない。記載がないだけ）。golden に出さない。

### 1.5 色のみセル（文字なし、色で意味）

- 文字がなく色だけ → **凡例の colorRules で略号を引く**。引けない場合は `kind="unknown_color"` で ambiguity 登録（イベント化しない）。
- 文字 + 色の両方ある場合 → **文字優先**（色は確認用）。

### 1.6 派生略号（`E-18`, `E-16`, `E-G`, `G-L`, `18-N`, `BD` 等）

- 凡例にある → その時間
- 凡例にない → **辞書補完待ち**。golden では「原稿の表記そのまま + 時間 null」とし、辞書が無い状態での正解は「略号は読めたが時間は不明」を正解とする
- = **OCR としては成功（略号を正しく読んだ）/ 展開は辞書次第** を分離評価（K7）

### 1.7 日跨ぎ（`N` 夜勤 22:00→翌07:00 等）

- 凡例 or 辞書で `endsNextDay=true` のものは、**開始日に開始時刻、終了は翌日**として golden 化
- 例: 2/14 `N` → `{ date: "2025-02-14", startTime: "22:00", endTime: "06:45", endsNextDay: true }`
- **終了日の扱い**: endsNextDay=true なら終了時刻は翌日（2/15 06:45）と解釈。golden には date=開始日 + endsNextDay フラグで表現（既存 IcsAnchorDraft の TZ 正規化と整合）

---

## §2. golden JSON フィールド確定（P0-1 §1.3 を注釈ルールで補強）

```typescript
{
  "fileId": "uuid",
  "annotationPolicy": {
    "off_as_event": true,        // §1.1
    "notes_as_event": true,      // §1.3
    "include_coworker_in_title": true  // §1.2
  },
  "personRow": { "displayName": "石原 陽太郎", "rowIndexFromTop": 1, "bbox": [...] },
  "abbreviationDictionary": { /* §1.6、 凡例から + 手動補完 */ },
  "events": [
    {
      "id": "ev-001",
      "date": "2025-02-01",
      "title": "日勤",
      "abbreviation": "G",          // §1.6 (読めた略号、辞書展開前)
      "startTime": "09:00",         // 凡例/辞書で展開、不明なら null
      "endTime": "17:45",
      "endsNextDay": false,         // §1.7
      "kind": "work" | "off" | "off_request" | "statutory_off" | "note_event",  // §1.1, §1.3
      "isOff": false,
      "coWorkers": [],              // §1.2
      "source": "cell" | "notes_field",  // §1.3
      "confidence": 1.0,            // golden は人間確定なので 1.0
      "sourceRegion": { "page": 1, "bbox": [...] }
    }
  ],
  "ambiguities": [ /* §1.3 日付不明注記, §1.5 unknown_color 等 */ ]
}
```

---

## §3. 評価時の policy 適用

- **両面評価**: `off_as_event` を true/false の両方で評価実施
- arch 出力も policy を尊重（プロンプトに「休みをイベント化するか」を渡す）
- K3b（event F1）は **policy=default(true)** で主評価、参考で false も取る

---

## §4. アノテーター手順（dataset 構築時の運用）

1. 私が VLM (Sonnet 4.6) で 1st draft（本人行は assisted = CEO に「どの行か」確認）
2. 私が §1 ルールに照らして手動修正
3. **判断に迷う項目 = 本書 §1 のどれに該当するか明記**してログ化
4. CEO が 20%（5/25）抜き取り検証
5. golden 確定 → `evaluation/golden/` に commit

→ **「迷ったら §1 を見る」で一貫性を担保**。新しい曖昧ケースが出たら §1 に追記してから再アノテーション。

---

## §5. CEO 判断仰ぐ点

1. **§1 の確定ルール**（休み系/複数名/注記欄/空セル/色/派生略号/日跨ぎ）に同意か
2. **default policy**: `off_as_event=true`（休みもカレンダー化）で良いか
3. **注記欄イベント化**: 日付明確時のみ true で良いか
4. **両面 golden（policy 切替）**の方針に同意か
5. このルール確定後に **P0-2（golden 構築）着手**で良いか

---

## §6. 今回の stop

- 本書 = **注釈ルール定義のみ**。dataset 構築・実装には入らない。
- branch `feat/plan-pdf-image-import` に commit して停止。
- **順序**: 本書 CEO 確認 → P0-2 golden 構築 → P0-3 harness → ...
- push/PR は GitHub 復旧後。
