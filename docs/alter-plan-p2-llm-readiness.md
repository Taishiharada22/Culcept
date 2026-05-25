# Alter Plan P2 — LLM 連携 Readiness (= 着手前計画書)

**Status**: readiness 提示 (= 着手前停止)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: 本セッションで完成した Plan App (= List + Map) の **解釈レイヤー** (= alterNote / meaningText / SummaryFooter) を LLM で動かす場合の計画書。 **コード変更はまだ着手しない**。
**CEO 思考原則 ①〜⑦ 適用**: 前提を疑い (①)、 自立推論 (②)、 シンプル法案 (③)、 外科的修正 (④)、 ゴール逆算 (⑤)、 人間同等推論 (⑥)、 革新的アイデア (⑦)。

---

## 0. 結論 (= TL;DR)

- **再利用するもの**: `lib/ai/index.ts` の `runAI` (= 統一 entry、 cache + 多 provider + failover + analytics 統合済)、 `STARGAZER_FLAGS` pattern (= env-driven kill switch)、 `counterfactualSimulation` の 「LLM 候補 / Alter 再統合」 3 層 architecture
- **真の価値**: 単なる文の自然化ではなく、 **「user 個別の判断原理を反映した予定解釈」** (= Aneurasync 設計思想 「第二の自己」、 CEO 思考原則 ⑥⑦)
- **推奨進行**: **法案 C (= 段階的)** を採用、 まず **Step 1 「alterNote のみ LLM 化、 deterministic fallback あり」** から
- **重要 CEO 判断 5 件**: ①scope (= A/B/C 法案選択) / ②env 追加要否 / ③Personal Model 接続スコープ / ④失敗時 fallback 文体 / ⑤cost cap

---

## 1. 前提を疑え (= CEO 思考原則 ①)

### 1.1 「LLM 連携」 とは何を LLM 化するのか?

現状の Plan 解釈レイヤー = **5 つの deterministic 接点**:

| ID | 接点 | 現状 (= deterministic) | LLM 化価値 |
|---|---|---|---|
| α | `EventCard.alterNote` (= 各予定の意味文) | category × TimeOfDay × location → MEANING_TABLE / getNarrative 固定文 | **高** (= 「あなたらしい」 解釈の中核) |
| β | `MapBottomSheet.meaningText` | List 同 logic 再利用 (= 同じ alterNote 文字列) | **高** (= α と本質同じ。 連動採用) |
| γ | `SummaryFooter` 3 文字列 | 「集中と休息のリズム」 / 「集中する時間と、 ひと息つく時間が交互に入っています」 / 「リズムを整えるヒント」 固定 | **中-高** (= 1 日全体解釈、 score 凍結中) |
| δ | `convertEventsToTransitions` の label | '移動' 固定 | **低** (= 「移動」 で十分、 LLM 化は過剰) |
| ε | virtual events alterNote | '今日を始めるための家を出る時間' / '一日を締めくくる、 家に戻る時間' 固定 | **低** (= bookend は固定文で意図整合) |

**LLM 化すべきは α + β + γ の 3 点**。 δ / ε は固定維持。

### 1.2 「不変原則」 との整合性 (= 前提を疑う)

これまで本セッションで明示してきた不変原則:
- 「DB / env / package / dependency 変更禁止」
- 「LLM 不使用 / API 不使用 / network 不使用 / localStorage 不使用」
- 「pure module、 deterministic、 副作用 0」

これらは **List / Map 構造設計フェーズ** での規約であり、 「データ表示 / view 構築」 の文脈での safety net だった。 **「LLM 連携 readiness」 着手宣言 = この規約を一部緩和する CEO 判断** が前提。 readiness doc 起草段階で再度 CEO 判断を仰ぐべき。

緩和すべき項目:
1. **「LLM 不使用」** → 「LLM 使用、 ただし deterministic fallback 必須 + kill switch 必須」 に変更
2. **「env 変更禁止」** → 「新 env `PLAN_ALTER_LLM_LIVE` 1 件追加可」 (= 既存 STARGAZER_FLAGS pattern 踏襲)
3. **「DB 変更禁止」** → 維持 (= 既存 `logAiRun` analytics で記録、 新 table 不要)
4. **「package / dependency 変更禁止」** → 維持 (= `runAI` 統一 entry を経由、 新 dep 不要)

