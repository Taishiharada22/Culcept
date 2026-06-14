# T11-C Server-side Engine Runtime Wiring Preflight（fixture入力→実engine→display・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only）。
**位置づけ**: 2 つの fixture preview（hand-built display packet）を、**実 `runTravelPlanEngine`（純関数）を fixture 入力で server 実行**して得る実 output へ橋渡しする初の「engine 実行」設計。
**target flow**: `fixture TravelPlanEngineInput → runTravelPlanEngine → toDisplayPacket → buildPlanIntelligenceProjection → deriveCoAlterProjectionCues`。
**スコープ**: 計画のみ。コード変更なし。**dev-preview only / default-OFF flag / read-only / server-only / 本番 `/plan`・CoAlter runtime・useCoAlter・/talk・send・booking・API/fetch/DB・route/weather/place runtime は実装しない**。**本レポートで停止**。

---

## §1 前提を疑う — 次は server-side engine runtime wiring preflight で正しいか

| 候補 | 評価 |
|---|---|
| **C server-side engine runtime wiring preflight** | **★ 採用**。fixture display packet → 実 engine output の橋・display 契約を実データ経路で検証する初手・pure 関数ゆえ低リスク |
| B 本番 `/plan` integration preflight | 早い（engine が app で 1 度も実行されていない段で本番設計は順序逆） |
| D CoAlter client display wiring preflight | C（実 projection）後。実 cue は実 engine output から出すべき |
| E Bundle 2 fit dominance/ranking | GPT HOLD・advisory 固定維持 |
| F solver / itinerary DAG | runtime gate 寄り・engine wiring 後 |

**推奨 = C**。理由: (1) 2 preview は hand-built fixture までしか検証していない＝**実 engine が app で 1 度も走っていない**。(2) `runTravelPlanEngine` は純関数（実測: Date.now/Math.random/fetch/supabase 0）ゆえ server 実行のリスクが小さく、fixture→実 output の検証に最適。(3) production/CoAlter/送信を 1 つも開けず、display 契約を「実データ経路」で固められる。

---

## §2 提案する将来 runtime flow

```
fixture TravelPlanEngineInput            … 決定論 static（slots/participantIds/policy?/scenarios?/fit?/cancelWeather?/viewerId?）
  → runTravelPlanEngine(input)           … 純関数・server 実行（TravelPlanEngineOutput = {authoritative, shared, viewer, diagnostics, inputError}）
    → toServerAuthoritativePacket(output) … T-S（server-only・client に出さない）
    → toDisplayPacket(output, viewerId?)  … T-D（DisplayPacketForClient・authoritative=false 固定）
      → buildPlanIntelligenceProjection({packet}) → PlanIntelligenceProjection
        → deriveCoAlterProjectionCues(projection) → CoAlterProjectionCue[]
        → 既存 read-only component（TravelProjectionPreview / CoAlterCuesPreview）で表示
```

- **既存 dev preview route の component を再利用可**（projection/cues を受ける read-only component は engine 由来でも fixture 由来でも同型）。
- **server-only に残る**: `TravelPlanEngineOutput.authoritative` / `diagnostics` / engine 実行そのもの。client へは **projection / cues のみ**。

---

## §3 なぜ runtime gate か

- 現 preview は **hand-built display packet/projection fixture**（engine を実行しない）。
- app server component から `runTravelPlanEngine` を呼ぶのは **初の engine runtime wiring**。
- 純関数（I/O なし）でも、**library test から app 実行へ越境**する（request-time 実行・dynamic render）。
- ∴ 実装前に **docs-only preflight** で境界（入力の出所・fail-closed・client へ渡すもの）を固める必要がある。

---

## §4 許可される fixture 入力

| 規則 | 詳細 |
|---|---|
| 決定論 static fixture のみ | `TravelPlanEngineInput` を hard-coded（slots は static date 文字列等） |
| user data なし | 実ユーザー由来 slot/識別子を入れない |
| M2 runtime personalization なし | fit は **fixture `ProposalFitInput`** のみ（M2 由来でない） |
| DB なし / route・weather・place live なし / fetch・API なし | 入力は純データ |
| **engine fixture path に Date.now/random/process.env なし** | 入力・engine 実行は env 非依存（flag gate の process.env は route 入口のみ・engine path と分離） |
| controlled fixture を超える raw private なし | private は fixture 内の制御値のみ（shared 射影で消える） |
| 実世界 claim 生成なし | live weather/price/availability を作らない |

---

## §5 出力規則

- **authoritative output は server-only**（`output.authoritative` / `toServerAuthoritativePacket` を client component に渡さない）。
- **display packet は `toDisplayPacket` 経由**で生成。
- **projection は `buildPlanIntelligenceProjection` 経由**。
- **CoAlter cues は `deriveCoAlterProjectionCues` 経由**。
- **client/display preview は projection / cues のみ受領**。
- **diagnostics は hidden**（client に出さない）。
- **authoritative⊥shared 差分しない**（private 逆推論しない）。

---

## §6 preview integration options

| 案 | 内容 | 評価 |
|---|---|---|
| A. `dev-travel-projection` の fixture を engine 由来に**置換** | 既存 hand-built fixture を消す | hand-built の rich/edge-case 検証(9 section/viewerNote/weather)を失う・既存 16 tests に regression risk |
| **B. engine 由来 projection 用に新 dev route 追加** | 例 `dev-travel-engine-projection`・実 engine→display→projection/cues を既存 component で表示 | **★ 推奨**。既存 2 preview を**不変**(regression 0)・実 engine pipeline を end-to-end で示す・同一 flag 再利用 |
| C. 同一 route に hand-built と engine 由来を併置 | 比較表示 | 価値はあるが複雑・B より後でも可 |
| D. runtime preview を実装しない | — | 前進しない |

