# Day Rehearsal — Evidence「なぜ?」UI mini design（read-only disclosure）

> 2026-06-06 / **設計のみ・実装は次 GO** / 前提: banner + 詰まり marker + 一息 marker が main live（`59e97dc4`）。
> CEO 方針: 「なぜ?」は read-only disclosure・evidence trace(known/unknown/inferred)・生スコアなし・断定/警告/診断禁止・自然な日本語・placement 監査・危険なら停止。

---

## 0. 目的
banner / marker が「何を根拠にそう見ているか」をユーザーが確認できるように。**信頼性に直結**するので copy と情報量を厳しく制御。生スコア・内部数値は出さず、known/unknown/inferred を**自然な日本語**で。

## 1. ★placement 監査（どこに置くか）
| 候補 | 内容 | 評価 |
|---|---|---|
| **A. day-level banner の「なぜ?」** | banner（DayOutlookBanner）に小さな「なぜ?」toggle → 1 日全体の見通しの根拠を展開 | ✅ **推奨**。evidence は banner が既に持つ `rehearsal.viability.evidence` から取れる（新規 plumbing 不要）。1 disclosure＝情報量を最小制御。layout 安全（banner 直下に additive 行・FeasibilityDisclosureLine 同 pattern） |
| B. marker 行ごとの「なぜ?」 | 詰まり/一息 marker 各行に「なぜ?」disclosure | ⏸ 後回し。marker は現状 Set のみ受領（per-marker evidence 未配線）。複数 marker × disclosure ＝**情報量過多・layout 崩れリスク**。banner「なぜ?」が安定してから |
- **結論: A（banner「なぜ?」）から**。1 日全体の根拠を 1 箇所で・最小情報量・layout 安全。per-marker（B）は別 slice。

## 2. evidence source（既存・新規 plumbing 不要）
- `DayOutlookBanner` は既に `rehearsal: DayRehearsal` を受領。`rehearsal.viability.evidence`(`{basis, known, unknown, inferred}`) + `rehearsal.coverage`(travelUnknown 等) から根拠を導出。
- ★raw な内部文字列（"feasibility insufficient present" 等）を**そのまま出さない**。pure 関数 `explainDayOutlook(rehearsal) → { observed[], inferred[], uncertain[] }` で**自然な日本語カテゴリ**に写像（UI を内部 string から decouple）。

## 3. copy 写像（factor → 自然な日本語・3 カテゴリ）
| カテゴリ | 出典（rehearsal の構造） | 自然な日本語（案） |
|---|---|---|
| **観測（known）** | feasibility に余白/不足の観測あり / 予定が存在 | 「移動の余白」「この予定の並び」 |
| **推定（inferred）** | strain（予定密度・時間帯）が寄与 | 「予定の密度（推定）」 |
| **未確定（unknown）** | coverage.travelUnknown > 0（移動時間が取れない区間） | 「未確定の移動情報」 |
- 出ない要素は表示しない（空カテゴリは省略）。**生スコア・分数・% なし**。

## 4. 情報量 / トーン制御（信頼性の核）
- **1 disclosure・最大 3 行**（観測 / 推定 / 未確定）。data dump にしない。
- 観測フレーム: 「この見通しは、〜から見ています。」（断定でなく観測の提示）。
- **禁止**: 「危険」「診断」「〜です（断定）」「予測」「最適化」・生数字・警告色・成功色。仮説/観測トーンのみ。
- 例: 「この見通しは、移動の余白・この予定の並びから見ています。予定の密度も加味（推定）。一部、移動時間が未確定です。」

## 5. 実装スケッチ（次 GO）
- `lib/plan/dayRehearsal/`: pure `explainDayOutlook(rehearsal) → { observed, inferred, uncertain }`（自然な日本語・unit test）。
- `DayOutlookBanner.tsx`: 「なぜ?」toggle（read-only・useState で開閉）+ 展開時に observed/inferred/uncertain を slate の小行で（FeasibilityDisclosureLine 同階調）。banner 本体（outlook 1 行）は不変。
- CalendarTab: 変更なし（banner が rehearsal から自前で導出）。
- evidence の元は viability.evidence + coverage（既存）。新 store/API なし。

## 6. 制約 / HARD GATE
- read-only・予定変更/repair/optimize なし。banner outlook 行・marker・既存 timeline 非破壊。MapTab/DB/Google/push 不接触。
- **実装中に layout が崩れる / 情報量が多すぎる / 説明が断定的になる場合は実装せず停止して報告**。
- 生スコア/内部数値/警告色を出さない・診断トーンにしない。

## 7. CEO 判断点（実装 GO 前）
1. placement = **banner「なぜ?」toggle**（per-marker は後回し）で良いか。
2. copy = §3/§4 の 3 カテゴリ自然日本語・観測トーン・生数字なし で良いか。
3. `explainDayOutlook` を pure 関数で新設（viability.evidence + coverage → 自然日本語）で良いか。
4. 開閉は toggle（default 閉）で良いか。

## 8. 参照
- code: `app/(culcept)/plan/components/DayOutlookBanner.tsx` / `lib/plan/dayRehearsal/dayRehearsalTypes.ts`（Evidence/Estimate）/ `dayRehearsal.ts`（viability.evidence）
- 前提: `docs/second-self-map-day-rehearsal-wpm2-closeout.md`
