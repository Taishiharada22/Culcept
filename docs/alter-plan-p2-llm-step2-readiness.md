# Alter Plan P2 — Step 2 Readiness (= Personal Model 接続詳細)

**Status**: readiness 起草 (= 着手前、 実装は Step 1 live ON 判定後、 GPT 補正通り)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**Scope**: Step 1 (= alterNote LLM 化、 deterministic fallback) の上に **Stargazer Personal Model 統合** を追加。 「平均的解釈」 から 「あなたらしい解釈」 へ昇格。
**CEO 思考原則 ①〜⑦ 適用**: 「人間同等推論 (⑥)」 「人間能力を超越できる革新 (⑦)」 をここで本格実装。

---

## 0. 結論 (= TL;DR)

- **真の価値**: Step 1 は LLM 文の自然化のみ。 Step 2 で **user の判断原理を反映した 「あなたらしい」 解釈** に昇格 = Aneurasync 「第二の自己」 体験の完成
- **再利用資産**: Stargazer 既存 4 module (= `baselineContext` / `chronotypeFitness` / `axisRegistry` / `lifeContext`)
- **接続方法**: AlterNoteContext に optional `personalModel: PersonalModelSummary` を注入、 prompt builder が system prompt に short tag を埋め込む
- **safety**: HDM Phase ゲート (= Phase ≥ 2 で個別化、 未満で deterministic 維持)
- **CEO 判断 5 件**: ①Personal Model 取得 timing / ②Phase ゲート strictness / ③tag 抽出粒度 / ④tag pii / ⑤Stargazer prefetch policy

---

## 1. ゴール (= 思考原則 ⑤ 逆算)

### 真の到達点

**Step 1 vs Step 2 の比較**:

| 観点 | Step 1 (= 法案 C minimum) | Step 2 (= Personal Model 統合) |
|---|---|---|
| LLM 入力 context | category / time / location / title | + Personal Model 4 short tag |
| 出力文体 | 「平均的な日本人が書く文」 | 「user 個別の判断原理に沿う文」 |
| Aneurasync 思想充足 | △ (= 第二の自己 体験不足) | ◎ (= 真の 「あなたらしい」 解釈) |
| HDM Phase 整合 | flag check のみ | Phase ゲート + Trust 連動 |
| 5 つの判断基準への充足 | 個別化なし | 判断原理近接 / 変化法則 / 自己理解深化 全 ◎ |

### CEO 思考原則 ⑥⑦ の本格適用

⑥ **人間同等推論力**:
- Stargazer 既存軸 (= 45 軸 → 10 次元 MatchingVector) を `personalModel` short tag に圧縮
- LLM は 「Personal Model + 当日 anchor context」 を統合して、 user 自身では言語化できない予定の意味を提示

⑦ **人間能力を超越**:
- 「あなたの過去傾向 (= lifeContext 直近 7-14 日) との対比」 を Personal Model tag に含める
- 例: 「直近休息少なめ + 朝強い user」 が朝のカフェに → 「久しぶりの一人時間、 リズムを取り戻す」 等の 「自己観察補強」 文

---

## 2. 既存資産の流用 (= 思考原則 ②③)

### 2.1 `lib/stargazer/baselineContext.ts` — Baseline Context Normalization

- Gender / LifeStage / area_type の正規化済 layer
- Stereotype 強化防止 + teen safeguard 内蔵
- **Step 2 で使うのは LifeStage と stage hint (= 「working_adult」 「new_grad」 等)** — judgmentMode の hint

### 2.2 `lib/stargazer/chronotypeFitness.ts` — Chronotype 推論

- 朝型 / 夜型 / 中庸 の推論
- **Step 2 で `timePreference` short tag に直接マップ**

### 2.3 `lib/stargazer/axisRegistry.ts` — 45 軸 → 10 次元 MatchingVector

- 集中型 / 分散型、 人と会うエネルギー消費型 / 充電型、 etc.
- **Step 2 で `judgmentMode` + `energyRecovery` short tag の source**

### 2.4 `lib/stargazer/lifeContext.ts` — 直近 7-14 日 行動軌跡

- W1-W5 patterns (= Reaction Learning、 Phase 2 配線済)
- **Step 2 で `recentRhythm` short tag の source** (= 「直近休息少なめ」 「移動多め」 等)

---

## 3. 接続設計 (= 思考原則 ④ 外科的)

### 3.1 新規 module (= 3 個、 Step 2 追加分)

