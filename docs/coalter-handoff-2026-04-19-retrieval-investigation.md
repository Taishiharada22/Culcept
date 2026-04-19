# CoAlter movie retrieval 0 件問題 — 引き継ぎ (2026-04-19)

このドキュメントは、本チャットで解決しきれなかった CoAlter の「movie テーマなのに提案候補が
0 件で出続ける」問題を、別チャットに引き継ぐための全量記録。漏れなく読めば context 無しで
次の担当が続行できることを目的とする。

---

## 0. TL;DR (最低限これだけ読めば次の判断に入れる)

- **起きている現象**: preview 本カウント中、CoAlter を movie 文脈で起動しても
  `[CoAlter] movie.diagnostics` が 全列 0 または rankedCount=0 で戻る。ユーザーには
  「質問だけして候補ゼロ」のカードが見える。
- **切り分け log から判明した 2 系統の原因 (別問題)**:
  1. **Pattern A (全列 0)** — `decideSearch` が `NO_SEARCH_PATTERNS` (「気分」「感情」
     「仲」等の感情語) にマッチして `shouldSearch=false` を返し、検索自体が発火していない。
     にも関わらず theme=movie で `movieOrchestrator` は動いてしまい、質問だけ返す。
  2. **Pattern B (catalog>0 / ranked=0)** — 検索は 8 件返るが、Phase A.5 の
     `missing_where` hard filter が catalog 6 件中 5 件を `theater=null` で drop。
     rank に残らない。A 枝 audit の **A2 (NEAR_WINDOW / theater 抽出)** 領域。
- **A1 (listicle negatives) は主犯ではなかった**。rawResultsCount=9 は listicle
  溢れの数字ではない。A1 は別ブランチに保留、投入しない。
- **CEO 決定 (本チャット最終発言)**: 「感情があってこその人間。感情を読まずに最高の提案は
  作れない。NO_SEARCH_PATTERNS を単純に外す修正案は稚拙」。**Claude の naive fix は却下**。
  根本設計から考え直すべき問題であり、本チャットでは解決させない。
- **preview は停止しない**。30 件 / 3 日の gate は継続。現在 baseline は `f5f88e09` に
  **観測ログのみ** の commit `3e211325` が積まれた状態 (behavior 非変更)。

---

## 1. 本チャット開始時点の状況 (原初の計画)

### 1.1 前チャットから引き継いだ CEO 指示 4 本
1. **preview 本カウント開始 GO**
   - 開始日時を記録 / baseline commit = `f5f88e09` を固定
   - 10 件到達で軽い途中観測 (KPI-1 / KPI-6 / KPI-7 / AUX-1)
   - 30 件 or 3 日経過の早い方で `scripts/coalter-phase2-kpis.sql` 全 KPI 再実行
   - A 枝 (retrieval 修正候補) は並行で進めてよいが preview を止めない
2. **A1 実装 GO (条件付き)**
   - `feat/coalter-movie-retrieval` ブランチで article-listing negatives 実装
   - unit test / smoke 通過までで merge/deploy はしない
   - 10 件途中観測で投入判断
3. **「LLM は稼働しているか？」という CEO 質問** (server log を見せつつ)
   - server log: `[ai/run] cache hit` 連発 + `[CoAlter] movie.diagnostics` 4 回連続全列 0
4. **「A (切り分けログ先行)」採択**
   - A1 を preview に入れる前に、診断ログで 0 件の内訳を取る
   - 5-10 セッション再現で真因確定 → A1 投入可否を再判定

### 1.2 引き継ぎ時点で既に完了していたこと (前チャット納品物)
- debug ログ除去済み / movie misread sanity PASS / A 枝 audit 納品済み
- Phase 2 3-mode dispatch + theme continuity + question guard + loop guard (baseline `f5f88e09`)
- Phase A.5 missing_where hard filter 実装済み
- Phase A.6 P0 theater-bearing query 再設計 済み
- movieOrchestrator に `[CoAlter] movie.diagnostics` 基本列出力済み

