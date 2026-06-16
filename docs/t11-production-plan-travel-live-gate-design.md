# Production /plan Travel Live Gate Design（docs-only）

> 設計フェーズ。**コード変更なし**。production 実装は CEO の production gate 承認まで HOLD。
> 上位文脈: pure/server-only display adapter（`buildTravelPlanDisplayResult`）の production 露出 gate。
> 既存範型: LifeOps live gate（`flag ∧ planRouteLive ∧ staging ∧ !prod`・production deny は別 CEO gate）/ server action（`"use server"`・FormData static lock・PRG）/ brand 型 firewall。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 0. grounding（live gate の既存範型）

| 既存物 | 出典 | 範型 |
|---|---|---|
| `planRouteLive = process.env.PLAN_ROUTE_LIVE === "true"`・`travelProjectionPreview = …PLAN_TRAVEL_PROJECTION_PREVIEW…` | featureFlags.ts:21,385 | flag 命名規約 |
| **LifeOps live gate**: `mainline ∧ planRouteLive ∧ staging allowlist ∧ !production`・**production は flag ON でも常に gate_off（deny 解除は別 CEO gate）** | lifeops-structured-input.ts / featureFlags.ts:406 | ★ 採用する live gate 合成 |
| **server action 範型**: `"use server"`・**permissioned field のみ static lock**（status/id/raw/user_id を formData から読まない）・user_id は auth 注入・**PRG redirect** | lifeops-structured-input.ts | ★ travel server boundary の範型 |
| 中立 copy: 「候補の下書き」「予約・確定・送信・実行は行いません」「順位ではありません」 | dev-travel-candidate-collection | copy トーン |
| brand 型: `DisplayPacketForClient`(authoritative:false) / `AuthoritativePacketForServer`(server-only) | engine-consume-types.ts | 出力 firewall（型強制済） |

---

## 1. まず前提を疑う（①）

| 候補 | いま着手すべきか |
|---|---|
| **A. production `/plan` travel live gate design**（本書） | **推奨（docs-only）**。pure chain は完成・残るリスクは**配線 gate**。gate を先に厳密設計し、実装を外科的・pre-vetted にする |
| B. Tier1 safe links / Maps URL | **後**（confirmed travel display が production で動いてから・外部 gate） |
| C. M2 soft enrichment provider | **後**（M2 runtime HOLD・soft のみ・hard 不可） |
| D. production wiring を更に wait | **不要**。gate 設計は安価・de-risk。ただし**実装は CEO production gate まで HOLD** |

**推奨: A（docs-only）。** 根拠（①⑤）: chain（bind→provider→engine→display adapter）は display-safe firewall（brand 型）込みで完成。残リスクは「実ユーザー/auth/Supabase/flag/server action」への露出のみ。この gate を **LifeOps 範型に揃えて厳密設計**し、実装は最小・gated にする。

---

## 2. 完成しているもの

- **pure・production-ready**: `bindTravelSessionIntake`（surface→slot・status derive）/ `getProductionTravelInput`（5 状態・fixture 拒否）/ `buildTravelPlanDisplayResult`（display-safe ready/not-ready・engine は ready のみ）/ `DisplayPacketForClient` / `PlanIntelligenceProjection` / `CoAlterProjectionCue`（brand 型で client-safe）。
- **dev-only**: 3 dev route（engine-projection / session-intake / binding）+ fixture events（`PLAN_TRAVEL_PROJECTION_PREVIEW`）。
- **未配線（pure のまま）**: production `/plan` への露出・新 flag・server action・PlanClient UI・実 structured input source。

---

## 3. production wiring risk

- production `/plan` は **live / auth-gated / Supabase-backed**。
- travel 露出は **実ユーザー文脈**を導入。
- flag 追加は **rollout state** を導入。
- server action 追加は **mutation 形の surface**（read-only でも）を導入。
- PlanClient UI は **copy 次第で action authority を含意**し得る。
- not-ready 診断は **private/source-sensitive を漏らし得る**。
- **fixture fallback は不可能でなければならない**。

---

## 4. flag 戦略（§4）

