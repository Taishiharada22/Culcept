# Server Action ExternalLinks Option Passing Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> DB・RLS / M2 runtime / CoAlter runtime / 外部 retrieval / Maps・Places API / URL fetch / production deny 解除 は HOLD。
> 上位文脈: C-E(adapter `includeExternalLinks` 下で attach) + D-C(panel が `display.externalLinks` を render)。**両側 wired・だが action が option 未渡し＝live でも link は出ない**。
> **本書 = server action が `includeExternalLinks` を既存 live gate 下でのみ true 渡しする境界**（初の「点灯」・staging のみ・production deny）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- action `submitTravelLiveIntakeAction`（`_actions/travel-live.ts`）: **① gate（`isPlanTravelLiveAllowed`）not allow → `unavailable` return**（compute せず）→ ② auth（未認証/anonymous → unavailable）→ ③ `buildTravelPlanDisplayResult(..., {fixtureAllowed:false})`（**現状 第3引数なし**）→ ④ `toTravelLiveActionState` return。
- → **step ③ に到達した時点で `isPlanTravelLiveAllowed` は必ず true**（staging URL ∧ !production ∧ travelLive ∧ planRouteLive）。
- gate `isPlanTravelLiveAllowed(env)` = `travelLive ∧ planRouteLive ∧ url.includes(STAGING) ∧ !url.includes(PRODUCTION)`（pure・**production は flag ON でも常に false**・解除は別 CEO gate）。
- `PLAN_FLAGS`: capability ごとに **server-only env flag（`process.env.X==="true"`・NEXT_PUBLIC なし）・default OFF**。合成パターンは `master ∧ per-capability ∧ staging ∧ production-deny`（例 LifeOps `isLifeOpsMainlineAllowed`）。**flag 追加は CEO 承認案件**（featureFlags.ts header）。
- C-E adapter: `options.includeExternalLinks===true` 時のみ ready で attach（confirmed shared-safe destination・helper 委譲）。D-C panel: `state.display.externalLinks ?? []` を render。
- action は **FormData から identity/flag を読まない**（auth context のみ）。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **server action option passing（本書）** | 中（初の「点灯」だが既存 gate=staging のみ・production deny・+ 推奨は専用 default-OFF flag） | 高（producer+consumer を staging で初めて観測可能に） | **推奨・次（設計のみ）** |
| Tier1-C render distinction（生成/手動 badge） | 低 | 中 | 後（link が出てから磨く） |
| SQL/RLS persistence | **高**（DB migration＝§1 CEO 承認） | 中 | 後 |
| M2 production merge | 中 | — | 後（CEO 既決で後） |
| production deny release | 最大 gate | — | **最後**（解除は別 CEO gate） |

**推奨: server action option passing 次・docs-only。** 根拠（①⑤）: C-E/D-C で producer+consumer は wired だが dormant（action 未渡し）。本 phase はそれを **既存 live gate（staging のみ・production deny）下で点灯**させ、staging で全経路を観測可能にする最小の「ON」。production は既存 gate で恒久 deny。

### ★ 設計の核（①③④）— B（既存 gate に乗る）か C（専用 flag）か
| 案 | 内容 | 評価 |
|---|---|---|
| B. 既存 gate にそのまま乗る | step ③ で `includeExternalLinks: true`（gate 通過済ゆえ常に true） | 単純だが **live panel ON＝即 link ON**（独立 kill なし・段階展開不可） |
| **C. 専用 server-only flag を既存 gate に AND** | `travelExternalLinks`（default OFF）∧ `isPlanTravelLiveAllowed` | **◎ 推奨**。link 専用の default-OFF kill-switch・panel と独立に段階展開・**codebase の per-capability gating 規律と一致**・production deny は既存 gate から継承 |

**推奨: C。** 根拠（⑦⑧）: 外部遷移リンクは **user-facing な新 capability**。codebase は capability ごとに専用 default-OFF flag を AND する規律（LifeOps 群・reality 群）。link にも専用 flag を与えれば「live panel は出すが link は止める」独立 kill と段階展開ができ、production deny release（最終 phase）で granular に解禁できる。コストは flag 1 個（server-only・NEXT_PUBLIC なし）。**B は「new public flag なし」だが panel と link を分離できない**ため、より保守的な C を推す（B も可・単純さ優先なら）。

---

## 2. 現完了経路（②）
- C-E: adapter は `includeExternalLinks` 下で attach 可。
- D-C: panel は `state.display.externalLinks` を render 可。
- **action は `includeExternalLinks` 未渡し → 現 live でも link なし**。
- production deny は active。**外部 API/fetch を誰も呼ばない**。

