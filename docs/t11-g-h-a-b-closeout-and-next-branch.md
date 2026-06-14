# T11 G-H-A-B Closeout + Next-Branch Decision（display-tier chain 凍結・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **closeout + 分岐判断のみ・実装なし**（docs-only）。
**位置づけ**: G→H→H2→H3→A→B で完成した **display-tier 安全チェーン**を凍結し、UI/CoAlter をこれ以上足す前に
**最も安全な次分岐**を決める checkpoint。
**スコープ**: 計画のみ。コード変更なし。**UI/CoAlter 配線・useCoAlter・/talk runtime・engine runtime・booking・send・staging/production/push は触らない**。**本レポートで停止**。

---

## §1 Closeout summary

| Phase | 成果 | コミット |
|---|---|---|
| **T11-G** consume tier types | `AuthoritativePacketForServer`(T-S) / `DisplayPacketForClient`(T-D)・unique symbol brand + literal-false narrowing・`toDisplayPacket`/`toServerAuthoritativePacket`/assert | `cefe9fad` |
| **T11-H** PI projection design | 投影の安全契約（PI=projection 層・display tier 継承・action-authority 語禁止） | `738b5b74`(docs) |
| **T11-H2** PI projection pure types | `PlanIntelligenceProjectionInput`(display 型ロック)・`PlanIntelligenceProjection`(bounded・authority/raw/diagnostics 無) | `2dde2987` |
| **T11-H3** PI projection pure mapper | `buildPlanIntelligenceProjection`(display field のみ・shared filter・viewerNote 当人のみ) | `05563ddd` |
| **T11-A** PI projection fixture preview | `/plan/dev-travel-projection`(default-OFF flag・fixture・read-only・**初の app 接触**) | `f9a51621` |
| **CoAlter** consume adapter types | `CoAlterProjectionPromptInput`(projection 型ロック)・`CoAlterProjectionCue`(display-only)・`deriveCoAlterProjectionCues` | `6c37bf55` |

---

## §2 最終 display-tier chain

```
runTravelPlanEngine(input)                       … engine（server・実行は HOLD）
  → toServerAuthoritativePacket → AuthoritativePacketForServer   … T-S（server-only）
  → toDisplayPacket            → DisplayPacketForClient          … T-D（display・authoritative=false 固定）
      → buildPlanIntelligenceProjection → PlanIntelligenceProjection  … bounded explanation
          → deriveCoAlterProjectionCues → CoAlterProjectionCue[]      … display-only cue
          → /plan/dev-travel-projection（fixture preview・read-only・flag OFF）
```

| 区分 | 内容 |
|---|---|
| **pure のまま** | engine / toDisplayPacket / buildPlanIntelligenceProjection / deriveCoAlterProjectionCues / consume types |
| **app preview only** | `dev-travel-projection`（fixture・flag default OFF・本番 `/plan` 非接触・read-only） |
| **unwired のまま** | engine runtime 実行・本番 `/plan`・CoAlter runtime・useCoAlter・/talk・send/realtime・booking |

---

## §3 Trust boundary

| 型 | tier | 権限 |
|---|---|---|
| `AuthoritativePacketForServer` | **T-S（server-only）** | 実行権限の正本（private 持つ・client に出さない） |
| `DisplayPacketForClient` | T-D（display） | authoritative=false・executionAuthority=false・private なし |
| `PlanIntelligenceProjection` | T-D（display） | bounded explanation・authority field 無 |
| `CoAlterProjectionCue` | T-D（display） | display-only intent・execute/book/schedule/send 無 |

- **server-only**: AuthoritativePacketForServer / diagnostics / raw FitResult / raw PlanDecisionPacket / engine 中間層。
- **display-only**: DisplayPacketForClient / PlanIntelligenceProjection / CoAlterProjectionCue。
- **権限を与えられないもの**: display tier の全型（型 + literal-false + brand で保証）。

---

## §4 現在の安全保証（型 + runtime + test で担保）

1. **authoritative packet を display packet に代入できない**（brand + authoritative:false・`@ts-expect-error` 検証）。
2. **display packet は executionAuthority を産まない**（literal false）。
3. **PI 入力は display packet のみ**受理（型ロック）。
4. **PI projection に authority field なし**（KeyAbsent 検証）。
5. **CoAlter cue に execute/book/schedule/send なし**（enum + 検証）。
6. **raw FitResult は決して露出しない**（packet/projection/cue いずれにも非搭載）。
7. **diagnostics は client-facing でない**（server-only）。
8. **viewerNote は当該 viewer の field のみ**（他者 private 非漏洩 canary）。
9. **weather_reversal_uncertainty は確認/不確実 cue のまま**（booking authority でない）。

