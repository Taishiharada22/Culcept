# Life Ops — A-4-c40 Accept → Plan Seed Semantics Design（**docs-only・実装禁止・apply track GO まで凍結**）

> 2026-06-11 / CEO GO（縦監査③残件「accept→plan seed 化」への応答）。
> **本書は意味論と接続契約のみ**。DB write / server action / PlanClient apply / migration / flag 追加は一切しない。
> 正本: plan seed / apply の意味論は **A1-6 apply track が owner**。本書は横セッション（A-4 Life Ops）側から渡す handoff 契約。

---

## 1. accept の意味論（4 つの読みを分離する）

「採用」には 4 つの読みが混在しうる。c40 はこれを**1 つに確定**する:

| 読み | c40 の扱い |
|---|---|
| (a) 採用したい（好み学習） | ❌ accept の意味ではない（好み学習は M1 feedback 行の副次利用として将来検討・本書スコープ外） |
| (b) **今日の案に入れたい** | ✅ **これが accept の唯一の意味** |
| (c) 実際に予定化したい | ❌ accept 単独では到達しない（**user review → apply を経て初めて**予定/proposal になる） |
| (d) 完了した | ❌ done の領分（§2） |

**確定義**: `accept = 「この候補を今日の案に入れる意図の表明」→ plan seed（review 待ちの提案種）を 1 件作る。それ以上のことは何も起きない。`

パイプライン全体像:

```
LifeOpsCandidate（日次再計算・揮発）
  → accept intent（client は candidateKey + action のみ送信）
  → server 再検証（§5）
  → LifeOpsPlanSeed 作成（status=pending_review・§3）
  ───────── ここまでが Life Ops 側（横）の責務上限 ─────────
  → user review（apply track の surface・必須・スキップ不可）
  → apply（schedule item or proposal へ）/ reject / 放置→expire
  ───────── ここから先は A1-6 apply track の正本領域 ─────────
```

## 2. done との違い（cadence 不変則の防衛）

| | done | accept |
|---|---|---|
| 性質 | **事実の報告**（過去・完了した） | **意図の表明**（未来・やるつもり） |
| cadence | **唯一の駆動ソース**（c14/c20 不変則） | **一切動かさない**（やっていないので学習対象外） |
| deadline suppression | 同 key 候補を窓内抑制（c22） | **しない**（完了していない）。ただし pending seed 存在中は同 key 候補の**presentation 抑制**（恒久でない・seed が rejected/expired/withdrawn になれば再提示） |
| 確認 | PRG 2 段階必須（恒久的な学習影響があるため） | 1 段階 + undo（§8・review が必ず挟まり恒久影響がないため） |
| 取消 | 不可（事実の訂正は別問題） | **pending 中はいつでも withdraw 可**（§9） |

**不変則の明文化**: accept・seed・apply・reject のいずれも `lifeops_feedback` の done 行と cadence 計算に**触れない**。apply された item が後日実際に完了した時、その完了を done に写像するかは apply track への open question（§10-Q3）であり、写像する場合も「事実の完了イベント」だけが cadence を動かす。

## 3. LifeOpsPlanSeed 変換案（DTO 契約・**candidate をそのまま plan item にしない**）

```ts
/** Life Ops 候補 → review 待ちの提案種。free text / PII / handle / raw の口なし（全 field 辞書 or 数値由来）。 */
interface LifeOpsPlanSeedDraft {
  readonly seedKind: "lifeops_candidate";          // seed の出自判別（apply track の他 seed と区別）
  readonly candidateKey: string;                    // {category}:{menu}（lifeOpsMomentKey・非 handle）
  readonly occurrenceKey: string;                   // c32 形式（cat:menu:date | cat:menu:cadence）= 重複/期限照合キー
  readonly categoryId: string;                      // 辞書 id のみ（app 層 validation・c27 と同方式）
  readonly menu: string | null;                     // 辞書 menu のみ
  readonly dueKind: "deadline" | "cycle" | "event_prep";
  readonly dueDateISO: string | null;               // deadline のみ・YYYY-MM-DD
  readonly suggestedWindow: { readonly startMinute: number; readonly endMinute: number } | null; // placement 由来・**提案であって確定でない**（review で変更可）
  readonly estimatedDurationMin: number | null;     // 候補の標準所要（辞書由来）
  readonly status: "pending_review";                // 作成時は常に pending_review
  readonly expiresAtISO: string;                    // stale 防止（提案値: 翌日 23:59 JST・未 review なら expired）
  readonly forDateISO: string;                      // 「今日の案」の対象日（seed は日付 scope）
}
```

- **label/title は保存しない**: 表示名は render 時に辞書から再生成（free text 列を構造的に作らない・c27 原則の継承）。
- lifecycle: `pending_review → applied | rejected | withdrawn | expired`（遷移は apply track 管理。横が定義するのは初期状態のみ）。
- 保存先（`plan_seeds` 既存 table か `lifeops_plan_seeds` 新設か）は **apply track 決定事項**（§10-Q1）。

## 4. apply track との境界（boundary 宣言）

| 横セッション（A-4）がやる | A1-6 apply track がやる |
|---|---|
| accept intent の受領・server 再検証（§5） | seed の保存先 schema / migration |
| `LifeOpsPlanSeedDraft` の構築 contract（§3） | review surface（UI・R2 proposal との統合位置） |
| rail への accept 解禁（apply track GO 後・別 slice） | apply 実行（schedule item / proposal 化） |
| pending seed による presentation 抑制 | applied 後の編集・削除・完了 |
| withdraw（pending 中のみ） | 完了イベント→done 写像の要否（§10-Q3） |

**禁止の再確認**: 横は `plan_seeds` 系 table へ write しない・apply server action を作らない・PlanClient に apply UI を足さない。本書の範囲は契約まで。

