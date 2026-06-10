# Life Ops — Preview Integration Contract + Fixture Operator Preview（本流セッション）

> 2026-06-10 / CEO・GPT 指示「pure VM が揃ったので、operator preview 上で Morning Briefing / Moment Trigger / Reflection Preview が並んだ時に、情報量・重複・文言・安全性が破綻しないかを確認する。UI 本線ではなく operator-only preview の contract 拡張」。
> **scope**: fixture 入力のみ・**実データ源 0・DB 0・route write 0・通知 0・R4 本線 0・PlanClient 0・UI card 本線 0・production 0・外部 API 0・LLM 0**。

---

## 1. Preview Integration Contract（3 VM の責務分担）

| VM | 入力 | 表示責務 | 出さないもの |
|---|---|---|---|
| **Reflection Preview**（A-4-c 済） | real anchors+M1/M3（page 既読）→ empty-day ChangeSet | 「エンジンの提案が DraftPlan にどう映るか」（stage/verdict/HH:MM items） | 実体/raw/id/apply 導線（A-4-c0 契約） |
| **Morning Briefing preview** | **fixture LifeOpsInputs** + page 既読の real WorldState | 「朝、生活まわりを 3 案にどう混ぜて言うか」（headline/3 案/代表≤3/注意≤2） | HH:MM（窓は午前/午後/夕方の粗さ）・placeQuery・candidate 実体 |
| **Moment Trigger preview** | 同上 + nowMinute | 「**今この瞬間**なら何を 1 件だけ言うか」（surfaced\|沈黙・抑制状態） | 時刻表記ゼロ・通知導線ゼロ・candidate 実体 |

- **役割の境界**: Reflection=エンジン提案の器 / Briefing=朝の言語化（未来形・一日単位） / Moment=現在形・単発。**同じ候補が 3 面に出ても矛盾しない**（器→朝の計画→今の一声、という時間軸の別断面）。
- **Life Ops 入力は fixture**（実データ源未接続を UI に明示）。**窓/予定は page が既に読んでいる real WorldState を再利用＝新規 read 0**。

## 2. Client DTO（唯一の通路・allowlist）

```ts
LifeOpsPreviewClientDto = {
  briefing: { headline; tiers[{tier; tierLabel; line; highlights[{label; phrase; windowHint}≤3]; overflowLine|null}]; cautions[≤2]; alsoAvailableLine|null };
  moment:   { surfaced: {label; kind; phrase; cautions[≤2]} | null; silencedCount: number; suppression: string|null };
  fixtureNotice: true;                       // fixture 駆動の明示（literal）
  integrationMeta: { briefingRepresentativeCount: number; momentExcludedCount: number }; // 重複制御の可視化（数のみ）
}
```
- **表示してよい**: 辞書 label（L-1）・固定テンプレ文・enum（tier/kind/suppression）・counts・粗い windowHint。
- **渡さない（deny・test 固定）**: raw candidate / PlacedLifeOpsCandidate / dueReason / placeQuery / coarseMinutes / window 分数 / sourceTrace / raw plan / suppressedReasons コード列（counts に縮約）/ HH:MM（moment）。
- field 名は `label`（`title` を使わない＝client 自己 redaction regex と整合・A-4-c0 慣例）。

## 3. 重複制御（briefing ↔ moment）

- **既定契約**: briefing の代表（recommended tier の fitting 先頭≤3）の `lifeOpsMomentKey` を **moment の excludeKeys に注入**＝「朝言ったことを今もう一度言わない」。
- deadline fallback も excludeKeys に従う（朝に出した期限を moment で連打しない）。**moment は常に cap 1**。
- `integrationMeta` が exclude 数を可視化（operator が重複制御の作動を確認できる）。

## 4. 文言安全性

- **禁止（test 固定）**: 「予定に入れた」「通知する」「確定」「やるべき」「すべき」「必ず」「しなければ」「してください」。
- 使う: 「候補」「今なら入れやすそう」「余裕があれば」「〜と安心です」「〜と自然です」。
- **operator preview を user-facing と誤解させない明示文**: 「fixture 入力（実データ源未接続）。予定には書き込みません。通知もしません。」
- button / apply / save / confirm / notify 導線 = 0（client は引き続き presentational）。

## 5. 実装

- `lib/plan/reality/lifeops/lifeops-preview-compute.ts`（pure）: `computeLifeOpsPreviewDto({ world, date, nowMinute, nowMs }) → LifeOpsPreviewClientDto`
  - fixture LifeOpsInputs（nowMs 相対: 美容 60 日前/補充 10 日前/面接 3 日後/確定申告 5 日後）→ collect → place → derive+generate → compose → briefing VM → moment VM（excludeKeys=代表 key）→ **DTO 変換（allowlist）**。
- page（dev-reality-pipeline・既存）: 1 import + 1 call + 1 prop（**新 route/flag/read なし**）。
- client（既存）: optional prop + 「Life Ops Preview（fixture・観測のみ）」section（Row 再利用・button なし・自己 redaction チェックに DTO 包含）。

## 6. dogfood へ進む条件 / 残 gate

- **dogfood 開始条件**: 本統合 green（render/redaction/duplication/source-contract tests）→ A-4-c3 protocol に Life Ops 観測項目を追記して operator 観測開始（flag は既存 `REALITY_PIPELINE_PREVIEW`）。
- **残 gate（閉のまま）**: UI card 本線（components/lifeops 取り込み・配線）/ 実データ源 read-only（cadence・calendar・期限の実読）/ notification / R4 本線 / PlanClient / production。
