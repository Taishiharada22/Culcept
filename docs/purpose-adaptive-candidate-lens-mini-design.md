# Purpose-Adaptive Candidate Lens（目的適応型 候補比較レンズ）— mini-design + Phase 1 着地

> 2026-06-15 / Build Unit / CEO 構想。予定追加時の場所候補を「目的に応じて見せる情報が変わる」体験へ。
> ★Phase 1 = pure 基盤のみ（resolver + 根拠付き属性 + 嗜好 interface）。store/DB/学習/UI/外部 API/捏造なし。

## 0. 思想（CEO 2026-06-15）
**「全候補に同じ情報」でなく「このユーザーが今この候補を選ぶために必要な情報だけ」を見せる。**
→ 比較項目を**固定せず、目的レンズで行が変わる**。そして**捏造しない** — 各属性に「根拠の種類」を持たせ、確からしさで見せ方を変える。

## 1. 4 層アーキテクチャ
| 層 | 役割 | Phase |
|---|---|---|
| ① Purpose Lens | 予定 → 目的（会議前/集中作業/会話/立ち寄り/一般） | **P1 ✅** |
| ② Evidence-Typed Attribute | 各属性に根拠タイプ（A事実/B計算/C弱推定/D未確認） | **P1 ✅** |
| ③ Lens Resolver（★本丸） | 目的×嗜好×データ で**比較行が変わる** pure resolver | **P1 ✅** |
| ④ User Preference Memory | ユーザー別の優先軸を学習し行順を変える | interface のみ P1・**実装は P3+ 別 GO** |

## 2. 根拠タイプ（捏造しないための核）
- **A `fact` 確定事実**: name / address / category(Google 分類)
- **B `computed` Aneurasync 計算**: 徒歩概算（haversine 直線×1.3 補正「約・目安」）/ 予定接続 / 余白への影響 / 相性理由（既存 Place Affinity）
- **C `weak` 弱推定**: ★P1 では **emit しない**（根拠の弱い「静か/会話/雰囲気」は出さない）
- **D `unconfirmed` 未確認**: wifi/power/quiet/crowd/hours/photo → **value=null（捏造しない）**・既定で隠す / showUnconfirmed=true で「未確認」行

## 3. 本丸 resolver（着地済）
`lib/plan/candidateLens/`:
- `purposeLens.ts`: `classifyPurposeLens({activityKey, title})` → 5 lens（既存 `classifyActivityIconKey` + title keyword）。
- `placeAttributeModel.ts`: `buildPlaceAttributes(candidate, ctx)` → 根拠付き属性束。**持っていないデータは null**。
- `candidateLensResolver.ts`: `LENS_AXES`(目的別の軸順) + `buildLensComparison` → 比較行（行ごと evidenceType・優位ハイライト・推薦）。
  ★**優位ハイライト＆推薦は「表示値が異なる軸のみ」**（見えない score 微差で主張しない＝直線距離の過剰精度回避）。推薦は勝った軸 basis から導く・甲乙つけがたければ null（沈黙）。
- `userPlacePreference.ts`: `UserPlacePreference` 型 + `applyPreferenceToAxes`（future input・**store なし**・fake data test）。

## 4. 生成サンプル（実データ風 fixture・honesty 確認済）
左=ブルーボトル(300m,履歴あり) / 右=TRUNK(900m,履歴なし) / gap60分:
```
【会議前】 徒歩◀優位:約5分|約15分 〜 予定接続:余裕|余裕 〜 余白:残しやすい|残しやすい 〜 相性:履歴あり|— 〜 種別:カフェ|カフェ 〜 住所:江東|渋谷
   推薦: ブルーボトル / 徒歩の点で合いそうです
【集中作業】 徒歩◀優位 〜 静かさ:—|— 〜 Wi-Fi:—|— 〜 電源:—|— 〜 相性:履歴あり|— 〜 種別:カフェ
【会話】 徒歩◀優位 〜 余白:残しやすい|残しやすい 〜 会話のしやすさ:—|— 〜 相性 〜 種別
```
★lens で行が変わる・未確認は「—」で捏造ゼロ・同文言は優位にしない（徒歩のみ実差）。

## 5. 検証
15 tests PASS・eslint clean・tsc footprint 0（baseline 55）。pure・store/DB/学習/UI/外部 API なし・未配線。

## 6. 次（CEO GO 待ち）
- **Phase 2（UI）**: 3 画面（①1枚ずつ＋スクロール → ②詳細＋「なぜここを選ぶ？」→ ③目的適応比較表・優位薄紫＋👍・右列スワイプ・強調再タップで確定→①）を画像忠実に再構成。**新 flag default OFF/dev**・既存パネル不変・production hard block。tests → dev smoke。
- **Phase 3（学習配線）**: 確定時に preference を**観測のみ**で記録（local・sufficient-gate・捏造なし）→ resolver に供給。別 GO。
- 写真/営業時間 = 将来の外部 API（Places Details/Photo）拡張。

## ★stop gate
UI 表示 / 実 preference 保存・学習 / DB / 外部 API / production / 捏造（wifi/電源/静か/雰囲気/営業/写真）。
