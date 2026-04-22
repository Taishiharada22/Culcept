# Alter Morning — Roadmap（北極星から逆算する PR 階段）

**作成日**: 2026-04-22
**目的**: CEO 最終ビジョンから逆算し、PR-8〜PR-14 までの **依存関係と各段階の到達点** を固定する。詳細な実装は各 PR の設計書に委ねる。このドキュメントは「どの順番で何が初めて可能になるか」だけを扱う。
**原則**: 各 PR は **前の PR で確立された契約**の上に積み、**次の PR のために明示的に予約されたインターフェース**だけを前提とする。

---

## 0. 北極星（最終ビジョン）

> 全ての予定を map にピンでマッピングし、各予定に *移動手段 / いつ / どこで / 誰と / いつからいつまで / 何を* を載せる。予定を順番に繋いで、1 日の動きを可視化する。

### 技術要件への分解

各 event が確定値で以下を持つ:

| slot | 確定値 |
|------|-------|
| where | `lat/lng` + `place_name` + `placeId` |
| when | `startTime(HH:mm)` + `endTime(HH:mm)` |
| transport | `mode` + 2 event 間の経路 |
| who | 正規化された人物参照 |
| what | 具体活動（vague 非許容） |

**決定的制約**: 地図ピンには座標が必要。座標は **外部 search（Places API 等）** 無しには埋まらない。よって「会話 → search 準備 → search → 座標注入」の 4 段階は切り離せない。

---

## 1. PR 階段と各段階の到達点

```
[北極星] map + pin + timeline UI
  │
  ▼
PR-14 │ timeline UI            │ event 連結線 + transport 描画
  │   └ 初めて可能: 1 日の流れを 1 画面で見る
  ▼
PR-13 │ map pin rendering      │ coordinates 揃った event を map に描画
  │   └ 初めて可能: 地図に pin が立つ
  ▼
PR-12 │ end time staircase     │ 時間範囲を点から区間に
  │   └ 初めて可能: event が「いつからいつまで」を持つ
  ▼
PR-11 │ who staircase          │ 人物参照の正規化
  │   └ 初めて可能: 「A さん」が cross-session で一意に同定される
  ▼
PR-10 │ transport staircase    │ 移動手段 + 2 event 間経路
  │   └ 初めて可能: event 間が「どう移動するか」で繋がる
  ▼
PR-9  │ Places API search       │ SearchQueryDraft → 候補 → user 選択 → lat/lng 注入
  │   └ 初めて可能: where が座標を持つ
  ▼
PR-8 rev 3 │ DialogState + staircase │ 会話が memory を持つ、search query が draft まで蓄積
  │        └ 初めて可能: 同じ質問を繰り返さない / PR-9 への handoff 契約
  ▼
PR-8 rev 2 │ dialog-control contract │ phase authority が slot に（hasBlockingUnresolvedSlots）
  │        └ 初めて可能: 未確定が plan 昇格しない
  ▼
PR-8 rev 1 │ UI truth separation     │ slot 分離描画 + confirmationState
  │        └ 初めて可能: UI が嘘をつかない
  ▼
PR-7       │ clarify loop 基盤       │ pendingClarify / answerBinder の骨格
            └ 初めて可能: 質問 → 回答 → plan 更新のループ
```

---

## 2. 依存関係

### 2.1 破れない依存

- PR-9 は **PR-8 rev 3 の SearchQueryDraft 契約** に依存。rev 3 merge 前に PR-9 実装禁止。
- PR-10 は **PR-9 で埋まった座標** に依存（2 点間経路推論に lat/lng が必要）。
- PR-11 は独立性が高い（who は where/when と直交）。PR-9 と並行可能。
- PR-12 は PR-9 以降であれば順序自由。
- PR-13 は **全 event が座標を持つ** ことが前提（= PR-9 完了）。
- PR-14 は **PR-13 の描画層 + PR-10 の経路データ** 両方に依存。

### 2.2 並行可能 pair
- PR-9 と PR-11（who）: 並行可
- PR-10 と PR-12（end time）: 並行可
- PR-13 と PR-14 は順序制約あり

### 2.3 Kill switch
各 PR は **feature flag で ON/OFF** 切替可能な状態で merge する。preview で問題が出た PR は flag=OFF で即座に rollback できる。PR-8 rev 3 では `DIALOG_STATE_V2` flag を導入。

---

## 3. 各 PR の「初めて可能になるもの」（進捗指標）

| PR | 北極星への貢献 | これが無いと次に進めない理由 |
|----|--------------|---------------------------|
| PR-7 | 質問ループが動く | これが無いと会話で slot を埋める基本動作がない |
| PR-8 rev 1 | UI が嘘をつかない | 後続 PR で「確定した風」の表示を直すコストが膨大になる |
| PR-8 rev 2 | 未確定が plan に上がらない | 次 PR で slot 解決ロジックを入れても UI 側が認識しない |
| **PR-8 rev 3** | **会話が memory を持つ / search query draft が揃う** | **PR-9 が query 構築元を持てない、無限ループが塞げない** |
| PR-9 | where に座標が入る | map pin の前提。最終ビジョン到達の核 |
| PR-10 | event 間に経路が乗る | timeline 描画で「移動」が描けない |
| PR-11 | who が一意 | cross-session で「A さん」が毎回別人扱いされる |
| PR-12 | 時間範囲が区間 | pin 間の時間的関係が描けない |
| PR-13 | map に pin が立つ | CEO ビジョンの第一視覚化 |
| PR-14 | 1 日の流れが 1 画面 | CEO ビジョン完成 |

---

## 4. 非ゴール（明示的に除外）

- **課金・決済**: マネタイズは今月やらない（CEO 方針 2026-03）
- **大規模マーケティング**: 本 roadmap は beta 検証用。公開施策は別
- **AI による自動経路最適化**: PR-10 は 2 点間の単純推論のみ。最適化は別 PR
- **他ユーザーとの schedule 共有**: Rendezvous 側で扱う。本 roadmap には含めない

---

## 5. 見直しトリガ

以下が起きた場合は roadmap 自体を再検討する:
- CEO ビジョンが変わった（例: map 中心 → カレンダー中心）
- Places API が調達不能（代替検討から再構築）
- PR-9 preview で base 設計が崩れた（rev 3 への逆流修正が必要）
- beta ユーザーの観測で別の主戦場が浮上

---

## 6. 参照

- `docs/alter-morning-strict-confirmation-design.md`（PR-8 全改訂）
- `docs/alter-morning-pr9-places-search-design.md`（PR-9 骨子、Phase 0 で作成）
- `docs/alter-morning-pr10-14-interface-reservation.md`（PR-10〜14 型予約、Phase 0 で作成）
- `docs/weekly-priorities.md`（実行管理）
