# RJ2g-0 — Internal Dogfood Preview Boundary Design（設計提出のみ・コード禁止・UI 実装は別 GO）

- 日付: 2026-06-14 / 作成: surface dogfood preview 境界設計セッション
- 位置づけ: RJ2 chain（RJ2a–2f）の出力を、**CEO 本人の dogfood 用に read-only / local / pull / no-notification / no-production** で確認する最初の preview 境界を設計する。
- 正本: `docs/reality-surface-chain-closeout-rj2.md`（RJ2-CLOSEOUT）+ 既存 dev-preview 先例 `docs/reality-pipeline-dev-preview-design.md`。
- 規律: **コードを書かない**（docs-only）。**UI 実装には進まない**（§8 で別 GO）。production / deploy / push / notification 解放なし。
- 検証根拠（read-only 監査・2026-06-14 実測）: §6 の候補は実コードベースを `find`/`grep`/`head` で確認した実在ルートに基づく。

---

## 0. 前提を疑う（CEO ① — 既存に「正解の型」が既にある）

**車輪を再発明しない（CEO ③ シンプルから）。** read-only 監査の結果、**既に同型の dev-preview が存在する**:
- `app/(culcept)/plan/dev-reality-pipeline/page.tsx` … 「operator-only / dev-preview / read-only / no-apply / no-write / no-seed / not user-facing」の Reality Pipeline preview。
- **三重ガード** `isCandidateActionsPreviewHostAllowed`（`lib/plan/reality/candidateActionsPreviewHost.ts`）: ① host opt-in（`REALITY_CANDIDATE_ACTIONS_DEV_HOST==="true"`・既定 false で dormant）② staging ref 含む ③ production ref 含まない → いずれか NG で `notFound()`。**production で構造的に不可視**。
- **flag** `PLAN_FLAGS`（`lib/plan/featureFlags.ts`・**server-side のみ**・`NEXT_PUBLIC_` なし・default false・本番有効化は CEO 承認 env）。
- **operator auth**（`supabaseServer` anon+auth・owner-RLS・**service_role 禁止**）。
- **client には envelope 要約 + count(meta) のみ渡す**（raw row / 内部実体を client に渡さない）。

**裁定: RJ2g はこの先例を踏襲する**（新規発明でなく proven pattern の複製）。dev-only route `/plan/dev-reality-surface`（または既存 `dev-reality-pipeline` の sibling）に、RJ2 chain 出力（RJ2d consumer view / RJ2e copy / RJ2f delivery 可否）を **同じ三重ガード + 新 flag + operator auth + safe-only-to-client** で read-only 表示する。これが最小リスク・実証済み・CEO「dev-only route 最有力」と一致。

---

## 1. preview 目的

- CEO 本人（operator）が、**自分のデータ**に対して RJ2 chain が「何を surface 化し・どんな文面になり・配信可否をどう判断したか」を **観測するだけ**の read-only 面。
- **plan を書き換えない・通知しない・apply しない・production でない・user-facing でない**。
- dogfood = 「自分って、そういう判断をされるのか」を CEO が確かめ、RJ2 chain の体感品質をフィードバックする入口。

---

## 2. UI が読んでよい / 読んではいけない object

### 2.1 UI（client）が読んでよい（safe-by-construction）

| object | 安全根拠 |
|---|---|
| `SurfaceProjectionConsumerViewV0`（RJ2d） | category-free / verdict-free / opaque ref / trace・id・metadata なし（RJ2d allowlist 構築 + serialization backstop 済） |
| `RenderedCopyV0`（RJ2e） | exact catalog 文面のみ（CEO 承認済・dynamic interpolation なし・copyViolations 済） |
| **delivery safe summary**（RJ2f `DeliveryDecisionV0` の**安全 subset**） | `eligibility` / `channelCeiling` / `deliveredNow`（値は no_delivery/in_app_passive_eligible/none/in_app_passive/false・forbidden token を含まない）のみ |

> **注（CEO の DeliveryDecisionV0 readable を精密化）**: `DeliveryDecisionV0` は **server が読んでよい**が、`suppressedReasons`（evidenceRefs/reason code）・`carriedDecisionKind`・`trace` は **client に渡さない**（forbidden token を含み得る）。client へは **safe subset（eligibility/channelCeiling/deliveredNow）のみ**を渡し、最終 payload を §5 token leak guard に通す。

### 2.2 UI が読んではいけない（internal・server 内に留める）

