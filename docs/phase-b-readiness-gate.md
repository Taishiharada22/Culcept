# Phase B Readiness Gate — cross-day / 早期警告に進む条件（★定義のみ・実装しない）

> 2026-06-09 / Build Unit / CEO 指示。Phase B（B1 cross-day / B2 先回り / B3 energy curve）を**いつ・何が揃えば**解凍するかを明文化。
> ★本 doc は gate 定義のみ。Phase B 実装には進まない。

---

## 0. なぜ gate が要るか（Recovery Pattern audit の確定事項）
- lag-1 cross-day は**連続観測日ペア**が必要（薄いと mean-reversion/weekend 交絡でノイズが信号に見える）。
- 過去日の packed/light（density 履歴）は**非永続** → 取るには DB read（Supabase `listAnchors`）か新規 capture が要る。
- → **data gate（local で足りる範囲）** と **DB/capture gate（CEO 承認が要る範囲）** を分けて定義する。

## 1. Data gate（local のみで B を解凍できる最低ライン）
すべて既存 local store から数えられる（読むだけ・実装時も pure）。

| 指標 | 解凍ライン | 根拠 |
|---|---|---|
| **MobilityObservation 観測日数** | **≥14 日**（60 日窓内） | lag-1 ペア ≥13 を確保 |
| **連続日ペア数**（両日に観測がある隣接日） | **≥10 ペア** | 欠損日を除いた実効 lag-1 標本 |
| 1 日あたり観測数（中央値） | **≥3** | 日内 noise の平滑化 |
| A0 reason 件数 | **≥10**（うち tired ≥3） | 回復需要の corroboration |
| movement observation 総数 | **≥40** | 条件別スライスの底 |
| place 選択（destKey 訪問） | **≥8 ∧ 2 回以上の場所 ≥2** | B で場所文脈を使う場合の底（P2 ready と同値） |
| personal pace（movementEvent） | **≥10**（recurring 区間 ≥2） | B3 energy curve に duration を使う場合のみ要 |
| 条件下観測（weather/timeband/weekday 各セル） | **使うセルは ≥4** | 既存 sufficient gate と整合 |

- ★**B1（cross-day pattern）解凍 = 上 4 行が全て充足**（place/pace 行は使う sub-feature のみ）。
- ★充足しても**断定はしない**: B1 v0 は「忙しい日の翌日は予定を控えめにすることが多いようです」級の観測トーン・lag-1・本人 baseline 比・sufficient gate（Recovery design-only doc の safe-local v0 sketch に従う）。

## 2. DB read gate（CEO 承認が要る境界）
- **何が欲しいか**: 過去日の **anchor 件数/カテゴリ（day-level density 履歴）**。これがあると「予定の詰まり→翌日の行動」が直接読める（mobility 観測の proxy より強い）。
- **境界**: `listAnchors()`（Supabase・read-only）を**過去 N 日 bounded** で読む。書き込みなし・集計は day-level count のみ・場所/title は不使用（redact）。
- **承認条件（CEO）**: ①read-only であること ②bounded（≤60 日）③day-level 集計のみ保持（raw anchor を新規永続しない）④production 環境には触れない（dev fetch のみ）。
- ★承認されるまで B は **data gate 経路のみ**で設計する。

## 3. Capture gate（新規データ保存が要る境界・最終手段）
- **何か**: 軽量 per-day summary（その日の観測数/負荷 proxy/tired 数）を local 永続（60 日 cap・category のみ）。
- **要承認な理由**: 新規データ保存 = CEO stop gate。既存 store の byDay self-join で同等が取れるため**原則不要**。DB gate も capture gate も否なら、このまま data gate 充足を待つ。

## 4. 段階解凍の順序（gate 充足後・実装は別途 CEO GO）
1. **B-0 可視化**: PRG Readiness Console に「B data gate 進捗」行を追加（n/14 日・ペア数。pure・読むだけ・UI は既存 console 内 1 行）→ 14 日判断の客観化。
2. **B1 v0**: Recovery safe-local v0（lag-1・観測数+tired・観測トーン・flag OFF）。
3. **B2 先回り / B3 energy curve**: B1 の安定後・別 GO。
- ★B-0 は「実装最小限・UI 追加なし（既存 console の行追加）」に収まるが、**今回は実装しない**（CEO 指示）。

## 5. ★stop gate（再掲）
Phase B 実装 / DB・Supabase read（承認前）/ 新規データ保存 / production / Reality apply → 停止。

## 次
14 日判断（dogfood-operation-plan §2）で本 gate と照合 → CEO が「B 解凍 / 継続蓄積 / DB read 承認」を判断。
