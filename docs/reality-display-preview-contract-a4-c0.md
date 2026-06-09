# Reality Control OS — A-4-c0 Display Preview Contract Decision（**docs-only**）

> 2026-06-10 / Build Unit / CEO 指示「A-4-c 実装へ直行せず、何を表示してよいかを先に確定する」。
> **docs-only**。code / route / client / real read / staging render / DB write / PlanClient / apply / migration / production には進まない。
> 前提: A-4-b harness（`c531db55`）+ A-4-b2 real staging chain shadow PASS（`b9b649ea`）。表示面 = 既存 operator-only dev preview（`/plan/dev-reality-pipeline`・triple-guard + auth + flag OFF）。

---

## 0. 結論（contract の核）

**既存 envelope 契約（`changeSetDraft = { opCount }` のみ）は一切変えない。** その代わり、reflection preview 専用の **新 DTO（`ReflectionPreviewClientDto`）を別枠で追加**し、その DTO に入れてよい情報を **allowlist で固定**する。つまり「opCount-only を緩める」のではなく「**別契約を新設して並置**」する。client に DraftPlanItem / ChangeSet / summary 実体は渡らず、**DTO 変換層（pure mapper）だけが client への唯一の通路**になる。

## 1. Preview payload contract

- **envelope 契約は不変**: `RealityPipelineEnvelope.changeSetDraft` は `{ opCount }` のまま（P-D/P-B test で固定済・触らない）。
- **新設**: `ReflectionPreviewClientDto`（§4）を page → client の **追加 prop** として渡す。
- **渡さないもの（実体禁止）**: full DraftPlanItem / full DraftPlan / full ChangeSet / prepared ChangeSet / MemoryItem / WorldState / raw row / sourceTrace 実体 / ReflectionPreviewSummary 実体（warnings/blockers の**安定コード列も渡さない**＝count に縮約）。
- **変換は server 側 pure mapper のみ**（`toReflectionPreviewClientDto`・A-4-c で実装）。client は DTO を表示するだけ。

## 2. 表示してよい情報（allowlist・これ以外は出さない）

| 情報 | 形 |
|---|---|
| stage | `"prepare" \| "precondition" \| "reflect" \| "done"`（enum そのまま） |
| canApply / precondition verdict | `ApplyPreconditionVerdict \| null`（enum そのまま） |
| reflected | boolean |
| reflectedItemCount | number |
| blockers count / warnings count | **number のみ**（安定コード列は server 側に留める） |
| item の HH:MM start/end | `"HH:MM"` 文字列（operator=owner 本人の空き時間配置・第三者情報なし → 表示可） |
| item の abstract label | **固定 allowlist のみ**: 「集中の時間」「軽い用事の時間」「休息」「自由時間」「余白」（R5-2 KIND_LABEL）。**集合外は「自由時間」に置換**（mapper が強制） |
| origin / rigidity の抽象表示 | **per-item では渡さない**。page 固定文「すべて動かせる候補（suggestion）・エンジン推論」として client 側の静的文言で表示 |
| redaction status | boolean（client 自己チェック・P-D と同型） |

## 3. 表示してはいけない情報（deny・mapper/test で固定）

raw title（allowlist 外 label）／ location ／ PII ／ seedRef ／ utterance ／ personality ／ trait・fixed_preference ／ MemoryItem 実体 ／ WorldState 実体 ／ full ChangeSet payload ／ sourceTrace 実体（kind/ref/reason いずれも）／ **item id（`display:` 含む・渡さない**＝date+tier+HH:MM の冗長値で React key は index で足りる）／ confidence・reason（DraftPlanItem の内部 field）／ UUID ／ **apply button・save/commit/confirm button（一切置かない）**。

## 4. Client prop shape（専用 DTO・実装は A-4-c）