`JudgmentSurfacePlanV0`（RJ2a）/ `SurfaceClaimSetV0`・`BoundSurfaceV0`（RJ2b）/ `ClarificationQuestionSetV0`（RJ2c）/ `SurfaceProjectionInternalBundleV0`（RJ2d）/ `DeliveryDecisionV0` の internal 部（suppressedReasons/carriedDecisionKind/trace）/ evidenceRefs / sourceRefs / missingInputRefs / graphViewerKey / raw node id（ern:/cl:/q:/sp:/pj:）/ 全 internal trace。

> **接続規律**: UI は `deriveSurfacePlan`/`deriveSurfaceClaims`/… を呼ばず、**server component が chain を実行**し、client component には **§2.1 の safe object のみ**を props で渡す（既存 dev-reality-pipeline と同型：「client には meta のみ」）。

---

## 3. read-only 不変条件

- **no DB write / no Supabase write**（select のみ・insert/update/delete/upsert/seed なし）
- **no API 追加**（新規 route handler を作らない・server component 内で read+pure 実行）
- **no localStorage write**
- **no notification / no push / no external communication**
- **no action / write / send / book / pay**
- **no schedule mutation / no plan apply / no permission relaxation**
- **service_role 禁止**（operator auth・owner-RLS のみ）
- 既存 anchor / snapshot は **read のみ**。RJ2 chain は pure（副作用なし）。

---

## 4. pull surface のみ不変条件

- ユーザー（operator）が **route を開いたとき**だけ見える（pull）。
- **push しない / notification しない / chat しない / external contact しない**。
- **`deliveredNow=false` を維持**（RJ2f の kill-switch をそのまま尊重・preview は配信でない）。
- **`in_app_passive_eligible` は「表示候補」であって配信命令ではない**（preview はそれを「表示してよい候補」として render するだけ）。

---

## 5. feature flag / dev gate 方針（既存 PLAN_FLAGS パターン踏襲）

- **新 flag**（例 `PLAN_FLAGS.realitySurfacePreview` = `process.env.REALITY_SURFACE_PREVIEW === "true"`）。**server-side のみ**（`NEXT_PUBLIC_` なし）・**default OFF**・本番有効化は CEO 承認 env。
- **三重ガード**（既存 `isCandidateActionsPreviewHostAllowed` を流用 or 同型）: ① host opt-in env ② staging ref 含む ③ production ref 含まない → いずれか NG で `notFound()`。**production hard block**。
- **operator auth**: `supabaseServer`（anon+auth・owner-RLS）。非 operator は Disabled 表示（chain を走らせない）。
- **OFF 時 DOM 差分ゼロ**: flag OFF / 非 operator / 非 staging のとき `notFound()` または `Disabled` で **chain を実行しない・client を render しない**（既存 dev-reality-pipeline の `Disabled` 同型）。production の通常 UI に**一切影響しない**。
- **preview data なし時**: 何も出さない or debug placeholder のみ（raw を出さない）。
- **ON 時も read-only**（§3）。

---

## 6. 最初の preview 候補比較（read-only 監査済・実在ルート）

| option | 実在 | pros | cons | risk | recommendation |
|---|---|---|---|---|---|
| **dev-only route（`/plan/dev-reality-surface`・dev-reality-pipeline sibling）** | `app/(culcept)/plan/dev-*` 多数 + `dev-reality-pipeline` 先例あり | **proven pattern 流用**（三重ガード/flag/operator auth/meta-only 既存）・安全に隔離・production hard block | 実体験から少し遠い | **低** | **★最有力（採用推奨）** |
| Alter tab 内 dev-only panel | `app/(culcept)/talk` / `plan/components/alter` 実在 | 既存 Reality 文脈に近い | 表面が汚れる・user-facing UI に近接 | 中 | 補助（後段） |
| `/plan` debug section | `app/(culcept)/plan/page.tsx` 実在 | 検証しやすい | product UI に近い・誤露出リスク | 中 | 不採用（v0） |
| Story/test fixture only | tests/unit 実在（101 PASS） | 最安全 | dogfood にならない（実データなし） | 低 | 補助（回帰） |

**推奨: dev-only route（dev-reality-pipeline pattern の sibling `/plan/dev-reality-surface`）**。理由: ①既存の三重ガード/flag/operator auth/meta-only-to-client が proven（再発明しない・CEO ③）②production 構造的不可視③隔離で誤露出リスク最小。Story/test fixture は回帰補助として併用。

