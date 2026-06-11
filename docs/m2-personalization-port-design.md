# M2 PersonalizationPort 設計・実装計画（監査→計画設計、CEO order item 1）

**作成日**: 2026-06-12
**ステータス**: docs-only。CEO 指定フロー「監査→計画設計→実行」のうち**監査+計画設計まで完了**。実行（M2-A）は本書 GO 後。
**制約**: local only（GitHub suspended）。read-only port。**DB write なし・migration なし・Travel UI なし・既存ファイル変更なし（additive only）**。
**目的**: Stargazer の観測 state を Plan / Travel / CoAlter が読める**正本 read model** にする。平日プラン監査で特定した最大ギャップ（state→plan 接続ゼロ）の解。

---

## §1 監査結果（M2 スコープ精密監査、2026-06-12）

### §1.1 state 源の実在と server 可読性

| state | 正本 | 永続化 | server 可読（自分） | server 可読（ペア相手） |
|---|---|---|---|---|
| 性格軸スコア | `lib/stargazer/traitAxes.ts`（core 45 + expansion tier。frozen 軸あり） | ✅ **`stargazer_axis_snapshots`**（score -1..1, confidence, context, observation_layer, session_date。`20260307170000_stargazer_continuous.sql`） | ✅ RLS `auth.uid()=user_id` | ❌ RLS で不可 |
| HDM phase / trust | `hdm_phase_state` JSONB + `trust_level` | ✅ `stargazer_alter_growth`（`20260407500000_hdm_phase.sql`） | ✅ 同上 | ❌ 同上 |
| 内的天気（energy/stress/socialBattery） | `lib/stargazer/innerWeather.ts`（pure 推算エンジン） | ❌ **テーブル不在**（WeatherHistory 型はあるが migration なし） | ❌ | ❌ |
| ActionShape / ForceBalance（7連続量） | `lib/stargazer/alterHomeAdapter.ts:154-232` | ❌ LLM 出力のみ（永続テーブル未確認） | ❌ | ❌ |
| fairness ledger | `coalter_fairness_ledger`（bias_score -1..+1, decided_at） | ✅ `20260415100000_coalter.sql:129-160` | ✅ RLS: pair メンバー | ✅ pair メンバー |
| pair 解決 | `coalter_pair_states`（user_a/user_b, state: pending_consent/enabled/disabled, onboarded_at） | ✅ 同 migration | ✅ pair メンバー | — |

**訂正**: 旧記載 `stargazer_axis_scores` は誤り。正本は **`stargazer_axis_snapshots`**（[travel-mode-plan-os-extension-design.md](travel-mode-plan-os-extension-design.md) 同時修正済み）。

### §1.2 重要発見: 既存 CoAlter live path の RLS 懸念（要確認・本書スコープ外）

`lib/coalter/understanding/liveCollector.ts` の `fetchAxesByUser(supabase, userA, userB)` は `.in("user_id",[userA,userB])` で両者の行を読む設計だが、呼び出し元 `app/api/coalter/invoke/route.ts:44` は **`supabaseServer()`（user-RLS client）**を注入しており、`stargazer_axis_snapshots` / `stargazer_alter_growth` の RLS は「自分の行のみ」。→ **相手の軸・phase が静かに欠落している可能性が高い**（エラーにならず空になるため検知されない）。これは M2-B（ペア read 設計）が解くべき本丸であり、同時に既存 CoAlter Stage 1 の品質問題として owning session での確認を推奨。

### §1.3 踏襲すべき house style

- **port 形**: `lib/plan/reality/assembly/supabase-worldstate-source-ports.ts` — `async () => T | null`、throw しない、readiness 不足は null で表現。
- **shared 正本**: `lib/shared/` は pure（location.ts）またはリポジトリ（wardrobe）。UI ロジック禁止。client は引数注入（liveCollector 同様）。
- **テスト**: vitest、`tests/unit/*.test.ts`、factory ヘルパでデータ構築。

---

## §2 Port 契約 v1

配置: **`lib/shared/personalization/`**（正本原則準拠・domain-neutral。plan/travel/coalter のどれにも属さない）。

```typescript
// types.ts（pure）
export type AxisSnapshot = { score: number; confidence: number; observedAt: string };
export type PersonalizationSnapshot = {
  userId: string;
  asOf: string;
  axes: Partial<Record<TraitAxisKey, AxisSnapshot>>; // 軸ごと最新1件（global context 優先）
  hdm: { currentPhase: number; trustLevel: number } | null;
  dynamicState: { energy: number; stress: number; socialBattery: number } | null; // v1: 常に null（§1.1）
  decisionMeta: null;                                                             // v1: 常に null（§1.1）
};
export type PlanParams = {
  paceDefault: "slow" | "normal" | "intense";
  densityCap: number;          // 1日の活動数上限の事前値
  morningness: number;         // 0..1（朝行動の適性）
  noveltyBias: number;         // -1..1（定番↔新奇）
  precommitPreference: number; // 0..1（事前確定↔即興、wander 比率に接続）
  socialLoadTolerance: number; // 0..1
  budgetPosture: "save" | "balanced" | "quality";
  bufferMargin: number;        // 行程余白の事前値（モックの「予定の余裕」に接続）
  explanationTone: "reason_first" | "feeling_first";   // M5 説明スタイル
  confidence: Partial<Record<keyof PlanParams, number>>; // パラメータ別信頼度
};
export type PairPersonalizationContext = {
  pairStateId: string;
  enabled: boolean;            // state==='enabled' && onboarded_at != null
  fairness: { rows: { biasScore: number; decidedAt: string }[]; currentBias: number };
  partnerSnapshot: null;       // v1: 常に null（M2-B で解禁、§4）
};
```

