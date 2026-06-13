# RJ2f-0 — Notification / Contact Boundary Design（設計提出のみ・コード禁止・実装は CEO + production gate）

- 日付: 2026-06-14 / 作成: notification boundary 設計セッション
- 位置づけ: RJ2f で扱う **通知 / 接触 / 配信境界**の解放可否・active_prompt / deliveryModeCeiling 意味論・push/chat/in-app 分離・permission gate・fatigue・production gate の **設計境界をコードを書く前に確定**する設計書。
- 正本: `docs/reality-judgment-surface-boundary-rj2-0.md`（RJ2-0/RJ2-0A・G5 DELIVERY・INV-11 active_prompt 非配信）。上流 = RJ2c/2d/2e（confirmation/projection/copy）+ InterventionDecision（contactPolicy / deliveryModeCeiling）。
- 規律: **コードを書かない**。本書は設計提出のみ。**RJ2f は通知/接触/外部送信ゆえ実装に三重 gate（①技術安全 ②CEO による通知方針承認 ③production gate）が必要**。RJ2f-0 完了時点で勝手に実装に進まない。
- 範囲: RJ2f は **配信「可否」境界（解放するか・gate・fatigue・channel 分離）の設計のみ**。**実配信（push/外部/自動送信）は v0 で解放しない**。
- **RJ2f-0A 改訂（2026-06-14）**: CEO 監査で型と裁定の矛盾を補正。①`DeliveryChannel` 型に push/chat/external を入れていたのは「型にも経路にも持たせない」裁定と矛盾 → **`DeliveryChannelV0 = "none" | "in_app_passive"` に閉じる**（push/chat/external は runtime type から除外し future backlog へ・§11.1）。②`in_app_passive_eligible` の意味論を強く固定（**pull surface であって通知/push/dispatch でない**・deliveredNow=false と常に両立・§11.2）。③`deliveryModeCeiling` を既存 enum（`none`/`passive_surface`/`active_prompt`・`interventionDecision.ts:48`）と照合・unknown/unsupported ceiling は conservative に no_delivery（§11.3）。④opt-in を **`userInAppSurfaceOptIn`（案 A）にリネーム**（notification opt-in と in-app passive 表示を分離・§11.4）。詳細は §11（§2/§3 に優先）。

---

## 0. 前提を疑う（CEO ① — RJ2f の核心と「最も解放してはいけない層」）

**RJ2f は最も外向き・最も影響が大きい層。** RJ2a–2e は全て「内部判断 → 構造 → 文面」までで、**ユーザーに能動的に届けていない**（pull = ユーザーがアプリを開いたとき in-app に出る、まで）。RJ2f は初めて「**システムから能動的に届ける**」可能性を扱う（push / chat / 外部）。誤った通知は**信頼を直接破壊**し、CLAUDE.md 運用規約で「ユーザーへの一斉通知・メール送信」は CEO 承認必須。

**裁定（前提を疑う）: v0 は通知/接触/外部送信を解放しない。** これまでの全 slice が `contactPolicy`/`deliveryModeCeiling` を **将来の上限であって配信命令でない**（v0 は配信しない）と固定してきた（RC2c-2 / INV-11）。RJ2f-0 もこれを踏襲し、**v0 = 無配信（kill-switch OFF）**。RJ2f が実装するのは「配信可否の判定 gate」であって配信そのものではない。実 push/外部送信は CEO + production gate まで HOLD。

**pull vs push の線引き（核心）.** 
- **in-app passive（pull・v0 で唯一許容され得る）**: ユーザーがアプリを開いたとき、RJ2e の文面を in-app に**受動表示**する。システムは能動的に届けない。これは「通知」ではない。
- **push / chat / 外部（HOLD）**: システム能動・端末通知・外部連絡。**v0 で一切しない**。CEO + production gate。

**革新点（CEO ⑦）: 「届けない」を構造化する。** 多くのプロダクトは通知過多で信頼を失う。Aneurasync は逆に「**沈黙を設計の中心**」に置く（silent/observe は通知しない・抑制が一級の出力）。RJ2f は「いつ届けないか」を gate で機械化し、fatigue を構造的に防ぐ。

