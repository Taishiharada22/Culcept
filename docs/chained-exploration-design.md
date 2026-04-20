# 多層連鎖検索（Chained Exploration）設計書

**日付**: 2026-04-15
**ステータス**: 設計提案（CEO 承認待ち）
**起案**: Product Unit
**前提**: Perspective Engine v4（Task-Aware）が稼働中

---

## 0. Executive Summary

人間の思考は一直線ではない。1つの情報が次の問いを生み、その問いがさらに深い情報を引き出す。
現行の Perspective Engine は「1層検索」構造であり、クエリを2-3本並列実行して結果を返すだけで終わる。
これでは「世界中にある全ての情報から、その時のユーザーに最も必要な言葉を送る」という
CEO の掲げる究極のゴールに到達できない。

本設計書は、Perspective Engine に多層連鎖検索（Chained Exploration）を導入し、
**検索結果から次の問いを自律的に導出し、段階的に情報の深度と確度を高める**仕組みを定義する。

### 核心の問い

> 「この機能は、ユーザーの第二の自己として必要か？」

答え: **必要である。**
人間が自分で調べるとき、1回の検索で終わることはない。
気になることを調べ、そこから新たな疑問が生まれ、さらに深く掘る。
この連鎖こそが「理解」であり、Alter がユーザーの第二の自己であるならば、
ユーザーの代わりにこの思考の連鎖を走らせ、最も本質的な情報に到達できなければならない。

### なぜ今か

現行 PE のレイテンシ p90 は 34-38 秒。これは既に重い。
しかし、1層検索の限界は明確に見えている:

1. **浅い情報で止まる** -- 表面的な記事のサマリーしか取れず、具体的な数値や根拠に到達できない
2. **裏取りがない** -- 1つのソースの主張をそのまま渡すため、誤情報リスクが高い
3. **ユーザー固有の掘り下げができない** -- パーソナルモデルが示す「この人にとっての重要情報」に向かって探索を深められない
4. **iterative 探索が手動** -- 現行の ExplorationState は「ユーザーが候補を選ぶ → 次の検索」という手動連鎖。Alter 内部での自律連鎖がない

---

## 1. コンセプト: ニューロン連鎖モデル

### 1.1 CEO 方針の構造化

> 「人間の思考はニューロンのように繋がる。1つの情報が次の問いを生み、
>  その問いがさらに深い情報を引き出す連鎖が必要。」

この方針を設計原理に翻訳する:

```
情報A → 問いB を生成 → 情報C → 問いD を生成 → 情報E → 統合
  ^                       ^                       ^
  初期探索                深掘り                  裏取り/統合
  (Surface)              (Depth)                 (Verification)
```

**ニューロン連鎖の3つの性質**:

1. **活性化伝播** -- 1つの情報が、関連する複数の問いを「活性化」する
2. **選択的注意** -- 全ての問いを追うのではなく、パーソナルモデルに基づいて「この人にとって重要な問い」を選択する
3. **収束** -- 情報が十分に集まったら、散逸せずに統合に向かう

### 1.2 学術的基盤

| 概念 | 文献 | PE への適用 |
|------|------|------------|
| **Iterative RAG** | FLARE (Jiang, 2023) | 生成中に情報不足を検出し追加検索 |
| **Self-RAG** | Asai, NeurIPS 2023 | 検索の要否を生成モデル自身が判断 |
| **Multi-hop QA** | HotpotQA (Yang, 2018) | 複数の情報源を連鎖的に参照して回答 |
| **Chain-of-Thought Retrieval** | IRCoT (Trivedi, 2023) | CoT の各ステップで検索を挟む |
| **Query Decomposition** | DecomP (Khot, 2023) | 複雑な質問を部分質問に分解して逐次解決 |
| **Adaptive Retrieval** | Adaptive-RAG (Jeong, NAACL 2024) | クエリ複雑度に応じて検索戦略を切り替え |
| **Active Retrieval** | FLARE (Jiang, 2023) | 低確信度の生成トークンを検出して能動的に検索 |
| **Integrative Complexity** | Suedfeld & Tetlock | 分化（複数視点の認識）と統合（一貫した判断への収束） |

