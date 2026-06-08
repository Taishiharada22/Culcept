# A1-14 — One-day Dogfood Activation 手順（次フェーズ mini-design・★design only）

> 2026-06-08 / Build Unit / A1-13 の後続。**設計のみ・実装に進まない / 実 flag ON しない**（CEO 指示）。
> 前提（実装済・全 flag OFF）: capture→ratio→adapter→opt-in→readiness→shadow→report→per-group gating→dogfood runbook→calibration readiness→safety journal。

---

## 0. ★前提を疑う
- safety journal（A1-13）で「複数日 stable_safe か」を見られるようになった。次は **実際に 1 日だけ flag を ON にして実診断に反映してみる**手順（dogfood の最小実行）。
- ★これは **実 flag ON ＝ stop gate**。本書は手順設計のみ。実行は CEO 判断。

## 1. A1-14 で設計する範囲（実装しない）
### 1-1. どの flag を一時 ON にするか（本人 dev のみ）
- **`DAY_REHEARSAL_PACE_SHADOW_ENABLED=true`**（先に・shadow report と safety journal を見るため）。
- 数日 shadow を観測し `assessDogfoodStability` が **stable_safe** かつ A1-11 dogfood readiness が **ready_for_dogfood** を確認。
- それを満たして初めて **`DAY_REHEARSAL_PERSONAL_PACE_ENABLED=true`**（実診断反映）を **本人 dev で 1 日だけ**。
- ★production は `isPersonalPaceReflectionEnabled` の非 production 条件で常に block（手順でも production には入れない）。

### 1-2. OFF/ON 比較の確認方法
- ON 前: shadow report で OFF/ON 差分（viability before→after・4 懸念）を確認。
- ON 後: 実 rehearsal が ready_for_activation 区間だけ soft 反映（A1-10 per-group）。実 viability/marker を毎日確認。
- ★raw 数値は見ない（level/badge/件数のみ）。

### 1-3. safety journal で何を見るか
- 日次: `anyConcern`（過悲観/marker爆発/診断悪化/過剰変化）/ `dogfoodOverall` / `activationCandidatePresent`。
- 複数日: `stability` が unstable に転じたら即 OFF。

### 1-4. 即 OFF rollback（kill switch）
- 違和感・過悲観・stability=unstable のいずれかで **`DAY_REHEARSAL_PERSONAL_PACE_ENABLED=false`**（実反映即停止・diff 0）。必要なら `DAY_REHEARSAL_PACE_SHADOW_ENABLED=false`。
- per-group ゆえ問題区間は自然に外れる。手動ログ/capture は flag 非依存で生存。

## 2. ★activation 後も calibration 値はいじらない
固定値は 1 日 ON 中も変更しない（calibration は十分データ + held-out 後の別 GO・overfit 回避）。過悲観なら calibration でなく **flag OFF で撤退**。

## 3. canary / broad はまだ別判断
1 日 dogfood で問題なし → 数日 → canary（production block 解除＝別設計）→ broad。各段 CEO 判断・kill switch 維持。本書は **1 日 dogfood の手順まで**。

## 4. stop gate（A1-14 実行/実装時に必ず止まる）
- 実 flag ON を main に入れる / production に入れる / calibration 値を触る / sparse から activation する / raw 数値・GPS 座標を UI に出す / canary・broad に進む。

## 5. 今回やらないこと（design only・遵守）
A1-14 の**実行**（flag ON / 実 dogfood activation）に進まない。実 flag ON しない。calibration 値を変更しない。canary/broad・production block 解除に進まない。DB/migration/production/Vercel/GitHub/push/PR/external API なし。
