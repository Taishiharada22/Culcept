# T11 UI / CoAlter Consume Wiring Preflight（配線前の消費契約・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only）。
**位置づけ**: G→H→H2→H3 で完成した **純 display chain**（`runTravelPlanEngine` → `toDisplayPacket` → `buildPlanIntelligenceProjection`）を、
将来 **UI / CoAlter** がどう consume してよいかを **配線前に**凍結する。display/explanation を execution/booking/ranking authority や
private 漏洩に化けさせないための契約。
**スコープ**: 計画のみ。コード変更なし。**UI/CoAlter/Plan Intelligence runtime 配線・Bundle 2・solver・engine/packet 変更・send/realtime・booking は実装しない**。**本レポートで停止**。

---

## §1 前提を疑う — 次は UI/CoAlter consume wiring preflight で正しいか

| 候補 | 評価 |
|---|---|
| **UI/CoAlter consume wiring preflight** | **★ 採用**。travel は**完全未配線**（app import 0・実測）。初の app 接触は境界 crossing → 契約凍結が先 |
| いま実 UI 配線 | 早い。契約未凍結のまま React/flag/route に触ると display→authority 化や private 漏洩の事故口を作る |
| Bundle 2 fit dominance/ranking | 後。ranking を動かす前に display の advisory 扱いを UI 側でも固定すべき |
| itinerary DAG / solver preflight | 後・runtime gate 寄り |

**推奨 = UI/CoAlter consume wiring preflight**。理由: (1) travel subsystem は **app から 1 度も import されていない**（実測 grep）→ 最初の配線が契約の base line になる。(2) project 慣習（flag default OFF・`dev-*` preview route・CEO 承認 env 有効化）に沿って初配線を最小・可逆にする前提固め。(3) pure・runtime gate を開けない。

---

## §2 現在の安全 consume chain（実装済み・pure）

```
runTravelPlanEngine(input)  → TravelPlanEngineOutput { authoritative(T-S), shared/viewer(T-D), diagnostics(T-S) }
  toServerAuthoritativePacket(output)  → AuthoritativePacketForServer   … server 専用
  toDisplayPacket(output, viewerId?)   → DisplayPacketForClient          … display 専用（authoritative=false 固定）
    buildPlanIntelligenceProjection({ packet: DisplayPacketForClient })  → PlanIntelligenceProjection（bounded explanation）
```

| 層 | tier | 配線可否 |
|---|---|---|
| `PlanIntelligenceProjection` | T-D（display） | UI/CoAlter client が consume してよい |
| `DisplayPacketForClient` | T-D（display） | 必要時 UI/CoAlter client が consume してよい |
| `AuthoritativePacketForServer` / `diagnostics` | **T-S（server）** | **client 配線不可**（別 server GO のみ） |
| 中間層（evaluateFit/assessReadiness/compareProposals/runTravelPlanEngine） | engine | **UI/CoAlter から直接呼ばない**（server 境界 GO まで） |

★ **server-only に残るもの**: `runTravelPlanEngine` 実行・`AuthoritativePacketForServer`・`diagnostics`・raw `FitResult`・raw `PlanDecisionPacket`・engine 中間層。

---

## §3 UI consume 契約

- UI は **`PlanIntelligenceProjection` を display 用に consume**してよい。
- 必要なら **`DisplayPacketForClient`** も consume 可（projection が薄い場合）。
- **`AuthoritativePacketForServer` を consume しない**（型で代入不可）。
- **raw `PlanDecisionPacket` / raw `FitResult` を consume しない**。
- **`evaluateFit`/`assessReadiness`/`compareProposals`/`runTravelPlanEngine` を直接呼ばない**（server 境界 GO まで）。
- **projection を execution authority にしない**（表示のみ・ボタン enable 根拠にしない）。

---

## §4 CoAlter consume 契約

- **client-side CoAlter view** は **display packet / projection のみ** consume。
- **server-side CoAlter orchestration** が `AuthoritativePacketForServer` を consume するのは **明示 GO 後のみ**（現状 M2-B-2 HOLD）。
- **fit evidence を捏造しない**。
- **`fitAdvisory` を ranking / action authority に変換しない**。
- 質問/確認は **display/proposal として提示**のみ（実行しない）。
- **booking / calendar / send は別 hard gate**（`lib/coalter/flags.ts` の kill switch 系統と整合）。

---

## §5 Plan Intelligence パネル挙動（display）

`PlanIntelligenceProjection` の section をそのまま read-only 表示:
answer card / why this plan / what could fail / needs confirmation / questions to ask / fallback note / fit advisory / readiness warning / viewer note。
- **booking button authority なし**・**schedule/execute authority なし**（表示のみ）。

---

## §6 禁止 UI/CoAlter 行為

1. **authoritative⊥shared 差分しない**（private 逆推論禁止）。
2. **欠落 field から private 推論しない**。
3. **diagnostics を露出しない**（server-only）。
4. **display packet から action を enable しない**。
5. **projection から booking/scheduling しない**。
6. **live weather/route/price/availability を断定しない**。
7. **raw M2 personalization を表示しない**。
8. **`fitSummary` を ranking authority にしない**。

---

## §7 初 UI 配線候補（実装しない・候補設計）

