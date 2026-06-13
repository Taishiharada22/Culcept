# RJ2e-0 — User-Facing Copy / Language Surface Design（設計提出のみ・コード禁止・実装は CEO 承認 gate）

- 日付: 2026-06-14 / 作成: copy surface 設計セッション
- 位置づけ: RJ2e で扱う **自然言語文面（user-facing copy）**の生成可否・CEO 承認 gate・kind 別文面制限・assertion/verdict 禁止・leak 防止の **設計境界をコードを書く前に確定**する設計書。
- 正本: `docs/reality-judgment-surface-boundary-rj2-0.md`（RJ2-0/RJ2-0A・G5 DELIVERY）。上流 = RJ2d `SurfaceProjectionConsumerViewV0`（consumer-safe・category-free・文面なし）。
- 規律: **コードを書かない**。本書は設計提出のみ。**RJ2e は user-facing copy ゆえ実装に二重 gate（①技術安全 ②CEO による文面/トーン/世界観承認）が必要**。RJ2e-0 完了時点で勝手に実装に進まない。
- 範囲: RJ2e は **consumer view → 自然言語文面の生成境界（生成可否・制限・安全則）** の設計のみ。notification/contact（RJ2f）は分離・HOLD。proposal/departure content も HOLD。
- **RJ2e-0A 改訂（2026-06-14）**: CEO 監査 + 内部敵対批評（rate-limit で workflow 失敗 → 4 レンズを自己適用）を反映。①論理修正: 「入力が安全だから文面も安全」は**言い過ぎ** → 正しくは「**consumer view が安全ゆえ copy 層の入力面は安全。出力文面の安全性は exact template 正本 + walker で保証**」。②**exact template catalog / exact choice label catalog / forbidden lexicon / allowed lexicon を正本化**（§11）。③copyViolations を whitelist 方式に精密化（§11.6）。④`renderCopy` は入力 view を `surfaceProjectionConsumerViewViolations` で**再検証**し違反なら throw（RJ2d を信用しきらない・§11.7）。⑤dynamic interpolation 禁止 + LLM 自由生成禁止。**§11 が exact catalog 正本**（§2/§3/§4 の「相当/例」に優先・ただし最終文言は CEO 承認）。

---

## 0. 前提を疑う（CEO ① — RJ2e の核心と「安全な入口」）

**RJ2e は「初めてユーザーが読む文章」を作る層。** ここまで RJ2a/b/c/d は全て「構造」だった。RJ2e で初めて自然言語になる。**最も慎重を要する**（誤った文面は誤解・不信・機微漏洩を直接生む）。

**安全則 = 入力面は安全 / 出力面は template 正本 + walker（CEO ⑦ + RJ2e-0A 修正）。** RJ2d が consumer view を **category-free**（sensitive/work/reservation/otherPeople を `needs_verification` に潰し済）・**verdict-free**（feasibility verdict を claimType から排除済）・**opaque subject**（raw id なし）に作った。よって RJ2e の入力（consumer view）には**機微情報も verdict も raw id も最初から存在しない** = **入力面は安全**。

**ただし「入力が安全だから文面も安全」は言い過ぎ（RJ2e-0A 修正）。** copy 層は入力に無い意味を**テンプレート側が追加できる**（例: 「気にかける点があります」は不安を煽り得る・「重なって見える」は衝突を示唆し得る・「補う」は何を補うか曖昧で憶測を誘発し得る）。よって出力文面の安全性は **exact template 正本（§11・固定句・dynamic interpolation なし）+ copyViolations walker（forbidden lexicon scan・whitelist・backstop）** で保証する。入力安全 ∧ 出力 template 正本 ∧ walker の三層で、user-facing でも漏洩・断定・不安喚起が起きない。

