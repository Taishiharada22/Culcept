# Comprehension-First v1.3+ Wave 2 設計書 — Reality + Expression Slice

**Status**: 設計段階（CEO 最終承認待ち）
**日付**: 2026-04-21
**前提**: Wave 1 (Core Reasoning Slice) main 合流済み（dbcdc5d1）
**対象範囲**: Comprehension-First v1.3+ §5 Wave 2
**北極星**: Alter が「現実に触れる」「忠実に語る」層を完成させ、Morning Protocol を end-to-end で閉じる

---

## 0. Wave 2 の位置づけ（全体行程の再確認）

```
Phase 0 [完了] Bug 1/2 暫定止血
Phase 1 [完了] Morning 論理設計 v1.3+
Phase 2 [完了] Wave 1 Core Reasoning Slice (L1 + L2 核)
Phase 3 [今ここ] Wave 2 Reality + Expression Slice (L2 後段 + L3)   ★
Phase 4 実機再検証 (Morning Protocol end-to-end)
Phase 5 Morning 以外 Protocol 横展開
Phase 6 alter-morning → alter 統合
```

**Wave 2 ゴール（端的）**:
> Wave 1 で固めた plan graph を「実 place」「忠実な narration」「軽量 rule 前処理」で現実世界と言語に接続し、Morning Protocol の論理パイプラインを閉じる。

**Wave 2 完了条件**:
- Comprehension → Planning → Expression の 3 層が contract で貫通する
- 実 place 解決が `place_ref` ↔ real place の 2 段化で分離され、テストが外部 IO に依存しない
- narration が plan に対して忠実性チェックを通過する
- 既存 alter-morning 916 tests + Wave 2 新規 ≧40 tests 全通過、tsc error 0 (Wave 2 diff)

---

## 1. Wave 2 スコープ（v1.3+ §5 Wave 2 再掲 + 詳細化）

| # | 項目 | 層 | Wave 1 との依存関係 |
|---|---|---|---|
| 2-1 | L2.3 Place Grounder（辞書ベース resolver） | L2 | `Event.where.place_ref` → real place |
| 2-2 | L3.1 Narration（Few-shot / tone 固定） | L3 | Wave 1 の `TimeLine` + `Event` を入力 |
| 2-3 | L3.2 Faithfulness Checker | L3 | L3.1 出力 vs plan の差分検出 |
| 2-4 | L1.0 Rule Pre-Parse（最小・保守的） | L1 | L1.1 LLM 入力の前段 |
| 2-5 | L3 Expression Pipeline（L3.1 + L3.2 連結） | L3 | 2-2 + 2-3 |
| 2-6 | E2E Contract Test（L1 → L2 → L3 貫通） | cross | Wave 1+2 全モジュール |

---

## 2. L2.3 Place Grounder 設計

### 2.1 責務

- Wave 1 で得た `Event.where.place_ref`（記号）を **実 place 候補** に解決する
- Wave 2 では **辞書ベースのみ**（Q-3 = A 決定）。外部 API は呼ばない
- tentative place は候補複数のまま保持。narration で "〜あたり" と揺らす

### 2.2 辞書ソース

既存資産を流用（再実装しない）:
- `lib/alter-morning/placeTable.ts` — known_base / chain_brand / generic_place の canonical table
- `lib/alter-morning/personAlias.ts` — 不要（who 層の別用途）
- `lib/alter-morning/activityVocabulary.ts` — activity 正規化用（place_ref 解決は対象外）

**新規追加なし**。placeTable の lookup を純関数 wrapper で包む。

### 2.3 型設計

```ts
// lib/alter-morning/planning/placeGrounder.ts

export interface PlaceCandidate {
  /** 正式名称 */
  resolvedName: string;
  /** 分類（known_base / chain_brand / generic_place / exact_proper_noun） */
  placeType: string;
  /** 辞書由来の確信度 */
  confidence: "high" | "medium" | "low";
  /** 辞書ソース名（lookup debug 用） */
  source: "placeTable" | "user_baseline" | "unresolved";
}

export interface GroundedPlace {
  event_id: string;
  place_ref: string;
  candidates: PlaceCandidate[];
  /** 選択された候補 (最上位 confidence) */
  selected: PlaceCandidate | null;
  /** grounding 結果の状態 */
  status: "resolved" | "ambiguous" | "unresolved";
}
```