### 1.3 現行アーキテクチャとの関係

多層連鎖検索は、現行パイプラインを**壊さず拡張する**:

```
現行（1層）:
  Gate → TaskClassify+QueryGen → Search → Classify → QualityGate → PromptBlock → Alter応答

多層連鎖検索（拡張）:
  Gate → TaskClassify+QueryGen → [Search → Classify → 情報不足検出 → 次層クエリ生成]×N → QualityGate → PromptBlock → Alter応答
                                  ^─────────── Chained Loop ──────────────^
```

**変更しないもの**（PE設計書 v2 セクション3.2 と同一）:
- AlterPersonality 構築ロジック
- ForceBalance / ActionShape 算出ロジック
- Ambiguity Engine / Domain Detection
- Relational Lens
- HDM Phase 制御 / Trust 管理
- 影の声制約
- Daily Guidance Engine
- Privacy Gate（クエリ浄化はチェーン内の全クエリに適用される）

---

## 2. 連鎖の設計

### 2.1 段数と構造

最大 **3段**（Layer 0 + Layer 1 + Layer 2）。これは以下の根拠に基づく:

- **レイテンシ制約**: 各段の検索+分類に約 3-5 秒。3段で最大 15 秒追加（後述の並列化で短縮）
- **収穫逓減の法則**: Multi-hop QA 研究で、3ホップ以上の精度改善は marginal（Yang, 2018; Trivedi, 2023）
- **認知負荷**: Alter が消化すべき情報量が増えすぎると、応答の焦点がぼやける

| 段 | 名称 | 目的 | クエリ数 | 実行条件 |
|----|------|------|---------|---------|
| **L0** | 初期探索 (Surface) | 広い視点の収集。現行PEの検索と同等 | 2-3本（タスクタイプ別） | 常に実行（Gate通過時） |
| **L1** | 深掘り (Depth) | L0 で発見された重要情報の詳細化・具体化 | 1-2本（L0結果から導出） | 情報不足検出時のみ |
| **L2** | 裏取り (Verification) | L0/L1 の主張の交差検証・反証収集 | 1本（最重要主張の検証） | 高リスク判断時のみ |

### 2.2 各段の詳細

#### Layer 0: 初期探索 (Surface)

**現行 PE の検索と完全に同一。** 変更なし。
`classifyTaskAndGenerateQueries()` → `executeSearch()` → `classifySearchResults()` のパイプライン。

出力: `PerspectiveFragment[]`（現行どおり）

#### Layer 1: 深掘り (Depth)

L0 の結果を受け取り、**情報ギャップを特定**して追加クエリを生成する。

```
L0 fragments
    |
    v
[情報ギャップ分析] -- 「何が分かって、何がまだ足りないか」
    |
    v
[深掘りクエリ生成] -- L0 で見つかった具体的エンティティ/数値/主張を起点に
    |
    v
[追加検索 + 分類]
    |
    v
L0 + L1 fragments（統合）
```

**情報ギャップの4パターン**:

| パターン | 例 | L1 クエリの方向 |
|---------|-----|----------------|
| **具体性不足** | 「AI市場は成長中」→ 具体的な数値がない | 「AI市場 市場規模 2026 具体的数値」 |
| **一面的視点** | support ばかりで oppose がない | 反対意見を明示的に検索 |
| **エンティティ未解決** | L0 で企業名が出たが詳細がない | 「{企業名} 評判 特徴 2026」 |
| **因果関係の欠落** | 「AはBに良い」→ なぜ良いのかが不明 | 「A B メカニズム 理由 研究」 |

**L1 クエリ生成のルール**:
- L0 の fragment のテキストを入力とし、LLM が情報ギャップを特定する
- Privacy Gate は L1 クエリにも適用する（パーソナルモデル情報の混入防止）
- L0 と同一のソースを再取得しないよう、L0 の URL をネガティブフィルタとして渡す

#### Layer 2: 裏取り (Verification)

