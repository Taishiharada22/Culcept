# Alter 理解更新アーキテクチャ — 実装計画 最終版

## CEO GO（2026-03-31） — 3点追記で確定

---

## P2 完了時の追加固定（2026-03-31）

### A. 仮説 status の正式な State Machine

```
                  ┌──────────────────────────────┐
                  │         emerging              │  初期状態
                  │  (confidence < 0.5 → 注入なし) │
                  └──────┬──────────────┬─────────┘
        evidence↑ ≥5件   │              │  矛盾検出
        direction > 0.15 │              │  (emerging は即 retired)
                         ▼              ▼
              ┌──────────────┐   ┌──────────┐
              │ strengthening │   │ retired  │  最終状態（復帰なし）
              │ (注入対象)    │   │ (注入なし)│
              └──────┬───────┘   └──────────┘
     evidence ≥10件  │                  ▲
     |direction|≤0.1 │                  │ confidence < 0.2
     confidence ≥0.5 │                  │ AND evidence ≥ 5
                     ▼                  │
              ┌──────────────┐          │
              │    stable    │──────────┘
              │ (注入対象)    │
              └──────┬───────┘
                     │  矛盾検出 or
                     │  direction < -0.2
                     ▼
              ┌──────────────┐
              │  weakening   │  中間状態（注入停止）
              │ (注入なし)    │
              └──────┬───────┘
                     │  次回評価で
                     │  confidence < 0.2 → retired
                     │  confidence 回復 → emerging に戻す（将来拡張）
                     ▼
              ┌──────────────┐
              │   retired    │  最終状態（復帰なし）
              └──────────────┘
```

**5状態の定義:**

| status | 意味 | 注入対象か | 遷移条件 |
|--------|------|----------|---------|
| `emerging` | 初期仮説。証拠不十分 | ❌（confidence < 0.5 のため） | evidence方向 > 0.15 + 証拠5件以上 → strengthening / 矛盾 → retired |
| `strengthening` | 証拠蓄積中。提示可能 | ✅ | evidence 10件以上 + 安定 → stable / 矛盾 → weakening |
| `stable` | 十分な証拠で安定 | ✅ | 矛盾 or 大幅な evidence 低下 → weakening |
| `weakening` | 矛盾検出。提示停止の中間状態 | ❌ | 次回評価で confidence < 0.2 → retired |
| `retired` | 無効化。最終状態 | ❌ | 遷移なし（復帰不可） |

**計画書との差分:** 計画書の `weakened` は DB/コードの `weakening` に統一。`weakening` は「まだ回復可能性がある中間状態」、`retired` は「完全無効化の最終状態」として分離。

---

### F. P5 事故防止3点固定（2026-03-31 CEO 指示で固定）

#### Fix 1: 1セッション最大1回の明示

72h/3セッション cooldown に加え、**session 単位**で `mi_presented_count <= 1` を強制。

- `stargazer_analytics` の `home_alter_insight_presented` イベントに `metadata.session_id` を追加
- `evaluateMIGate` に `sessionMIPresentedCount` パラメータを追加
- `sessionMIPresentedCount >= 1` → 即座にブロック（他の判定より先に評価）
- 実装: `alterUnderstanding.ts` evaluateMIGate 冒頭 + `route.ts` MI Gate 呼び出し前のクエリ

#### Fix 2: 断定表現の出力 lint

prompt 指示だけでなく、post-output の軽い regex lint で二重保証。

- `lintMIAssertions(response)` — MI 提示された応答に対して 5 パターンの断定表現を検出
  - 行動断定（「あなたは〜しています」）→ ソフト化差し替え
  - メタ分析（「パターンが見えます」）→ ソフト化差し替え
  - 診断風（「〜と推定されます」）→ ソフト化差し替え
  - 状態断定（「ストレス状態です」）→ ソフト化差し替え
  - 分析暴露（「3つのシグナルから」）→ 削除
- 検出時: `homeResponse` を lint 後のテキストで差し替え + `home_alter_mi_assertion_lint` analytics 記録
- 実装: `alterUnderstanding.ts` lintMIAssertions + `route.ts` creepiness check 直後

#### Fix 3: deny / suppress の最小サンプル条件

全ての統計ベース判定に最小サンプル数を明示。

