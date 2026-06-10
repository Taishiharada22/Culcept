# Life Ops — A-4-c26 Real Source Contract + Sparse Representative Policy Mini-Design

> 2026-06-11 / CEO・GPT GO（c25 finding 起点・推奨案 C 採用）。**禁止**: calendar title/free text/店舗名/placeQuery/raw event name 推定・
> LLM 分類・URL 解析・external API・DB migration・production enable/write/deny 解除・PlanClient 大改造・R4・notification・accept 表示・push/PR/merge。

---

## Part 1: Real Source Contract（pure DTO・将来 source の単一受け口）

### audit（c20 audit の継承 + 入力元候補）
構造化 source は現状 **存在しない**（habit/routine table なし・calendar_events は自由 TEXT で禁止系）。よって c26 は「**将来の user structured input
（settings/profile・専用入力 UI・import）が必ず通る contract**」を pure 固定する slice。入力元候補の評価:
user structured input=**本命（次 slice で UI/DB）**／既存 Plan/Reality structured source=該当なし（plan_seeds は別 domain）／
future settings・import=本 contract に乗せる／calendar title/free text=**恒久禁止**。

### DTO（中間・raw row を candidate へ直接流さない）
```ts
LifeOpsStructuredDeadlineSource { categoryId, menu?, dueAtISO, sourceKind:"user_structured_deadline", confidence, occurrenceKey? }
LifeOpsStructuredCadenceSource  { categoryId, menu?, lastCompletedAtISO?, typicalIntervalDays?, sourceKind:"user_structured_cadence", confidence }
```
- 正規化（normalization）で **辞書 roundtrip 再検証・ISO 検証・low confidence drop（強く候補化しない）**→ 縦 seam 型
  （DeadlineObservation { categoryId, deadlineISO } / CadenceObservation { categoryId, menu, lastCompletedAtISO }）へ。
- `occurrenceKey` 未指定時は `${categoryId}:${menu ?? ""}:${dueAtISO 日付部}` を自動導出（将来の occurrence 厳密照合・c22 の窓照合を置換する布石。
  現 seam 型は保持 field を持たないため **DTO 層に留め置き**＝contract 予約）。`typicalIntervalDays` も L-9（個人間隔学習）予約 field（今は未消費を明記）。
- free text label は DTO に **field 自体が存在しない**（構造的排除）。user_id/DB id/raw row/source_ref も同様。

## Part 2: Sparse Representative Policy（案比較→**案 C 採用**）

| 案 | 内容 | 判定 |
|---|---|---|
| A recommended tier のみ維持 | 保守的だが real sparse で card が出ない（c25 実測） | 不採用 |
| B 全 surface で fallback | preview/operator の既存観測面まで変わる | 不採用 |
| **C mainline 限定 fallback** | preview 現状維持・**mainline card だけ** real 由来安全候補を最大 1 件 fallback 代表化 | **採用（GPT 推奨）** |

### 設計
- `selectLifeOpsMainlineRepresentatives(model, mode)`（pure・**page 表示と action 再検証の共通 selector**）:
  ①従来 reps（recommended tier rail 付き ≤3）が非空 → そのまま。
  ②空 ∧ **mode === "real_only" の時だけ** pool（cap 済み）から fallback **最大 1 件**
  （fixture_allowed では fallback しない＝「fixture 由来は fallback 不可」を **mode で構造保証**。real_only の base は空なので pool は全て real 由来）。
- fallback 選定: kind=deadline（daysUntil 昇順）＞ kind=cycle（pool 順）。event_prep/unknown は対象外。
  confidence は normalization で low 既 drop＝pool は medium+ のみ（構造的充足）。
- **低圧文言**（固定 2 句・enum）: deadline=「期日が近づいています。余裕があれば少しだけでも」／cycle=「そろそろの時期かもしれません。余裕があれば」
  （「やるべき/必ず/今すぐ」不使用を test 固定）。headline は既存の空状態文（「急ぎのものはなさそうです」）のまま＝誠実。
- builder rework: items を **selector の candidates から直接構成**（label/phrase=縦 L-8a presenter・actions=c15 descriptors の mainline filter・
  candidateKey=momentKey）。fixture_allowed の出力は従来と**完全一致**（c25 ⑪ JSON 等価 lock で保証）。rail は done/later/dismiss 維持・accept hold 継続。
- action 再検証: mainline action も同 selector を使用 → **fallback 候補の press が照合可能**（押せるのに unknown になる断絶を排除）。

## 変更ファイル
新 `lifeops-structured-source.ts`／compute（model+=pooledCandidates・additive）／`lifeops-mainline-card.ts`（selector+fallback+builder rework・mode 既定 fixture_allowed=後方互換）／`lifeops-mainline-model.ts`（sourceMode を返す）／page・mainline action（mode/selector 配線）／新 test（GPT 18 lock）／docs/log。
