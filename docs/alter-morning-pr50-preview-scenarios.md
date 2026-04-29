# PR-50 Preview 実機検証シナリオ

> **対象 PR**: [Culcept#48](https://github.com/Taishiharada22/Culcept/pull/48)
> **目的**: Preview デプロイ後、CEO が 5 cases を順序通りに踏むための具体的な会話台本。実 LLM が `operations[]` を安定して出力するかを検証する。
> **作成**: 2026-04-30 / Build Unit (Claude Opus 4.7)

---

## 0. 共通: trace 観測の手順

1. Preview URL を開き、Alter のチャット画面に入る
2. DevTools → Network タブを開いた状態で発話する
3. `/api/stargazer/alter`（chat）または `/api/stargazer/alter/selection` のレスポンスを確認
4. レスポンス JSON の `_debug.trace.operations` を確認する

```json
{
  "_debug": {
    "trace": {
      "operations": {
        "received": 1,
        "accepted": 1,
        "rejected": 0,
        "fallbackToEvents": false,
        "appliedTypes": ["modify"],
        "rejectReasons": []
      }
    }
  }
}
```

### `trace.operations` が **undefined** の場合の意味

| 状況 | 解釈 |
|---|---|
| field 自体が無い | LLM が operations を一度も出していない、かつ validation も呼ばれていない（Branch A bind 経路など） |
| `received: 0` | LLM が `operations: []` を返した（schema 上は必須なので空配列で出力） |
| `received >= 1` だが `accepted: 0` | validation で全 reject → `fallbackToEvents: true` で events[] 経路に倒れた |

**重要**: production env では `shouldEmitTrace()` が false なので trace は emit されない。Preview / development env でのみ観測可能。

### Console / Network warning の見方

`fallbackToEvents=true` のとき、サーバ側で以下の warning が出る:

```
[alter-morning/morningPipeline] operations rejected, falling back to events[]
{ received: N, rejected: M, reasons: [...] }
```

Vercel function logs もしくは preview の console output で確認。

---

## Session A: 基本 plan + append + modify

**目的**: Case 3 (append) → Case 1 (modify when) → Case 2 (modify transport) を 1 つの session で連続検証。

**前提**: clean state（新規 morningSession）で開始。

---

### Turn 1（準備）: plan 作成

**発話**:
```
9時にスタバでコーヒー
```

**期待**:
- phase = `plan_presented`（または `clarifying` で「どこのスタバ？」 と聞かれる場合は `渋谷のスタバ` 等で具体化してから次へ）
- `event_1`: 09:00 / スタバ / コーヒー
- これは create turn なので **operations は出ない or noop** で OK

**trace 観測ポイント**:
- `trace.operations` が undefined または `received: 0` → 想定通り（create は events[] 経路）
- `received: 1, appliedTypes: ["noop" 等]` → これも OK（LLM が「特に意図変更なし」 と表現）

---

### Turn 2: Case 3（append, 予定追加）

**発話**:
```
12時に新宿で武藤さんとランチ
```

**期待 trace.operations**:
```json
{
  "received": 1,
  "accepted": 1,
  "rejected": 0,
  "fallbackToEvents": false,
  "appliedTypes": ["append"],
  "rejectReasons": []
}
```

**期待 plan state**:
- events 2 件
  - `event_1`: 09:00 / スタバ / コーヒー（**完全保持**）
  - `event_2`（または別 id）: 12:00 / 新宿 / ランチ / 武藤
- id collision なし（event_id 重複なし）

**UI 確認ポイント**:
- plan UI に 9:00 と 12:00 の 2 つの pin / row が並ぶ
- 9:00 のスタバ予定が「変更されていない」（who / what / where / transport が Turn 1 と同一）

**NG 兆候**:
- event_1 の where が「新宿」 に上書きされている → operationDispatcher の append が priorCopy を touch している（Commit 4 のバグ）
- `fallbackToEvents: true` で events[] 経路 → LLM が operations を出していない（Commit 2 SYSTEM_PROMPT 要調整）

---

### Turn 3: Case 1（modify when, 時間変更）

**発話**:
```
9時を10時に変更
```

**期待 trace.operations**:
```json
{
  "received": 1,
  "accepted": 1,
  "rejected": 0,
  "fallbackToEvents": false,
  "appliedTypes": ["modify"],
  "rejectReasons": []
}
```

**期待 plan state**:
- `event_1.when.startTime === "10:00"`（変更）
- `event_1.where.place_ref === "スタバ"`（不変）
- `event_1.what.activity === "コーヒー"`（不変）
- `event_1.transport`（不変）
- `event_2`（12:00 新宿ランチ）は完全に touch されない

**UI 確認ポイント**:
- 9:00 → 10:00 に時刻が更新される
- スタバ / コーヒーの表記は変わらない
- 新宿ランチは影響なし

**NG 兆候**:
- where が空になる / what に「9時を10時に変更」 等の command 文字列が leak → applyModifyPatchFromOperation の PR-46 contract 違反（Commit 4 のバグ）
- `fallbackToEvents: true` でも events[] 経路で同じ結果が出るが、appliedTypes が空になる → operation 経路を踏んでいない

---

### Turn 4: Case 2（modify transport, 移動手段変更）

**発話**:
```
徒歩に変更
```

> ⚠️ "walk" を期待するため「徒歩」 を使う。実際の LLM 出力は `transport: "walk"` または `"徒歩"` の可能性。両方とも UI で 🚶 にマップされる想定。

**期待 trace.operations**:
```json
{
  "received": 1,
  "accepted": 1,
  "rejected": 0,
  "fallbackToEvents": false,
  "appliedTypes": ["modify"],
  "rejectReasons": []
}
```

**期待 plan state**:
- `event_1.transport === "walk"` (または `"徒歩"`)
- `plan.dayConditions.mainTransport === "walk"`（`deriveDayTransport` が effectiveEvents から再計算）
- 移動 pin（travel item）が 🚶 アイコンで表示

**UI 確認ポイント**:
- スタバ / 新宿の予定は時刻 / 場所 / 活動が不変
- 移動表現が 🚶（walk）に切り替わる

**NG 兆候**:
- transport が変わらない → applyModifyPatchFromOperation の patch.transport 適用漏れ
- where が空になる → PR-46 contract 違反

---

## Session B: Case 4（answer secondary path）

**目的**: pendingClarify が立っている状態で user が回答 → Branch A bind が主、Branch B operation answer が secondary。

**前提**: clean state で開始。

---

### Turn 1（準備）: where が曖昧な発話で clarify を立てる

**発話例（どれか）**:
```
9時にカフェでコーヒー
```
or
```
朝、駅前のカフェ
```
or
```
9時にスタバ
```
（chain_brand `スタバ` だけだと支店が曖昧で `where_center` clarify が立つ可能性。CEO が「9時にカフェ」 で chain でなく generic vague が立つ pattern を選んでもよい）

**期待**:
- Alter が「どのあたり？」 等の clarify を返す
- `pendingClarify.slot === "where"`
- phase = `clarifying`

**もし clarify が立たなかった場合**:
- 別の utterance（「朝の予定」 など what が空のもの）で what clarify を立てる、または
- Session B をスキップして Session C へ進む（Branch A の bind 経路は既存 W3-PR-7 で稼働中なので、Case 4 の operation 経路は補助的）

---

### Turn 2: 「池袋」 で回答

**発話**:
```
池袋
```

**期待動作（どちらも OK）**:

#### Branch A 主経路（route.ts bindAnswerToSlot が成功）
- LLM bypass → `trace.operations` は **undefined または received: 0**
- `event_1.where.place_ref === "池袋"`
- 新規 event なし（events.length 不変）
- console log: `[morning-protocol:v2:bind] reason=ok boundSlot=where`

#### Branch B secondary（LLM が answer operation を出した場合）
**期待 trace.operations**:
```json
{
  "received": 1,
  "accepted": 1,
  "rejected": 0,
  "fallbackToEvents": false,
  "appliedTypes": ["answer"],
  "rejectReasons": []
}
```
- `event_1.where.place_ref === "池袋"`
- 新規 event なし

**共通の UI 確認ポイント**:
- 9:00 のカフェ→「池袋」 に置換、新しい event は追加されない
- pendingClarify が消える（phase = `plan_presented` に昇格）

**NG 兆候**:
- 新規 event_2 が「池袋」 で追加されている → answer が append として誤処理（Commit 4 の operationDispatcher answer case のバグ）
- where が「池袋」 にならない → bind 失敗 + operation reject 両方

---

## Session C: Case 5（invalid operation fallback）

**目的**: prior 複数 + 解決不能な targetRef → validation reject → events[] fallback で安全に既存挙動。

**前提**: clean state で開始。

---

### Turn 1（準備）: prior 2 件作成

**発話**:
```
9時にスタバ、12時に新宿でランチ
```

**期待**:
- events 2 件（event_1: 09:00 スタバ / event_2: 12:00 新宿 ランチ）
- phase = `plan_presented`

**もし 1 turn で 2 events に分割されない場合**:
- Turn 1.5 として「12時に新宿でランチを追加」 等で 2 件目を append する

---

### Turn 2: 解決不能な modify

**発話**:
```
夜の予定を20時に変更
```

> 「夜の予定」 は prior に存在しない（ある場合は別の存在しない参照を使う：「3 時の予定を 4 時に」 等）

**期待 trace.operations**:
```json
{
  "received": 1,
  "accepted": 0,
  "rejected": 1,
  "fallbackToEvents": true,
  "appliedTypes": [],
  "rejectReasons": ["modify_target_unresolved"]
}
```

**期待 plan state**:
- events 2 件（event_1: 09:00 スタバ / event_2: 12:00 新宿 ランチ）が **そのまま保持**
- `event_1` も `event_2` も touch されていない（時刻 / 場所 / 活動 不変）

**UI 確認ポイント**:
- plan が壊れない（pin / row が消えない、内容が変わらない）
- Alter が「どの予定？」 等の clarify、または「変更できなかった」 等の応答（実装次第）
- UI が crash しない

**NG 兆候**:
- event_1 や event_2 の where / when が変わっている → operation reject が機能しておらず誤適用
- plan が空になる / pin が消える → fallback が events[] でなく noop 相当に倒れていて、しかも既存 plan が消失（Commit 3/4 のバグ）

---

## 1. 実 LLM が operations を出さない場合の escalation

### 観測

3 つの session すべてで以下が観測される場合:

- `trace.operations.received === 0`（schema 上は必須なので空配列が必ず出る）
- もしくは `trace.operations` field 自体が常に undefined（buildOperationsTrace の null 判定で operations / acceptedOperations / rejections すべて 0 のとき）

### 解釈

LLM が `operations[]` を populate していない。SYSTEM_PROMPT（Commit 2）の指示が効いていない、または模型が schema strict mode 下でも operations を空配列で済ませている。

### 対応（CEO 判断後 PR-50.1 で対応）

1. SYSTEM_PROMPT の few-shot 例を増やす（特に modify / append の典型例）
2. operations を required にして空配列を弾く schema validation を追加（現在は空 OK）
3. temperature を下げる（現在 0、これ以上下がらない）
4. model を上げる（gpt-4o → gpt-4o-mini で十分か再確認）

**この PR では merge しない**。実 LLM が operations を出さない事実が最大のブロッカー。

### 部分的に出る場合の判断

| received | 解釈 | 対応 |
|---|---|---|
| 全 case で 0 | LLM が一切 operations を populate しない | PR-50.1 で SYSTEM_PROMPT 改訂 |
| Case 3 (append) は出るが Case 1/2 (modify) は出ない | append schema は理解できているが modify schema は不安定 | modify few-shot を追加 |
| 全 case で出るが reject 率が高い | parser / validation が厳しすぎる | parser / validation 緩和を検討 |
| 全 case で出て accept される | 想定通り | merge 判断へ |

---

## 2. merge 判断基準（CEO 確定）

最低限以下が観測されたら merge 候補:

- [ ] **Case 1**: `appliedTypes: ["modify"]`、event_1.when.startTime = 10:00、where/what 不変
- [ ] **Case 2**: `appliedTypes: ["modify"]`、event_1.transport / dayConditions = walk
- [ ] **Case 3**: `appliedTypes: ["append"]`、event_1 完全保持、event_2 追加
- [ ] **Case 4**: Branch A bind 成功（trace.operations undefined）または `appliedTypes: ["answer"]`、新規 event 増えない
- [ ] **Case 5**: `rejected: 1`、`fallbackToEvents: true`、`rejectReasons: ["modify_target_unresolved"]`、state 壊れない
- [ ] 5 cases 通して **plan UI が一度も crash しない**
- [ ] 5 cases 通して **既存 PR (#42 〜 #47) の挙動が壊れない**（重複 events、command 文字列 leak、where lock 失効など）

trace.operations が **少なくとも Case 1-3 のいずれか 1 つで `received >= 1, accepted >= 1`** が観測されること = 実 LLM が operations を出すことの存在確認。

---

## 3. 観測結果の記録方法

各 case で以下を記録:

```
Case N (シナリオ名):
- 発話: "..."
- trace.operations: { received, accepted, rejected, fallbackToEvents, appliedTypes, rejectReasons }
- 観測 plan state: events[].when.startTime / where / what / transport
- UI: 想定通り / NG（理由）
- console warning: あり/なし
- 結論: PASS / FAIL（理由）
```

5 case 分の記録があれば、merge 判断 + 必要なら PR-50.1 改善点が確定する。

---

## 4. このファイルの扱い

- merge 後: PR-50 ハンドオフと一緒に historical record として残す
- merge 前に LLM 出力品質の問題が見つかったら PR-50.1 設計の input 資料に
