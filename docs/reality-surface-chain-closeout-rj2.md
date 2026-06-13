# RJ2-CLOSEOUT — Reality Surface Chain Integration Audit（docs-only・統合監査）

- 日付: 2026-06-14 / 作成: RJ2 surface chain 統合監査セッション
- 位置づけ: RJ2a–RJ2f（内部判断 → 安全な外向き境界）の **全 slice 統合状態の正本監査**。実装済み・HOLD・未接続・進出可否を確定する。
- 規律: **コードを書かない**（docs-only）。**production / deploy / push / notification 解放には進まない**（CEO 専管）。
- 検証原則（feedback_verification-protocol）: 主張に根拠（ファイル/コマンド/結果）。本書の状態主張は §0 の検証コマンド結果に基づく。

---

## 0. 検証根拠（2026-06-14 実測）

| 検証 | コマンド | 結果 |
|---|---|---|
| 6 surface file 実在 | `ls lib/plan/realityCore/{judgmentSurfacePlan,surfaceClaim,clarificationQuestion,surfaceProjection,copySurface,deliveryGate}.ts` | **6 件全て存在** |
| UI/app/components の import | `grep -rln <6 module> app/ components/` | **0 件（UI 未接続）** |
| 外部 consumer | `grep -rln <6 module>` − realityCore − tests | **tests のみ（app/api/component なし）** |
| 6 surface test | `vitest run <6 test>` | **101 tests PASS** |
| tsc baseline | `tsc --noEmit` | **55（実装前と同値・additive）** |
| full suite | `vitest run tests/unit/` | **FAIL 2 のみ**（realityCore 外）/ next build PASS |

---

## 1. RJ2a–RJ2f 全 slice 一覧（責務・実装ファイル・commit）

| slice | 責務（一言） | 実装ファイル | 主要型 / 関数 | commit | tests |
|---|---|---|---|---|---|
| **RJ2a** | exposure 包絡（判断 → どこまで露出してよいか） | `judgmentSurfacePlan.ts` | `JudgmentSurfacePlanV0` / `deriveSurfacePlan` / `surfacePlanViolations` | `1988a877` | 17 |
| **RJ2b** | claim envelope（主張してよいことの構造化・verdict なし） | `surfaceClaim.ts` | `SurfaceClaimV0` / `BoundSurfaceV0` / `deriveSurfaceClaims` / 3-walker / `bindClaimsToPlan` | `e9e482b0` | 21 |
| **RJ2c** | question slot（何について確認するか・文面なし） | `clarificationQuestion.ts` | `ClarificationQuestionCandidateV0` / `deriveClarificationQuestions` / 2-walker | `d100a76e` | 20 |
| **RJ2d** | consumer 境界（内部 → consumer-facing・唯一の direct read 点） | `surfaceProjection.ts` | `SurfaceProjectionConsumerViewV0` / `…InternalBundleV0` / `deriveSurfaceProjection` / 2-walker | `8f2c9130` | 17 |
| **RJ2e** | user-facing 文面（初の自然言語・exact catalog） | `copySurface.ts` | `RenderedCopyV0` / `renderCopy` / `copyViolations` | `5d8edffb` | 12 |
| **RJ2f** | 配信可否境界（v0 は配信しない・kill-switch） | `deliveryGate.ts` | `DeliveryDecisionV0` / `DeliveryChannelV0` / `evaluateDeliveryEligibility` / `deliveryGateViolations` | `37d76b2f` | 14 |

**合計 101 tests PASS**。全 slice pure core・additive（tsc baseline 55 不変）。

**データフロー（一方向）**: InterventionDecision（RC2c-2）→ RJ2a plan → RJ2b claim(+BoundSurface) / RJ2c question → RJ2d projection(consumer view) → RJ2e copy(文面) → RJ2f delivery 可否（v0 無配信）。各 slice は下流不接触・上流 consume only。

---

## 2. user-facing になる境界（どこからユーザーに届くか）

- **RJ2d `SurfaceProjectionConsumerViewV0`**: 唯一の **consumer 読取り対象**（direct read 解禁点）。ただし**文面なし**（構造のみ・category-free・opaque）。
- **RJ2e `RenderedCopyV0`**: 初の**自然言語**（exact catalog・CEO 文面承認済）。ここがユーザーが読む言葉。
- **RJ2f `in_app_passive`（pull surface）**: ユーザーが**アプリを開いたとき**に in-app 受動表示してよい候補。**通知ではない**。
- **現状はどれも UI に未接続**（§0: UI import 0 件）。文面・構造は生成できるが、まだ画面に出ていない。

---

## 3. まだ HOLD のもの（実装も解放もしていない）

