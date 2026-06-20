# Travel Session 統合 Freeze + Resume Gate（docs-only）

> セッション全体（T1A → engine → safe links → durable persistence）の**統合凍結点**。
> このドキュメントは**コードを変更しない**。次の作業（main 統合・engine←personalization 配線）は CEO 承認後。
> 上位文脈: branch `claude/objective-mcnulty-a554c9`（travel mode = Plan OS 拡張、M1-M6）。
> 原則: ①前提を疑う ②grounding（ファイル/commit/コマンド/結果）③シンプル→論理 ④外科的 ⑤ゴール逆算。

作成: 2026-06-20 / 作成主体: Build Unit（CLAUDE）/ 承認: CEO（「全てをメインに統合・freeze まで」directive）

---

## 0. なぜ今 freeze か（CEO directive）

CEO 指示「1度全てをメインに統合します。commit が終わっていないものを commit し、freeze まで終えて下さい」。
- **commit**: 実装は全て commit 済み（180 commits・後述）。未 commit は `supabase/.temp/cli-latest`（gitignored・CLI version marker v2.90→v2.107・**実装ではないノイズ**）のみ。
- **統合（main マージ）**: **blocker により保留**（§5）。canonical main worktree が別マージ進行中。
- **freeze**: 本ドキュメント。branch を凍結し resume gate を定義（§6）。

---

## 1. Freeze summary（branch `claude/objective-mcnulty-a554c9` @ `06ffcbc07`）

- merge-base（vs main）: `33cc5e2e4` / main tip: `b1393b970` / branch tip: `06ffcbc07`
- branch は main から **180 commits 先行**（91 docs(travel) / 79+2 feat(travel/personalization) / 2 test / 1 fix / 2 docs(decision-log)）。**スコープはクリーン**（travel/personalization/decision-log のみ・他領域汚染なし）。
- **tsc = 55（baseline 維持）**・runtime 健全。

| レイヤー | 代表 commit | 種別 | 状態 |
|---|---|---|---|
| M2-A PersonalizationPort（read-only 写像） | `3380b98d` | additive・new files 5 | ✅ frozen |
| M2-B-1 consent-gated pair engine reader + EngineOnly guard | `7f68f349` | DI only・未配線 | ✅ frozen |
| T1A/T1B domain-neutral core types + helpers | `44c0a1f1`/`407f2c4f` | pure・未配線 | ✅ frozen |
| T2-T8 proposal/compare/decide/readiness/contingency/packet core | `f8e3b1a9`..`f0e1a9a0` | pure・決定論・未配線 | ✅ frozen |
| T9 engine facade `runTravelPlanEngine`（T3-T8 compose） | `7669a6fa` | pure・未配線 | ✅ frozen |
| T10 after-action（regret→constraint）correction memory | `26fea602` | pure・未配線 | ✅ frozen |
| T11 Travel Fit Model（state matching / 状態マッチング core） | `5aec343e`..`88faed1b` | pure・未配線 | ✅ frozen |
| Plan Intelligence projection（types/mapper/preview） | `2dde2987`..`f9a51621` | pure・dev preview のみ | ✅ frozen |
| CoAlter cue consume + read-only display | `6c37bf55`/`6bf2119b` | display cue・no runtime | ✅ frozen |
| input provider / session-intake binding / retrieval-to-fit | `d9133048`..`482b1833` | pure・配線なし | ✅ frozen |
| real solver S1-S4 + assembly bridge + candidate lane | `74b98817`..`f0baa226` | pure・未配線 | ✅ frozen（[[t11-travel-candidate-lane-freeze-resume-gate]] と整合） |
| travel live gate + server action boundary（staging-gated OFF） | `0d8968b6`/`8a1d7445` | display-safe・no persistence | ✅ frozen |
| safe link ladder（Tier1-A → href model → Maps URL → preparation → attach → panel） | `b3137d15`..`228f72ac` | pure・gate 従属・default OFF | ✅ frozen |
| durable persistence pipeline（types → harness → SQL draft → DB port → adapter → mapper → provider seam → action wiring） | `b2a8928c`..`06ffcbc07` | injected-only・production no-op | ✅ frozen |

---

## 2. 正直な到達点（CEO への現状報告と一致）

**「予約直前まで整える Plan OS の骨と配管は組んだ。だが骨に血（性格 state）が通っておらず、主役体験はまだ動く製品になっていない。」**

| 構想（M1-M6 / MVP） | コードの現実 |
|---|---|
| 個人理解で**完全パーソナライズ** | ❌ `lib/shared/travel/engine.ts` は personalization を消費しない（axes/HDM 参照ゼロ・`pure・未配線`）。M2 port は別 seam で未配線・`dynamicState`/`decisionMeta` は null 固定 |
| **2人モード**（companions） | ⚠️ engine は `participantIds` を受ける口のみ。companions 実配線は **CEO HOLD**・実データ流入なし |
| **3案 Pareto 比較** | ⚠️ proposal-builder/comparator は pure 存在。engine 全体「未配線」 |
| ホテル/店/観光**候補** | ❌ 外部データなし（Maps/Places 禁止）。候補は抽象のみ |
| **予約直前リンク** | ⚠️ safe-link で Maps検索URL/公式リンクの href model は生成（gate ON 時のみ表示）。実在の宿は引かない |
| **当日再計画**（M4） | ⚠️ contingency-core pure 存在・未配線 |
| **後悔台帳**（M6） | ⚠️ after-action-core pure 存在・未配線 |
| ⭐ **状態マッチング**（M1 Travel Trait Space / Travel Fit Model） | ⚠️ T11 Fit Model pure core は実在（`5aec343e`〜）・**未配線**。24軸 trait space の entity スコアリング・engine 反映はなし |

