# 引き継ぎ: 評価OS safety baseline → 統合セッション

from: 予定追加 / 評価OS セッション / 2026-06-28
branch: `integration/eval-os-safety-baseline-20260628` @ `7fa27702f`（= `claude/eval-os-phase3-on-922d437f2-20260628` と同 tip・production baseline `922d437f2` 起点）

> 役割分担（CEO 確定）: 各担当セッションは **local commit / 監査 / 設計 / smoke 設計**まで。**build / production / deploy は統合セッションが実施**。

---

## 1. この branch の中身（local 完了・build/prod 未実施）
production baseline `922d437f2` から分岐し、評価OS の **production 安全化**を2点 + docs で実装。全て pure/flag/localStorage、**DB/API/LLM/外部/migration ゼロ**。tsc 55(baseline)・関連 1381 test PASS・eslint clean。

| commit | 内容 |
|---|---|
| `c39342de7` | **P3-c decouple**: OBSERVE master(localStorage 観測)から apply gate を切り離し。`OBSERVE=true` でも P3-c apply(③比較表行順 reorder)は開かない |
| `8a04f0049` | **S1/S2 runtime opt-in scope guard**: 両 master を `env true ∧ isAneuraCanaryOptedIn()` に。非 opt-in browser には表示も観測もしない |
| `63b32a66a`/`7fa27702f` | runbook + smoke 観点 doc |

新規/変更ファイル: `lib/plan/aneuraCanaryOptIn.ts`(新) / `lib/plan/aneuraReadoutGate.ts` / `app/(culcept)/plan/PlanClient.tsx`(mount effect 1つ) / 上記 test 2本 / docs。

## 2. なぜ必要か（既知 risk）
production には既に `NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD=true` / `…_OBSERVE_PROD=true` が**設定済み**。だが現 deploy build（`922d437f2` 系）は **decouple も scope guard も持たない**。
→ ユーザーがいれば env true が ①P3-c apply を開き ②S1/S2 を全ユーザーに出す。**現状 no-users ゆえ実害なし**だが、**次の production build には必ずこの safety baseline を入れる**必要がある。

## 3. 統合セッションがやること（build/production = 統合担当）
1. `integration/eval-os-safety-baseline-20260628`(`7fa27702f`) を **main 統合線に取り込む**（次の production build の前に）。他セッションの frozen commit と一緒に再統合 → main → production のフロー内で。
2. **build**（env は production に設定済 = build 時に inline 焼き込み・`NEXT_PUBLIC_*` ゆえ **再 build 必須**）。
3. **deploy**（本番 `plodugvgmdkusifdrdfz` 系）。結果: env true でも **P3-c 閉・opt-in browser のみ**。
4. **production smoke**（runbook 準拠）: 通常アクセス→何も出ない / `?evalOsCanary=1`→S1/S2 のみ / P3-c 閉 / 主候補順・比較表行順 不変 / DB-API-LLM-外部ゼロ / `?evalOsCanary=0`・env false+redeploy で rollback。

## 4. 「build が必要になる条件」
評価OS の **production surface（S1/S2 表示・観測）を本番で有効化/変更する時**は必ず build が要る（`NEXT_PUBLIC_*` と client gate が build 時 inline のため）。
- 具体: env=true を**安全化**する（decouple + scope guard を効かせる）には、safety baseline を deploy build に含めて **再 build** が必要。
- それまでは env 据え置きで可（no-users）。

## 5. この（評価OS）セッションが local で続けられること（build/prod 不要）
- 評価OS の追加 pure/shadow/flag ロジック（②系の続き）・監査・設計・**smoke 設計（logic/unit test）**を、production baseline 起点の branch で local commit。
- 例: hydration hardening（render-time gate FitArcReadout の SSR 一致＝cookie/searchParams 透過）/ account allowlist（internal 自動 opt-in）/ ③以降の shadow→ranking gate 設計。
- **build / deploy / production env 変更 / main・production push はしない**。完了 branch を統合セッションへ渡す。

## 6. rollback（万一）
env false/unset + redeploy（全体）/ `?evalOsCanary=0`・localStorage 削除（per-user）/ Vercel previous deployment。

---
**要約**: local 実装 + 監査 + smoke 設計は完了（この branch）。**build と production deploy は統合セッションへ委譲**。次 production build には本 safety baseline を必ず同梱。
