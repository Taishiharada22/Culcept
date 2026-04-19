# CoAlter Movie Retrieval Audit — catalogCount=0 Root Cause Analysis

**作成日**: 2026-04-19
**背景**: thread `18eeb9ff-7e24-4870-a371-c45fecd510b5` 他で CoAlter movie テーマ起動時に `catalogCount=0 / rankedCount=0` が複数 session で発生。Primary Question Guard (採用案 D) / Loop Guard (採用案 E) で 0 件 fallback は整備済み。本監査は「そもそも映画候補が 1 件も catalog に上がらない」上流の調査。
**ステータス**: 読み取り専用調査、コード変更なし。preview KPI 分析の参考資料として活用。

---

## 1. 上流の流れ整理（関数呼び出し chain）

```
engine.ts                generateMovieProposalV2()
  ↓
  Layer 0: briefBuilder.ts  buildConversationBrief()
    - LLM or parser_fallback で area/timeSlot/mood を抽出
  ↓
  Layer 1: movieOrchestrator.ts:105  parseMovieScreenings(input.searchCandidates)
    - movieCatalog.ts:486 で SearchCandidate[] → MovieScreening[]
    - extractMovieTitle / extractTheaters
    - title だけ取れて theater=null のケースが多い → 後段 drop
  ↓
  Layer 2: movieRanker.ts  rankMovies(brief, catalog)
    - hardFilterOne() で "missing_where" 理由で theater=null を全件 drop (Phase A.5)
    - missingWhereRejectCount にカウント
  ↓
  diagnostics 集計: catalogCount vs rankedCount vs missingWhereRejectCount
```

**コード根拠**:
- `movieOrchestrator.ts:88-105` — Layer 0-1 呼び出し
- `movieOrchestrator.ts:231-247` — diagnostics 集計
- `movieRanker.ts:160-166` — missing_where フィルタ (Phase A.5)
- `movieCatalog.ts:486-551` — parseMovieScreenings メイン

---

## 2. catalogCount=0 になる条件の棚卸し

### (A) クエリ生成の問題
**[コード確認済]** `webConnector.ts:233-276`:
- `location=null` でも 3 本クエリが発火
- q1: `"映画館 今週末 上映スケジュール 2026年4月"` (location prefix 省略時)
- q2: `"TOHOシネマズ 109シネマズ 上映時刻 2026年4月"`
- q3: `"上映中 映画 作品 上映館 劇場 2026年4月"`

**[推測]** `brief.area=null` かつ `timeSlot=null` の場合、クエリは発火するが「渋谷での上映」等の絞り込みが失われる。

### (B) Web 検索結果が映画情報を含まない
**[コード確認済]** `webConnectorMovieQueries.test.ts:7-9` で記録された症状: "listicle ばかり返り、映画館ページを引けていなかった"（旧クエリ q1/q2）。Phase A.6 P0 で theater 引き込みトークン追加済みだが、テスト固定 2026-04-18 / 実測 2026-04-19 で時間差あり。

### (C) parseMovieScreenings が title は取れるが theater を補完できない
**[コード確認済]** `movieCatalog.ts:428-470` theater 決定ロジック:
1. title 明示一致（sc.title 内に theater 名）
2. URL slug パターン (`tohotheater.jp`, `109cinemas.net`)
3a. listicle でない single-movie page: description から拾う
3b. listicle: 近接マッチのみ（`NEAR_WINDOW=40` 文字）

**[推測]** listicle 主体の検索結果だと、`extractBracketedTitles()` が 6 作品まで拾うが、各作品の theater は 40 文字窓の近接マッチのみで補完。列挙形式だと劇場が共有されずテンプレ化 → theater=null。

### (D) Hard filter の "missing_where" が theater=null を全件 drop
**[コード確認済]** `movieRanker.ts:160-166`:
```ts
if (movie.title && !movie.theater) reasons.push("missing_where");
```
結果: `catalogCount > 0` かつ `missingWhereRejectCount ≈ catalogCount` で rankedCount=0。

**[診断根拠]** `movieOrchestrator.ts:231-235` — diagnostics の `missingWhereRejectCount` と `titleWithoutTheaterCount` が一致していれば「catalog に theater=null 多数」確定。

---

## 3. 最も疑わしい 3 箇所（優先順位）

### 🔴 疑い度: 高

**1. listicle URL が検索結果で過多**
- 位置: `webConnector.ts:252-261` (q2) / search 結果フィルタ欠如
- 根拠: Phase A.6 P0 comment は 2026-04-18、実測は 2026-04-19 で時間差あり
- 修正案: listicle パターン検出 + リランク（中 2-4h）or executeSearch 後フィルタで listicle URL を下げる（小 1h）

