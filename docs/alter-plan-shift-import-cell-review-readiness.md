# P1-0 readiness — Source-of-truth cell review（シフト取り込み確認画面 設計）

- **対象**: 画像/PDF から抽出したシフトを、ユーザーが**原稿セルと見比べて確認・修正・反映**できる製品フローの設計。
- **状態**: readiness（設計のみ）。**DB write / migration / 本保存には入らない**（次段 CEO gate）。
- **branch**: `feat/plan-pdf-image-import`。docs-only。
- **根拠**: B1a feasibility 実証（reading 核 OK・空セル検出は Pro でも不完全）+ CEO 確認画面要件 + GPT P1-0 補正 + 私の精査（cell-crop / blank-risk honesty）。CEO 方針 ①〜⑧。
- **日付**: 2026-05-30。

---

## §0. 結論 — なぜ「いきなり実装」でなく readiness か

B1a で**「どのモデルも空セルを 100% は検出できない」**と確定（June: Pro でも day25 を埋めた）。
→ **確認画面 = architectural guarantee**（optional でない品質保証層）。

ただし確認画面には未決設計が多く（元画像セルの見せ方 / blank-risk / 修正→再計算 / off の見せ方 / preview と保存の分離）、曖昧なまま作ると作り直す。よって本 readiness で contract を固める。

**実装順（GPT 採用）**: ① 本 readiness → ② fixture-based prototype → ③ 修正 UI → ④ projection preview → ⑤ 保存設計/migration gate（CEO 承認後）。

---

## §1. 確認画面の構造 — grid review（⑦ 中核）

> **GPT「一覧でなくレビュー画面」を更に進める**: 抽出結果を**原稿シフト表と同じ格子（grid）で並べて**表示する。人間は元の表の形のままパターン照合できるので、**blank-skip（空欄が埋まっている異常）が一目で浮く**。線形の日付リストより shift 検出に強い。

各セル（grid の1マス）が保持・表示する情報:

| 表示 | 内容 |
|---|---|
| 日付 / 曜日 | grid の列 |
| **rawCode** | 抽出した原文記号（""=空欄は明示的に空表示） |
| 意味 | 辞書適用後（日勤/夜勤/休み 等） |
| 反映予定 | timed_event / day_indicator / candidate / unresolved |
| **元画像の該当セル** | §2（原稿セルの crop） |
| blank-risk / confidence | §3（注意喚起のみ） |
| 修正 | §4（タップで rawCode 編集） |

grid の上部に**元画像（行 strip）を並べて表示** → 抽出 grid と原稿を上下で照合。

---

## §2. 「元画像の該当セル」表示 — grid geometry crop（⑦）

**GPT が項目に挙げonly、私の解**:

- **VLM の bbox は使わない**（不正確 + day-keyed では未取得）。
- シフト表は**規則的な格子**。日付列は等間隔。→ **セル位置を決定論的に算出**:
  `cellX(day) = gridLeft + (day-1) * colWidth` / `cellRect = (cellX, rowY, colWidth, rowH)`
- `gridLeft / colWidth / rowY / rowH` は **1 回キャリブレーション**（初回ユーザーが表の左端・右端・本人行をクリック、or 自動検出）→ 以降は決定論的に全セル crop。
- **v1 最小**: 行 strip 全体を表示し、選択中の日の**列をハイライト**（crop なしで「どこを見ればいいか」だけ示す）。
- **v2**: 各セルの crop サムネイルを review 行に表示。

→ VLM の弱点（bbox）に依存せず、表の規則性という**強い事前知識**を使う。

---

## §3. blank-risk — 自動検出は不可能（honest design・⑦）

> **GPT「blank-risk をどう検出・表示するか」を精査した結論: 完全な自動検出は原理的に不可能**。

理由（B1a データ）:
- **confidence は効かない**: blank-skip セルは高 confidence のまま誤る（モデルは「G を読んだ」と確信）。
- **dual-model でも不完全**: April/May は Flash↔Pro 不一致で flag 可能だが、**June は両者とも day25 を埋めた（一致誤り）→ flag 不能**。
- coverage は通過する（前回の盲点）。

**よって設計原則**:
1. **全格子を原稿と見比べられる**ことを保証（auto-flag で「ここだけ見ろ」にしない）。grid review（§1）がこれを担う。
2. **heuristic emphasis（注意の優先付けのみ）**: 低 confidence / 検出済み空欄の隣接セル / （任意）dual-model 不一致 を**強調表示**して注意を誘導。ただし**「flag が無い＝安全」とはしない**。
3. **空欄は特に目立たせる**（CEO 指示）: 空セルは明示的な「空」表示 + その前後を視覚強調 → ユーザーが「ここ本当に空？」と確認しやすく。

→ 品質保証は**人間の全格子レビュー**。自動検出は補助。これが honest かつ安全。

---

## §4. セル修正フロー

1. ユーザーが grid のセルをタップ → rawCode を編集（既知コードから選択 or 自由入力）。空欄化も可。
2. 修正後、**辞書 → projection を即時再計算**（Step1 の pure 関数を再実行）。
3. timed_event / day_indicator / candidate / unresolved が**ライブ更新**。
4. （将来 hook・⑦）「これは空欄だった」等の修正を**per-user correction memory** に蓄積 → 同テンプレの同領域を学習（v1 は記録のみ、自動適用はしない）。

---

## §5. 保存前 preview（反映イメージ）

| 抽出 | preview 表示 |
|---|---|
| work（E/E-18/N/L/G） | **timed event**（時刻付き、/plan タイムライン反映予定） |
| off（H/BD/AL） | **day-level indicator**（§ shiftOffBadge、時間枠を作らない） |
| off_request（HREQ） | candidate（控えめ） |
| unresolved / 未知コード | **保存対象から外し「要確認」で止める** |

→ ユーザーは「反映したらこうなる」を見てから承認。

---

## §6. Pro / Flash 方針

- **Gemini Pro を primary**（シフト取り込みは月1回程度、精度差がユーザー修正回数を減らす）。
- Flash は安価 fallback / 実験用。
- **Pro でも残るミス前提で確認画面を必須**にする（§0）。

---

## §7. やらないこと（次段 CEO gate）

- DB migration（sourceType=document_extracted / day_indicator storage）
- 本保存（既存 import 経路への commit）
- B1b（全表→本人行自動特定）
- これらは確認画面 contract 確定 + CEO 承認後。

---

## §8. CEO 判断仰ぐ点

1. **grid review（原稿表と同形で並べる）** の方向で良いか ← ⑦ の中核
2. **元画像セル = grid geometry crop**（VLM bbox 非依存・1回キャリブレーション）で良いか
3. **blank-risk = 自動検出に頼らず全格子レビュー + heuristic emphasis** の honest 設計で良いか
4. **修正→辞書/projection 即時再計算 + preview** の流れで良いか
5. この readiness 確定後、**fixture-based 確認画面 prototype（保存なし）着手**で良いか

---

## §9. 今回の stop

- 本書 = **確認画面 設計のみ**。実装・DB・保存には入らない。
- 次: CEO 確認 → fixture-based prototype → 修正 UI → projection preview → 保存 gate。
- push/PR は GitHub 復旧後。
