# RD3x-0 — Operator Seed Activation Plan（docs-only・残作業統合 & 実装順 再設計）

- 日付: 2026-06-16 / 位置づけ: RD3c（duration_confirmations storage/repository/gate/glue・operator seed write）と RD3d/RD3e（movement semantics / feasibility）の後、**operator seed を実際に dogfood で使える状態へ進める残作業を 1 枚に統合**し、実装を大きめに切り直す。**まだ実装ではない**。
- 規律: 本書は**コードを書かない**。DB apply / staging apply / UI / API / write path 追加 / product 接続には進まない。
- 方法（CEO ①②③④⑤⑥⑦⑧）: 既に実装した各 slice の到達点を file:line で確認し、**前提（operator seed は "書ければ使える" か）を疑った上で**、残作業を依存で束ね直す。

---

## 0. 中核発見（前提を疑った結果）

| # | 発見 | 根拠 |
|---|---|---|
| **F1（linchpin・前提を疑った帰結）** | **operator seed は今 write-only で consumer がいない**。`operatorDayPreview` は `operatorRealityReadiness`（gap 集計）を consume するが **`duration_confirmations` を読まない**。consume chain（`buildDurationValueFromConfirmation`→`supplyAndResolveLeaveBy`→computed leaveBy）は **test のみで実 preview に未配線**。→ **書いた seed は preview で何も生まない**（empty supply と同じ状態）。 | operatorDayPreview.ts（durationConfirmation 非 import）/ durationConfirmationAdapter（test only） |
| **F2** | **write path は完結・実 DB で実証済**（RD3c-P3-local real glue smoke）。schema/RLS/index/repository/gate/glue/orchestration（supersede fix 込）全て ephemeral 実 DB で PASS。 | RD3c-P3a〜wire-AB/C/local |
| **F3** | **Docker 停止 → local persistent Supabase stack 不可**。実行時に DB を読む path（operator preview の consume）は **persistent or staging apply が無いと runtime で動かない**が、**consume の logic は ephemeral + 注入 row で証明可能**（write 側の real glue smoke と同手法）。 | RD3c-P3-local preflight |
| **F4** | **consume chain の部品は揃っている**: `buildDurationValueFromConfirmation`→`{capability, durationValue}`・`supplyAndResolveLeaveBy`（arrival/buffer/origin + durationValue → computed leaveBy）・`assembleLeaveByBindings`・dogfood synthetic（RD3a で full chain 実証）。**残るは「real confirmation row を起点に」繋ぐ logic と、それを ephemeral で証明すること**。 | durationConfirmationAdapter / leaveBySupply / dogfoodSyntheticSupply |
| **F5** | **safe surfacing は段階設計済**: `leaveByComputedPresent`（schema-state boolean・RD2f-SEM-0 §5・RD3a dogfood 実装）< exact timestamp（departure line・NO GO）。computed leaveBy は internal-only（leak guard + 非 EVENT_REALITY_ATTRIBUTE_KEYS）。 | RD2f-SEM-0 / RD3a |
| **F6** | **etaKnown/routeKnown は実 true 化されていない**（compileMovementReality hardcode false）。real supply が来ても MovementReality 本線反映（reconcile 配線 + etaKnown derive）は **未配線**（leaveByKnown 値は今日も false）。 | movementReality:126-128 / RD3d-P1 |

→ **結論**: 残作業の本命は **「write した seed を consume して computed leaveBy を生む loop の closure」**。これは **ephemeral + 注入 row で証明可能**（staging/UI/persistent 不要）＝最小リスク・最大 proof。staging apply / dev panel / departure line は **その後**（DB 可用性 or product 判断が前提）。

---

## 1. 現在の到達点