| 判定 | 最小サンプル | 定数名 | 場所 |
|------|------------|--------|------|
| global failsafe (deny rate > 30%) | **5件**以上の提示 | `MI_MIN_SAMPLE_GLOBAL_FAILSAFE` | `evaluateMIGate` |
| suppressedTypes (タイプ別 deny rate > 50%) | タイプ別 **3件**以上 | `MI_MIN_SAMPLE_TYPE_SUPPRESS` | `computeMIAccuracy` 内 `stats.total >= 3` |
| consecutive denied (30日停止) | **3回**連続 | `MI_MIN_SAMPLE_CONSECUTIVE` | `evaluateMIGate` |

- サンプル不足の場合 → 該当判定をスキップ（フェイルセーフ不発動 = 安全側は「提示する」）
- `computeMIAccuracy` の `signals_to_suppress` は元から `stats.total >= 3` を条件としていたが、定数として明示化

---

### D. P4/P5 の役割境界（2026-03-31 CEO 指示で固定）

| | P4: 深掘りプローブ | P5: Micro Insight |
|---|---|---|
| **目的** | 理解の穴を埋める（情報収集） | ズレや違和感を抑制的に提示（気づきの提供） |
| **方向** | Alter → ユーザーに質問する | Alter → ユーザーに観察結果を伝える |
| **トーン** | 「ちなみに〜？」（好奇心） | 「〜かもしれない」（仮説提示） |
| **やっていいこと** | 質問して情報を引き出す | 検出したパターンを控えめに提示する |
| **やってはいけないこと** | 解釈を述べる・当てに行く | 頻繁に出す・断定する |
| **発火頻度** | Intent Pool と競合しない範囲で自然に | 1セッション最大1回（P5成功基準で制御） |
| **失敗時の害** | 低い（質問を無視されるだけ） | 高い（決めつけ感→離脱リスク） |

**原則: P4 は聞く。P5 は伝える。P4 で解釈しすぎない。**

---

### E. P4 の評価指標（2026-03-31 CEO 指示で固定）

`stargazer_analytics` の `event = "home_alter_deepening_probe"` を起点に、以下を計測する。

| 指標 | 定義 | 計測方法 |
|------|------|---------|
| **回答率** | probe 質問にユーザーが答えた割合 | probe 発火後の次メッセージが存在 AND 1文以上 |
| **スキップ率** | probe を完全に無視した割合 | probe 発火後の次メッセージが probe の話題と無関係 |
| **無視率** | probe 発火後にセッションが終了した割合 | probe 発火後 30分以内に次メッセージなし |
| **同テーマ再発火率** | 同じ dedup_key が一定期間内に再度発火した割合 | dedup_key の重複カウント / 全発火数 |
| **probe 後継続率** | probe 後に会話が2往復以上続いた割合 | probe 発火後のセッション内メッセージ数 ≥ 2 |

**β運用での合格ライン（暫定）:**
- 回答率 ≥ 40%
- 無視率 ≤ 30%
- probe 後継続率 ≥ 50%

**合格ラインを下回った場合:**
- 該当 trigger_type の priority を 0.1 引き下げ
- 3回連続で合格ライン未達の trigger_type は一時停止（priority = 0）

---

### C. P3 既知の制限（2026-03-31 CEO 指示で固定）

- `actionShape` を使う判断傾向シフト検出は、facts 構築時点では未確定のため完全ではない
- この系統の検出は post-response analytics または P5 で補完する
- したがって、P3 時点の deviation は **「ベースライン基盤としては完成、判断シフト系のみ部分留保」** と定義する

---

### B. 仮説注入ゲートを変更しなかった理由

**現在のゲート条件（3層フィルタ）:**

| 層 | 条件 | 場所 |
|----|------|------|
| DB クエリ | `status IN (emerging, strengthening, stable)` + `confidence >= 0.3` + `LIMIT 10` | route.ts L1754-1761 |
| `selectHypothesesForPrompt` | status が retired/weakening → 除外, emerging で confidence < 0.5 → 除外, **最大2件**, ドメイン関連性ソート | alterUnderstanding.ts L1969 |
| `formatHypothesisForPrompt` | 同上の gate + trust レベル不足 → null 返却 | alterUnderstanding.ts L1930 |

**なぜ十分か:**