### 1.3 「LLM 単独で人間同等は出ない」 (= 前提の根本)

CEO 思考原則 ⑥ 「人間同等推論」 を真に達成するには、 LLM 単独では足りない:
- LLM は 「平均的な日本人が書きそうな文」 を返す (= 一般化済 prior)
- **user 個別の判断原理 / 揺れ方 / 内面傾向** は LLM の prior には**ない**
- これらは **Stargazer Personal Model に格納されている** (= 既存資産)
- 「LLM + Personal Model 接続」 で初めて 「あなたらしい解釈」 が成立

→ **真の readiness は 「LLM 接続」 ではなく 「LLM × Personal Model 統合」**。

---

## 2. 既存資産の流用範囲 (= CEO 思考原則 ②③ 自立推論 + シンプル法案)

### 2.1 統一 entry: `lib/ai/index.ts` の `runAI`

確認済 file: `/lib/ai/index.ts` (= 616 行)、 `/lib/ai/router.ts` (= 接続決定)

**機能**:
- Multi-provider (= Gemini primary / OpenAI fallback / Student LoRA)
- Semantic cache (= 同一 prompt は cache hit、 cost 0)
- Logging (= `logAiRun` で DB analytics、 既存 table)
- Router (= taskType prefix で failover 適用)
- Model selection (= task complexity に応じた model 自動選択)
- Structured output (= `requireJson: true` + `jsonSchema`)
- Teacher/student shadow (= 学習用、 fire-and-forget)

**Plan で使う場合の呼び方** (= `lib/alter-morning/llmPlanExtractor.ts` 流用 pattern):

```typescript
const result = await runAI({
  taskType: "plan_alter_note",      // ← Plan namespace 確立、 failover prefix 候補
  prompt: userPromptString,
  systemPrompt: SYSTEM_PROMPT,
  requireJson: true,                 // 構造化出力
  jsonSchema: ALTER_NOTE_SCHEMA,
  temperature: 0.2,                  // 0.1-0.3 で再現性確保
  maxOutputTokens: 256,              // alterNote は短文、 256 tokens で十分
  timeoutMs: 4000,                   // 表示待ちを 4s 以内に
  userId: ...,                       // analytics 用
});
```

**failover 対象 prefix への追加要件**: `lib/ai/router.ts` line 40-48 `FAILOVER_ELIGIBLE_PREFIXES` に `"plan_"` を追加すべきか CEO 判断。

### 2.2 Kill switch pattern: `lib/stargazer/featureFlags.ts`

確認済 file: `/lib/stargazer/featureFlags.ts` (= 76 行)

**pattern**:
```typescript
export const STARGAZER_FLAGS = {
  counterfactualLive: process.env.STARGAZER_COUNTERFACTUAL_LIVE === "true",
  // ...
} as const;
```

**Plan で踏襲**:
```typescript
// lib/plan/featureFlags.ts (= 新規)
export const PLAN_FLAGS = {
  /** P2 LLM 連携: alterNote 生成を LLM 経由にする */
  alterNoteLive: process.env.PLAN_ALTER_NOTE_LIVE === "true",
  /** P2 LLM 連携: summary footer を LLM 経由にする (= Step 3 で有効化) */
  summaryFooterLive: process.env.PLAN_SUMMARY_FOOTER_LIVE === "true",
  /** P2 LLM 連携: Stargazer Personal Model を統合する (= Step 2 で有効化) */
  personalModelIntegration: process.env.PLAN_PERSONAL_MODEL_INTEGRATION === "true",
} as const;
```

**default false** (= safety、 opt-in、 CEO の 「ロールアウト判断」 を経由)。

### 2.3 候補 / 再統合 architecture: `lib/stargazer/counterfactualSimulation.ts`

確認済 file: `/lib/stargazer/counterfactualSimulation.ts` (= 80+ 行)