```typescript
// 関数契約（house style: T | null、no-throw、read-only）
getPersonalizationSnapshot(client: SupabaseClient, userId: string): Promise<PersonalizationSnapshot | null>
getPairContext(client: SupabaseClient, pairStateId: string): Promise<PairPersonalizationContext | null>
derivePlanParams(snapshot: PersonalizationSnapshot): PlanParams            // pure
deriveTravelTraits(snapshot: PersonalizationSnapshot): TravelTraitVector   // pure・T1A で M1 24軸へ（v1 は部分集合）
```

設計判断:
- 軸の集約は「軸ごと最新 1 件、`context IS NULL`（global）優先、`observation_layer='state'` 優先」。時系列集約・減衰は v2（まず最新値で十分）。
- **frozen tier の軸は写像に使用しない**（axisRegistry の tier/forwardTo を尊重）。
- dynamicState / decisionMeta は**契約として先に置き、v1 は null 固定**。永続化テーブル追加（M2-B 以降・migration は CEO 承認事項）まで consumer は null-safe に振る舞う。これは worldstate ports の null 流儀と同一。

---

## §3 写像 v0（軸 → PlanParams、初期仮説）

| PlanParams | 源泉軸（traitAxes.ts 実在キー） | 規則（要旨） |
|---|---|---|
| paceDefault / densityCap | quality_vs_quantity, minimal_vs_maximal, energy_rhythm | quality 寄り+minimal 寄り → slow / cap 低 |
| morningness | energy_rhythm | 朝型スコアをそのまま正規化 |
| noveltyBias | tradition_vs_novelty, novelty_threshold, change_embrace_vs_resist | 3軸の confidence 加重平均 |
| precommitPreference | plan_vs_spontaneous, cautious_vs_bold | plan 寄り → 事前確定高・wander 比率低 |
| socialLoadTolerance | introvert_vs_extrovert, social_initiative, stress_isolation_vs_social | 内向+孤立回復 → 低 |
| budgetPosture | function_vs_expression, quality_vs_quantity | quality+expression → quality 寄り |
| bufferMargin | cautious_vs_bold, perfectionist_vs_pragmatic | 慎重 → 余白大 |
| explanationTone | rational_vs_emotional_decision, analytical_vs_intuitive | 合理 → reason_first |

**信頼度伝播規則**: param confidence = 源泉軸 confidence の加重平均。**閾値未満（v0: 0.3）の param は中立デフォルト値 + confidence 明示**で返し、consumer 側（質問生成・M1 micro 質問）が「聞くべき軸」を判別できるようにする。係数は仮説であり、Alves et al. 2023 の係数精読と運用データで較正する（v0 は方向性のみ正しいことを優先）。

---

## §4 スコープ分割

| Slice | 内容 | 触るもの | ゲート |
|---|---|---|---|
| **M2-A**（次） | types + supabase reader（自分の snapshot + pair ledger）+ pure 写像 + unit tests | **新規ファイルのみ**（`lib/shared/personalization/` + `tests/unit/`）。既存コード変更 0・migration 0・flag 0（未消費の純ライブラリ） | 本書 GO |
| **M2-B** | ペア相手 snapshot の read 設計。比較する 2 方式: (a) consent-gated service_role read（pair state='enabled' 検証後にのみ escalate）/ (b) 共有スナップショットテーブル新設（本人が書き、pair RLS で読む。migration 必要） | route 層 or migration | **CEO 方式判断**（§1.2 の既存懸念の解も兼ねる） |
| **M2-C** | consumer 配線: empty-day `EmptyDayInput.energy` 等への接続、Travel T1A からの consume、CoAlter understand への prior 供給（モックの「予算: ミディアム」の正体） | 既存ファイル | M2-A 完了後、consumer ごとに別 slice |

## §5 検証計画（M2-A 受け入れ基準）

1. unit tests: 写像の境界（confidence 0 / frozen 軸除外 / 欠損軸 → 中立デフォルト）+ reader（fake client 注入で RLS 相当の絞り込み・空結果 → null）
2. `npx tsc`（`--max-old-space-size=8192`）で baseline **55 から増加なし**
3. 既存 test suite GREEN 維持（既存コード不接触なので構造的に保証されるが実行確認する）
4. grep 検証: `lib/shared/personalization/` から DB write（insert/update/delete/upsert）呼び出し 0

## §6 不変条件

- 観測（Stargazer 書き込み側）には一切触れない。port は読むだけ。
- `lib/coalter/` `lib/plan/reality/` の既存ファイル変更 0（M2-A 時点）。
- production 関連操作 0（local only 前提）。

## §7 CEO 確認点

1. **M2-A 着工 GO**（§2 契約 + §4 スライス分割のまま実装に入ってよいか）
2. M2-B の方式（service_role consent-gate vs 共有スナップショットテーブル）は M2-A 完了後に比較表を出して判断を仰ぐ、で良いか
3. §1.2 の liveCollector RLS 懸念（既存 CoAlter live path で相手 state が欠落している可能性）の確認を、CoAlter owning 文脈で行うことの承認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
