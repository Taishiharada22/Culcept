# A1-7 — Pace Activation Readiness（opt-in 導線 + readiness + shadow）closeout + dev smoke 観点

> 2026-06-08 / Build Unit / branch `feat/a1-7-pace-activation`。★opt-in 導線(user-facing)の main 着地は **CEO smoke PASS 後**。flag **default OFF**。

---

## 実装した（branch・未 main 着地）
### Part 1 — /plan opt-in 導線（audit + 実装）
- **audit**: MapTab 現在地ボタンは getCurrentPosition で center 移動のみ（markGranted を呼ばない）/ /plan に opt-in 取得導線なし / A1-6b gate は**汎用** location opt-in を読んでいて grant 手段がなく永久 not_asked＝gap 確定。
- **★pace capture 専用 opt-in**（`lib/plan/mobility/paceCaptureOptIn.ts`・別キー `aneurasync.plan.pace-capture-opt-in.v1`）: 「現在地を 1 回」≠「終日 GPS で移動を継続記録」ゆえ汎用同意に便乗させない（informed consent）。read/write/getState/markGranted/markDeclined/reset・fail-open・LocationOptInState 型再利用で A1-6b core gate 無改変。
- **banner**（`components/plan/map/PaceCaptureOptInBanner.tsx`）: 控えめ非 modal「移動の所要時間を記録してペースを学びますか？」+「★位置情報の生データは保存しません（要約のみ）・いつでも止められます」+［許可する］［今はしない］。
- **MapTab 配線**: gate の opt-in を**汎用→pace capture 専用**に切替・banner を `flag ON ∧ not_asked ∧ 記録対象 leg あり` で表示（sensitive/readOnly のみの日は非表示）・grant→markGranted+即 gpsOptIn 反映・decline→markDeclined（可逆）。

### Part 2 — activation readiness（pure）
- `lib/plan/mobility/paceActivationReadiness.ts`: A1-4 PersonalPaceRatio[] → group ごと **not_enough / ready_for_shadow / ready_for_activation** + overall。
- ★**sparse は絶対 activation しない**（ready_for_activation は n≥minForActivation(8)・A1-4 ready=3 は shadow 止まり）。outlier/low-confidence/sensitive は A1-4 段階で除外済（n は品質後 valid 数）。

### Part 3 — shadow validation（pure）
- `lib/plan/mobility/paceShadowValidation.ts`: `validatePaceShadow(input, resolvePace)` = before(反映なし)/after(applyPersonalPaceToRehearsalInput→rehearseDay) を比較。
- 検出: **over-pessimism**（viability 悪化）/ **marker explosion**（convergence 急増）/ **over-change**（leg friction 過剰変化）。anyConcern で赤信号。★実 UI 非表示前提・生数値は dev 内部用。

## ★安全境界（CEO 方針）
- flag **default OFF**＝既存挙動完全不変（OFF で subscribe も banner も sampling もなし）。
- opt-in は **pace capture 専用**（汎用 location 同意の流用なし）・**raw GPS 保存なし明記**・可逆。
- sensitive/readOnly では opt-in 導線を出さない（capturable leg 判定）。
- readiness は sparse で activation しない・shadow は過悲観/explosion/過変化を検出。
- pure layer は DB/network/Date 不使用。**activation はしない**（flag OFF 維持）。

## テスト / tsc / lint
- 新規 **23 tests PASS**（opt-in store 別キー/fail-open/grant/decline/reset・readiness not_enough/shadow/activation+overall sparse 不可・shadow null 不変/friction 増/clamp で over-change せず/閾値極小で検出）。
- mobility 全体 **378 PASS**。tsc footprint **0**（baseline 55）。eslint clean。

## 非実装（停止ゲート）
- **opt-in 導線(user-facing)の main 着地**（CEO smoke PASS 後）。
- **flag activation**（A1-8・dogfood で別判断）。**A1-8 readiness/shadow の dev-report 可視化 + activation smoke の実装**（mini-design のみ）。

## ★dev smoke 観点（CEO 確認用・PASS 後 main 着地）
事前: 一時的に `DAY_REHEARSAL_GPS_CAPTURE_ENABLED=true`（dev のみ）。
1. /plan 地図（記録対象 leg がある日）で **opt-in banner**「移動の所要時間を記録して…」が画面下に出る（控えめ・非 modal）。
2. **［許可する］→ banner 消える + pace capture opt-in が granted**（`window.__a16bSmoke?.gate.optInState==="granted"` ※seam は A1-6b smoke 限定で本 branch には無いので、`localStorage["aneurasync.plan.pace-capture-opt-in.v1"]` で確認可）。以降 permission granted なら sampling 起動。
3. **［今はしない］→ banner 消える + declined**（再表示されない）。
4. **過去(readOnly)のみ / sensitive のみの日 → banner が出ない**。
5. **flag OFF（既定）→ banner も sampling も出ない・地図/カレンダー既存挙動不変**。
6. （A1-6b 連動）granted + permission + 到着 → 到着確認 prompt（A1-6b で検証済）。

## 次フェーズ（design only・別 doc）
`…-a1-8-activation-smoke-dogfood-mini-design.md`（readiness/shadow の dev-report 可視化 → dogfood activation smoke → canary → broad・各段 kill switch）。**activation はまだしない**。
