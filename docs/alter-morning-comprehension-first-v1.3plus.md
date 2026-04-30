# Alter-Morning Comprehension-First Architecture v1.3+

**Status**: 設計段階（CEO 最終承認待ち）
**日付**: 2026-04-21
**前提**: Bug 1 / Bug 2 暫定止血は main に合流済み（c7527bce）
**目的**: Alter-Morning planner を「少しずつ」ではなく「構造的厚みを持った 2 Wave」で完成させる
**北極星**: Claude と同等の論理的密度 × ユーザの納得感・満足感・幸福感

---

## 0. 方針

- **時間をかけて Alter を完成させる**。小出しで層を積むと未完状態が長引く。
- **層は合理的に厚く**。3 層スケルトン（Comprehension / Planning / Expression）を北極星に保ちつつ、各層内部を精密にサブステージ化。
- **物理モジュールは 3**、論理サブステージは 8。7 層物理分割（GPT 初稿）は却下、単一パイプライン回帰も却下。
- **2 Wave 実装**: Wave 1 Core Reasoning Slice（L1+L2 核）→ Wave 2 Reality + Expression Slice（L2 後段+L3）。

---

## 1. 上位アーキテクチャ（3 層 / 8 サブステージ）

```
┌─────────────────────────────────────────────────────────────────┐
│ L1 Comprehension  — LLM が発話を provenance 付き 5W1H+ に畳む    │
│   ├─ L1.0 Rule Pre-Parse     （明示時刻/起点のみ、保守的）        │
│   ├─ L1.1 Event Segmentation （LLM / Structured Output 強制）    │
│   └─ L1.2 Slot & Provenance Checker                              │
│         ├─ source_span が utterance に実在するか deterministic   │
│         └─ missing_semantic_critical の判定                      │
├─────────────────────────────────────────────────────────────────┤
│ L2 Planning       — 決定論 Solver が plan graph を構築            │
│   ├─ L2.1 Gap Resolver       （semantic / solver_blocker 2系統）  │
│   ├─ L2.2 Time Solver        （startTime / transport 整合）       │
│   └─ L2.3 Place Grounder     （place_ref → real place 解決）      │
├─────────────────────────────────────────────────────────────────┤
│ L3 Expression     — LLM が plan を忠実に語る                      │
│   ├─ L3.1 Narration          （Few-shot / tone 固定）             │
│   └─ L3.2 Faithfulness Checker（plan↔narration 差分）             │
└─────────────────────────────────────────────────────────────────┘
```

**実装モジュールは 3**（`comprehension/`, `planning/`, `expression/`）。
**テスト単位は 8 サブステージ境界**で contract test を書く。

---

## 2. L1 Schema（provenance 付き 重み付き 5W1H+）

### 2.1 Event オブジェクト

```ts
type Event = {
  event_id: string;                              // 層内採番
  turn_mode: "create" | "modify";                // Turn 2+ 対応
  target_ref: string | null;                     // modify 時の対象 event_id
  target_ref_confidence: "low" | "medium" | "high" | null;
  change_scope: "replace" | "patch" | "append" | "remove" | null;

  when: {
    startTime: string | null;                    // "HH:mm"
    timeHint: "morning" | "noon" | "afternoon" | "evening" | null;
    provenance: Provenance;
  };
  where: {
    place_ref: string | null;                    // 記号（まだ実 place ではない）
    placeType: string | null;
    provenance: Provenance;
  };
  what: {
    activity: string;
    activityCanonical: string;
    provenance: Provenance;
  };
  who: string[];                                 // 省略可、critical に入れない
  transport: string | null;
  certainty: "asserted" | "tentative" | "inferred";

  missing_semantic_critical: ("when" | "where" | "what")[];
  missing_solver_blockers: ("transport" | "end_time" | "endpoint" | "place_resolution")[];
};

type Provenance = {
  source_type: "utterance" | "baseline" | "inferred" | "tool";
  source_span: string[];                         // 発話内の根拠文字列
  provenance_confidence: "low" | "medium" | "high";
  from_utterance: boolean;                       // 後方互換フラグ
};
```

### 2.2 Provenance の deterministic 検査