**3 層 architecture** (= 学術基盤 Pearl/IFS/Active Inference):
1. Alter (= 主): user 本人の視点を担保
2. LLM (= 補助): 視点をずらした **候補** を生成
3. Alter (= 再統合): 候補を user の尊厳・文脈・現実性で 採用 / 棄却 / 弱化

**Plan で踏襲**:
- LLM が出す alterNote は **「候補」**、 そのまま user に出さない
- Plan-side validator (= deterministic post-check) で:
  - 文体 (= 規約 24 / 禁止語 10 件) check
  - 長さ (= 8-22 字)
  - 命令形・評価語の有無
  - 「お決まり言い回し」 検出
- 違反時 → deterministic fallback (= 既存 getMeaningText)
- これは **fail-open** pattern (= LLM 失敗 / safety 違反でも UI は壊れない)

### 2.4 Personal Model 接続点 (= CEO 思考原則 ⑥ 人間同等推論)

既存 Stargazer 資産で 「user 個別判断原理」 を表すもの:
- **stargazer_axes** (= 45 軸 → 10 次元 MatchingVector)
- **Personal Model** (= `lib/stargazer/baseline*`、 Decision Engine 経由)
- **lifeContext** (= `lib/stargazer/lifeContext.ts`、 W1 〜 W5)
- **Reaction Learning** (= `lib/stargazer/reaction*`、 過去応答からの学習)
- **footprint** (= 行動軌跡)

**Plan に渡すべき最小情報** (= prompt token 節約 + privacy):
1. **判断モード** (= 「集中型」 / 「分散型」 / 「人と会うエネルギー型」 等、 10 次元 から抽出した short tag)
2. **時刻偏好** (= 「朝強い」 / 「夜強い」 / 「中庸」)
3. **エネルギー回復モード** (= 「ひとり静か」 / 「人と話す」)
4. **当日 / 直近のリズム** (= optional、 lifeContext から)

最大 ~200 tokens で 「あなた」 を表現。 LLM prompt の system prompt に注入。

---

## 3. Aneurasync 思想統合 (= CEO 思考原則 ⑥⑦)

### 3.1 「第二の自己」 としての Plan Alter

Aneurasync 中心問い: 「この機能は user の **第二の自己** として必要か?」

Plan Alter の現状 (= deterministic) は **「テンプレ的アシスタント」** であり、 「第二の自己」 ではない。
LLM × Personal Model 統合で初めて 「自己」 = 「あなたの判断原理を持つ存在による解釈」 になる。

### 3.2 5 つの判断基準への照合

| 基準 | 現状 (= deterministic) | LLM 統合後 |
|---|---|---|
| ①判断原理に近づけるか | △ (= category 経由の浅い解釈) | ◎ (= Personal Model 統合で軸が増える) |
| ②変化の法則を掴めるか | △ (= 当日 only) | ○ (= lifeContext 統合で過去傾向反映) |
| ③再現精度が上がるか | ○ (= 完全決定的) | ◎ (= temperature 0.2 + cache で安定) |
| ④自己理解が深まるか | △ (= 「カフェタイム」 等の薄い解釈) | ◎ (= 「あなたが集中できる朝の…」 等、 自分軸の再認識) |
| ⑤深い観測に繋がるか | △ (= 反応観測弱い) | ○ (= alterNote 反応 (= 同意/反論) を observation input に流せる) |

### 3.3 HDM v1 整合: Phase に応じた hedging

HDM Phase 0-5 (= 接触 → 友達化 → 心の復元 → 本人化 → 多視点統合 → 現実返還):

| Phase | Plan Alter 文体 |
|---|---|
| 0-1 | 観測のみ、 「〜時間」 状態描写、 個別化なし (= 既存 deterministic) |
| 2-3 | 「あなたが」 主語可、 個別化弱、 hedging 強 (= 「〜かもしれない」) |
| 4-5 | 判断原理に踏み込む、 個別化強、 「あなたの軸では…」 framing |

**Phase ゲート pattern** (= P5 Reality Anchoring と同 design):
- 当該 Phase 未満 → LLM 統合 skip (= deterministic fallback)
- 当該 Phase 以上 → LLM + Personal Model 統合 ON

### 3.4 Negative Capability 適用 (= 革新的、 CEO 思考原則 ⑦)

