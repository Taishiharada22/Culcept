# 評価OS ③ — S1+S2 canary runbook（READOUTS 表示 + OBSERVE 観測）

base: `922d437f2`(local main) / branch: `claude/eval-os-phase3-on-922d437f2-20260628`
作成: 2026-06-28 / 監査: read-only 3エージェント + 自己検証（file:line grounded）

> 目的: 評価OS の felt-value ループ（post-visit 答え合わせ → Fit-Arc → 自己理解）を **localStorage だけ**で本番に出し、retention 主指標（post-decision-observation rate）を測る。**DB/API/LLM/外部API/課金ゼロ・即 rollback。**

## 依存分類（この canary の安全性）
| 項目 | S1 READOUTS | S2 OBSERVE |
|---|---|---|
| DB/Supabase | ❌ | ❌ |
| API route | ❌ | ❌ |
| 永続 write | ❌ | localStorage のみ（redacted・opaque key・ring 200） |
| LLM | ❌ | ❌ |
| 外部 API | ❌ | ❌ |
| ranking（主候補順） | ❌ 不変 | ❌ 不変 |
| ③比較表 行順（P3-c apply） | ❌ | ❌（**decouple 済**・下記 pre-req） |

## Pre-req（コード側・完了済み）
- **P3-c apply を OBSERVE master から decouple**（commit `c39342de7`）。これ以前は OBSERVE 本番解放が P3-c apply（③比較表の行順 reorder）まで開いていた（設計意図違反）。修正後は OBSERVE は **記録(P3-b)だけ**開く。
- ★**この commit が deploy されるビルドに入っていること**が canary の絶対前提（apply 結合のまま OBSERVE を ON にしない）。

## Activation（CEO / ops・env + redeploy）
本番 env に設定して **redeploy**（`NEXT_PUBLIC_*` は build-time inline ゆえ再ビルド必須）:
```
NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD=true   # S1: Fit-Arc / reason / lens overlay 表示
NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD=true    # S2: post-visit 答え合わせ + preference を localStorage 記録
```
※ 超保守 crawl なら S1 のみ先行（OBSERVE は OFF のまま）も可。ただし観測ゼロ＝Fit-Arc は永久 insufficient。

## 解放されるもの / されないもの
- **見える/動く**: Fit-Arc readout、post-visit 1-tap 答え合わせ UI、reason チップ（既存 mobility 由来）、candidate lens overlay。観測は localStorage（key `aneurasync.postvisit.v1` / `aneurasync.candidateLens.prefObs.v1`・PII redacted・場所は opaque hash）。
- **変わらない**: 主候補リスト順、③比較表の行順（apply は decouple 済で OFF）。
- **OFF のまま（この canary 外）**: P3-c apply / Google Places enrich(`PLACE_DETAILS_ENRICH_PROD_ALLOWED`) / DB 永続化 / consent gate / `/api/me` / MCP / crowd・Local Intel。

## Rollback（即時）
- 上記2 env を **unset → redeploy**。表示・記録とも本番から消える（未設定＝現本番と完全同一・退化なし）。
- localStorage データは client 限定・redacted・ring 200 で自然減衰。サーバ/DB には何も残らない。

## Runtime smoke チェックリスト（CEO ブラウザ / staging — authed 本番 smoke は Claude 不可）
1. /plan の予定追加・場所候補で Fit-Arc / reason / lens overlay が表示される。
2. DevTools Console: エラーゼロ。
3. DevTools Network: 評価OS 由来の **新規 DB/Supabase/API 呼出がゼロ**（既存通信のみ）。
4. 経過予定で 1-tap 答え合わせ → localStorage `aneurasync.postvisit.v1` に redacted 観測が入る（場所名/住所/GPS なし）。
5. 主候補リスト順・③比較表行順が **答え合わせ前後で不変**。
6. env を unset → redeploy で surface が消える（rollback 確認）。

## 観測する指標
- **post-decision-observation rate**（答え合わせを実際に行う率）＝ retention 仮説の主指標。`postVisitMetrics.ts` が pure 集計。
