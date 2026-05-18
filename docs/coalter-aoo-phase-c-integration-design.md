# CoAlter AOO Mirror Channel — Phase C Integration Design (2026-05-18)

**ステータス**: C-0 設計 docs (docs-only) / 実装着手は CEO 承認後 (C-1 から sequential)
**起票日**: 2026-05-18
**前提**: Phase B 正式 close (`docs/coalter-aoo-phase-b-completion.md`、PR #185 / `67f3a085`)
**Phase B 達成 (引き継ぎ正本)**: **conditional pass** — core safety validated, visible Mirror full validation 未達 (構造的)
**学術基盤 (Phase C 追加)**: Therapeutic alliance research (Lambert, 1992) / Motivational Interviewing reflective listening (Miller & Rollnick) / Just-in-time adaptive interventions (Nahum-Shani et al., 2018) / Phase A Always-On = 観測のみ / Phase B Mirror = reflection-only hedged grammar

> ## 🎯 Phase C の北極星 (絶対遵守)
>
> **「shadow mode で構造完成した Mirror を、安全な実 input で動かす」**
>
> - Phase B は「構造を作って黙る」が達成された (default STAY_SILENT 100% / no leak / no disruption)
> - Phase C は「実 input に接続して、controlled な条件で初めて visible に動かす」
> - **Phase C 完了 ≠ Production rollout 開始**。Production rollout は **Phase D** で別途設計 (本 docs §9 参照)
> - Phase A → B 学び取り込み漏れ (本 docs §2) を Phase C で構造的に再発防止
>
> Phase B canon (10 原則) は Phase C 以降不変。Phase C で許容される境界緩和は **3 件のみ** (本 docs §5)。

---

## 0. Executive Summary

Phase C は **6 sub-PR (C-1 〜 C-6) sequential** で構成。各 PR は **risk increment が明示的に小→大** で並ぶ。任意の sub-PR で問題が観測されたら **直前 PR を revert + env 削除のみで完全 rollback** できる構造を維持。

### 0.1 Phase B 引き継ぎ (CEO 補正の正確表現、絶対遵守)

#### Validated (Phase B core safety、実機で実証済)
| # | 項目 | 根拠 |
|---|---|---|
| 1 | **default STAY_SILENT** | CEO 実機 B-5c smoke 100% (Mirror 一度も出現せず) |
| 2 | **no UI break** | 既存 chat / CoAlter UI / presence layer 影響 0 |
| 3 | **no PII leak observed** | DOM / Network / console 確認可能範囲 0 |
| 4 | **env cleanup all scopes 0** | production / preview / development 削除確認済み |
| 5 | **rollback trigger 0** | smoke 中の 11 trigger 1 件も発火せず |

#### Not validated (Phase C で扱う、構造的未到達)
| # | 項目 | 構造的理由 | Phase C 対応 |
|---|---|---|---|
| 1 | visible Mirror runtime path | `engineAdapter` が presence-derived axes を全て unknown に倒すため Observe Gate fail | **C-2 read-only adapter + C-3 controlled canary** |
| 2 | close / sleep / cap 実機動作 | visible 経路発火に依存 | **C-4 実機 smoke** |
| 3 | diagnostic global in Preview | `NODE_ENV === "production"` guard で install 抑止 | **C-1 Preview-safe diagnostic exposure fix** |
| 4 | linguisticStopDetector runtime connection | chat layer touch 必要 (Phase B 不可侵境界) | **Phase C scope 再判断 → 別 PR / Phase D 候補 (§4.4 参照)** |

### 0.2 不可侵境界遵守 (Phase C 全期間)

Phase A + Phase B canon **全項目維持**。Phase C で許容される境界緩和は §5 の **3 件のみ**。Production env / all Preview env / chat layer touch / raw text 保存 / cross-session persistence / Question・Proposal auto-fire 等は **絶対禁止**。

### 0.3 本 docs (C-0) の役割

- Phase C 設計 canonical (本 docs)
- code 0 diff / package.json 0 diff / env 未変更
- C-1 着手は CEO 承認後

---

## 1. Phase B → Phase C 引き継ぎ (正確表現、CEO 補正遵守)

### 1.1 Phase B 達成定義 (再掲、Phase C 全期間で踏襲)

> ✅ **safe default / no-disruption / no-leak / runtime guarded foundation validated**
> ❌ **NOT "Phase B full visible success" / NOT "visible Mirror fully validated"**

### 1.2 Phase C 完了定義 (CEO 承認の暫定案、§6 で詳細化)

> ✅ **visible Mirror in controlled canary validated / read-only presence integration safe / Preview-safe diagnostic exposure validated**
> ❌ **NOT "Phase C production rollout"** — Phase D で扱う

### 1.3 Phase B canon (§7.4) を Phase C 以降不変として再宣言

| # | canon 原則 | Phase C での扱い |
|---|---|---|
| 1 | shadow mode pattern | 拡張、shadow 経路は **常に並走** (visible 経路と二重) |
| 2 | default-STAY_SILENT 構造保証 | `MirrorDecision` discriminated union 新 variant 追加禁止 |
| 3 | 7-layer postSpeakVerification | 新 template / 新 grammar は全 7 layer 通過必須 |
| 4 | 4-gate visible orchestration | gate 順序固定 (decision → sleep → cap → text → verification) |
| 5 | PII firewall (型 + runtime 二重) | C-2 read-only adapter の入出力にも適用 |
| 6 | 4-layer flag gating defense | C-1 で NODE_ENV guard 削除しても 4-layer defense は維持 |
| 7 | hedged grammar template only | C-5 taxonomy 拡張検討でも hedged form 強制 |
| 8 | retreat affordance principle | C-3/C-4 visible 経路でも「閉じる」「黙ってもらう」のみ |
| 9 | session-local persistence のみ | cross-session 持ち越し禁止 (cap / sleep / diagnostic 全 session-local) |
| 10 | enum-locked template id | runtime に arbitrary text 生成禁止 |

---

## 2. Phase A → Phase B 学び取り込み漏れの再発防止メタプロセス

### 2.1 事象 (Phase B 完了 docs §7.1)

Phase A 完了 docs `docs/coalter-aoo-phase-a-completion.md` §3.5 で:

> **「NODE_ENV gate は Vercel Preview build (= production build) で canary を無効化するため採用禁止 (A-2e 補正)」**

と明示されていたが、Phase B B-5a 設計時に取り込めていなかった → B-5c smoke で `window.__coalterMirrorDiagnostic` が `undefined` となった root cause。

### 2.2 構造的再発防止 (Phase C → D → E にも適用)

**新ルール (本 docs で canon 化)**: 次 Phase 着手前に **前 Phase 完了 docs § 系 (重要発見・訂正) 必読 checklist** を新 Phase design docs 冒頭に導入。

```
□ 前 Phase 完了 docs §3 系 (重要発見・訂正) 全項目を読了
□ 各重要発見について、新 Phase 設計でどう取り込む / 既に取り込んだか明示
□ 新 Phase で「再現しない」根拠を docs に書く
□ 前 Phase canon を新 Phase 冒頭で再宣言
```

### 2.3 Phase C で取り込む Phase A/B 学び (具体的)

| Phase | 学び | Phase C での取り込み |
|---|---|---|
| A §3.4 | empty commit は IBS で Skip / `.ts/.tsx` 最小修正で trigger | C-0 smoke runbook §7 で 2 経路 (`vercel --force` / `.ts` minimal comment) を併記 |
| A §3.5 | **NODE_ENV gate 採用禁止** | **C-1 で `NODE_ENV === "production"` guard を削除** (本 docs §4.1) |
| A §3.6 | debug global 段階改善 (v1→v2.2 redacted only) | Phase C 全期間で redacted snapshot のみ exposure (Phase B 既に達成、維持) |
| A §3.7 | 7-layer defense (NODE_ENV gate 削除の代替) | C-1 で削除した layer の補完が 7-layer defense (本 docs §4.1 で詳述) |
| B §7.1 | NODE_ENV guard の Phase A 学び取り込み漏れ | 本 §2 で構造的再発防止メタプロセス導入 |
| B §7.2 | IBS bypass の 2 経路 (`vercel --force` / `.ts` 修正) | C-0 smoke runbook §7 に明記 |
| B §7.3 | env scan strict match (false positive 防止) | C-0 smoke runbook §7 の標準 grep pattern |
| B §10.4 | `vercel deploy --force` の git 属性確認 | C-0 smoke runbook §7 に明記 |

---

## 3. Phase C 設計原則

### 3.1 risk increment 順序 (sub-PR の並び方)

```
risk
  ^
  |                                              ┌── C-6 (Phase C 全体 smoke)
  |                                              │
  |                                   ┌── C-5 ──┘ (taxonomy 拡張検討 docs)
  |                                   │
  |                          ┌── C-4 ─┘ (実機 close/sleep/cap smoke)
  |                          │
  |                   ┌── C-3┘ (controlled visible canary)
  |                   │
  |            ┌── C-2┘ (read-only presence adapter)
  |            │
  |     ┌── C-1┘ (Preview-safe diagnostic exposure fix、1 line)
  |     │
  | C-0 ┘ (本 docs)
  +─────────────────────────────────────────────────────────> time
```

各 sub-PR は **前 PR より厳密に高 risk**。途中で問題発生時は **直前 sub-PR を revert (env 削除のみで実質 rollback 完了)** で対応。

### 3.2 sequential 厳守 (並列起票禁止)

Phase B 完了 docs §8 sequential 順序を踏襲。並列起票は CEO 個別承認時のみ例外。

### 3.3 sub-PR 1 件あたりの LOC budget

| 種別 | 目安 |
|---|---|
| docs-only PR (C-0 / C-5) | 300-600 行 docs |
| 1 line fix (C-1) | 1-5 行 + test (合計 < 30 行) |
| 機能追加 (C-2 / C-3) | 80-180 行 + test (合計 < 400 行) |
| smoke (C-4 / C-6) | docs 200-400 行 + smoke 実機 |

合計 想定: Phase C 全体で **code +400 行 / docs +1800 行** (tentative)。

### 3.4 各 sub-PR で必須の PR description checklist

§Appendix C 参照。

---

## 4. Phase C sub-PR 詳細仕様

### 4.1 C-1 — Preview-safe diagnostic exposure fix

#### 目的
B-5c smoke で発覚した `window.__coalterMirrorDiagnostic` 不可視問題を解決。Phase A §3.5 学び (「NODE_ENV gate 採用禁止」) を Phase B にも適用。

#### 修正範囲 (1 line removal)

`lib/coalter/mirror/diagnosticDebugGlobal.ts` の **L111 削除**:

```typescript
// 削除対象 (3 line):
if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
  return;
}
```

削除後の install 経路 (4-layer flag gating + 15-min expire で十分):

```
(1) 二重 flag gate: mirrorChannelEnabled === true ∧ mirrorDiagnosticExposeEnabled === true
(2) SSR ガード: typeof window !== "undefined"
(3) 二重 install 防止 (idempotent)
(4) 15-min auto-expire (内部 check)
```

#### 4.1.1 削除して大丈夫な理由 (Phase A §3.7 7-layer defense 継承)

`docs/coalter-aoo-phase-a-completion.md` §3.7 で確立した 7-layer defense:

| L | 防御 | 本 case での適用 |
|---|---|---|
| L1 | env flag default false | `mirrorChannelEnabled` / `mirrorDiagnosticExposeEnabled` 両方 default false |
| L2 | env scope = branch scoped Preview only | CEO 手動 + 二重 scope 確認手順 |
| L3 | PR merge **絶対禁止** (draft only) | canary branch は smoke draft、merge しない |
| L4 | branch 短命 (smoke 完了後破棄) | smoke 完了 1 時間以内 |
| L5 | 15 min 時限 expire | `EXPIRE_MS = 15 * 60 * 1000` in `diagnosticDebugGlobal.ts:49` |
| L6 | smoke 後 env 削除 (CEO 操作) | smoke runbook §7 cleanup command |
| L7 | raw 露出禁止 (redacted snapshot only) | `MirrorDiagnosticEntry` 型レベル PII firewall |

→ 7-layer defense が NODE_ENV gate の機能を **十分代替** している。L1〜L7 全て満たされている状況で NODE_ENV gate 重複は Phase A で禁則化された通り。

#### 4.1.2 不可侵
- 他 mirror module / presence / chat / observer 全て **0 diff**
- 4-layer flag gating defense (L3 = MirrorHost guard + L4 = useMirrorEngine early return) は維持
- 7-layer defense は維持

#### 4.1.3 acceptance
- (a) C-1 単独 PR で `diagnosticDebugGlobal.ts` 修正 + test 追加
- (b) test: `installDiagnosticDebugGlobalIfEnabled()` が production NODE_ENV でも `_installed === true` になることを確認
- (c) regression test: SSR / 二重 flag gate / idempotent / 15-min expire は依然動作
- (d) Phase A 7-layer defense L1-L7 の各 layer が docs に明示参照

#### 4.1.4 CEO 判断 point
- 削除のみで進めるか、代替 guard を明示的に追加するか (推奨: 削除のみ、7-layer defense 既存)

#### 4.1.5 LOC budget
1-3 lines 削除 + test 追加 (合計 < 30 行)

### 4.2 C-2 — Read-only presence / relationship state adapter

#### 目的
`engineAdapter` が presence-derived axes を全て `unknown` に倒している状況を、**read-only で安全に**実値に置換する。

#### 修正範囲 (新規 file + 既存 file 拡張)

**新規 file**: `lib/coalter/mirror/presenceMirrorBridge.ts`
- 既存の **Phase A 公開済み read API のみ** import
- 推奨 source: `lib/coalter/observer/relationshipState.ts:260` `getRedactedRelationshipStateSnapshot` (**PII firewall 既適用**、Phase A canon)
- export: Mirror engine 用の `getMirrorReadInput(): MirrorReadInput | null` (純関数、read-only)
- write API 一切 export しない (型レベル + runtime 二重で write を構造的に塞ぐ)

**修正 file**: `lib/coalter/mirror/engineAdapter.ts`
- `buildMirrorDecisionInput()` 内で `presenceMirrorBridge.getMirrorReadInput()` を呼出
- 結果 null なら従来通り全 axis `unknown` (fail-closed 維持)
- 結果 non-null なら実値を `modeContext` / `alignmentBucket` / `uncertaintyBucket` / `silenceBudgetBucket` / `patternCategoryBucket` に投影

#### 4.2.1 presence layer read API 候補比較 (3 options)

| Option | API | 利点 | 欠点 |
|---|---|---|---|
| **α (推奨)** | `lib/coalter/observer/relationshipState.ts:260` `getRedactedRelationshipStateSnapshot()` | PII firewall **既適用** / Phase A canon / 観測経由で presence layer 直触り回避 | observer layer 経由のため presence layer の最新値ではない可能性 (latency) |
| **β** | `lib/coalter/presence/availability.ts` `getPresenceMobility` / `isUiVisible` | 直接 presence 値 / 即時性高 | presence layer 直触り、PII firewall を Mirror 側で新規実装が必要 |
| **γ** | 新規 presence layer 側 read-only API を追加 | 設計 cleanly | presence layer 修正必要 → 不可侵境界違反 |

**Claude 推奨**: **Option α** (PII firewall 既適用 + Phase A canon)。

#### 4.2.2 不可侵
- presence layer **write 絶対禁止** (adapter 内で write API export しない構造)
- chat layer / ChatClient.tsx 0 diff
- adapter は **pure function** (state 持たない、I/O なし、副作用なし)
- raw text / raw id は adapter 入出力に含まれない (型レベル禁止)

#### 4.2.3 acceptance
- (a) `presenceMirrorBridge.ts` 新規 + test 完備
- (b) `engineAdapter.ts` 拡張、従来 fail-closed path 維持
- (c) test: read API null → 従来通り全 unknown / read API 値あり → 実値投影
- (d) presence layer module への新規 import は **read-only API のみ** (Phase B canon §7.4 #5 PII firewall 維持)

#### 4.2.4 CEO 判断 point
- α/β/γ 選択 (推奨 α)
- adapter export 範囲 (read-only 限定であることの保証手段)

#### 4.2.5 LOC budget
新規 `presenceMirrorBridge.ts` 80-120 行 + `engineAdapter.ts` 拡張 30-50 行 + test (合計 < 400 行)

### 4.3 C-3 — Controlled visible path canary

#### 目的
C-2 接続後、真の MIRROR_CANDIDATE が極めて稀にしか発火しない場合に備え、**controlled canary mode** で visible 経路を強制発火させて観測量を確保。

#### 修正範囲

**新規 file**: `lib/coalter/mirror/forcedCanaryMode.ts`
- 新規 env flag: `NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY` (strict parser、default false)
- forced mode 時:
  - cap を **10** に上書き (通常 1) → 観測量確保
  - sleep / verification / 7-layer は **すべて維持** (緩和なし)
  - 通常 mode の env と独立 (mirrorChannelEnabled が ON でも forced は別 flag)

**修正 file**: `lib/coalter/mirror/frequencyCap.ts`
- forced mode フラグ ON 時の cap override 経路を追加 (1 関数追加程度)

**修正 file**: `hooks/useMirrorEngine.ts`
- forced mode フラグ ON 時、`isVisibleCapReached()` を override 経路から read

#### 4.3.1 通常 mode と forced mode の構造分離

| 項目 | 通常 mode (Phase B 完了形態) | forced canary mode (Phase C-3) |
|---|---|---|
| visible cap | 1 / session | 10 / session |
| sleep ON 時 visible | block | block (緩和なし) |
| 7-layer verification | strict | strict (緩和なし) |
| 4-gate orchestration | strict | strict (緩和なし) |
| env flag | `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` | `NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY` |
| 投入 scope | branch-scoped Preview | branch-scoped Preview |
| Production / 全 Preview / Development | **絶対投入禁止** | **絶対投入禁止** |
| smoke 後削除 | 必須 | 必須 |

#### 4.3.2 不可侵
- forced mode は **cap 数値以外の gate を緩和しない** (sleep / verification 7-layer / 4-gate 全 strict 維持)
- forced mode は **Production / 全 Preview / Development に絶対投入禁止** (env scope branch-scoped only)
- forced mode flag は default false strict parser (空文字 false、Phase B-1 と同 pattern)

#### 4.3.3 acceptance
- (a) `forcedCanaryMode.ts` + test
- (b) `frequencyCap.ts` 拡張 + test
- (c) `useMirrorEngine.ts` 経路追加 + test
- (d) flag OFF で通常 mode 完全互換 (regression test)
- (e) flag ON で cap=10 動作 (test)

#### 4.3.4 CEO 判断 point
- forced mode 採用可否
- cap=10 妥当性 (5 / 10 / 20 等の検討)
- forced mode flag 命名 (`NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY` 推奨)

#### 4.3.5 LOC budget
新規 + 拡張 合計 80-150 行 + test (合計 < 300 行)

### 4.4 C-4 — close / sleep / cap / verification 実機確認 smoke

#### 目的
Phase B 未到達の retreat affordance / cap / sleep / verification を、C-2 + C-3 後の実機で確認。

#### 内容 (docs + smoke 実機)
- canary branch (`chore/coalter-mirror-c4-canary`) 作成 + push (empty commit + `vercel --force`)
- CEO 手動 env 投入 (3 件: ChannelEnabled + DiagnosticExpose + ForcedCanary、すべて branch-scoped Preview のみ)
- redeploy → CEO 実機 smoke
- 19 項目 checklist (Phase B-5c §5 踏襲) + Phase C 追加 7 項目 (close button / sleep button / cap=10 動作 / duplicate / sleep ON 後 visible 0 / 7-layer verification 動作 / 後出し回避):

| Phase C 追加観測項目 | 期待 |
|---|---|
| (a) visible Mirror が C-3 forced mode で発火 | session 中に複数回 visible 出る |
| (b) 「閉じる」 click で visible 消える | DOM remove + 同 turn 内再発火なし |
| (c) 「黙ってもらう」 click で sleep ON + visible 消える | sleepStore true + visible remove |
| (d) sleep ON 後の visible 出現 | 0 件 |
| (e) cap=10 到達後の 2 度目以降 | 出現停止 |
| (f) duplicate template reject 動作 | 同 templateId 連続出現なし |
| (g) 7-layer postSpeakVerification 動作 (sampling) | 異常 template が generator で出ても verification で reject |

#### 4.4.1 不可侵
- B-5c smoke と同等: branch-scoped Preview only / env CEO 手動 / smoke 後 1 時間以内 cleanup

#### 4.4.2 acceptance
- 必須 5 項目 (a-e) pass / (f-g) はサンプリング観測で N/A 許容
- rollback trigger 11 件 0 件
- env cleanup 全 scope 0 件

#### 4.4.3 CEO 判断 point
- partial pass の扱い
- smoke 期間 (1 session / 1 日 / 7 日)

#### 4.4.4 LOC budget
smoke 専用 docs 300-500 行 + canary branch empty commit (code 0)

### 4.5 C-5 — Taxonomy 拡張検討 (docs only、実装ではない)

#### 目的
Difference / Tempo / Fairness / Repair Mirror の Phase D 以降での拡張可否を **検討のみ**。

#### 検討内容
- (a) 各 category の発火条件 (どの bucket combination で出るべきか)
- (b) hedged grammar template 追加 (各 category 5-10 template)
- (c) 7-layer postSpeakVerification の各 category 対応
- (d) Mirror Diversity Quota (Phase B 設計 §10.5) の必要性再評価
- (e) **実装は別 PR + CEO 承認** (C-5 では検討のみ)

#### 4.5.1 各 taxonomy category の grammar 制約 (検討時の最低基準)

| Category | hedged form 例 | 構造的 risk |
|---|---|---|
| State Mirror (Phase B 既) | 「〜のような気がしました」 | 既に runtime 確立、低 |
| **Difference** | 「少し違う感じが、ありました」 (NOT「あなたは X」) | 高 (断定リスク) → hedged 厳格化 |
| **Tempo** | 「少しテンポが揺れている、そんな印象でした」 (NOT「速い/遅い」) | 中 (評価リスク) |
| **Fairness** | 「均等とは別の重み付けがあるような…」 (NOT「不公平」) | 高 (判定リスク) |
| **Repair** | 「少し言葉を置き直したい雰囲気でした」 (NOT「謝るべき」) | 高 (提案リスク) |

→ C-5 検討で grammar pattern を category 別に固定、Phase D 実装時の design 制約として使う。

#### 4.5.2 不可侵
- code 0 / package.json 0
- C-5 では **検討の整理 + 設計 candidate の提示** のみ、template 追加は別 PR

#### 4.5.3 CEO 判断 point
- 拡張可否
- 優先順位 (Difference → Tempo → Fairness → Repair 順 / 別順)
- Phase D 候補化

#### 4.5.4 LOC budget
docs 400-600 行

### 4.6 C-6 — Phase C 全体 canary smoke / close docs

#### 目的
Phase C 全体 (C-1 + C-2 + C-3 + C-4 + C-5 反映後) の実機 smoke + Phase C 完了 docs。

#### 内容
- 全 sub-PR merged 後の **fresh canary branch** で smoke
- B-5c 19 項目 + C-4 7 項目 + diagnostic 観測 (C-1 緩和後) + presence 接続健全性 (C-2)
- Phase C 完了 docs `docs/coalter-aoo-phase-c-completion.md` 起票

#### 4.6.1 acceptance (Phase C 完了基準、§6 で詳細)

##### Validated 必須
- diagnostic global が Preview で確認できる
- visible Mirror が controlled mode で出る
- close / sleep / cap が実機で確認できる
- PII leak 0
- console error 0
- env cleanup all scopes 0
- Production impact 0

##### Phase D handoff scope
- Production rollout 設計 (env scope / monitoring / rollback procedure)
- taxonomy 拡張実装 (C-5 検討結果)
- linguistic stop detector runtime 接続

#### 4.6.2 LOC budget
smoke docs 200-300 行 + Phase C 完了 docs 500-700 行

---

## 5. Phase C で緩めてよい可能性がある境界 (CEO 承認後のみ、3 件)

> ⚠️ **以下 3 件以外の境界緩和は Phase C scope 外、Phase D 候補**

| # | 緩和対象 | 緩和理由 | 維持される境界 | 担当 PR |
|---|---|---|---|---|
| **1** | diagnostic global の `NODE_ENV === "production"` guard 削除 | Phase A §3.5 学び (NODE_ENV gate 採用禁止) + 7-layer defense 既存 | 4-layer flag gating + 15-min expire + 二重 flag gate | **C-1** |
| **2** | presence layer に対する **read-only access** | shadow mode → controlled visible 経路への遷移に必須 | presence layer write 絶対禁止 / read-only API のみ (Phase A canon の `getRedactedRelationshipStateSnapshot` 経由推奨) | **C-2** |
| **3** | visible 経路の **forced canary mode** (cap=10 override) | controlled candidate path 確立、観測量確保 | sleep / verification 7-layer / 4-gate は全 strict 維持 / forced mode は branch-scoped Preview only | **C-3** |

### 5.1 緩和してはいけない境界 (Phase C 全期間絶対遵守)

`docs/coalter-aoo-phase-b-completion.md` §9 + Appendix C 全項目 = Phase A canon + Phase B canon の合算。下記は再掲 + 強調:

- ❌ **Production env 投入** (canary も含む)
- ❌ **all Preview env (branch 非指定) 投入**
- ❌ **Development env 投入** (CEO 個別承認なし)
- ❌ **chat layer touch** (app/components/chat/*, components/chat/*, app/api/*) — 0 diff 維持
- ❌ **presence layer write** (read-only 限定)
- ❌ **ChatClient.tsx / MirrorSurface.tsx 既存 logic 変更** — 0 diff 維持
- ❌ **DB / Supabase / migration / API route / Sentry / remote telemetry / LLM call** — 一切なし
- ❌ **raw text / raw id (messageId / userId / pairId / sessionId) 保存** — 0
- ❌ **Question / Proposal / Suggestion 自動発火**
- ❌ **cross-session persistence** (sleep / cap / diagnostic / channelLock 全 session-local)
- ❌ **Alter Morning 混入**
- ❌ **package.json 変更** (必要なら別 PR + CEO 承認)
- ❌ **Phase B canon §7.4 緩和** (10 原則全維持)
- ❌ **linguisticStopDetector runtime 接続** (chat layer touch 必要のため、Phase C scope 外)

---

## 6. Phase C 成功条件 (Phase C 完了判定基準)

CEO 提示の 7 項目を基準とし、C-0 で詳細化:

### 6.1 必須項目 (全 PASS で Phase C 完了)

| # | 項目 | 観測経路 | 合格条件 |
|---|---|---|---|
| 1 | diagnostic global が Preview で確認できる | DevTools console `window.__coalterMirrorDiagnostic?.getSnapshot()` | install 確認 + redacted entry 取得 |
| 2 | visible Mirror が controlled 条件で出る | C-3 forced canary mode 経由、session 中に複数回 | 出現 ≥ 3 件 / session |
| 3 | close / sleep / cap が実機で確認できる | C-4 smoke 7 項目 | (a)〜(e) 必須 pass |
| 4 | PII leak 0 | DOM / Network / console / diagnostic snapshot 全 regex 一致なし | 0 件 |
| 5 | console error 0 | DevTools console 重大なし | 重大 0 件 |
| 6 | env cleanup all scopes 0 | smoke 終了後 vercel env ls 全 scope 0 件 | 全 0 件確認 |
| 7 | Production impact 0 | Production env 投入なし / Production deploy 影響なし | 完全な無接触確認 |

### 6.2 Conditional 項目 (PASS なら Phase C plus 評価、FAIL なら partial)

| # | 項目 | 合格条件 |
|---|---|---|
| 8 | C-3 forced mode で false positive 検出 (sampling) | 5 sample 中 0 件の不適切発話 |
| 9 | C-4 で 7-layer postSpeakVerification 動作確認 (sampling) | 異常 template が verification で reject される事例 1 件以上観測 |
| 10 | C-5 taxonomy 検討 docs CEO 承認 | docs review OK |

### 6.3 N/A 項目 (Phase C scope 外、Phase D へ)

- linguistic stop detector runtime 接続
- Production rollout
- taxonomy 拡張 実装 (C-5 は検討のみ)

---

## 7. Phase C smoke runbook template (再利用可能、C-4 / C-6 で利用)

### 7.1 Pre-flight (smoke 前 6 項目)

```
□ main HEAD が当該 Phase C sub-PR merge を含む
□ working tree clean
□ env strict scan: production / preview / development 全 0 件
  (`for SCOPE in production preview development; do
    npx vercel env ls $SCOPE | grep -E "(NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED|NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE|NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY)" || echo "(none)"
  done`)
□ canary branch 未存在
□ Vercel project link OK
□ npm install OK
```

### 7.2 Canary branch 作成 (2 経路、CEO 判断で選択)

#### Option A: empty commit + `vercel --force` (B-5c で実証済)
```bash
git checkout -b chore/coalter-mirror-c<N>-canary main
git commit --allow-empty -m "chore(coalter): trigger C-<N> canary"
git push -u origin chore/coalter-mirror-c<N>-canary
cp -r /path/to/main/.vercel ./
npx vercel --force --yes  # IBS bypass、git-attributed
```

#### Option B: `.ts/.tsx` minimal comment trigger (Phase A §3.4 で実証済)
```bash
git checkout -b chore/coalter-mirror-c<N>-canary main
# 安全な comment 追加 (例: hooks/useMirrorEngine.ts に 5 行 jsdoc)
# 編集後:
git add hooks/useMirrorEngine.ts
git commit -m "chore(coalter): trigger C-<N> canary via comment"
git push -u origin chore/coalter-mirror-c<N>-canary
# Vercel GitHub integration が自動 build
```

### 7.3 Env 投入 (CEO 手動、branch-scoped Preview only)

```bash
# C-1 後: 2 件
echo "true" | npx vercel env add NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview chore/coalter-mirror-c<N>-canary
echo "true" | npx vercel env add NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE preview chore/coalter-mirror-c<N>-canary

# C-3 後: 3 件 (forced canary 追加)
echo "true" | npx vercel env add NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY preview chore/coalter-mirror-c<N>-canary
```

### 7.4 投入後 scope 二重確認 (必須)

```bash
for SCOPE in production preview development; do
  echo "--- $SCOPE ---"
  npx vercel env ls $SCOPE | grep -E "(NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED|NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE|NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY)" || echo "(none)"
done
# 期待:
#   production: (none)
#   preview: 全 env が "Preview (chore/coalter-mirror-c<N>-canary)" のみ
#   development: (none)
```

### 7.5 Redeploy + Smoke

```bash
# canary redeploy (env baked-in build を作る)
npx vercel --force --yes

# Preview URL を CEO に共有
# CEO が DevTools console + 実機 UI で smoke
```

### 7.6 Smoke checklist (各 sub-PR の §で個別定義、本 §は template)

```
Phase 1 Sanity (5 項目)
Phase 2 通常会話 (7 項目)
Phase 3 Edge case (7 項目)
Diagnostic 確認 (DevTools console literal commands)
PII / Safety 確認
Rollback trigger (11 件のいずれかで即 env 削除)
```

### 7.7 Cleanup (smoke 終了 1 時間以内、CEO 手動)

```bash
# env 削除 (literal command)
npx vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview chore/coalter-mirror-c<N>-canary --yes
npx vercel env rm NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE preview chore/coalter-mirror-c<N>-canary --yes
# C-3 後の smoke のみ:
npx vercel env rm NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY preview chore/coalter-mirror-c<N>-canary --yes

# 全 scope 0 件再確認 (前 §7.4 と同 command)
```

### 7.8 Decision-log 記録

`docs/decision-log.md` 最上部に B-5c smoke と同形式で entry 追加 (Phase B 完了 docs §11 template 参照)。

---

## 8. Phase C 中の rollback 経路 (任意の地点で即 rollback 可能)

### 8.1 Rollback principle

各 sub-PR は **独立に revert 可能**。 Phase B canon (sleepStore / channelLock / diagnosticSnapshot 全 session-local) のおかげで、env を削除すれば **完全に元の状態に戻る** (cross-session 持ち越しなし)。

### 8.2 Rollback 経路 (sub-PR 別)

| 観測される問題 | rollback action |
|---|---|
| C-1 (diagnostic 観測) で diagnostic が依然不可視 | C-1 PR revert (1 line 戻す)、Phase A 7-layer defense は維持 |
| C-2 (presence 接続) で presence write 検出 (絶対あってはならない) | C-2 PR 即 revert + presence layer audit |
| C-3 (forced canary) で sleep / verification が破綻 | C-3 PR 即 revert + forced canary flag 永久削除検討 |
| C-4 smoke で PII leak / UI 破壊 | C-2 or C-3 のどちらかを revert + 緊急 audit |
| Production env に env が入った (絶対あってはならない) | 即 env 削除 + audit + 二段階確認手順を C-0 docs に追加 |
| C-5 taxonomy 検討で grammar invariant 緩和案が出た | docs 修正、実装は **しない** (C-5 は検討のみ) |
| C-6 全体 smoke で全項目 fail | Phase C 全体 rollback (C-1〜C-5 全 revert)、Phase B 構造に戻る |

### 8.3 Rollback は失敗ではなく正しい判断

Phase B B-5c smoke が「conditional pass」で正しく止めたように、Phase C も任意の地点で停止できる構造を維持。**rollback の躊躇は事故の元**。

---

## 9. Phase C 完了 ≠ Production rollout 開始 (Phase D 区別)

### 9.1 構造的区別

Phase C の **完了** = controlled canary で visible Mirror が安全に動くことの実証。

Phase D の **起票** = Production rollout 設計 (env scope / monitoring / rollback procedure / 段階公開 / metrics dashboard 等)。

**Phase C 完了 → 即 Production 投入** は構造的に禁止。Phase D 起票 + CEO 承認が production rollout の必要十分条件。

### 9.2 Phase D 候補 scope (本 docs は Phase D 設計を含まない、参考のみ)

- Production env 投入手順 + 段階公開 (allowlist 拡張パターン)
- production grade monitoring (PII leak / error rate / false positive / user negative feedback)
- Rollback procedure (production env 即時削除 + force-OFF flag)
- taxonomy 拡張実装 (Difference / Tempo / Fairness / Repair Mirror)
- linguistic stop detector runtime 接続 (chat layer 経由 safe input pipe 設計)

---

## 10. Phase C で追加観測する 5 つの risk signal (Phase D 設計入力)

Phase B B-5c では default-STAY_SILENT 100% のため、下記 signal は観測不能だった。Phase C で initially 観測:

| # | signal | 観測方法 | Phase D での利用 |
|---|---|---|---|
| 1 | visible Mirror **false positive 率** (Mirror 出たが不適切) | C-4 smoke で CEO 主観評価 (5-sample) | production allowlist 拡張前の質的判断 |
| 2 | visible Mirror **回避率** (CEO が即「閉じる」する割合) | C-4 smoke で「閉じる」 click rate | UI 改善 / threshold calibration |
| 3 | sleep ON 後 **回避時間中央値** (どれくらい黙ってほしかったか) | C-4 smoke で sleep ON〜「観察を再開する」までの時間 | sleep auto-expire の検討 |
| 4 | close click 後の **再発火条件** (再 mount で復活すべきか) | C-4 smoke で page reload 後の挙動 | session boundary 再定義 |
| 5 | postSpeakVerification の **layer 別 reject 率** (どの layer が最も effective か) | C-4 sampling 観測 | template grammar 改善優先順位 |

これら 5 signal は **Phase C-4 smoke の sampling 観測** で取得 (full population 観測は production rollout 時)。

---

## 11. Phase C で起こりやすい設計事故 7 つの事前回避

Phase B 完了 docs §13 の 5 件 + Phase C 固有 2 件:

| # | 事故 | 事前回避 |
|---|---|---|
| 1 | visible 検証のために presence layer **write** を強行 | C-2 read-only **厳格制限**、adapter 内で write API export しない (型 + runtime 二重) |
| 2 | taxonomy 拡張で template 数が膨張、grammar invariant が緩む | C-5 は **検討のみ**、実装は別 PR + CEO 承認 |
| 3 | `linguisticStopDetector` runtime 接続で chat layer touch | Phase C scope **外**、Phase D 候補化を C-0 で明示 |
| 4 | Preview canary で「真剣味」が落ちる (Phase A / B / C で 3 回目) | smoke checklist (B-5c 19 項目 + C-4 7 項目) を C-4 / C-6 で踏襲 |
| 5 | Phase C で「Production rollout まで一気にやる」誘惑 | C-6 完了 → Phase D 起票 (production rollout 設計、別 phase) を §9 で構造化 |
| **6** | C-2 read-only adapter で「ちょっとだけ write」誘惑 | adapter export 一覧を **read API のみ** に固定、TypeScript で `Readonly` / `readonly` 強制、code review で確認 |
| **7** | C-3 forced canary flag を Production に投入する事故 | 投入時 **二重確認手順** (`vercel env add` 直後に `vercel env ls production` で 0 件確認、CEO 投入 + Claude 検証の 2 段階) |

---

## 12. Visible 経路の 2 mode 構造分離 (C-3 詳細)

### 12.1 通常 mode (Phase B 完了形態、Phase D production rollout 候補)

```
flag: NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED=true
+ NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE=true (optional)

visible cap: 1 / session
sleep / verification: strict (Phase B 設計通り)
```

### 12.2 forced canary mode (Phase C-3 観測専用)

```
flag: NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY=true (上記 2 件に追加)

visible cap: 10 / session (cap 上書きのみ、他 gate は strict)
forced mode は通常 mode の env と AND ではなく、AND + 第 3 flag
forced mode は branch-scoped Preview only、Production / 全 Preview / Development 絶対禁止
```

### 12.3 構造的分離の理由

- forced mode が production に流出すると重大事故 (cap=10 で発話頻度 10 倍)
- 分離は env flag + code level の **二重 gate** で保証
- forced mode flag default false strict parser (Phase B-1 と同 pattern)
- forced mode 削除は通常 mode の merge 前 (smoke 終了直後の env 削除で十分)

---

## 13. 学術基盤 (Phase C 追加、Phase B design §0 学術基盤継承)

Phase B design (`docs/coalter-aoo-phase-b-mirror-channel-design.md`) で引用された Mixed-initiative interaction (Horvitz, 1999) / Reflective listening (Rogers) / Expected Value of Information (decision theory) / OECD AI agent definition (2024) に加え、Phase C は **visible reflective intervention** に関する 4 文献を背景とする:

### 13.1 Therapeutic alliance research (Lambert, 1992)

- 心理療法 outcome の **約 30%** は therapist の言動 (alliance) で説明される
- "common factors" の中で最大要因
- **示唆**: Mirror は「介入」ではなく「alliance を壊さない反射」として機能すべき。1 session 1 回 (cap=1) はこの原則と整合

### 13.2 Motivational Interviewing (Miller & Rollnick, 2013)

- reflective listening は MI の中心技法
- "complex reflection" は元の発話より深い洞察を含むが、**断定形を回避** する
- **示唆**: B-5b hedged grammar template は MI の complex reflection 設計と整合。C-5 taxonomy 拡張時も MI grammar pattern を参照

### 13.3 Just-in-time adaptive interventions (Nahum-Shani et al., 2018)

- mHealth で「**いつ介入するか**」を決める decision rule
- 介入頻度の最適化 (over-intervention は engagement 低下、under-intervention は効果なし)
- **示唆**: visible cap (1 → 10) の calibration は JITAI literature に基づき Phase C-3 forced mode 観測値から Phase D で決定

### 13.4 Phase A Always-On = 観測のみ / Phase B Mirror = reflection-only hedged grammar

- Phase A: presence subscription による静的観測 (発話しない)
- Phase B: 構造的 reflection-only (hedged grammar template only、Question/Proposal/Suggestion 一切禁止)
- Phase C: **visible reflection の安全な実機検証** (still reflection-only、JITAI 的 timing decision を controlled mode で観測)

---

## 14. Phase C 着手前 pre-flight (印刷可能 checklist)

```
[Phase B → Phase C 引き継ぎ]
□ Phase B 完了 docs (`docs/coalter-aoo-phase-b-completion.md`) §0 / §3 / §7 / §9 全項目を読了
□ Phase A 完了 docs (`docs/coalter-aoo-phase-a-completion.md`) §3.4 / §3.5 / §3.6 / §3.7 / §5 全項目を読了
□ Phase B canon §7.4 (10 原則) を C-0 design 冒頭で再宣言
□ Phase A 7-layer defense (§3.7) を C-1 設計の根拠に
□ Phase B B-5c smoke 教訓 (false positive grep / IBS bypass / NODE_ENV guard) を C-0 smoke runbook §7 に明記

[Phase C 設計合意]
□ C-1 〜 C-6 sequential 順序合意 (並列禁止)
□ Phase C で許容される境界緩和 3 件 (§5) を確定、他は Phase D 候補
□ Phase C 成功条件 7 項目 (§6) を確定
□ Phase C 中の rollback 経路 (§8) を理解
□ Phase C 完了 ≠ Production rollout 開始 (§9) を理解

[各 sub-PR 起票時]
□ Appendix C の PR description checklist 全項目確認
□ 不可侵境界 (§5.1) 全項目維持
□ Phase A → B → C 学び取り込み (§2)
□ test (mirror + presence regression) full PASS
□ vitest / tsc / eslint clean
□ hidden / bidi Unicode 0
```

---

## 15. References

### Phase B 構成 docs (Phase C 着手前必読)
- `docs/coalter-aoo-phase-b-completion.md` (Phase B 完了正本)
- `docs/coalter-aoo-phase-b-mirror-channel-design.md` (Phase B design、Phase C 設計 reference)
- `docs/coalter-aoo-phase-b-implementation-plan.md` (micro-PR 分割の前例)
- `docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` (smoke runbook の前例)

### Phase A 構成 docs (重要発見・訂正の source)
- `docs/coalter-aoo-phase-a-completion.md` (特に §3.4 / §3.5 / §3.6 / §3.7 / §5 を Phase C 設計時に必読)

### Phase C 既存 code precedent (C-1 / C-2 で参照)
- `lib/coalter/understanding/diagnosticsRetrievalAuth.ts` (server-side `VERCEL_ENV` precedent、参考)
- `lib/coalter/observer/relationshipState.ts:260` `getRedactedRelationshipStateSnapshot` (PII firewall 既適用、C-2 推奨 source)
- `lib/coalter/mirror/diagnosticDebugGlobal.ts:111` (C-1 修正対象、production NODE_ENV guard 削除)
- `lib/coalter/mirror/engineAdapter.ts` (C-2 拡張対象、presence-derived axes を read API 経由で実値投影)
- `lib/coalter/mirror/frequencyCap.ts` (C-3 拡張対象、forced mode cap override)

### 学術基盤 (Phase C 追加 §13)
- Lambert, M. J. (1992). Therapeutic alliance.
- Miller, W. R., & Rollnick, S. (2013). Motivational Interviewing.
- Nahum-Shani, I., et al. (2018). Just-in-time adaptive interventions (JITAIs).
- Phase B design §0 学術基盤 (Horvitz / Rogers / EVI / OECD) 継承

---

## 16. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-18 | C-0 Phase C integration design docs 起票 (本 PR) | CEO 判断「C-0 docs only PR 起票 GO、実装禁止」(2026-05-18) |

---

## Appendix A — Phase C sub-PR 依存グラフ + LOC budget

```
[Phase B close]
       │
       ▼
[C-0: Phase C integration design]              (本 docs / 600+ 行 docs / code 0)
       │
       │ CEO 承認
       ▼
[C-1: diagnostic exposure 1 line fix]          (1-3 lines + test / < 30 lines)
       │
       │ merge
       ▼
[C-2: read-only presence adapter]              (80-150 lines + test / < 400 lines)
       │
       │ merge
       ▼
[C-3: controlled visible path canary]          (80-150 lines + test / < 300 lines)
       │
       │ merge
       ▼
[C-4: close/sleep/cap 実機 smoke]              (docs 300-500 + smoke 実機)
       │
       │ pass
       ▼
[C-5: taxonomy 拡張検討 docs]                  (docs 400-600 / code 0)
       │
       │ merge
       ▼
[C-6: Phase C 全体 smoke / close docs]         (smoke docs 200-300 + 完了 docs 500-700)
       │
       │ pass
       ▼
[Phase C 完了 → Phase D 起票判断]
```

Phase C 合計 LOC 想定: code +400 行 / docs +1800 行 (tentative)。

---

## Appendix B — Phase C smoke runbook template (印刷可能、§7 詳細版)

```bash
# ─────────────────────────────────────────────
# Phase C smoke runbook template (C-4 / C-6 で利用)
# ─────────────────────────────────────────────

# [1] Pre-flight
git fetch origin --prune
git checkout main && git pull --ff-only
for SCOPE in production preview development; do
  echo "--- $SCOPE ---"
  npx vercel env ls $SCOPE | grep -E "(NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED|NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE|NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY)" || echo "(none)"
done
# 期待: 全 scope (none)

# [2] Canary branch 作成 (Option A: empty + vercel --force)
git worktree add /tmp/canary -b chore/coalter-mirror-c<N>-canary main
cd /tmp/canary
git commit --allow-empty -m "chore(coalter): trigger C-<N> canary"
git push -u origin chore/coalter-mirror-c<N>-canary
cp -r /Users/haradataishi/Culcept/.vercel ./
npx vercel --force --yes  # IBS bypass、Ready 待ち

# [3] CEO env 投入 (branch-scoped Preview only)
echo "true" | npx vercel env add NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview chore/coalter-mirror-c<N>-canary
echo "true" | npx vercel env add NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE preview chore/coalter-mirror-c<N>-canary
# C-3 後の smoke のみ:
echo "true" | npx vercel env add NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY preview chore/coalter-mirror-c<N>-canary

# [4] 投入後 scope 二重確認
for SCOPE in production preview development; do
  echo "--- $SCOPE ---"
  npx vercel env ls $SCOPE | grep -E "(NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED|NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE|NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY)" || echo "(none)"
done
# 期待: production (none) / preview 全 env が "Preview (chore/coalter-mirror-c<N>-canary)" / development (none)

# [5] Redeploy + Preview URL 共有
npx vercel --force --yes  # env baked-in build を生成
# → Preview URL を CEO に共有

# [6] CEO smoke (DevTools console + 実機 UI)
# - 19 項目 checklist (Phase B B-5c §5 踏襲) + C-4 7 項目
# - diagnostic snapshot: window.__coalterMirrorDiagnostic?.getSnapshot()
# - PII regex: /(rawText|userId|messageId|pairId|sessionId|email|phone|embedding)/i.test(JSON.stringify(s))
# - rollback trigger 11 件: いずれかで即 env 削除

# [7] Cleanup (smoke 終了 1 時間以内)
npx vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview chore/coalter-mirror-c<N>-canary --yes
npx vercel env rm NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE preview chore/coalter-mirror-c<N>-canary --yes
npx vercel env rm NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY preview chore/coalter-mirror-c<N>-canary --yes 2>&1 | tail -1
# 全 scope 0 件再確認 (前 [4] と同 command)

# [8] Branch + worktree cleanup
git push origin --delete chore/coalter-mirror-c<N>-canary
git worktree remove /tmp/canary --force
git branch -D chore/coalter-mirror-c<N>-canary

# [9] decision-log entry 追加 (docs PR)
# → docs/decision-log.md 最上部に Phase C smoke 結果記録
```

---

## Appendix C — 各 sub-PR PR description checklist (Phase C 全 PR 起票時に明記)

```
[Phase 境界 / canon]
□ Production env 投入なし
□ all Preview env 投入なし (branch-scoped Preview のみ)
□ Development env 投入なし
□ presence layer write なし (read-only のみ)
□ chat layer (app/components/chat/*, components/chat/*, app/api/*) 0 diff
□ ChatClient.tsx 既存 logic 0 diff
□ MirrorSurface.tsx (B-1 hidden shell) 0 diff
□ raw text / raw id 保存 0
□ DB / Supabase / migration / Sentry / remote telemetry 0
□ localStorage / sessionStorage / cookie / IndexedDB 0
□ LLM call 0
□ Question / Proposal / Suggestion 自動発火 0
□ cross-session persistence 0
□ Alter Morning 混入 0
□ package.json 変更 0 (必要なら別 PR + CEO 承認)
□ Phase A canon (`coalter-aoo-phase-a-completion.md` §5) 全項目維持
□ Phase B canon (`coalter-aoo-phase-b-completion.md` §7.4) 全 10 原則維持
□ Phase A 完了 docs §3 系 (重要発見) 反映、再発防止根拠を docs に明示
□ Phase B 完了 docs §7 (Phase A→B 学び取り込み漏れ) 反映

[本 PR 個別 (sub-PR ごと)]
□ 修正 file が当該 sub-PR の §4.N に列挙された範囲内
□ Phase C で許容される境界緩和 (§5) 3 件のいずれかのみ
□ acceptance criteria 全項目満たす
□ LOC budget 範囲内
□ test (mirror + presence regression) full PASS
□ vitest / tsc / eslint clean
□ hidden / bidi Unicode 0
□ env strict scan: production / preview / development 全 0 件 (smoke 関連 PR では smoke 後の cleanup 後)
```

---

## Appendix D — NODE_ENV guard 置換 3 options 比較 (C-1 design 入力)

| Option | 内容 | 利点 | 欠点 | Claude 評価 |
|---|---|---|---|---|
| **D-1 (推奨)** | NODE_ENV guard を **削除** (1 line removal) | 7-layer defense (Phase A §3.7) が既存 → 多重防御維持 / 最小修正 / Phase A canon と整合 | NODE_ENV guard 完全に消える | ⭕⭕ |
| D-2 | `VERCEL_ENV !== "production"` ベースに置換 | 「Preview のみ」を明示 | NEXT_PUBLIC_VERCEL_ENV を CEO が手動 set 必要 (Vercel 自動 set は server only) / env 管理コスト増 | △ |
| D-3 | 新 explicit dev/preview flag (`NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_ALLOW_BUILD_TYPE=preview`) | 完全明示制御 | env が 3 件に増える / CEO 投入手順複雑化 | △ |

**Claude 推奨**: **D-1** (削除のみ)。理由:
- Phase A §3.5 が「NODE_ENV gate 採用禁止」と明言、削除が canon と整合
- Phase A §3.7 で確立した 7-layer defense が既に多重防御を構成 (L1 env default false / L2 branch-scoped / L3 PR merge 禁止 / L4 branch 短命 / L5 15-min expire / L6 cleanup / L7 redacted only)
- NODE_ENV guard 自体は **L5 (15-min expire)** や **L7 (redacted only)** と機能重複 (production であっても expire / redacted)

---

## Appendix E — Read-only presence access 3 options 比較 (C-2 design 入力)

| Option | API source | 利点 | 欠点 | Claude 評価 |
|---|---|---|---|---|
| **E-1 (推奨)** | `lib/coalter/observer/relationshipState.ts:260` `getRedactedRelationshipStateSnapshot` | **PII firewall 既適用** (Phase A canon) / observer 経由で presence 直触り回避 / 既存 test 完備 | observer layer 経由のため presence layer の最新値ではない可能性 (latency) | ⭕⭕ |
| E-2 | `lib/coalter/presence/availability.ts` (`getPresenceMobility` / `isUiVisible` 等) | 直接 presence / 即時性高 | presence layer 直触り → 不可侵境界に近接 / PII firewall を Mirror 側で新規実装 | △ |
| E-3 | 新規 presence layer 側 read-only API を追加 | API 設計 cleanly | **presence layer 修正必要** → 不可侵境界違反 | ❌ (禁止) |

**Claude 推奨**: **E-1** (observer 経由)。理由:
- PII firewall が **Phase A で既に validated** (A-2e smoke で確認済)
- observer layer は Phase A で「presence 観測蓄積」として確立、Mirror が使う前例として整合
- `getRedactedRelationshipStateSnapshot` の output 型に raw id / raw text が **構造的に存在しない** ため、Mirror 側で新規 firewall 実装不要
- latency 問題は Phase C-3 forced canary mode で observation density が確保されるため許容

---

## Appendix F — Forced canary mode 設計 (C-3 design 入力)

### F-1 env flag 設計

```typescript
// lib/coalter/flags.ts に getter 追加
get mirrorForcedCanaryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY === "true";
}
```

### F-2 cap override 経路

```typescript
// lib/coalter/mirror/forcedCanaryMode.ts (新規)
import { COALTER_FLAGS } from "@/lib/coalter/flags";

const FORCED_CANARY_VISIBLE_CAP = 10 as const;

export function getEffectiveVisibleCap(normalCap: number): number {
  if (COALTER_FLAGS.mirrorForcedCanaryEnabled) {
    return FORCED_CANARY_VISIBLE_CAP;
  }
  return normalCap;
}
```

### F-3 4-layer flag gating defense (forced mode 追加 layer)

```
L1 env flag default false (NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY)
L2 strict parser (=== "true" のみ true)
L3 branch-scoped Preview only (CEO 手動投入)
L4 通常 mode の env (CHANNEL_ENABLED) と AND (forced だけ ON では発火しない)
L5 cap override のみ (sleep / verification / 4-gate は緩和なし、コードレベル lock)
```

### F-4 strict cap (forced mode が sleep / verification を bypass しない)

```typescript
// lib/coalter/mirror/visibleMirrorEvaluator.ts は forced mode に無関心
// Gate 1 (decision) / Gate 2 (sleep) / Gate 4 (text generation) / Gate 5 (verification)
//   → すべて strict、forced mode で緩和されない
// Gate 3 (cap) のみ getEffectiveVisibleCap() で値が変わる
```

### F-5 forced mode の smoke 後 env 削除

cleanup 時に必ず削除 (production への流出は重大事故、本 docs §11 #7 で事前回避明記)。
