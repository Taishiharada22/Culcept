# Production Deny Release Preconditions / Gate Matrix（docs-only）

> ★ これは **release ではない**。**解禁前提の監査 + gate matrix のみ**（docs-only・**flag/env 変更なし・SQL apply なし・persistence 実装なし・runtime 挙動変更なし・push なし**）。
> 設計フェーズ（phase-by-phase）。実 production 解禁（deny 解除）は **別 CEO GO**。
> 上位文脈: external link ladder 完成 + durable 安全 4 層（docs/RLS 設計・pure types・harness・SQL draft〔未 apply〕）。production deny は active のまま。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 1. まず前提を疑う（①）— これを今設計するか？
| 候補 | 評価 |
|---|---|
| **release preconditions / gate matrix（本書・docs-only）** | **推奨・次**。残りの release path 全体の「地図」を、risky な step（apply/repo/解禁）を踏む前に docs 化。zero risk・次の具体 step（staging smoke vs DB chain）を informed に選べる |
| local SQL smoke | 後（本 matrix が「durable beta の前提」と位置づける具体 step・apply は CEO GO） |
| real DB repository design | 後（同上・SQL apply 後） |
| M2 production merge | 後（CEO 既決で後） |
| staging link smoke | **本 matrix で「DB なしで visual gating を確認する最安 step」と位置づけ可**（次の具体 step 候補） |

**推奨: 本 preconditions/gate matrix を先に docs 化。** 根拠（①⑤⑧）: link/durable の部品は揃ったが、**production 解禁は最大 gate**。解禁の前提・段階・kill を**先に明文化**すれば、(i) 何が hard blocker か、(ii) 次の具体 step が staging smoke（安価・DB 不要）か DB chain（durable beta 必要時）か、を CEO が安全に選べる。**本 phase は解禁しない**。

---

## 2. 現 Travel live state（②）
- external link ladder 完成（Tier1-A〜C + Preparation + producer/consumer + gated option + render distinction）。
- producer（adapter attach・option 下）/ consumer（panel が `display.externalLinks` を render）結線済。
- server action option gate 結線済（`isPlanTravelExternalLinksAllowed`）。
- render distinction 完成（manual/generated 区別・検索 disclaimer）。
- durable SQL draft 存在（**未 apply**）・pure types・harness。
- **production deny は active**・**real DB persistence なし**・**SQL apply なし**・**generated types なし**・**real repository なし**・**M2 runtime off**・**CoAlter runtime off**・**production release なし**。

## 3. production 解禁前の hard blockers（③）
- SQL draft が **review 済**であること。
- **durable persistence が release 要件なら**: local apply smoke PASS / generated types review / **real DB repository 実装 + test** / **RLS smoke PASS**。
- **forbidden field が永続されない**（authoritative/raw output/display/diagnostics/href/generatedUrl/availability/price）。
- production env が **dev_fixture を露出しない**（provider gate `fixtureAllowed:false` 維持）。
- production が **preview flag を使わない**（`travelProjectionPreview` は production live を有効化しない）。
- M2 runtime は **off**（別承認まで）。
- CoAlter runtime は **off**（別承認まで）。
- booking/calendar/action は **off**。
- `/talk` は **無関係**（依存しない）。
- Maps/Places API・external retrieval は **off**。

## 4. release gate カテゴリ（§4）
| | カテゴリ | 内容 |
|---|---|---|
| A | code readiness | tsc 55・全 suite green・source-contract grep |
| B | data/persistence readiness | SQL apply / generated types / real repo / RLS smoke（durable beta 時） |
| C | privacy/RLS readiness | owner-only RLS smoke・private 非露出・client-only filtering なし |
| D | UI/copy readiness | 禁止 copy なし・検索/manual 区別・exact-place/availability 主張なし |
| E | external link safety | inert/generated 区別・href は recompute・fetch/preview なし・tracking なし |
| F | observability/smoke | staging gate off/on 挙動・not-ready/ready・generated handoff copy |
| G | rollback/kill switch | flag off で即停止・production deny が最終 brake |
| H | production env config | URL=production deny・flag 設定方針・NEXT_PUBLIC travel flag なし |