L0 + L1 で得られた**最重要の主張 1 件**について、独立ソースからの確認を行う。

```
L0 + L1 fragments から最重要主張を選択
    |
    v
[反証クエリ生成] -- 「{主張} 批判」「{主張} 問題点」「{主張} 反論」
    |
    v
[独立ソース検索]
    |
    v
[交差検証] -- 支持/反論/追加条件の判定
    |
    v
最終 fragments（L0 + L1 + L2、交差検証結果付き）
```

**裏取りの対象選択基準**（以下の全てを満たす主張のみ）:
- `epistemicType` が `statistical_claim` または `empirical_fact`
- `confidence` が 0.7-0.9（高すぎず低すぎない -- 確認の価値がある範囲）
- ForceBalance への影響度（`forceRelevance` の最大値）が 0.5 以上
- ユーザーの判断に直接影響する主張である

### 2.3 次の段に進む条件（情報不足検出ロジック）

情報不足の判定は **LLM ではなくルールベース** で行う。理由: レイテンシの最小化。

```typescript
interface InformationGapAnalysis {
  hasSpecificNumbers: boolean;     // 具体的数値が含まれるか
  stanceDiversity: number;         // stance の多様性 (0-1)
  entityResolved: boolean;         // L0 で言及されたエンティティの詳細が取れているか
  causalDepth: boolean;            // 「なぜ」の根拠が含まれるか
  personalRelevanceScore: number;  // パーソナルモデルとの関連度
}

// L1 に進む条件（OR 結合 -- いずれか 1 つでも該当すれば進む）
function shouldProceedToL1(gap: InformationGapAnalysis, taskType: SearchTaskType): boolean {
  // listing_search / market_intel: 具体的数値がなければ深掘り
  if ((taskType === "listing_search" || taskType === "market_intel") && !gap.hasSpecificNumbers) {
    return true;
  }
  // comparison: 視点の多様性が不足していれば深掘り
  if (taskType === "comparison" && gap.stanceDiversity < 0.4) {
    return true;
  }
  // entity_research: エンティティ未解決なら深掘り
  if (taskType === "entity_research" && !gap.entityResolved) {
    return true;
  }
  // perspective_seek: 因果の深さが足りなければ深掘り
  if (taskType === "perspective_seek" && !gap.causalDepth) {
    return true;
  }
  // パーソナルモデルが「この人にとって重要」と示す軸の情報が不足
  if (gap.personalRelevanceScore > 0.7 && !gap.hasSpecificNumbers) {
    return true;
  }
  return false;
}
```

**L2（裏取り）に進む条件**:
- タスクタイプが `factual_lookup` / `market_intel` / `comparison` のいずれか
- L0 + L1 の fragment に `statistical_claim` が含まれる
- 当該主張の confidence が 0.7-0.9 の範囲
- ドメインが `highExternalDomains`（career_fit, industry_fit, creation, lifestyle, founder_team_fit）に該当する
- **かつ** latency budget に余裕がある（残り予算 > 5秒）

### 2.4 打ち切り条件

連鎖は以下のいずれかで**即座に打ち切る**:

| 条件 | 理由 |
|------|------|
| **latency budget 超過** | 残り予算が 3 秒未満になった時点で、現在の段の結果で確定 |
| **十分性到達** | Quality Gate が `use` を返した（高品質 fragment が 2 件以上） |
| **収穫逓減検出** | L(N) で新規の有用 fragment が 0 件（既知情報の再取得のみ） |
| **最大段数到達** | L2 完了後は問答無用で打ち切り |
| **エラー発生** | 検索 API エラー、LLM タイムアウト等 → fail-open で現時点の結果を使用 |

### 2.5 各段のクエリ導出ロジック

L1/L2 のクエリは**前段の結果から機械的に導出**する。LLM 呼び出しは 1 回のみ（L1 のギャップ分析+クエリ生成を統合）。

**L1 クエリ生成（LLM 1回）**:

入力:
- L0 の fragment テキスト（最大 3 件分）
- ユーザーの元の質問
- タスクタイプ
- 情報ギャップ分析結果