**production state ゼロ**。全 gate OFF / fixture / injected-only / 本番 no-op。

---

## 3. 不変条件（freeze invariants・解除には CEO gate）

- `engine.ts` は personalization / axes / HDM を **import しない**（pure・domain-neutral）
- live server action は **display-without-save**（persistence は action-state を変えない・production は injectedRepository なし＝unavailable）
- repository provider seam は **stateless・fail-closed・injected-only**（global singleton なし・cross-user leakage 構造的に不可）
- safe link は **inert/generated 区別**・default OFF・`isPlanTravelLiveAllowed` に従属・**production deny 継承**
- M2-B-2 live 配線・companions apply・dynamicState/decisionMeta 永続化・real Supabase repository・SQL migration apply は全て **HOLD**
- 触れない: M2 runtime / CoAlter runtime / `/talk` / booking / calendar / Maps・Places API / 外部 retrieval / push / production

---

## 4. 統合時に衝突が予想されるファイル（main との overlap）

branch と main（merge-base `33cc5e2e4`..`b1393b970`、main は独自 57 commits 先行）の**両側変更 overlap = `docs/decision-log.md` 1件のみ**（追記同士＝両方残せば解決）。

ただし**シフトマージ（§5）完了後の main では overlap が増える**見込み。シフト側が触る未解決4ファイルと travel branch の変更が重なる:
- `app/(culcept)/plan/PlanClient.tsx`（travel: ActionState gate 追加 `374282ff`）
- `app/(culcept)/plan/page.tsx`（travel: TravelLivePanel + gate `0d8968b6`）
- `lib/plan/featureFlags.ts`（travel: travelLive/planRouteLive/travelExternalLinks flag）
- `docs/decision-log.md`（追記）

→ **シフトマージ後の最新 main を基準に再評価**してから travel を統合すること。

---

## 5. 統合 blocker（2026-06-20 発見・CEO 判断済み）

canonical main worktree `/Users/haradataishi/Culcept-main-reflect-20260604` が、**別ワークストリームの未完了マージの最中**:
- マージ相手: `feat/plan-shift-import-realdata-reflection`（`089ab5bbb`・root worktree のブランチ）
- 状態: **staged 130 ファイル / 未解決衝突 4 ファイル**（`PlanClient.tsx` / `page.tsx` / `lib/plan/featureFlags.ts` / `docs/decision-log.md`）
- 相手コミット日 2026-06-07・main tip 2026-06-19

**CEO 判断（2026-06-20）: シフト側ワークストリームに完結させる。Build Unit（travel）は触らない。**
- `git merge --abort` 禁止（130 ファイルの解決を消す＝§7 State Safety Rule 違反）
- travel 側からの完結/abort 禁止（解決の正当性を判断できない）
- 私のマージ試行（`--no-ff --no-commit`）は即エラーで失敗し、**main worktree を一切変更していない**（089ab5bbb / 衝突4 / staged130 のまま検証済み）

---

## 6. Resume Gate（再開条件）

travel の main 統合は、**以下が全て満たされてから**:

1. **シフトマージ完了**: `feat/plan-shift-import-realdata-reflection` が main に着地し、canonical main worktree が clean（MERGE_HEAD 消失・衝突0）になっている
2. **最新 main 基準で overlap 再評価**（§4）— シフト後の `PlanClient.tsx`/`page.tsx`/`featureFlags.ts`/`decision-log.md` を確認
3. **branch green 再確認**: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` = 55
4. **統合手順**: canonical main worktree で §8 三点確認 → `git merge --no-ff claude/objective-mcnulty-a554c9` → 衝突は travel/シフト両方の意図を保って解決（travel gate・flag は additive なので両立可能なはず）→ tsc 55 再確認 → commit
5. **push しない**（GitHub suspended・CEO 承認案件）

### 統合後も HOLD のまま（別 CEO gate）

- engine ← personalization 配線（M2 axes/HDM を engine 入力へ）= 「完全パーソナライズ」を真にする本命
- dynamicState / decisionMeta 永続化（判断エンジン・内的天気を null から実値へ）
- companions HOLD 解除（2人モード live）
- real Supabase repository / SQL migration apply / production deny release

---

## 7. 関連

- [[t11-travel-candidate-lane-freeze-resume-gate]] — 候補レーン凍結（整合）
- `docs/travel-mode-plan-os-extension-design.md` — M1-M6 増補設計
- `docs/weekday-plan-reality-audit-20260612.md` — 平日プラン監査（同じ「state→plan 接続ゼロ」ギャップ）
- `docs/coalter-travel-domain-greenfield-design.md` — greenfield 設計（T0-T7）
- memory: `project_travel-mode-direction` / `project_travel-candidate-lane-frozen` / `project_github-suspended-local-only`
