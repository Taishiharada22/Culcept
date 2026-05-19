<!--
=====================================================================
CoAlter AOO Canary Smoke PR Template (Phase D-0 §9 + D-1 機械化)

使用方法: PR 起票時の URL に `?template=canary-smoke.md` を付ける。
  例: https://github.com/Taishiharada22/Culcept/compare/main...<branch>?template=canary-smoke.md

対象: canary smoke 関連 PR (Phase D 以降の全 canary smoke / re-smoke / smoke 結果 docs)
非対象: 通常の機能 PR、非 canary docs PR、Phase 設計 docs PR
=====================================================================
-->

## Summary

<!-- 本 smoke の目的、対象 phase、期待結果を 1-3 文 -->

## Canary Smoke Pre-flight Checklist (Phase D-0 §9 必須)

### 必読 docs
- [ ] `docs/coalter-aoo-canary-deploy-anti-patterns.md` 全 section 読了
- [ ] `docs/coalter-aoo-phase-d0-canary-deploy-route-design.md` 全 section 読了
- [ ] 前 Phase 完了 docs §3 系 (重要発見・訂正) 全項目読了

### Smoke layer 明示宣言 (Phase D-0 §10、3 分類のいずれか — **必ず 1 つ**選択)
- [ ] **L1 Mount smoke** (MirrorHost mount + useMirrorEngine 起動 のみ、production-equivalent context 不要)
- [ ] **L2 Mirror visible smoke** (MirrorVisibleSurface 実機表示、forced canary mock injection 経由、production-equivalent context ではない)
- [ ] **L3 CoAlter chat smoke** (production-equivalent: login → /talk → 既存 thread → CoAlter button → activate → Mirror visible)

### Expected / Forbidden env 値 (Phase D-0 §5.4 + D-3-α canon)

> 📜 **Ref source-of-truth canon (D-3-α 以降)**: `docs/coalter-supabase-ref-canon.md` (§1 machine-readable JSON block) が正本。本 template の下記値が drift したら `tests/unit/coalter/supabaseRefCanon.test.ts` で fail する。Ref を変更する PR は canon §4 protocol に従って同 PR で全参照先を同期する。

- [ ] **expected Supabase ref**: `aljavfujeqcwnqryjmhl` (Aneurasync Production Supabase)
- [ ] **forbidden Supabase ref**: `hjcrvndumgiovyfdacwc` (Alter staging — Mirror canary では絶対 NG)
- [ ] branch-scoped env が必要な場合は **§4.3 git-attributed deploy 経路** を使う (`vercel --force` は **L1 Mount smoke のみ** 許容)

### Deploy 経路宣言 (Phase D-0 §4)
- [ ] **Option α**: `.ts/.tsx` 最小 trigger commit (Phase A §3.4 学び、現状の確実な唯一手段)
- [ ] **Option β**: `.canary-trigger.json` (Phase D-2 で実装後の選択肢、本 PR が D-2 でなければ未選択)
- [ ] **Option γ**: Vercel UI canary-only allowlist branch (fallback)
- [ ] `vercel --force` (**L1 Mount smoke only** を明示宣言する場合のみ)

### Pre-flight verification (Phase D-1 機械化、`scripts/coalter/verify-canary-deploy.ts` を実行)
- [ ] Gate 1: URL canonical-ness 確認 (`culcept-<8-char-hash>-...`、user alias / git branch alias は禁止)
- [ ] Gate 2: deploy meta git attribution 確認 (`source: github` + `gitSource.ref` + `meta.githubCommitRef` が **対象 canary branch**)
- [ ] Gate 3: HTML bundle Supabase ref 確認 (expected あり、forbidden なし)

実行コマンド (smoke 開始**前**に必ず実行):
```bash
npx tsx scripts/coalter/verify-canary-deploy.ts \
  --deployment-url=<canonical-url> \
  --deployment-id=<dpl_xxx> \
  --expected-branch=chore/coalter-mirror-c<N>-canary \
  --expected-supabase=aljavfujeqcwnqryjmhl \
  --forbidden-supabase=hjcrvndumgiovyfdacwc
```

- [ ] 上記 script を実行し、exit code **0** (3 gates 全 PASS) を確認した

### Env 投入計画 (CEO 手動、branch-scoped Preview only)
- [ ] env 投入先 scope: **branch-scoped Preview only** (Production / 全 Preview / Development には**絶対投入禁止**)
- [ ] 投入する env 一覧と各 scope:
  - (記述)
- [ ] 投入後の scope 二重確認 command を pre-defined

### Cleanup 計画 (Phase D-0 §8)
- [ ] smoke 終了後の env 削除 command を pre-defined (literal)
- [ ] canary branch + worktree cleanup 手順記述
- [ ] Production env / all-Preview Alter env / Development env / SUPABASE server env が**不変**を post-cleanup で確認する旨記述
- [ ] Alter 別作業 (all-preview Supabase / PLAN_ROUTE_LIVE 等) への**影響なし**を Phase D-5 で CEO judgment する旨記述

### Rollback trigger (`docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` §9 を踏襲)
下記が観測されたら即 env 削除 + smoke 中止:
- [ ] PII leak 1 件以上
- [ ] raw text が diagnostic に混入
- [ ] Production env / 全 Preview env に流出
- [ ] Question / Proposal / Suggestion に見える UI
- [ ] 命令形 / 共感演技 text
- [ ] console error 重大
- [ ] sleep / cap 不発
- [ ] presence / chat UI 破壊
- [ ] false positive 連発 (5 件以上)
- [ ] Mirror 関連の outbound fetch / DB / Sentry event

## Phase Gate

<!-- 本 PR が属する phase / sub-phase を明示 -->

| Phase | 内容 | 状態 |
|---|---|---|
| (記述) | (記述) | (記述) |

## Out of Scope

<!-- 本 PR で扱わない / 別 phase へ持ち越す事項を明示 -->

---

🤖 Generated with [Claude Code](https://claude.com/claude-code) (canary-smoke.md template)
