# B — Adapter Producer Wiring Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> DB・RLS / M2 runtime / CoAlter runtime / 外部 retrieval / Maps・Places API / URL fetch / 外部遷移 production release は HOLD。
> 上位文脈: Tier1-A〜C + Preparation + B-D-A（`prepareTravelExternalLinkHrefModels` pure・unwired）+ D-A（`externalLinks?` 型 field）。
> **本書 = adapter ready 分岐が helper を呼び `display.externalLinks` を付ける producer 境界**（初めて adapter が link を産出＝契約越え）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）— ★ 設計を決める 3 発見
- **発見1（ready destination は confirmed-real）**: `getSessionIntakeTravelInput` は hard 3 prereq 全 confirmed でのみ ready（`session-intake-provider.ts:130`）。destination の confirmed-real = `isHardSlotSatisfied`: `status !== "retracted"` ∧ `fillState === "filled"` ∧ **explicit surface 由来 evidence**（`HARD_CONFIRMING_SURFACES_BY_KEY.destination_area = [form_input, quick_action, adjustment_card]`・**session_context 不可**）。explicit surface → `SURFACE_INITIAL_STATUS` で初期 status **"confirmed"**。
  → **★ CEO §6 の「normalized session_context if provider-ready」は destination に適用されない**（session_context は destination を hard-confirm できない＝date 専用）。ready destination は **explicit 由来＝status "confirmed" が正常形**。
- **発見2（owner/visibility）**: `ExtractedSlot` は `owner: ConstraintOwner`（`{kind:"shared"} | {kind:"participant",...}`）+ `visibility: Visibility`（shared|private）を持つ。destination_area の default visibility（form_input）= "shared" だが、**private/participant 所有もあり得る** → shared-safe gate 必須。
- **発見3（複数 slot）**: `classifyHardSlot` は `live.some(...)`＝**destination_area slot は複数あり得る** → 決定論的ルール要。
- ready 分岐（`travel-plan-display-adapter.ts:58-63`）に `provided.input.slots`（`value.areaText`/status/owner/visibility/evidence/fillState 含む・server-only）。
- `prepareTravelExternalLinkHrefModels` は pure・**unwired**（どこからも未 import）。manual URL 源は production に**無い**。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **B adapter producer wiring（本書）** | 中（adapter 契約越え・flag 要・extraction nontrivial） | 高（link の**source**。これ無しでは panel に渡すものが無い） | **推奨・次（設計のみ）**。実装は **B-extraction pure helper 先行**で挙動不変から |
| E panel consumer wiring | 低 | 中 | **producer の後**（source 無しに consume は空＝先に source） |
| Tier1-C render distinction | 低 | 中 | 後（link が render された後で意味） |
| SQL/RLS persistence | **高**（DB migration＝§1 CEO 承認） | 中 | 後 |
| production deny release | 最大 gate | — | **最後** |

**推奨: B adapter producer wiring 次・docs-only。実装は SPLIT で「B 純粋 destination 抽出 helper のみ」先行。** 根拠（①⑤）: producer は link の source。だが adapter が link を産み始める＝契約越え + ready render 変化。よって **挙動を変えない純粋抽出 helper（発見3 の fail-closed ルールを内包）**を先に固め、adapter への配線（C）は **default-OFF option** 付きで別 GO。

### ★ 設計の核（③④）— extraction を分離・配線は option で隔離
- destination 抽出（複数/shared-safe/confirmed の決定論ルール）は **独立 pure helper**（testable・adapter 非肥大）。
- adapter は **option ON 時のみ** 抽出 helper → link helper を呼び attach。**option 既定 false＝従来挙動・test green・dark-launch**。

---

## 2. データ可用性（②）
- adapter ready 分岐に `provided.input`。
- `provided.input.slots` に destination_area slot（`value.areaText` / status / owner / visibility / fillState / evidence）。
- display projection は **clean な destination label を露出しない**（説明文のみ）。
- manual URL 源 production に無し。
- `prepareTravelExternalLinkHrefModels` は pure・unwired。

## 3. adapter 契約更新（§3・明示）
- 現契約: 「safe links / Maps URL 生成なし」。
- 配線でこれを **明示更新**: 「**external link gate（既定 OFF）有効時のみ、confirmed shared-safe destination から generated Maps 検索 hand-off link を attach し得る**」。
- adapter は依然 **主張しない**: 外部 retrieval / exact place 解決 / Maps・Places API / manual URL support（まだ無い）。

## 4. gate 戦略（§4）
- **既存 server-only travel live gate に従属**するが、adapter は env を読まない。
- adapter は **明示 option** を受ける: `includeExternalLinks?: boolean`（または `externalLinksEnabled`）。**absent = false**。
- **既定 OFF**・**production deny**・**preview flag は production 生成を有効化しない**・**client-side flag なし**。
- option の真偽は **caller（server action）が既存 gate に基づき決める**（production は常に false）。adapter は受け取るだけ。
- ★ 配置: `buildTravelPlanDisplayResult(input, gate, options?: { includeExternalLinks?: boolean })`（**additive optional 第3引数**）。既存 caller/test は引数なし → option absent → links なし → 挙動不変・tsc 55 維持。

