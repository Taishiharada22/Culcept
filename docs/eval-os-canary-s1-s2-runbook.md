# 評価OS ③ — S1+S2 safety baseline runbook（READOUTS 表示 + OBSERVE 観測・runtime opt-in scope guard）

base: `922d437f2`(local main = production baseline) / branch: `integration/eval-os-safety-baseline-20260628`
作成: 2026-06-28 更新: 2026-06-28（scope guard 追加）/ 監査: read-only 3エージェント + 自己検証（file:line grounded）

> 目的: env true（既に production 設定済）でも、**opt-in した browser だけ**に評価OS の felt-value ループ（post-visit 答え合わせ → Fit-Arc → 自己理解）を出す。**全ユーザー rollout を防ぐ**。DB/API/LLM/外部/課金ゼロ・即 rollback・P3-c apply は閉じる。

## このベースラインが満たす safety 5点
1. `OBSERVE=true` でも **P3-c apply が開かない**（decouple `c39342de7`）。
2. `READOUTS=true` / `OBSERVE=true` でも、**runtime opt-in を通らない browser には表示・観測しない**（scope guard `8a04f0049`）。
3. env true が **全 production ユーザー rollout にならない**（opt-in した browser のみ）。
4. **DB / API / LLM / 外部API / production write を入れない**（localStorage のみ）。
5. **rollback 可能**（opt-out / localStorage 削除 / env false+redeploy）。

## 依存分類（不変）
| 項目 | S1 READOUTS | S2 OBSERVE |
|---|---|---|
| DB/Supabase | ❌ | ❌ |
| API route | ❌ | ❌ |
| 永続 write | ❌ | localStorage のみ（redacted・opaque key・ring 200） |
| LLM | ❌ | ❌ |
| 外部 API | ❌ | ❌ |
| ranking（主候補順） | ❌ | ❌ |
| ③比較表 行順（P3-c apply） | ❌（decouple） | ❌（decouple） |
| runtime scope | opt-in browser のみ | opt-in browser のみ |

## opt-in / opt-out 機構（client-only・localStorage・no DB/API）
- **opt-in**: `/plan?evalOsCanary=1` を開く → mount effect が localStorage `aneurasync.evalOsCanary.optIn=1` を永続。
- **opt-out**: `/plan?evalOsCanary=0`（or localStorage の当該 key 削除）→ 即 OFF。
- gate `isAneuraReadoutProdEnabled()/isAneuraObserveProdEnabled()` = `env true ∧ isAneuraCanaryOptedIn()`。非 opt-in は false。
- SSR / 非ブラウザ / localStorage 不在 = false（fail-closed）。

## Activation（CEO / ops）
env は **既に設定済み**（`NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD=true` / `…_OBSERVE_PROD=true`）。
→ **この safety baseline を含む build を deploy** すれば、env true でも opt-in browser のみに限定される。
※ deploy 前提: この branch（decouple + scope guard）が deploy 対象に入っていること。**入っていない build を env true のまま出すと P3-c apply が開き・全ユーザーに出る**（現状の risk）。

## Rollback
- per-user: `?evalOsCanary=0` or localStorage 削除。
- 全体: env を false/unset → **redeploy**（NEXT_PUBLIC は build 時 inline ゆえ unset 単独では不十分）。

## production deploy 前 smoke 観点（CEO ブラウザ / staging — authed 本番 smoke は Claude 不可）
1. **opt-in なし（通常アクセス）**: 評価OS は **何も表示されない / localStorage 観測されない**（DevTools Application → localStorage に `aneurasync.postvisit.v1` 等が増えない）。
2. **opt-in あり（`?evalOsCanary=1`）**: S1/S2 だけ出る（Fit-Arc / 答え合わせ UI / reason / lens overlay）。localStorage `aneurasync.evalOsCanary.optIn=1` が入る。
3. **P3-c apply は閉じている**: opt-in 後に lens preference を貯めても ③比較表の行順が変わらない。
4. **主候補順・比較表行順が変わらない**（答え合わせ前後で不変）。
5. **DB/API/LLM/外部API 呼び出しゼロ**（DevTools Network に評価OS 由来の新規通信なし）。
6. **rollback 可能**: `?evalOsCanary=0` で surface 消滅 / env false+redeploy で全消滅 / localStorage 削除で per-user OFF。
7. **Console**: opt-in 済 browser で render-time gate（FitArcReadout）に hydration notice が出ても recoverable（no-users canary 許容・hardening は follow-up）。

## 観測する指標
- **post-decision-observation rate**（答え合わせを実際に行う率・opt-in cohort 内）＝ retention 仮説の主指標。`postVisitMetrics.ts` が pure 集計。

## 既知の hardening follow-up（今回スコープ外）
- render-time gate の hydration 完全一致（cookie or searchParams 透過で SSR 一致）。
- account allowlist（internal user のみ自動 opt-in）が要るなら追加。
