# P2 Step 3 Phase 6 — Real PM Smoke 結果 + v3.4 prompt 強化

**Status**: **暫定 pass (= 未確定、 50+ データ集まり次第 再分析、 CEO 2026-05-25)**
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Smoke user**: aneurasync@outloo.com (= userId prefix `1c6ef878***`)
**Scope**: Step 3 全体 (= Stage A + B + Phase 5 + v3.4 prompt 強化 + v3.4.1 自然な日本語 + debug cache bypass)。

---

## 0. 結論 (= GPT 解釈 frame 適用)

| Layer | 判定 |
|---|---|
| **Wiring (= 配線)** | **✓ PASS** (= real PM 読み出し + Plan 接続 + framing 格上げ 全 OK) |
| **Personalization quality (= 個別化)** | **✗ FAIL** (= PM ON / OFF で alterNote 大差なし) |
| **「synthetic 限界 vs prompt 弱さ」 切り分け** | **prompt 弱さ濃厚** (= real PM でも generic 寄り、 v3.3 失敗仮説と整合) |

---

## 1. 観測 9 項目 結果

| # | 項目 | 観測値 | 判定 |
|---|---|---|---|
| 1 | real PM 抽出成功 | `observedAxesCount: 39`, `judgmentMode: '集中型'`, `timePreference: '中庸'` | ✓ |
| 2 | Phase gate 正常 | `rawHdmPhase: 0` 維持、 `stableEnabledForPlan: true` (= Plan gate 解放) | ✓ |
| 3 | V2 path 発火 | `path: 'v2'`, `effectiveFramingHint: 'soft_personal_with_hedge'`, `hasStable: true` | ✓ |
| 4 | LLM 出力 「あなたらしさ」 反映 | PM ON 「夜のカフェで、静かに読書する時間」 / PM OFF 「夜カフェで静かに読書を楽しみましょう」 | **✗ (= 文末文体のみ差、 核は同) ** |
| 5 | UI render 正常 | console error 0、 popcorn なし | ✓ |
| 6 | P1/P2 regression なし | PM OFF も既存 V1 path 通常動作 | ✓ |
| 7 | latency 悪化なし | cache hit 多発 (= 同 prompt なので合理的) | ✓ |
| 8 | fallback 維持 | flag OFF (= PM OFF) で完全に V1 baseline 動作 | ✓ |
| 9 | 抽出失敗時 meta-only 落ち | adapter test 26/26 PASS、 production fail-open 動作確認済 | ✓ |

**Wiring 8/9 PASS、 項目 4 (= 個別化) のみ FAIL**

---

## 2. PM ON / OFF 比較 (= GPT 指示の A/B 判定)

| state | alterNote text | 観測日数 |
|---|---|---|
| **PM ON** (= V2 path、 Plan-gate 経由 stable 注入) | 「夜のカフェで、 静かに読書する時間」 | 5 日全て同 |
| **PM OFF** (= V1 path、 baseline) | 「夜カフェで静かに読書を楽しみましょう」 | 6 日全て同 |

### 差分分析

| 観点 | ON | OFF | 評価 |
|---|---|---|---|
| 核となる要素 (= 夜/カフェ/静か/読書) | 全て含む | 全て含む | 同一 |
| 文体 | 観測寄り (= 「時間」 で締め) | 押し付け系 (= 「楽しみましょう」) | ON が contract 通り、 OFF は genericSelfHelpPatterns 境界 |
| 「集中型」 (= profile A) reflection | △ 「静か」 のみ | 「静か」 あり | profile 差なし (= 「静か」 は category reflection 由来) |
| 「中庸時刻偏好」 reflection | なし | なし | 19 時 anchor で偏向押し付けなし → OK だが個別性立たず |
| 日ごと差 | 0 (= 全日同文) | 0 (= 全日同文) | cache 支配、 stable layer のみでは日ごと差なし (= 設計通り) |

### GPT 解釈 frame 照合

> 「ほぼ同じ文」 → stable fields の prompt 反映が弱い → prompt 強化が先

**判定確定**: 今回の比較で **「ほぼ同じ文」**。 「集中型」 「中庸時刻偏好」 の文への具象化が不十分。

---

## 3. CEO 報告必須 4 項目 (= readiness §6.5)

### ① real PM で P3/P4 がどこまで上がったか
**観測不能 (= 1 user / 1 anchor smoke では P3/P4 strict 3.5 判定は無理)**。
ただし文面比較から、 集中型 + 中庸時刻偏好 が **明確には alterNote に表現されていない**。 synthetic harness で 5 user × 50 case を再走すれば数値判定可能だが、 まずは prompt 改善後に再評価が合理的。

### ② P1/P2 regression なしか
**regression なし** ✓
- PM OFF (= V1 path) は既存 Step 1/2 v3.2 と同等動作
- console error / popcorn / latency 悪化なし
- flag OFF 状態は完全互換

