# Production /plan Travel Input Wiring Preflight（docs-only）

> 設計フェーズ。**コード変更なし**。production 実装は CEO の production gate 承認まで HOLD。
> 上位文脈: bind → provider → engine → display chain（pure 完成）の production 接続境界。
> 既存基盤: `app/(culcept)/plan/page.tsx`（live・`planRouteLive` 既定 OFF・auth gate・Supabase・PlanClient）/ `_actions/*.ts`（server action 範型）/ brand 型 firewall（`DisplayPacketForClient` vs `AuthoritativePacketForServer`）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等推論 ⑦人間超え革新 ⑧世界トップシェア。

---

## 0. grounding（production は live・travel は未配線・firewall は型で既存）

| 事実 | 出典 | 含意 |
|---|---|---|
| production `/plan` は live（server component・`PLAN_FLAGS.planRouteLive` 既定 OFF→notFound・auth gate→/login・Supabase・→`PlanClient`） | app/(culcept)/plan/page.tsx | travel を足す器は**ある**が travel engine は未配線 |
| **server action 範型が既存**: `"use server"`・**FormData（permissioned field のみ）**・**server で再検証/再計算（client 値を信用しない）**・**PRG redirect** | `_actions/lifeops-*.ts` | ★ CEO preferred direction（client intent→server adapter）の**実証済み範型** |
| `runTravelPlanEngine` は **dev route + test のみ**（production route / server action / api に無し） | engine 使用箇所 | travel は production 完全未配線 |
| **brand 型 firewall**: `DisplayPacketForClient`(authoritative:false/executionAuthority:false/[tier]="display") / `AuthoritativePacketForServer`([tier]="server") / `buildPlanIntelligenceProjection` は **DisplayPacketForClient 型 lock** | engine-consume-types.ts / plan-intelligence-projection-types.ts | ★ §9 の多くは**既に型で強制**済み |
| `toDisplayPacket(output,viewerId)` → DisplayPacketForClient（authority 無を assert）/ `toServerAuthoritativePacket` は server-only | engine-consume.ts | client へ出すのは display のみ・authoritative は型で隔離 |
| production-travel flag は**存在しない**（`travelProjectionPreview` は dev のみ） | featureFlags.ts | production 配線には**新 flag（既定 OFF）が要る** |
| `/plan` は auth 必須（proxy.ts → /login） | proxy.ts | production 配線は**認証済みユーザー文脈**で動く（server 側に user/Supabase 既存） |

---

## 1. まず前提を疑う（①）

| 候補 | いま着手すべきか |
|---|---|
| **A. production `/plan` travel input wiring preflight**（本書） | **推奨（docs-only）**。pure chain は完成・接続境界を定義する段。だが**実 wiring は最高 gate**（実ユーザー/auth/Supabase/新 flag = CLAUDE.md §1 CEO 承認） |
| B. Tier1 safe links / Maps URL | **後**（confirmed destination/intent が production で出てから・外部 gate） |
| C. M2 soft enrichment provider | **後**（M2 runtime HOLD・soft のみ・hard 不可） |
| D. dev previews を熟成させ wait | **不要**。dev route 3 本が chain を既に end-to-end 実証済み |

**推奨: A（docs-only 設計）。** 根拠（①⑤）: pure chain（bind→provider→engine→display）は完成し、display-safe firewall は**既存 brand 型で強制**済み。残るは「production `/plan` の実 surface → adapter → display」の**境界定義**。実 wiring は実ユーザー/auth/Supabase/新 flag に触れる**CEO production gate 案件**ゆえ、本 phase は**境界設計に留め、最後の pure ピース（server-only adapter）までを次スライス候補**にする。

### ★ 設計の核（⑥⑦）
production 接続に**新規 runtime は要らない**。必要なのは:
1. **pure な display-safe adapter**: `session events → bind → provider → engine → display projection/cues`（or not-ready）を 1 関数に束ね、**authoritative/raw input/raw output/diagnostics を構造的に返さない**。adapter 自体は **pure**（実 session state は caller が渡す）。
2. 既存 **server action 範型**（FormData→server 検証→PRG）に adapter を乗せる（実 wiring・HOLD）。
→ pure chain を「production が呼ぶ display-safe 単一関数」に完成させ、production gate は薄い server action に縮約。

---

## 2. 完成 chain / dev-only / production-ready pure / HOLD

```
構造化 session/form events → bindTravelSessionIntake → TravelIntakeInput
  → getProductionTravelInput(gate fixtureAllowed:false) → 5 状態
  → (ready のみ) runTravelPlanEngine → TravelPlanEngineOutput
  → toDisplayPacket(→DisplayPacketForClient) → buildPlanIntelligenceProjection → deriveCoAlterProjectionCues
```
- **dev-only**: 3 dev route（engine-projection/session-intake/binding）+ fixture events。
- **production-ready pure logic**: bind / provider / engine / display consume / projection / cues（**全 pure・brand 型で display-safe**）。
- **HOLD**: production `/plan` への実配線・新 production flag・実 session event source（PlanClient UI）・server action 接続・persistence・M2 runtime・外部 retrieval・route/weather/place・Tier1 safe links・booking/calendar/action。