## 5. producer 挙動（§5）
- **gate false**: link helper を呼ばない・`display.externalLinks` **absent**（従来と byte 同一）。
- **gate true**:
  1. `provided.input.slots` から **confirmed shared-safe destination** を抽出（§6 ルール）。
  2. 抽出結果（or null）を `prepareTravelExternalLinkHrefModels({ destination })` に渡す。
  3. 結果（`SafeTravelLinkHrefModel[]`）を `display.externalLinks` に attach。
     - ★ **空配列でも attach するか、空なら absent にするか** → **空なら absent**（不要な field を載せない・「links 無し」と「空」を区別しない・UI は `?? []` で同一扱い）。
- private/participant 所有/unconfirmed/missing/空ラベル destination → **generated link なし**（helper/Tier1-C が gate）。
- **manual link 捏造なし**・**URL fetch なし**・**Maps/Places API なし**。

## 6. destination 抽出（§6・発見1-3 反映）— 決定論ルール
純粋抽出 helper `extractGeneratedLinkDestination(slots): TravelExternalLinkDestinationCandidate | null`:
1. `key === "destination_area"` ∧ `status !== "retracted"` ∧ `fillState === "filled"` の slot を集める（ready の confirmed-real 形）。
2. 各 slot から **shared-safe** を要求: `visibility === "shared"` ∧（`owner.kind === "shared"`）。**private/participant 所有は除外**。
3. **status === "confirmed"** を要求（発見1: ready destination は explicit 由来＝confirmed が正常形。normalized/proposed は除外＝honesty）。
4. `value.areaText` 非空を要求。
5. 残った候補の **distinct な areaText** を見る:
   - **0 個 → null**（generated link なし）。
   - **1 個 → その候補**（`{ label: areaText, status: "confirmed", visibility: "shared", owner }`）。
   - **2 個以上（distinct）→ null（fail-closed）**。**複数の異なる行き先を勝手に選ばない**（どれが本意か不明＝推測しない・最も安全）。
- ★ 発見1 より「normalized session_context destination」は存在し得ない（session_context は destination を confirm 不能）→ その分岐は**不要**。
- 抽出結果は helper/Tier1-C が再 gate（status confirmed + shared-safe + 非空）するため、抽出は**保守的に絞るだけ**（二重 gate＝安全）。

## 7. manual source 取り扱い（§7）
- `manualIntents` は現状 **空**（URL 入力欄なし・retrieval 源なし）。
- **manual intent を捏造しない**。
- 将来の manual URL provider が後で `manualIntents` を渡せる（B-D-A helper は既に受け口あり）。
- **最初の配線は generated maps link のみ**。

## 8. privacy（§8）
- private destination label を使わない（visibility private → 除外）。
- 生成 URL/label に **private red_line/preference・raw userId・M2/Stargazer・participant/relationship state なし**。
- **raw diagnostics なし**・**raw intents を UI に出さない**・**client-only filtering 禁止**。

## 9. panel との関係（§9）
- panel consumer 配線（E）は **本設計では HOLD**（別 GO）。
- C 実装後、`display.externalLinks` は **存在し得るが panel 未配線なら render されない**（無害）。
- panel は **helper を import しない**・**raw intents を受けない**。
- ★ B+E を同一 GO にする選択肢もある（同 option 下）が、**まず producer（B 抽出）**を固め、render 変化を伴う E は分けるのが外科的。

## 10. action-state との関係（§10）
- action-state は `result.display` を丸ごと運ぶ → adapter が externalLinks を attach すれば **ready action-state に自動的に乗る**（D-A・追加型変更なし）。
- **not-ready/unavailable/invalid は links を運べない**（構造保証）。

## 11. 将来 test（§11・実装時）
**B（抽出 helper）slice**:
- 1 個の confirmed shared destination_area → その候補を返す。
- private/participant 所有 destination → null。
- unconfirmed/proposed/missing/retracted/partial/空 areaText → null。
- distinct areaText 2 個以上 → null（fail-closed）。
- 同一 areaText の複数 slot → 1 候補（distinct 1）。
- pure・deterministic・slots 非破壊・engine/provider/M2/fetch 非依存。
**C（adapter 配線）slice（option・別 GO）**:
- option false（or absent）→ helper 未呼び出し・externalLinks absent（既存挙動・test green）。
- option true + confirmed shared destination → externalLinks に generated maps link 1 本。
- option true + private/participant/unconfirmed/missing destination → externalLinks なし。
- 複数 distinct destination → fail-closed（links なし）。
- manual link 捏造なし。
- adapter は fetch/API/DB/Supabase なし・Maps/Places API なし・raw intents を出さない。
- not-ready states は externalLinks を持てない（構造）。
- **tsc baseline 不変（55）**・既存 travel tests green（B は新規 helper／C は option OFF で不変）。

