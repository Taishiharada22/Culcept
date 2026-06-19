# C — Adapter ExternalLinks Attach Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> DB・RLS / M2 runtime / CoAlter runtime / 外部 retrieval / Maps・Places API / URL fetch / 外部遷移 production release は HOLD。
> 上位文脈: Tier1-A〜C + Preparation + B-D-A（`prepareTravelExternalLinkHrefModels`）+ B（`extractGeneratedLinkDestination`）+ D-A（`externalLinks?` 型 field）。**全 pure・unwired**。
> **本書 = adapter ready 分岐が抽出 + preparation を default-OFF option 下で呼び `display.externalLinks` を attach する producer 配線**。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- `TravelPlanDisplayPayload.externalLinks?: SafeTravelLinkHrefModel[]`（D-A・optional）。
- `extractGeneratedLinkDestination(slots): TravelExternalLinkDestinationCandidate | null`（B・pure・unwired・confirmed shared-safe・fail-closed）。
- `prepareTravelExternalLinkHrefModels({destination?,entity?,manualIntents?}): SafeTravelLinkHrefModel[]`（B-D-A・pure・unwired・生成+変換合成）。
- adapter ready 分岐（`travel-plan-display-adapter.ts:58-63`）: `provided.input.slots`（confirmed-real slots・server-only）→ `{ status:"ready", display: { packet, projection, cues } }`。
- not-ready/unavailable/invalid は **`display` を運ばない**（`TravelPlanDisplayResult` 型）。
- `toTravelLiveActionState` は ready の `result.display` を**丸ごと**運ぶ。
- adapter 契約（line 14）: 「外部 retrieval / safe links / Maps URL なし」。
- `TravelLivePanel` は **`display.externalLinks` を未読**。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | リスク | 価値 | 評価 |
|---|---|---|---|
| **C adapter attach（本書）** | 低（A+B のみ・option 既定 OFF・caller 未配線＝production 無影響） | 高（抽出/prep helper を初めて結線し externalLinks を populate） | **推奨・次（設計のみ→A+B 実装）** |
| D panel consumer wiring | 低 | 中 | **C の後**（producer が populate して初めて render 対象が在る） |
| Tier1-C render distinction | 低 | 中 | 後（link が render された後） |
| SQL/RLS persistence | **高**（DB migration＝§1 CEO 承認） | 中 | 後 |
| production deny release | 最大 gate | — | **最後** |

**推奨: C 次・docs-only。実装は E スライス（A+B のみ）。** 根拠（①⑤）: B/B-D-A helper は unwired。C は adapter ready 分岐でそれらを **option 既定 OFF** 下に結線し externalLinks を attach する。**caller（action）は option を渡さない・panel は未読**ゆえ **production 挙動は不変**（二重に安全）。helper を「使える」状態にする producer の核。

### ★ 設計の核（③④）— OFF で byte 等価・additive option・helper 合成のみ
- option **absent/false → 抽出も prep も呼ばず externalLinks を set しない**＝**従来結果と byte 等価**。
- option は **additive optional 第3引数**＝既存 2-arg caller/test は不変（tsc 55 維持）。
- adapter は **抽出 helper と prep helper を呼ぶだけ**（URL 構築も generated marker も持たない＝両 helper に委譲）。

---

## 2. 現 producer assets（②）
- `externalLinks?` 型 field（D-A）存在。
- `extractGeneratedLinkDestination`（B）存在・unwired。
- `prepareTravelExternalLinkHrefModels`（B-D-A）存在・unwired。
- `buildGeneratedMapsSearchIntent`（Tier1-C）存在（prep が内部合成）。
- adapter ready 分岐に `provided.input.slots`。
- not-ready は構造的に display を持てない。
- panel は `display.externalLinks` 未読。

## 3. adapter option（§3）
- **additive optional 第3引数**: `buildTravelPlanDisplayResult(input, gate, options?: { includeExternalLinks?: boolean })`。
- **absent = false**。
- **false → byte 等価**（attach ロジックを `if (options?.includeExternalLinks)` 内に閉じる）。
- adapter は **`process.env` を読まない**・**client flag を読まない**。
- option の真偽は **caller/server gate が決める**（C 本 phase では caller 未配線）。
- **production deny は adapter の外**（既存 gate / action）。