出力:
- 深掘りクエリ 1-2 本
- 深掘りの理由（監査用）

**L2 クエリ生成（ルールベース、LLM 不使用）**:

```
最重要主張のテキスト → 形態素分解 → キーワード抽出 → 「{キーワード} 反論」「{キーワード} 批判」「{キーワード} 問題点」
```

LLM を使わない理由: L2 はレイテンシが最も厳しい段。ルールベースで 0ms に抑える。

---

## 3. パーソナルモデルとの統合

### 3.1 統合ポイントの設計

パーソナルモデルは**3つの段階**で連鎖に影響を与える:

| 段階 | 名称 | 内容 |
|------|------|------|
| **事前** | 探索方向の制御 | パーソナルモデルの判断パターンに基づき、L0 のクエリ方向を調整 |
| **段間** | 関連度フィルタリング | L0 結果から L1 に進む際、「この人にとって重要な情報」を優先選択 |
| **事後** | 個人化統合 | 最終 fragment を ForceBalance に接続する際の重み調整（現行どおり） |

### 3.2 探索方向の制御（事前）

現行の `classifyTaskAndGenerateQueries()` に追加する軽量ロジック:

**パーソナルモデルから導出される「探索バイアス」**:

```
risk_aversion が高い人:
  → cost / fear に関する情報を少し多めに取る（通常 1:1 のところを 1:1.3）
  → ただし fear だけに偏らないよう、opportunity も必ず 1 件は含める

novelty_seeking が高い人:
  → 新しい選択肢、未知の可能性に関する情報を優先
  → 安定志向の情報も 1 件は含める（diversity floor）

relationship_mode が関係重視の人:
  → 組織文化、チーム構成、人間関係に関する情報を優先
```

**重要な制約**: この探索バイアスは**クエリの内容を変える**のではなく、**L1 への進行判断と fragment の優先順位**を変える。Privacy Gate の原則（パーソナル情報を検索エンジンに送信しない）は厳守する。

### 3.3 関連度フィルタリング（段間）

L0 → L1 への遷移時に、どの情報ギャップを追うかをパーソナルモデルで重み付け:

```
情報ギャップ候補:
  A: 給与の具体的数値が不足
  B: 組織文化の詳細が不足
  C: 技術スタックの詳細が不足

パーソナルモデル（relationship_mode = 関係重視、growth_orientation = 高）の場合:
  → B を優先（この人は組織文化を重視する傾向がある）
  → C を次点（成長志向が高いので技術環境も重要）
  → A は L1 では追わない（この人にとって給与は最優先ではない）
```

この「この人にとっての情報の重要度」が、Chained Exploration の核心的な差別化要素である。
ChatGPT / Perplexity は全ユーザーに同じ深掘りをする。Alter は**その人に合った方向に深く掘る**。

### 3.4 個人化統合（事後）

現行の `calculateForceBalanceDelta()` + `buildPerspectivePromptBlock()` と同一。変更なし。
ただし、L1/L2 の fragment には**交差検証の結果**が付与されるため、prompt block に以下を追加:

```
- [統計/肯定的/裏取り済み] AI市場は2026年に2970億ドル規模に到達（独立ソースで確認済み）
  → データ: 数値: 2970億ドル / 時点: 2026年 / 出典: Gartner / 裏取り: IDC報告と一致
```

`裏取り済み` のラベルにより、Alter は**より確信を持って語れる**（hedge 修飾が不要になる）。

---

## 4. 品質保証

### 4.1 裏取り（Cross-Validation）の仕組み

L2 の裏取りは、単に「同じことを言っているソースが 2 つある」ことを確認するのではない。
**Toulmin 論証モデル**に基づき、以下を検証する:

| Toulmin 要素 | 検証内容 | 方法 |
|-------------|---------|------|
| **Data** | 主張の根拠となるデータは存在するか | 独立ソースで同一データの存在を確認 |
| **Warrant** | データから主張への推論は妥当か | 反論ソースが推論の飛躍を指摘していないか確認 |
| **Qualifier** | 主張の適用範囲は明示されているか | 「常に」「全て」等の過度な一般化を検出 |
| **Rebuttal** | 反論は存在するか | 反証検索で見つかった反論を記録 |