#### `lib/plan/llm/personalModelExtractor.ts` (= "server-only")
```typescript
import "server-only";
import type { PersonalModelSummary } from "./types";

/**
 * Stargazer 既存資産から 4 short tag 抽出 (= server-only、 user セッション内で 1 度取得 → 共有 cache)
 *
 * - judgmentMode: axisRegistry の 「集中 vs 分散」 軸 + LifeStage hint
 * - timePreference: chronotypeFitness 推論結果
 * - energyRecovery: axisRegistry の 「ひとり vs 他者」 軸
 * - recentRhythm: lifeContext 直近 7 日の category 分布 + 移動量
 *
 * cache 推奨: 同 user 同 session で複数 anchor 解決時、 1 度の抽出で済む
 * 失敗時 (= 軸データなし、 onboarding 未完了) → 全 field undefined return (= LLM 経路は通すが PM 注入なし)
 */
export async function extractPersonalModelSummary(
  userId: string,
): Promise<PersonalModelSummary>;
```

#### `lib/plan/llm/hdmPhaseGate.ts` (= "server-only")
```typescript
import "server-only";

/**
 * HDM Phase ゲート: Phase < 2 → Personal Model 注入 skip (= deterministic 維持)
 *
 * Phase 0-1 (= 接触 / 友達化): 観測のみ、 「あなたらしい」 framing は早すぎる (= HDM v1 原則)
 * Phase 2-3 (= 心の復元 / 本人化): hedging 強で個別化 OK
 * Phase 4-5 (= 多視点 / 現実返還): 判断原理に踏み込む解釈 OK
 *
 * 取得: Stargazer hdmPhaseState (= 既存 module)
 */
export async function isPersonalModelAllowed(userId: string): Promise<boolean>;
```

#### `lib/plan/llm/alterNotePromptBuilderV2.ts` (= pure、 Step 1 builder と並列)
```typescript
import type { AlterNoteContext } from "./types";

/**
 * Step 2 prompt builder (= Personal Model 注入対応、 Step 1 と独立)
 *
 * - Step 1 buildSystemPrompt: 一般文体規約のみ
 * - Step 2 buildSystemPromptV2: 一般文体規約 + PersonalModelSummary 短文挿入
 *
 * 例 system prompt 追加部:
 *   「ユーザーの傾向: {judgmentMode}、 {timePreference}、 {energyRecovery}。
 *    最近の生活リズム: {recentRhythm}。
 *    上記を踏まえて、 user 自身がこの予定の意味を感じやすい一言を返してください。」
 *
 * - undefined field は line 出さない (= partial PM でも自然に動く)
 * - Step 1 と互換 (= ctx.personalModel === undefined なら Step 1 builder と同 output)
 */
export function buildAlterNotePromptV2(ctx: AlterNoteContext): {
  systemPrompt: string;
  userPrompt: string;
};
```

### 3.2 既存 module の改変 (= 外科的最小)

#### `lib/plan/llm/alterNoteGenerator.ts` (= 1 接点)
- 現状: `buildAlterNotePrompt(ctx)` → systemPrompt + userPrompt
- Step 2: `PLAN_FLAGS.personalModelIntegration` 確認 → ON なら `buildAlterNotePromptV2`、 OFF なら 現状の builder
- ctx.personalModel が undefined なら自動的に Step 1 同等 (= safe degrade)

#### `lib/plan/list/adapters/externalAnchorAdapterAsync.ts` (= 1 接点)
- userId 受け取り済 (= options.userId)
- Step 2 で `extractPersonalModelSummary(userId)` を **1 度** 呼出 (= day 単位の cache)
- `isPersonalModelAllowed(userId)` check で skip 判断
- 全 ctx に `personalModel` 注入 (= 1 user 1 day 1 PM)

#### `lib/plan/featureFlags.ts` (= flag 追加)
```typescript
personalModelIntegration: process.env.PLAN_PERSONAL_MODEL_INTEGRATION === "true",
```

### 3.3 新規 test (= 3 file、 Step 2 追加分)

- `tests/unit/plan/llm/personalModelExtractor.test.ts`
- `tests/unit/plan/llm/hdmPhaseGate.test.ts`
- `tests/unit/plan/llm/alterNotePromptBuilderV2.test.ts`

加えて:
- `tests/unit/plan/llm/alterNoteGenerator.test.ts` 拡張 (= PM 注入 path)

---

## 4. Aneurasync 思想統合 (= 思考原則 ⑥⑦)