## 4. adapter 契約更新（§4・明示）
現契約「safe links / Maps URL なし」を **明示更新**:
- **既定では adapter は external link を産まない**。
- **server option で明示有効化された時のみ**、ready display は **confirmed shared-safe destination から generated Maps 検索 hand-off link** を含み得る。
- adapter は依然 **主張しない**: 外部 retrieval / exact place 解決 / Maps・Places API / manual URL support / booking・availability・price・route。

## 5. producer flow（§5）
- **ready 分岐のみ**。
- option **false/absent**:
  - 抽出 helper を呼ばない・link helper を呼ばない・`externalLinks` を set しない（従来挙動）。
- option **true**:
  - `extractGeneratedLinkDestination(provided.input.slots)` を呼ぶ。
  - 返った候補（or null）を `prepareTravelExternalLinkHrefModels(dest ? { destination: dest } : {})` に渡す。
  - **候補なし → externalLinks なし**。
  - **非空 models → `display.externalLinks` に attach**。
  - **空 models → field を absent のまま**（「無し」と「空」を区別しない・UI は `?? []` で同一扱い）。
- **manual intents を捏造しない**・**raw intents を UI に出さない**・**raw diagnostics を出さない**。

## 6. helper composition（§6）
- adapter は `extractGeneratedLinkDestination` / `prepareTravelExternalLinkHrefModels` を import してよい。
- adapter は **`buildGeneratedMapsSearchIntent` を直接 import しない**（prep が内部合成）。
- adapter は **`buildSafeTravelLinkHrefModel` を import しない**。
- adapter は **URL 構築ロジックを持たない**・**generated marker ロジックを持たない**。
- adapter は **slots を供給し models を attach するだけ**。

## 7. not-ready 挙動（§7）
- not_ready_missing / not_ready_unconfirmed / unavailable / invalid は **display なし＝externalLinks なし**。
- **構造以上の runtime guard 不要**（型で links 不能）。

## 8. panel との関係（§8）
- panel consumer 配線（D）は **本 phase で HOLD**。
- C 後、`display.externalLinks` は **存在し得るが panel 未読なので render されない**（無害）。
- **本 phase で panel を触らない**・`TravelExternalLinks` prop 変更なし。

## 9. action-state との関係（§9）
- ready action-state は `result.display` を丸ごと運ぶ → adapter が `externalLinks` を set すれば **自動的に運ばれる**（D-A・型変更なし）。
- **server action の option 渡しは別 wiring**（本 phase では action 不変＝option 渡さない＝OFF のまま）。
- 現 action が option を渡さない限り **挙動 OFF**。

## 10. gate との関係（§10）
- adapter option は **後で server-only travel live gate から供給**される（別 wiring）。
- **production deny は HOLD**・**preview flag は production 生成を有効化しない**・**`NEXT_PUBLIC` flag なし**・**gate ルール変更なし**（本 phase は設計のみ／実装は adapter 内の option 受け口だけ）。

## 11. privacy（§11）
- 抽出 helper が **shared visibility + shared owner** を強制（B）。
- **private/participant destination label なし**・**raw userId なし**・**M2/Stargazer data なし**・**participant/relationship state なし**・**label 内 private rationale なし**。
- **raw intents を UI に出さない**・**client-only filtering 禁止**。

## 12. 将来 test（§12・実装時）
- option absent → 抽出/helper 未呼び出し・externalLinks なし（byte 等価）。
- option false → 同上。
- option true + confirmed shared destination → externalLinks に generated Maps link 1 本。
- option true + private destination → links なし。
- option true + participant 所有 destination → links なし。
- option true + unconfirmed/proposed/missing destination → links なし。
- 複数 distinct destination → links なし（fail-closed）。
- not-ready states は externalLinks を持てない（構造）。
- adapter は Maps/Places API を import しない・fetch/API/DB/Supabase なし・M2 runtime なし・CoAlter/useCoAlter なし・`/talk` なし・raw intents を出さない。
- **tsc baseline 不変（55）**・既存 travel tests green（option OFF で byte 等価）。