1. **3層の独立フィルタ** — DB/select/format のどれか1つが漏れても他の層が止める
2. **最大2件の硬い上限** — facts 過多によるLLM崩壊点（反証⑤）を物理的に防止
3. **emerging の実質排除** — confidence < 0.5 で弾かれるため、実際に注入されるのは strengthening/stable のみ
4. **trust ゲート** — `required_trust` が足りなければ高 confidence でも非表示（cross_context は trust=3 必要）

**将来見直す条件:**

| 条件 | 見直し内容 |
|------|-----------|
| 仮説テーブルに50件以上蓄積 | DB クエリの LIMIT を下げる or confidence 閾値を上げる |
| presented_count が高い仮説が denied される率 > 20% | 該当 hypothesis_type の required_trust を引き上げ |
| P5 Micro Insight 実装時 | Insight と仮説の提示が競合するため、合計提示枠（仮説+Insight ≤ 2）を導入 |
| βテストでユーザーから「見透かされ感」の報告 | 全体の confidence 閾値を 0.5 → 0.6 に引き上げ |

---

## 0. CEO 指摘3点の固定（2026-03-31 追記）

### 0-1. `computeArchetypeWeight` の基準値: 定義と命名統一

**現状の実装:**
```typescript
// route.ts L1547
observationCount: Number(profile?.total_sessions) || 0,
```
`profile?.total_sessions` は `stargazer_profiles.total_sessions` — **Stargazer の質問回答セッション数**。
Alter 対話回数ではない。

**問題:** Stargazer を10セッション完了したがAlter未使用のユーザーは、Alter初回からアーキタイプが減衰してしまう。逆に Stargazer 未完了でAlterだけ使っているユーザーはいつまでもアーキタイプが強い。

**決定: Alter 対話回数をカウント基準にする**

| 項目 | 値 |
|------|---|
| 変数名 | `alterSessionCount`（`observationCount` から改名） |
| データソース | `stargazer_alter_patterns` の `pattern_type = 'decision'` レコードの `observation_count` 合計、または専用カウンター |
| 意味 | 「Alter がこのユーザーについて判断を観測した回数」 |
| 理由 | Alter の理解は Alter との対話で更新される。Stargazer セッション数は L0 構造的傾向の信頼度に使うべきで、アーキタイプ漸減の速度とは別 |

**実装方法（P0 追加差分、~10行）:**
```
// route.ts: Alter セッションカウントを取得
const { count: alterSessionCount } = await supabase
  .from("stargazer_alter_patterns")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId)
  .eq("pattern_type", "decision");

// homeContext に注入（observationCount → alterSessionCount に改名）
const homeContextWithObs = {
  ...(rawHomeContext ?? {}),
  observationCount: alterSessionCount ?? 0,
};
```

**注意:** `HomeAlterContextData.observationCount` のフィールド名は内部インターフェースのため、route.ts 側で正しい値を渡せば alterHomeAdapter.ts の変更は不要。ただしコメントで「= Alter 対話回数」と明記する。

---

### 0-2. P3 前提データの棚卸し: `stargazer_alter_patterns` の粒度評価

**テーブルスキーマ:**
```sql
pattern_type IN ('decision', 'state', 'response', 'micro_signal')
pattern_key text
observation_count int
pattern_data jsonb
confidence float
last_observed timestamptz
```

**現在書き込まれているデータの棚卸し:**

| pattern_type | pattern_key | pattern_data の中身 | 観測頻度 | P3 ベースラインに使えるか |
|-------------|-------------|-------------------|---------|----------------------|
| `decision` | `decision_{domain}` | `shape_distribution`: ActionShape 6形の出現分布 | 毎回答 | ✅ **ドメイン別の判断傾向ベースライン** — 「この人は仕事の判断では go_decisive が多い」等 |
| `state` | `time_capacity` | time_block 別の capacity 推定値 | 毎回答 | ✅ **時間帯別エネルギーベースライン** — 「朝は energy 高い」等 |
| `response` | `insight_receptivity` | insight_type 別の reaction 分布 (accepted/denied/ignored/explored) | insight 提示時 | ✅ **Insight 受容性ベースライン** — 「この人は career 系 insight を受け入れやすい」 |
| `micro_signal` | `{signal.type}` | `latest_signals`: 直近20件のシグナル履歴 | シグナル検出時 | ⚠️ **部分的** — 履歴はあるが移動平均向きではない。頻度カウントとして使える |