### ③ naturalness / personalness / non_pushy 3 軸所感
| 軸 | PM ON | PM OFF | 評価 |
|---|---|---|---|
| naturalness | 良 (= 「時間」 で観測寄り、 自然) | 並 (= 「楽しみましょう」 は genericSelfHelp 境界、 やや押し付け) | ON 優 |
| **personalness** | **弱 (= 集中型らしさ visible しない)** | **弱 (= profile 不在)** | **ON 微優 / 実質同等** |
| non_pushy | 良 (= 「時間」 押し付けなし) | 弱 (= 「ましょう」 押し付け) | ON 明確優 |

**主要発見**: personalness 軸が両方とも弱い。 V2 contract (= 押し付け禁止) は効いているが、 個別化への投影が不十分。

### ④ 実 PM 由来で効いた field
- **judgmentMode (= 集中型)**: prompt に注入されている (= dev log `stableFields.judgmentMode: '集中型'` 確認)、 ただし alterNote 文への寄与は **「静か」 1 語のみ** (= V1 でも出る、 偶然)
- **timePreference (= 中庸)**: prompt に注入されているが、 文への寄与は **観測不能** (= 19 時 anchor で偏向なしは中庸らしいが、 中庸を明示する語彙なし)
- **traitTone (= 未 wire)**: null

**結論**: 注入されているが、 **prompt が profile 情報を 「文の具体的選語」 に変換しきれていない**。

---

## 4. 仮説 確定 (= 「synthetic 限界 vs prompt 弱さ」 切り分け)

### Step 3 開始時の主目的
> synthetic で 2 回試行 (= v3.2 / v3.3) で P4 中庸型 strict 3.5 達成できず。
> real Stargazer 軸データ (= 「中庸の中の個性」 が明確) なら P3/P4 が adoption pass する可能性。
> real PM で達成 → synthetic 限界が主因 (= prompt は正しい)
> real PM でも未達 → prompt 弱さが主因 (= v3.4 必要)

### 結論
**prompt 弱さが主因** (= v3.4 必要)

根拠:
- aneurasync@outloo.com は **39 軸観測** (= 軸データ豊富、 synthetic profile よりも具体的)
- judgmentMode = 集中型、 timePreference = 中庸 が prompt に注入済
- それでも PM OFF baseline と alterNote が **核 95% 同一**
- v3.3 P4 後退仮説 (= 「振り幅 / バランス」 hint が抽象すぎ + 機械的反復) は real PM 環境でも再現

---

## 5. 次の意思決定 — CEO 判断仰ぐ

GPT 指示:
> 3. その場合は prompt 強化か Stage C (`recentRhythm`) のどちらが先か判断

### Option I: prompt 強化 (= v3.4) **先行**
- Plan 専用 stable section の prompt 設計を **「judgmentMode が文の具体的選語に必ず反映」 する** 強制設計に
- 例: 「集中型 + カフェ 予定」 → 「学びに沈む」 「ひとりの没頭」 等を **必須** vocabulary として injection
- 効果: prompt 改善で全 profile に効く、 Stage C より低リスク
- リスク: v3.3 の轍 (= 過剰指示でテンプレ感増加) を踏まないよう慎重設計必要

### Option II: Stage C (= recentRhythm) **先行**
- WIRE_RECENT_RHYTHM = true で lifeEvents + innerWeather → 直近 rhythm 短 tag
- 効果: 日ごと差が出る、 「最近の状態」 で文を変化させられる
- リスク: prompt の根本弱さは未解決 (= rhythm 注入しても核は同じになる懸念)

### Option III: 両方並行
- prompt 強化 + Stage C を別 branch で同時着手
- 効果: 両方の効果を独立に測定可能
- リスク: 1 branch で 2 軸変更 → 何が効いたか切り分け不能 (= v3.3 の轍)

### 私の推奨 (= GPT 指針整合)
**Option I (= prompt 強化 v3.4 先行)**:
- stable injection の prompt 反映が弱いことが今回の主要発見
- recentRhythm を加えても、 同じ prompt 弱さで rhythm も埋もれる懸念
- prompt 強化は外科的 + 全 profile に効く + 1 軸変更で効果切り分け clean

---

## 6. 不変原則 維持 確認

- 既存 Stargazer module 完全 frozen ✓
- DB write 0 ✓
- 既存 frozen file 不触 ✓
- safe degrade 動作 ✓ (= flag OFF で完全 V1 baseline)
- alter plan scope 限定 ✓

---

## 7. v3.4 / v3.4.1 / v3.4.2 経緯 (= CEO + GPT 反復補正)