---

## 2. 本チャットで実施した変更 (時系列・漏れなし)

### 2.1 preview 開始記録 (feat/coalter-movie-retrieval ブランチ側)
**commit `42cbc344`** (A1 ブランチ側 docs)
- `docs/coalter-phase2-preview-scenarios.md` に preview start block 追記
  > preview counting started at **2026-04-19 21:16 JST**, baseline commit = `f5f88e09`
- `docs/decision-log.md` に「2026-04-19 CoAlter Phase 2 preview 本カウント開始」エントリ追加
- `docs/research/coalter-movie-retrieval-audit.md` に §6 優先順位付け / §7 wave-2 tracking 追記

### 2.2 A1 実装 (feat/coalter-movie-retrieval ブランチ / 未 merge)
**commit `22113ed1`**
- `lib/coalter/webConnector.ts` movie switch case
  ```ts
  const areaPrefix = locationPart.trim() ? `${locationPart.trim()} ` : "";
  const articleListingNegatives = "-まとめ -特集 -ランキング -おすすめ10選";
  // q1/q2/q3 全てに articleListingNegatives を末尾 join
  ```
- `tests/unit/coalter/webConnectorMovieQueries.test.ts` に 6 テスト追加
  - `webConnector: movie queries apply article-listing negatives (P0+ A1)` describe
  - NEGATIVE_TOKENS = `["-まとめ", "-特集", "-ランキング", "-おすすめ10選"]`
  - location=null / location あり / P0 invariant / area prefix invariant /
    mentioned candidate / Filmarks+ranking 排他 (hasRankingPositive = `/(?<!-)ランキング/` regex)
- **669/669 coalter tests PASS**
- **baseline へは一切 merge していない**。CEO 判断待ちのまま凍結。

### 2.3 診断ログ追加 (feat/baseline-edit = preview baseline 側)
**commit `3e211325`** (behavior 非変更 / preview 継続中)
- `lib/coalter/webConnector.ts` `searchAndFilter` 内に 3 段階可視化ログ
  ```ts
  const diag = {
    shouldSearch, queriesCount, queriesSample,  // decideSearch 結果
    rawResultsCount,                             // executeSearch 返り値
    candidatesCount,                             // 最終 SearchCandidate[]
  };
  console.info("[CoAlter] webConnector.retrieval", diag);
  ```
  - 早期 return 分岐 (`!shouldSearch || queries.length===0`) でも emit
  - `rawResults.length===0` 分岐でも emit
  - 成功分岐でも emit (3 箇所から emit される設計)
- `lib/coalter/movieOrchestrator.ts` diagnostics に `searchCandidatesCount: input.searchCandidates.length` 追加
  - diagnostics 型定義 (L72) にも `searchCandidatesCount: number` を追加
  - `[CoAlter] movie.diagnostics` の JSON に混ぜて emit
- **669/669 coalter tests PASS**、coalter 以外に TS 型エラー増加なし

### 2.4 preview 環境への反映
- commit `3e211325` は `feat/baseline-edit` HEAD。preview はこのブランチで回っている想定。
- 診断ログは behavior 非変更 → baseline の gate (30件 / 3日) はリセット不要。

---

## 3. 現在地点 (2026-04-19 最終スナップショット)

### 3.1 Git 状態
| branch | HEAD | 内容 |
|---|---|---|
| `feat/baseline-edit` | `3e211325` | preview 稼働ブランチ。baseline `f5f88e09` + 診断ログ 1 コミット |
| `feat/coalter-movie-retrieval` | `42cbc344` | A1 実装 + docs。baseline に対して 2 コミット先行 (merge 禁止) |