### 4.1 「第二の自己」 体験の完成

| user 状況 | Step 1 出力 | Step 2 出力 (= 期待) |
|---|---|---|
| 集中型 + 朝強い user が朝のカフェに | 「朝のカフェタイム、 静かに整える」 | 「あなたが最も集中できる朝のカフェ、 ゆっくり進める」 |
| 人と会うエネルギー消費型 user が会議前に | 「午前を区切るランチ前のひととき」 | 「人と会う前のひととき、 内側を整える時間」 |
| 直近休息少なめ user が夜の自宅に | 「ゆっくり過ごして、明日への活力に」 | 「久しぶりにゆっくりできる夜、 リズムを取り戻す」 |

### 4.2 HDM Phase 整合 (= ゲート設計)

| Phase | Personal Model 注入 | alterNote 文体 |
|---|---|---|
| 0-1 | **skip** | Step 1 deterministic / LLM 一般文 (= 「あなた」 主語なし) |
| 2-3 | **注入 + hedging 強** | 「あなた」 主語可、 hedging (= 「〜かもしれない」 「〜の傾向」) |
| 4-5 | **注入 + 判断原理踏み込み** | 「あなたの軸では…」 「あなたが本当に…」 等の深い framing |

実装: `isPersonalModelAllowed` で Phase ≥ 2 check、 さらに system prompt 内で Phase 別 framing 指示。

### 4.3 革新的アイデア (= 思考原則 ⑦)

Step 2 で達成可能な 「人間能力を超越」 体験:

1. **過去傾向との対比**: lifeContext 直近 7 日と当日 anchor を統合、 「最近◯◯系が多い」 文脈で解釈
2. **未使用能力起動**: Stargazer 「未使用能力」 軸と接続、 「この予定はあなたの〜を動かす」
3. **2 つの自分の同時提示**: 集中モード vs 休息モード、 状況による別解釈 (= clarify pattern)
4. **Negative Capability**: PM 取得失敗時、 「(まだあなたを十分観測できていない)」 framing で 「観測の進行中」 を可視化

(= ④③ は Step 3+ 候補、 Step 2 は ①② に集中)

---

## 5. Safety / Cost / Failure (= 思考原則 ④)

### 5.1 多段 gate (= Step 1 と統合)

| 段 | check | 違反時 |
|---|---|---|
| Pre-LLM | `PLAN_FLAGS.personalModelIntegration === false` | PM 注入 skip (= Step 1 同等動作) |
| Pre-LLM | `isPersonalModelAllowed(userId) === false` (= Phase < 2) | PM 注入 skip |
| Pre-LLM | `extractPersonalModelSummary(userId)` throw | PM undefined、 LLM 経路は通す (= safe degrade) |
| Pre-LLM | `userId` 不在 (= 未ログイン) | LLM 経路自体 skip (= readiness §6.1 強化候補) |
| Mid | Step 1 と同 (= timeout / runAI fail / validation_failed) | deterministic fallback |
| Post | LLM 出力に user 個人情報 (= 名前) が含まれる | validator 強化 (= 「{user_name}」 pattern reject) |

### 5.2 Cost

- PM 抽出: 1 user 1 day で 1 度 (= cache)、 DB read のみ、 cost 0
- LLM call: Step 1 と同 (= 20 calls / view、 同時 5、 4000ms timeout)
- Stargazer prefetch: 既存 module 流用、 追加 cost 0

### 5.3 Privacy

- PM short tag は **既に Stargazer で正規化済の安全 layer** (= baselineContext 等)
- LLM prompt に raw axis score / user 名前 / 住所等は送らない
- 「集中型」 「朝強い」 等の抽象 tag のみ

---

## 6. Step 1 との互換性 (= 後退可能性)

- `PLAN_FLAGS.personalModelIntegration` default false
- false で完全 Step 1 と同等動作 (= safe degrade)
- true でも `extractPersonalModelSummary` 失敗時は Step 1 同等
- live ON 時に問題が出たら env で即 OFF (= kill switch)

---

## 7. CEO 判断 (= 5 件、 着手前停止)

### Q1. Personal Model 取得 timing
- 案 A: server action 内で 1 day 単位 (= 推奨、 1 user / 1 day で 1 度抽出)
- 案 B: SSR 段階で /plan render 時 prefetch (= Plan App 起動コスト増)
- 案 C: client side で別 API endpoint 経由取得 (= round-trip 増)

