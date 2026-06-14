# RJ2h-0 — Dogfood Acceptance / Preview Smoke Plan（docs-only・CEO 受け入れ手順書）

- 日付: 2026-06-14 / 作成: dogfood acceptance 設計セッション
- 位置づけ: RJ2g preview（`/plan/dev-reality-surface`）を CEO 本人が確認し、**次に進めるか（real-anchor 配線 / Alter tab / /plan 接続）を判断する**ための acceptance チェックリスト + smoke 手順。
- 規律: **コードを書かない**（docs-only）。production / deploy / push / notification / broad UI 接続には進まない。
- 上流: RJ2g 実装 `e8a02032`（dogfoodPreview.ts + `/plan/dev-reality-surface` + flag `realitySurfacePreview`）。

---

## 0. 前提（このチェックは何を確かめるか）

RJ2g preview は **代表シナリオ（DB read なし・決定論的）**で RJ2 chain の surface を見せる。本書は CEO が:
1. **文面の体感品質**（トーン・自然さ・押しつけなさ）を評価し、
2. **安全境界が実際に効いているか**（leak なし・write なし・配信なし）を目視確認し、
3. **次の接続段階に進むかの判断基準**を持つ、
ためのもの。**「自分のデータ」ではなく「全 decision type の代表」を見る**点に注意（real-anchor 配線は次段）。

---

## 1. 有効化手順（staging / dev・operator 限定）

| 条件 | 設定 |
|---|---|
| flag | `REALITY_SURFACE_PREVIEW=true`（server env・default OFF・本番 deploy では設定しない） |
| host opt-in | `REALITY_CANDIDATE_ACTIONS_DEV_HOST=true` |
| supabase | staging project（staging ref 含む・production ref 含まない URL） |
| auth | operator として login（owner-RLS・非 login は Disabled） |
| route | `/plan/dev-reality-surface` を開く（pull・push されない） |

> いずれか欠ければ `notFound()` / Disabled（chain 非実行）。**production env では flag/host 未設定で構造的に不可視**。

---

## 2. CEO 受け入れチェックリスト

### 2.1 表示される文面（exact catalog・シナリオ別）

| シナリオ | display | 表示される文面（claim / question） | choice |
|---|---|---|---|
| 観測のみ（observe） | render | claim: 状態の中立 note（exact catalog） / question なし | — |
| 確認したい（ask gate） | render | question: `確認しますか？` | `確認する` / `あとで` |
| 重なりの確認（overlap） | render | question: `重なって見える予定があります。確認しますか？` | `あとで確認` / `まだ決めない` |
| 非表示（silent/blocked） | suppress | （何も表示しない） | — |

- [ ] 各シナリオの文面が **exact catalog どおり**（断定・煽り・category 漏れがない）
- [ ] `重なって見える` が **duplicate/衝突を断定していない**（RJ1b）
- [ ] choice label が **subject/time/place/category を差し込んでいない**（generic）
- [ ] suppress シナリオが **本当に何も出さない**

### 2.2 表示されない internal 情報（目視・browser devtools）

- [ ] DOM / network / React props に **`ern:` / `cl:` / `q:` / `sp:` / `pj:`（raw id）が無い**
- [ ] **evidenceRefs / sourceRefs / missingInputRefs / trace / graphViewerKey が無い**
- [ ] **decisionKind / suppressedReasons / assertability / derivedFrom / bucket / gate 種別が無い**
- [ ] sensitive / work / reservation / otherPeople を示す語が無い（4 gate は全て `確認しますか？` に潰れている）

### 2.3 token leak check

- [ ] preview が leak guard を通過して表示されている（leak 検出時は Disabled になる設計）
- [ ] devtools で `JSON.stringify` 相当を確認しても §2.2 の token が出ない

### 2.4 no write 確認

- [ ] **network tab に DB write（POST/PATCH/DELETE to supabase）が無い**（read-only・v0 は DB read すら無い）
- [ ] preview を開いても plan / anchor / DB が**変化しない**（リロードで同じ・mutation なし）

### 2.5 no notification 確認

- [ ] **push / 通知 / メール / 外部送信が一切発生しない**
- [ ] 各シナリオの delivery 表示が **「届けない（deliveredNow=false）」**

### 2.6 dogfood で見るべき UX

