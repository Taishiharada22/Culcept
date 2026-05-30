# Golden 注釈ルール定義書（shift roster 取り込み評価の正解化基準）

- **対象**: P0-2 golden dataset の **正解 JSON を作る際のルール**。これが揺れると評価がブレ、arch 比較が無意味化する。
- **状態**: ルール定義（実装・dataset 構築の前段ゲート）。**CEO 確認後に golden 構築へ**。
- **branch**: `feat/plan-pdf-image-import`。
- **根拠**: GPT 補正 3「golden JSON の注釈ルールを先に固定」 + GPT 補正「抽出 truth と calendar projection policy を分離」（P0-2 GO の条件）。
- **日付**: 2026-05-30。CEO 方針 ①〜⑧。

---

## §-1. 最重要原則: 3 層分離（GPT 補正「truth と projection を分ける」を精緻化）★★★

> GPT「抽出 truth と calendar projection policy を分けよ」を採用 + **3 層に精緻化**。golden は**層1+層2（truth）のみ**を正解化し、**層3（projection）は golden に持たせない**。これで golden は「不変の真実」になり、ユーザー設定が変わっても**再アノテーション不要**。

```
┌─ 層1: 読み取り truth ─────────────────────────────┐
│  原稿の文字・記号・色をそのまま。「AL という文字を読んだ」     │
│  golden field: rawText, rawColor, sourceRegion(bbox)        │
│  評価 KPI: K1(row) / K2(legend OCR) / OCR 精度              │
├─ 層2: 意味解釈 truth ─────────────────────────────┤
│  略号辞書を適用した意味。「AL = 有給 = type:leave」          │
│  golden field: type(shift/leave/holiday_request/note_event/ │
│                ambiguous), startTime, endTime, endsNextDay   │
│  評価 KPI: K7(略号展開) / K4,K5(時刻) / K6(日跨ぎ)           │
├─ 層3: calendar projection policy ─────────────────┤
│  カレンダーへどう書くか。golden に持たせない（可変・UI 設定）  │
│  policy: project_shift / project_leave / project_holiday_req │
│          / project_notes（各 true/false）                    │
│  評価: projection 適用後の最終 calendar 一致（UX 評価のみ）   │
└──────────────────────────────────────────────┘
```

### 分離の効果（私の深掘り・⑦）

1. **golden の永続性**: 層3 を剥がすと golden は原稿の事実だけ → ユーザー設定が変わっても golden は不変。再アノテ不要。
2. **評価の 2 層化**:
   - **truth 精度**（層1+2、projection 非依存）= **arch 比較の本命**。P0 はこれで決める。
   - **projection 適用後の calendar 一致**（層3 依存）= Phase 1 リリース UX 判定。
   = arch の優劣が「カレンダー表示設定」に汚染されない（GPT の指摘どおり）。
3. **type を意味レベルで固定**（GPT 提案）: `shift` / `leave` / `holiday_request` / `note_event` / `ambiguous_note` / `statutory_off`。projection はこの type を入力に取る純関数。

### §-1.1 type 語彙（層2 で固定・projection 非依存）

| type | 意味 | 例 |
|---|---|---|
| `shift` | 勤務 | G(日勤) / N(夜勤) / E-18 |
| `leave` | 取得済休暇 | AL(有給) |
| `holiday_request` | 希望段階の休 | HREQ(希望休) |
| `statutory_off` | 法定休/公休 | 公休 |
| `note_event` | 注記欄の日時明確な予定 | 「18日 MTG 14-15」 |
| `ambiguous_note` | 注記欄の日時不明 | 内容のみメモ |
| `unknown` | 読めたが意味不明 | 辞書にない略号 / 色のみ |

### §-1.2 projection policy（層3・golden 外・将来の UI 設定）

純関数 `project(truthEvents, policy) → calendarDrafts`:

```typescript
type ProjectionPolicy = {
  project_shift: boolean;          // default true
  project_leave: boolean;          // default true（休みもカレンダー化）
  project_holiday_request: boolean; // default false（希望段階は候補止まり）
  project_statutory_off: boolean;   // default true
  project_notes: boolean;          // default true（日時明確なもの）
};
```