LLM が判断できない場合、 **deterministic fallback ではなく 「分からない」 を表明** する選択肢:
- 例: title が 「予定 A」 等の抽象表記 → LLM が 「(意味は今は読めない)」 を返す
- これは現状の 'other' → undefined と同じ振る舞いだが、 LLM が 「能動的に観測の限界を示す」 形
- user の自己理解の起点 (= 「Alter も分からないことがある」)

### 3.5 革新的アイデア候補 (= CEO 思考原則 ⑦)

将来 phase 候補 (= readiness §5 で展開):

1. **反事実 alterNote**: 「この時間に X じゃなかったら、 あなたは何を選んだか」 (= HDM P4-3 counterfactual の Plan 版)
2. **予定間 narrative**: 「今日の流れの文脈」 (= 1 日全体の物語的解釈)
3. **過去予定との比較**: 「あなたの過去 30 日の似た予定との違い」 (= 自己観察補強)
4. **未使用能力の起動**: Stargazer 「未使用能力」 軸と接続、 「この予定はあなたの〜を動かす」
5. **複数自分の可視化**: 「集中モードのあなた / 休息モードのあなた / 関係モードのあなた」 別の解釈

これらは Step 2 以降の候補。 Step 1 では除外。

---

## 4. 法案 A / B / C (= CEO 思考原則 ③ シンプル法案)

### 法案 A: 最小 (= alterNote のみ LLM 化、 Personal Model なし)

**範囲**:
- α `EventCard.alterNote` のみ LLM 化 (= List + Map sheet)
- system prompt に Personal Model 注入なし
- temperature 0.2 / maxOutputTokens 128
- kill switch: `PLAN_ALTER_NOTE_LIVE`、 default false
- fallback: 既存 `getMeaningText` / `getNarrative`

**メリット**:
- 最小スコープ、 1 接点のみ
- 既存 deterministic fallback そのまま温存
- 1-2 day で実装可

**デメリット**:
- 「平均的な解釈」 になる (= Aneurasync 「第二の自己」 体験には不足)
- CEO 思考原則 ⑥⑦ への充足度が低い

### 法案 B: 完全統合 (= α + β + γ + Personal Model)

**範囲**:
- α + β + γ 全 LLM 化
- Personal Model (= 4 種 short tag) を system prompt 注入
- HDM Phase ゲート (= Phase ≥ 2 で個別化、 未満で deterministic)
- 多段 LLM 呼び出し (= 1 日 N 予定 + 1 日 summary、 cache 活用)
- kill switch: 3 段 (`PLAN_ALTER_NOTE_LIVE` / `PLAN_SUMMARY_FOOTER_LIVE` / `PLAN_PERSONAL_MODEL_INTEGRATION`)

**メリット**:
- Aneurasync 思想に完全整合
- CEO 思考原則 ⑥⑦ 充足
- 「あなたらしい解釈」 体験完成

**デメリット**:
- スコープ大 (= 1-2 week)
- Stargazer 統合の design 詰めが先行必要
- cost 増 (= 1 日表示で N+1 LLM 呼び出し、 cache でカバー)

### 法案 C: 段階的 (= 推奨、 CEO 思考原則 ⑤ ゴール逆算)

**ゴール (= 思考原則 ⑥⑦)**: user 個別最適化された Alter による予定解釈 = 法案 B 状態

**逆算 Step**:

| Step | scope | 工数 | kill switch | 採用判定 |
|---|---|---|---|---|
| **Step 1** | α (= alterNote) のみ LLM 化、 Personal Model なし、 fallback deterministic | 小 | `PLAN_ALTER_NOTE_LIVE` | CEO 自分で smoke 確認 → live ON 判定 |
| **Step 2** | + Personal Model 接続 (= 4 種 short tag 注入) | 中 | `PLAN_PERSONAL_MODEL_INTEGRATION` | CEO live 確認、 「あなたらしい」 感じるか |
| **Step 3** | + β (= MapBottomSheet meaningText) 連動 | 小 | (= Step 1 と同 flag、 surface 追加のみ) | CEO smoke 確認 |
| **Step 4** | + γ (= SummaryFooter) LLM 化、 1 日全体解釈 | 中 | `PLAN_SUMMARY_FOOTER_LIVE` | CEO live 確認、 「日々のリズム解釈」 として価値あるか |
| **Step 5** | HDM Phase ゲート + Negative Capability + 革新的アイデア 1 件 | 大 | (= 個別 flag) | 順次 |