## 5. server-side 再検証（c17 パターンの継承 + seed 固有 3 検査）

client から信用する入力は **candidateKey + action="accept" のみ**（handle/category/menu/free text は受けない）。server で:

1. **存在検証**: `computeLifeOpsMainlineModel` → `selectLifeOpsMainlineRepresentatives` を再計算し、candidateKey が現在の代表（+sparse fallback）に実在するか照合。不在 → `invalid`（候補が消えた/偽造/陳腐化を区別しない＝情報を漏らさない）。
2. **duplicate 検査**: 同 `occurrenceKey` の active（pending_review）seed が既存 → `already_seeded`（書かない）。
3. **capacity 検査**: 当日 `forDateISO` の pending seed 数 ≥ cap（提案値 3・代表 cap と同数）→ `seed_capacity`（書かない・fail-closed）。
4. **permission 検査**: 候補の risk/permission が閾値超え → そもそも rail に accept を出さない（descriptor 層 filter・server 側でも同条件で拒否＝二重化）。

## 6. UI 文言案（「採用」を使わない）

| 箇所 | 案 | 理由 |
|---|---|---|
| rail ボタン | **「今日の案に入れる」** | accept の確定義 (§1-b) をそのまま言語化。「採用」は (a)(c) と混同・「予定に追加」は (c) と誤認 |
| 成功 message | 「今日の案の候補に追加しました。**確認してから反映されます**」 | review 必須を予告（勝手に予定化される不安の除去） |
| pending 表示 | 「確認待ち」badge | — |
| undo | 「やっぱり外す」 | 軽い取消であることをトーンで表現 |
| footnote | 「すぐに予定にはなりません。あなたが確認した分だけ反映されます」 | 既存「予定には追加しません」と整合する世界観（ユーザー主権） |

## 7. failure / duplicate / stale / capacity 方針

| ケース | token 案 | 挙動 | 表示（amber・非 bold） |
|---|---|---|---|
| 同 occurrenceKey の pending seed 既存 | `already_seeded` | 書かない | 「すでに今日の案の候補にあります」 |
| candidate 消失（再計算で不在） | `invalid`（既存流用） | 書かない | 既存 invalid 文言 |
| 当日 cap 超過 | `seed_capacity` | 書かない（fail-closed） | 「今日の候補はいっぱいです。また明日提案します」 |
| permission/risk 高 | （token 不要） | rail に出さない + server 拒否 | — |
| review されず期限切れ | （表示なし） | seed→expired・候補は再提示可能に戻る | — |

## 8. permission / confirmation

- **accept = 1 段階 + undo**（done の 2 段階と非対称にする設計判断）: done は cadence を恒久的に動かすため 2 段階が必須だったが、accept は (i) review が必ず挟まる (ii) pending 中 withdraw 可 (iii) 学習に影響しない、の 3 重の安全網があり、2 段階は摩擦過剰。
- **plan に実際に入る操作（apply）= user confirmation 必須**: これは review そのものが担う（apply track の surface）。
- **external action は別 gate**: 予約/購入/連絡を伴う候補（beauty_salon 等）でも、seed/apply が扱うのは「行く時間を案に入れる」まで。予約行為そのものは本設計の対象外（将来の external action gate・恒久分離）。

## 9. rollback / undo

- **pending_review 中**: 「やっぱり外す」1 click → `withdrawn`（行は監査用に残す・active 判定から除外）。候補は次回計算から再提示可能。
- **apply 後**: 取消 = schedule item / proposal の削除 → apply track の領分。
- **done と完全独立**: withdraw/reject/expire は cadence・done 履歴・deadline suppression に影響ゼロ（§2 不変則）。

## 10. gate と handoff（A1-6 apply track への引き継ぎ）

**gate 設計（実装時・今は作らない）**: 新 dormant flag `LIFEOPS_ACCEPT_SEED`（default OFF）∧ mainline gate（staging∧!prod）∧ **A1-6 apply track の seed 受け口実装完了**。production は P0-P5 matrix（c35）に accept stage を追加する形で別 CEO gate。

**apply track への open questions**:
- **Q1 保存先**: 既存 `plan_seeds` に seedKind で同居か、`lifeops_plan_seeds` 新設か（RLS/expiry index の都合は apply track 判断）。
- **Q2 review surface**: R2 の 3 案 proposal UI に「Life Ops 由来」として混ぜるか、独立 review 列か。
- **Q3 完了写像**: applied item の完了イベントを Life Ops done に写像するか（写像するなら cadence が動く＝「事実の完了」確認が条件）。
- **Q4 capacity 値**: pending cap 3/day は提案値。R2 pool cap(5)・代表 cap(3) との整合は apply track + CEO で確定。

**test plan（実装時）**: ①flag default OFF で rail に accept 不在（現状維持 lock 流用）②server: 4 検査の単体（存在/duplicate/capacity/permission）③accept が cadence・done 履歴・suppression に不影響（不変則 lock）④seed DTO に free text/PII/handle の口なし（型 + static）⑤withdraw 遷移⑥expired 後の候補再提示。

## 11. risk matrix

| リスク | 影響 | 緩和 |
|---|---|---|
| accept を「予定に入った」と誤解 | 信頼毀損（最重要） | 文言（§6）+ review 必須 + footnote |
| seed 二重作成 | review 画面の混乱 | occurrenceKey duplicate 検査（§5-2） |
| 放置 seed の腐敗 | stale な提案が残る | expiry（翌日末）+ expired→再提示 |
| cadence 汚染 | 学習破壊 | §2 不変則 + 不変則 lock test |
| boundary 侵犯（横が plan_seeds に write） | track 間整合崩壊 | 本書 §4 + 実装は apply track GO 後の別 slice |