### 3.2 preview counter
- **開始**: 2026-04-19 21:16 JST
- **baseline commit**: `f5f88e09`
- **mid-checkpoint**: card 付き新規 invoked sessions 10 件 → KPI-1 / 6 / 7 / AUX-1 のみ軽確認
- **full observation gate**: 30 件 or 3 日経過のうち早い方 → `scripts/coalter-phase2-kpis.sql` 全 KPI 再実行
- **現時点の観測件数**: 本チャット内の CEO 実機再現で **7 セッション分の diagnostics** が server log に流れた (preview の正式カウントとは別枠。再現用に投入されたサンプル)

### 3.3 凍結されている線 (触ると Phase 2 が壊れる)
`docs/coalter-phase2-freeze-checklist.md` 6 項目:
- `isExecutorThemeEnabled` / G6 movie 先行
- misread detector Phase A (engine.ts L326)
- 3-mode dispatch (decision / negotiate / clarify)
- theme continuity (soft sticky)
- question guard
- loop guard

これらに触れる修正案は CEO 判断必須。

---

## 4. 7 セッション分の観測データ (本チャットの原データ)

### 4.1 Pattern A — `searchAndFilter` が呼ばれていない (shouldSearch=false)
| sessionId | webConnector.retrieval | movie.diagnostics |
|---|---|---|
| `ae9b3403-f075-4016-8007-3ada78350277` | **log 無し** | 全列 0 |
| `0c96a512-d7ca-4edd-8d4f-ace7ef9d1501` | **log 無し** | 全列 0 |

- 解釈: `engine.ts:197` の `searchDecision.shouldSearch ? searchAndFilter(...) : []` 三項で
  `false` 分岐に入ったため `searchAndFilter` 自体が呼ばれず、よって webConnector.retrieval log も
  出ない。**でも movieOrchestrator は起動している** → 質問カードは emit → ユーザーには
  「movie 文脈で質問だけして候補ゼロ」に見える。

### 4.2 Pattern B — retrieval 成功 / catalog 段階で大量 drop
| sessionId | queries | rawResults | candidates | catalog | ranked | missingWhere | titleWithoutTheater |
|---|---|---|---|---|---|---|---|
| `a7a9ef93-c22e-4335-aa81-6c829af4e93c` | 3 | 9 | 8 | **6** | **0** | **5** | **5** |
| `7b925649-be02-4383-a72d-84e03900ca21` | 3 | 9 | 8 | 6 | 0 | 5 | 5 |
| `b6ebe1e4-2985-4d1e-87cb-14c129ecf3b4` | 3 | 9 | 8 | 6 | 0 | 5 | 5 |
| `7585bed9-d304-4773-b065-ac296849fc70` | 3 | 9 | 8 | 6 | 0 | 5 | 5 |

クエリサンプル (全セッション共通):
```
映画館 今週末 上映スケジュール 2026年4月
TOHOシネマズ 109シネマズ 上映時刻 2026年4月
上映中 映画 作品 上映館 劇場 2026年4月
```
- 解釈: Phase A.6 P0 の theater-bearing query は正しく組まれている。8 件 candidates まで
  到達。しかし `parseMovieScreenings` で 6 件しか catalog 化されず、そのうち 5 件は
  `theater=null` のまま → `missing_where` reject。**A2 (NEAR_WINDOW / theater 抽出)** の領域。

### 4.3 Pattern C — travel テーマ (参考、本問題とは別系統)
```
queries: [ '新宿 旅行 観光 モデルコース カップル' ]
rawResults: 3 / candidates: 3
(movie.diagnostics は出ない)
```

### 4.4 LLM 側の補足情報 (server log から拾った事実)
- `[ai/run] cache hit` が大量 → 再現中の一部は semantic cache から返っている
- `[ai/eval] teacher generation failed: Gemini 503` 発生 (外部要因・無関係)
- `[ai/run] provider attempt failed: timeout: Gemini timed out after 6000ms` も散発
  → LLM 稼働は生きているが外乱あり。本問題 (catalog=0) とは独立。

---

## 5. 原因の整理