**裁定（前提を疑う）: RJ2e は LLM 自由生成にしない（v0）。** realityCore は pure（LLM 不使用）。RJ2e v0 は **consumer-safe kind → 決定的テンプレート文**（固定句・hedged・neutral）に限定する。自由生成（LLM）は「機微漏洩・verdict 断定・幻覚」のリスクを copy 層に持ち込む。v0 = テンプレート、将来の LLM 文面化は別 slice + CEO 承認 + 専用 red-team。

**二重 gate（CLAUDE.md 運用規約）.** user-facing copy・トーン・世界観は**ブランド/世界観に関わる CEO 専管**。RJ2e 実装 GO は技術安全だけでなく **CEO による文面/トーン承認**を要する。本書は技術安全の envelope を確定するが、voice/tone の確定は CEO/Growth track（別）。

---

## 1. 対象ファイル案（実装は CEO 二重 gate 後）

| 区分 | ファイル | 内容 |
|---|---|---|
| **追加（GO 後）** | `lib/plan/realityCore/copySurface.ts` | 型 + `renderCopy`（consumer view → 決定的テンプレート文）+ `copyViolations` + `COPY_SURFACE_VERSION` |
| **追加（GO 後）** | `tests/unit/copySurface.test.ts` | §6 fixtures |
| **変更** | `docs/reality-department-matrix.md` | RJ2e §5 適用記録（実装完了時） |
| **触らない（不接触）** | RJ2a/b/c/d 4 ファイル + 既存 6 判断器 + ern/cs/mv/snapshot/identity | consume のみ（consumer view 型 import） |
| **触らない** | UI / app / API route / migration / supabase / localStorage | 一切不接触 |

**方針**: RJ2e は **consumer view のみ**を consume（plan/claim/question/projection internal bundle を読まない）。consumer view は既に安全ゆえ、RJ2e の入力面が最小かつ安全。

---

## 2. 実装する型の確定（設計・GO 後に実装）

```ts
export const COPY_SURFACE_VERSION = 0;

/** 文面の語調（v0 は neutral/hedged のみ・assertion/verdict 不可） */
export type CopyTone = "neutral" | "hedged";

/** claim 1 件の文面（テンプレート由来・自由生成でない） */
export interface RenderedClaimCopy {
  readonly kind: ProjectedClaimKind;   // consumer-safe（入力由来）
  readonly text: string;               // 決定的テンプレート文（hedged・verdict なし・raw ref なし）
  readonly tone: CopyTone;
}

/** question 1 件の文面（テンプレート由来） */
export interface RenderedQuestionCopy {
  readonly kind: ProjectedQuestionKind;
  readonly text: string;               // 確認文（断定でなく確認・選択肢文面は §4.4）
  readonly choiceLabels: ReadonlyArray<string>; // generic label のみ（はい/いいえ 等・機微非露出・§4.4）
  readonly tone: CopyTone;
}

export interface RenderedCopyV0 {
  readonly schemaVersion: 0;
  readonly display: "render" | "suppress"; // consumer view から carry
  readonly claimCopies: ReadonlyArray<RenderedClaimCopy>;     // suppress なら []
  readonly questionCopies: ReadonlyArray<RenderedQuestionCopy>;
  // proposal/departure 文面なし（HOLD）・notification 文面なし（RJ2f）・raw ref/id なし
}

export function renderCopy(view: SurfaceProjectionConsumerViewV0): RenderedCopyV0;
export function copyViolations(c: RenderedCopyV0): string[];
```

`ProjectedClaimKind` / `ProjectedQuestionKind` / `SurfaceProjectionConsumerViewV0` は RJ2d から **import**。

### 2.1 RJ2e で **実装しない**（明示 defer / HOLD）

| 機能 | 所有 | RJ2e での扱い |
|---|---|---|
| LLM 自由生成 / 動的文面 | 将来 slice + CEO | **HOLD**。v0 は決定的テンプレートのみ |
| proposal / 3案 / departure 文面 | RJ2d+/RC4 | **HOLD**。content なし |
| notification / contact 文面 | RJ2f | **HOLD**。型すら定義しない |
| voice/tone の確定（世界観） | CEO/Growth | v0 は neutral baseline。最終 voice は CEO 承認 track |