---

## 3. production `/plan` wiring problem の定義

- production `/plan` は**実ユーザー/session state**を持つ。
- binding は**構造化 events**を要する。
- production は **raw UI コピー / chat text を直接渡してはならない**。
- production は **fixture input を silent 使用してはならない**。
- production は destination/date/participants が **missing/unconfirmed なら fail-closed**。
- production は **raw provider diagnostics を露出してはならない**。
- production は **action authority を付与してはならない**。

---

## 4. production input source（now / HOLD）

| source | 状態 |
|---|---|
| 選択 `/plan` date/window → `selected_plan_window`(session_context) | **now 可**（server-known） |
| 現 plan page の date state | **now 可**（session_context） |
| 明示 travel mode start | now 可（scope・slot 外） |
| destination form / date-range picker / participant selector / budget・pace・mobility・red_line・soft_preference controls | **now 可**（明示 surface event・server で構築） |
| manual entity evidence（既供給時） | now 可・**ただし hard 不可**（dest/date/participants を満たさない） |
| future CoAlter prompt capture | **HOLD** |
| future chat extraction | **HOLD**（proposed まで・本 wiring 非対象） |

---

## 5. server/client 境界オプション（§5）

| 案 | 内容 | 評価 |
|---|---|---|
| A. server component が **server-known state のみ**から events を組む | 選択日等は可・だが destination/budget 等の**ユーザー入力**を取れない | 不十分（単独では） |
| B. client が**構造化 event payload**を server action/API に渡す | 既存 LifeOps 範型と一致 | ◎ 要素 |
| C. client が `TravelIntakeInput` を直接構築 | client が status 主張・最終 input 構築 | ✗ 禁止 |
| **D. hybrid: client は structured intent → server binding adapter** | client は**意図**を渡し、**server が bind/provider/engine を実行** | ◎ **採用**（A+B の統合・LifeOps 範型） |

**推奨: D。** client は構造化 intent（form field・選択値）を渡すのみ。**server が** `SessionSurfaceEvent[]` を組み（**status は surface から derive**）、bind→provider→engine→display を実行。
- ★ **client は `TravelPlanEngineInput` を構築しない**・**status を主張しない**・**raw provider input / diagnostics を既定で受けない**（CEO preferred direction）。

---

## 6. binding adapter 境界（§6・本書が定義する pure 関数）

```
// スケッチ（未実装・pure・server-only adapter）
// 入力: server で検証済みの production-safe な構造化 payload（SessionSurfaceEvent 相当 + participantIds + viewerId）
// 出力: client-safe な ready/not-ready（display のみ）。authoritative/raw output/raw input/diagnostics を返さない。
type ProductionTravelDisplay = { projection: PlanIntelligenceProjection; cues: CoAlterProjectionCue[] };
type ProductionTravelPlanResult =
  | { status: "ready"; display: ProductionTravelDisplay }            // ★ client-safe のみ
  | { status: "not_ready_missing"; ask: PrereqAsk[] }               // 中立（destination/date/participants を聞く・provenance なし）
  | { status: "not_ready_unconfirmed"; ask: PrereqAsk[] }
  | { status: "unavailable" }
  | { status: "invalid" };
// assembleProductionTravelPlan(payload): ProductionTravelPlanResult
//   = bindTravelSessionIntake → getProductionTravelInput(fixtureAllowed:false)
//     → ready のみ runTravelPlanEngine → toDisplayPacket → buildPlanIntelligenceProjection → deriveCoAlterProjectionCues
//   それ以外は fail-closed（display なし）。fixture fallback なし。authoritative は server 内に留め client へ返さない。
```

- adapter は **`bindTravelSessionIntake` を呼ぶ** → **`getProductionTravelInput`** → **ready のみ engine** → display chain。
- **それ以外は fail-closed**（display 出さず neutral 状態）。**fixture fallback なし**。
- ★ adapter は **pure**（実 session state は caller が渡す）→ test 可。production 接続（FormData server action）は**別 HOLD**。

---

## 7. fail-closed 状態（§7）

missing destination / missing date / missing participants → not_ready_missing。unconfirmed destination/date → not_ready_unconfirmed。invalid participants → invalid。unavailable session source → unavailable。production gate が dev_fixture を拒否（fixtureAllowed:false）。binding invalid event は drop。**engine は provider ready のときのみ呼ぶ**。

## 8. privacy（§8）

private red_line/preference は **server-side**（engine input を形成してよいが leak しない）・provider diagnostics は **server-only 既定**・client は後に **safe な質問/確認 prompt のみ**（raw private input でなく）・**private soft enrichment は display に漏れない**（brand 型 `DisplayPacketForClient` が authoritative/private を構造排除）・**client-only privacy filtering 禁止**。

