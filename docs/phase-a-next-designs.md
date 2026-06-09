# Phase A 後の次設計（mini-design のみ・★実装しない・CEO 判断材料）

> 2026-06-09 / Build Unit。Phase A closeout（`docs/phase-a-closeout.md`）を受けた次の一手 3 候補。
> ★本 doc は設計のみ。実装・配線・flag 変更は一切しない（CEO 指示）。

---

## 候補 1: A3 Day Rehearsal soft connection design
**何か**: A3（inverse/comparison）の結果を Day Rehearsal の**表示文脈**にもう一段近づける（本流反映はしない）。
- **soft = copy 接続のみ**: ①repair candidate の protect/use_recovery 候補の下に、その候補に対応する inverse「守る意味」1 行を添える（既存 simulationLineByKind と同型の `inverseLineByKind` map・leave_earlier の what-if v0 と並ぶ対称形）。②「なぜ?」disclosure 内に comparison の 2 行を移す案（banner 直下より控えめ・閉じてれば見えない）。
- ★**不変条件**: scoring/marker/repair candidate **生成**には不接続（copy のみ）。viability/strain の数値判定に影響ゼロ。数字/断定なし・沈黙原則維持。
- **判断点（CEO）**: (a) banner 直下（現状）vs 「なぜ?」内 vs repair 候補の下、どこが最適か（出すぎ vs 文脈密着のトレードオフ）。(b) inverse の対象選定（現状=最初の protect_matters 1 件）を repair 候補連動にするか。
- **規模**: 小（map 構築 + 表示移設・pure 層は不変）。リスク低。

## 候補 2: Phase B readiness gate / data requirement design
**何か**: Phase B（cross-day/早期警告）を**いつ・何が揃えば**解凍できるかの明文化（実装しない・gate 定義のみ）。
- **データ要件（Recovery Pattern audit より）**: lag-1 には **連続観測日ペア ≥13（≈14 観測日）**・各日 4+ 観測。tired corroboration には A0 reason 蓄積。現状 ~1 観測日 → 不足。
- **gate 案（3 条件のいずれか）**: (a) **data gate** = MobilityObservation が 14+ 日に達した時（PRG Readiness Console に「B 解凍可」signal を足せば operator が一目で分かる・pure 増分）。(b) **DB gate** = CEO が bounded 過去 anchor read（read-only `listAnchors` 履歴参照）を承認した時（per-day density 履歴が取れ lag-1 が一気に强くなる）。(c) **capture gate** = 軽量 per-day summary の local 永続（新規データ保存=要 CEO・60日 cap・category のみ）。
- **推奨**: まず (a) data gate を PRG Readiness Console に組み込む設計（既存 evaluator の自然な拡張・pure）→ 蓄積が見えたら (b)/(c) を CEO 判断。
- **規模**: gate 定義は小。リスク低（読み取りのみ）。

## 候補 3: Dogfood operation plan
**何か**: 稼働中の 8 dogfood flag（A2/Place/MT/ER/PRG Console/A3×2）を**どう運用・検証・卒業させるか**の運用計画。
- **観測ルーチン**: CEO の日常使用で (a) 沈黙が破られた時の文言違和感、(b) 出すぎ（同時行数）、(c) 誤った傾向の指摘、を見たらメモ → セッションで報告。能動チェックは **/ceo の PRG 観測ステータス**を週 1 で見る程度（accumulating→dogfooding への遷移が蓄積の進捗指標）。
- **卒業条件（軸ごと）**: Place ranking=safety journal stable_safe（≥10 entries・懸念 0）→ ranking ON 判断。MT/ER=ready 到達後に文言の実データ妥当性を確認 → 継続 or 調整。A3=差が出る日の頻度と違和感を観察。pace=opt-in + 蓄積後に shadow→activation ladder（既設）。
- **rollback**: 全 flag `=false` 1 行（既設・各 closeout に記載）。
- **増分候補（pure 可・実装は別途）**: per-axis stability journal（MT/ER に Place 型 journal を足し activation_candidate 到達可能に）・pace collector（PRG Console の personal_pace を実 readiness に接続）。
- **規模**: 運用は文書のみ。増分は小〜中。

## 推奨順
**3（運用計画の確定）→ 2-(a)（B data gate を Console に・pure）→ 1（A3 soft connection）**。
理由: 今の最大の資産は「8 flag が貯め始めた実データ」。まず運用を確定し（コスト 0）、蓄積の見える化（2-a）で B 解凍時期を客観化し、A3 soft connection は dogfood で A3 行の出方を見てから配置を決める方が手戻りがない。

## ★stop gate（全候補共通・実装時）
Day Rehearsal 本流反映 / scoring・marker・candidate 生成への接続 / DB・Supabase read / 新規データ保存 / production / external API / Life Ops。

## 次
CEO 判断（候補 1/2/3 のどれをどの順で実装するか）。実装はそれまで停止。