## 12. 実装オプション + 推奨（§12・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| A. adapter option 型のみ | `includeExternalLinks?` 型追加 | 小さいが単独では無動作（B/C と束ねる方が自然） |
| **B. destination 抽出 pure helper のみ** | `extractGeneratedLinkDestination(slots)`（§6 fail-closed ルール・unwired） | **推奨・最初**（nontrivial ロジックを隔離テスト・挙動不変） |
| C. adapter が helper を呼び option 下で attach | ready 分岐配線 + option 第3引数 | 後（契約明示更新・render は E まで不変） |
| D. panel が externalLinks を consume | `?? []` を component へ | 後（別 GO・render 変化） |
| E. B+C+D を flag-off-safe 一括 | — | 代替（option OFF なら test green だが render 変化を含むため分割を推す） |

**推奨実装スライス: B のみ（純粋 destination 抽出 helper・unwired・挙動不変）。** 発見3 の fail-closed/複数/shared-safe/confirmed ルールは nontrivial ゆえ独立テストで固める。次に **C（adapter が option 下で B+B-D-A を呼び attach・契約明示更新）**、その後 **D/E（panel consume）** を別 GO。
```
// スケッチ（未実装・pure）
import type { ExtractedSlot } from "./slot-types";
import type { TravelExternalLinkDestinationCandidate } from "./travel-external-link-preparation";

/** confirmed shared-safe な単一 destination_area を抽出（複数 distinct/private/未確定 → null）。 */
function extractGeneratedLinkDestination(slots: readonly ExtractedSlot[]): TravelExternalLinkDestinationCandidate | null {
  if (!Array.isArray(slots)) return null;
  const cand = slots.filter(
    (s) => s.key === "destination_area" && s.status === "confirmed" && s.fillState === "filled"
      && s.visibility === "shared" && s.owner.kind === "shared"
      && typeof s.value?.areaText === "string" && s.value.areaText.trim().length > 0,
  );
  const distinct = [...new Set(cand.map((s) => (s.value as { areaText: string }).areaText.trim()))];
  if (distinct.length !== 1) return null; // 0 or 複数 → fail-closed
  return { label: distinct[0], status: "confirmed", visibility: "shared", owner: { kind: "shared" } };
}
// 後の C: adapter ready 分岐で options.includeExternalLinks 時のみ:
//   const dest = extractGeneratedLinkDestination(provided.input.slots);
//   const externalLinks = prepareTravelExternalLinkHrefModels(dest ? { destination: dest } : {});
//   return { status:"ready", display: { packet, projection, cues, ...(externalLinks.length ? { externalLinks } : {}) } };
```
- **C（adapter 配線・option）/ D（panel）/ E / production deny は HOLD。**

## 13. Stop
- 本書（Adapter Producer Wiring Design）で**停止**。
- adapter 配線実装は **CEO 承認まで行わない**（B 抽出 helper も含め GO 待ち）。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **B adapter producer wiring（docs-only）**、実装は **SPLIT で「B 純粋 destination 抽出 helper のみ」先行**を推奨。producer は link の source ゆえ panel consumer より先。だが adapter 契約越え + render 変化を伴うため、抽出 helper（挙動不変）→ adapter 配線（option 既定 OFF）→ panel の段階。
- **★ grounding 3 発見（①②）**: (1) ready destination は **confirmed-real（explicit 由来＝status confirmed が正常形）**・session_context は destination を confirm 不能ゆえ「normalized provider-ready destination」は存在しない（CEO §6 の該当分岐は不要）。(2) slot は owner/visibility を持ち **shared-safe gate 必須**。(3) destination_area は複数あり得るため **決定論的 fail-closed**（distinct 1 個のみ生成・複数 distinct は推測せず null）。
- **gate（④）**: adapter に **additive optional 第3引数 `{ includeExternalLinks?: boolean }`**（absent=false・既定 OFF・production deny・client flag なし・env 非読込）。caller（action）が既存 gate に基づき真偽を決める。OFF で従来挙動・test green・dark-launch。
- **抽出ルール（③⑥⑦）**: `destination_area` ∧ status confirmed ∧ filled ∧ shared-safe（owner shared かつ visibility shared）∧ 非空 areaText の **distinct が 1 個**のときだけ候補化、0/複数は **fail-closed**。helper/Tier1-C が再 gate（二重 gate＝安全）。manual 捏造なし。
- **honesty**: 空 links は attach せず absent（「無し」と「空」を区別しない）。not-ready/unavailable/invalid は構造的に links 不能。raw intents/diagnostics を UI に出さない。
- **推奨実装スライス**: **B（`extractGeneratedLinkDestination` 純粋抽出 helper・unwired・挙動不変・fail-closed/shared-safe/confirmed ルール）**。**C（adapter が option 下で attach・契約明示更新）/ D（panel consume）/ E / production deny は HOLD。D-A により action-state 運搬は自動。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