### 2.4 アルゴリズム

```
for each event with place_ref != null:
  if placeType == "known_base":
     placeTable から "自宅" / "会社" / "オフィス" 等を lookup
     user baseline（プロフィール）と照合
     → status: resolved
  elif placeType == "chain_brand":
     placeTable の chain_brand entries から部分一致（正規化後）
     → 単一一致: status: resolved
     → 複数一致: status: ambiguous（narration で "〜" と揺らす）
  elif placeType == "generic_place":
     placeTable の generic entries から部分一致
     → status: ambiguous（外部 API が必要）
  elif placeType == "exact_proper_noun":
     辞書に無ければ status: unresolved
     narration で place_ref をそのまま採用（ユーザ発話尊重）
  else:
     status: unresolved
```

**設計決定（重要）**:
- Wave 2 では **外部 API を呼ばない**。exact_proper_noun の実在確認は Wave 3 以降（Phase 5）
- unresolved は「エラー」ではなく「辞書外だがユーザ発話にあるから使う」扱い。narration 側で place_ref 文字列をそのまま出す

### 2.5 tentative 連鎖処理

Wave 1 Gap Resolver の `tentative_chain` clarify と整合させる:
- Place Grounder は Gap Resolver の後段。tentative が 2+ 連鎖している場合は既に clarify に戻っているので、ここは「tentative 単独」のみ扱う
- tentative 単独は candidates 複数を許容し status: ambiguous にする

---

## 3. L3.1 Narration 設計

### 3.1 責務

- Wave 1 の `ComprehensionResult`（Event[]）+ `TimeLine`（Wave 1 solveTimeLine 出力）+ `GroundedPlace[]`（Wave 2 L2.3 出力）を入力に、**自然な日本語 narration** を生成する
- LLM 呼び出し層。ただし role は「語る」だけ。**時刻計算・place 決定は絶対にしない**（Wave 1 原則継承）

### 3.2 Prompt 構造

```
system:
  あなたは Alter Morning の語り手です。
  受け取った plan 構造を日本語で忠実に語ってください。
  以下のルールを厳守してください:
    - plan graph にない予定を追加しない
    - plan graph にない時刻・場所を推測で補わない
    - tentative 印の slot は「〜あたり」「〜かも」で揺らす
    - 時刻は 24 時間表記で固定（「9時」「12時30分」）
    - who (同行者) は言及されている場合のみ触れる

few-shot examples:
  [入力 plan JSON, 出力 narration] x 3

user:
  <ComprehensionResult + TimeLine + GroundedPlace[] を JSON で貼付>
```

### 3.3 型設計

```ts
// lib/alter-morning/expression/narration.ts

export interface NarrationInput {
  comprehension: ComprehensionResult;
  timeline: TimeLine;
  grounded: GroundedPlace[];
}

export interface NarrationOutput {
  /** 語られた本文 */
  text: string;
  /** 語られた event_id 列（faithfulness checker 用） */
  covered_event_ids: string[];
  /** LLM の generation metadata */
  metadata?: {
    model?: string;
    tokens?: number;
  };
}

export function narrate(input: NarrationInput): Promise<NarrationOutput>;
```

### 3.4 Wave 2 実装方針

- Wave 2 では **LLM adapter の実配線は optional**（stub も可）
- Wave 2 の重要度: narration 層の **入出力 contract** を確定し、L3.2 checker がテスト可能になる状態
- LLM provider 配線は Wave 2 末尾で行うが、テストは deterministic stub で実装する

---

## 4. L3.2 Faithfulness Checker 設計

### 4.1 責務

- narration 本文 vs plan graph の差分を検出
- 「plan にない時刻・場所が narration に出現していないか」を deterministic に検査
- 違反検出時は L3 内で 1 回再生成、ダメなら plan の直列化 fallback

### 4.2 検査ルール

```ts
export type FaithfulnessViolation =
  | "event_not_covered"        // plan にある event_id が narration に出ない
  | "extra_time_in_text"       // plan の startTime 以外の時刻が narration に出る
  | "extra_place_in_text"      // plan の place_ref 以外の proper noun が narration に出る
  | "missing_tentative_hedge"; // tentative event が narration で断定調に語られる
```

### 4.3 アルゴリズム