## 9. production UI への出力（§9・多くは brand 型で既存強制）

- not ready → **neutral 状態 or projection なし**。
- ready → **`DisplayPacketForClient` / `PlanIntelligenceProjection`（+cues）のみ**。
- **never** `AuthoritativePacketForServer` / raw `TravelPlanEngineInput` / raw `TravelPlanEngineOutput` / raw provider diagnostics。
- **no executionAuthority**・**no booking/calendar/action button**。
- ★ これらは `DisplayPacketForClient`(authoritative:false 固定) / `buildPlanIntelligenceProjection`(display 型 lock) で**既に型強制**。adapter は authoritative を返さないことで二重防御。

## 10. 既存 dev preview との関係（§10）

dev route は **proof path として維持**・production route は **fixture を copy しない**・dev route は fixture events を使い続けてよい・production wiring は **real structured event source のみ**。

## 11. Tier1 safe links 関係（§11）

Tier1 safe links は **HOLD**・将来 confirmed destination/entity intent を消費し得る・**本 wiring で URL/Maps link 生成なし**。

## 12. M2/Stargazer 関係（§12）

M2 は将来 soft/private enrichment を足し得るが **destination/date を hard-confirm できない**・**M2 runtime HOLD**・**本 phase で personalization runtime なし**。

---

## 13. 実装オプション + 推奨（§13・CEO 承認で着手）

| 案 | 内容 | 評価 |
|---|---|---|
| **A. production wiring types** | `ProductionTravelPlanResult` / `PrereqAsk` / production-safe payload 型 | 推奨バンドル前提 |
| **B. server-only binding adapter helper（pure）** | `assembleProductionTravelPlan(payload)` = bind→provider→engine→display（display-safe のみ・fail-closed・authoritative 非返却） | 推奨 keystone（**最後の pure ピース**） |
| C. production `/plan` hidden/default-OFF route/state | 新 flag `PLAN_TRAVEL_LIVE`(既定 OFF) + server action（FormData→adapter→PRG）+ PlanClient surface | **HOLD**（実ユーザー/auth/Supabase/新 flag = CEO production gate） |
| D. production 実装せず Tier1 safe links へ | — | **後**（confirmed input 先行） |
| E. M2 soft enrichment provider | — | **後**（M2 HOLD） |

**推奨: A + B（pure adapter bundle）を 1 slice（split 許可）。** keystone は **B**（既存 pure chain を display-safe 単一関数に束ね、authoritative/raw/diagnostics を構造排除・fail-closed）。dev route で実証可（fixture events → adapter → display）。**C（production route/flag/server action/UI）は HOLD**（CEO production gate）。D/E は後。
> ★ premise note: 新 runtime 不要。本 slice は pure chain を「production が呼ぶ display-safe 単一関数」に完成させるだけ。実 production 接続は薄い server action に縮約され、別 CEO gate。

---

## 14. 将来 test（§14・実装時）

- client は **status を主張できない**（adapter が surface から derive）。
- client は **最終 `TravelPlanEngineInput` を構築できない**（adapter が server 側で構築）。
- server adapter が **status を derive**。
- **provider not ready で engine を呼ばない**。
- missing destination/date → **safe not-ready**。
- invalid participants → **fail-closed**。
- **production gate が dev_fixture を拒否**。
- **raw diagnostics を表示しない**。
- **ready のときのみ display 出力**。
- client へ **`AuthoritativePacketForServer` を出さない**・**raw engine output を出さない**。
- **fixture fallback なし**。
- 明示承認なき限り **fetch/API/DB/Supabase なし**・**M2 runtime なし**・**route/weather/place なし**・**booking/calendar/action なし**。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 15. Stop

- 本書（Production `/plan` Travel Input Wiring Preflight）で**停止**。
- production wiring 実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **前提（①）**: pure chain（bind→provider→engine→display）完成・display-safe firewall は **brand 型で既存強制**・production `/plan` は live だが travel 未配線・**server action 範型（FormData→server 検証→PRG）が既存**。
- **境界（D 採用）**: client は構造化 intent のみ → **server が bind/provider/engine/display を実行**。client は最終 input を構築せず・status を主張せず・authoritative/raw/diagnostics を受けない。
- **adapter（pure・keystone）**: `assembleProductionTravelPlan(payload)` = bind→provider→engine→display projection/cues（or fail-closed）。authoritative/raw output/raw input/diagnostics を**構造的に返さない**（brand 型 + adapter 二重防御）。
- **推奨次バンドル**: **A（types）+ B（pure server-only adapter）**。**C（production route/新 flag `PLAN_TRAVEL_LIVE`/server action/PlanClient UI）は HOLD（CEO production gate）**。D（safe links）/ E（M2）は後。外部 retrieval・route/weather/place・booking・persistence・CoAlter・/talk 全 HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