## 3. gate 条件（§3・C 推奨を反映）
- `includeExternalLinks` は **true 可**: `isPlanTravelLiveAllowed`（既存・staging∧!production∧travelLive∧planRouteLive）が allow **かつ** 新 `travelExternalLinks` flag = true **かつ** provider ready（adapter 側で担保）。
- `includeExternalLinks` は **false/absent**: live gate off / production / preview flag のみ / provider not ready / invalid・unavailable。
- **`NEXT_PUBLIC` flag なし**・**client 制御 flag なし**。
- ★ 合成（推奨・pure predicate）: `isPlanTravelExternalLinksAllowed(env) = isPlanTravelLiveAllowed(env) ∧ env.travelExternalLinks === true`。**production deny は `isPlanTravelLiveAllowed` から継承**（新 flag は AND の追加制約・bypass ではない）。

## 4. server action 挙動（§4）
- `"use server"` 維持。
- **permissioned FormData のみ**（event field のみ・`buildTravelSessionEventsFromFormData`）。
- **server-auth participant binding** 維持（auth context のみ）。
- **FormData から link 権限/`includeExternalLinks`/`externalLinksEnabled` を読まない**。
- server が **内部で gate から option を計算**（`isPlanTravelExternalLinksAllowed({ travelLive, planRouteLive, supabaseUrl, travelExternalLinks })`）。
- `buildTravelPlanDisplayResult({events, participantIds, viewerId}, {fixtureAllowed:false}, { includeExternalLinks })` を呼ぶ。
- provider not ready → adapter が engine/attach せず（display なし＝link なし）。
- ready ∧ gate allow → adapter が generated Maps hand-off を attach し得る。
- **display-safe action state のみ return**・**raw diagnostics なし**。
- ★ 注: step ① で既に `isPlanTravelLiveAllowed` 不許可は `unavailable` return。よって step ③ の `includeExternalLinks` は実質 `travelExternalLinks` flag の値（gate は既に true）。合成 predicate を使うと意図が明示でき production 防御も二重。

## 5. production deny（§5）
- **production deny は hard block 維持**。
- **`PLAN_TRAVEL_LIVE=true` でも production は `includeExternalLinks` を渡さない**（`isPlanTravelLiveAllowed` が production URL で false → step ① で unavailable・かつ合成 predicate も false）。
- **release 挙動変更なし**・**env write なし**・**production 有効化なし**。

## 6. preview flag との関係（§6）
- `PLAN_TRAVEL_PROJECTION_PREVIEW`（dev preview）は **production link を有効化しない**（合成 predicate は preview flag を参照しない）。
- dev preview route は別のまま。
- production live 経路は `PLAN_TRAVEL_LIVE` / 既存 live gate 条件 + 新 `travelExternalLinks` のみ。
- **新 public flag なし**。

## 7. link 種別（§7）
- 初の live link は **generated Maps 検索 hand-off のみ**。
- **manual URL 源は不在**・**manual intent 捏造なし**・**外部 retrieval なし**・**exact place 解決なし**・**Maps/Places API なし**・**URL fetch/read/scrape なし**・**booking/availability/price/route 主張なし**。

## 8. UI 挙動（§8）
- `TravelLivePanel` は既に `display.externalLinks` を consume。
- link section は adapter が attach した時のみ出る。
- link section は **CoAlter cue と別**のまま。
- **booking/calendar/action button なし**・**禁止 copy なし**・**raw URL text なし**（display-safe model 挙動以上を出さない）・**raw diagnostics なし**。

## 9. privacy（§9）
- adapter 抽出が **confirmed shared-safe destination** を強制済（B helper）。
- **private/participant destination label なし**・**private red_line/preference なし**・**raw userId を URL に入れない**・**M2/Stargazer data なし**・**participant/relationship state なし**・**client-only filtering なし**。

## 10. 将来 test（§10・実装時）
- gate off → action は `includeExternalLinks` を渡さず（或いは false）link 描画なし。
- preview flag のみ → link 有効化しない。
- production deny → live flag true でも `includeExternalLinks` false（合成 predicate / step ① で unavailable）。
- staging allow ∧ `travelExternalLinks`=true → `includeExternalLinks` true。
- provider not ready → engine/adapter 未実行・link なし。
- ready ∧ gate allow → adapter 経由で `display.externalLinks`。
- ready ∧ confirmed shared destination → external link section render。
- private/unconfirmed destination → link なし。
- action は **`includeExternalLinks`/link flag を FormData から読まない**。
- action は **raw diagnostics を出さない**。
- **Maps/Places API なし**・**URL fetch/read/scrape なし**・**DB/Supabase write なし**・**M2 runtime なし**・**CoAlter/useCoAlter なし**・**`/talk` なし**・**booking/calendar/action なし**。
- **tsc baseline 不変（55）**・既存 travel tests green（flag OFF で従来挙動）。