```ts
/** client に渡す唯一の reflection 情報（実体は渡さない）。 */
interface ReflectionPreviewItemDto {
  readonly startTime: string;   // "HH:MM"
  readonly endTime?: string;    // "HH:MM"
  readonly label: string;       // 固定 allowlist の 5 語のみ（集合外→「自由時間」）
}
interface ReflectionPreviewClientDto {
  readonly stage: "prepare" | "precondition" | "reflect" | "done";
  readonly preconditionVerdict: string | null; // ApplyPreconditionVerdict
  readonly reflected: boolean;
  readonly reflectedItemCount: number;
  readonly blockersCount: number;  // 安定コード列は渡さない（count に縮約）
  readonly warningsCount: number;
  readonly items: readonly ReflectionPreviewItemDto[];
}
```
- **専用 DTO を作る**（ReflectionPreviewSummary をそのまま渡さない）。
- **DraftPlanItem → ReflectionPreviewItemDto に変換**（id/confidence/reason/origin/rigidity を落とす・label を allowlist 照合）。
- **item id は渡さない**（displayId も不可・冗長値ゆえ）。
- **HH:MM は表示可**（§2）。
- **label は 5 語 allowlist 限定**＋集合外は「自由時間」へ強制置換。

## 5. UI wording（誤解防止）

- セクション名: **「Reflection Preview（反映プレビュー・観測のみ）」**。"apply" という語を UI に出さない。
- **必須明示文**: 「**まだ予定には書き込んでいません**（保存・確定・通知は行いません）」。
- **禁止表現**: 「適用」「保存」「保存済み」「反映済み」「確定」「書き込み済み」「予定に入りました」等の完了/実行を示す語。
- 許可表現: 「候補」「プレビュー」「観測」「未確定」。items 見出し例: 「DraftPlan に映る候補（未確定）」。
- button / onClick / fetch / useState は引き続き一切置かない（P-D source-contract を維持・拡張）。

## 6. A-4-c 実装 scope（最小）

1. **DTO mapper（pure・先行）**: `lib/plan/reality/permission/reflection-preview-dto.ts` — `toReflectionPreviewClientDto(result: ReflectionPreviewResult): ReflectionPreviewClientDto`（label allowlist 強制・実体落とし）。**fixture test を先に**（allowlist/deny/counts/HH:MM）。
2. **page 拡張（既存 route のみ・新 route なし）**: `dev-reality-pipeline/page.tsx` に server 側で draft 再導出（A-4-b2 shadow と同一 pure 内部）→ `buildReflectionPreview`（fixture DraftPlan・real read は**既存の read を再利用**・新規 read なし）→ DTO 化 → client へ追加 prop。flag は**既存 `REALITY_PIPELINE_PREVIEW` のまま**（新 flag なし・読む表は増えない）。
3. **client 拡張（既存 component）**: `RealityPipelinePreviewClient` に optional `reflectionPreview?: ReflectionPreviewClientDto` prop ＋表示セクション（§5 wording・button なし・redaction 自己チェックに DTO を含める）。
4. **render/page test 更新**: P-D render test に reflection セクション（FORBIDDEN 不一致・`display:` id 非出力・button 不在・必須明示文）＋ P-B page source-contract（DTO のみ渡す）追加。
5. **staging smoke は別 gate（A-4-c2）**: 実 staging で flag ON render 確認は本実装 commit 後の **CEO smoke gate**。

## 7. Stop gates（A-4-c 実装中も不変）

🔒 本 doc の allowlist を超える client payload 変更 ／ 🔒 staging render（A-4-c2 smoke gate）／ 🔒 Plan 本線接続・実 DraftPlan pipeline 配線（cross-track）／ 🔒 PlanClient ／ 🔒 **A-4-d DB write（閉じたまま）** ／ 🔒 apply・save・confirm 導線 ／ 🔒 notification・native ／ 🔒 production・user-facing ／ 🔒 REALITY_ALTER_BRIDGE_LIVE enable。

---

→ A-4-c0 完了。**A-4-c 実装の前で停止**（CEO GO 待ち）。実装順は §6 の 1→4（pure mapper test 先行 → page/client → test 更新）、staging render は A-4-c2 別 gate。