**P3 ベースライン構築に足りるか: 概ね足りる**

- `decision` パターン: ドメイン別 ActionShape 分布 → 判断傾向の移動平均に直接使える
- `state` パターン: time_block 別 capacity → エネルギーベースラインに使える
- `response` パターン: Insight 受容性 → P5 の提示制御に使える

**足りないもの（P3 前に追加記録が必要）:**

| 不足データ | 必要な理由 | 追加方法 | 追加コスト |
|-----------|-----------|---------|-----------|
| **感情トーンの移動平均** | 「この人のいつもの emotional_load」がないとズレが測れない | ForceBalance の `emotional_load` 値を `pattern_type='state', pattern_key='emotional_baseline'` に蓄積 | ~20行（既存の decision pattern 蓄積と同パターン） |
| **質問カテゴリ分布** | 「この人は何について聞くことが多いか」のベースライン | `questionCategory` を `pattern_type='decision', pattern_key='category_distribution'` に蓄積 | ~15行 |

**結論:** 既存データで判断傾向+エネルギーのベースラインは作れる。感情トーンと質問カテゴリ分布の2項目を P2 実装時に追加記録し始めれば、P3 着手時に十分なデータが蓄積される。

---

### 0-3. P5 成功基準の強化

P5（Micro Insight）は **外した時の不快感が最も高いフェーズ** であり、成功判定を厳格化する。

**強化後の P5 検証基準:**

| 検証項目 | 計測方法 | 合格ライン | 不合格時の対応 |
|---------|---------|-----------|-------------|
| **否定率** | `stargazer_alter_reactions` の `reaction = 'denied'` 率 | ≤ 15% | 閾値引き上げ or 該当 insight_type の発火停止 |
| **決めつけ感の検出** | Insight テキストに「あなたは〜です」「明らかに〜」等の断定表現が含まれるか（LLM 生成後バリデーション） | 断定表現 0% | prompt のトーン指示を強化 + post-generation フィルター追加 |
| **連続発火抑制** | 直近3セッション内の Insight 提示回数 | 3セッション中 最大1回 | `insightCooldown` カウンターで制御 |
| **不快な誤検知率** | denied + 直後にセッション離脱（30秒以内に会話終了）の組み合わせ | ≤ 5% | 該当パターンの insight_type を自動的に confidence 低下 |
| **ポジティブ反応率** | `reaction = 'accepted'` + `reaction = 'explored'` の合計率 | ≥ 40% | Insight 選択ロジックの見直し |
| **頻度逸脱** | 全ユーザー平均の Insight 提示頻度からの標準偏差 | 個別ユーザーへの提示が平均±2σ 以内 | ユーザー別の insightBudget を動的調整 |

**P5 のフェイルセーフ:**
- 否定率が 30% を超えた場合: P5 全体を自動停止（insightBudget = 0）
- 連続 denied が3回発生した場合: 該当ユーザーへの Insight 提示を30日間停止
- 全てのフェイルセーフは `stargazer_alter_reactions` の既存データで判定可能（追加テーブル不要）

---

## 1. 全体ロードマップ（P0〜P6）

### 依存グラフ

```
P0 アーキタイプ漸減 ✅
 └→ P1 環境文脈注入 ✅
     └→ P2 仮説プール活性化
         ├→ P3 個別ベースライン構築
         │   └→ P5 Micro Insight（ズレ検出→提示）
         └→ P4 トリガー深掘り質問
              └→ P5（トリガー条件がMIの発火源にもなる）
                  └→ P6 関係マップ統合
```

### フェーズ詳細