| area | status | 実装済み | 未実装 | blocker |
|---|---|---|---|---|
| `duration_confirmations` schema draft | ✅ | table/CHECK/列（RD3c-P2a） | — | apply は ephemeral のみ |
| RLS revise / partial unique index | ✅ | seed_owner 3 policy + unique（wire-AB） | — | persistent/staging 未 apply |
| read adapter | ✅ | select/buildDurationValueFromConfirmation（P2b） | **operator preview への配線** | F1 |
| operator write orchestration | ✅ | createOperatorDurationSeed + supersede fix | — | — |
| Supabase repository | ✅ | server-only・injected client（wire-AB） | 実 client 配線 | persistent/staging DB |
| operator gate / server glue | ✅ | gate + glue + flag-gated entry（wire-C/local） | route/呼び出し面 | — |
| ephemeral real glue smoke（**write**） | ✅ | real glue→実 ephemeral DB（local-activation） | — | — |
| **consume loop（seed→durationValue→leaveBy）** | ❌ | 部品（F4） | **end-to-end 配線 + 証明** | **F1（最優先）** |
| operator dev panel | ❌ | — | UI 全部 | Docker/local Supabase or staging |
| local persistent DB | ❌ | — | — | **Docker 停止** |
| staging apply | ❌ | — | — | remote gate（高リスク・CEO） |
| real readback（persistent/staging） | ⚠️ | ephemeral readback のみ | persistent/staging | DB 可用性 |
| durationValue real supply（preview 配線） | ❌ | adapter（F4） | operator preview 配線 | F1 + DB 可用性 |
| RD2e-SUPPLY | ✅ | supplyAndResolveLeaveBy（synthetic で実証 RD3a） | real confirmation 起点 | F1 |
| MovementReality 本線反映 | ❌ | reconcile/semantics（RD3d-P1） | etaKnown derive 配線・leaveByKnown real true | F6・real supply |
| Feasibility | ✅ | routeUnknown blocker 再裁定（RD3e-P1） | — | — |
| departure line | ❌ | — | docs すら未着手 | exact timestamp = 最高リスク |
| product `/plan` / Alter tab | ❌ | — | — | NO GO（reality engine 未配線） |

---

## 2. 残作業の依存関係（dependency graph）

```
[ephemeral だけで検証可能] ───────────────────────────────────────────
  consume loop hardening（seed row → durationValue → arrival/buffer/origin → supplyAndResolveLeaveBy
    → computed leaveBy → operator readiness count が 0→1）        ← ★最優先・DB 可用性に依存しない
        │ proves: 書いた seed が consumable（leaveBy を生む）
        ▼
[DB 可用性が前提] ─────────────────────────────────────────────────
  ├─ real readback（persistent/staging）         ← local persistent(Docker) or staging apply 必要
  ├─ durationValue real supply（operator preview runtime 配線）  ← real DB read 必要
  └─ operator dev panel（UI で seed 入力）        ← real DB（書いた seed が残る場所）必要
        │
        ▼
[remote gate・高リスク] ────────────────────────────────────────────
  staging apply（実 schema 適用 + 実 write smoke）  ← CEO gate・rollback=DROP TABLE・production NO
        │
        ▼
[product/user-facing・最高リスク] ──────────────────────────────────
  ├─ MovementReality 本線反映（etaKnown derive・leaveByKnown real true）  ← real supply 安定後
  ├─ safe boolean（leaveByComputedPresent）を operator preview へ      ← consume loop 後・exact instant でない
  └─ departure line（exact timestamp 表示）        ← permission/surface/delivery gate + CEO product 判断（NO GO）

[NO GO 継続] product /plan / Alter tab / user confirmation UI / external API / currentLocation
```

**ephemeral だけで検証できる**: consume loop hardening（★）。**local persistent/staging が要る**: real readback / preview 配線 / dev panel。**remote gate**: staging apply。**product UI に近い/user-facing**: dev panel(operator-only は近い)・departure line・safe boolean surfacing。

---

## 3. 残作業の統合候補（大きめに再編・CEO 案 A-E を整理）