project 慣習（実測）に沿う最小・可逆の初配線:
- **どこに出すか**: 既存 **`dev-*` preview route 慣習**（`app/(culcept)/plan/dev-*`）に倣い **新 dev preview route**（例 `app/(culcept)/plan/dev-travel-projection/`）。**本番 `/plan` 体験には触れない**。
- **read-only か**: **read-only**（display 専用・mutation/送信なし）。
- **gate flag**: `lib/plan/featureFlags.ts` の **`PLAN_FLAGS` 系統に default false flag を追加**（例 `travelProjectionPreview = process.env.TRAVEL_PROJECTION_PREVIEW === "true"`・server-side・本番 default OFF・CEO 承認 env で有効化）。
- **入力**: ★ **fixture projection を描画**（live engine を runtime に配線しない）。`buildPlanIntelligenceProjection` を **fixture 由来の `DisplayPacketForClient`** から呼ぶ。engine 実行は server 境界 GO まで持ち込まない。
- **empty / fail-closed state**: projection が無い/構築不能 → **「データなし」read-only 表示**（部分情報を捏造しない・private を補わない）。
- **projection 構築不能時**: catch して fail-closed empty（throw を UI に出さない）。
- **send/realtime/read receipt 非接触**: preview は表示のみ・通信を一切張らない。

---

## §8 初 CoAlter 配線候補（実装しない・候補設計）

- **projection か display packet か**: **projection を先に**読む（bounded explanation で十分・display packet は補助）。
- **questionsToAsk**: CoAlter は **questionsToAsk を「聞く候補」として提示**してよい（実行しない）。
- **needsConfirmation**: **確認候補として提示**してよい（booking/実行はしない）。
- **server-authoritative route を呼ばない理由**: live privileged runtime（M2-B-2）が **HOLD**（初の特権 runtime 流入・最小開示粒度未決・review 不可）。authoritative は server GO まで触らない。
- **`useCoAlter` が HOLD の理由**: `hooks/useCoAlter.ts` は talk runtime（`app/(culcept)/talk/[threadId]/ChatClient.tsx`）に結線済みで、travel projection を流すと **M2-B-2 / 特権 runtime と絡む** → 別 GO。travel projection の CoAlter 表示は **client display path のみ**で先行検討。

---

## §9 将来実装の tests / verification 期待

1. UI component は **`PlanIntelligenceProjection` または `DisplayPacketForClient` のみ**受理。
2. UI は **`AuthoritativePacketForServer` を受理しない**（型）。
3. UI は **fit-core/readiness-core/中間層を import しない**。
4. UI は **executionAuthority を露出しない**。
5. UI は **fitAdvisory を advisory** として表示。
6. UI は **weather_reversal_uncertainty を確認 text として**表示（booking authority でない）。
7. CoAlter display path は **authoritative packet を受け取らない**。
8. **send/realtime/read receipt/useCoAlter 非接触**。
9. **client projection path に fetch/API/DB/Supabase なし**。
10. 既存 **400 travel tests 不変 green**・**tsc baseline 55 不変**。

---

## §10 次の実装オプション（比較と推奨）

| Option | 内容 | 評価 |
|---|---|---|
| **A. PI panel fixture/projection UI skeleton（default OFF flag）** | `dev-*` preview route + default-OFF flag + **fixture projection** を read-only 描画（engine runtime 非配線・send なし・fail-closed empty） | **★ 推奨**。初の app 接触を最小・可逆に。projection UX を**目視確認**でき、runtime/authority/send gate を 1 つも開けない |
| B. CoAlter projection consume adapter types only | CoAlter 側の consume 型のみ（pure・配線なし） | A の後でも可。A の方が UX 目視の価値が大きい |
| C. Bundle 2 fit dominance/ranking design | fit を ranking に効かせる設計 | display advisory 固定（UI 配線含む）後が安全 |
| D. itinerary DAG / solver preflight | solver 前段 | runtime gate 寄り・後 |

**推奨 = Option A（PI panel fixture/projection UI skeleton・default OFF flag・dev preview route・fixture 入力・read-only）**。
理由: G→H3 で純 chain は完成。**初の app 接触**を、project 慣習（dev-* preview・flag default OFF・CEO 承認 env）に沿って **fixture-fed・read-only・runtime 非配線**で行えば、projection の説明 UX を**安全に目視確認**でき、execution/booking/ranking/send/CoAlter のどの gate も開けない。A →（B）CoAlter consume 型 →（C/D）の順。
※ より保守的に pure を続けるなら B（CoAlter consume 型のみ）も可。CEO の選好次第。

---

## §11 出力 + CEO 判断請求

- 本書は **配線前の consume 契約凍結のみ**。実装・配線なし。
- **推奨次フェーズ = Option A（PI panel fixture/projection UI skeleton・default OFF flag・dev preview route・実装は別 GO）**。

### CEO 判断請求
1. **UI/CoAlter は projection / DisplayPacketForClient のみ consume・authoritative/diagnostics/raw は server-only** を凍結点として承認するか。
2. **中間層直叩き禁止・projection を execution/booking/ranking authority にしない**を確認するか。
3. **初 UI 配線 = `dev-*` preview route + default-OFF flag + fixture projection + read-only + fail-closed empty**（本番 `/plan`・engine runtime・send 非接触）方針で良いか。
4. **CoAlter は client display path のみ先行・server-authoritative route と useCoAlter は M2-B-2 HOLD のまま**で良いか。
5. 次フェーズ = **Option A**（vs B/C/D）で良いか。

実装は CEO 承認まで着手しない（UI/CoAlter consume wiring preflight レポートで停止）。