| Phase | 名称 | 核心 | 新規コード量 | 既存資産活用度 | 反証マッピング |
|-------|------|------|-------------|--------------|--------------|
| **P0** | アーキタイプ漸減 ✅ | 事前分布の影響を観測量に応じて漸減 | 小（~60行） | TaggedFact拡張 | 反証②「Stargazerだけでは不十分」→ archetype≠到着点の実装 |
| **P1** | 環境文脈注入 ✅ | 蓄積された生活文脈をfactsに接続 | 小（~80行） | `extractLifeContextSignals` + `stargazer_alter_context` 全活用 | 反証③「自己申告の限界」→ 行動文脈から推測を補完 |
| **P2** | 仮説プール活性化 | 既存仮説パイプラインの信頼度ゲート調整+反証ループ追加 | 中（~200行） | `stargazer_alter_hypotheses` + `selectHypothesesForPrompt` + 注入済み | 反証①「完全理解への不快感」→ 仮説は断定せず提示 |
| **P3** | 個別ベースライン | セッション横断の移動平均で「この人のいつも」を構築 | 中（~300行） | `stargazer_alter_patterns` 既に書込み中 | 反証④「変化検出の誤り」→ ベースラインなしにズレは測れない |
| **P4** | トリガー深掘り質問 | 5条件で自然に深掘り質問を発火 | 中（~250行） | `detectStructuralGaps` + `stargazer_alter_narratives` | 反証⑤「LLM理解の崩壊点」→ 構造化質問で精度維持 |
| **P5** | Micro Insight | ベースラインからのズレを検出し抑制的に提示 | 大（~400行） | `stargazer_alter_reactions` + patterns | 反証①「10%表出ルール」→ 知っていることの大半は黙る |
| **P6** | 関係マップ統合 | 人物間の関係性を判断の文脈変数に昇格 | 中（~250行） | `stargazer_alter_person_map` 既にテーブル+書込みあり | 反証⑥「コスト制約」→ 関係マップはローカル集約で済む |

### タイムライン目安

```
Week 1: P2 仮説プール活性化（既存パイプライン調整が主）
Week 2: P3 個別ベースライン（patterns テーブルの読み出し+移動平均）
Week 3: P4 トリガー深掘り質問（structuralGaps 接続+質問プール）
Week 4-5: P5 Micro Insight（P3+P4の成果を統合、最も複雑）
Week 6: P6 関係マップ統合（person_map の facts レイヤー接続）
```

---

## 2. 既存資産との対応表

### テーブル → フェーズ対応

| テーブル | 現状 | 活用フェーズ | 必要な変更 |
|---------|------|------------|-----------|
| `stargazer_alter_context` | ✅ 蓄積中（extractLifeContextSignals が毎セッション書込み） | **P1** ✅接続済み | なし |
| `stargazer_alter_hypotheses` | ✅ 蓄積中 + prompt注入済み（route.ts L1708-1742） | **P2** | 信頼度ゲート調整、反証ループ追加、status遷移ロジック強化 |
| `stargazer_alter_patterns` | ✅ 書込み中（route.ts L965,2564等 6箇所以上） | **P3** | 読み出し+移動平均計算の追加。書込みは既存のまま |
| `stargazer_alter_person_map` | ✅ テーブル存在（migration済み） | **P6** | 書込みロジック追加 + facts レイヤー接続 |
| `stargazer_alter_narratives` | ✅ テーブル存在（migration済み） | **P4** | 書込みロジック追加 + 質問トリガー条件接続 |
| `stargazer_alter_reactions` | ✅ 書込み中（route.ts L944,2662,2730） | **P5** | 読み出し+反応パターン分析の追加 |

### コード資産 → フェーズ対応

| 関数/モジュール | 場所 | 活用フェーズ |
|---------------|------|------------|
| `computeArchetypeWeight` | alterHomeAdapter.ts | **P0** ✅ |
| `buildTaggedFacts` + `FactSource` | alterHomeAdapter.ts | **P0/P1** ✅ |
| `extractLifeContextSignals` | alterUnderstanding.ts L804 | **P1** ✅ |
| `selectHypothesesForPrompt` | alterUnderstanding.ts L1969 | **P2** |
| `formatHypothesisForPrompt` | alterUnderstanding.ts L1930 | **P2** |
| `detectStructuralGaps` | alterUnderstanding.ts L1376 | **P4** |
| 仮説注入ブロック | route.ts L1708-1742 | **P2** |
| 段階的開示ブロック | route.ts L1684-1698 | **P1** ✅ |
| パターン書込みブロック | route.ts L965,2564等 | **P3** |
| リアクション書込みブロック | route.ts L944,2662,2730 | **P5** |

### 新規構築が必要なもの