## 13. 実装オプション + 推奨（§13・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| A. adapter option 型のみ | `includeExternalLinks?` 引数追加 | 単独では無動作（B と束ねる） |
| B. adapter が抽出+prep を呼び option 下で attach | ready 分岐配線 | 本体 |
| C. server action が gate から option を渡す | action 配線 | 後（別 GO・production 接続前段） |
| D. panel が externalLinks を consume | render | 後（別 GO・render 変化） |
| **E. A+B のみ（C/D は HOLD）** | option 受け口 + attach・action/panel 不変 | **◎ 推奨** |

**推奨実装スライス: E（A+B のみ）。**
- adapter に optional option（absent=false）。
- option 下で `extractGeneratedLinkDestination` → `prepareTravelExternalLinkHrefModels` → 非空なら `display.externalLinks` に attach。
- **server action 変更なし**・**panel 変更なし**。
- **option は誰も渡さない＝production 挙動不変**（二重安全: 渡されても panel 未読で render されない）。
- test は **adapter を直接 option true/false で呼ぶ**。
```
// スケッチ（未実装）
import { extractGeneratedLinkDestination } from "./generated-link-destination";
import { prepareTravelExternalLinkHrefModels } from "./travel-external-link-preparation";

export function buildTravelPlanDisplayResult(
  input: TravelPlanDisplayInput,
  gate: TravelInputProviderGate,
  options?: { includeExternalLinks?: boolean }, // ★ additive・absent=false
): TravelPlanDisplayResult {
  // …既存（unavailable/not_ready/invalid は不変・display を持たない）…
  // ready:
  const cues = deriveCoAlterProjectionCues(projection);
  if (options?.includeExternalLinks) {
    const dest = extractGeneratedLinkDestination(provided.input.slots);
    const externalLinks = prepareTravelExternalLinkHrefModels(dest ? { destination: dest } : {});
    if (externalLinks.length > 0) {
      return { status: "ready", display: { packet, projection, cues, externalLinks } };
    }
  }
  return { status: "ready", display: { packet, projection, cues } }; // OFF/空 → 従来と byte 等価
}
```
- **C（action 配線）/ D（panel consume）/ production deny は HOLD。**

## 14. Stop
- 本書（Adapter ExternalLinks Attach Design）で**停止**。
- adapter attach 実装は **CEO 承認まで行わない**。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **C adapter attach（docs-only）**、実装は **E スライス（A+B のみ）**。B/B-D-A helper を adapter ready 分岐で **default-OFF option** 下に結線し externalLinks を attach。caller 未配線 + panel 未読ゆえ **production 挙動不変**（二重安全）。
- **OFF で byte 等価（③④）**: option **absent/false** は attach ロジックに入らず **従来結果と byte 等価**。option は **additive optional 第3引数**＝既存 caller/test 不変・tsc 55 維持。
- **helper 合成のみ（④）**: adapter は `extractGeneratedLinkDestination` + `prepareTravelExternalLinkHrefModels` を呼ぶだけ。**`buildGeneratedMapsSearchIntent`/`buildSafeTravelLinkHrefModel` を直接 import せず**・**URL 構築も generated marker も持たない**（両 helper に委譲）。
- **flow**: ready のみ。option true で 抽出（confirmed shared-safe・fail-closed）→ prep → **非空なら attach・空なら absent**。manual 捏造なし・raw intents/diagnostics を UI に出さない。
- **境界**: not-ready/unavailable/invalid は構造的に externalLinks 不能。panel/action は **本 phase で不触**（HOLD）。production deny は adapter 外・HOLD。
- **推奨実装スライス**: **E（A+B）— adapter optional option（absent=false）+ option 下 attach・action/panel 不変・test は adapter 直呼び**。**C（action 配線）/ D（panel consume）/ production deny は HOLD。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
