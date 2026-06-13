# RJ2e-0 — User-Facing Copy / Language Surface Design（設計提出のみ・コード禁止・実装は CEO 承認 gate）

- 日付: 2026-06-14 / 作成: copy surface 設計セッション
- 位置づけ: RJ2e で扱う **自然言語文面（user-facing copy）**の生成可否・CEO 承認 gate・kind 別文面制限・assertion/verdict 禁止・leak 防止の **設計境界をコードを書く前に確定**する設計書。
- 正本: `docs/reality-judgment-surface-boundary-rj2-0.md`（RJ2-0/RJ2-0A・G5 DELIVERY）。上流 = RJ2d `SurfaceProjectionConsumerViewV0`（consumer-safe・category-free・文面なし）。
- 規律: **コードを書かない**。本書は設計提出のみ。**RJ2e は user-facing copy ゆえ実装に二重 gate（①技術安全 ②CEO による文面/トーン/世界観承認）が必要**。RJ2e-0 完了時点で勝手に実装に進まない。
- 範囲: RJ2e は **consumer view → 自然言語文面の生成境界（生成可否・制限・安全則）** の設計のみ。notification/contact（RJ2f）は分離・HOLD。proposal/departure content も HOLD。

---

## 0. 前提を疑う（CEO ① — RJ2e の核心と「安全な入口」）

**RJ2e は「初めてユーザーが読む文章」を作る層。** ここまで RJ2a/b/c/d は全て「構造」だった。RJ2e で初めて自然言語になる。**最も慎重を要する**（誤った文面は誤解・不信・機微漏洩を直接生む）。

**革新的安全則 = 「入力が既に安全」だから文面も安全（CEO ⑦）。** RJ2d が consumer view を **category-free**（sensitive/work/reservation/otherPeople を `needs_verification` に潰し済）・**verdict-free**（feasibility verdict を claimType から排除済）・**opaque subject**（raw id なし）に作った。よって RJ2e の入力（consumer view）には**機微情報も verdict も raw id も最初から存在しない**。文面が漏らしようがない情報は、入力に無い。これが「strip より allowlist」「上流で genericize」の積み上げの到達点 — **copy 層は安全な入力からしか文を作れない**。

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

### 3.3 kind → テンプレート写像（v0・neutral baseline・voice は CEO track）

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

### 4.4 choice label 生成可否

- **裁定: generic label のみ可**。`needs_verification`/`needs_confirmation` → 「はい / いいえ」相当（gate 種別を出さない）。`resolve_overlap` → 「同じ予定 / 別の予定」相当（**duplicate 断定でない**両義 label）。`resolve_missing_info` → 「補う / そのまま」相当。**選択肢に subject 名・時刻・場所・gate 種別を差し込まない**。walker が label に raw/category/時刻語を検出して FAIL。

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

**ビジネス gate（CEO 専管）**:
7. **CEO による文面/トーン/世界観の承認**（user-facing copy はブランド事項）。
8. **HOLD 維持**: LLM 自由生成 / RJ2f（notification）に進まない。

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
- 革新点（CEO ⑦）: **「入力が既に安全」だから文面も安全** — RJ2d の category-free/verdict-free/opaque consumer view を入力に固定することで、copy 層は機微・verdict・raw を**構造的に持てない**。これに decode テンプレート固定 + walker + backstop を重ね、user-facing でも漏洩・断定が起きない。
- code 変更ゼロ・UI/storage/API/DB/location/notification/external read 不接触・tree clean・production gate 未通過。
