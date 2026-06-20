# A0 — 理由観測（local reason capture）closeout

> 2026-06-08 / Build Unit / CEO GO + smoke PASS
> roadmap v2.1 Phase A0（★SOUL の起動点・S6/L2 の一部・master-design Wave 1）。mini-design: `…-a0-reason-capture-mini-design.md`。

---

## 1. 何を実装したか
「移動が自己理解になる」（堀②・鏡）の **第一歩＝理由観測**。推奨と違う mode を選んだ「なぜ」を **local に捕捉**。
- **store**（`hypothesisFeedbackStore.ts`・additive・後方互換）:
  - `MobilityReason = tired/scenery/cheap/hurry/mood/other`（疲れ/景色/安い/急ぎ/気分/その他）+ `MOBILITY_REASONS`（順序）+ `MOBILITY_REASON_LABELS` + `isMobilityReason`。**free text なし（"other" も chip）**。
  - `HypothesisFeedbackEntry.reason?` を additive 追加。`withReason` / `setFeedbackReason`（entry 不在 leg は no-op）/ `saveHypothesisFeedbackReason`。parse は valid reason 保持・invalid drop・**旧 entry 後方互換**。
- **UI**（`MobilityLegCard.tsx`）: `reasonPromptVisible && !readOnly` のとき mode ボタン下に inline chip 行「なぜ変えた？ + 6 chips + ✕」。任意・可逆（別 chip で変更）・dismissible・**modal でない**。
- **配線**（`MapTab.tsx`）: `handleLegSelectWithFeedback` が **explicitCorrection（仮説と違う選択）時のみ** `reasonPromptLegKey` を立てる。chip 押下 → `saveHypothesisFeedbackReason`。leg 切替/close で clear。

## 2. 何を実装していないか（★scope 厳守）
- **Alter 接続**（reason を Alter が返す）= 未（後続 slice）。
- **Stargazer 合流**（mobility→trait 軸・自己発見/M5）= 未（production gated）。
- **belief 学習への反映**（reason 別の精度調整）= 未（A0 では belief を動かさない）。
- **DB 永続化** = 未（localStorage のみ）。
- **reason の local 集約/可視化**（reason→insight）= 未（次バッチ候補）。
- A0 は **reason を local に捕捉・保存・表示（畳み）するだけ**。

## 3. 検証
- store unit **R1-R8**（語彙 6/順序・validator・withReason 可逆・setFeedbackReason entry 不在 no-op・null 解除・後方互換・valid 保持/invalid drop）。
- render contract **A0-1〜7**（explicitCorrection 時のみ表示・false 非表示・**readOnly 非表示**・active 反転・**free text なし**・dismiss/非 modal・**人格ラベルなし**）。
- **plan suite 5131 PASS**・**tsc footprint 0（total 55）**・main worktree で再確認（zero-loss）。

## 4. production / DB / env / GitHub 不接触確認
- localStorage のみ・DB write なし・network なし・env 変更なし・Alter/Stargazer/Reality 不接触・production/Vercel/GitHub/push/PR なし。pure helper は Date 不使用。

## 5. HARD GATE（CEO 指定）全 PASS
| gate | 対応 |
|---|---|
| reason UI が重い/押し付け | inline 1 行・任意・可逆・dismissible・modal でない |
| explicitCorrection 以外で出る | buildFeedbackEntry の kind === explicitCorrection のみ（A0-1/3/配線） |
| sensitive leg に出る | 仮説非表示（surfacedMode null）→ correction 不成立 → 出ない（gate 継承） |
| localStorage 既存 entry を壊す | 後方互換（R7-R8・旧 entry 有効・invalid reason は entry を壊さず drop） |
| reason が仮説文に即反映され人格診断っぽく | reason は belief/仮説文に反映しない（A0 scope 外）・per-leg 文脈のみ・trait なし（A0-7） |

## 6. smoke（CEO PASS・2026-06-08）
一時 smoke-force（surfacedMode 強制・未 commit）で履歴なし env でも chips を出して確認 → 電車以外選択で chips 表示・active/可逆/dismiss・人格ラベルなし → CEO PASS。**smoke-force は revert 済（main 非接触）**。

## 7. 着地・ブランチ
- main 着地: **`759a983b`**（zero-conflict=271+/13-・c62c3a04 と一致）。
- code branch: `claude/dr-a0-reason`（HEAD `c62c3a04`・保持）。

## 8. 次の計画
soul の次の安全な local 一手は **reason → local insight（pure・集約）**。ただし inert 在庫化を避け、価値ある形で。詳細は本報告の「次に進む計画」+ roadmap で提示。UI 化（gentle reflection）は smoke + copy review gate。
