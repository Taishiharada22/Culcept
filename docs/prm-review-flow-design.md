# PRM Review Flow Design（A1-7-6・**docs-only**）

設計: `docs/prm-persistence-schema-design.md`（A1-7-5・`prm_review_decisions` / `prm_model_entries`）/ `docs/aneurasync-reality-control-os-connection-design.md` §10.0〜10.5 / §10.6（要約）
状態: **設計のみ**。コード / migration / persistence / route / Home / production / env / remote / LLM は書かない。

> review flow は A1-7-5 chain の `[HUMAN REVIEW]` ステップ＝ **proposal（candidate）→ 人間の review → decision → PRM model への唯一の入口**。本設計は flow の契約・状態・意味論を固める。実装（pure contract/helper/preview）は A1-7-7〜9、**永続化は migration 手前で停止**。

---

## 0. 前提・現状（A1-7-0〜7-5）

- A1-7-3 proposals: `candidate`（reviewable・tentative かつ evidence≥5）/ `blocked`（observation 止まり）。
- A1-7-4 dev-report: proposal を人間が目視。
- A1-7-5 schema: `prm_model_entries.review_decision_id NOT NULL`＝**review 決定なしに PRM entry は生まれない**（自動学習なし）。
- → 本 flow は「candidate proposal を人間が review して decision を入れる」手順。

## 1. Goal / Non-goal

**Goal**: candidate proposal → 人間 review → decision（approve / reject / defer）の **契約・状態・意味論** を設計し、PRM への唯一の入口を安全に定義する。

**Non-goal**: decision の永続化 / 実 review UI の本実装 / 自動 review / 性格断定 / certainty の high 昇格。

## 2. Review 状態と遷移

```
proposal:
  blocked   → review 不可（observation 止まり・PRM 入口でない）
  candidate → [pending review] → approved   → PRM model entry 生成（要件: §4）
                               → rejected   → PRM 不追加（rejection を signal として記録）
                               → deferred   → PRM 変化なし（再 surface 対象・evidence 追加で再 review）
```

- **candidate のみ reviewable**（blocked は不可）。
- decision は **再 review 可能**（evidence 追加で proposal が変われば再 review・最新 decision が有効・履歴保持）。

## 3. Decision 意味論（approve / reject / defer）

| decision | 意味 | 結果 |
|---|---|---|
| **approve** | 「この傾向は追跡する価値がある」（**事実確定ではない**） | PRM model entry 生成（certainty ≤ tentative 維持・counter/stillPossible 保持・user-correctable・decay） |
| **reject** | 「この推論された傾向は妥当でない/意味がない」 | PRM 不追加。rejection を記録（将来: 推論 rule の mis-fire meta-signal）。 |
| **defer** | 「判断には情報不足」 | PRM 変化なし。proposal は evidence 追加で再 surface。 |

**重要**: **approve ≠ 事実確定 ≠ high certainty ≠ 固定 trait**。approve は「文脈束縛 tendency をモデルに追跡登録する」であって「あなたは X な人だ」ではない。

## 4. 誰が review するか（所有の arc）

- **段階1（operator）**: CEO/dev が review（推論品質の検証）。A1-7-9 dev preview で simulate。
- **段階2（user・将来）**: ユーザー自身が自分の PRM proposal を review（「Aneurasync はあなたが X しがちと気づいた — 合ってる?」）＝ **第二の自己をユーザーが confirm/correct**。ユーザーの approve/correction が最強 signal。
- decision record は両者対応（`reviewed_by: operator | user`）。

## 5. Decision record 契約（`prm_review_decisions` 準拠）

- `proposal_fingerprint`（dimension+value+dominantAction・どの proposal か）
- `decision`（approved / rejected / deferred）
- `reviewed_by`（operator / user）
- `proposal_snapshot`（review 時点の evidence/counter/stillPossible/certainty＝再現性・audit）
- （任意）`reason`（人間の短いメモ・controlled・自由文だが PRM tendency には流さない）/ `correction`（ユーザーの訂正）
- **自動 approve 禁止**（decision は人間が入れる）。**snapshot の certainty は high を許さない**。

## 6. 非断定の保存（approve しても保たれる safeguard）

approve された tendency も:
- **certainty ≤ tentative**（approve で high にしない）。
- **counter-evidence 保持**（disconfirming event で弱化）。
- **stillPossible 保持**（代替仮説を潰さない）。
- **user-correction で override 可能**（推論より優先）。
- **decay**（recency で現在の自己反映）。

＝ PRM は「事実」に硬化しない。approve は「追跡する」、reject/defer/correction でいつでも引き戻せる。

## 7. 可逆性 / versioning

- decision は撤回可能（approved → 後で reject/defer に変更可）。
- PRM model entry は `supersedes_id`/`retracted_at` で可逆（A1-7-5）。decision 撤回 → entry retract。
- 完全 audit trail（どの events → どの proposal → どの review → どの entry）。

## 8. 実装 roadmap（A1-7-7〜9）+ stop gate

- **A1-7-7**: review flow の **pure contract / types**（`ReviewDecisionKind`・`ReviewableProposal`・状態遷移の pure validation・no-persist）。
- **A1-7-8**: **review decision dry-run helper**（proposal + 人間 decision → `ReviewDecisionRecord` を pure に生成・**保存しない**）。
- **A1-7-9**: **dev preview**（proposal を approve/reject/defer して結果の decision record を見る・fixtures・no-persist）。
- **stop gate**: decision の**永続化（`prm_review_decisions` への DB write）・migration** は A1-7-9 後に**必ず停止**（CEO 承認・schema migration とセット）。

## 9. しない（範囲外）

decision 永続化 / DB write / migration / 実 review UI 本接続 / route / Home 本線 / production / env / remote / LLM / 自動 review / 性格断定 / certainty high 昇格。