- **新 flag: `PLAN_TRAVEL_LIVE = process.env.PLAN_TRAVEL_LIVE === "true"`**（既定 OFF）。
- **`PLAN_TRAVEL_PROJECTION_PREVIEW` と別**（preview は dev-only のまま・live は preview を使わない）。
- **live gate 合成（LifeOps 範型）**: `PLAN_TRAVEL_LIVE ∧ planRouteLive ∧ staging allowlist ∧ !production`。
  - ★ **production は flag ON でも常に deny**（deny 解除は**別 CEO gate**）。
- live flag は **read-only travel display chain のみ**を（後の実装で）有効化。**booking/calendar/send/realtime/read receipt を有効化しない**。
- **本 phase で env write なし**。

---

## 5. server 境界オプション（§5）

| 案 | 内容 | 評価 |
|---|---|---|
| A. server component が **server-known state のみ**から display を計算 | 選択日等は可・destination 等の**ユーザー入力**不可 | 不十分（単独） |
| **B. server action が FormData 構造化 intent を受け PRG** | LifeOps 範型と一致・server 再検証 | ◎ **採用** |
| C. API route が display result を返す | 不要に surface 拡大 | ✗（必要時のみ後で） |
| D. client が `buildTravelPlanDisplayResult` を直接呼ぶ | client が input 構築・status 主張・server 再検証を迂回 | ✗ 禁止 |

**推奨: B。** client は **permissioned 構造化 field のみ**（FormData static lock: destination text / date / participant 選択 / budget・pace・mobility・descriptor controls。**status/slot/TravelPlanEngineInput/raw は読まない**）。**server が** `SessionSurfaceEvent[]` を組み（**status は surface から derive**）→ `buildTravelPlanDisplayResult` → display-safe 状態を返す（PRG or server-rendered props）。**client は adapter を直接呼ばない**。API route は当面なし。

---

## 6. 初回 live slice の許可 input surface（§6）

選択 plan date/window（既存時）/ 明示 destination form field / 明示 date・date-range field（既存時）/ participant selector（既存時）/ budget・pace・mobility・red_line・soft_preference field（既存時）。**no raw chat・no LLM extraction・no M2 enrichment・no external entity retrieval・no route/weather/place**。

---

## 7. fail-closed UI 挙動（§7）

| 状態 | UI |
|---|---|
| flag OFF | **travel UI なし** |
| not_ready_missing | 中立 **質問** prompt（「追加で教えてください」） |
| not_ready_unconfirmed | 中立 **確認** prompt（「まだ確認が必要です」） |
| invalid | 中立 error 状態（理由は出さない） |
| unavailable | projection なし / disabled |
| ready | **`PlanIntelligenceProjection` / cues のみ** |

**never**: raw diagnostics / authoritative packet / raw input・output。**action button なし**。

---

## 8. copy ルール（§8・CEO 補正反映）

- 関連時 **draft/proposal** を明示。
- **禁止**: 「予約」「確定」「実行」「この案にする」「スケジュールに追加」。
- **中立 copy 採用**: 「旅行プランの下書き」「まだ確認が必要です」「追加で教えてください」「これは予約・確定ではありません」。

## 9. privacy（§9）

private red_line/preference は **server-side**・raw provider diagnostics は **server-side**・**display result のみ** client へ・**client-only filtering 禁止**・**not-ready prompt に private 理由を含めない**（`PrereqAsk` は prerequisite 種別=destination/date/participants のみ・なぜは出さない）・**raw M2/Stargazer なし**・**private fit/readiness rationale なし**。

## 10. 既存 dev preview との関係（§10）

dev preview は proof path 維持・**live flag は dev fixture を再利用しない**・**live は `PLAN_TRAVEL_PROJECTION_PREVIEW` を使わない**・dev route は fixture 駆動のまま・**live route は real structured input のみ**。

## 11. Tier1 safe links 関係（§11）

safe links **HOLD**・**Maps URL 生成なし**・**href/external link なし**・**公式サイト抽出なし**・**live availability/price 主張なし**。

## 12. CoAlter 関係（§12）