**メリット**:
- 段階的に学習、 都度 CEO 判定
- 各 Step で kill switch あり、 後退可能
- ゴール (= 法案 B) に確実に到達
- リスク分散

**デメリット**:
- 完成までに時間
- 各 step 採用後に次 step readiness が必要 (= 議論コスト)

**推奨**: **法案 C を採用、 まず Step 1 から着手**。

---

## 5. 外科的接点設計 (= CEO 思考原則 ④)

Step 1 の **新規 module** (= 既存 file 改変最小):

### 5.1 新規: `lib/plan/llm/alterNoteGenerator.ts`
```typescript
/**
 * AlterStringSource interface (= deterministic か LLM か switch 可能)
 */
export type AlterNoteContext = {
  readonly category: EventCategory;
  readonly startTime: string;
  readonly endTime?: string;
  readonly title?: string;
  readonly location?: string;
};

export type AlterNoteResult =
  | { readonly source: 'deterministic'; readonly text: string }
  | { readonly source: 'llm'; readonly text: string; readonly model: string }
  | { readonly source: 'unavailable'; readonly reason: string };

/**
 * Plan Alter note 生成 (= LLM 経由 or deterministic fallback)
 *
 * - PLAN_FLAGS.alterNoteLive=false → 既存 getNarrative 直 return
 * - true → LLM 試行、 失敗 / safety 違反 → deterministic fallback
 * - 'unavailable' は呼出側で alterNote 出さない (= 現状 'other' と同等)
 */
export async function generateAlterNote(
  ctx: AlterNoteContext,
  userId?: string,
): Promise<AlterNoteResult> { /* ... */ }
```

### 5.2 新規: `lib/plan/featureFlags.ts`
```typescript
export const PLAN_FLAGS = {
  alterNoteLive: process.env.PLAN_ALTER_NOTE_LIVE === "true",
} as const;
```

### 5.3 新規: `lib/plan/llm/alterNotePromptBuilder.ts` (= pure)
```typescript
/**
 * Context → prompt 変換 (= pure、 deterministic、 LLM 呼び出さない)
 *
 * - system prompt: Aneurasync 文体規約 + Plan 解釈レイヤー責務
 * - user prompt: ctx を構造化テキスト化
 */
export function buildAlterNotePrompt(ctx: AlterNoteContext): {
  systemPrompt: string;
  userPrompt: string;
};
```

### 5.4 新規: `lib/plan/llm/alterNoteValidator.ts` (= pure)
```typescript
/**
 * LLM 出力検証 (= 規約 24 + 禁止語 10 件 + 文体 + 長さ)
 *
 * - 違反 → reject (= fallback 発動)
 * - 通過 → return text
 */
export function validateAlterNoteOutput(
  text: string,
): { ok: true; text: string } | { ok: false; reason: string };
```

### 5.5 既存接点 (= 外科的最小改変)

**`lib/plan/list/adapters/externalAnchorAdapter.ts`** (= 1 接点):
- 現状: `alterNote = getNarrative(...) ?? getMeaningText(...)`
- 改変: 同期 wrapper はそのまま (= 既存契約維持)、 新たに **async builder** を追加
  - `convertExternalAnchorListToTimelineEventsAsync(anchors, userId?)` を新設、 LLM 呼び出し含む
  - 既存 sync 版は frozen file 扱い、 触らない

**`app/(culcept)/plan/tabs/FlowTab.tsx`** (= 1 接点):
- `useEffect` で flag check → live なら async builder 呼び出し → setState で events 上書き
- flag OFF → 同期 builder のみ (= 現状)

これにより:
- 既存 deterministic test 全て影響 0
- 新 LLM path は新 async builder 経由のみ
- kill switch OFF default で本番影響 0

---