---

## 1. 対象ファイル案（実装は CEO + production gate 後）

| 区分 | ファイル | 内容 |
|---|---|---|
| **追加（GO 後）** | `lib/plan/realityCore/deliveryGate.ts` | 型 + `evaluateDeliveryEligibility`（配信可否のみ・**v0 は常に no_delivery**）+ `deliveryGateViolations` + `DELIVERY_GATE_VERSION` |
| **追加（GO 後）** | `tests/unit/deliveryGate.test.ts` | §6 fixtures |
| **変更** | `docs/reality-department-matrix.md` | RJ2f §5 適用記録（実装完了時） |
| **触らない（不接触）** | RJ2a–2e 5 ファイル + 既存 6 判断器 + ern/cs/mv/snapshot/identity | consume のみ |
| **触らない** | UI / app / API route / migration / supabase / localStorage / 外部 push SDK | 一切不接触（**特に push/通知 SDK は v0 で配線しない**） |

**方針**: RJ2f は **配信可否の pure 判定**のみ。実際の push/通知送信の副作用は core に持たせない（core は「可否」を返すだけ・送信は将来の配信層 + CEO + production）。

---

## 2. 実装する型の確定（設計・GO 後に実装）

```ts
export const DELIVERY_GATE_VERSION = 0;

/** 配信 channel（**RJ2f-0A: v0 runtime type を閉じる**・push/chat/external は型に持たせない・future backlog §11.1） */
export type DeliveryChannelV0 = "none" | "in_app_passive";
// push / chat / external は **runtime type に存在させない**（型レベルで経路遮断）。将来解放時に別型 + CEO + production gate

/**
 * 配信可否（v0 は常に no_delivery・kill-switch OFF）。
 * **in_app_passive_eligible は通知ではない**（§11.2）: pull surface = user がアプリを開いた時に表示してよい候補であって、
 * push / notification / chat / external contact / dispatch instruction では**ない**。deliveredNow=false と常に両立。
 */
export type DeliveryEligibilityV0 = "no_delivery" | "in_app_passive_eligible";
// push_eligible / chat_eligible / external_eligible は **型に存在させない**（v0 で構造遮断）

export interface DeliveryDecisionV0 {
  readonly schemaVersion: 0;
  readonly eligibility: DeliveryEligibilityV0;     // **v0 既定 no_delivery**（in_app_passive_eligible は pull surface・通知でない）
  readonly channelCeiling: DeliveryChannelV0;      // 将来上限（v0 は none / 最大 in_app_passive）。配信命令でない・push/chat/external 型に無し
  readonly deliveredNow: false;                    // **v0 固定**: 実配信しない（kill-switch）
  readonly suppressedReasons: ReadonlyArray<FeasibilityReason>; // なぜ届けないか（silent/observe/opt-out/fatigue/HOLD）
  readonly requiresInAppSurfaceOptIn: boolean;     // in-app passive 表示には明示 opt-in 必須（notification opt-in ではない・§11.4）
  readonly nextEligibleAfter: number | null;       // fatigue: 次に検討してよい主観分（observe 由来）
  readonly sourceRefs: {
    readonly interventionDecisionId: string;
    readonly snapshotId: string;
  };
  readonly trace: DeliveryGateTrace;
  // **push/external/dispatch/sendNow/recipient/payload/url/token field なし**（型に存在しない）
}

export function evaluateDeliveryEligibility(input: DeliveryGateInput): DeliveryDecisionV0;
export function deliveryGateViolations(d: DeliveryDecisionV0): string[];
```

`FeasibilityReason` は既存型を **import**。

### 2.1 RJ2f で **実装しない**（明示 defer / HOLD・最も厳格）

| 機能 | RJ2f での扱い |
|---|---|
| 実 push / 端末通知 / chat / 外部送信 | **HOLD（v0 で型にも経路にも持たせない）**。CEO + production gate |
| automatic send / 自動連絡 | **絶対 HOLD**。`deliveredNow` 常に false |
| recipient / payload / url / token / dispatch | **型に存在させない**（配信副作用を core に持ち込まない） |
| copy の通知転用 | **HOLD**。in_app_passive でユーザーが**開いたとき**表示するのみ（push に載せない） |
| 一斉通知 / メール | **CEO 承認必須 + production gate** |