```
input: NarrationOutput, NarrationInput

1. covered_event_ids と comprehension.events の event_id 集合を比較
   → event_not_covered を検出

2. narration.text から HH:mm / HH時 パターンを抽出
   → plan の startTime 集合に含まれない時刻 → extra_time_in_text

3. narration.text から proper noun 候補を抽出（カタカナ2+文字 + 既知固有名）
   → plan の place_ref + grounded.resolvedName に含まれない → extra_place_in_text

4. tentative certainty の event について、narration に hedge 語
   (「あたり」「かも」「〜予定」等) が含まれるか確認
   → 含まれない → missing_tentative_hedge
```

### 4.4 Fallback 戦略

```
if violations.length == 0:
  narration をそのまま返す
else if retry_count < 1:
  narration を再生成 (violation list を prompt に追加)
else:
  plan graph を deterministic に直列化した文字列を返す
  (「9時にサドヤでコーヒー / 12時にランチ」のようなミニマル形式)
```

---

## 5. L1.0 Rule Pre-Parse 設計

### 5.1 責務

- **明示的に rule で取れる情報のみ** を LLM 入力前に抽出する
- Wave 2 では以下 **2 項目に限定**:
  1. 数字時刻 (`9時`, `09:00`, `9:30`, `14時30分`)
  2. 明示的起点 (`自宅から`, `ホテルから`, `家を出る`)
- 曖昧語（「朝」「サドヤ」等）は触れない → LLM に渡す

### 5.2 型設計

```ts
// lib/alter-morning/comprehension/rulePreParse.ts

export interface RulePreParseHints {
  /** 発話から抽出した明示時刻 */
  explicit_times: Array<{ value: string; span: string; index: number }>;
  /** 発話から抽出した明示起点 */
  explicit_start_points: Array<{ value: string; span: string; index: number }>;
}

export function preParseUtterance(utterance: string): RulePreParseHints;
```

### 5.3 LLM prompt への注入

L1.1 の prompt に以下を追加:

```
前処理で以下の情報が抽出されました（参考情報）:
- 明示時刻: 9:00, 12:30
- 明示起点: 自宅

上記は rule で確実に取れた情報です。source_span に入れるときはこれらを優先してください。
ただし、rule に無い情報も発話から自由に抽出してください。
```

**設計決定**: rule 抽出結果は**強制しない**（LLM が override できる）。あくまで hint として渡す。

### 5.4 Wave 2 最小スコープ

誤爆防止のため、Wave 2 では **明示時刻 + 明示起点のみ**。activity / place は Wave 3 以降で検討。

---

## 6. L3 Expression Pipeline（L3.1 + L3.2 連結）

```ts
// lib/alter-morning/expression/pipeline.ts

export async function runL3Pipeline(
  input: NarrationInput,
): Promise<NarrationOutput> {
  let attempt = 0;
  let narration = await narrate(input);

  while (attempt < 2) {
    const violations = checkFaithfulness(narration, input);
    if (violations.length === 0) return narration;
    if (attempt === 0) {
      narration = await narrate({ ...input, feedback: violations });
      attempt += 1;
      continue;
    }
    return serializePlanDeterministic(input); // fallback
  }

  return narration;
}
```

---

## 7. E2E Contract Test（L1 → L2 → L3 貫通）

### 7.1 テストシナリオ（最低 5 件）

1. **Happy path**: "朝はサドヤでコーヒー、12時にランチ"
   - L1: 2 events 抽出 / L2: timeline 整合 / L2.3: サドヤ resolved, ランチ ambiguous / L3: 自然 narration

2. **Hallucinate rejection**: "朝はカフェで軽く"
   - L1: 発話外 proper noun を LLM が吐いても checker で降格
   - L3: narration に発話外固有名が出ない

3. **Turn 2+ modify**: Turn 1 で "朝はカフェ"、Turn 2 で "朝の予定をマックに"
   - L2 modifyRouter: 朝 → event_1 を high confidence で解決
   - L3: 更新後の plan を narration

4. **Tentative chain clarify**: "朝あたりカフェ、昼もどこかで"
   - L2.1 Gap Resolver: tentative_chain clarify 起動
   - L3 に到達せず clarify 文を返す

5. **Undetermined startTime**: "どこかでランチ"
   - L2.2 Time Solver: undetermined_startTime violation
   - L2.1 Gap Resolver: specific_time clarify