### v3.4 (= commit `49bcc45b`): prompt 強化 3 patch
- Patch I: judgmentMode → 解釈動詞 vocabulary mapping (= 集中型 → 「深める / 沈む / 没頭」 等)
- Patch II: anchor 事実焼き直し禁止 (= Phase 6 で観測した 「夜カフェで静かに読書」 pattern)
- Patch III: timePreference=中庸 補助化 (= 「主役にしない」)

CEO + GPT 観測: 「集中型 reframe 効果あり、 ただし 「思考」 過剰繰り返し + 「〜時間」 終わり残る」

### v3.4.1 (= commit `914a63ba`): 自然な日本語 micro patch
- Patch 1: 「〜の時間 / 〜する時間 / 〜ための準備」 等 説明的名詞句終わり 原則禁止
- Patch 2: 自然 hedging (= 「〜そうです」 「〜やすそう」 「〜られそう」)
- Patch 3: 同名詞反復禁止 (= 「思考」 過剰繰り返し抑制)
- 既存 few-shot 例を 「〜時間」 から 「〜そうです」 系に書換

### v3.4.2 (= commit `c86ad93b` → revert `81448a3b`): 不採用
- prompt 強化 + temperature 0.7 + dayContext (= 3 変更同時投入)
- CEO + GPT 判定: 「3 変更混ぜで原因切り分け不能」 「raw date を cache breaker に使うのは人工的 variation」 「V1 baseline 汚染」 「temperature 0.7 過激」
- revert 後、 知見 (= cache が悪さしている発見) のみ保持

### debug cache bypass (= commit `2bf0bfd1`): 診断手段
- `PLAN_ALTER_NOTE_CACHE_BYPASS=true` env で 1 ファイル変更
- 既存 `metadata.skipCache` 機構を流用 (= lib/ai/cache.ts:136-138)
- default OFF、 production 影響 0
- smoke で 同 anchor 比較を可能に

---

## 8. 暫定 pass 判定 (= CEO 2026-05-25)

CEO 判断:
> 「とりあえず、ここは pass にしておきます。 しかし、 まだ未確定としてください。
>  50 件以上のデータが集まり次第また分析しましょう。 次に進みましょう。」

### 確定事項
- ✓ Wiring (= 配線): 完全成功 (= real PM 経路、 Plan-gate、 V2 path、 stable injection 全 OK)
- ✓ 「〜の時間」 等 説明的名詞句終わり 抑制 (= v3.4.1 で消去確認)
- ✓ 集中型 reframe 効果 (= 「思考を潜らせる / 深める」 系の解釈動詞が文に visible)
- ✓ regression なし (= V1 baseline 動作不変、 3265/3265 tests PASS)
- ✓ safe degrade 動作 (= flag OFF で完全 V1 baseline)

### 未確定事項 (= 50+ データ集まり次第 再分析)
- ? semantic delta が 多 anchor / 多 user で 安定的に出るか
- ? 「思考」 過剰繰り返しが production scale で 顕在化するか
- ? cache hit 経由の 「同 anchor 同文」 問題が UX として許容範囲か
- ? Stage C (= recentRhythm) が 必要 / 不要 / 後段最適か

### 50+ データ収集計画
- preview canary を経て 一般 user で alterNote 実出力を蓄積
- analytics で 「同 anchor 同文発生率」 + 「semantic delta 多様度」 + 「『思考』 反復率」 を観測
- 50+ output サンプル後、 改めて評価 + Stage C 必要性判断

---

## 9. 不変原則 維持 確認

- 既存 Stargazer module 完全 frozen ✓
- DB write 0 ✓
- 既存 frozen file 不触 ✓
- safe degrade 動作 ✓ (= flag OFF で完全 V1 baseline)
- alter plan scope 限定 ✓
- broad rewrite なし ✓ (= v3.4.2 revert、 v3.4.1 + cache bypass のみ採用)
- cache 設計 frozen ✓ (= lib/ai/cache.ts 不触、 既存 skipCache 機構流用のみ)

---

## 10. 次

CEO 「次に進みましょう」 指示受領。 次のアクションは CEO 判断仰ぐ:

### 候補
- A: branch を local main に merge し、 暫定 pass 状態を固定
- B: preview canary readiness 起草 (= Step 3 完了の自然な続き)
- C: 別の優先 task に着手 (= CEO 別途指定)
- D: 50+ データ収集の analytics 仕組み起草 (= 再分析の準備)

dev server kill 済 (= clean state)。
branch: `feat/alter-plan-p2-llm-step3-v3.4-prompt-fix`、 最新 commit `2bf0bfd1` (= debug cache bypass)。
Step 3 全 series: Stage A `28508617` → Stage B `56a1a6e7` → Phase 5 `19e1cc2e` → Option A' `76cbb492` → v3.4 `49bcc45b` → v3.4.1 `914a63ba` → v3.4.2 revert `81448a3b` → cache bypass `2bf0bfd1`。