### Q2. HDM Phase ゲート strictness
- 案 A: Phase ≥ 2 で個別化 ON (= HDM v1 原則踏襲、 推奨)
- 案 B: Phase ≥ 1 で ON (= 早期から効果見せる)
- 案 C: Phase ゲート無し、 PM 取得成功なら常時 ON

### Q3. tag 抽出粒度
- 案 A: 4 種 short tag (= judgmentMode / timePreference / energyRecovery / recentRhythm、 推奨)
- 案 B: 2 種 (= judgmentMode + timePreference のみ、 最小)
- 案 C: 6 種以上 (= 軸数増、 prompt token 増)

### Q4. PM tag に PII 含めるか
- 案 A: 完全に抽象化 (= 「集中型」 等のラベルのみ、 推奨)
- 案 B: 年代帯 (= 「20 代後半」) 等の薄い demographic 含む
- 案 C: 含めない + 文体だけ Phase 別調整

### Q5. Stargazer 軸データ未完成 user の扱い
- 案 A: PM undefined、 Step 1 同等動作 (= silent fallback、 推奨)
- 案 B: 「観測進行中」 表示で user に促す
- 案 C: 既存 deterministic 維持、 LLM 経路も skip

---

## 8. Step 2 実装着手手順 (= GPT 補正通り、 Step 1 live ON 判定後)

### Phase 1: branch 切替 (= `feat/alter-plan-p2-llm-step2`)

### Phase 2: 新規 module
1. `lib/plan/llm/personalModelExtractor.ts` (= server-only)
2. `lib/plan/llm/hdmPhaseGate.ts` (= server-only)
3. `lib/plan/llm/alterNotePromptBuilderV2.ts` (= pure)

### Phase 3: 既存 module 改変
1. `lib/plan/featureFlags.ts` (= personalModelIntegration flag 追加)
2. `lib/plan/llm/alterNoteGenerator.ts` (= V2 builder 分岐)
3. `lib/plan/list/adapters/externalAnchorAdapterAsync.ts` (= PM 注入)

### Phase 4: 単体 test (= 3 + 1)
- promptBuilderV2 / extractor / gate / generator 拡張

### Phase 5: 検証
- tsc + vitest 全 PASS
- self-dev Playwright smoke (= flag OFF で Step 1 同等、 flag ON で PM 注入確認)

### Phase 6: atomic commit + Step 2 ON-path smoke (= Step 1 と同手順)
- 5 項目 + PM 特有 5 項目 (= PM tag 注入 / 未取得 fallback / Phase ゲート / PII なし / Step 1 OFF で完全同等)

### Phase 7: CEO 採用判定 + live ON 別 patch
- Step 1 と同様、 default false で merge → 別 patch で env enable

**想定 工数**: 3-5 day (= Step 1 経験で readiness 確立済)

---

## 9. 関連 readiness / 設計書

- `docs/alter-plan-p2-llm-readiness.md` v2 (= Step 1 親 readiness)
- `docs/alter-plan-p2-llm-step1-on-path-smoke.md` (= Step 1 smoke 結果)
- `docs/heart-dynamics-model-v1.md` (= HDM Phase 設計)
- `docs/stargazer-human-os-design.md` (= Personal Model 全体像)
- `memory/aneurasync-philosophy.md` (= 第二の自己 思想)

---

## 10. CEO 思考原則 ①〜⑦ への応答

- ① 前提を疑え: 「LLM だけで人間同等」 ではない (= Personal Model 必須)
- ② 自立推論 + リサーチ: Stargazer 4 module 検証済、 接続案完成
- ③ シンプル法案: Step 1 と同 pattern (= flag + pure module + fail-open)
- ④ 外科的修正: 新 3 module + 既存 3 file 改変のみ
- ⑤ ゴール逆算: ゴール (= 「第二の自己」 体験) → PM 4 tag → 1 度抽出 → prompt 注入 → 段階確定
- ⑥ 人間同等推論: Stargazer 軸 + lifeContext 接続で本格達成
- ⑦ 革新的アイデア: 過去対比 / 未使用能力起動 / 2 つの自分提示 / Negative Capability

---

**結語**: Step 2 readiness は Step 1 実装で確立した pattern を踏襲しつつ、 Aneurasync 思想の核 (= 「第二の自己」 / 「あなたの判断原理を持つ存在」) を初めて Plan で実装する readiness。 着手は **Step 1 live ON 判定後**。 CEO Q1〜Q5 判断後、 Phase 1〜7 で順次実装。
