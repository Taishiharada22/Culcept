# 評価OS / Aneura readout 一族 production 解放（統一マスター flag・2026-06-26）

> 目的: local 最新で見えていた「評価OS / Aneura readout」系の深い read/display 情報を production に届ける。
> 方式: 各 gate の `NODE_ENV !== "production"` ハードブロックを **統一マスター flag との OR** に置換。
> UI Freeze: JSX/CSS/layout/component を一切変えず、production gate を開けるだけ。default OFF＝退化なし。
> 共有 helper: `lib/plan/aneuraReadoutGate.ts`（`isAneuraReadoutProdEnabled` / `isAneuraObserveProdEnabled`）。

## 対象 readout 一覧（gate 改修済み）

### A 一族（READOUTS master = `NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD`）— 純表示・DB write/network/課金/順位変更なし
| 機能 | gate | 出る場所 |
|---|---|---|
| 逆 what-if 理由 | `dayRehearsal/inverseWhatIf.ts` isInverseWhatIfEnabled | CalendarTab |
| シナリオ比較 | `dayRehearsal/scenarioComparison.ts` isScenarioComparisonEnabled | CalendarTab |
| 移動耐性の理由 | `mobility/movementToleranceReasonUi.ts` isMovementToleranceReasonUiEnabled | MapTab |
| エネルギーリズムの理由 | `mobility/energyRhythmReasonUi.ts` isEnergyRhythmReasonUiEnabled | MapTab |
| 場所親和の理由（なぜこの場所か） | `compose/placeAffinityReasonUi.ts` isPlaceAffinityReasonEnabled（reason のみ） | PlaceCandidatesPanel |
| Fit-Arc readout（どれくらい合ってる） | `postVisit/fitArcReadout.ts` isFitArcReadoutEnabled | PlaceFitArcReadout / CandidateLensPanel |
| 候補レンズ overlay（①②③）マスター | `candidateLens/candidateLensUi.ts` isCandidateLensUiEnabled | PlaceCandidatesPanel |
| 候補レンズ ③説明（並び順の理由） | `candidateLens/candidateLensUi.ts` isCandidateLensExplanationEnabled | CandidateLensPanel |

### B 一族（OBSERVE master = `NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD`）— localStorage のみ・DB write/network なし
| 機能 | gate | 備考 |
|---|---|---|
| post-visit 答え合わせ（Fit-Arc のデータ源） | `postVisit/postVisitObservation.ts` isPostVisitCheckEnabled | localStorage のみ |
| 候補レンズ preference 観測（shadow 記録） | `candidateLens/candidateLensPreferenceStore.ts` isCandidateLensPrefObsEnabled | localStorage のみ |
| 候補レンズ preference 適用（比較行の並べ替え） | 同上 isCandidateLensPrefApplyEnabled | localStorage の pref を読むだけ |

### 改修方式
- A: `(CONST && NODE_ENV !== "production") || isAneuraReadoutProdEnabled()`
- A（早期 return 形 = fitArc）: `if (NODE_ENV === "production") return isAneuraReadoutProdEnabled(); …`
- B: 上記を `isAneuraObserveProdEnabled()` で。
- 既存個別 flag は壊さず OR で併存（`NEXT_PUBLIC_PLACE_CANDIDATE_LENS_UI` / `NEXT_PUBLIC_ANEURASYNC_FIT_ARC_DOGFOOD` / `NEXT_PUBLIC_ANEURASYNC_POST_VISIT_DOGFOOD`）。
- **env 未設定なら全 gate が現 production と同一 false（退化なし）。dev/local は従来どおり。**

## 新規 / 既存 flag 一覧
| flag | 種別 | 役割 | default |
|---|---|---|---|
| `NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD` | 新規・master | A 一族（純表示）を本番解放 | OFF |
| `NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD` | 新規・master | B（localStorage 観測）を本番解放 | OFF |
| `NEXT_PUBLIC_PLACE_CANDIDATE_LENS_UI` | 既存・個別 | 候補レンズ overlay 単体 | OFF（互換維持） |
| `NEXT_PUBLIC_ANEURASYNC_FIT_ARC_DOGFOOD` / `_POST_VISIT_DOGFOOD` | 既存・dogfood | dev 点火 | （dev のみ・互換維持） |

## test 結果
- 新規 `tests/unit/plan/aneuraReadoutGate.test.ts`（37）: 各 gate の production-default-false / master-true-true / A↔B 分離 / 既存 flag 互換。
- 関連 13 file / 187 passed。tsc 変更ファイル起因エラー 0。

## production canary 手順
1. **初回 = A のみ**: Production scope に `NEXT_PUBLIC_ANEURASYNC_READOUTS_PROD=true` を設定。
2. **deploy 必須**（NEXT_PUBLIC は build 時 inline・本 commit を含む HEAD を build）。
3. 実機確認: /plan カレンダー（逆 what-if/シナリオ比較）・地図（移動耐性/エネルギーリズム）・予定追加候補（場所親和理由/候補レンズ ①②③/Fit-Arc）が出る。Runtime Logs に 42501/42P01/500 が無い。
4. green 後に **別 canary で B**: `NEXT_PUBLIC_ANEURASYNC_OBSERVE_PROD=true`（Fit-Arc に実観測が乗る・localStorage のみ）。
   - ※ A だけだと Fit-Arc は「観測不足（empty）」表示（データ源 B が OFF のため）。それは正常 degrade。
- **初回 canary で ON にするのは A のみ**（`READOUTS_PROD`）。B（`OBSERVE_PROD`）は A green 後。

## rollback
- env を外す（または `false`）→ 全 gate が即 default false（現 production 挙動）。
- 1 deploy で戻る。コード rollback 不要（flag だけ）。

## まだ production 未接続（今回スコープ外・明確な理由）
- **contextModifier / personalPaceAdapter**: 「決定路に効かせる / 実診断へ反映」＝**logic 修正で純表示でない**（CEO criteria「順位/挙動不変」に反する）→ A から除外。出すなら別 GO（挙動変更の検証要）。
- **placeAffinity ranking**: 候補の**順位を変える** → 除外（reason 表示のみ解放）。
- **Maps 課金系**: place details enrichment（写真/営業時間）/ purpose query expansion → Maps key + 課金 opt-in（別 GO）。
- **dev console**: PRG readiness console / pace shadow / 各 dev preview route → production 非公開のまま（正）。
- **CoAlter**: Reality OS surface（攻め/守り = fixture）/ live chat/send / Plan Intelligence の完全 real（session インフラ）→ 別トラック。
- Reality write / LifeOps write / Shift save / personalization 実読み consent → 各々前提（migration/consent）未達。

---
本書: 実装 + test のみ。production env 変更 / redeploy / SQL / push は CEO 実行。