| 項目 | HOLD 理由 | 解放 gate |
|---|---|---|
| **proposal content / 3案** | RJ2d で boundary boolean のみ（available:false） | RJ2d+ / CEO |
| **departure line content** | v0 構造遮断（departureLineRefs/departureAvailable []） | RC4 / CEO |
| **LLM 自由生成文面** | RJ2e は決定的テンプレートのみ | 別 slice + CEO + 専用 red-team |
| **実 push / 端末通知 / chat / 外部送信 / 自動送信** | RJ2f は配信可否のみ・`deliveredNow=false` kill-switch・push/chat/external は型に無し | **CEO + production 三重 gate** |
| **一斉通知 / メール** | CLAUDE.md 運用規約で CEO 承認必須 | CEO + 法務 + production |
| **notification opt-in（push 許諾）** | v0 は `userInAppSurfaceOptIn`(in-app)のみ・push 許諾は別概念 | 将来 push slice + 別 gate |

---

## 4. 未通過 / 未接続 確認（§0 根拠）

- **production gate 未通過**: 本番反映・deploy していない。全 slice は local only（[github-suspended-local-only] とも整合）。
- **UI 未接続**: app/components から 6 module の import **0 件**（§0）。画面に出ていない。
- **notification/contact 未解放**: RJ2f は `deliveredNow=false`・push/chat/external 型に無し・push SDK 不配線。実配信ゼロ。
- **DB/API/storage 未接続**: 6 module は pure core（I/O・supabase・localStorage・API route なし）。IO source-scan green（各 test #IO）。consumer は realityCore 内 + tests のみ（§0）。
- **外部 read / location 不接触**: 全 slice で fetch/geolocation/external なし。

---

## 5. full suite baseline FAIL 2 の扱い

- FAIL 2 = `realitySeedSource.test.ts`（A1-5-2 plan_seeds 静的安全）+ `realityDurationEvidenceSource.test.ts`（A1-5-3b evidence 読取静的安全）。
- **両者は RJ2 surface chain 外**（A1-5-x の static-safety テスト・seed/duration evidence source 系）。RJ2a–2f 実装の前後で**同一の 2 件**（regression ではない）。
- 既知 baseline として MEMORY.md / 各 slice 完了報告に記録済み。RJ2 とは独立に owning session が扱う。

---

## 6. どこから dogfood / preview / UI 接続に進めるか（候補・CEO 判断）

**最小リスクの進出順（提案・各段で CEO 確認）**:

1. **内部 dogfood preview（read-only・最安全）**: RJ2d consumer view または RJ2e copy を **debug 画面**（自分のデータのみ・in-app pull）で表示。配信なし・他者なし・production なし。**ここが最初の候補**。
2. **限定 UI 接続（in_app_passive・pull のみ）**: RJ2f が `in_app_passive_eligible` を返す場面で、RJ2e 文面を in-app に受動表示（ユーザーがアプリを開いたとき）。**push なし**。opt-in（`userInAppSurfaceOptIn`）必須。
3. **少人数招待ユーザー検証**: 1+2 を知人・招待制で（CLAUDE.md「少人数の初期検証ユーザー獲得」は許容）。

各段とも **read-only / pull / 配信なし**を厳守。UI 接続の実装は別 GO（surface module は consume only ゆえ UI 層が呼ぶ形）。

---

## 7. どこはまだ絶対に進めないか（CEO 専管・越えない線）

- **実 push / 端末通知 / 外部送信 / 自動送信 / 一斉通知 / メール**: `deliveredNow=false` を解除しない。CEO + production + 法務（通知許諾）gate を通すまで**絶対に配信しない**。
- **production / deploy / DB write / migration**: CEO 承認必須（CLAUDE.md §1）。surface chain は local only。
- **LLM 自由文面化 / proposal content / departure content**: HOLD（§3）。CEO + 専用 red-team まで。
- **active_prompt の配信転用**: INV-11。active_prompt を push/notification にしない（RJ2f で常に no_delivery）。
- **surface module の改変なしに UI が内部 object を直接読む**: 禁止。consumer は RJ2d consumer view（または RJ2e 文面）のみ。plan/claim/question/internal bundle を UI が直読みしない。

---

## 8. 自己判定（RJ2 surface chain の到達点）

- **RJ2a–2f 実装完了**（101 tests PASS・tsc 55 維持・build PASS・UI/DB/API/notification 未接続・production gate 未通過）。「内部判断 → 安全な外向き文面 + 配信可否」が pure core で一通り成立。
- **残るは実配信のみ**（CEO + production 三重 gate）。surface chain 自体は安全境界を構造で担保（exposure 包絡 / verdict-free claim / question 非断定 / consumer allowlist + opaque / exact 文面 + walker / 配信 kill-switch）。
- **次の進出候補は §6（内部 dogfood read-only preview から）**。**§7 の線は CEO 専管で越えない**。
- code 変更ゼロ（本書 docs-only）・tree clean・production gate 未通過。
