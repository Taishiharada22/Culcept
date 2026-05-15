# CoAlter D-2-e3-b / c / d / e Sub-Phase Audit

**作成日**: 2026-05-15
**ステータス**: docs-only audit、runtime / code 変更なし
**起草 branch**: `docs/coalter-implementation-unblock-audit-batch` (Batch-A の 2/3)

## §0 本書の position

### §0.1 目的

PR #120 audit v2 §6.3 #9 で挙げられた「**D-2-e3-b / c / d / e 詳細 (本 audit で未把握) の説明**」を解消する。既存 design docs を一次資料として、各 sub-phase の正体・完了状態・実装着手順序を確定する。

CEO 戦略判断要項 §6.3 14 項目のうち、本 audit で **#9 が解消**。

### §0.2 Source-of-truth Hierarchy

main merge 済 PR > 実コード > **既存 docs** (本書 D-2-e3 系統は主に docs から取得) > memory > 古い docs。

### §0.3 制約

- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ env / production 変更 / Step E 開始 / bug1 cleanup / Stargazer pivot
- ✅ docs-only audit

---

## §1 D-2-e3 全体 sub-phase 構造

### §1.1 D-2-e3 = "real provider connection" (PR #111 design review)

**正本**: `docs/coalter-d2e3-a1-real-connection-design-review.md` (PR #111、`93b85d91` merged) + `docs/coalter-d2e3a-implementation-design-review.md` (PR #109)

D-2-e3 = 三段式 movie domain の **real provider connection phase**、Step D mainstream の最終 sub-phase。

D-2-e2 (`COALTER_THREE_STAGE` grand kill switch wiring) 完了 (PR #102) 後、D-2-e3 で **provider 接続 + real retrieval** を実装する大区分。

### §1.2 sub-phase a / b / c / d / e の構造

`docs/coalter-d2e3-a1-real-connection-design-review.md:85`:

```
[D-2-e3-a: provider-agnostic implementation (現在進行中)]
   ↓
[D-2-e3-b / c / d / e: 残 sub-phase]
```

各 sub-phase の正体 (既存 docs 一次資料から):

| Sub-phase | 名称 | 正体 (既存 docs より) | 状態 |
|---|---|---|---|
| **D-2-e3-a** | provider-agnostic implementation | theater listing 取得 (PR #109 §1) | ⚠ 部分完了 (a1-impl-1a〜1i 完、a1-impl-1c/2/3 凍結、a2/a3/a4 凍結) |
| **D-2-e3-b** | 残 sub-phase (未明示) | ⚠ **既存 docs に明示説明なし** | ❌ 未把握 (本 audit で再定義) |
| **D-2-e3-c** | candidate source | provider 一覧 from `coalter-d2e3-source-compliance.md:67` | ❌ 未着手 |
| **D-2-e3-d** | M0 lens 実接続 | engine.ts touch (`coalter-d2e3-a1-real-connection-design-review.md:566`) | ❌ 未着手 |
| **D-2-e3-e** | prefetch + diagnostics 仕上げ | `coalter-d2e3-a1-real-connection-design-review.md:567` | ❌ 未着手 |

---

## §2 D-2-e3-a (provider-agnostic implementation) 完了 scope

### §2.1 PR #110-#119 (a0 + a1-impl-1a〜1i) 完了

| Phase | PR | 内容 |
|---|---|---|
| a0 | #110 (`6dc32899`) | provider-agnostic pure foundation |
| a1 design | #111 (`93b85d91`) | real connection design review (docs-only) |
| a1-impl-1a | #112 (`87b03c93`) | Anthropic provider mock-only scaffold |
| a1-impl-1b | #113 | extractTheaters 構造化 (P1 JSON + P2 regex) |
| a1-impl-1d | #114 | Anthropic cost estimate |
| a1-impl-1e | #115 | Source Candidate semantic separation |
| a1-impl-1f | #116 | cache token observability |
| a1-impl-1g | #117 | inference_geo observability |
| a1-impl-1h | #118 | pricing snapshot multi-model |
| a1-impl-1i | #119 (`bc758e96`) | WebSearch error observability |

### §2.2 a 内部の凍結要素

| Phase | 内容 | 状態 |
|---|---|---|
| **a1-impl-1c** | BudgetUsageProvider Supabase 接続 | 🔵 凍結 |
| **a1-impl-2** | OpenAI scaffold | 🔵 凍結 |
| **a1-impl-3** | EXA scaffold | 🔵 凍結 |
| **a2** | env flag (provider 選択) | 🔵 凍結 |
| **a3** | movieOrchestrator wiring | 🔵 凍結 |
| **a4** | citation UI design | 🔵 凍結 |

→ a の completion 度 ≒ **40-50%** (a0 + a1-impl-1a/b/d/e/f/g/h/i 完了、a1-impl-1c/2/3 + a2/a3/a4 凍結)。

---

## §3 D-2-e3-b の正体 (本 audit で再定義)

### §3.1 既存 docs での明示説明

`docs/coalter-d2e3-a1-real-connection-design-review.md` を全文 grep:
- `D-2-e3-b` mention は **L85 (sub-phase 一覧) のみ**
- 個別説明は **既存 docs に存在しない**

### §3.2 推論による正体特定 (deep reasoning)

D-2-e3-a / c / d / e の役割から逆算:

| Sub-phase | 役割 |
|---|---|
| a | provider interface 抽象化 (Anthropic / OpenAI / EXA、theater listing 取得) |
| c | candidate source (provider 一覧、候補生成 source) |
| d | M0 lens 実接続 (Stage 1 Understand bundle と接続、engine.ts touch) |
| e | prefetch + diagnostics 仕上げ |

→ a (theater listing) + c (candidate source) は **retrieval source 系**、d (lens 実接続) は **Stage 1 統合**、e は **仕上げ**。

**b は何の役割か?** — 推論候補:

- **候補 1**: a (theater) と c (candidate) の **中間 sub-phase** = 「provider response 標準化 / normalization layer」
- **候補 2**: a と c の **間に挟む integration test phase** = 「provider e2e smoke verification」
- **候補 3**: **`movieOrchestrator` 内部の provider call site 設計** (a3 wiring の前段、a と c の structural prereq)

`docs/coalter-d2e3a-implementation-design-review.md:126` の記述:
> `lib/coalter/engine.ts` (**D-2-e3-d のみ touch 許可**、D-2-e3-a では touch なし)

→ b は engine.ts を **touch しない**、provider 抽象化レイヤー内に閉じる sub-phase の可能性が高い。

### §3.3 推奨 (CEO 判断材料)

**b の正体は既存 docs で確定的に説明されていない**。本 audit の推奨:

- b は **placeholder** の可能性 (D-2-e3 mainstream §3.3 で 5 sub-phase を区切るために b を確保したが、a の細分化で実体不要になった)
- もしくは **「provider response normalization」** = a (raw response) と c (candidate source 統合) の中間
- **CEO 判断請求**: b を **撤廃** するか、**明示再定義** するかを確定

---

## §4 D-2-e3-c (candidate source) 完了 scope

### §4.1 既存 docs 記述

`docs/coalter-d2e3-source-compliance.md:67`:
> D-2-e3-a (theater listing 取得) + D-2-e3-c (candidate source) で利用候補となる **provider 一覧**

→ c は **provider 一覧から候補を集約する layer**。a (theater) と d (lens) の中間で **candidate を Stage 2 Curate に流す**。

### §4.2 想定実装

- input: provider 一覧 (Anthropic / OpenAI / EXA、a で抽象化済)
- output: 候補集合 (`CandidatePool` 拡張)
- 既存 `candidatePool.ts` (PR #102 D-1-b) を **provider 経路で再 wire**

### §4.3 凍結状態

- 🔵 未着手
- a の完了 + a2 / a3 凍結解除が prerequisite

---

## §5 D-2-e3-d (M0 lens 実接続) 完了 scope

### §5.1 既存 docs 記述

`docs/coalter-d2e3-a1-real-connection-design-review.md:566`:
> D-2-e3-d: M0 lens 実接続 (engine.ts touch)

`docs/coalter-d2e3a-implementation-design-review.md:126`:
> `lib/coalter/engine.ts` (**D-2-e3-d のみ touch 許可**)

→ d は **Stage 1 Understand bundle (M0 lens) と movieOrchestrator/provider を engine.ts 経由で接続**する sub-phase。**engine.ts touch は d のみ**、a/b/c では engine.ts touch 禁止。

### §5.2 想定実装

- `engine.ts` 内で M0 lens (Stage 1 outcome) を provider input に拡張
- `MovieOrchestratorInput.lens?: Lens` field 追加 (`docs/coalter-d2e3a-implementation-design-review.md:1102` 参照)
- Provider call 時に lens info を attach

### §5.3 凍結状態

- 🔵 未着手
- a3 wiring + Stage 1 Understand 完全完了が prerequisite

---

## §6 D-2-e3-e (prefetch + diagnostics 仕上げ) 完了 scope

### §6.1 既存 docs 記述

`docs/coalter-d2e3-a1-real-connection-design-review.md:567`:
> D-2-e3-e: prefetch + diagnostics 仕上げ

→ e は **a〜d 完了後の整理 phase**:
- prefetch (`stage3Prefetch.ts`、PR #102 D-2-d) の **provider 経由 prefetch logic 仕上げ**
- diagnostics (`diagnostics.ts`、Provider Foundation の 9 fields) の **integration test + 観測 baseline 確定**

### §6.2 凍結状態

- 🔵 未着手
- a / b / c / d 完了が prerequisite

---

## §7 a / b / c / d / e の依存関係 graph

```
D-2-e2 (PR #102、grand kill switch) ✅
       │
       ▼
D-2-e3-a (provider-agnostic implementation)
   - a0 (foundation) ✅
   - a1-impl-1a〜1i ✅
   - a1-impl-1c / 2 / 3 🔵 frozen
   - a2 (env flag) 🔵 frozen
   - a3 (movieOrchestrator wiring) 🔵 frozen
   - a4 (citation UI) 🔵 frozen
       │
       ▼
D-2-e3-b ❌ 正体 unclear、本 audit で再定義 / 撤廃 提案
       │
       ▼
D-2-e3-c (candidate source) ❌ 未着手
       │
       ▼
D-2-e3-d (M0 lens 実接続、engine.ts touch) ❌ 未着手
       │
       ▼
D-2-e3-e (prefetch + diagnostics 仕上げ) ❌ 未着手
       │
       ▼
Step E-0 (Production reflection 前準備) ❌ 未着手
       │
       ▼
Step E (観測 shadow → canary → 本番 flip)
```

`docs/coalter-implementation-plan-mainstream.md:1081-1083` でも同 graph 確認:
```
[D-2-e3-b / c / d / e 順次]
   ↓
[Step E-0 (Production reflection 前準備)]
```

---

## §8 各 sub-phase の分類

| Sub-phase | 状態 | 分類 | CEO 判断必要度 |
|---|---|---|---|
| D-2-e3-a (full) | ⚠ 部分完了 (40-50%) | 一部凍結 (a1-impl-1c/2/3/a2/a3/a4) | 高 (凍結解除 timing) |
| D-2-e3-b | ❌ 正体 unclear | **本 audit で確定要 (撤廃 or 再定義)** | 高 |
| D-2-e3-c | ❌ 未着手 | provider 経路 candidate source、a3 完了後 | 中 |
| D-2-e3-d | ❌ 未着手 | M0 lens 実接続、engine.ts touch、a3 + Stage 1 完了後 | 中 |
| D-2-e3-e | ❌ 未着手 | prefetch + diagnostics 仕上げ、a〜d 完了後 | 低 (仕上げ phase) |

---

## §9 次に実装するなら (推奨着手順序)

### §9.1 短期 (CEO 戦略判断後)

1. **D-2-e3-b の正体確定** (CEO 判断):
   - 撤廃 → a / c / d / e の 4 sub-phase に再構成
   - 再定義 → 「provider response normalization」等の役割明示

2. **a 内部凍結解除** (CEO 判断、Path β 起動):
   - a1-impl-1c (BudgetUsageProvider Supabase)
   - a2 (env flag)
   - a3 (movieOrchestrator wiring)

### §9.2 中期 (a 完了後)

3. **D-2-e3-c**: candidate source (provider 経由 candidate pool 再 wire)
4. **D-2-e3-d**: M0 lens 実接続 (engine.ts touch)
5. **D-2-e3-e**: prefetch + diagnostics 仕上げ
6. **a4**: citation UI design (Product Unit 連携)

### §9.3 長期 (D-2-e3 完了後)

7. **Step E-0**: Production reflection 前準備
8. **Step E**: 観測 shadow → canary → 本番 flip (Gap 4 / Travel / Daily Dispatch / Activity と mode enum 統合 rollout)

---

## §10 a1-impl-1c / a2 / a3 / a4 / Step E との関係

| 項目 | D-2-e3 系統との関係 |
|---|---|
| a1-impl-1c (Supabase) | D-2-e3-a 内部、凍結解除で a 完了に近づく |
| a2 (env flag) | D-2-e3-a 内部、a3 prereq |
| a3 (movieOrchestrator wiring) | D-2-e3-a 内部、c / d の prereq |
| a4 (citation UI) | D-2-e3-a 内部、e 並行可能 |
| **Step E** | D-2-e3 完了後の **rollout phase**、Gap 4 / Travel / Daily Dispatch / Activity と統合 |

---

## §11 まだやらない (本 audit scope 外)

- ❌ 任意 sub-phase 着手 (CEO 戦略判断後の別 PR)
- ❌ a1-impl-1c / a2 / a3 / a4 凍結解除
- ❌ b の撤廃 / 再定義 (本 audit は提案のみ、確定は CEO 判断)
- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot

---

## §12 CEO 判断請求 (本 audit 結論)

1. **D-2-e3-b の処理判断** — 撤廃 (a/c/d/e 4 sub-phase に整理) or 再定義 (役割明示)
2. **a 内部凍結解除順序** — a1-impl-1c / a2 / a3 を一括解除か、段階解除か
3. **D-2-e3 完了 path の優先度** — D-2-e3-a 完了 → c → d → e 順序承認
4. **Step E との統合 timing** — D-2-e3 完了後の Step E 開始 timing、Gap 4 / Travel / Daily Dispatch / Activity との rollout 統合戦略
