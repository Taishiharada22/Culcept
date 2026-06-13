# T11-C3 — Construct Rollup Wiring 計画（fit-core への安全な配線・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only・CEO プロセス: 設計→監査→承認後 additive 実装）。
**位置づけ**: T11-B2/C2/D2（[`fit-constructs.ts`](../lib/shared/travel/fit-constructs.ts) registry-only・未配線）を、既存 T11 fit モデル（[`fit-core.ts`](../lib/shared/travel/fit-core.ts)・34 テスト green）を壊さずに **scoring へ接続**する最小安全パスを設計する。
**CEO 指示の核**: 「registry は fit に未配線。完璧マッチはまだ完成していない。**全 700 指標を一気に配線しない**。代表 construct を安全に rollup 接続する phase 計画を作れ」。
**スコープ**: 計画のみ。コード変更なし（comment-only も原則不要）。実 API/booking/price 断定/永続化/UI/solver/M2 runtime/Plan Intelligence/push なし。

---

## §1 前提を疑う — 次 microphase は construct rollup 配線で正しいか

| 候補 | 内容 | 依存/リスク | 判定 |
|---|---|---|---|
| **A construct rollup 配線** | registry の construct→indicator スコアを fit-core の既存 component（traitFit/burdenFit/…）へ blend | dense state が初めて fit に効く。後続の前提 | **★ 採用（critical path）** |
| B interaction 実行を先に | INTERACTION_REGISTRY の combiner（sign_flip/gate/…）を実行 | **interaction は construct を modifies する**（IX_quiet_recovery→quietness・IX_crowd_role→crowdNoiseVolatility）。construct が fit に未配線なら**修飾対象が scoring に存在しない** | 後（A に依存） |
| C ConnectionState 深掘り | A3.1 §6 の ~25 項目 connection 型を拡充 | H_route construct は既に registry 登録済。型拡充は直交だが「dense state を fit に効かせる」核を進めない | 並行可・非 critical |

**推奨 = A**。理由: (1) interaction(B) は construct を修飾するので **construct が fit に効いて初めて意味を持つ**（A3.1 で「B は存在しない construct を参照できない」と同じ構造）。(2) ConnectionState(C) は型拡充で直交・critical path でない。(3) A が「compact 問診 × dense 内部状態 × 非 opaque fit」を初めて実体化する。**A → B → C の順が逆算上正しい**。

---

## §2 配線アプローチ — 後方互換の核は「construct データ非供給時 = 完全に従来挙動」

### §2.1 additive optional 入力（既存 fixture を壊さない）
- entity 側: `TravelObjectState` に **optional** `indicators?: Partial<Record<ConstructAxis, Partial<Record<string, Observed<number>>>>>` を追加（additive・既存 fixture は未設定）。
- user 側: `FitUserState` に **optional** `constructPreferences?: Partial<Record<ConstructAxis, { value: number; confidence: number; visibility?: Visibility }>>` を追加（additive）。
- `EvaluateFitArgs`/`buildComponents` は変更最小。construct 入力が**両方とも無ければ construct 寄与ゼロ** → 既存 34 テストは**ビット同一**で green。

### §2.2 blend は「presence-gated」（off-by-absence）
各既存 component（traitFit 等）で:
```
componentValue =
  legacyAvailable && constructAvailable ? confidenceWeightedBlend(legacy, constructAgg)
  : constructAvailable                  ? constructAgg
  : legacyAvailable                     ? legacy
  : NEUTRAL(unavailable)
```
construct 入力が無い既存テスト → `constructAvailable=false` → `componentValue=legacy` → **挙動不変**。これが最も安全な配線（gate-first・veto floor・toSharedFitView の二層機構はそのまま機能）。

### §2.3 two-layer（private 非漏洩）を construct にも貫通
construct rollup は component と同じく **valueFull / valueShared** を産出（private な `constructPreferences.visibility==="private"` を valueShared から除外）。既存 `buildComponents` の two-layer に合流 → `toSharedFitView` の再導出機構が無改変で効く。

---

## §3 推奨 first construct set（CEO 案を安全側に調整・理由付き）

**原則**: 第一 slice は **既存 component へ 1:1 で写像でき、新 component を作らない** construct のみ。