## 11. 実装オプション + 推奨（§11・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| A. option 計算だけ（source-contract test のみ） | 配線せず | 不足（点灯の検証なし） |
| B. 既存 gate に乗せて渡す + ready path test | 新 flag なし・`includeExternalLinks:true` | 単純だが panel と link を分離不可 |
| **C. 専用 server-only flag + 合成 predicate + action 配線 + gate matrix test** | `travelExternalLinks`(default OFF) ∧ `isPlanTravelLiveAllowed` | **◎ 推奨**（独立 kill・段階展開・規律一致・production deny 継承） |
| D. render distinction 後に実装 | — | 却下（distinction は link が出てから） |

**推奨実装スライス: C。**
1. **`PLAN_FLAGS.travelExternalLinks`** 追加（env `PLAN_TRAVEL_EXTERNAL_LINKS`・**server-only・NEXT_PUBLIC なし・default OFF**・flag 追加は CEO 承認案件＝本 GO に含める）。
2. **`isPlanTravelExternalLinksAllowed(env)`** 追加（`isPlanTravelLiveAllowed(env) ∧ env.travelExternalLinks===true`・pure・throw しない・production deny 継承）。
3. action: `const includeExternalLinks = isPlanTravelExternalLinksAllowed({ travelLive: PLAN_FLAGS.travelLive, planRouteLive: PLAN_FLAGS.planRouteLive, supabaseUrl, travelExternalLinks: PLAN_FLAGS.travelExternalLinks });` を計算し `buildTravelPlanDisplayResult(..., ..., { includeExternalLinks })` に渡す。
4. test: gate matrix（off/preview-only/production-deny/staging-allow×flag on-off/not-ready/ready-confirmed/private）+ source-contract（FormData 非読込・外部アクセスなし）。
```
// スケッチ（未実装）
// featureFlags.ts:  travelExternalLinks: process.env.PLAN_TRAVEL_EXTERNAL_LINKS === "true",
// plan-travel-live-gate.ts:
//   export function isPlanTravelExternalLinksAllowed(env: PlanTravelLiveEnv & { travelExternalLinks: boolean }): boolean {
//     return isPlanTravelLiveAllowed(env) && env.travelExternalLinks === true;
//   }
// travel-live.ts（step ③ 直前）:
//   const includeExternalLinks = isPlanTravelExternalLinksAllowed({
//     travelLive: PLAN_FLAGS.travelLive, planRouteLive: PLAN_FLAGS.planRouteLive,
//     supabaseUrl, travelExternalLinks: PLAN_FLAGS.travelExternalLinks,
//   });
//   const result = buildTravelPlanDisplayResult({ events, participantIds:[authUserId], viewerId:authUserId }, { fixtureAllowed:false }, { includeExternalLinks });
```
- **production deny 解除 / SQL-RLS / M2 / Tier1-C distinction は HOLD。**

## 12. Stop
- 本書（Server Action ExternalLinks Option Passing Design）で**停止**。
- option passing 実装は **CEO 承認まで行わない**（新 flag 追加含む）。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **server action option passing（docs-only）**。producer(C-E)+consumer(D-C) は wired・dormant。本 phase は **既存 live gate（staging のみ・production deny）下で点灯**させ staging で全経路を観測可能にする最小 ON。
- **★ B vs C（①③④）**: 既存 gate に乗る B は単純だが panel と link を分離不可。**専用 server-only flag を既存 gate に AND する C を推奨**（外部遷移は user-facing 新 capability・codebase の per-capability default-OFF gating 規律と一致・独立 kill + 段階展開・production deny は `isPlanTravelLiveAllowed` から継承・新 flag は AND の追加制約で bypass ではない）。
- **gate（③⑤）**: `isPlanTravelExternalLinksAllowed = isPlanTravelLiveAllowed ∧ travelExternalLinks`。production は flag ON でも常に false（既存 gate 継承 + step ① unavailable で二重防御）。preview flag は production link を有効化しない。NEXT_PUBLIC/client flag なし。
- **action（④）**: server が gate から option を内部計算・**FormData から flag/identity を読まない**・ready∧allow 時のみ adapter が generated Maps hand-off を attach・display-safe のみ return。
- **link/privacy（⑦⑨）**: 初 live link は generated Maps 検索のみ（manual なし・外部 retrieval/Maps API/fetch なし）。confirmed shared-safe destination のみ（adapter 抽出が強制）・private/userId/M2 なし。
- **推奨実装スライス**: **C — `travelExternalLinks`(server-only default OFF) + `isPlanTravelExternalLinksAllowed` predicate + action 配線 + gate matrix/source-contract test**。**production deny 解除 / SQL-RLS / M2 / Tier1-C distinction は HOLD。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