---

## §5 HOLD のまま（各々独立 GO）

useCoAlter / `/talk` runtime / CoAlter server-authoritative path / M2-B-2 / 本番 `/plan` / 実 engine runtime 配線 /
Plan Intelligence live runtime / send・realtime・read receipt / booking・calendar / **Bundle 2 dominance/ranking** /
solver・itinerary DAG / route・weather・place API / staging・production・push。

---

## §6 Verification summary

- **latest commits**: `6c37bf55`(CoAlter consume)→`d00ef7b9`(log) / `f9a51621`(Option A)→`8f565fe9`(log) / G-H2-H3-A chain 既コミット。
- **test counts**: travel-prefixed **412** + plan preview **16** = **428 travel-related**（G/H2/H3/A/B 由来 tests 含む）。
- **tsc baseline**: **55**（不変）。
- **full suite**: **21082 passed / 1 skipped / 0 failed**。
- **flaky**: `proposalPlanClientHelpers.test.ts`（travel 無関係）今回再発なし。
- **tree clean**: yes。**push**: なし。

---

## §7 Next branch comparison

| 分岐 | 内容 | 評価 |
|---|---|---|
| A. UI preview polish（dev-travel-projection） | 既存 skeleton の見た目調整 | 低価値（skeleton で UX は既に目視可） |
| **B. CoAlter display preview fixture skeleton（default-OFF flag）** | `deriveCoAlterProjectionCues` の出力を **dev route で read-only 表示**（fixture・flag OFF・useCoAlter/talk/runtime/send なし） | **★ 推奨**。Option A と同じ実証済み安全パターン・CoAlter cue UX を安全に目視・gate 不開放 |
| C. Bundle 2 fit dominance/ranking design | fit を ranking に効かせる設計 | **GPT HOLD**（Bundle 2 まだ）。advisory 固定を崩さない |
| D. itinerary DAG / solver preflight | solver 前段 | runtime gate 寄り・時期尚早 |
| E. 本番 `/plan` integration preflight | 本番接続の前段 | **GPT HOLD**（production /plan まだ）。engine/CoAlter が pure な今は早い |

---

## §8 Recommendation

**推奨次フェーズ = B（CoAlter display preview fixture skeleton・default-OFF flag）。実装可**。

- **なぜ最安全か**: Option A（`f9a51621`）で実証済みの安全パターン（**新 dev route + default-OFF flag + fixture 入力 + read-only + fail-closed empty + send/runtime 非接触**）をそのまま CoAlter cue 表示に適用するだけ。新規の runtime/authority/送信 gate を **1 つも開けない**。`deriveCoAlterProjectionCues`（`6c37bf55`）の出力を fixture から read-only で見せる純表示。
- **HOLD のまま**: useCoAlter / `/talk` / CoAlter server-authoritative / M2-B-2 / 本番 `/plan` / 実 engine runtime / send・realtime / booking / Bundle 2 / solver / route・weather API / staging・production・push（§5 全件）。
- **実装か docs か**: **実装可**（Option A と同じ厳格スコープ＝fixture/flag-OFF/read-only/no-runtime なら GO 可）。ただし CEO 承認後に着手。B の中で useCoAlter/talk/送信に触れる必要が出たら即停止し docs に戻る。

代替（より保守的に pure を続けるなら）: C/E は **docs-only preflight** に留めるのが安全。B が「最小の app 接触で CoAlter cue UX を可視化」できる最も価値/安全比の高い分岐。

---

### CEO 判断請求
1. 本 closeout を **display-tier chain（G→B）の凍結点**として承認するか。
2. §5 runtime gate を **各々独立 HOLD** として確認するか。
3. 次フェーズ = **B（CoAlter display preview fixture skeleton・default-OFF flag・read-only・実装可）** で良いか（vs A/C/D/E）。
4. B は Option A と同じ厳格スコープ（fixture/flag-OFF/read-only/no useCoAlter・talk・send・runtime）で実装してよいか。

実装は CEO 承認まで着手しない（closeout レポートで停止）。