→ **default を annotation には焼き込まない**（GPT 指摘）。projection module の default として別管理。評価は default + 主要バリエーションで取る。

---

## §1. 曖昧項目の確定ルール

### 1.1 休み系略号（`AL`, `HREQ`, 公休, 振休 等）

**golden（truth）は「読んだ意味＝type」を必ず固定**する。カレンダーに出すか否か（projection）は golden に持たせない（§-1）。

| 項目 | golden の type（層2・truth・**常に固定**） | カレンダー反映（層3・projection・golden 外） |
|---|---|---|
| `AL`（有給） | **`type: "leave"`**（終日、`isOff: true`、time null） | `project_leave` policy（default true） |
| `HREQ`（希望休） | **`type: "holiday_request"`**（希望段階） | `project_holiday_request` policy（default false＝候補止まり） |
| 公休 / 法定休 | **`type: "statutory_off"`** | `project_statutory_off`（default true） |

→ **GPT 補正反映**: golden は「`AL` は有給休暇である」を不変の真実として固定。「カレンダーに休みを出すか」は projection policy（§-1.2）で後から切替。**golden を policy で両面化する v1.0 方針は撤回**（truth は 1 つ、projection で吸収）。

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
  // ★ projection policy は golden に持たない（§-1.2、層3 は別管理）
  "personRow": { "displayName": "石原 陽太郎", "rowIndexFromTop": 1, "bbox": [...] },
  "abbreviationDictionary": { /* §1.6、 凡例から + 手動補完 */ },
  "events": [
    {
      "id": "ev-001",
      "date": "2025-02-01",
      // 層1: 読み取り truth
      "rawText": "G",               // §1.6 原稿の表記そのまま
      "rawColor": "green",          // §1.5
      "sourceRegion": { "page": 1, "bbox": [...] },
      // 層2: 意味解釈 truth
      "type": "shift",              // §-1.1 (shift/leave/holiday_request/statutory_off/note_event/ambiguous_note/unknown)
      "title": "日勤",
      "startTime": "09:00",         // 凡例/辞書で展開、不明なら null
      "endTime": "17:45",
      "endsNextDay": false,         // §1.7
      "isOff": false,
      "coWorkers": [],              // §1.2
      "source": "cell" | "notes_field",  // §1.3
      "confidence": 1.0             // golden は人間確定なので 1.0
      // ★ 層3 projection は golden に書かない（project module が type → calendar 変換）
    }
  ],
  "ambiguities": [ /* §1.3 日付不明注記, §1.5 unknown_color 等 */ ]
}
```

---

## §3. 評価の 2 層化（truth / projection 分離・§-1 反映）

- **truth 精度評価（arch 比較の本命・projection 非依存）**: golden の層1+2（type / 時刻 / 日跨ぎ / row / legend）と arch 出力を直接比較。K1-K8 はすべてここ。**arch の優劣はここで決める**。
- **projection 適用後の calendar 一致（UX 評価・layer3）**: `project(truth, policy)` を default policy（§-1.2）で適用した calendar draft が、期待 calendar と一致するか。**Phase 1 リリース UX 判定**にのみ使用。
- → arch 比較が「カレンダー表示設定」に汚染されない（GPT 補正の核心）。

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

1. **3 層分離（§-1）**: golden は truth（層1+2）のみ、projection（層3）は別管理 ← GPT 補正の核。これに同意か
2. **type 語彙（§-1.1）**: shift / leave / holiday_request / statutory_off / note_event / ambiguous_note / unknown で良いか
3. **§1 の確定ルール**（休み系=type 固定 / 複数名 / 注記欄 / 空セル / 色 / 派生略号 / 日跨ぎ）に同意か
4. **projection default（§-1.2）**: project_shift=true / project_leave=true / project_holiday_request=**false** / project_statutory_off=true / project_notes=true で良いか（※これは golden ではなく projection module の default）
5. このルール確定後に **P0-2（golden 構築）着手**で良いか

---

## §6. 今回の stop

- 本書 = **注釈ルール定義のみ**。dataset 構築・実装には入らない。
- branch `feat/plan-pdf-image-import` に commit して停止。
- **順序**: 本書 CEO 確認 → P0-2 golden 構築 → P0-3 harness → ...
- push/PR は GitHub 復旧後。