---

## 3. `evaluateDeliveryEligibility` の入力 / 出力契約

### 3.1 入力

```ts
export interface DeliveryGateInput {
  readonly interventionDecision: InterventionDecisionV0;     // decisionKind / contactPolicy / deliveryModeCeiling
  readonly userInAppSurfaceOptIn: boolean;                   // **明示 opt-in**（既定 false）。**notification opt-in ではない**（§11.4・案 A）
  readonly recentSurfaceCount: number;                       // fatigue: 直近 in-app surface 数（外部から渡す・core は時刻を持たない）
  readonly surfaceBudgetRemaining: number;                   // fatigue: 残り surface 枠
}
```

- **opt-in と fatigue は外部入力**（core は I/O も時刻も持たない・pure）。opt-in 既定 false。`userInAppSurfaceOptIn` は **in-app passive 表示の許諾**であって push/notification 許諾ではない（権限境界を混ぜない・§11.4）。

### 3.2 出力（v0 制約・最も厳格）

`DeliveryDecisionV0`。**v0 で必ず守る**:
- `deliveredNow === false`（**kill-switch・実配信しない**）。
- `eligibility ∈ {no_delivery, in_app_passive_eligible}`（push/chat/external eligible は型に無い）。
- `channelCeiling` は最大 `in_app_passive`（push/chat/external を ceiling にしない）。
- **push/external/dispatch/sendNow/recipient/payload/url/token field なし**。
- silent/observe → `no_delivery`。ask_clarification ∧ opt-in ∧ fatigue OK のときのみ `in_app_passive_eligible`（それでも `deliveredNow=false`）。

### 3.3 導出ロジック（default-deny・沈黙を中心に）

既存 enum 照合（`interventionDecision.ts:48`）: `DeliveryModeCeiling = "none" | "passive_surface" | "active_prompt"`。
`active_prompt` は v0 で decision が生成しない（`:233` ask_clarification→`passive_surface`/他→`none`）。RJ2f は ceiling を
**命令でなく上限**として読み、`active_prompt` を配信に進ませない・**unknown/unsupported ceiling は conservative に no_delivery**。

```
// active_prompt 非配信（INV-11）・deliveryModeCeiling は ceiling であって命令でない
if decision.decisionKind ∈ {silent, blocked}:        eligibility = no_delivery（沈黙）
elif decision.decisionKind == observe:               eligibility = no_delivery（観測は届けない・nextEligibleAfter = decision.nextEvaluationAt）
elif decision.decisionKind == internal_prepare:      eligibility = no_delivery（内部準備は届けない）
elif decision.decisionKind == ask_clarification:
    if !userInAppSurfaceOptIn:                        eligibility = no_delivery（in-app surface opt-in なし）
    elif surfaceBudgetRemaining <= 0 or fatigue:      eligibility = no_delivery（fatigue cap）
    elif decision.deliveryModeCeiling == "passive_surface": eligibility = in_app_passive_eligible  // ceiling 一致時のみ・それでも deliveredNow=false
    else:                                             eligibility = no_delivery（"none"/"active_prompt"/unknown は conservative no_delivery）
else:                                                 eligibility = no_delivery（未知 decisionKind は conservative）
channelCeiling = (eligibility == in_app_passive_eligible) ? "in_app_passive" : "none"
deliveredNow = false   // **常に**（v0 kill-switch）
requiresInAppSurfaceOptIn = (decision.decisionKind == "ask_clarification")
```

`deliveryDecisionId = del:fnv64(canonical({d:interventionDecisionId, k:"delivery_gate", v:VERSION}))`。

---

## 4. gate pipeline 実装方針（RJ2f 担当 = 配信可否のみ・配信しない）