---

## 7. token leak guard（preview 表示で出さない・既存 backstop 流用）

preview の **最終 render payload**（client に渡る全 string）に以下が出ないことを保証（RJ2d/RJ2e の serialization backstop を流用）:
`ern:` / `cl:` / `q:` / `sp:` / `pj:` / `snapshot` / `evidence` / `sourceRefs` / `missingInput` / `trace` / `gate` / `derivedFrom` / `why` / `sensitive` / `reservation` / `work` / `otherPeople` / `confirmed` / `inferred` / `graphViewerKey`。

- **二重保証**: ① §2.1 の safe object のみを client に渡す（internal を構造的に渡さない）② 渡す直前に `JSON.stringify(payload)` を token scan し、検出時は **render を中止**（fail-closed・debug placeholder のみ）。
- RJ2d `surfaceProjectionConsumerViewViolations` / RJ2e `copyViolations` を **preview でも再実行**（unsafe なら render しない・RJ2e の view precheck 同型）。

---

## 8. RJ2g（UI 実装）GO 条件（別 GO・CEO 承認後）

1. **dev-only route 新設**（`/plan/dev-reality-surface`・dev-reality-pipeline pattern 流用）。**新規 UI を product 導線に出さない**。
2. **三重ガード + 新 flag（default OFF）+ operator auth**（§5）。production hard block・非 operator Disabled。
3. **read-only**（§3・no write/seed/apply/notification/push/external/action）。
4. **client には §2.1 safe object のみ**（internal object/trace を渡さない・§2.2）。
5. **token leak guard**（§7・safe object 限定 + serialization backstop + walker 再実行）。
6. **pull-only**（§4・deliveredNow=false 維持・push/notification なし）。
7. **OFF 時 DOM 差分ゼロ**（production UI 不変）。
8. tests: gate（flag OFF/非 operator/production → notFound/Disabled・chain 非実行）/ safe-object-only（client payload に internal field なし）/ token leak guard / read-only（write 0）/ build PASS。
9. **不接触確認**: 既存 RJ2a–2f 6 module 不接触（consume only）・DB write 0・API 追加 0・notification 0・production gate 未通過。

> **重要**: RJ2g-0 完了時点で**勝手に UI 実装に進まない**。CEO の RJ2g 実装 GO を待つ。

---

## 9. Department Responsibility Matrix（RJ2g-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Build**（dev preview の技術安全）+ **Product**（dogfood 体験） |
| consultedDepartments | Communication（surface 出力）・Permission（operator auth/露出可否） |
| blockingDepartments | **CEO**（flag 有効化・dogfood 範囲・production は別 gate）+ Permission |
| outputs | RJ2g-0 設計（preview 目的・read/no-read object・read-only/pull-only 不変条件・flag/dev gate・token leak guard・候補比較・推奨・GO 条件）。**コードなし** |
| safetyGate | **read-only**（write/seed/apply/notification/push/external/action なし）・**pull-only**（deliveredNow=false 維持）・**三重ガード + flag default OFF + operator auth**（production 構造的不可視）・**client は safe object のみ**（internal/trace 非露出）・**token leak guard**（serialization backstop + walker 再実行）・OFF 時 DOM 差分ゼロ・service_role 禁止・**production gate 未通過** |
| traceRefs | RJ2d consumerView / RJ2e copy / RJ2f delivery safe summary のみ（internal id/trace なし） |

---

## 10. 自己判定（RJ2g UI 実装に進めるか）

- **判定: RJ2g は設計 ready**。**既存 dev-reality-pipeline pattern を流用**するため設計リスクは低い。preview 目的・read/no-read object（§2）・read-only/pull-only 不変条件（§3/§4）・flag/dev gate（§5・三重ガード+default OFF+operator auth）・token leak guard（§7）・候補比較と推奨（§6・dev-only route）・GO 条件（§8）が確定。
- **ただし UI 実装 GO は CEO 専管**。本書は UI を自己承認しない。**RJ2g-0 の CEO 確認 → RJ2g 実装 GO** の順。flag 有効化・dogfood 範囲・production は CEO + 別 gate。
- 革新点（CEO ⑦）: **dogfood も「沈黙の設計」を崩さない** — preview は pull-only・deliveredNow=false・production 構造的不可視で、「確認はするが届けない」を dev 段でも貫く。proven pattern 流用で安全に最初の体感に繋ぐ。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read 不接触・tree clean・production gate 未通過。