| 必要なもの | フェーズ | 理由 |
|-----------|---------|------|
| 移動平均計算ロジック | P3 | patterns テーブルには書き込んでいるが、読み出して平均化するロジックがない |
| ベースラインからのズレ検出 | P5 | P3の移動平均 vs 今回のセッションを比較する仕組みが未存在 |
| 質問プール + 発火条件エンジン | P4 | `detectStructuralGaps` は「何が足りないか」を検出するが、「どう質問するか」は未実装 |
| 提示制御（頻度・トーン） | P5 | Micro Insight の「いつ・どう出すか」の制御層が未存在 |
| person_map 書込みロジック | P6 | テーブルはあるが、会話から人物を抽出→書込みする処理が未実装 |
| 仮説反証ループ | P2 | 仮説の status を `emerging → strengthening → stable → weakened` に遷移させるロジックが弱い |

---

## 3. 境界条件（7つの反証から導出）

### 反証① 「完全に理解されたくない」→ 表出制御

| 条件 | 実装箇所 |
|------|---------|
| 仮説は必ず「〜かもしれない」トーンで提示 | P2: `formatHypothesisForPrompt` のトーン強制（既存） |
| Micro Insight は1セッション最大1回 | P5: 提示頻度カウンター |
| 知っていることの10%だけ表出（設計原則4） | P5: `insightBudget` パラメータで制御 |
| 「当てに行く」応答の禁止 | 全フェーズ: system prompt の禁止ルール |

### 反証② 「Stargazer だけでは不十分」→ 多層観測

| 条件 | 実装箇所 |
|------|---------|
| アーキタイプは30セッションで影響力0.29まで低下 | P0 ✅ `computeArchetypeWeight` |
| 環境文脈（L1）が構造的傾向（L0）を補完 | P1 ✅ environment facts 注入 |
| 仮説（L4）が観測不足を明示的に埋める | P2: 仮説プール活性化 |
| ベースライン（L5）が「変化」の基準を提供 | P3: 移動平均構築 |

### 反証③ 「自己申告バイアス」→ 行動観測の補完

| 条件 | 実装箇所 |
|------|---------|
| 回答内容だけでなく回答パターン（時間・頻度・矛盾）を観測 | P3: patterns テーブル読み出し |
| 自己申告と行動の乖離を仮説として蓄積 | P2: contradiction_pattern 仮説タイプ |
| 「言っていること」と「やっていること」の差を検出 | P5: ズレ検出パイプライン |

### 反証④ 「変化検出の誤り」→ ベースライン必須

| 条件 | 実装箇所 |
|------|---------|
| 最低5セッション蓄積してからズレ検出を開始 | P3/P5: `MIN_BASELINE_SESSIONS = 5` |
| ノイズ（体調・気分）と真の変化を分離 | P3: 移動平均の窓幅で短期変動を平滑化 |
| 変化の誤検出時にロールバック可能 | P5: Micro Insight は仮説提示であり断定しない |

### 反証⑤ 「LLM理解の崩壊点」→ facts 数制限

| 条件 | 実装箇所 |
|------|---------|
| facts は1応答あたり最大7〜8個（既存制限） | 全フェーズ: `rankFactsForCategory` のスロット制限（既存） |
| 仮説注入は最大2個（既存制限） | P2: `selectHypothesesForPrompt` の max=2（既存） |
| system prompt は2000トークン以内を目標 | 全フェーズ: prompt builder の長さ検査 |

### 反証⑥ 「コスト制約」→ ローカル集約優先

| 条件 | 実装箇所 |
|------|---------|
| ベースライン計算はDBクエリ+JS集約（LLM不使用） | P3: SQL集約 + TypeScript 移動平均 |
| ズレ検出は数値比較（LLM不使用） | P5: ベースラインとの差分計算 |
| LLM呼び出しは応答生成の1回のみ（facts/仮説は事前計算） | 全フェーズ: 既存アーキテクチャ維持 |
| person_map の更新は `extractLifeContextSignals` の拡張で行う | P6: 既存関数の拡張 |

### 反証⑦ 「第二の自己」→「判断マップナビゲーター」

| 条件 | 実装箇所 |
|------|---------|
| Alter は「あなたはこういう人」とは言わない | 全フェーズ: system prompt 禁止ルール |
| 「あなたの判断パターンから見ると〜」という言い方 | 全フェーズ: prompt のトーン指示 |
| ユーザーの判断を代行しない、照らす | P5: Micro Insight は問いかけ形式 |

---

## 4. P0/P1 の位置づけ