---

## 3. `renderCopy` の入力 / 出力契約

### 3.1 入力 = consumer view のみ

```ts
function renderCopy(view: SurfaceProjectionConsumerViewV0): RenderedCopyV0
```

- **入力は consumer view のみ**（plan/claim/question/internal bundle を読まない）。consumer view は category-free・verdict-free・opaque ゆえ、RJ2e は**機微・verdict・raw id を入力として持たない**（安全 by construction）。
- 上流が安全なので RJ2e に integrity guard は不要だが、入力 view が `surfaceProjectionConsumerViewViolations(view)` を通過済であることを**前提**にする（違反 view なら throw）。

### 3.2 出力（v0 制約）

`RenderedCopyV0`。**v0 で必ず守る**:
- `display === "suppress"` → claimCopies/questionCopies []。
- text は **決定的テンプレート**（kind → 固定句）。自由生成・LLM・per-instance 動的文なし。
- **assertion / feasibility verdict を断定しない**（hedged/neutral・§4.1）。
- **leaveBy/ETA/departure/fake route の文面を作らない**（§4.2）。
- **sensitive/work/reservation/otherPeople を文面で漏らさない**（入力に無い + テンプレートが category 語を含まない・§4.3）。
- choiceLabels は **generic**（機微・選択肢内容を漏らさない・§4.4）。
- raw ref/id/opaque subject を文面に出さない（subjectRef は文面化しない・§4.5）。

### 3.3 kind → テンプレート写像（**exact catalog は §11 が正本**・下表は方針）

| consumer kind | テンプレート方針（例・最終文面は CEO 承認） | tone |
|---|---|---|
| `observation`（claim） | 状態の中立的言及（「〜という状況です」相当・断定なし） | neutral |
| `status_note`（claim） | 注意喚起の中立 note（「気にかける点があります」相当・崩れる断定なし） | hedged |
| `info_incomplete`（claim） | 情報不足の中立 note（「確定していない点があります」相当） | hedged |
| `needs_confirmation`（claim） | 確認が要る旨（「確認したいことがあります」相当・断定なし） | hedged |
| `needs_verification`（question） | 確認の問い（「確認してよいですか」相当・gate category 非露出） | hedged |
| `resolve_overlap`（question） | 重なりの確認（「同じ予定ですか / 別の予定が重なっていますか」相当・**duplicate 断定なし**・両義） | hedged |
| `resolve_missing_info`（question） | 不足情報の確認（「補ってよいですか」相当） | hedged |

> テンプレートは**固定句**（kind ごとに静的）。subject 名・時刻・場所・gate 種別を**差し込まない**（差し込み = 機微/raw 漏洩経路）。v0 は「何について」を語らず「種別ごとの中立句」のみ。

---

## 4. 安全則（copy 層の核）

### 4.1 assertion / feasibility verdict 禁止

- 「成立しません」「遅刻します」「失敗します」等の **verdict を断定しない**。テンプレートは hedged/neutral 固定句で、verdict 語（成立/不成立/遅刻/間に合わない/失敗）を**含まない**。walker が verdict 語を検出して FAIL。

### 4.2 leaveBy / ETA / departure / fake route 禁止

- 「何時に出れば」「〜分後に出発」「このルートで」等の **時刻逆算・出発線・経路文面を作らない**。テンプレートに時刻/分/出発/ルート語を含めない。walker が検出して FAIL。

### 4.3 sensitive / work / reservation / otherPeople を文面で漏らさない

- 二重保証: ①入力（consumer view）に category 情報が**無い**（RJ2d で `needs_verification` に潰し済）、②テンプレートが category 語（予約/支払/仕事/シフト/他者/機微/sensitive 等）を**含まない**。walker が category 語を検出して FAIL。

