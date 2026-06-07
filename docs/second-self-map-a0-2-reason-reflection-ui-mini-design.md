# A0-2 — reason reflection UI mini-design（gentle reflection・実装は次 CEO 判断）

> 2026-06-08 / Build Unit / 魂（移動が自己理解になる）の可視化スライス。A0-1 pure layer（`mobilityReasonInsight`）の上に乗る。
> ★本書は mini-design のみ。**実装は次の CEO 判断**（user-facing + copy が beyond-human の核 → smoke + copy review gate）。

---

## 1. 狙い（beyond-human の核）
A0-1 が `ReasonInsight`（per-leg・dominantReason/dominantMode・strength）を出せる。これを **穏やかに本人へ映す**＝「鏡」。
ただし **断定でなく気づき**。人間の秘書が「この道、景色のために歩かれること多いですよね」とそっと言う感覚。**ここの copy/UX が品質の全て**（数字でも警告でもない）。

## 2. どこに・いつ出すか
- **場所**: `MobilityLegCard`（leg を開いた時）内・既存 hypothesis/recall 行の近く・**1 行**。
- **条件（厳格）**: `buildReasonInsightForLeg(store, legKey)` が **`status:"insight"` の時だけ**。`not_enough_signal` / null は **無表示（沈黙）**。readOnly / sensitive は無表示（excludeLegKeys + 既存 redaction）。
- **read-only**: 表示のみ（実行 UI なし・予定変更なし）。
- **頻度**: 押し付けない。leg を開いた時に静かに 1 行。dismiss 可（A0 reason chips と同階調）。

## 3. copy 戦略（★最重要・要 CEO review）
- **per-leg 文脈に閉じる**（「この区間では」）。**trait/人格にしない**（「あなたは〜な人」禁止）。
- **強語禁止**（「よく」「いつも」「必ず」）。観測トーンの控えめな hedge（「〜が続いているようです」「〜を選ばれることが重なっています」）。
- **生数値なし**（"3 回" 等を出さない）。strength で hedge を微調整:
  - emerging（3-4・majority）: 「この区間では、◯◯のときに △△ を選ばれているようです」（弱め）
  - established（≥5・share≥0.67）: 「この区間では、◯◯のために △△ を選ばれることが続いています」（やや確信・ただし断定しない）
  - ◯◯ = reason ラベル（景色/急ぎ 等）・△△ = mode ラベル（徒歩/車 等）。
- ★copy は pure helper（`reasonReflectionLine(insight): string`）で生成し test で禁止語/生数値/人格語を機械保証（A0/Day Rehearsal の copy pattern と同様）。

## 4. データの現実（正直）
reason は explicitCorrection 時のみ + 仮説 surface 前提ゆえ **sparse**。よって reflection は **履歴が溜まった一部 leg でのみ・暫く後に**出る（cold-start は沈黙＝設計通り）。初期は「ほぼ出ない」のが正常。これは魂の性質（蓄積で立ち上がる）。

## 5. ethos / HARD constraints（実装時）
- insight status のみ・not_enough は沈黙 / 仮説トーン・強語/生数値/人格語なし / read-only・実行 UI なし / per-leg・trait なし / sensitive/readOnly 無表示 / belief を上書きしない（表示のみ）/ Alter/Stargazer/DB なし。

## 6. test 計画（実装時）
- pure `reasonReflectionLine`: emerging/established で文生成・禁止語(よく/いつも/あなたは/タイプ/性格)・生数値なし・hedge あり。
- render contract: insight 時のみ表示 / not_enough・null は無表示 / readOnly 無表示 / 1 行・modal でない / dismiss。
- tsc footprint 0・plan suite 回帰なし。

## 7. smoke（実装後・CEO）
履歴が無いと自然には出ないため、A0 と同様 **一時 smoke-force**（insight を仮注入）で表示・copy・トーンを在地確認 → CEO copy review → revert → main。

## 8. CEO 判断点（次スライス GO 時）
1. copy トーン（emerging/established の 2 文・hedge の強さ・reason×mode の語順）。
2. emerging から出すか、**established のみ**にするか（より保守的＝established のみが安全か）。
3. 表示場所（hypothesis 行の近く / カード下部 / A0 chips と統合）。
4. dismiss 後の再表示ポリシー。

→ GO 後: pure `reasonReflectionLine` + MobilityLegCard 配線 + test → 一時 smoke-force で copy review → main。