## 5. flag matrix（§5）
flags（全 server-only・NEXT_PUBLIC なし・default OFF）: `PLAN_TRAVEL_LIVE`(travelLive) / `PLAN_ROUTE_LIVE`(planRouteLive) / `PLAN_TRAVEL_EXTERNAL_LINKS`(travelExternalLinks) / `PLAN_TRAVEL_PROJECTION_PREVIEW`(travelProjectionPreview・**別軸 dev preview**)。

| env | travelLive | planRouteLive | externalLinks | 結果 |
|---|---|---|---|---|
| **production URL** | 任意 | 任意 | 任意 | **全 DENY**（`isPlanTravelLiveAllowed` が `!production` で false・最終 brake） |
| staging URL | F | * | * | live なし |
| staging URL | T | F | * | live なし（planRouteLive 必須） |
| staging URL | T | T | F | **live panel あり・external links なし** |
| staging URL | T | T | T | **live panel + external links あり** |
| 任意 | — | — | — | `travelProjectionPreview` は **dev preview route のみ**・live/external を有効化しない（独立） |

- **必ず false に保つ（production）**: 全 travel live（production URL で gate が deny）。
- **preview flag は production live を有効化しない**（`isPlanTravelLiveAllowed` は preview を参照しない）。
- **external links は live gate に従属**（`isPlanTravelExternalLinksAllowed = isPlanTravelLiveAllowed ∧ travelExternalLinks`）。
- **production deny は全てを override**（現状）。

## 6. 現在 required な挙動（§6）
- production deny true → **production travel live なし**。
- staging/local は **明示 flag 設定時のみ** smoke。
- external links は **live gate ∧ external link gate 両 true のときのみ**。
- **booking/calendar/action button なし**・**exact-place/availability 主張なし**・**raw diagnostics なし**・**authoritative packet を client に出さない**・**raw engine output を client に出さない**。

## 7. release 前に smoke できること（§7・DB なしで可）
- staging/live gate **off** 挙動（panel 不在）。
- staging/live gate **on** 挙動（panel + form）。
- external link gate **off** 挙動（link section なし）。
- external link gate **on** 挙動（confirmed shared destination で検索 hand-off）。
- missing destination/date の **not-ready** 状態。
- ready confirmed destination 状態。
- generated Maps 検索 hand-off copy（「検索」badge + 検索 disclaimer）。
- **禁止 copy なし**・**raw diagnostics なし**・**raw userId なし**・**CoAlter/useCoAlter なし**・**`/talk` なし**・**persistence off なら DB write なし**。

## 8. persistence が要件なら release できないもの（§8）
- durable session persistence **未実装**。
- SQL **未 apply**・generated types **なし**・real repository **なし**。
- → **refresh で結果が消える**（recompute 源〔保存された input intent〕が無いため）。
- **production release は、これが解決されるか、または「ephemeral-only beta」を CEO が明示受容するまで block**。

## 9. 可能な release mode（§9・risk 比較）
| mode | 内容 | risk | 評価 |
|---|---|---|---|
| A. no release / dev-only | 現状維持 | なし | status quo |
| **B. staging-only smoke** | staging で flag 設定し gating/render を観測 | 低（staging・gated・production 非接触・persistence off なら DB write なし） | **◎ 次の最安・推奨** |
| C. production hidden flag・deny remains | production に flag を置くが gate が deny | 低（**何も露出しない**＝現状と実質同じ・価値小） | 不要 |
| D. production ephemeral beta（DB なし） | **production deny を解除**・但し persistence なし | 中〜高（**refresh で全消失＝UX 劣化**・data leak は display-safe ゆえ低・だが deny 解除は最終 brake を外す） | 不可（ephemeral UX 受容 + 全 gate green まで） |
| E. production durable beta（DB/RLS/repo 後） | persistence chain 完了後に解禁 | 高い前提（apply/types/repo/RLS smoke + deny 解除） | **最終目標**（最良 UX・最大前提） |