### 4.4 choice label 生成可否（**exact catalog は §11.3 が正本**）

- **裁定: generic label のみ可**（exact は §11.3）。`resolve_overlap` は **「候補A/候補B」も不可**（2 つの別予定を presuppose = 衝突断定）→ `["あとで確認", "まだ決めない"]` の最小 defer のみ（RJ1b・両義保持）。`resolve_missing_info` は「補う」を削除（曖昧）→ `["あとで確認", "そのまま"]`。**選択肢に subject 名・時刻・場所・gate 種別を差し込まない**。walker が label whitelist + raw/category/時刻語を検出して FAIL。

### 4.5 raw ref / id / opaque subject を文面化しない

- subjectRef（opaque）も文面に出さない（「subject_1」をユーザーに見せない）。text/choiceLabels に `subject_`/`relation_`/`ern:`/`cl:`/`q:`/`sp:`/`pj:` を含めない。walker が検出して FAIL。

---

## 5. `copyViolations` walker 設計（最小・空=適合）

1. display suppress なのに claimCopies/questionCopies 非空
2. text/choiceLabels に **verdict 語**（成立/不成立/infeasible/遅刻/間に合わ/失敗）混入
3. text/choiceLabels に **時刻逆算/departure/route 語**（時/分/出発/ルート/leaveBy/ETA）混入
4. text/choiceLabels に **category 語**（予約/支払/仕事/シフト/他者/機微/sensitive/reservation/work）混入
5. text/choiceLabels に **raw ref/opaque**（subject_/relation_/ern:/cl:/q:/sp:/pj:）混入
6. claim.kind / question.kind が consumer-safe enum 外
7. tone が neutral/hedged 以外（assertion tone 不可）
8. choiceLabels が generic 集合外（許可 label 以外）
9. text が空 / テンプレート由来でない（既知テンプレート集合に無い）
10. copy object に notification/contact/dispatch/action field が存在（FORBIDDEN_FIELDS）
11. **serialization backstop**: JSON.stringify(copy) に raw id token（ern:/cl:/q:/sp:/pj:）が出ない

---

## 6. fixtures / tests 設計（テスト名・目的）

`tests/unit/copySurface.test.ts`（consumer view → renderCopy → assert）。