検証結果は `PerspectiveFragment` に付与:

```typescript
interface CrossValidationResult {
  status: "confirmed" | "contested" | "unverifiable";
  independentSources: number;  // 独立ソース数
  rebuttalFound: boolean;      // 反論が見つかったか
  qualifierNeeded: string | null; // 追加すべき限定条件
}
```

### 4.2 ハルシネーション防止

多層連鎖検索では、ハルシネーションリスクが段ごとに積み重なる。以下で対策する:

| リスク | 段 | 対策 |
|--------|---|------|
| **LLM がクエリを捏造** | L1 | L1 クエリ生成 LLM の temperature を 0.2 に固定 |
| **検索結果の誤解釈** | L0-L2 | 認識論的分類（empirical_fact / opinion / anecdote）の厳格適用 |
| **情報の混合による新たな偽主張** | 統合時 | fragment 単位の帰属追跡。複数 fragment の「統合解釈」は LLM に委ねない |
| **裏取りの循環参照** | L2 | URL ベースの重複排除。同一ドメインのソースは独立ソースとして数えない |
| **プレースホルダー生成** | 全段 | 現行の prompt block 指示を維持（「以下にない企業名・数値を捏造しないこと」） |

**積層ハルシネーション防止の原則**:
- 各段の fragment は**独立に**分類・評価する。前段の結論を次段の前提にしない
- L1 のクエリは L0 の fragment テキストから導出するが、L0 の「解釈」からは導出しない
- 最終的な prompt block には、各 fragment の出自段（L0/L1/L2）を記録する

### 4.3 ソースの信頼性評価

現行の `SourceAuthority`（academic / government / industry / media / personal）に加え、
多層連鎖では**ソース間の独立性**を評価する:

```
信頼度 = ソース権威 x 独立性係数 x 裏取り係数

独立性係数:
  同一ドメインのソース: 0.3（冗長性が高い）
  異なるドメインの同一主張: 1.0（独立した確認）
  異なるドメインの異なる主張: 0.8（多様な視点）

裏取り係数:
  L2 confirmed: 1.2（確認済みブースト）
  L2 contested: 0.7（論争あり減衰）
  L2 unverifiable: 0.9（中立）
  L0/L1 のみ（裏取りなし）: 1.0（デフォルト）
```

---

## 5. 速度制約

### 5.1 レイテンシ予算

現行パイプラインのレイテンシ分解（`PerspectiveLatencyBreakdown` より推定）:

| ステップ | 現行 p50 | 現行 p90 | 備考 |
|---------|---------|---------|------|
| Gate 判定 | < 1ms | < 1ms | ルールベース |
| Task分類 + クエリ生成 | 2-4s | 5-7s | LLM 1回 |
| Web検索（Exa.ai 並列） | 1-3s | 3-5s | 2-3クエリ並列、3秒タイムアウト |
| 認識論的分類 | 3-5s | 5-8s | LLM 1回 |
| Quality Gate | < 1ms | < 1ms | ルールベース |
| Prompt Block 構築 | < 1ms | < 1ms | テンプレート |
| **Alter 応答生成** | **15-20s** | **20-25s** | **LLM メイン呼び出し** |
| **合計** | **21-33s** | **34-38s** | |

**多層連鎖検索のレイテンシ予算**:

| 方針 | 予算 | 根拠 |
|------|------|------|
| **PE 全体の上限** | 15 秒（p90） | Alter 応答生成（20-25s）と合わせて total 40s 以内 |
| **L0（現行）** | 10 秒（p90） | 現行の Gate 〜 QualityGate の範囲 |
| **L1 追加分** | 4 秒（p90） | 検索 2s + 分類 2s（簡略版） |
| **L2 追加分** | 3 秒（p90） | 検索 2s + 検証 1s（ルールベース） |
| **バッファ** | 2 秒 | ネットワーク遅延、LLM レイテンシ変動 |