| gate | RJ2f 実装 |
|---|---|
| **G5 DELIVERY（可否のみ）** | 配信「可否」を判定。**実配信は v0 でしない**（deliveredNow=false）。silent/observe/internal_prepare/blocked → no_delivery |
| **active_prompt（INV-11）** | `deliveryModeCeiling=active_prompt` は **配信しない**（v0 は passive_surface 上限・active_prompt/push に進まない） |
| **opt-in gate** | opt-in なし → no_delivery（default-deny） |
| **fatigue gate** | budget/recent で over-notification を構造遮断 |
| **channel 分離** | push/chat/external は **型に存在させない**（in_app_passive のみ将来候補） |

**必須遵守**:
- **silent / observe を通知しない**（沈黙を中心に）。
- **active_prompt 非配信**（INV-11）・push/外部/自動送信なし。
- **opt-in 必須**（default-deny）。
- **fatigue cap**（over-notification 防止）。
- **deliveredNow 常に false**（v0 kill-switch・実配信は CEO + production）。
- recipient/payload/url/token/dispatch を型に持たせない（配信副作用を core に持ち込まない）。

---

## 5. `deliveryGateViolations` walker 設計（最小・空=適合）

1. `deliveredNow !== false`（v0 kill-switch 違反）
2. `eligibility` が {no_delivery, in_app_passive_eligible} 以外（push/chat/external eligible 混入）
3. silent/observe/internal_prepare/blocked decisionKind なのに `eligibility !== no_delivery`
4. ask_clarification ∧ `userInAppSurfaceOptIn` なし なのに `eligibility !== no_delivery`
5. `channelCeiling` が {none, in_app_passive} 以外（push/chat/external = 型に無いが構造 assert）
6. `deliveryModeCeiling=active_prompt`（または `none`/unknown）を eligible にしている（INV-11・conservative 違反）
7. fatigue（surfaceBudgetRemaining<=0）なのに eligible
8. push/external/dispatch/sendNow/recipient/payload/url/token/notification/contact field が型に存在（FORBIDDEN_FIELDS・構造 assert）
9. suppressedReasons の evidenceRefs 欠落

---

## 6. fixtures / tests 設計（テスト名・目的）

`tests/unit/deliveryGate.test.ts`（InterventionDecision + opt-in/fatigue → evaluateDeliveryEligibility → assert）。

| # | test 名 | 目的 |
|---|---|---|
| 1 | `silent → no_delivery・deliveredNow false` | 沈黙 |
| 2 | `observe → no_delivery・nextEligibleAfter 設定` | 観測は届けない |
| 3 | `internal_prepare → no_delivery` | 内部準備は届けない |
| 4 | `blocked → no_delivery` | ブロック |
| 5 | `ask_clarification + opt-in なし → no_delivery` | opt-in default-deny |
| 6 | `ask_clarification + opt-in + budget → in_app_passive_eligible・deliveredNow false` | 唯一の eligible でも配信しない |
| 7 | `ask_clarification + opt-in + budget 0 → no_delivery（fatigue）` | over-notification 遮断 |
| 8 | `deliveryModeCeiling active_prompt → 配信しない（INV-11）` | active_prompt 非配信 |
| 9 | `push/chat/external eligible が型に無い` | channel 構造遮断 |
| 10 | `deliveredNow 常に false（全 case）` | v0 kill-switch |
| 11 | `recipient/payload/url/token/dispatch/sendNow field が型に無い` | 配信副作用なし |
| 12 | `deliveryGateViolations: kill-switch/channel/INV-11/fatigue 違反 → 非空` | walker FAIL 再現 |
| 13 | `IO 不接触（source-scan）` | fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし |

---

## 7. HOLD 項目（RJ2f で実装しない・最も厳格）

- **実 push / 端末通知 / chat / 外部送信 / 自動送信**（CEO + production gate・型にも経路にも持たせない）
- **一斉通知 / メール**（CEO 承認必須）
- copy の push 転用（in_app_passive pull のみ）
- recipient / payload / url / token / dispatch / sendNow（配信副作用を core に持ち込まない）
- UI connection / API 追加 / DB・Supabase write / localStorage / migration / external read / location / action / write / send / book / pay / push SDK / PR / deploy

---

## 8. RJ2f 実装 GO 条件（**三重 gate**・CEO + production gate 後）