**2. listicle の theater 近接マッチ 40 文字窓が狭い**
- 位置: `movieCatalog.ts:417-425` `NEAR_WINDOW=40`
- 根拠: リスティクル記事は「作品 × ジャンル × 感想 … 劇場」で 40 文字以上離れることが多い
- 修正案: `NEAR_WINDOW` を 80-100 に拡張（小 0.5h、副作用テスト必須）/ またはリスティクル検出時は全 theater を集約（中 1-2h）

**3. area=null クエリが立地なし検索で引きが弱い**
- 位置: `briefBuilder.ts:211-217` + `webConnector.ts:233-242`
- 根拠: parser_fallback で area=null 時に primaryQuestion を生成するがクエリに area prefix がない
- 修正案: `brief.area=null` の場合にデフォルト area（「東京」等）を kicker として使う（小 0.5h、UI 検証あり）

---

## 4. Preview 観測と並行で追加したい telemetry

1. **listicle 検出率**: `searchCandidates[].url` で `eiga.com` `filmarks.com` `yahoo.co.jp` 等 listing site の %
2. **theater 補完源の内訳**: (1) title 一致 / (2) URL slug / (3a) single-page / (3b) 近接マッチ の比率 tag（`movieCatalog.ts:530` に theater source タグ追加）
3. **briefSource と catalogCount の相関**: `briefResult.llmSuccess=false` session で catalogCount=0 の率（既存 telemetry で grep 可能）
4. **クエリ単位の raw hit 数**: q1/q2/q3 それぞれの結果件数（現在は merged のみ）

---

## まとめ

**最優先調査**: listicle 過多 (候補 1) と theater 近接マッチ窓幅 (候補 2) の 2 点。preview で `missingWhereRejectCount / titleWithoutTheaterCount / staleReleaseRejectCount` の実測分布を見れば原因特定が進む。

preview KPI 再観測時（sessions 30 件 or 3 日）に `scripts/coalter-phase2-kpis.sql` と合わせて本監査の仮説 3 点を照合することを推奨。

---

## 6. 実装優先順位付け（2026-04-19 CEO 並行 GO、preview 非停止前提）

CEO 指示の順序固定: **(1) listicle 過多 → (2) area=null デフォルト → (3) NEAR_WINDOW 拡張**。
理由: catalogCount=0 への直接寄与度の高い順。前者で潰せば後者の効果測定もクリーンになる。

### 🥇 優先 1: listicle 過多への対処

**現状認識**:
- `webConnector.ts:219-276` は既に Phase A.6 P0 (2026-04-19) で映画館トークン強化済み (「映画館」「TOHOシネマズ」「109シネマズ」「上映館 劇場」)。
- ただし実測 (thread `18eeb9ff` 他) で依然 catalogCount=0 が頻発 → 検索結果の listicle 混入率は減ったが、theater 補完できないページが残っている可能性。

**選択肢**:
- **(A1) negative keywords をクエリに追加** — food テーマで実績あるパターンを流用
  - 実装: `webConnector.ts:237-275` の 3 本に `-まとめ -特集 -ランキング -おすすめ10選` を追加
  - 工数: 0.5h (実装) + 0.5h (unit test `webConnectorMovieQueries.test.ts` 更新)
  - 副作用リスク: 低。映画館公式ページや作品単独ページは negative にヒットしにくい
  - **推奨**
- **(A2) executeSearch 後の URL post-filter で listicle をデモート** — `eiga.com/news`, `filmarks.com/list`, `ranking*` パス等を rank 下げ
  - 実装: `webConnector.ts` の executeSearch 結果 merge 段で URL パターン判定 → rank 再調整
  - 工数: 2-3h + unit test
  - 副作用リスク: 中。listicle 以外で eiga.com 作品ページも落としうる
  - A1 で不足した場合の次手
- **(A3) `site:` 併用クエリ追加** — 保険の 4 本目として `site:tohotheater.jp OR site:109cinemas.net 上映` を発火
  - 工数: 0.5h
  - 副作用リスク: 低、ただし搜索 API が `site:` 演算子に対応しているか要確認

**推奨着手**: **A1 (negatives 追加) 単独で 1 回 preview に戻し、改善不足なら A2 を重ねる**。A3 は最終保険。

### 🥈 優先 2: area=null デフォルト

**現状認識**:
- `briefBuilder.ts:189-242` parser_fallback は `area = constraints?.location ?? null` で area=null のケースを残したまま primaryUnresolvedQuestion を生成する (良い)。
- しかし area=null のまま `webConnector.ts:208` に渡ると `locationPart=""` で発火 → エリア絞り込み無しの全国クエリで listicle を引きやすい。

**選択肢**:
- **(B1) クエリ層でのデフォルト東京補完** — brief には触れず、`webConnector.ts:233` で `locationPart.trim()` が空のとき `areaPrefix = "東京 "` を入れる
  - 実装: `webConnector.ts` movie ケース 3-5 行追加
  - 工数: 0.5h + unit test 0.5h
  - 副作用リスク: 低。実際に大阪だった等の場合でも brief 側の primaryQuestion で area を再取得できる
  - **推奨** — brief 層と検索層の責任分離を保てる
