# A1-4 personal pace ratio — closeout + A1-5 / A1-6 mini-design

> 2026-06-08 / Build Unit / autonomous batch（CEO 承認 (a)）。A1-4 実装 + tests + A1-5/A1-6 mini-design。

---

## A1-4 closeout（実装・main 着地予定）

### 実装した
- **A1-4 personal pace ratio（pure）**（`lib/plan/mobility/personalPaceRatio.ts`）:
  `buildPersonalPaceRatios(observations, config?)` = `PaceObservation[]`（MovementEvent の actualDurationMin + route estimate + mode + od/leg を caller が join）→ (od/leg×mode) ごとに集約。
  - status: **ready**（valid ≥ 3）/ **not_enough_signal**（complete はあるが valid < 3）/ **unknown**（complete 0＝estimate or actual 欠落）。
  - 出力: `medianRatio`(internal・A1-5 用) / `tendency`(tends_longer/as_estimated/shorter) / `strength`(emerging/established) / `n`。
  - `findPersonalPaceRatio(results, {odKey?, legKey?, mode})`・`median()` も export。

### ★前提を疑った核心設計（誠実性）
detector の actualDuration は **geofence(150m)→geofence(150m)** 間時間、estimate は **door-to-door**。
→ actual は真の移動時間より**系統的に短く**出る（両端で半径分取りこぼし・バイアス ≈ 2×半径/速度）。
素朴な ratio は偽の「速い」を量産する。対策（実装済）:
1. **短い leg（estimate < 5分）は ratio 除外**（バイアス支配）。
2. **非対称閾値**: `tends_shorter` は ratio ≤ **0.70**（系統低バイアスを跨ぐまで「速い」と言わない）/ `tends_longer` は ≥ 1.15。
3. **median**（外れ値耐性）+ outlier 除外([0.25,4]) + low-confidence 除外。

### 安全境界（CEO 仕様遵守）
観測少 → personal pace 扱いしない（not_enough/unknown 明示）/ mode・leg・od **混線なし**（group key 分離）/ sensitive 除外（防御的二重化）/ raw GPS 不使用（derived 分のみ）/ **人格化しない**（per-(od/leg)×mode の傾向）/ medianRatio は internal（UI に raw 出さない）。

### テスト / tsc
- 新規 **25 tests PASS**（readiness / 非対称 tendency / outlier・low-conf・短leg・sensitive・unknown mode 除外 / mode・od 混線なし / find / median）。
- tsc footprint **0**（baseline 維持）。

### 非実装（停止ゲート/次）
- A1-5 adapter の **実装・rehearsal 配線**（behavior change）→ 次バッチ（flag gated）。
- A1-6 capture（GPS sampling / 確認 UI）→ 後述（GPS 自動は smoke/仕様判断ゲート）。
- 現状 A1-4 は **caller 不在で inert**（観測 0）。A1-6 capture か手動ログで初めて立ち上がる。

---

## A1-5 mini-design — Day Rehearsal 反映（safe adapter・設計のみ）

### 方針（CEO: 上書きしない / soft multiplier / confidence gate / fallback / UI なし）
pure adapter（次バッチで実装）:
```
applyPersonalPaceToEstimate(estimateMin, paceResult | null, config) →
  { adjustedMin, applied, reason }
```
- **fallback**: paceResult == null || status !== "ready" → estimate を**そのまま返す**（applied=false）。＝insufficient は既存 full-path 維持。
- **soft multiplier + damping**: rawMult = medianRatio。dampedMult = 1 + (rawMult − 1) × damping。
  damping は strength で可変（established 0.6 / emerging 0.35＝emerging は弱く効かす）。
- **clamp**: dampedMult を **[0.85, 1.25]** に制限（絶対に激変させない）。adjustedMin = round(estimate × dampedMult)。
- **confidence gate**: 適用は status==="ready"（≥3 観測）のみ。それ未満は不適用。

### 配線（次バッチ・flag gated）
- rehearseDay の per-leg estimate を `applyPersonalPaceToEstimate` で包む。
  paceResult = `findPersonalPaceRatio(buildPersonalPaceRatios(observations), {odKey, legKey, mode})`。
  observations = MovementEventStore × route estimate を caller が join。
- ★behavior change ゆえ **flag（default off）+ tests** で着地。flag off では rehearsal は現状不変。
- UI 表示はまだしない（adapter は viability/strain 計算に効くだけ）。

---

## A1-6 mini-design — 実 capture（GPS sampling + 確認/訂正 UI）

### ★最重要の設計分離（前提を疑った結果）
**capture 機構と pace パイプラインは独立**。A1-4/A1-5 は観測が GPS 由来か手動かを問わない。
→ capture は 2 段に分けるのが simplest かつ安全:

#### A1-6a（手動ログ・**smoke 低リスク**・GPS 不要）
- 過去 leg に「実際の出発・到着を記録」フォーム（時刻入力）→ `recordMovementEvent`(source="manual", confidence="high", gate)。
- GPS・geofence・実機移動 smoke 不要（ただの form・基本 smoke のみ）。
- これで store に実データが入り、A1-4→A1-5 が**実際に立ち上がる**（GPS を待たずパイプライン検証可）。

#### A1-6b（GPS 自動捕捉・**smoke/仕様判断ゲート**）
- sampling: opt-in 許可時、MapTab foreground 時に getCurrentPosition を **in-memory buffer**（raw 座標・**永続しない**）へ。`evaluateCurrentLocation`(accuracy/age) で gate。**background GPS なし**。
- detect: leg の from/to coords で `detectMovement(buffer, {from,to})` → arrival 検出(medium+) で確認 prompt。
- 確認: 「この区間、到着していそうです。記録しますか？」[記録][ちがう] → 記録時 `buildMovementEventFromDetection`→`recordMovementEvent`。sensitive leg は prompt しない/記録しない。

### ★A1-6b を自律で進めない判断（honest・CEO 質問への回答）
**A1-6b（live GPS）はそのまま進めるべきでない**。理由:
1. **実機 smoke 必須**: geofence 検出・sampling trigger・確認タイミングは実機で動かないと検証不能。私は実機 GPS smoke を実行できない（CEO 停止ゲート「smoke が必要な UI」）。
2. **仕様判断**: いつ prompt するか・文言・手動訂正フロー・focus/interval sampling の電池/UX トレードオフ＝product 判断（停止ゲート「仕様判断が必要」）。
3. **device 挙動変更**: 定期 getCurrentPosition は実機の電池/権限挙動を変える＝CEO 明示承認が筋。
4. **現状の歩留まり低**: foreground 疎 sample では両端 bracket がまれ→多くが low/null。先に UI を作るのは早計。
→ よって A1-6b は **mini-design を出してここで停止**し、CEO の UX/仕様判断 + 実機 smoke 計画を待つ。

### 推奨する次の安全増分（smoke なしで価値が出る順）
1. **A1-5 adapter 実装 + flagged rehearsal 配線 + tests**（UI/GPS なし・behavior は flag off で不変）。パイプラインを end-to-end で確定。
2. **A1-6a 手動ログ UI**（GPS 不要・基本 smoke のみ）。実データで A1-4→A1-5 を起動。
3. **A1-6b GPS 自動捕捉**（CEO UX/仕様判断 + 実機 smoke 後）。

### 禁止遵守（A1-6 全体）
raw GPS 永続なし（buffer は in-memory のみ）/ background GPS なし / 距離→時間捏造なし / DB・migration なし / production・GitHub・push・PR なし / external API 追加なし / sensitive 記録なし。