| # | test 名 | 目的 |
|---|---|---|
| 1 | `display suppress → claimCopies [] / questionCopies []` | 何も文面化しない |
| 2 | `passive_only view → claim copies（hedged/neutral）・question copies []` | claim のみ |
| 3 | `ask_eligible view → claim + question copies` | 両方 |
| 4 | `verdict 語が文面に出ない（成立/不成立/遅刻/失敗）` | §4.1 |
| 5 | `時刻逆算/departure/route 語が出ない` | §4.2 |
| 6 | `category 語（予約/仕事/他者/機微）が出ない` | §4.3 |
| 7 | `4 gate → needs_verification → 全て同一テンプレート（区別不能）` | §4.3 + RJ2d carry |
| 8 | `resolve_overlap の choice label が duplicate 断定でない両義` | §4.4 |
| 9 | `choiceLabels が generic（subject/時刻/gate 非差し込み）` | §4.4 |
| 10 | `subjectRef/opaque/raw id が文面に出ない` | §4.5 |
| 11 | `copyViolations: verdict/時刻/category/raw 混入 → 非空` | walker FAIL 再現 |
| 12 | `serialization backstop（raw id token 非出現）` | leak backstop |
| 13 | `IO 不接触（source-scan）` | fetch/supabase/localStorage/.from(/geolocation/Date.now/Math.random/new Date( なし |

---

## 7. HOLD 項目（RJ2e で実装しない / 二重 gate）

- **RJ2e 実装そのものが CEO 二重 gate（①技術安全 ②文面/トーン/世界観承認）まで HOLD**。
- LLM 自由生成 / 動的文面（v0 はテンプレートのみ）
- proposal / 3案 / departure 文面
- Notification / contact 文面（RJ2f）
- UI connection / API 追加 / DB・Supabase write / localStorage / migration / external read / location / action / push / PR / deploy

---

## 8. RJ2e 実装 GO 条件（**二重 gate**・CEO 承認後）

**技術 gate**:
1. **pure**: I/O・時刻 API・乱数・LLM・UI なし。`copySurface.ts` は consumer view consume の読み取り専用。
2. **additive**: tsc baseline 維持（55）。**RJ2a/b/c/d 4 ファイル不接触**。
3. **v0 制約**: 決定的テンプレート / assertion・verdict なし / 時刻逆算・departure なし / category 語なし / generic choice label / raw ref なし。
4. **walker §5** が全 fixture で機能（verdict/時刻/category/raw/backstop）。
5. **全 fixture PASS**。full suite baseline FAIL 2 のみ（realityCore 外）。next build PASS。
6. **不接触確認**: UI/storage/API/DB/location/notification/external read 不接触。tree clean。production gate 未通過。

**ビジネス gate（CEO 専管・§11.10）**:
7. **CEO による exact template catalog（§11.1/§11.2）承認**。
8. **CEO による exact choice label catalog（§11.3）承認**。
9. **CEO による tone / 世界観（Alter 人格整合）承認**。
10. **RJ2f notification とは別 gate**（copy 承認 ≠ 配信承認）。
11. **HOLD 維持**: LLM 自由生成 / RJ2f（notification）に進まない。

> **重要**: RJ2e-0 完了時点で**勝手に実装に進まない**。RJ2e は user-facing ゆえ CEO の**二重 gate**承認を待つ。

---

## 9. Department Responsibility Matrix（RJ2e-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Communication**（copy envelope の技術安全）+ **Growth**（voice/tone/世界観・CEO 承認） |
| consultedDepartments | Product（体験文脈）・Permission（露出可否は RJ2d で確定済） |
| blockingDepartments | **CEO**（user-facing copy・トーン・世界観の二重 gate）+ Permission |
| outputs | RJ2e-0 設計（生成可否・kind 別制限・assertion/verdict 禁止・leak 防止・choice label・GO 二重 gate）。**コードなし** |
| safetyGate | **入力安全 by construction**（consumer view は category-free/verdict-free/opaque）・**決定的テンプレート**（LLM 自由生成なし）・**assertion/feasibility verdict 禁止**・**leaveBy/ETA/departure/route 文面禁止**・**category 語禁止**（二重保証）・**generic choice label**（duplicate 断定なし両義）・raw ref/opaque 非文面化・serialization backstop・notification/contact 分離（RJ2f HOLD）・**CEO 二重 gate** |
| traceRefs | consumer view kind のみ（id/trace なし） |

---

## 10. 自己判定（RJ2e 実装に進めるか）

- **判定: RJ2e は技術設計 ready（ただし実装は CEO 二重 gate 待ち）**。対象ファイル（新規 1 + test 1・RJ2a/b/c/d 不接触）・型（RenderedCopyV0/RenderedClaimCopy/RenderedQuestionCopy/CopyTone）・renderCopy 入出力契約（consumer view のみ + 決定的テンプレート）・安全則（verdict/時刻/category/raw/choice label）・walker（11）・fixtures（13）・HOLD・GO 二重 gate が確定。
- **RJ2e 実装 GO は CEO 専管かつ二重 gate**: ①技術安全 ②文面/トーン/世界観承認。本書は①の envelope を確定するが②は CEO/Growth track。
- 革新点（CEO ⑦・RJ2e-0A 修正後）: **入力面は安全 ∧ 出力面は exact template 正本 + walker** — RJ2d の category-free/verdict-free/opaque consumer view（入力に機微・verdict・raw が無い）に、固定句 catalog（dynamic interpolation なし）+ forbidden lexicon walker + serialization backstop を重ねる三層で、user-facing でも漏洩・断定・不安喚起が起きない。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read 不接触・tree clean・production gate 未通過。

---

## 11. RJ2e-0A — Exact Template Catalog / Lexical Safety（正本・§2/§3/§4 に優先・最終文言は CEO 承認）

> **批評経緯**: 4 レンズ（anxiety-tone / verdict-delay / duplicate-ambiguity / category-hallucination）の敵対批評 workflow を試行したが server rate-limit で失敗。4 レンズを**自己適用**して候補を補正した。これらは **CEO 文面承認 gate**（§11.10）を通るまで暫定。

### 11.1 exact claim template catalog（claim copy・hedged/neutral・断定なし）

**RJ2e 実装時 CEO 文面差し替え確定（`d... 本 commit`）**: より明瞭・状態を断定せず伝える文面に確定。

| consumer kind | **exact string（確定）** | tone | 理由 |
|---|---|---|---|
| `observation` | `メモがあります。` | neutral | 「保存・記憶したよう」を避け簡潔に |
| `status_note` | `確認前の注意点があります。` | hedged | 「確認前」で断定せず状態を伝える（崩れ/不安を煽らない） |
| `info_incomplete` | `まだ未確定の点があります。` | hedged | 「未確定」で断定なし・状態を明瞭に |
| `needs_confirmation` | `確認が必要な点があります。` | hedged | 「確認が必要」で明瞭・押しつけない |

### 11.2 exact question template catalog（question copy・確認の問い・断定なし）

| consumer kind | **exact string（確定）** | tone | 理由 |
|---|---|---|---|
| `needs_verification` | `確認しますか？` | hedged | 確認 UI への入口（通知/外部連絡/自動実行でない・安全） |
| `resolve_overlap` | `重なって見える予定があります。確認しますか？` | hedged | 「見える」で**衝突も重複も断定しない**（RJ1b・両義保持） |
| `resolve_missing_info` | `未確定の点を確認しますか？` | hedged | 「未確定」で明瞭・回りくどさ回避 |

### 11.3 exact choice label catalog（generic・subject/time/place/category/relation 差し込み禁止）

| consumer kind | **exact labels（確定）** | 理由 |
|---|---|---|
| `needs_verification` | `["確認する", "あとで"]` | 安全なユーザー操作（外部送信/予定変更/予約/支払いを含まない）。「はい/いいえ」は文脈薄く曖昧ゆえ不採用 |
| `resolve_overlap` | `["あとで確認", "まだ決めない"]` | **同じ予定/別予定/候補A・B をここで選ばせない**（衝突 presuppose 不可・RJ1b）。最小 defer のみ。細かい disambiguation は将来の CEO 承認 safe label 拡張 |
| `resolve_missing_info` | `["確認する", "そのまま"]` | 安全操作のみ。「補う」は曖昧ゆえ削除 |

### 11.4 forbidden lexicon（copyViolations が検出・分類）

| 分類 | 禁止語（部分一致・例示・実装で確定） |
|---|---|
| **verdict** | 成立, 不成立, 間に合, 遅刻, 遅れ, 崩れ, 失敗, 破綻, 無理, できない, infeasible |
| **delay/departure/route** | 出発, 何時, 時刻, 〜時, 〜分, 分後, ルート, 経路, 道順, 到着, eta, leaveby |
| **sensitive/work/reservation/otherPeople** | 予約, 支払, 決済, 仕事, シフト, 勤務, 出勤, 同僚, 上司, 相手, 他人, 機微, sensitive, reservation, payment, work, shift |
| **probability/percent/score** | %, ％, 確率, パーセント, スコア, 可能性が高い, 可能性が低い |
| **action/write/send/book/pay** | 削除, 移動する, 送信, 送る, 予約する, 支払う, 実行, 自動 |
| **raw id token** | `ern:`, `cl:`, `q:`, `sp:`, `pj:`, `subject_`, `relation_`, snapshot |
| **hallucination 誘発** | （lexicon でなく **dynamic interpolation 禁止 + exact whitelist** で構造的に防ぐ・§11.6/§11.8） |

> **誤検知防止**: forbidden scan は exact template catalog（§11.1-3）に対して**誤発火しない**ことを test で保証（catalog の語が forbidden に該当しないこと）。例: 「確認」「予定」「点」「いくつか」は allowed（§11.5）。

### 11.5 allowed lexicon（テンプレートが使ってよい語・最終は CEO 承認）

確認 / 未確定 / 確定していない / いくつか / ひとつ / 点 / こと / 予定 / 情報 / メモ / 心に留める / あとで / そのまま / まだ / 伺う / 重なって見える / よさそう / かもしれません / はい / いいえ / 決めない。

### 11.6 copyViolations 設計の精密化（whitelist 方式）

1. **exact template whitelist**: 各 claim/question の `text` が §11.1/§11.2 の exact string 集合に**完全一致**（whitelist 外で FAIL = dynamic 生成検出）。
2. **choice label whitelist**: 各 `choiceLabels` が §11.3 の exact label 集合に完全一致。
3. **forbidden lexicon scan**: text/choiceLabels に §11.4 の禁止語が部分一致したら FAIL。
4. **serialization backstop**: `JSON.stringify(copy)` に raw id token（`ern:`/`cl:`/`q:`/`sp:`/`pj:`/`subject_`/`relation_`）が出ない。
5. **tone whitelist**: tone ∈ {neutral, hedged}（assertion tone 不可）。
6. **display 整合**: display suppress → claimCopies/questionCopies []。
7. **kind 整合**: claim/question kind が consumer-safe enum 内。

### 11.7 view precheck（RJ2d を信用しきらない・CEO #4）

`renderCopy(view)` は冒頭で **`surfaceProjectionConsumerViewViolations(view)` を実行**し、非空なら **throw**（unsafe view から copy を生成しない）。RJ2d が正しい前提に寄りすぎず、copy 層で入力 view を再検証する。

### 11.8 dynamic interpolation 禁止 / LLM 自由生成禁止

- **dynamic interpolation 禁止**: text/choiceLabels は **exact catalog からの定数参照のみ**（テンプレートリテラル `` `...${view値}...` ``・文字列連結で view 値を差し込まない）。kind → 固定 string の lookup table のみ。
- **LLM 自由生成禁止**: pure（fetch/LLM なし）。source-scan で担保。

### 11.9 framing 修正（CEO #1）

「入力が安全だから文面も安全」は撤回。正本: **consumer view が安全ゆえ入力面は安全。出力文面の安全性は exact template 正本（§11.1-3）+ copyViolations walker（§11.6）+ view precheck（§11.7）で保証**。

### 11.10 CEO 文面承認 gate（実装 GO 条件に追加）

RJ2e 実装 GO は技術 gate（§8）に加え、以下の **CEO 文面承認**を必須にする:
- exact template catalog（§11.1/§11.2）の CEO 承認
- exact choice label catalog（§11.3）の CEO 承認
- tone / 世界観（Alter 人格との整合）の CEO 承認
- **RJ2f notification とは別 gate**（copy 承認 ≠ 配信承認）

### 11.11 RJ2e 実装 GO 可否の自己判定

- **判定: RJ2e は技術設計 ready（exact catalog 正本化済・補正後）**。ただし実装 GO は **CEO 二重 gate（技術 + 文面承認）**待ち。exact catalog（§11.1-3）は自己批評で補正したが **CEO 文面承認が必須**（暫定）。
- copyViolations を whitelist 方式（exact template/choice label/forbidden lexicon/backstop/view precheck/dynamic interpolation 禁止）に精密化。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read 不接触・tree clean・production gate 未通過。
