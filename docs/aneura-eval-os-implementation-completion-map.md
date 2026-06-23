# 評価OS / 複合融合エンジン — 実装完成マップ（コードベース完了の定義）

作成: 2026-06-23 / 監査: 7エージェント read-only（grounded・file:line）
branch: `claude/candidate-lens-on-a9eedce69-20260623`（base `a9eedce69` 含む）

> CEO 方針: 「コードベースで実装を全て終わらせる（実機smokeなし・最終統合後に確認）。残りは production 統合以降のものだけか？」
> 答え: **No。production-DB ゲート(③)だけでなく、DB 不要で今すぐ作れる pure/flag-OFF 実装(②)が残っている。② を全量作り切って初めて「コードベース完了」。**

---

## ① 完了済み（flag-OFF・production 不触・localStorage shadow only）

Stage 0→4-A2 + ergonomics。全て `POST_VISIT_CHECK_ENABLED=false` / `FIT_ARC_READOUT_ENABLED=false` const + `NODE_ENV==='production'` hard block（env 点火は dev のみ）。
- Stage 0 観測器官（observation/elicitation/store/mirror/metrics）
- Stage 1 Fit-Arc readout（3状態・件数チップ）
- Stage 3-B/C Calendar 観測生成導線（one-per-day guard・past_plan trigger）
- Stage 4-A 文脈型 contextSnapshot（coarse/redacted）
- Stage 4-A2 dogfood inspection（pure summary + dev panel + dev route）
- Stage 4-A3b env 点火 ergonomics

## ② これからコードベースで実装可能（flag-OFF / pure / DB 不要）★「全て終わらせる」の対象

| # | 項目 | 何を | 規模 | 制約（誇張回避） |
|---|---|---|---|---|
| ②-1 | **Stage 4-B 文脈条件付き readout** | `buildContextFitReadout(obs, condition)`＝buildFitArcReadout を condition で filter | 小 | 有効軸は live populate される gap/companion/timeOfDay/dayType/locationCategory のみ。weather/fatigue/mobilityLoad は signal 未配線で永久 insufficient。**UI は dormant(shadow)固定** |
| ②-2 | shadow 融合集計（階層ベイズ） | state 残差化→共役 Q_p・I_{u,p}=0 凍結 の shadow 計算器 | 中 | 順位変更は ③。shadow ログまで |
| ②-3 | shadow pairwise Match Ledger | 比較観測→勝敗→better(A,B) 較正（Bradley-Terry/Elo pure） | 中 | 順位/比較表反映は ③ |
| ②-4 | persona prior 推定（ε 段階昇格） | dead path の ε tiebreaker を on-device prior へ昇格・observed>inferred 強制 | 中〜大（MOAT 中核） | 未訪問店 fit の実 ranking 反映は ③・co-equal 化は棄却 |
| ②-5 | retention 計測仕上げ | 観測の鏡(実装済) + 初期コホート単一指標確定 | 小 | — |
| ②-6 | cross-domain 一方向契約 + gap test | surface→core read-only 型契約・矛盾検出で転移遮断 | 小〜中 | 実転移は内部正本化(③) |
| ②-7 | honesty firewall 機械化 | 未確認=null・出典タグ必須・検索ヒット≠設備実在 を型/pure で強制 | 小 | retrieval source 変更(Text→Nearby)は ③(external-api) |

**★②の本質**: 測定器官 + shadow 集計まで。**「候補順を変えるエンジン」は ③（D6 NO-GO）に設計線として分離**。②全量実装でも順位は変わらない（欠陥でなく意図）。

## ③ production / DB / consent ゲート（CEO GO 必須・コードベースでは到達不能）

ranking 反映(P5-d 4段ゲート) / DB 永続化 migration(実 I_{u,state,p}+mood) / consent gate+delete cascade / staging re-link / /api/me・MCP / crowd・Local Intel / rater calibration(r≥3) / hidden gems / retrieval source 変更。

---

## 実装順（②）

1. ②-5 retention 計測仕上げ（小・①の仕上げ）
2. **②-1 Stage 4-B context-conditioned readout**（小・素地揃い・gap×companion で今すぐ意味）
3. ②-7 honesty firewall 機械化（小・ranking 点火の hard 前提）
4. ②-6 cross-domain 一方向契約 + gap test（小〜中・negative transfer 防御）
5. ②-2 shadow 融合集計（中）
6. ②-3 shadow Match Ledger（中）
7. ②-4 persona prior 推定（中〜大・MOAT 最深部・最後）

## false-aliveness 封じ込め（不変）

②-1〜②-4 は **shadow/dormant（計算のみ・UI 非配線 or flag-OFF）**。観測ゼロで空アークを光らせない。今すぐ UI で光らせてよいのは ②-5 観測の鏡（<3件は沈黙・仮説トーン・件数同伴で構造的に false-aliveness 回避済み）のみ。