- **(B2) briefBuilder fallback 側で `area="東京"` を強制** — 却下推奨
  - 副作用リスク: 高。brief に嘘の area が入ると missingConstraints 判定が誤作動し、primaryQuestion が area を聞かなくなる

**推奨着手**: **B1**。brief=null / query=東京 の責任分離を維持。

### 🥉 優先 3: NEAR_WINDOW 拡張

**現状認識**:
- `movieCatalog.ts:418` `NEAR_WINDOW=40`。リスティクル型記事は 1 段落 = 1 作品で、段落末尾に劇場が来ることが多く 40 文字では取り逃しやすい。
- ただし近接窓を広げすぎると「隣の作品の劇場」を誤紐付けする可能性がある。

**選択肢**:
- **(C1) 40 → 80 に一律拡張**
  - 実装: 1 行変更
  - 工数: 0.1h + test 確認 (既存 `movieCatalog.test.ts`, `webConnectorMovieQueries.test.ts` に snapshot がないか確認要)
  - 副作用リスク: 中。listicle で隣作品 theater を誤紐付けるケース増の可能性 → 必ず test fixture で確認
- **(C2) listicle 検出時のみ 80 に拡張 (single-page は 40 維持)**
  - 工数: 1-2h
  - 副作用リスク: 低、ただし実装複雑化

**推奨着手**: **C1 で test 確認 → PASS なら採用、snapshot で誤紐付けが出たら C2 へ切替**。

### 並行 GO のリスク管理

- **preview 停止条件**: preview 投入中の修正であっても、baseline commit `f5f88e09` は不変。修正ブランチは別に切り、KPI 観測が終わってから main にマージ判断。
- **計測汚染防止**: 修正コミット投入時点を preview 本カウント中断ポイントとする。中断前のカウントは `preview wave 1` として保存、修正後を `preview wave 2` として別枠カウント推奨。
- **工数総計**: A1 = 1.0h, B1 = 1.0h, C1 = 0.6h → **3 候補全部で約 2.6h 程度** (test 含む)。preview 3 日 gate に対して余裕あり。

### 着手タイミング候補

- **今すぐ着手可**: A1 (negatives 追加) — preview の出方に影響しない内部改善。
- **preview 途中観測 (10 件時点) 後**: clarify=0 のままなら優先 A1 投入、clarify 適度に出てるなら一時保留。
- **preview 本観測 (30 件 or 3 日) 後**: B1, C1 の判断。catalogCount の分布を見て影響度の高い方を先に。

---

## 7. 実装進捗 (wave 2 候補管理)

### A1: article-listing negatives — ✅ 実装完了 / merge 待機

- **ブランチ**: `feat/coalter-movie-retrieval`
- **コミット**: `22113ed1 feat(coalter): A1 — article-listing negatives on movie retrieval queries`
- **変更**: `lib/coalter/webConnector.ts` movie q1/q2/q3 に `-まとめ -特集 -ランキング -おすすめ10選` 追加 (10 lines)
- **テスト**: `tests/unit/coalter/webConnectorMovieQueries.test.ts` に A1 regression 6 本追加 → 12/12 PASS
- **スモーク**: `webConnectorMovieQueries / movieOrchestrator / movieCatalog / coalterDispatch / modeRouter` 合計 87/87 PASS
- **ステータス**: baseline (`f5f88e09`) 非 merge、preview 環境未投入
- **投入判断**:
  - 新規 10 件途中観測で以下のどちらかが成立すれば wave 2 投入 GO
    - clarify が完全に 0 のまま (retrieval 枯渇で 0 件 clarify に寄り過ぎ疑い)
    - catalogCount=0 系が明確に頻発 (diagnostics ログで確認)
  - 実害が軽ければ 30 件 / 3 日後の正式再観測まで保留
- **投入時の手順**: preview counting を「wave 1」で区切り、`feat/coalter-movie-retrieval` を baseline に merge、修正後を「wave 2」として別枠計測

### B1: area=null デフォルト東京補完 — 🟡 未着手 (wave 2 優先 2)

- 実装方針: `webConnector.ts:233` で `locationPart.trim()` 空時に `areaPrefix = "東京 "` を補完。brief 側は null 維持
- 工数見積: 0.5h (実装) + 0.5h (unit test)
- 着手タイミング: A1 投入後の catalogCount 変化を見てから判断

### C1: NEAR_WINDOW 40→80 拡張 — 🟡 未着手 (wave 2 優先 3)

- 実装方針: `movieCatalog.ts:418` `NEAR_WINDOW=40` → `80`
- 工数見積: 0.1h (実装) + 0.5h (test snapshot 確認)
- 着手タイミング: A1/B1 投入後も catalogCount=0 の titleWithoutTheaterCount が残るようなら
