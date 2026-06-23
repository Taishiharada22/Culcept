# 評価OS / 複合融合エンジン — コードベース完了境界（②完了・③ gate 固定）

確定: 2026-06-23 / branch: `claude/candidate-lens-on-a9eedce69-20260623`（base `a9eedce69` 含む・safety fix `dc31f58fb` 反映済）
方針: CEO「コードベースで実装を全て終わらせる（実機smokeなし・最終統合後に確認）」

> **判定: ② コードベース実装は完了。** 残りは全て ③（production / DB / consent / ranking / API ゲート）で、CEO GO 必須・コードベースでは到達不能。

---

## ① 完了済み（Stage 0→4-A2 + ergonomics・flag-OFF・production 不触）

観測器官 / Fit-Arc readout / Calendar 観測生成導線（one-per-day・past_plan）/ 文脈型 contextSnapshot / dogfood inspection / env 点火 ergonomics。
全て `POST_VISIT_CHECK_ENABLED=false` / `FIT_ARC_READOUT_ENABLED=false` + `NODE_ENV==='production'` hard block（env 点火は dev のみ）・localStorage shadow only。

## ② コードベースで完了した pure / shadow 実装（今回）

| # | module | 役割 | 状態 |
|---|---|---|---|
| ②-1 | `contextFitReadout.ts` | 文脈条件付き Fit readout（gap×companion 等で適合を読む） | pure・shadow・UI 非配線 |
| ②-2 | `shadowFusion.ts` | 階層ベイズ partial pooling（B_u/Q_p/I_{u,p}凍結・過信防止） | pure・shadow・順位非反映 |
| ②-3 | `matchLedger.ts` | pairwise Match Ledger（同条件の相対比較・de Langhe 57%天井回避） | pure・shadow・leader=confidence依存 |
| ②-4 | `personaPrior.ts` | 判断傾向推定（bounded ±ε・base 逆転しない・dormant 軸は永久 insufficient） | pure・shadow |
| ②-5 | `retentionReadiness.ts` | 観測量/品質の統合 readiness（学習に進めるか判定） | pure・UI 非配線 |
| ②-6 | `crossDomainContract.ts` | 一方向契約（判断原理のみ転移・具体選好は漏らさない）+ gap test | pure・negative transfer 防御 |
| ②-7 | `honestyFirewall.ts` | ③前 preflight guard（件数なしスコア/insufficient/context欠落/raw PII 検出） | pure |

**共通不変条件（全 ②）**: pure / 決定論 / **DB・API・外部・consent 不触** / **UI 非配線** / **ranking・recommendation・winner・highlight 非反映** / false-aliveness なし（薄い観測は insufficient/null）/ PII 非保存（opaque key + coarse bucket のみ）。

## ② でまだ ranking が変わらない理由（設計線・欠陥でない）

- ② は **測定器官 + shadow 集計**まで。「候補順を実際に変える」は **③ の ranking 反映（D6 NO-GO）に設計線で分離**。
- shadow（②-2/3/4）の出力は **どの component / route からも import されておらず**（順位ロジック `candidateLensResolver`/`placeAffinity` に未配線）、順位を1pxも変えない。
- これは entanglement 封じ込め原則: **仮説（lens）と検証（観測）は疎結合で閉ループにするが、観測信号を順位に効かせるのは honesty gate 通過後**。② はそのゲート手前まで。

## ③ production / DB / ranking / consent / API に残るもの（CEO GO 必須）

| 項目 | gate | 内容 |
|---|---|---|
| **ranking 反映** | ranking-reflection | shadow 信号（Q_p/persona/Match Ledger）を候補順に effect。`honestyFirewall.preflightHonesty` を hard 前提に・explanation→shadow→clamp gate→CEO 承認の4段。default OFF + prod hard block + maxRankShift>2 自動 OFF |
| **DB 永続化** | db-migration | 実 I_{u,state,p} + mood 軸の migration + RLS + 書込 route。現状 localStorage shadow only（Supabase 参照ゼロ） |
| **consent gate + delete cascade** | consent-privacy | DB 永続化時の観測前 consent gate + 全 stargazer_* の ON DELETE CASCADE |
| **staging re-link** | staging-relink | CLI が production link 中 → staging re-link + backup 二重確認（誤 push 事故源） |
| **/api/me・MCP preference provider** | api-route / external-api | 外向き公開・thin MCP server（対外公開/API 発行＝CEO 承認） |
| **crowd / Local Intel** | crowd-multiuser | device 跨ぎ集約・匿名群衆較正（consent DB 前提） |
| **rater calibration tower** | crowd-multiuser | MFRM/Dawid-Skene/BTS は r≥3 必須（招待制 r=1 では定義不能・凍結 backlog） |
| **retrieval source 変更** | external-api | Text Search→Nearby Search（Google Places 契約変更） |

## ③ に進むための CEO gate

1. **privacy 前提を先に解消**（consent gate + delete cascade + staging re-link）— DB 系の前提。
2. **ranking 反映は4段ゲート**: ① explanation 必須 → ② shadow calibration（②-7 preflight が pass）→ ③ clamp gate（maxRankShift≤2）→ ④ CEO 承認。
3. DB migration / API / MCP / crowd は各々 CEO 承認案件（本番デプロイ・外部連携・対外公開）。

## flags / production hard block / rollback

- **flags**: `POST_VISIT_CHECK_ENABLED` / `FIT_ARC_READOUT_ENABLED`（default false・env `NEXT_PUBLIC_ANEURASYNC_*_DOGFOOD=1` で dev のみ点火・production は env でも必ず false）。
- **② shadow module は flag すら不要**（pure helper・どこからも未配線＝呼ばれない＝dormant）。
- **rollback**: ② は純追加（既存挙動不変・参照ゼロ）→ commit revert で完全除去可。DB/migration/env なし＝undo 対象なし。production 未到達。

---

**結論**: 評価OS / 複合融合エンジンの **コードベース実装（①+②）は完了**。観測器官・Fit-Arc・文脈条件付け・階層ベイズ shadow 融合・Match Ledger・persona prior・retention 計測・cross-domain 契約・honesty firewall まで全て pure/shadow/flag-OFF で landing。**順位を変える/永続化する/外部に出す = ③ は production 統合の CEO GO 待ち。**