### P0/P1 が解決する問題

```
Before P0/P1:
  ユーザーが30回対話しても、Alter の応答は初回と同じアーキタイプベース。
  「ITエンジニアやコンサルタントが向いています」のような汎用回答が出続ける。

After P0/P1:
  30セッション後: アーキタイプの影響は29%まで低下。
  蓄積された環境文脈（仕事の悩み、人間関係、生活状況）が facts として注入され、
  応答が個別化される。
```

### P0/P1 が P2+ に与える基盤

| P0/P1 の成果物 | P2+ での利用 |
|---------------|------------|
| `TaggedFact.source` フィールド | P2: 仮説由来の facts を `source: "hypothesis"` で追加可能 |
| `computeArchetypeWeight` | P3: ベースライン構築時の重み付けにも応用可能 |
| `LifeContextFactEntry` インターフェース | P6: person_map の facts 注入にも同じ構造を使える |
| `CATEGORY_FACT_PRIORITY` の `"environment"` 枠 | P2+: `"hypothesis"`, `"baseline"`, `"person"` 枠を同パターンで追加 |
| `rankFactsForCategory` の source ベース優先度制御 | 全フェーズ: 新しい source タイプも同じランキングロジックに乗る |

### P0/P1 の変更範囲（差分進化として最小）

| ファイル | 変更行数 | 変更内容 |
|---------|---------|---------|
| `lib/stargazer/alterHomeAdapter.ts` | ~140行追加 | TaggedFact.source, computeArchetypeWeight, env facts 注入, ranking 調整 |
| `app/api/stargazer/alter/route.ts` | ~15行変更 | observationCount 注入, envContext パススルー |
| `lib/stargazer/alter.ts` | 0行（前回変更済み） | AlterPersonality 7フィールドは前回の修正で追加済み |

**既存コードの削除: 0行。** 全て追加・拡張のみ。ロールバックは git revert 一発。

---

## 5. 検証計画

### P0/P1 検証（デプロイ前）

| 検証項目 | 方法 | 期待結果 |
|---------|------|---------|
| アーキタイプ漸減の動作 | `computeArchetypeWeight` の単体テスト値確認 | 0→1.0, 15→0.45, 30→0.29, 100→0.11 |
| facts ランキングの変化 | observationCount=0 と =30 で `rankFactsForCategory` 出力比較 | =30 で archetype facts が下位に移動 |
| 環境文脈注入 | `stargazer_alter_context` にテストデータ挿入 → facts に含まれるか確認 | confidence≥0.4 かつ !possibly_stale のエントリが facts に出現 |
| 型安全性 | `npx tsc --noEmit` | 新規エラー0（既存32件は無関係） |
| 応答の個別化 | 同じ質問「俺に適した職業を教えて」を (a) 新規ユーザー (b) 30セッションユーザー で比較 | (b) は環境文脈を反映した具体的回答 |

### P2〜P6 検証（各フェーズ完了時）

| Phase | 検証基準 | 合否判定 |
|-------|---------|---------|
| **P2** | 仮説が `emerging → strengthening` に遷移するケースが発生する | 10セッション以内に少なくとも1件の遷移 |
| **P2** | 反証された仮説が `weakened` に遷移する | 矛盾する回答後に status が変化 |
| **P3** | 5セッション以上のユーザーでベースラインが計算される | 移動平均値が patterns テーブルから算出可能 |
| **P3** | ベースラインからの有意なズレが検出される | 通常の変動幅を超える値が flagged される |
| **P4** | 構造的ギャップ検出時に深掘り質問が発火する | `detectStructuralGaps` の結果 → 質問プールから質問選択 |
| **P4** | 質問が自然な文脈で挿入される（唐突でない） | 5つのトリガー条件のいずれかを満たした場合のみ発火 |
| **P5** | Micro Insight が1セッション最大1回に制限される | 頻度カウンターの動作確認 |
| **P5** | 提示された Insight にユーザーが反応する | `stargazer_alter_reactions` に記録 |
| **P6** | 人物名の抽出と person_map への書込み | 会話中の人物言及 → テーブルに記録 |
| **P6** | 人物関係が判断文脈に影響する | 同じ質問でも対象人物が異なると応答が変化 |

### ロールバック戦略