- L1.1 で LLM が `source_type: "utterance"` と申告した場合、L1.2 は `source_span[]` の各文字列が **実際に userMessage 内に正規化一致するか** を regex/substr で検査する。
- 不一致の場合、その slot は `source_type: "inferred"` に降格し、`missing_semantic_critical` に当該 slot を追加。
- これにより Bug 1 hallucinate を schema 層で封じる（LLM の嘘 true は checker で弾ける）。

### 2.3 欠損の 2 系統分離

| 系統 | 対象 slot | 帰属 | 失敗時アクション |
|---|---|---|---|
| `missing_semantic_critical` | when / where / what | L1 理解層 | clarify（意味理解の不足） |
| `missing_solver_blockers` | transport / end_time / endpoint / place_resolution | L2 計画層 | Solver 内部解決 or clarify |

**根拠**: 「意味が取れたか」と「解けるか」を分離することで、clarify の発話が自然になる（「何時頃？」と「どこからどこまで？」は違う質問）。

### 2.4 Turn 2+ 参照性

- `turn_mode: "modify"` 時、`target_ref` は L1 が指し示す既存 event_id。
- `target_ref_confidence` が `low` の場合、L2.1 Gap Resolver は **置き換え確定せず clarify**。
- `change_scope` で差分適用の粒度を schema に持ち上げる。Bug 2 の「segmentId=null → 黙殺」の恒久対処。

---

## 3. L2 Planning 詳細

### 3.1 L2.1 Gap Resolver 戦略

```
per event:
  semantic = missing_semantic_critical
  blockers = missing_solver_blockers

  if |semantic| >= 2:
    → clarify 粗 time bucket（「朝・昼・夜どれ？」）
  elif semantic == ["when"]:
    → clarify 「何時頃？」
  elif semantic == ["where"]:
    → L2.3 Place Grounder へ defer（clarify しない、候補解決優先）
  elif semantic == ["what"]:
    → clarify 「何する予定？」
  elif |semantic| == 0 and |blockers| >= 1:
    → L2.2 / L2.3 に内部解決を試させる
    → 2+ blockers が連鎖し tentative が積み上がる場合のみ clarify
```

### 3.2 L2.2 Time Solver（独立純関数）

- 責務: `when.startTime` / `transport` 所要時間 / event 間の順序整合。
- 入力: `Event[]`（place_ref 段階で可）
- 出力: `TimeLine{ events: [{event_id, startTime, endTime, transport_duration}] }`
- **LLM を呼ばない**。Bug 2 で露呈した「LLM が時刻整合を壊す」問題の恒久対処。
- `startTime` 欠落時は `timeHint` から anchor（morning=09:00, noon=12:00, afternoon=15:00, evening=19:00）を置き、transport 逆算。

### 3.3 L2.3 Place Grounder

- 責務: `place_ref` → 実 place（候補 or 確定）
- **Wave 1 では辞書ベース resolver のみ**（Nominatim/Google Places は Wave 2 以降で別議論）。
- tentative place の扱い:
  - **A' 採用**: Solver に入れてよい。ただし固定アポに波及する tentative が 2 つ以上連鎖する場合は clarify。narration では必ず "〜あたり" で揺らす。tentative を confirmed に昇格しない。

---

## 4. 層別 Checker（Verifier 分散）

| 層 | Checker | 失敗時 fallback |
|---|---|---|
| L1.2 | Slot & Provenance Checker | source_span 不一致 → inferred 降格 → semantic_critical 追加 → clarify |
| L2.2 | Time Solver 内部 | transport 逆算破綻 → clarify / 所要短縮 |
| L2.3 | Place Grounder 内部 | 辞書 miss → tentative 維持 or clarify |
| L3.2 | Faithfulness Checker | plan と narration の差分検出 → 再生成 1 回 → ダメなら plan 直列化 |

**単一 Verifier に集約しない理由**: 失敗原因の帰属が曖昧になる。各層出口で固有の checker を持つ。

---

## 5. 実装 Wave

### Wave 1: Core Reasoning Slice（L1 + L2 核）

**ゴール**: Alter Morning の本質が変わる単位。Wave 1 完了時点で Bug 1/2/3/4 系は schema 由来の再発耐性を持つ。

含めるもの:
1. L1 Event schema（provenance / target_ref / change_scope 全部入り）
2. OpenAI Structured Outputs（json_schema 強制）+ deterministic checker
3. L1.2 Slot & Provenance Checker
4. L2.1 Gap Resolver（2 系統分離）
5. L2.2 Time Solver（LLM 切り離し純関数化）
6. Turn 2+ modify 経路（target_ref / change_scope 駆動）