## 6. Safety / Cost / Failure 設計

### 6.1 Safety 多段 gate

| 段 | check | 違反時 |
|---|---|---|
| **Pre** | `PLAN_FLAGS.alterNoteLive=false` | LLM skip、 deterministic |
| **Pre** | `userId` 不在 (= 未ログイン) | LLM skip、 deterministic |
| **Pre** | `ctx.category === 'other'` | LLM skip、 alterNote 出さない (= 現状契約踏襲) |
| **Mid** | `runAI` timeout (= 4000ms) | fallback (= deterministic) |
| **Mid** | `runAI` success=false / empty text | fallback |
| **Post** | `validateAlterNoteOutput` 規約 24 違反 | fallback |
| **Post** | 禁止語 10 件 検出 | fallback |
| **Post** | 長さ逸脱 (= 6-30 字外) | fallback |

すべて **fail-open** (= UI は壊れない)。

### 6.2 Cost cap

- runAI semantic cache 活用 → 同一 anchor 再表示は cost 0
- maxOutputTokens 128 (= alterNote 短文前提)
- temperature 0.2 (= 再現性高、 cache hit 率高)
- timeout 4000ms (= 表示遅延上限)
- 1 user 1 日表示 = N anchors × 1 LLM call、 N=10 として 10 calls/day/user
- 1k user × 10 calls = 10k/day = ~$0.30/day (= Gemini Flash 想定)
- monthly ~$10、 許容範囲

### 6.3 Privacy

- prompt に user 名前 / 個人情報 直接含めない
- title / location は anchor 由来、 user 入力済の文字列のみ
- sensitiveCategory anchor は LLM 送らない (= privacy 配慮、 既存契約踏襲)
- Personal Model 注入時 は short tag のみ (= 「集中型 / 朝強い」 等)、 raw 軸数値は送らない

### 6.4 Observability

- 既存 `logAiRun` で全 LLM call 記録
- taskType: `"plan_alter_note"` で集約集計
- success/failure rate、 cache hit rate、 fallback rate を monitoring 可能

---

## 7. 不変原則 (= 影響評価)

| 不変原則 | Step 1 (= 法案 A 相当) 影響 |
|---|---|
| 「DB / env / package / dependency 変更禁止」 | **env 1 件追加** (= `PLAN_ALTER_NOTE_LIVE`)、 DB / package / dep 不変 |
| 「LLM 不使用」 | **緩和必要** (= P2 LLM 連携の本旨) |
| 「pure module / deterministic」 | **新 LLM module は副作用あり**、 ただし既存 pure module 不触 |
| 規約 24 / 24-extended (= focus-visible:border-slate-300) | 影響 0 (= UI 触らない) |
| 中立文体 / 禁止語 10 件 | **LLM 出力 validator で機械保証** (= 違反時 fallback) |
| 絵文字 0 | LLM 出力 validator で機械保証 |
| imageUrl 常に undefined | 影響 0 (= 別軸) |
| 既存 frozen file 不触 | 維持 (= sync version 触らない、 新 async builder 追加のみ) |
| alter plan scope 限定 | 維持 (= Calendar / Rendezvous 等 触らない) |

---

## 8. CEO 判断 (= 5 件、 着手前停止)

### Q1. scope = 法案 A / B / C のどれを採用するか
- **A (= 最小、 alterNote のみ、 Personal Model なし)**
- **B (= 完全統合、 一気通貫)**
- **C (= 段階的、 Step 1 から開始) ← 推奨**

### Q2. env 追加を許可するか
- 必要 env: `PLAN_ALTER_NOTE_LIVE` (= Step 1 のみ、 default false)
- 既存不変原則 「env 変更禁止」 の緩和判断
- 緩和する場合、 段階展開 (= live OFF で merge → 別 patch で env 設定 → live ON) を採用するか

### Q3. Personal Model 接続 (= Stargazer 統合) はどのタイミングで?
- Step 1 (= 最初から)
- Step 2 (= alterNote LLM 化採用後)
- 当面なし (= Plan は LLM のみで進める)