| 候補 | 内容 | DB | UI | gate | risk |
|---|---|---|---|---|---|
| **RD3x-P1（= Candidate A）consume loop ephemeral hardening** | seed row → buildDurationValueFromConfirmation → arrival/buffer/origin → supplyAndResolveLeaveBy → computed leaveBy → operator readiness count 0→1 を **ephemeral 実 DB + 注入 row で end-to-end 証明**。UI/persistent/staging/exact timestamp なし | ephemeral | なし | flag/既存 | **低** |
| **RD3x-P2（= Candidate D 一部）durationValue real supply → operator preview 配線** | operator preview が duration_confirmations を read（read adapter）→ durationValue → supply → **safe boolean(leaveByComputedPresent) のみ** surface。exact timestamp なし | persistent/staging | preview のみ | flag/operator | 中 |
| **RD3x-P3（= Candidate B）operator dev panel** | dev-only・operator-only・flag-gated panel で seed 入力。product /plan/Alter なし | persistent/staging | dev panel | flag/operator | 中（UI・空パネル risk） |
| **RD3x-P4（= Candidate C）staging apply + real seed smoke** | remote staging 実 apply + 実 write/read smoke + RLS smoke | **staging** | — | **高 CEO gate** | 高（remote・production NO） |
| **RD3g-0（= Candidate E）departure line boundary** | exact timestamp 表示条件・permission/surface/delivery gate（docs-only） | — | — | product gate | 高（docs は安全・実装 NO GO） |

**統合の要点**: consume loop（P1）が closure すれば「seed の価値（leaveBy を生む）」が証明される。それ無しに dev panel(P3)/staging(P4) を作ると **空パネル / 空 DB**（書けるが consume されない）になる。→ **P1 を先に**。

---

## 4. 推奨 first implementation

### 推奨: **RD3x-P1（consume loop ephemeral hardening）**

| 判断軸 | 評価 |
|---|---|
| user value | **高**（seed が computed leaveBy を生む＝価値の本体・loop closure） |
| safety | **最高**（ephemeral・remote/persistent/UI/exact timestamp なし） |
| dependency | **無**（DB 可用性に依存しない・部品は F4 で揃う） |
| local 環境制約 | **影響なし**（ephemeral で完結・Docker 不要） |
| remote apply リスク | **ゼロ**（remote 不接触） |
| proof strength | **最強**（write 側 real glue smoke と同手法で consume も実 DB 証明） |
| implementation effort | 中（consume chain 配線 + ephemeral smoke 拡張） |
| 後戻りしやすさ | **高**（未配線 pure logic + test・revert は file 削除） |

**理由（rule ⑤ ゴール逆算）**: 「operator seed を dogfood で使える」の本質は **書いた seed が consume されて leaveBy を生む**こと（F1）。これを ephemeral で証明するのが最小リスク・最大 proof・無依存。dev panel/staging はこの loop が closure してから（空パネル/空 DB を避ける）。

---

## 5. staging apply を今やるべきか

- **今すぐ NO**。**まだ ephemeral/local で足りる**（consume loop も write も ephemeral で証明可能・F3）。
- **staging apply するなら前提**: ①RD3x-P1（consume loop）closure ②dev panel(P3) で staging 上の seed を**使う手段**が存在（apply だけして使えないと空）③CEO 承認。
- **staging apply 前の preflight**: linked ref が staging（hjcr）であること確認・production ref(aljav) でないこと・`supabase db push --dry-run` で diff 確認・backup・rollback リハ。
- **rollback 方針**: `DROP TABLE duration_confirmations CASCADE`（ephemeral で clean 実証済・external_anchors 不変）。
- **production apply は NO**（絶対・別個 CEO gate）。

---

## 6. dev panel を今やるべきか

- **今すぐ NO（or 最小設計のみ）**。**Docker/local Supabase なし → 書いた seed が残る場所が無い**ので panel は空動作。**staging apply なし → 同様**。
- **UI だけ作ると空パネル risk**（書けるが consume されない・残らない）。
- **dev panel より先に real readback/consume（RD3x-P1）を固めるべき**。consume loop closure 後、staging apply(P4) or Docker 復旧で DB を用意してから panel(P3)。
- panel は **operator-only・dev-only・flag-gated・product /plan/Alter 非接続**を厳守（設計は wire-0 §6 に既出）。

---

## 7. departure line を今やるべきか