**推奨される最安 permitted mode（次）: B（staging-only smoke）。** production（D/E）は §3/§8 の hard blocker が解けるまで block。

## 10. rollback / kill switch（§10）
- **`PLAN_TRAVEL_LIVE` を off** → live panel + external links 即停止（external は従属ゆえ連動）。
- **`PLAN_TRAVEL_EXTERNAL_LINKS` を off** → external links のみ停止（panel は残せる）。
- **production deny が最終 brake**（URL ベース・flag に依らず production を deny）。
- **apply していなければ DB rollback 不要**。
- 後で DB apply する場合の rollback: **新規 3 table の DROP のみ**（既存非接触・additive ゆえ）を document。

## 11. release readiness checklist（§11）
- [ ] tests / tsc 55 / 全 suite green。
- [ ] source-contract grep（forbidden 不在）。
- [ ] **NEXT_PUBLIC travel live flag なし**（全 server-only）。
- [ ] **service_role runtime write なし**。
- [ ] 禁止 copy なし・raw diagnostics なし。
- [ ] RLS smoke（**DB apply 時のみ**）。
- [ ] staging smoke（gate off/on・external off/on・not-ready/ready）。
- [ ] rollback path（flag off + production deny + 〔apply 時〕table DROP）。
- [ ] **CEO GO まで push なし・解禁なし**。

## 12. 推奨（§12・明示）
- **production を今は解禁しない**（production deny 維持）。
- 次の実装は:
  - **durable beta が要件**なら → **local SQL apply smoke**（CEO migration GO 必須）→ generated types → **real DB repository 実装 + test** → **RLS smoke**。
  - **visual gating の確認のみ**で十分なら → **staging link smoke（mode B・DB 不要）**が permitted。
- **staging link smoke は DB なしで許容**（gating/render の可視確認）。production 解禁（D/E）は §3/§8 が green になるまで block。
- ★ CEO 決定が要る分岐: 「**ephemeral beta を許容するか**（refresh 消失を beta として受容）」 vs 「**durable beta まで待つか**（persistence chain を先に通す）」。これが次の release path を決める。

## 13. Stop
- 本書（docs-only report）で**停止**。
- release を実装しない・**flag/env を変更しない**・SQL を apply しない・push しない。

---

## 出力サマリ
- **本 phase の性質**: release ではなく **解禁前提の監査 + gate matrix**（docs-only・解禁/apply/flag-env 変更/push なし）。
- **flag matrix（核）**: production URL → **全 travel live DENY**（最終 brake・flag 不問）。staging → travelLive∧planRouteLive で panel、+travelExternalLinks で links（**external は live gate に従属**）。**preview flag は live を有効化しない**（独立軸）。全 flag server-only・default OFF・NEXT_PUBLIC なし。
- **hard blockers（§3/§8）**: durable persistence が要件なら SQL apply/generated types/real repo/RLS smoke が未済＝**refresh で消失**ゆえ production release は block。forbidden field 非永続・dev_fixture 非露出・M2/CoAlter/booking/Maps/retrieval off。
- **release mode 推奨**: 最安 permitted = **B（staging-only smoke・DB 不要・production 非接触）**。C は無価値（deny で非露出）。D（production ephemeral・DB なし）は deny 解除 + UX 受容まで不可。E（production durable）は persistence chain + deny 解除の最終目標。
- **kill/rollback**: `PLAN_TRAVEL_LIVE`/`PLAN_TRAVEL_EXTERNAL_LINKS` off で即停止・production deny が最終 brake・未 apply なら DB rollback 不要。
- **次の CEO 決定**: 「ephemeral beta 受容（refresh 消失）」か「durable beta まで待つ（persistence chain）」かで次の具体 step（staging smoke vs local apply→repo→RLS smoke）が決まる。**production 解禁は本 phase で行わない。**
- 本フェーズは **docs-only** — コード/型/テスト/SQL/flag/env 不変・tsc 55・push なし・production 非接触。