### Q4. LLM 失敗 / safety 違反時の文体 fallback
- 既存 deterministic getMeaningText / getNarrative (= 現状文体維持) ← 推奨
- 「(今日の予定の意味は今は読めない)」 等の Negative Capability 表明
- alterNote を出さない (= 'other' と同等)

### Q5. cost cap policy
- 無制限 (= cache 信頼)
- 1 user 1 日 N 件まで (= 例: 20 LLM call)
- timeout 4000ms 厳守、 超過は fallback

---

## 9. 想定 timeline (= Step 1 のみ)

**前提**: CEO judgment 後の着手 day を Day 0

| Day | 内容 |
|---|---|
| Day 0 | branch 切替 + PLAN_FLAGS module + AlterNoteContext 型定義 |
| Day 0-1 | promptBuilder + validator pure module + contract test |
| Day 1 | alterNoteGenerator (= LLM 呼び出し、 fallback、 fail-open) |
| Day 1-2 | async builder + FlowTab useEffect 接続 |
| Day 2 | validation (= tsc + vitest 既存 PASS + 新規 contract test) |
| Day 2 | self-dev Playwright smoke (= flag OFF で既存挙動不変、 ON で LLM 経路発火) |
| Day 2 | atomic commit + readiness doc 更新 + CEO smoke 仰ぐ |

合計 **2-3 day** (= 法案 C Step 1 のみ)。

---

## 10. 採用後の次 readiness (= 後続段階)

Step 1 採用 (= CEO smoke pass) 後、 以下を別 readiness で:
- **Step 2 readiness**: Personal Model 接続詳細 (= Stargazer 4 種 tag 抽出 logic + prompt 注入 + Phase ゲート)
- **Step 3 readiness**: MapBottomSheet 連動 (= adapter 共通化)
- **Step 4 readiness**: SummaryFooter LLM 化 (= 1 日全体解釈、 score 計算可能化検討)
- **Step 5 readiness**: HDM ゲート + Negative Capability + 革新的アイデア (= 反事実 / 過去比較 / 5 レンズ)

---

## 11. 設計書 references

- `docs/decision-log.md` (= 全 決定履歴、 9 closeout cleanup 記録)
- `docs/alter-plan-session-residual-audit.md` (= 本セッション残課題)
- `docs/alter-plan-list-redesign-closeout-audit.md` (= List redesign 完了)
- `docs/alter-plan-map-redesign-spec-audit.md` v3 (= Map spec)
- `docs/heart-dynamics-model-v1.md` (= HDM v1 全 Phase + Wall)
- `docs/stargazer-human-os-design.md` (= Stargazer Personal Model)
- `memory/aneurasync-philosophy.md` (= Aneurasync 設計思想)
- `lib/ai/index.ts` (= runAI 統一 entry、 検証済)
- `lib/stargazer/featureFlags.ts` (= kill switch pattern、 検証済)
- `lib/stargazer/counterfactualSimulation.ts` (= 候補 / 再統合 3 層、 検証済)
- `lib/alter-morning/llmPlanExtractor.ts` (= runAI 呼出 見本、 検証済)

---

## 12. 結語

CEO 思考原則 ①〜⑦ への対応:

- ①前提を疑え: 「LLM 不使用」 規約の意図的緩和、 「LLM 単独 ≠ 人間同等」 の認識
- ②自立推論 + リサーチ: 既存 4 資産 (= runAI / STARGAZER_FLAGS / counterfactualSimulation / llmPlanExtractor) を検証済、 流用方針確定
- ③シンプル法案: 法案 C Step 1 (= alterNote のみ + deterministic fallback) から
- ④外科的修正: 新 module 4 個 (= 全 pure or fail-open) + 既存改変 2 接点 (= async wrapper + useEffect)
- ⑤ゴール逆算: ゴール (= 法案 B 状態) → Step 1〜5 で確実到達
- ⑥人間同等推論: Step 2 で Personal Model 接続、 「あなたの判断原理」 反映
- ⑦革新的アイデア: Step 5 で 反事実 / 過去比較 / Negative Capability 等、 「人間能力超越」 へ

**本 readiness は計画書。 CEO Q1〜Q5 判断後、 Step 1 着手** (= ファイル変更開始)。