**推奨 = B（engine 由来 projection 用の新 dev route）**。既存 preview を不変に保ち（30 tests regression 0）、`runTravelPlanEngine → toDisplayPacket → buildPlanIntelligenceProjection → deriveCoAlterProjectionCues` を **end-to-end で 1 route に**示す。component は既存 `TravelProjectionPreview` / `CoAlterCuesPreview` を再利用。

---

## §7 flag strategy

- **既存 `PLAN_TRAVEL_PROJECTION_PREVIEW`（`PLAN_FLAGS.travelProjectionPreview`）を再利用**（新 flag を足さない）。
- 理由: 同じ「travel projection preview family」・runtime 配線が無い今は state 組合せを増やさない（GPT 補正の踏襲）。**default OFF**・env write なし・production 有効化なし。

---

## §8 safety / fail-closed

- **engine fixture build 失敗 → Disabled/error preview**（catch・本番 path へ throw しない）。
- **partial authoritative leak なし**（client へ authoritative を渡さない）。
- **raw packet dump なし**（display packet/projection/cue のみ表示・raw output 非表示）。
- **diagnostics 表示なし**。**action button なし**。**send/realtime/read receipt なし**。**booking/scheduling なし**。

---

## §9 将来実装の test 期待

1. engine 由来 path が**決定論的に走る**（同一 fixture → 同一 projection/cues）。
2. fit 入力を除外した fixture なら **fitAdvisory 空**（baseline 保持）。
3. display packet は **`authoritative:false`**。
4. display packet は **`executionAuthority:false`**。
5. projection に **authority field なし**。
6. CoAlter cues に **execute/book/schedule/send なし**。
7. server page が **`AuthoritativePacketForServer` を client component に渡さない**（source-contract）。
8. **diagnostics 非 render**。
9. **fetch/API/DB/Supabase import なし**。
10. **useCoAlter なし**・**`/talk` なし**。
11. **本番 `/plan` 改変なし**。
12. 既存 preview tests 不変 green・**tsc baseline 55 不変**。

---

## §10 将来 gate との関係

production `/plan` integration / CoAlter runtime / useCoAlter / `/talk` / CoAlter server-authoritative / M2-B-2 /
Bundle 2 dominance/ranking / solver・itinerary DAG / route・weather・place API / persistence / send・realtime・read receipt /
booking・calendar — **すべて HOLD のまま**（本 phase は engine を **fixture 入力で server 実行して表示する**ことに限定）。

---

## §11 推奨実装スライス（承認後）

| 項目 | 内容 |
|---|---|
| **触るファイル（新規のみ）** | `app/(culcept)/plan/dev-travel-engine-projection/page.tsx`（server・flag gate・engine 実行）/ `…/engine-fixture-input.ts`（決定論 `TravelPlanEngineInput`）/ tests 2（render-less logic + page source-contract） |
| **route** | **新 route 追加**（既存 `dev-travel-projection` / `dev-coalter-projection-cues` は**不変**） |
| **component** | 既存 `TravelProjectionPreview` / `CoAlterCuesPreview` を **再利用**（新 UI なし） |
| **page 構造** | flag OFF→Disabled / ON→`runTravelPlanEngine(FIXTURE_INPUT)`→`toDisplayPacket`→`buildPlanIntelligenceProjection`→（projection 表示）+`deriveCoAlterProjectionCues`→（cues 表示）。authoritative を client に渡さない |
| **fail-closed** | engine 実行を try/catch し失敗時 Disabled（throw しない） |
| **tests** | (a) `engine-fixture-input → 出力` logic test（決定論・authoritative:false/executionAuthority:false・projection authority 無・cues に execute/book/schedule/send 無）/ (b) page source-contract（flag 再利用・engine 実行を client に authoritative 渡さない・no fetch/DB/useCoAlter/talk/送信・本番非接触） |
| **stop conditions** | 実 user data / DB / fetch / route・weather・place runtime / CoAlter runtime / useCoAlter / talk / send / booking / 本番 `/plan` / 新 flag 必須化 / authoritative の client 流出 が必要になったら即停止 |

---

## §12 出力 + CEO 判断請求

- 本書は **server-side engine runtime wiring の preflight 設計のみ**。実装・配線なし。
- **推奨実装バンドル（承認後）**: §11（新 route で `runTravelPlanEngine` を fixture 入力 server 実行→既存 component で projection/cues 表示・既存 preview 不変・同一 flag・read-only）。

### CEO 判断請求
1. 次 = **C（server-side engine runtime wiring・新 dev route で実 engine を fixture 入力 server 実行）** で良いか。
2. integration option = **B（新 route・既存 preview 不変・component 再利用）** で良いか（vs A 置換 / C 併置）。
3. **既存 `PLAN_TRAVEL_PROJECTION_PREVIEW` flag 再利用**（新 flag なし・default OFF）で良いか。
4. **authoritative は server-only・client へは projection/cues のみ・fail-closed・diagnostics hidden** の出力規則で良いか。
5. 承認後 §11 バンドル実装の GO（HOLD は §10 全件維持）。

実装は CEO 承認まで着手しない（C preflight レポートで停止）。