| construct | family | modifies（既存 component） | 代表性の理由 |
|---|---|---|---|
| **tranquility** | A_sensory | traitFit | 雰囲気価値の代表・valence 符号反転(IX_quiet_recovery)の検証台 |
| **mobilityBurden** | B_burden | burdenFit | 負荷の代表・walking/stairs/transfer/baggage 指標の rollup 検証 |
| **mealRoleAffinity** | D_food | roleFit（food category） | role 写像の代表・hard allergy logic と非重複 |
| **noveltySeeking** | N_crosscut | traitFit（valence flip） | 横断 user trait・local/familiar 推薦の符号反転 |
| **hygieneCleanliness** | K_condition | traitFit（品質） | 批評追加族・aestheticRefinement と分離(worn≠dirty)検証 |
| **arrivalFreshness** | H_route | recoveryFit | route 由来回復・実 API 無しで door-to-door 残存エネルギー |

→ 6 construct が **traitFit / burdenFit / roleFit / recoveryFit の 4 component** を代表被覆。**budgetFit は第一 slice で配線しない**（priceValue×budgetFit 二重計上を避け、安全確認後に別 slice）。

### §3.1 CEO 案からの調整（directive: 鵜呑みにしない・理由明記）
- **perceivedSafety を第一 slice から除外（後続へ延期）**: 安全 critical かつ **veto_escalation interaction(IX_night_safety) と一体**。soft component として先に配線すると「夜の安全閾値→veto」を取り逃し**誤モデル化**する。→ **interaction 実行 phase(B) で同時に配線するのが正しい**（安全側）。
- **acousticPrivacy / crisisRobustness も延期**: acousticPrivacy は relationalFit/L5r 寄り（relational 写像の確認が要）・crisisRobustness は L2 burden だが安全 critical → 後続。
- routeReliability は arrivalFreshness を代表として 1 つに絞る（PTI の本格扱いは ConnectionState 深掘り C と合流）。

---

## §4 rollup 実行ルール（決定論・非 opaque）

1. **constructScore**: `computeConstructScore(axis, entity.indicators[axis], weights)`（既存 C2 helper・指標 confidence 重み付き平均・欠損除外+残 weight 再正規化）。
2. **文脈依存 weights**: `ROLLUP_WEIGHTS[axis]` を base に `CONTEXT_ROLLUP_OVERRIDE[tripIntent]?.[axis]` で上書き（A3 §6・**export=非 opaque**）。※第一 slice では ROLLUP_WEIGHTS を新規に最小定義（B2 registry には未搭載のため C3-B で追加）。
3. **constructFit**: `match(userPref, constructScore) × valenceMultiplier(user, ctx, axis)`（A3 §5 の多因子 valence・第一 slice は recoveryStyle+tripIntent から開始し additive 拡張）。
4. **confidence 連鎖**: construct の confidence = 指標 confidence の集約 × userPref.confidence（弱リンク思想）。
5. **欠損挙動**（registry の `missingData` に従う）:
   - ordinary 指標欠損 → confidence 減・該当 construct を blend から軽くする（除外+再正規化）。
   - **safety_critical 指標欠損 → fail-closed**（該当 construct は満たさず扱い・第一 slice の 6 construct に safety_critical は無いが、ルールは配線時に組込む）。
   - price/availability → **捏造しない**（priceValue は第一 slice 非配線）。
6. **source/provenance → confidence のみ**（生 constructScore を動かさない・既存 §13 不変条件踏襲）。
7. **no hidden scoring**: weights/valence/blend 比率を **export**。

---

## §5 統合ルール（既存 fit を壊さない）

1. construct rollup は **既存 component を feed** してよい: traitFit / burdenFit / recoveryFit / relationalFit（budgetFit は明示安全確認後のみ）。
2. **新並列 component を作らない**（別承認なき限り）。perceivedSafety 等で新 component が要るものは延期。
3. **hard gate を迂回しない**: construct は component **値**に寄与するのみ。gate-first（hardBlock→veto floor→bounded compensatory）は不変。construct が veto floor を割る値を出せば従来通り poor cap。
4. **action authority を生成しない**: `authoritative=false`・`hasFitActionAuthority` literal false 不変。
5. **shared 射影は shared-safe construct 値から再導出**: §2.3 の valueShared を `toSharedFitView` が再導出（private construct 選好は shared に出ない）。

---

## §6 二重計上防止（construct↔legacy supersede 写像）

construct と従来信号が**同じ実体を二度数える**のを防ぐ。blend は**加算でなく信号を 1 回に畳む**:

| construct | 重複する legacy 信号 | 規則 |
|---|---|---|
| tranquility | SharedTraitAxis `quietLively` | construct 供給時は **construct を採用し legacy quietLively を traitFit から除外**（高解像度優先・両者を足さない） |
| mobilityBurden | ENTITY_BURDEN_AXES `travelBurden`/`physicalLoad` | construct 供給時は当該 burden 軸を **construct に置換**（同一 mobility 信号を二度引かない） |
| mealRoleAffinity | legacy `roleAffinity[food role]` | role は **どちらか一方**（construct 供給時は construct を採用） |
| crowdNoiseVolatility(将来) | legacy `crowdNoise` burden | crowd-as-value(trait) と crowd-as-burden(burden) を**別計上**・同一側で二度数えない |
| priceValue(非配線) | budgetFit | 第一 slice は priceValue 非配線で構造的に回避 |
| hygieneCleanliness | aestheticRefinement | **別 indicator・別 construct**（worn≠dirty）→ 二重でなく独立寄与（OK） |
| interaction 修飾子 | 素 component | interaction 第一 slice 非実行（B で `modifies` 限定により構造回避） |

実装は `CONSTRUCT_SUPERSEDES_LEGACY: Partial<Record<ConstructAxis, LegacySignalRef>>` を export（非 opaque）。

---

## §7 将来実装の golden tests（C3-D・既存 34＋29 を保つ）

1. **旧 TraitVector path 不変**: construct 入力なし → 既存 34 fit テストとビット同一（最重要）。
2. 選択 construct 指標が決定論で rollup（同一入力→同一 constructScore）。
3. **tranquility が recovery vs stimulation context で fit を別方向に動かす**（valence 符号反転）。
4. **mobilityBurden が walking/stairs/transfer/baggage 指標から burdenFit を構成**。
5. **dining construct が food-role fit に効くが hard allergy logic を複製しない**（allergy は L5 veto のまま）。
6. perceivedSafety 昼夜分離が保たれる（第一 slice 非配線でも registry 不変を確認）。
7. hygiene worn≠dirty が保たれる（hygiene が aesthetic と別寄与）。
8. **noveltySeeking が local/familiar 推薦を反転できる**。
9. **route reliability/arrival freshness が route burden/recovery に効く（実 API 無し）**。
10. **private construct 指標/選好が full fit に効くが shared view に漏れない**（連続値逆算不能・canary）。
11. **safety_critical 指標欠損が fail-closed**（配線時ルール）。
12. source/provenance が confidence のみ変える（constructScore 不変）。
13. **二重計上なし**: tranquility 供給時に quietLively と二重に traitFit を押さない。
14. 既存 34＋29 テスト green・no fetch/API/DB/route/UI imports・tsc 55 不変。

---

## §8 実装スライス（承認後・additive・小バンドル規律）

| Scope | 内容 |
|---|---|
| **T11-C3-A** | 本計画（docs-only・本書） |
| **T11-C3-B** | construct rollup helper 配線: `fit-constructs-core.ts` に `constructFit(axis,user,entity,ctx)` + `ROLLUP_WEIGHTS`(最小) + `valenceMultiplier`(recoveryStyle/tripIntent) + `CONSTRUCT_SUPERSEDES_LEGACY` を追加（**fit-core を呼ばない**・純関数） |
| **T11-C3-C** | fit-core 統合: `TravelObjectState.indicators?` / `FitUserState.constructPreferences?` を additive・`buildComponents` で **presence-gated blend**（6 construct→4 component・two-layer 産出・supersede 適用） |
| **T11-C3-D** | golden tests（§7・14 本）＋既存 34＋29 維持 |
| **T11-C3-E** | closeout（decision-log + memory） |

**stop**: 全 700 指標は配線しない。第一 slice は 6 construct のみ。perceivedSafety/interaction 実行は次 phase(B)。

---

## §9 出力 + CEO 判断請求

- **推奨実装バンドル（承認後）**: T11-C3-B + C3-C + C3-D を 1 commit（pure/additive/presence-gated/非 opaque/private 非漏洩/no authority）。検証: 新規 tests PASS・**既存 34＋29 無改変 green**・tsc 55 不変・full suite teed・purity/import/no-runtime-importer grep（fit-core が runtime に流出しないこと=本 phase でも未配線維持）。
- guardrail: 実 API/booking/price 断定/永続化/UI/solver/M2 runtime なし。construct 入力非供給時は完全に従来挙動。

### CEO 判断請求
1. 次 microphase = **construct rollup 配線(A)** で良いか（vs interaction-first B / ConnectionState C）。
2. **first construct set 6**（tranquility/mobilityBurden/mealRoleAffinity/noveltySeeking/hygieneCleanliness/arrivalFreshness）で良いか。**perceivedSafety を interaction phase へ延期**する調整に同意か。
3. **presence-gated blend**（construct 非供給時=従来挙動・34 テスト不変）方式で良いか。
4. **supersede 写像**（tranquility→quietLively 等を二重計上せず置換）で良いか。
5. 承認後 **T11-C3-B/C/D bundle 実装** の GO。

実装は CEO 承認まで着手しない（T11-C3 計画レポートで停止）。