### 7.2 テスト戦略

- LLM 呼び出し部分は stub（deterministic output）
- Place Grounder は placeTable fixture で決定論化
- Faithfulness Checker は独立に unit test
- E2E は L1 stub → L2 実体 → L3 stub で「層間 contract が貫通するか」のみ検証

---

## 8. 実装順（Wave 2 内部）

```
Step 1: L1.0 Rule Pre-Parse（独立、小規模）
Step 2: L2.3 Place Grounder（Wave 1 Event を拡張せず別モジュール）
Step 3: L3.2 Faithfulness Checker（pure 関数、単体テスト容易）
Step 4: L3.1 Narration（LLM stub + contract 型）
Step 5: L3 Expression Pipeline（Step 3+4 連結）
Step 6: E2E Contract Test（Wave 1+2 全層貫通）
Step 7: Wave 2 PR + CI + CEO マージ承認
```

**理由**:
- LLM 配線は Step 4 まで触らない → Step 1-3 は純 TS で完結、高速イテレーション
- Faithfulness Checker (Step 3) を先に書けば、Narration (Step 4) の出力を即検証できる

---

## 9. 却下事項（明示）

- ❌ Nominatim / Google Places 外部 API 接続（Q-3=A 決定。Wave 3 以降で別議論）
- ❌ Wave 1 モジュールの書き換え（Wave 2 は**追加のみ**）
- ❌ 既存 `llmPlanExtractor` / `llmDeltaParser` の削除（Wave 2 では並行存在）
- ❌ L1.0 Rule Pre-Parse での曖昧語（「朝」「サドヤ」等）の抽出（誤爆リスク）
- ❌ Narration 層での時刻計算・place 決定（Wave 1 原則継承、違反厳禁）

---

## 10. Wave 2 完了時の達成水準

- Morning Protocol の 3 層が contract で貫通し、end-to-end で動作する
- place_ref ↔ real place の分離がテスト可能（外部 IO 非依存）
- narration が plan に対して忠実性検証を通過する
- 既存 916 tests + Wave 2 新規 ≧40 tests = 956+ tests PASS
- Wave 2 diff 由来の tsc error 0

**Wave 2 完了 → Phase 4 移行**:
- Phase 4: Morning Protocol 実機再検証（CEO 体感確認 / handoff 2026-04-18 の 4 bugs が E2E で再発しないことを実機で確認）

---

## 11. CEO 確認事項（Wave 2 着手前）

以下 4 点のみ最終確認お願いします。他は本書通り進めます。

### Q-1. L2.3 Place Grounder の辞書ソース
- A: 既存 `placeTable.ts` の流用のみ（新辞書ファイル追加なし）
- B: 新辞書ファイル（`placeGroundingDict.ts`）を追加
- **本書推奨: A**（既存資産を壊さず流用）

### Q-2. L3.1 Narration の LLM provider 配線タイミング
- A: Wave 2 内で OpenAI 配線まで完了させる
- B: Wave 2 は contract + stub まで。LLM 配線は Wave 2 末尾 PR の後段に別 PR で
- **本書推奨: B**（LLM 呼び出しは独立変数。構造を先に閉じる）

### Q-3. L3.2 Faithfulness Checker の `extra_place_in_text` 検出厳密度
- A: カタカナ2+文字すべてを proper noun 候補とする（誤検出許容）
- B: 既知固有名辞書に載っている語のみ検査（取りこぼし許容）
- **本書推奨: A**（hallucinate 防止優先。誤検出時は retry で吸収）

### Q-4. Wave 2 PR 単位
- A: Wave 2 全体を 1 PR で一気にマージ
- B: Step 1-3 (純 TS) と Step 4-6 (LLM 絡み) で 2 PR に分割
- **本書推奨: A**（Wave は「厚みを持たせる単位」。細切れは CEO 方針と逆行）

---

## 12. 次アクション

1. **本書 CEO 承認**（Q-1〜Q-4 回答）
2. **Wave 2 branch 切り出し**: `feat/alter-morning-comprehension-first-wave2` を main から
3. **Wave 1 branch 削除**: Wave 2 branch 作成確認後に `feat/alter-morning-comprehension-first-wave1` 削除
4. **Wave 2 実装着手**（§8 Step 1-7）