**結論**: L0 + L1 で p90 14 秒。L2 まで進むケースは稀（高リスク判断時のみ）なので、
p90 は現行比 +4 秒程度の増加に収まる見込み。

### 5.2 並列化戦略

```
時間軸 →

L0:  [─── TaskClassify+QueryGen ───][─── Search(3並列) ───][─── Classify ───]
                                                                 |
L1:                                                    [GapAnalysis+QueryGen][Search(2並列)][Classify(簡略)]
                                                                                                    |
L2:                                                                                     [QueryGen(ルール)][Search(1本)][Verify(ルール)]
```

**並列化の原則**:
- L0 内部: クエリ生成は直列だが、検索は全クエリ並列（現行どおり）
- L0 → L1: L0 の分類完了を待ってから L1 開始（依存関係あり）
- L1 内部: ギャップ分析+クエリ生成は LLM 1回。検索は並列
- L1 → L2: L1 の分類完了を待ってから L2 開始
- L2 内部: クエリ生成はルールベース（0ms）。検索は 1 本のみ

**将来的な最適化余地**:
- L0 の検索中に L1 のクエリ候補を「仮生成」しておく（speculative execution）
- L0 の fragment が 1 件分類された時点で L1 を開始する（ストリーミングパイプライン）

### 5.3 キャッシュ戦略

| キャッシュ対象 | TTL | キー | 理由 |
|-------------|-----|------|------|
| **検索結果** | 1 時間 | query hash | 同一クエリの重複検索を防止 |
| **分類結果** | 1 時間 | fragment hash + query context | 同一テキストの重複分類を防止 |
| **裏取り結果** | 24 時間 | claim hash | ファクトチェックは鮮度要求が低い |
| **タスク分類** | キャッシュしない | -- | 会話文脈に依存するため |

キャッシュは Redis / in-memory のどちらでも可。初期実装は in-memory（`Map<string, CacheEntry>`）で十分。

### 5.4 早期打ち切り戦略

```typescript
interface LatencyBudget {
  totalBudgetMs: number;   // PE 全体の予算（デフォルト: 15000ms）
  elapsedMs: number;       // これまでの消費時間
  remainingMs: number;     // 残り予算

  // 各段の予算配分
  l0BudgetMs: number;      // L0: 10000ms
  l1BudgetMs: number;      // L1: 4000ms
  l2BudgetMs: number;      // L2: 3000ms
}

function canProceedToNextLayer(budget: LatencyBudget, nextLayer: 1 | 2): boolean {
  const required = nextLayer === 1 ? budget.l1BudgetMs : budget.l2BudgetMs;
  return budget.remainingMs >= required + 2000; // 2秒バッファ
}
```

---

## 6. 段階的実装計画

### Phase 1: 最小限の 2 層化（L0 + L1）

**目標**: 現行 PE に L1（深掘り）を追加し、情報の具体性を向上させる。

**スコープ**:
- 情報ギャップ分析（ルールベース）の実装
- L1 クエリ生成（LLM 1回）の実装
- L1 検索+分類（L0 の簡略版）の実装
- latency budget の導入
- L1 fragment を既存の prompt block に統合
- L0 のみ / L0+L1 の A/B テスト基盤

**実装しないもの**:
- L2（裏取り）
- パーソナルモデルによる探索方向制御
- キャッシュ
- speculative execution

**成功指標**:
- L1 に進んだケースで、fragment 内の具体的数値含有率が 30% 以上向上
- p90 レイテンシが +5 秒以内に収まる
- Quality Gate の `use` 判定率が 10% 以上向上（supplement → use への昇格）

**想定工数**: Build Unit 2-3 日

**実装の骨格**:

```
runPerspectiveEngine() の変更点:
  1. L0 完了後、retrievalQualityGate() の結果を確認
  2. action === "supplement" かつ shouldProceedToL1() === true の場合:
     a. analyzeInformationGap(L0fragments, taskType) でギャップ特定
     b. generateL1Queries(gap, L0fragments, message) でクエリ生成
     c. executeSearch(L1queries, 2000) で追加検索（タイムアウト短縮）
     d. classifySearchResults(L1results, ...) で分類（L0 と同一ロジック）
     e. L0 + L1 の fragments を統合
     f. retrievalQualityGate() を再実行
  3. 統合された fragments で prompt block を生成
```