**除外**: Place 実解決、narration、faithfulness、rule pre-parse

### Wave 2: Reality + Expression Slice（L2 後段 + L3）

**ゴール**: Alter が現実に触れ、忠実に語る。

含めるもの:
1. L2.3 Place Grounder（辞書ベース resolver）
2. L3.1 Narration（Few-shot / tone）
3. L3.2 Faithfulness Checker
4. L1.0 Rule Pre-Parse（最小・保守的）

---

## 6. 却下事項（明示）

- ❌ GPT 初稿の L0-L6 物理 7 層分割（contract コスト過大）
- ❌ CEO 5W1H 対等扱い（who は critical に入れない）
- ❌ CEO「1-24h タイムライン先置き」（place 未決で時刻確定は順序誤り。タイムラインは L2.2 内部出力）
- ❌ 単一末端 Verifier（層別 checker に分散）
- ❌ 大 prompt 1 本化（L1/L3 で prompt を分離、役割単一化）
- ❌ `from_utterance` 単独 gate（LLM が嘘の true を返せる → provenance 系に拡張）
- ❌ `missing_critical` 一系統（transport 軽視の L2 詰まり防止 → 2 系統分離）
- ❌ Nominatim/Google Places を Wave 1 で接続（IO バウンド化 / 内部一貫性優先）

---

## 7. Q1-Q3 決定（GPT 助言反映）

- **Q1. tentative の扱い → A' 採用**
  - Solver に入れてよい / 2+ 連鎖時のみ clarify / narration で必ず揺らす / confirmed 昇格禁止
- **Q2. L1 Structured Output → A' 採用**
  - OpenAI Structured Outputs + deterministic checker 必須
- **Q3. Place Grounder 外部 API → A 採用**
  - Wave 1 は辞書ベースのみ。外部 API は Wave 2 以降で別議論

---

## 8. 既存 triage コードの扱い

- `llmPlanExtractor.ts` の `userMessage` utterance gate → Wave 1 の L1.2 Slot & Provenance Checker に発展継承
- `llmDeltaParser.ts` の `deriveTimeHintFromStartTime` → Wave 1 の L1 schema normalizer に吸収
- triage コード自体は Wave 1 着手まで削除しない（踏み石として保持）

---

## 9. CEO 確認事項（v1.3+ 承認の前に）

以下 5 点のみ最終確認お願いします。他は本書通り進めます。

**Q-A. Wave 1 の対象範囲**
- 本書 §5 Wave 1 の 6 項目で過不足ないか
- 特に Turn 2+ modify を Wave 1 に含めて良いか（Bug 2 再発防止上は必要）

**Q-B. Structured Outputs の LLM ランタイム**
- OpenAI `response_format: { type: "json_schema", strict: true }` 前提でよいか
- 現行 alter-morning が別モデル/別 provider を使っている場合、当該 provider の structured output サポート有無確認が先

**Q-C. `source_span` の粒度**
- 文字列完全一致 or 正規化一致（句読点・大小文字無視）どちらを最小基準にするか
- 本書推奨: 正規化一致（triage の既存ロジックと整合）

**Q-D. `target_ref` の解決方法**
- L1 LLM が event_id を直接返す / L1 は自然言語ヒント（「朝の予定」）を返し L2 が解決
- 本書推奨: 後者（LLM に内部 ID を扱わせると hallucinate リスク）

**Q-E. Wave 1 着手ブランチ**
- `feat/alter-morning-comprehension-first-wave1` を main から切って進めるか
- 本書想定: main 直接作業は避け、Wave 単位で feature branch + PR 経由

---

## 10. 成功基準（Wave 1 完了時）

- Bug 1（hallucinate place）: schema の provenance checker で再発 0
- Bug 2（modify 黙殺）: target_ref / change_scope 経由で全 modify 発話が event-level で扱われる
- Time integrity: LLM に時刻計算を任せない。Time Solver 単体テストで境界時刻全 pass
- Clarify 発話: semantic / solver_blocker 分離で自然な日本語
- 既存 alter-morning テスト全通過 + Wave 1 用 contract test 追加

---

**次アクション（CEO 承認後）**: 本書を main に commit → feature branch 切り出し → Wave 1 着手