**技術 gate**:
1. **pure**: I/O・時刻 API・乱数・LLM・UI・push SDK なし。`deliveryGate.ts` は decision + opt-in/fatigue consume の読み取り専用。
2. **additive**: tsc baseline 維持（55）。**RJ2a–2e 5 ファイル不接触**。
3. **v0 制約**: `deliveredNow=false`（kill-switch）/ push/chat/external eligible 型に無し / active_prompt 非配信 / opt-in 必須 / fatigue cap / recipient/payload/dispatch field なし。
4. **walker §5** が全 fixture で機能（kill-switch/channel/INV-11/fatigue/opt-in/silent-observe 非通知）。
5. **全 fixture PASS**。full suite baseline FAIL 2 のみ（realityCore 外）。next build PASS。
6. **不接触確認**: UI/storage/API/DB/location/external read/push SDK 不接触。tree clean。

**ビジネス + production gate（CEO 専管）**:
7. **CEO による通知方針承認**（一斉通知・メール・push はブランド/信頼/法務事項）。
8. **production gate**: 実配信は本番環境設定 + opt-in インフラ + 法務（通知許諾）確認後。
9. **HOLD 維持**: 実 push/外部送信/自動送信に進まない（v0 は判定のみ）。

> **重要**: RJ2f-0 完了時点で**勝手に実装に進まない**。RJ2f は通知/接触ゆえ CEO の**三重 gate**承認を待つ。

---

## 9. Department Responsibility Matrix（RJ2f-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Communication**（配信可否境界の技術安全）+ **Ops**（通知運用）+ **CEO**（通知方針） |
| consultedDepartments | Permission（decisionKind/contactPolicy/deliveryModeCeiling）・Product（fatigue/体験）・Growth（トーン） |
| blockingDepartments | **CEO**（通知方針・一斉通知・法務）+ **Permission** + **production gate** |
| outputs | RJ2f-0 設計（解放可否・active_prompt/deliveryModeCeiling 意味論・channel 分離・opt-in/fatigue gate・三重 gate）。**コードなし** |
| safetyGate | **v0 無配信（deliveredNow=false・kill-switch）**・**`DeliveryChannelV0` を none/in_app_passive に閉じる**（push/chat/external を runtime type から除外・型レベル経路遮断）・**in_app_passive は pull surface であって通知でない**・**silent/observe を通知しない**（沈黙中心）・**active_prompt 非配信（INV-11）**・**unknown ceiling conservative no_delivery**・**`userInAppSurfaceOptIn` 必須（notification opt-in と分離・default-deny）**・**fatigue cap**（over-notification 遮断）・recipient/payload/dispatch/notification/contact を core に持たせない・no external communication・no automatic send・**CEO + production gate** |
| traceRefs | deliveryDecisionId / interventionDecisionId / snapshotId + suppressedReasons |

---

## 10. 自己判定（RJ2f 実装に進めるか）

- **判定: RJ2f は技術設計 ready（RJ2f-0A 補正後・実装は CEO + production 三重 gate 待ち）**。対象ファイル（新規 1 + test 1・RJ2a–2e 不接触）・型（DeliveryDecisionV0/**DeliveryChannelV0**[none/in_app_passive のみ]/**DeliveryEligibilityV0**・push/chat/external を型に持たせない）・evaluateDeliveryEligibility 入出力契約（decision + **userInAppSurfaceOptIn**/fatigue・**v0 常に no_delivery/deliveredNow false**）・gate（silent/observe 非通知・active_prompt 非配信・unknown ceiling conservative・opt-in・fatigue）・walker（9）・fixtures（13）・HOLD・GO 三重 gate が確定。
- **RJ2f 実装 GO は CEO 専管かつ三重 gate**: ①技術安全 ②通知方針承認 ③production gate。RJ2f は判定のみ実装し、**実配信は別途 CEO + production**。
- 革新点（CEO ⑦）: **沈黙を設計の中心に**。silent/observe を構造的に通知せず、opt-in default-deny + fatigue cap で over-notification を機械的に防ぐ。「届けない」を一級の出力にすることが、通知過多で信頼を失う他プロダクトとの差別化。
- **RJ2 surface chain の終端**: RJ2a(plan)→2b(claim)→2c(question)→2d(projection)→2e(copy)→**2f(delivery 可否)** で「内部判断 → 安全な外向き境界」が一通り設計確定。実配信のみ CEO + production gate に残る。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read/push SDK 不接触・tree clean・production gate 未通過。