### Phase 2: 条件分岐付き多層化（L0 + L1 + L2）

**目標**: L2（裏取り）を追加し、高リスク判断時の情報信頼性を向上させる。

**スコープ**:
- L2 裏取りロジック（ルールベースのクエリ生成 + 交差検証）
- `CrossValidationResult` の導入
- prompt block への裏取りラベル（`裏取り済み` / `論争あり`）の追加
- L2 に進む条件の実装（高リスクドメイン + statistical_claim）
- キャッシュ（in-memory）の導入

**成功指標**:
- L2 裏取り済みの主張に対するユーザーの信頼度（フィードバック）が向上
- ハルシネーション率（事後監査）が 20% 以上低下
- p90 レイテンシが Phase 1 比 +3 秒以内に収まる

**想定工数**: Build Unit 3-4 日

### Phase 3: パーソナルモデル駆動の探索方向制御

**目標**: 連鎖の方向をパーソナルモデルで制御し、「この人にとって重要な情報」に向かって深掘りする。

**スコープ**:
- 探索バイアスの導出（パーソナルモデル → 情報ギャップの重み付け）
- L1 のギャップ選択にパーソナルモデルの重みを適用
- 「この人が見落としがちな視点」の能動的な取得（suppressedTraits に基づく）
- A/B テスト: パーソナルモデル駆動 vs 汎用的な深掘り

**成功指標**:
- パーソナルモデル駆動の探索を受けたユーザーの「自己理解の深化」スコアが向上
- Alter の応答に対する「自分のことを分かっている」感の向上（フィードバック）
- 汎用的な深掘りとの A/B で、follow-up 質問率（=もっと知りたい）が向上

**想定工数**: Build Unit + Product Unit 5-7 日

---

## 7. リスクと緩和策

| リスク | 深刻度 | 緩和策 |
|--------|--------|--------|
| **レイテンシ爆発** | 高 | latency budget の厳格な enforcement。超過時は即打ち切り |
| **情報過多による応答品質低下** | 高 | fragment 数の上限維持（現行の DENSITY_STANDARDS と同一）。L1/L2 の fragment は L0 の予算内に収める |
| **裏取りの循環参照** | 中 | URL ベースの重複排除 + 同一ドメイン排除 |
| **LLM コスト増加** | 中 | L1 は 1 回の LLM 呼び出しのみ。L2 は LLM 不使用。Phase 1 での L1 発火率を 30% 以下に制御 |
| **Alter の声の希釈** | 高 | prompt block の指示を維持（「自分の言葉で語れ」）。fragment 数は増やさず、質を上げる方針 |
| **Privacy Gate の穴** | 最高 | L1/L2 のクエリにも Privacy Gate を適用。L0 で取得したテキストからの再検索時にパーソナル情報が混入しないよう、クエリ生成 LLM に明示的に禁止 |

---

## 8. 成功の定義

### 8.1 最高体験

多層連鎖検索が達成すべき最高体験:

> ユーザーが「転職すべきか迷ってる」と聞いたとき、Alter は:
>
> 1. まず、この人の判断パターン（リスク回避的だが成長志向が高い）を踏まえて方向を示す
> 2. 次に、転職市場の具体的な数値（業界の成長率、年収帯）を**裏取り済みで**語る
> 3. さらに、この人が見落としがちな視点（「安定を求める裏にある、変化への憧れ」）を
>    外部の研究知見と紐づけて気づかせる
> 4. 最後に、「あなたはこういうタイプだから、こういう順序で考えると自分らしい判断ができる」
>    と ActionShape を通じた結論を出す
>
> ユーザーの感想: 「自分一人で調べてもこの結論には辿り着けなかった」

### 8.2 測定指標