- **exact timestamp 表示はまだ早い**（最高リスク・leaveBy instant の user-facing surfacing）。**実装 NO GO**。
- **safe boolean まで**なら段階的に出せる（`leaveByComputedPresent`・schema-state・RD3a dogfood 実装済・RD3x-P2 で operator preview へ）。exact instant でない。
- **departure line boundary docs（RD3g-0）を先に出すべき**: exact timestamp を出す条件（permission level / SurfaceExposureLevel / Delivery gate / Phase）を docs-only で固める。実装はその後の別 CEO gate。
- **product UI へ出す条件**: consume loop closure + safe boolean 運用実績 + permission/surface/delivery gate 設計 + CEO product 判断。**現時点では全て未達**。

---

## 8. 次の GO 候補（推奨順・大きめ）

1. **RD3x-P1（consume loop ephemeral hardening）★ first**（ephemeral・無依存・最大 proof）
2. **RD3g-0（departure line boundary docs）**（docs-only・安全・P1 と並行可・surfacing 条件を先に固める）
3. **RD3x-P2（durationValue real supply → operator preview・safe boolean）**（persistent/staging 必要・P1 後）
4. **RD3x-P3（operator dev panel）**（DB 可用性必要・P2 後 or 並行）
5. **RD3x-P4（staging apply + real smoke）**（高 CEO gate・P1/P2/P3 安定後）
- **NO GO 継続**: departure line 実装 / product /plan / Alter / user confirmation UI / external API / currentLocation / production apply。

---

## 9. Department Responsibility Matrix（RD3x-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Build/Mobility** | R | 到達点整理・consume loop 設計・dependency graph・実装順 |
| **Risk** | C | staging/persistent/UI のリスク評価・空パネル/空 DB 回避・rollback |
| **Permission** | C | operator-only/dev-only gate・safe boolean まで・exact instant HOLD |
| **Communication** | C | departure line HOLD・safe boolean 境界・user-facing 条件 |
| **CEO** | A | RD3x-P1/P2/P3/P4・RD3g-0 各 GO・staging apply・production gate |

---

## 10. RD3x-0 自己判定（結論）

- **次の実装は 1 本: RD3x-P1（consume loop ephemeral hardening）**。書いた seed が computed leaveBy を生む loop を ephemeral 実 DB で closure＝価値の本体を最小リスクで証明（F1 解消）。
- **staging apply は今やらない**（ephemeral で足りる・dev panel が無いと空・remote 高リスク）。
- **dev panel は今やらない**（DB 可用性無しで空パネル・consume loop closure を先に）。
- **departure line は実装 NO GO**（exact timestamp 最高リスク）。**safe boolean まで**（RD3x-P2）・**boundary docs（RD3g-0）を先に**。
- **HOLD 継続**: persistent/staging/production apply・product UI・departure line 実装・external/currentLocation。
- 本書はコードを含まない。GO は CEO 専管。

---

## 11. 実装反映（RD3x-P1）

- **2026-06-16 RD3x-P1 実装**（code `<this commit>`・matrix §5 参照）: §3 候補 A（consume loop ephemeral hardening）を実装。**F1（write-only・consumer 不在）を解消** — 書いた seed が computed leaveBy を生み ERN へ attach されることを ephemeral 実 DB + pure helper で end-to-end 証明。
  - 実装ファイル: `lib/plan/realityCore/operatorSeedConsume.ts`（pure consume helper）・`tests/unit/operatorSeedConsume.test.ts`（pure 10 PASS）・`tests/unit/operatorSeedConsumeDbSmoke.test.ts`（ephemeral pg・実 DB readback → consume 3 PASS）。
  - loop: confirmation row → durationValue（confirmation 源）+ honest event supply（arrival/buffer/origin）→ RD2e-SUPPLY → computed leaveBy → `assembleLeaveByBindings` attach。provenance は value に流さない。
  - **本 slice 範囲外（後続）**: operator preview runtime 配線（**RD3x-P2**・persistent/staging 必要）・dev panel（**RD3x-P3**）・staging apply（**RD3x-P4**・高 CEO gate）・departure line（**RD3g-0** docs → 実装 NO GO）。consume loop の closure はこれで達成（残るは「real DB 上で runtime に preview へ出す」配線で、DB 可用性が前提）。
