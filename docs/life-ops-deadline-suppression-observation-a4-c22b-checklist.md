# Life Ops — A-4-c22b Deadline Suppression Operator Observation（CEO 実行・done 1 件・cleanup 込み）

> 2026-06-11 / c22 実装の operator 観測。**Claude は UI 不実行**（credential 原則）。c21 と同形・差分は「今回は消えるのが正解」。
> **禁止**: 2 件以上 write・accept/later/dismiss 追加操作・production write・PlanClient・R4・notification・push/PR/merge。

---

## 0. 今回の期待値（c21 との違い）
c22 で deadline completion suppression が入ったため、**done した deadline 候補（例: 確定申告）は rerender 後に全 tier から消えるのが正解**。
他の deadline（免許/パスポート）と cycle 候補は残る。観測点は preview 下部の counts 行
「**実データ反映（fbCad / realCad / 完了済 deadline 抑制）**」= 期待 `1 / 1 / 1`。cleanup 後は候補が**自動的に戻る**（source 不変更の証明）。

## 1. 手順（A→G・repo root）

**A. before counts** — 期待: 全て 0:
```bash
LIFEOPS_FEEDBACK_SMOKE_GO=1 LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_READONLY=true \
LIFEOPS_CADENCE_READONLY=true NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-readonly-smoke.ts
```

**B. dev server（c21 と同じ flags）**:
```bash
REALITY_CANDIDATE_ACTIONS_DEV_HOST=true REALITY_PIPELINE_PREVIEW=true \
LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_READONLY=true LIFEOPS_CADENCE_READONLY=true \
LIFEOPS_FEEDBACK_WRITE=true npm run dev
```

**C. UI**: `http://localhost:3000/plan/dev-reality-pipeline` → STAGING_USER_A でログイン →
preview 下部「実データ反映」= `0 / 0 / 0` を確認 → **守る案の「確定申告」で 完了※ → 確認 → 記録する**（1 回だけ）。

**D. rerender 観測（本番の見どころ）**: refresh して確認 —
1. **確定申告が 守る案/楽な案/攻める案 の全てから消えている**（Moment にも出ない）
2. 免許の更新/パスポートの更新は**残っている**
3. 「実データ反映」= **1 / 1 / 1**
4. 体感メモ: 消え方は自然か／「完了を記録したので控えます」系の説明が欲しいか／（任意）390px で崩れないか

**E. after-write counts** — A 再実行。期待: lifeops=1 / obs=1 / feedbackCadence=1 / realCadence=1。

**F. exact cleanup（二段・c21 と同じ）**:
```bash
LIFEOPS_DOGFOOD_CLEANUP_GO=1 LIFEOPS_DOGFOOD_CLEANUP_ACTION=done \
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-dogfood-cleanup.ts
LIFEOPS_DOGFOOD_CLEANUP_GO=1 LIFEOPS_DOGFOOD_CLEANUP_CONFIRM=1 LIFEOPS_DOGFOOD_CLEANUP_ACTION=done \
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-dogfood-cleanup.ts
```

**G. 復元確認**: preview を refresh → **確定申告が戻っている**+「実データ反映」= 0/0/0 → A 再実行（全て 0）→ server 停止。

## 2. Abort 基準
A≠0 ／ C で counts 行が見えない ／ D で確定申告が**消えない** or 他 deadline まで消える ／ F check≠1 件 → 停止して出力返送。

## 3. 報告テンプレート
```
A before: 全て0
C: 実データ反映=0/0/0 → done on 確定申告
D rerender: 確定申告=消えた / 免許・パスポート=残存 / 実データ反映=1/1/1 / 体感=…/ 390px=…
E after: lifeops=1/obs=1/fbCad=1/realCad=1
F cleanup: check=1件 → delete後 lifeops=0
G restore: 確定申告=戻った / 実データ反映=0/0/0 / smoke 全て0
```