| 指標 | 現行ベースライン | Phase 1 目標 | Phase 3 目標 |
|------|----------------|-------------|-------------|
| fragment 内の具体的数値含有率 | 40% | 60% | 70% |
| Quality Gate `use` 判定率 | 35% | 50% | 60% |
| PE p90 レイテンシ | 10-13s | 14-17s | 15-18s |
| Alter 応答 total p90 | 34-38s | 38-42s | 39-43s |
| ユーザー「参考になった」率 | 未計測 | ベースライン計測 | +15% |

### 8.3 撤退基準

以下のいずれかに該当した場合、Phase を巻き戻す:

- PE p90 が 20 秒を超過し、最適化で改善が見込めない
- L1/L2 の fragment がユーザーの質問と無関係な情報を含む割合が 20% を超える
- Alter の応答に対する「自分のことを分かっている」感がベースラインより低下する

---

## 9. 現行 ExplorationState との関係

現行の `ExplorationState`（マルチターン探索）は**ターンをまたぐ連鎖**を管理する。
本設計の Chained Exploration は**1ターン内の連鎖**を管理する。

両者は直交する:

```
ExplorationState（ターン間）:
  Turn 1: [L0 → L1 の Chained Exploration] → 候補提示
  Turn 2: ユーザーが候補を選択
  Turn 3: [L0 → L1 → L2 の Chained Exploration] → 深掘り結果提示

Chained Exploration（ターン内）:
  L0 → L1 → L2 の各段が 1 ターン内で完結
```

ExplorationState の `currentPhase` が `deep_research` の場合、
Chained Exploration は**より積極的に L1/L2 に進む**（latency budget を多めに割り当てる）。

---

## 10. 監査と観測可能性

### 10.1 ログ構造

```typescript
interface ChainedExplorationLog {
  explorationId: string;
  layers: {
    layer: 0 | 1 | 2;
    queries: string[];
    fragmentCount: number;
    latencyMs: number;
    proceedReason: string | null;  // なぜ次の段に進んだか
    stopReason: string | null;     // なぜここで止まったか
  }[];
  totalLatencyMs: number;
  finalFragmentCount: number;
  qualityGateResult: QualityAction;
  personalModelInfluence: {
    explorationBias: string | null;
    gapPrioritization: string | null;
  };
}
```

### 10.2 管理画面

既存の PE analytics（`home_alter_judgment` テーブル）に以下を追加:

- `chain_depth`: 到達した最大段数（0/1/2）
- `l1_fired`: L1 が発火したか
- `l2_fired`: L2 が発火したか
- `chain_latency_ms`: 連鎖全体のレイテンシ
- `cross_validation_result`: L2 の裏取り結果（confirmed/contested/unverifiable）

---

## 付録 A: 設計思想チェックリスト

| 問い | 回答 |
|------|------|
| この機能は、ユーザーの第二の自己として必要か？ | 必要。人間が自分で調べるときの思考連鎖を Alter が代行する |
| 判断原理に近づけるか？ | L1 の深掘りで具体的根拠が増え、判断の材料が厚くなる |
| 変化の法則を掴めるか？ | Phase 3 でパーソナルモデルの変化に応じて探索方向が変わる |
| 再現精度が上がるか？ | L2 の裏取りで情報の信頼性が向上する |
| 自己理解が深まるか？ | パーソナルモデル駆動の探索が「見落としがちな視点」を発見する |
| 深い観測に繋がるか？ | 外部情報と内面の対比が、新しい自己発見のきっかけになる |

## 付録 B: CEO 方針との整合性

| CEO 方針 | 本設計での対応 |
|---------|-------------|
| 迷ったらスピードより整合性と世界観を優先 | latency budget は設けるが、情報の質を犠牲にしない。足りないなら L1 に進む |
| ニューロン連鎖モデル | L0 → L1 → L2 の活性化伝播構造 |
| 世界中の全情報からその人に最も必要な言葉を | パーソナルモデル駆動の探索方向制御（Phase 3）|
| Alter の声で語る | prompt block の指示は維持。fragment 数は増やさず質を上げる |
| 検索結果は結論を上書きしない | ForceBalance の重みを更新するが、ActionShape は動かさない（現行どおり） |