| Phase | ロールバック方法 | 影響範囲 |
|-------|---------------|---------|
| P0/P1 | `git revert` 1コミット | alterHomeAdapter.ts + route.ts のみ |
| P2 | 仮説注入ブロックの信頼度閾値を1.0に設定（実質無効化） | route.ts L1714 の confidence 条件変更のみ |
| P3 | ベースライン読み出しを無効化（facts に含めない） | alterHomeAdapter.ts の baseline facts 注入をコメントアウト |
| P4 | トリガー条件を全て false に設定 | 質問発火の条件分岐を無効化 |
| P5 | insightBudget を 0 に設定 | Micro Insight の提示を停止 |
| P6 | person facts の注入を無効化 | P3 と同パターン |

全フェーズで **DB スキーマの破壊的変更は不要**。テーブルは既に存在し、ロールバックはコード側の無効化のみで完結する。

---

## 付録: 7つの反証 → 実装への変換マップ

| # | 反証 | 核心リスク | 実装での対処 | 対応フェーズ |
|---|------|-----------|------------|------------|
| 1 | 完全理解への不快感 | ユーザーが「見透かされた」と感じて離脱 | 10%表出ルール、仮説トーン、頻度制限 | P2,P5 |
| 2 | Stargazer単体の限界 | 45軸だけでは日常判断に不十分 | 多層理解（L0-L5）、アーキタイプ漸減 | P0,P1 |
| 3 | 自己申告バイアス | 言っていることと実際が乖離 | 行動パターン観測、矛盾検出 | P3,P5 |
| 4 | 変化検出の誤り | ノイズを変化と誤認 | ベースライン必須、最低5セッション | P3 |
| 5 | LLM理解の崩壊点 | facts過多で応答品質低下 | facts 7-8個制限、仮説2個制限 | 全体 |
| 6 | コスト制約 | LLM呼び出し増加で運用コスト爆発 | ローカル集約優先、LLMは応答生成のみ | 全体 |
| 7 | 「第二の自己」の誤り | 代行者と誤解される | 「判断マップナビゲーター」への再定義 | 全体 |

---

## Section G: Gemini × Aneurasync 協調アーキテクチャ（2026-03-31 CEO条件付きGO）

### 設計原則（明文化）
1. **Geminiは「意味を確定する役」ではなく「候補を出す役」**
2. Geminiのconfidenceは保存判断の根拠にしない（候補の優先順にのみ使用）
3. 既存のAneurasync反証を通らないものは理解資産に書き込まない
4. 2-call化のレイテンシは必ず実測する

### Phase A（本番利用）✅
- `surface_intent`: 発話意図の1文要約 → 応答生成プロンプトに注入
- `emotional_temperature`: 0.0-1.0 → `userState.emotional_load` を 70:30 で補正
- `relational_context`: 対人文脈 → `relationalLens.target_role` のフォールバック補完
- `energy_direction`: seeking/retreating/ambivalent/neutral → 応答生成プロンプトに注入
- `notable_expressions`: 特徴的な言い回し → 応答生成プロンプトに注入

### Phase B（shadow log only）✅
- `implied_meanings`: 含意候補（max 5） → analytics に記録のみ、理解資産化しない
- `unspoken_candidates`: 言外の候補（max 3） → analytics に記録のみ、保存禁止

### Phase C（将来・未実装）
- `implied_meanings` を反証専用入力として使う
- `unspoken_candidates` は保存禁止・返答直結禁止で、補助信号としてのみ試験導入

### ファイル構成
- `lib/stargazer/alterUtteranceReading.ts` — 型定義、JSON Schema、システムプロンプト、バリデーション、ヘルパー
- `app/api/stargazer/alter/route.ts` — Phase 0 注入（State Layer直前）、Phase A補正、Phase Bシャドウログ、応答プロンプト注入

### Graceful Degradation
- Phase 0 の LLM 呼び出しが失敗した場合、`utteranceReading = null` のまま既存パイプラインが完全に動作
- 全ての Phase A 補正は `if (utteranceReading)` ガード付き
- 既存コードの削除: ゼロ

### 計測
- `utterance_reading_latency_ms`: Phase 0 の LLM 呼び出し所要時間
- `home_alter_judgment` analytics に `utterance_reading` メトリクス統合
- `utterance_reading_shadow` analytics に Phase B の全候補をログ