### 5.1 構造的な矛盾 (CEO が指摘した本質)
```
theme = movie と判定されている
  → movieOrchestrator 起動
  → 質問カード emit
  ↑
  同じ analysis を decideSearch に渡すと shouldSearch=false
  理由: 会話に「気分」「迷う」「仲」等が含まれる
  → 検索 skip
  → searchCandidates = []
  → catalogCount = 0
```

**1 つの analysis から、dispatch は movie と言い、retrieval は「感情の話だから検索不要」と
言っている。** これは設計の矛盾。

### 5.2 該当コード
- `lib/coalter/webConnector.ts:34-38`
  ```ts
  const NO_SEARCH_PATTERNS = [
    /気持ち|感情|気分/,
    /関係|仲|距離感/,
    /すれ違い|誤解|喧嘩/,
  ];
  ```
- `lib/coalter/webConnector.ts:42-84` `decideSearch`
  - SEARCH_REQUIRED_THEMES 通過後、recentMessages を join して NO_SEARCH_PATTERNS を全件
    test → 1 つでもマッチしたら shouldSearch=false

プレビューシナリオ A-1 例文「**何見たい気分?**」「**迷うね**」は直撃する。

### 5.3 Pattern B の別系統原因
- catalog 化した movie のうち `theater=null` のまま残る → missing_where で reject
- 原因候補:
  - `parseMovieScreenings` の theater 抽出正規表現が HTML 構造の変化に追従できていない
  - webConnector が引いてくる URL が listicle 寄りで、theater 情報が本文に載っていない
  - NEAR_WINDOW (タイトル近傍の theater テキスト検出) が狭すぎる
- A 枝 audit で既に A2 として優先順位 2 位に整理済み (`docs/research/coalter-movie-retrieval-audit.md` §6)

---

## 6. Claude の修正案 (却下された — なぜ却下されたかも記録)

Claude 提案: 「`NO_SEARCH_PATTERNS` を movie/food/travel/activity テーマでは無視する」

**CEO 判断: 却下、稚拙**。理由 (CEO 発言原文要約):
- 感情があってこその人間。感情を読み取れずに最高の提案は作れない
- 感情によって人間の心が動く = 感情は「検索を止める理由」ではなく「提案の核」
- NO_SEARCH_PATTERNS を条件外しするだけでは、感情の情報が提案に活きない
- 本チャットでは解決しない規模の設計課題。新チャットで構造から考え直す

### 6.1 却下が正しい理由 (Claude 側の再整理)
- 現状の NO_SEARCH_PATTERNS は「感情 = 検索しない」という**二値の排他**になっている
- 本来必要なのは「感情を読みつつ、現実情報も取りに行き、提案に両方を織り込む」という**並列**
- 単純に deny list を緩めるだけでは、「感情はあるが扱いは従来通り (= 無視に近い)」のまま。
  CoAlter の価値 (関係性ベース編集) に接続しない

---

## 7. 次チャットでやるべきこと (TODO)

### 7.1 最優先: 感情と retrieval の並列設計
- NO_SEARCH_PATTERNS を **排他ゲートから「感情タグ抽出器」に格下げ**する案を検討
  - 感情語が検出されたら shouldSearch=false ではなく、`emotionTags: ["気分", "迷い"]` を
    analysis に付け、retrieval は別基準で走らせる
  - 検出された感情タグは proposalGenerator に渡り、「Aは今夜の気分で迷っている」等の
    解釈として使う (CoAlter 5 層設計の L3 → L5)
- 「感情読み」と「現実接続」を**同じ analysis の別フィールド**として同居させる型設計

### 7.2 並行: Pattern B 対策 (A2)
- `parseMovieScreenings` の theater 抽出ロジックを確認
  - NEAR_WINDOW を広げる
  - 別パーサー (例: JSON-LD / OGP) からの補完
- feat/coalter-movie-retrieval-v2 ブランチを切る (A1 とは別)

### 7.3 A1 の扱い
- 本問題の主犯ではないので **A1 投入は保留**
- feat/coalter-movie-retrieval ブランチは凍結維持。廃棄はしない
- wave 2 以降で rawResultsCount が listicle 溢れを示したら再検討