- [ ] 文面トーンが **Alter の穏やかな伴走者**らしいか（不安を煽らない・命令しない）
- [ ] 「確認しますか？」が**重すぎ / 軽すぎ**ないか
- [ ] choice label（あとで確認 / まだ決めない 等）が**意味として分かる**か（v0 は安全優先で抽象的・要評価）
- [ ] suppress（沈黙）が「無視された」でなく「今は出さない」と**自然に感じる**か
- [ ] 代表シナリオで RJ2 chain の判断が**腑に落ちる**か（observe vs ask vs overlap の出し分け）

---

## 3. 次の接続判断基準（decision tree）

### 3.1 GO（次段へ）基準 — 以下が全て満たされたら

- §2.1 文面が CEO 文面承認どおり ∧ §2.2 leak なし ∧ §2.4 write なし ∧ §2.5 配信なし
- §2.6 UX が「悪くない」（トーン・出し分けが許容範囲）

→ **次段候補（各々 別 GO・read-only/pull 維持）**:
1. **real-anchor 配線（RJ2g+）**: operator 自身の当日 anchor を read-only（owner-RLS・`listAnchors`）で読み、RJ2 chain を実データで回す。**RC2a 初の実データ配線**ゆえ独立設計・独立 GO（fixture preview と分離した理由）。
2. **限定 UI 接続（in_app_passive・pull）**: RJ2e 文面を in-app に受動表示（opt-in `userInAppSurfaceOptIn` 必須・**push なし**）。
3. **少人数招待検証**: 1+2 を知人・招待制（CLAUDE.md「少人数の初期検証」許容）。

### 3.2 NO-GO（修正してから）基準 — 以下のいずれかなら

- 文面が **off**（煽る / 断定する / 重い / category を匂わせる）→ RJ2e exact catalog を CEO 再承認で修正
- **leak 検出**（§2.2 の token が出た）→ RJ2d/RJ2e/RJ2g の guard を再監査（fail-closed なので表示自体止まるはず）
- **write / notification が発生**（あってはならない）→ 即停止・原因調査（設計上発生し得ないが万一なら最優先）
- UX が **腑に落ちない**（出し分けが不自然）→ RJ2a–2c の判断ロジック側に feedback

### 3.3 絶対に進めない線（§ RJ2-CLOSEOUT 踏襲・CEO 専管）

dogfood が良くても、**実 push / 通知 / 外部送信 / 自動送信 / 一斉通知 / メール / production / deploy / DB write / LLM 自由文面化 / active_prompt 配信転用**は CEO + production + 法務 gate まで**進めない**。dogfood 合格 ≠ 配信合格。

---

## 4. smoke 手順（最小・1 回）

1. staging で §1 の env を投入し operator login。
2. `/plan/dev-reality-surface` を開く → 4 シナリオが表示される（or Disabled なら env 確認）。
3. §2 チェックリストを上から実施（文面 → leak → write → notification → UX）。
4. devtools network で write/push が 0 を確認。
5. §3 の decision tree で **次段 GO / NO-GO / 据え置き**を CEO 判断。
6. flag を OFF に戻す（env 除去）→ route が Disabled/notFound に戻ることを確認（OFF 時 product UI 不変）。

---

## 5. Department Responsibility Matrix（RJ2h-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Product**（dogfood 受け入れ）+ **CEO**（文面・UX・次段判断） |
| consultedDepartments | Build（preview 技術）・Communication（文面）・Permission（露出可否） |
| blockingDepartments | **CEO**（次段 GO・配信は別 gate）+ production gate |
| outputs | RJ2h-0 acceptance/smoke plan（確認項目・表示文面・非表示 internal・leak/write/notification check・UX・次段判断基準）。**コードなし** |
| safetyGate | dogfood 合格 ≠ 配信合格・read-only/pull 維持・deliveredNow=false・leak/write/notification 0 を CEO 目視確認・次段は各々別 GO・**実配信/production は CEO + production gate** |
| traceRefs | RJ2g `/plan/dev-reality-surface` / dogfoodPreview safe payload のみ |

---

## 6. 自己判定

- **RJ2h-0 は acceptance plan として ready**。CEO が staging で preview を確認し、§2 チェック → §3 decision tree で次段を判断できる。
- **次段（real-anchor 配線 / UI 接続）は各々別 GO・CEO 専管**。dogfood 合格でも配信・production には進まない。
- 革新点（CEO ⑦）: **「合格基準に『届けない』を含める」** — dogfood の acceptance に「write 0 / notification 0 / deliveredNow=false」を一級項目として置き、機能追加でなく**安全境界の維持**を受け入れ条件にする。
- code 変更ゼロ・tree clean・production gate 未通過。
