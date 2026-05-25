# Alter Plan P2 Step 2 G3-C — Forced-failure smoke 実施手順

**Status**: 設計確定 (= 実施は CEO 承認後)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: P2 Step 1 + Step 2 の fail-open path を **実環境で機械的に証明** する 5 件 smoke。

## 1. 役割 (= GPT G3 必須項目 3)

GPT 「fallback の live 実証」 を満たすため、 強制的に各 failure path を発火させ:
- UI 不変 (= deterministic 表示維持)
- console error 0
- analytics に正しい reason 記録

を **dev server + Playwright + 一時 patch** で機械検証する。

unit test (= mock runAI) は code 経路を保証するが、 「実 runtime + 実 webpack + 実 Next.js server actions + 実 dev session」 の挙動は別軸の保証。

## 2. 実施 timing

- **Step 2 採用判定 (= G3 通過) のための必須前提**
- 実施 timing: CEO Step 2 採用 GO 後、 Preview canary deploy **前** に実施
- 想定時間: 全 5 件で 30-60 分 (= 各 5-10 分)

## 3. 共通前提

### 3.1 環境設定 (= 各 smoke 前)

```bash
# .env.local に一時追加 (= local-only、 git ignore)
PLAN_ALTER_NOTE_LIVE=true
PLAN_PERSONAL_MODEL_INTEGRATION=true   # Step 2 V2 path 発火のため
```

### 3.2 dev server

```bash
PORT=3010 npm run dev > /tmp/g3c-smoke.log 2>&1 &
```

### 3.3 検証 evidence の取得

各 smoke で:
- dev server log の `[ai/run]` パターン確認 (= grep)
- Playwright screenshot (= UI 不変確認)
- console messages (= error 0 確認)

### 3.4 共通後処理 (= 各 smoke 後 必須)

- 一時 patch / env 変更を **完全 revert** (= 元コードに戻す)
- dev server stop
- screenshot 削除
- `.env.local` から `PLAN_ALTER_NOTE_LIVE` / `PLAN_PERSONAL_MODEL_INTEGRATION` 削除

## 4. Smoke 1: Gemini timeout

### 4.1 期待挙動
- 全 anchor `unavailable (reason: timeout)`
- UI は deterministic 文表示維持
- console error 0
- analytics に taskType: plan_alter_note + timeout error 記録

### 4.2 実施手順

```bash
# 1. Patch: timeoutMs を 1 ms に強制
# lib/plan/llm/alterNoteGenerator.ts の ALTER_NOTE_TIMEOUT_MS = 4000 を 1 に一時変更

# 2. dev server 起動 + List tab open
# Playwright で /plan → リスト tab click

# 3. 観測
# - log: [ai/run] success: false + errorMessage に "timeout" 含む
# - UI: 既存 deterministic alterNote 表示 (= 「スターバックス...で、午後の気分をリセットしましょう」 等)
# - console: error 0

# 4. Revert: ALTER_NOTE_TIMEOUT_MS = 4000 に戻す
```

### 4.3 PASS 基準
- [ ] 全 anchor が deterministic 文で表示
- [ ] dev log に timeout reason 記録
- [ ] UI render error 0

## 5. Smoke 2: OpenAI fallback (= Gemini primary は通る)

### 5.1 期待挙動
- Gemini primary で LLM 経路成功 (= taskType plan_alter_note は failover prefix 含まずだが既存 failover logic 経由)
- OpenAI fallback 不発 (= 未到達)
- UI: V2 LLM 文表示 (= Step 2 経路発火)

### 5.2 実施手順

```bash
# 1. Patch: .env.local の OPENAI_API_KEY を一時無効化
# OPENAI_API_KEY=invalid_key

# 2. dev server restart (= env reload)

# 3. Playwright で /plan → リスト tab open

# 4. 観測
# - log: [ai/run] success: true + provider: gemini (= primary)
# - UI: LLM 由来 alterNote 表示 (= 例 「夕方のカフェ、 学びに静かに沈む時間」)
# - console: error 0
# - OpenAI 関連 error log 不在 (= failover 不発確認)

# 5. Revert: OPENAI_API_KEY を元に戻す
```

### 5.3 PASS 基準
- [ ] Gemini provider で LLM 出力取得
- [ ] OpenAI fallback log 不在
- [ ] UI 正常 render

## 6. Smoke 3: Both API key fail

### 6.1 期待挙動
- Gemini + OpenAI 両 fail
- 全 anchor `unavailable (reason: llm_failure)`
- UI: 全 deterministic 文表示
- console error 0

### 6.2 実施手順

```bash
# 1. Patch: .env.local の両 API key を一時無効化
# GEMINI_API_KEY=invalid_key
# OPENAI_API_KEY=invalid_key

# 2. dev server restart

# 3. Playwright で /plan → リスト tab open

# 4. 観測
# - log: [ai/run] success: false + errorMessage (= auth error 等)
# - UI: 全 anchor deterministic 文表示
# - console error 0

# 5. Revert: 両 API key を元に戻す
```

### 6.3 PASS 基準
- [ ] 全 anchor が deterministic 表示
- [ ] LLM 経由 anchor 0 件
- [ ] UI 機能性維持