---

## 11. RJ2f-0A 補正サマリ（CEO 監査・Channel Type / Pull Surface Semantics closeout）

### 11.1 `DeliveryChannelV0` を閉じる + push/chat/external を runtime type から除外（CEO #1）

- **矛盾**: 本文で「push/chat/external は型にも経路にも持たせない」と裁定しながら `DeliveryChannel` union に含めていた。
- **修正**: **`DeliveryChannelV0 = "none" | "in_app_passive"`**。push/chat/external は **runtime type に存在させない**（型レベルで経路遮断）。
- **future backlog（docs のみ・型にしない）**: 将来 push/chat/external を解放する際は **別型 `DeliveryChannelVn` + CEO 通知方針承認 + production gate + 法務（通知許諾）**。v0 の型には絶対入れない。

### 11.2 `in_app_passive_eligible` の意味論（CEO #2・強く固定）

- `in_app_passive` は **pull surface**: user が**アプリを開いた時**に表示してよい候補。
- **push / notification / chat / external contact では`ない`**。**dispatch instruction でも`ない`**。
- **`deliveredNow=false` と常に両立**（eligible でも実配信しない）。
- **notification permission とは別概念**（§11.4 の opt-in 分離）。
- 名称は `in_app_passive_eligible` を維持（既存 `deliveryModeCeiling="passive_surface"` と語彙整合）。意味論は上記で固定。

### 11.3 `deliveryModeCeiling` / `active_prompt` の照合（CEO #3）

- 既存 enum（`interventionDecision.ts:48`）: `DeliveryModeCeiling = "none" | "passive_surface" | "active_prompt"`。**実在しない enum 名を使わない**（`passive_surface` は実在・`:233` で ask_clarification のみ生成）。
- `active_prompt` を **delivery command にしない**。v0 で active_prompt を push/chat/notification へ進ませない（INV-11）。
- `deliveryModeCeiling` は **上限であって命令でない**。
- **unknown / unsupported ceiling は conservative に `no_delivery`**（`"none"`/`"active_prompt"`/未知 → no_delivery。`"passive_surface"` のときのみ in_app_passive_eligible 候補）。

### 11.4 opt-in naming 再裁定（CEO #4 = 案 A 採用）

- **`userNotificationOptIn` → `userInAppSurfaceOptIn` にリネーム**（案 A）。
- 理由: v0 は notification をしない。**notification opt-in と in-app passive 表示は別概念**。将来 push を解放する際に権限境界が混ざると危険。
- `userInAppSurfaceOptIn` は **in-app passive 表示の許諾**であって push/notification 許諾ではない。`requiresUserOptIn` → `requiresInAppSurfaceOptIn` に対応リネーム。
- notification opt-in（push 許諾）は将来 push 解放時の**別フィールド + 別 gate**（v0 では定義しない）。

### 11.5 `deliveredNow=false` 不変条件 + v0 で notification/contact/push/external が型にも経路にも存在しない確認

- **`deliveredNow === false` を v0 で常に固定**（kill-switch）。walker #1 が `!== false` を FAIL。
- v0 の型・経路に **push/chat/external/notification/contact/dispatch/sendNow/recipient/payload/url/token が存在しない**（`DeliveryChannelV0` 2 値・`DeliveryEligibilityV0` 2 値・FORBIDDEN_FIELDS 構造 assert）。push SDK 不配線。

### 11.6 RJ2f 実装 GO 可否の自己判定

- **判定: RJ2f は技術設計 ready（補正後・内部無矛盾）**。型を v0 用に閉じ（push/chat/external を runtime type から除外）、pull surface 意味論を固定し、opt-in を in-app surface 用にリネームし、deliveryModeCeiling を既存 enum と照合（unknown conservative）。
- **RJ2f 実装 GO は CEO 専管かつ三重 gate**（技術 + 通知方針承認 + production gate）。RJ2f-0A の CEO 確認 → RJ2f 実装 GO の順。実配信は別途 CEO + production。