### 7.4 preview の扱い
- 本チャットの diagnostic 追加 (`3e211325`) は behavior 非変更 → preview 継続可
- CEO 発言「preview は止めない」方針維持
- 10 件途中観測 / 30 件 full observation の gate はそのまま
- ただし 7 セッション分の観測で「catalog=0 / ranked=0 が構造的に多発する」ことが確定したので、
  KPI-1 (decision 比率) は decision の質ではなく「質問のみカード連発」で水増しされる懸念あり。
  途中観測時にこの点を注記する

### 7.5 Phase 2 凍結線との整合
- `isExecutorThemeEnabled` / G6 movie 先行 に触れる変更は不可
- dispatch 側 (movieOrchestrator 起動条件) は動かさない
- retrieval 側 (decideSearch / searchAndFilter / parseMovieScreenings) のみで閉じる設計を
  目指す

---

## 8. 最終的に目指す姿 (北極星)

```
theme = movie と判定された会話で、
  会話に感情語 (「気分」「迷う」「仲」) が含まれていても
    → 感情はタグとして抽出・保持される (分析情報として活きる)
    → Web 検索は theater 情報付きで適切に発火する
    → catalog は missing_where で drop されず、5+ 件残る
    → ranked candidates が 3 件以上出る
    → 提案カードは「感情の解釈 + 候補 3 件 + 決め方」の 3 要素揃って返る
  この結果、[CoAlter] movie.diagnostics は:
    searchCandidatesCount >= 5
    catalogCount >= 5
    rankedCount >= 3
    missingWhereRejectCount は catalog の 30% 以下
  を満たす
```

これが 30 件 full observation gate 通過時の合格ライン感。

---

## 9. 参照すべきファイル / ドキュメント (新チャット即座に読むもの)

### 実装
- `lib/coalter/webConnector.ts` — decideSearch / searchAndFilter (本問題の主舞台)
- `lib/coalter/engine.ts:193-201` — decideSearch → searchAndFilter 呼び出し箇所
- `lib/coalter/movieOrchestrator.ts` — catalog 化・ranking・diagnostics emit
- `lib/coalter/conversationParser.ts` — theme 抽出 (analysis 構築元)
- `lib/coalter/coalterDispatch.ts` — G6 theme gate / 3-mode dispatch
- `lib/coalter/types.ts` — ConversationAnalysis / SearchDecision / SearchCandidate

### 仕様書 / 設計
- `docs/coalter-phase2-freeze-checklist.md` — 触ってはいけない 6 線
- `docs/coalter-phase2-preview-scenarios.md` — 投入シナリオ / sanity check
- `docs/coalter-phase2-observation-spec.md` — KPI 閾値
- `docs/research/coalter-movie-retrieval-audit.md` — A 枝 audit (A1/A2/A3/B1/C1)
- `docs/decision-log.md` — 2026-04-19 preview 開始エントリ

### テスト
- `tests/unit/coalter/webConnectorMovieQueries.test.ts` — P0 + A1 回帰テスト
- `tests/unit/coalter/` 全般 — 669 tests

### 運用ログ
- 本チャットで CEO が貼った server log 1 本 (7 セッション分の diagnostics が含まれる)

---

## 10. CEO の最終トーン (新チャットで踏まえるべき)

- Claude の思考は早計で稚拙と判定された
- 感情は CoAlter の存在理由の根幹であり、排他ゲートで扱うのは設計として不可
- 「ここのチャットでは解決しないくらい膨大」 = 新チャットは**設計から**やり直す
- 漏れなく引き継ぐこと = この文書が引き継ぎ契約

---

**本文書作成時点の HEAD: `feat/baseline-edit` = `3e211325`**
**preview 継続中 / A1 ブランチ凍結 / CEO 判断待ち案件: retrieval 再設計 (感情タグ + 並列 retrieval)**