## 7. Smoke 4: Validation failed (= 違反語 LLM 出力)

### 7.1 期待挙動
- LLM が違反語入り文を返した場合、 validator V2 が reject
- 該 anchor は `unavailable (reason: validation_failed)`
- UI: deterministic 文に fallback
- analytics に validation_failed reason 記録

### 7.2 実施手順

```bash
# 1. Patch: lib/plan/llm/alterNoteGenerator.ts の generateAlterNote 内で
#    LLM 呼出後の rawText を強制的に違反語含む文に置換 (= mock 違反)
#    例: rawText = "おすすめのカフェタイム、 集中時間" (= 「おすすめ」 violation)

# 2. dev server restart

# 3. Playwright で /plan → リスト tab open

# 4. 観測
# - log: [ai/run] success: true + responseText に違反語含む
# - 内部: validator V2 reject + result.source: "unavailable" + reason: "validation_failed"
# - UI: 該 anchor は deterministic 文表示
# - console error 0

# 5. Revert: 強制置換 patch を削除
```

### 7.3 PASS 基準
- [ ] LLM 出力された違反語が UI に出ない
- [ ] deterministic fallback が動作
- [ ] validation_failed reason が analytics に残る (= 別 phase で実 home_alter_judgment 同パターン)

## 8. Smoke 5: Cost cap (= 21+ anchor で silent degrade)

### 8.1 期待挙動
- 1 day anchor が 21+ 件ある場合、 最初 20 件のみ LLM 経路
- 21+ 件目は `unavailable (reason: cost_cap)` で deterministic fallback
- UI: 前 20 件 LLM 文、 21+ 件目 deterministic 文

### 8.2 実施手順

```bash
# 1. Patch: テスト user に dummy anchor 21+ 件を追加
#    方法 A: Supabase external_anchors table に手動 insert (= migration 不要、 data のみ)
#    方法 B: PlanClient の anchors state に mock 21 件 inject (= temporary)
#
#    推奨: 方法 A を使い、 smoke 後 dummy 削除。 ただし supabase command 経由 = CEO 承認必須。
#    代替: 方法 C: テスト用に PLAN_ALTER_NOTE_MAX_CALLS_PER_VIEW を 2 等の低値に
#    一時下げて、 通常の 5 件 anchor で cost cap 発火させる。

# 2. dev server restart

# 3. Playwright で /plan → リスト tab open + scroll

# 4. 観測
# - log: [ai/run] が 20 回 (or 2 回、 cap 下げた場合) のみ呼ばれる
# - UI: 該当 anchor 以降 deterministic 文表示
# - console error 0

# 5. Revert: 一時 patch / dummy 削除
```

### 8.3 PASS 基準
- [ ] LLM call 数が cap 通り
- [ ] cap 超過 anchor は deterministic 表示
- [ ] UI 正常 render、 popcorn なし

## 9. 全 5 件完了後の総合確認

### 9.1 ファイル状態 verification

```bash
# 全 patch revert 確認
git status
# → clean working tree、 .env.local の追加 env 削除済み
```

### 9.2 unit test 再 run (= regression なし確認)

```bash
npx vitest run tests/unit/plan/ tests/unit/eval/
# → 全 PASS
```

### 9.3 結果 docs

`docs/alter-plan-p2-step2-forced-failure-smoke-results.md` (= 別 file、 smoke 完了後新規) に:
- 5 件の PASS / FAIL
- 各 evidence (= log 抜粋、 screenshot path)
- revert 完了確認

を記録。

## 10. CEO 承認後の実施 GO 条件

GPT G3 必須項目 3 を満たすため、 本 smoke は **Preview canary 着手前** に必須:

- G3-A (= generic detector 監査) 完了 ✓
- G3-B (= judge harness 採点) 完了 ✓
- **G3-C (= 本 smoke) 完了** ← preview canary 前
- 全 G3 PASS → G4 Preview canary gate

## 11. 不変原則 (= 全遵守)

- 各 smoke で一時 patch を完全 revert (= clean state 復元)
- dev server 安全停止
- screenshot 削除
- env 変更 rollback
- DB 操作禁止 (= Smoke 5 は方法 C 推奨で DB 不変)
- production / preview deploy 0
- merge / push 0
- production env 不変

## 12. 想定 工数

- Smoke 1: 5 分 (= patch + dev + Playwright + revert)
- Smoke 2: 5 分
- Smoke 3: 5 分
- Smoke 4: 10 分 (= mock patch 複雑)
- Smoke 5: 10 分 (= cap 下げ patch)
- 総合確認 + docs: 15 分
- **合計**: ~50 分

## 13. CEO 判断 (= 着手前停止)

本 doc commit 後、 CEO 承認で実施 GO:

- **G3-C 実施 timing** (= Step 2 採用判定前 or 後)
- **Smoke 5 cost cap 実施方法** (= 方法 C 推奨、 dummy data 不要)
- **smoke 結果 docs 採用判定**

実施 GO 後、 順次 1〜5 を完了 → 結果 docs 起草 → CEO 確認。