CoAlter runtime **HOLD**・CoAlter cues は将来 **display-only** のみ・**useCoAlter なし**・**`/talk` なし**・**send/realtime/read receipt なし**。

---

## 13. 実装オプション + 推奨（§13・CEO 承認で着手）

| 案 | 内容 | 評価 |
|---|---|---|
| **A. flag/type scaffolding only** | `PLAN_TRAVEL_LIVE`(既定 OFF) + 合成 gate helper（`isTravelLiveAllowed`）+ production-safe FormData payload→event 変換の **pure 型契約**（behavior なし） | **推奨・最小 first slice**（OFF・deny・consumer は C で配線） |
| C. read-only server action + 既定 OFF flag 裏の隠し出力 | `"use server"`・FormData static lock→server で event 組成→`buildTravelPlanDisplayResult`→PRG。**staging∧!prod gate**・UI なし | **A の直後**（first behavioral slice・production deny 維持） |
| B. server action design only | docs | A/C に内包 |
| D. PlanClient display panel（既定 OFF flag 裏） | read-only display UI（中立 copy） | C の後・別 gate |
| E. production 配線せず Tier1 safe links へ | — | 代替（CEO が travel-in-prod を後回しにする場合） |

**推奨: A（flag/type scaffolding）を最小 first slice。** OFF・production deny・behavior なし。★ **inert flag を残さないため、A は C（read-only server action・staging gated）と近接して進める**（A→C を 1 連の path に）。**D（PlanClient UI）と production deny 解除は各々別 CEO gate**。E は CEO が travel-in-prod を後回しにする場合の代替。
> ★ premise note: gate は LifeOps 範型の写し（flag ∧ planRouteLive ∧ staging ∧ !prod）。新 runtime 不要・production は常に deny（別 CEO gate まで）。

---

## 14. 将来 test（§14・実装時）

- **live flag 既定 OFF → travel UI 非表示**。
- **preview flag は production travel UI を有効化しない**（別 flag）。
- client は **slot status を渡せない**・**`TravelPlanEngineInput` を渡せない**。
- **server action が status を再導出**。
- missing destination/date → **engine を呼ばない**。
- invalid participants → **engine を呼ばない**。
- **fixture fallback なし**。
- **raw diagnostics を render しない**・**`AuthoritativePacketForServer` を client へ出さない**・**raw engine output を render しない**。
- **booking/calendar/action button なし**。
- 明示承認なき限り **API/fetch/DB なし**・**M2 runtime なし**・**route/weather/place なし**・**CoAlter/useCoAlter なし**・**`/talk` なし**。
- **production は flag ON でも deny**（staging∧!prod gate）。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 15. Stop

- 本書（Production `/plan` Travel Live Gate Design）で**停止**。
- production wiring 実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **前提（①）**: pure chain は display-safe firewall 込みで完成。残リスクは配線 gate のみ。gate を **LifeOps 範型**（`flag ∧ planRouteLive ∧ staging ∧ !prod`・**production は常に deny**）に揃えて厳密設計。
- **flag**: 新 `PLAN_TRAVEL_LIVE`（既定 OFF・preview と別・read-only display のみ・booking/send 等は有効化しない・env write なし）。
- **server 境界（B）**: server action（FormData static lock → server が event 組成・status derive → `buildTravelPlanDisplayResult` → display-safe）。client は adapter を直接呼ばず・status/input を渡さない。
- **UI/copy/privacy**: fail-closed（OFF=非表示 / missing=質問 / unconfirmed=確認 / invalid=中立 error / ready=projection・cues のみ）・中立 copy（「旅行プランの下書き / まだ確認が必要です / これは予約・確定ではありません」・「予約/確定/実行/この案にする/スケジュールに追加」禁止）・private/診断は server-only。
- **推奨次バンドル**: **A（flag/type scaffolding・OFF・deny）→ C（read-only server action・staging gated・UI なし）**。D（PlanClient UI）と production deny 解除は別 CEO gate。E（safe links）は代替。Tier1 safe links / Maps URL / M2 runtime / 外部 retrieval / route-weather-place / booking / CoAlter / `/talk` 全 HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
