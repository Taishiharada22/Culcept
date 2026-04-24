# CoAlter 統合契約 — canonical surface / Presence×executor 直交 / Understand 分離 / Pattern 命名裁定

**作成日**: 2026-04-24
**ステータス**: **v0.1 rev 1**（CEO 固定確定 2026-04-24 / rev 1 同日 master §5 整合修正）
**起草 branch**: `design/coalter-integration-contract-2026-04-24`（`design/coalter-step-a-baseline` から派生）
**前提 snapshot**: Step A 完了時点（`docs/coalter-handoff-2026-04-22.md` rev 2）
**不可侵化**: §0.5 起草プロトコルにより、以後の変更は rev 追記方式（原則既存本文削除禁止、ただし**正本間衝突発見時の整合修正は例外**）

---

## 0. メタ情報

### 0.1 本書の位置づけ

本書は既存 CoAlter 設計書群の**間に残っていた「つなぎの曖昧点」を契約として固定する**文書である。新しい設計を起こすのではなく、既存 docs が前提としていた（が明文化されていなかった）4 つの整合点を、不可逆な共通前提として書き下ろす。

固定する 4 契約点:

| # | 契約点 | 解く曖昧点 |
|---|---|---|
| ① | canonical surface は「上部レイヤー + 明示 handoff」の二層 | v1.1「メインチャットに混ざらない」 vs 既存実装「CoAlterCard をメインチャットに吹き出し挿入」 |
| ② | Presence 状態（S0-S8）× executor availability（`enabled`/`active`/`disabled`）は 1:1 にしない直交レイヤー | master §5 ペア起動状態機械と v1.1 §8 発話サイクルの混同防止 |
| ③ | Stage 1 Understand（executor）と S4 理解更新中（Presence/UI）は別物 | 三段式 Stage 1 が S4 の生進捗バー化するのを防ぐ |
| ④ | 発話パターンは **6 families / 7 operational patterns** の二層命名で裁定 | v1.1 §4「6 種」 vs UI spec §7「7 Pattern」の wording 不整合 |

### 0.2 本書が決めること / 決めないこと

**決める**:
- 上記 4 契約点の定義と不可侵条文
- 既存 docs のどこと整合し、どこを**将来（承認後のみ）最小参照追記するか**の計画
- 本契約が触らない境界線（Phase 2 凍結契約、executor 内部、Bug-1/2 設計、三段式 Stage 2/3）

**決めない**:
- 既存 docs 本文の修正（承認後別セッションで最小参照追記のみ）
- P1 論点（signal 検出源 / 共有 UI 同期 / invocation precedence）
- P2 論点（Daily/Travel カード / mock 吸収 / S5→S6 UI 具現化）
- 実装コード（`lib/coalter/**` / `app/api/coalter/**` touch ゼロ）
- legacy CoAlterCard の正式退役時期（Stage 4 で別判断）

### 0.3 前提 doc（正本参照、本書は複製しない）

| 領域 | 正本 | rev / 日付 |
|---|---|---|
| 全体原則 | `docs/coalter-master-design.md` | v1.1（2026-04-15 CEO 承認） |
| Core UX 存在論 | `docs/coalter-core-ux-layered-presence.md` | v1.1（2026-04-24） |
| UI 解像度 | `docs/coalter-presence-state-ui-spec.md` | v0.1（2026-04-24） |
| 発話文面 | `docs/coalter-speech-template.md` | v0.1（2026-04-24） |
| 映画三段式 | `docs/coalter-movie-three-stage-design.md` | rev 3.2（2026-04-24） |
| Phase 2 Action Mode | `docs/coalter-phase2-3mode-design.md` | 凍結（2026-04-19 CEO 6.D 合格） |
| Step A handoff | `docs/coalter-handoff-2026-04-22.md` | rev 2（2026-04-24） |

**注記（snapshot rev2 の意図的固定）**: 上記 handoff の rev 指定「rev 2」は**意図的に Step A 完了時点の snapshot** を指す。本契約起草後に handoff が rev 3 以降に進んでも、本契約は rev 2 を前提として固定する（rev 2 以降の改訂で本契約の前提が変わる場合は、本契約側の rev 追記で対応する）。他の正本 doc 参照も同様で、日付列は **Step A 完了時点の snapshot rev** であり、本契約の根拠となる固定点。

### 0.4 CEO 判断の引用（本契約の根拠）

> 「上部レイヤーは、2 人との会話。例えば、具体的なプランとかを最終的に表示する場合は、2 人のチャットにそのまま送る。の複合方がベストかな。あくまでも、coalter は 2 人の仲介者でもあるから、上部レイヤーで、2 人と会話できるようにするのはベストだと思う。」
>
> （2026-04-24 CEO 発言、本セッション）

この発言は 4 契約点中 ① の核を直接決する。②③④ は ① と GPT 助言（P0 = 1+8+5 統合契約化）を受けて派生する。

### 0.5 起草プロトコル

- 本書は **単独起草**。既存 docs の本文は一切書き換えない
- CEO レビューで **v0.1 固定** と判定された後、別セッションで既存 docs へ**最小参照追記のみ**実施（§6 で計画を明示）
- **固定 = 不可侵化** であり、以後の変更は原則 rev 追記方式（既存本文削除禁止）
- **例外（rev 1 で追加）**: 固定後に**正本間衝突（本契約と既存 CEO 承認済正本との論理矛盾）**が発見された場合は、rev 局所修正を許容する。その場合も:
  - 修正は衝突解消に必要な最小範囲に限る
  - 改訂履歴に（a）何を削除したか、（b）何に置き換えたか、（c）どの正本と整合させたか を明記する
  - 4 契約点の不可侵条文（§1.6 / §2.6 / §3.6 / §4.5）には触れない（触る必要が生じた時は新契約を起こす）

---

## 1. 契約点 ① — canonical surface は「上部レイヤー + 明示 handoff」の二層

### 1.1 定義

CoAlter の UI 接触面は以下 2 面のみ。これ以外に新規 surface を足さない。

| 面 | 役割 | 発火条件 | 位置 |
|---|---|---|---|
| **対話面** | CoAlter と 2 人が**会話する場**。発話サイクル S0-S8 はすべてここで完結 | availability が `enabled` または `active` の時。自動 S0 常駐、自動 S1 昇格、chip 応答、自由テキスト返答（`@coalter` 入力） | 画面上部の専用レイヤー（v1.1 §3.1） |
| **出力面** | 最終プラン等の**確定出力**を 2 人のメインチャット本線に送信 | **ユーザーの明示 tap のみ**（「この提案をチャットに共有」UI spec §4.3.8 / §2.7）。自動送信は禁止 | メインチャット本線（2 人の吹き出し列） |

### 1.1.1 対話面における自由テキスト返答の最小粒度

対話面は双方向会話の場だが、CoAlter の発話リズムは**発話サイクル単位（S0-S8）**。自由テキスト返答が 2 人から来た時の取扱いは以下で半歩固定する（詳細文面ルールは speech template / runtime 契約 P1 に委譲）:

1. **1 サイクル = アクティブ返信 1 本**: CoAlter が 1 サイクル中に発する「アクティブな自発返信」は **1 本**（= 1 発話）。chip 応答・短い受け返しを除く。同一サイクル内で複数発話を重ねない
2. **同時入力（両者がほぼ同時に自由テキスト投入）**: **FIFO**（先に到達したメッセージから順次処理）。両者の入力を合成して 1 発話にしない
3. **片方入力中、もう片方が先行送信**: 先行送信側の入力でサイクルを進めて良い。ただし「片方だけが話している」状態を CoAlter の発話で固定化しない（speech template §1.2「代弁しない」に従う）
4. **CoAlter 発話中に自由テキスト到着**: 現発話を完了してから次サイクル S0 に戻る（発話を途中で上書きしない）
5. **自由テキストは対話面内で受ける**: 出力面（メインチャット本線）への返答を CoAlter が自動生成しない（出力面は明示 handoff 専用、§1.1 表参照）

これらは対話面の**最小粒度ルール**であり、文面トーン・chip 設計・クールダウン具体値は P1 runtime 契約で詳細化する。

### 1.2 CEO 判断との対応

CEO の「複合型」は本契約において以下の意味で厳密化される:

- **対話** = 対話面で実施（片方の自由テキスト返答も対話面で受け、CoAlter は対話面で応答）
- **最終的に表示するプラン** = 出力面へ明示 handoff（ユーザーが承認 tap）
- **仲介者として 2 人と会話** = 対話面が常設の共有空間として機能（v1.1 §3.3「口であり、気配であり、知性の窓」）

### 1.3 既存 docs との整合

既存 docs は既にこの二層を書いている。本契約は**新規導入ではなく追認**:

| 既存 doc | 該当箇所 | 二層との対応 |
|---|---|---|
| v1.1 §3.1 レイヤー構造 | 画面上部 CoAlter レイヤーの ASCII 構造 | 対話面の正本 |
| v1.1 §9.1 常設要素 | 「@coalter で相談」入力欄 | 対話面での自由テキスト入力 |
| UI spec §4.3.8 S7 | 「この提案をチャットに共有」tap（§2.7 明示的 handoff） | 出力面への handoff 機構 |
| UI spec §2.7 | 明示的 handoff 境界条件 | 出力面 発火契約 |

本契約は ①②③④のうち唯一、既存 docs の**矛盾を統合する**性格を持つ（②③④ は新規定義寄り）。

### 1.4 legacy CoAlterCard の位置づけ

現行 `ChatClient.tsx:1898-1908` 付近の CoAlterCard メッセージ表示（メインチャット吹き出し列への自動挿入）は **legacy surface** として退役対象。

- **移行期（本契約固定時〜Stage 4 本実装完了まで）**: 既存 CoAlterCard の自動挿入は**維持**する。Bug-1 / Bug-2 修正（Step C/D）は既存 surface 上で進行、観測を止めない
- **Stage 3 preview**: 上部レイヤー UI を preview 限定で先行実装。本番 ChatClient への介入は無し
- **Stage 4 本実装**: CEO 承認で `ChatClient.tsx` に上部レイヤー導入。同時に legacy CoAlterCard の自動挿入を**明示 handoff 経由のみ**に置換（= 出力面への送信はユーザー承認 tap で発火、自動挿入は廃止）
- **legacy 退役完了時期**: Stage 4 で別判断（本契約では固定しない）

### 1.5 二重表示禁止原則

**同一論理メッセージを対話面と出力面の両方に自動出力することを禁止**する。

- 対話面の S5 発話と同内容を、自動でメインチャット吹き出しにもコピーしない
- ユーザーが「チャットに共有」を tap した時のみ、出力面に**1 回きり**送信
- tap 後の対話面は S8 クールダウンへ。上部レイヤーに残響表示は可（speech template で扱う）

### 1.6 不可侵条文（本契約点 ①）

以下は改訂禁止。変更したい場合は新契約を起こす:

1. CoAlter の UI 接触面は対話面と出力面の**2 面のみ**
2. 発話サイクル S0-S8 は**対話面で完結**する
3. 出力面への送信は**ユーザー明示 tap** でのみ発火する（自動送信禁止）
4. 同一論理メッセージの**二重表示禁止**（自動コピー禁止）
5. 対話面は「CoAlter の発話」だけでなく**2 人の自由テキスト返答**も受ける場である（仲介者として会話可能）

---

## 2. 契約点 ② — Presence 状態と executor availability は直交

### 2.1 定義

CoAlter の状態管理は以下の**3 レイヤー直交**で構成する。1 つの enum に統合しない。

| レイヤー | 値域 | 粒度 | 正本 doc |
|---|---|---|---|
| **executor availability** | `disabled` / `pending_consent` / `enabled` / `active` / `inactive` | ペア単位、会話セッション跨ぎで永続 | `coalter-master-design.md` §5 |
| **Presence 状態** | S0 / S1 / S2 / S3 / S4 / S5 / S6 / S7 / S8 | 発話サイクル単位（1 回の介入ラウンド） | `coalter-core-ux-layered-presence.md` §8 |
| **Action Mode** | decision / negotiate / clarify | 1 ターン単位、executor 内部遷移 | `coalter-phase2-3mode-design.md`（凍結） |

**`disabled` vs `inactive` の語義差（本契約で固定、rev 1 で master §5 整合修正）**:
- **`disabled`**: ユーザー（ペアのいずれか / 両方）が**明示的に OFF** にした状態（opt-out）。再有効化は **`disabled → pending_consent → enabled`** の経路を経る（相手の再同意が必要）。master §5 「`[disabled]` から再有効化 ──▶ `[pending_consent]`（再度同意必要）」に準拠。**CoAlter は pair 機能であり、片方の opt-out 撤回時は相手の再同意取得を前提とする**
- **`inactive`**: 初期状態 or 同意未取得で**まだ起動していない**状態（not-yet-on）。同意フローを経て `pending_consent` → `enabled` へ進行する入口側

両者はともに「上部レイヤー非表示」になるが、**原因が異なる**（明示拒否 vs 未起動）。ただし**再有効化経路は master §5 で統一**されており、`disabled` 側も `inactive` 側もともに `pending_consent` を経由する（pair 同意の一貫性保持）。

### 2.2 mapping 原則（1:1 にしない）

executor availability と Presence 状態は以下の関係。**1:1 対応ではなく、availability が Presence の可動域を制約する**。

| executor availability | 上部レイヤー Presence |
|---|---|
| `disabled` / `inactive` | 上部レイヤー**非表示**（UI 要素そのものが出ない） |
| `pending_consent` | 上部レイヤー非表示（同意フロー UI が別途出る） |
| `enabled`（非 active） | **S0 常駐のみ**（見守り中、発話なし） |
| `active` | **S1-S8 のいずれかを 1 サイクル回す**。S8 退出で `active` → `enabled` に降格 |

**重要**:
- `active` の内部で **S0-S8 が 1 サイクル回る**（= 1 発話サイクル）。`active` が続く限り複数サイクル回し得る（例: 長い相談セッション）
- S8 退出 = Presence サイクル終了だが、必ずしも `active` 終了ではない。`active` の継続・終了判定は master §5 のセッション完了条件（明示終了 / タイムアウト 10 分 / 提案完了退出シグナル）に従う
- 逆に `active` 終了は S8 を経由する（executor が勝手に active を切ると Presence 側が中吊りになる）

### 2.3 Action Mode との関係

Action Mode（Phase 2 凍結 3-mode body）は executor の **decision / negotiate / clarify** 内部遷移で、Presence とも executor availability とも**独立の第 3 軸**。

- Action Mode 遷移は `active` 中に何度でも起こり得る（例: S5 橋渡し中に clarify → decision へ）
- Presence 側は Action Mode 遷移を**感知しない**（S5 の UI は Action Mode によって変わらない）
- Action Mode の UI 表現（カード内容・chip）は Phase 2 3-mode body で既に凍結済、本契約で変更なし

### 2.4 状態遷移図（契約確定版、rev 1 で master §5 整合修正）

```
┌──────────────────────────────────────────────────────────────────┐
│ executor availability（ペア永続）                                   │
│                                                                   │
│  inactive ──→ pending_consent ──→ enabled ⇄ active                │
│      ↑              ↑                │                            │
│      │              │                │ ユーザーが明示 OFF           │
│      │              │                ↓                            │
│      │              │             disabled                        │
│      │              │                │                            │
│      │              │                │ 再有効化                    │
│      │              └────────────────┘（相手の再同意が必要）        │
│      │                                                            │
│      └─ pending_consent で拒否 / 72h 無応答 → inactive 復帰        │
│                                                                   │
│                                              │                    │
│                                              ↓ active 中のみ       │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ Presence 状態（発話サイクル、active 中のみ可動）              │     │
│  │  S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8              │     │
│  │                                        │                 │     │
│  │                                        ↓ S8 退出           │     │
│  │  ┌─────────────────────────────────────────────────────┐ │     │
│  │  │ Action Mode（ターン内部、Presence と独立）               │ │     │
│  │  │  decision ⇄ negotiate ⇄ clarify                     │ │     │
│  │  └─────────────────────────────────────────────────────┘ │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘

遷移規則（master §5 整合、rev 1）:
  inactive        → pending_consent  : 同意フロー開始
  pending_consent → enabled          : 同意完了
  pending_consent → inactive         : 拒否 / 72h 無応答（master §5）
  enabled         ⇄ active           : セッション開始 / 終了
  enabled         → disabled         : ユーザーが明示 OFF（opt-out）
  disabled        → pending_consent  : 再有効化要求（相手の再同意取得フェーズへ）
  pending_consent → enabled          : 同意完了で再有効化成立
  （`disabled → enabled` 直接遷移は存在しない。再有効化は必ず pending_consent 経由で相手同意を取り直す）
```

`enabled`（active でない時）は **S0 常駐のみ**。Presence が S1 以降に上がるのは `active` に昇格した時のみ。

### 2.5 既存 docs との整合

| 既存 doc | 該当箇所 | 本契約との関係 |
|---|---|---|
| master §5 | 起動状態機械（inactive → pending_consent → enabled → active） | 本契約 ② で **executor availability** として正式命名 |
| v1.1 §8.1 | 「S0-S8 は Presence/UI 状態、reducer/executor とは別レイヤー」 | 本契約 ② で**直交性を具体化**（availability が可動域制約） |
| v1.1 §13.3 | Presence / Action / Theme の 3 軸表 | 本契約 ② で **availability を第 4 軸として追加**（表は 4 軸に拡張） |

### 2.6 不可侵条文（本契約点 ②）

1. executor availability / Presence / Action Mode の **3 レイヤーを統合しない**
2. `enabled` 状態では **S0 常駐のみ**（S1 以降は active でのみ到達）
3. Presence S8 退出と executor active 終了は**別イベント**（前者が後者を必ずしも含意しない）
4. Action Mode 遷移は Presence に**感知されない**（UI 上の見え方を Action Mode が変えない）

---

## 3. 契約点 ③ — Stage 1 Understand と S4 は別物

### 3.1 定義

映画三段式 Stage 1 Understand と v1.1 S4 理解更新中は、**存在する場所も発火理由も別**:

| 軸 | Stage 1 Understand | S4 理解更新中 |
|---|---|---|
| 役割 | **ドメイン非依存の 2 人理解統合**（Alter + Stargazer + CoAlter + 今の会話 + 他観測） | **ユーザー応答を受けた後の内部処理演出** |
| 出力 | `TwoPersonLensToday`（JSON） | UI 表示ステータス「理解更新中」 |
| 発火経路 | executor 側: Action Mode = decision 時、Stage 0 Analysis 後、Stage 2 Curate 前 | Presence 側: S3 返答待ち → 応答取得時 |
| 滞在時間 | target ≤ 5s（`understanding_confidence` 収束まで） | 最短 0.3s、最長 Stage 1 完了 or タイムアウト |
| 消費先 | Stage 2 Curate（食事 / 映画 / 旅行の候補生成） | S5 橋渡し中への UI 遷移シグナル |
| 失敗時 | confidence 低で Stage 2 に縮退データを渡す | タイムアウトで S5 に強制遷移、または S8 撤退 |

### 3.2 S4 は Stage 1 の生進捗バーではない

**これが本契約点 ③ の核**:

- S4 の滞在時間 ≠ Stage 1 の実行時間
- S4 の UI 表示 ≠ Stage 1 の進捗率
- Stage 1 は**executor event bus** で進捗を持つが、それを S4 に直接垂れ流さない

### 3.3 event bus 分離

Stage 1 と S4 は**別々の event stream** で管理する:

| event bus | 発行者 | 購読者 |
|---|---|---|
| `executor.understanding.*` | Stage 1 内部（start / progress / done / timeout） | Stage 2 Curator / 観測 telemetry |
| `presence.state.*` | Presence reducer（S3→S4→S5 遷移） | 上部レイヤー UI renderer |

両 bus の**結合点は Presence reducer 側**（Stage 1 done event を Presence reducer が購読して S4→S5 を起こし得る。ただしこれは S4 脱出条件の**一つ**であり、唯一の条件ではない）。

S4 脱出条件（順序優先）:

1. Stage 1 done event 受信 → 即 S5
2. S4 滞在タイムアウト（実装で定義、暫定 5s）→ 縮退データで S5
3. ユーザー明示退出 → S8

### 3.4 起動タイミングの厳密化

Stage 1 は以下のタイミングで起動する（executor 側）:

- `active` 状態で Action Mode = decision に遷移した時
- Action Mode 内部 で「候補生成要求」が発生した時（Stage 0 Analysis 後）

S4 は以下のタイミングで発火する（Presence 側）:

- S3（返答待ち）で 2 人のいずれか / 両方から応答（chip tap or 自由テキスト）を受信した時

両者は**時系列で部分的に重なり得る**が、因果的には独立。Stage 1 を走らせずに S4 を表示することも、S4 を経ずに Stage 1 を走らせることも原理的に可能（例: 通常モード S5 橋渡しは Stage 1 を要さない場合がある）。

### 3.5 既存 docs との整合

| 既存 doc | 該当箇所 | 本契約との関係 |
|---|---|---|
| 三段式 §2.1 Pipeline | Stage 1 Understand 配置 | 本契約 ③ で **executor 経路** として明示 |
| 三段式 §0.5 存在論 | 「Stage 1 主役は 2 人の理解」 | 維持、本契約は**表示演出と分離** |
| v1.1 §8.2 S4 定義 | 「理解更新中、派手さ抑制」 | 本契約 ③ で **UI 演出に純化**（executor 進捗ではない） |
| UI spec §4.3.5 S4 | 発話トーン N/A、single-line or compact-card | 維持、本契約は **event bus 分離** を追加 |

### 3.6 不可侵条文（本契約点 ③）

1. S4 は **Stage 1 の生進捗バーではない**（滞在時間・UI 表示は両者で独立）
2. Stage 1 は **executor event bus** で進捗管理し、`presence.state.*` bus に直接 emit しない
3. S4 脱出条件は **Stage 1 done / タイムアウト / 明示退出** の 3 択（他の条件を足さない）
4. Stage 1 を走らせない通常モード S5 橋渡しも許容する（Stage 1 は decision 時のみ起動）

---

## 4. 契約点 ④ — 6 families / 7 operational patterns 裁定

### 4.1 定義

通常モードの発話パターンを**二層命名**で固定する:

| 層 | 値域 | 用途 |
|---|---|---|
| **family（存在論）** | A / B / C / D / E / F | v1.1 §4 の章立てと存在論を保持。F は「関係提案 + 生活提案の 2 変種を持つ family」として扱う |
| **variant（運用 surface）** | A / B / C / D / E / F-1 / F-2 | UI spec §7 / speech template §3-§9 の許可マトリクス・文面テンプレ単位 |

### 4.2 命名規則（実装 enum 事前固定）

型定義は **variant を正本**、family は derive で求める:

```ts
// 本契約で命名規則のみ固定。実装は Stage 2 executor 骨格時。
export type PatternVariant = "A" | "B" | "C" | "D" | "E" | "F1" | "F2";

export type PatternFamily = "A" | "B" | "C" | "D" | "E" | "F";

export const toFamily = (v: PatternVariant): PatternFamily =>
  v === "F1" || v === "F2" ? "F" : v;
```

**family / variant 二層命名の理由**:
- 状態許可マトリクス（UI spec §7.12）は variant 単位で記述されている → family だけでは表現力不足
- 文面テンプレ（speech template §3-§9）も variant 単位
- 存在論の章立ては family 単位（v1.1 §4.1-4.6）→ 両方必要

**外部表記 ↔ 内部表記の normalize 規則**:

| 表記 | 使用場所 | 形式 |
|---|---|---|
| **external（docs 表記）** | 全 docs 本文、UI spec §7 許可マトリクス、speech template §3-§9 章題、人間が読む箇所 | `F-1` / `F-2`（ハイフン付き） |
| **internal（実装表記）** | TypeScript enum、コード、JSON、event bus payload | `F1` / `F2`（ハイフン無し） |
| **変換方向** | external → internal: ハイフン除去 / internal → external: `F1 → "F-1"` / `F2 → "F-2"` | 両方向変換ユーティリティを Stage 2 executor 骨格時に実装 |

**normalize 理由**: TypeScript literal type としての可搬性（enum / union key / JSON payload での扱いやすさ）を internal で確保しつつ、external は v1.1 §4 章立てとの連続性を保つ。外部表記と内部表記の**混在は許容しない**（境界での変換を明示化）。

### 4.3 wording 不整合の解消（承認後適用）

本契約固定後、**承認を経て** 以下の最小参照追記を行う（本書では書き換えない）:

| 対象 | 追記内容（案） | 位置 |
|---|---|---|
| v1.1 §4 章題 | 「通常モードの発話パターン 6 families（運用上 7 variants: A/B/C/D/E/F-1/F-2）」への差し替え | 章題のみ |
| v1.1 §4.6 F 節 | 冒頭に「F は関係提案（F-1）と生活提案（F-2）の 2 variants を持つ」1 行追加 | 節頭 1 行 |
| speech template §0.6 | 「上流差分注記（6 vs 7）は統合契約（2026-04-24）で裁定済」の 1 行追記 | 既存注記に接続 |
| UI spec §0.4 | 「family / variant 二層命名は統合契約（2026-04-24）で固定」の 1 行追記 | 正本分離ルールに接続 |

### 4.4 既存 docs との整合

| 既存 doc | 該当箇所 | 本契約との関係 |
|---|---|---|
| v1.1 §4 | 「6 種」wording | 本契約 ④ で **family 層** として再位置付け（本文内容は不変） |
| UI spec §7 | 「7 Pattern」wording、§7.12 許可マトリクス | 本契約 ④ で **variant 層** として正本化（本文不変） |
| speech template §0.6 | 「本書は裁定しない」保留 | 本契約 ④ で **裁定完了**、参照追記で接続 |

### 4.5 不可侵条文（本契約点 ④）

1. family は **6 つ**（A / B / C / D / E / F）、variant は **7 つ**（A / B / C / D / E / F-1 / F-2）で固定
2. **variant を正本**、family は derive。実装 enum は `PatternVariant` を基軸にする
3. F 以外の family で variant 分岐を**追加しない**（拡張が必要なら新契約）
4. v1.1 §4 の章立て（A-F 6 節構造）は**維持**（F 節内部で F-1/F-2 を分岐記述）

---

## 5. 本契約が触らない境界線

以下は本契約で**変更しない**。触ると既存の完成物が壊れる:

| 領域 | 正本 | 凍結理由 |
|---|---|---|
| Phase 2 3-mode body | `coalter-phase2-3mode-design.md` | 2026-04-19 CEO 6.D 合格、観測母数積み上げ中 |
| Phase 2 凍結 6 項目 | `isExecutorThemeEnabled` / `coalterDispatch` 5 step / `CoAlterCard` / metadata / status API / `resolveActiveFromMetadata` | handoff §4.1 不可侵 |
| Bug-1 設計 | `coalter-bug1-emotion-retrieval-design.md` v0.2 | Step C 実装待ち、設計固定済 |
| Bug-2 三段式 Stage 2/3 | `coalter-movie-three-stage-design.md` rev 3.2 §6 Phase M1/M2 | Step D 実装待ち、設計固定済 |
| master-design 原則 1-7 | `coalter-master-design.md` §2 | CEO 承認済（2026-04-15） |
| v1.1 §15.2 不可侵項 | §1 / §2.3 / §2.4 / §3.1-3.3 / §8.1 / §11 | v1.1 固定項 |
| 三段式 §0.5 CoAlter 存在論 | 「持っている情報の性質の差」 | CEO 承認済 |
| live smoke harness | `scripts/coalter/f6-live-smoke.ts` docstring | Step A-4 確定（2026-04-24） |

---

## 6. 影響範囲 — 承認後の最小参照追記計画

**本書固定後、別セッションで実施する最小追記案**。本セッションでは**実施しない**（CEO 修正点）。

| 対象 doc | 追記内容 | 行数目安 | 契約点 |
|---|---|---|---|
| `coalter-core-ux-layered-presence.md` §4 章題 | 「6 families（運用上 7 variants）」に差し替え | 1 行 | ④ |
| `coalter-core-ux-layered-presence.md` §4.6 F 節頭 | 「F は F-1 / F-2 の 2 variants を持つ」 | 1 行 | ④ |
| `coalter-core-ux-layered-presence.md` §8.1 | S4 は Stage 1 の進捗バーではない（別 bus）参照 | 2 行 | ③ |
| `coalter-core-ux-layered-presence.md` §13.3 3 軸表 | executor availability を第 4 軸として追記 | 表 1 行 | ② |
| `coalter-presence-state-ui-spec.md` §0.4 | family/variant 二層命名を本契約で固定の 1 行 | 1 行 | ④ |
| `coalter-presence-state-ui-spec.md` §4.3.5 S4 | S4 と Stage 1 の event bus 分離を参照 | 1 行 | ③ |
| `coalter-speech-template.md` §0.6 | 上流差分注記を「統合契約で裁定済」に接続 | 1 行 | ④ |
| `coalter-movie-three-stage-design.md` §2.1 Pipeline | Stage 1 と Presence S4 の分離参照 | 1 行 | ③ |
| `coalter-master-design.md` §5 起動状態機械 | 「executor availability」命名と Presence 直交を参照 | 1 行 | ② |
| `coalter-handoff-2026-04-22.md` §3 正本一覧 | 本契約を正本として追加 | 1 行 | 全体 |

**追記総量**: 約 11 行（全 doc 合計）。本文内容の書き換えゼロ。

---

## 7. 残る論点（本契約外 — P1 / P2 で扱う）

本契約は「正本の骨格をどう読むか」を固定する P0 package。以下は後続で扱う:

### 7.1 P1 — runtime 契約（本契約の上に載る）

| 論点 | 扱う場所 | 本契約との依存 |
|---|---|---|
| 3. signal 検出源 map | 新契約 doc 起草 | ② executor availability 定義後に検出器を位置付け |
| 4. 共有 UI 同期 | 新契約 doc 起草 | ① 対話面の同期モデル固定後 |
| 7. `@coalter` 強制起動 vs cooldown 優先順位 | 新契約 doc 起草 | ② executor availability 遷移規則の上に |

### 7.2 P2 — surface 完成（P1 の上に載る）

| 論点 | 扱う場所 | 本契約との依存 |
|---|---|---|
| 2. Daily/Travel カード設計 | 新設計 doc 起草 | ① 出力面 handoff 契約の上に、プランカード surface |
| 6. mock 画像と S5/S6 UI 具現化 | UI spec §5 拡張 | ① 対話面の state 内遷移表現 |

### 7.3 本契約外だが関連する項目

| 項目 | 扱う場所 |
|---|---|
| legacy CoAlterCard 正式退役時期 | Stage 4 本実装判断 |
| 明示 handoff 時のメインチャット送信主体表記（「CoAlter から」等） | speech template 拡張 |
| S8 退出後の上部レイヤー残響（retreat message） | speech template §9.x 追記 |

---

## 8. 改訂履歴

| 日付 | 版 | 変更内容 | 承認 |
|---|---|---|---|
| 2026-04-24 | v0.1 | 初稿起草。CEO「複合型 canonical」判断 + GPT「P0 = 1+8+5」推奨を統合。4 契約点（① 二層 surface / ② 3 レイヤー直交 / ③ Stage 1 vs S4 分離 / ④ 6 families/7 variants 裁定）を固定候補として草案 | CEO レビュー待ち |
| 2026-04-24 | v0.1（固定前締め付け） | CEO v0.1 レビュー後の 4 点締め付け反映: (a) §0.3 snapshot rev2 の意図固定を注記、(b) §1.1.1 対話面自由テキスト返答の最小粒度 5 項目を追加、(c) §2.1 に `disabled` vs `inactive` 語義差を固定、(d) §4.2 に external（F-1/F-2）↔ internal（F1/F2）normalize 規則を追加。版は v0.1 のまま（固定前修正のため昇格しない） | CEO 固定確定（2026-04-24） |
| 2026-04-24 | v0.1（整合修正） | CEO 再レビュー指摘の 2 点反映: (e) §2.4 状態遷移図を §2.1 語義差と整合させて書き直し（`disabled ⇄ pending_consent` の誤読を除去、明示 OFF / 明示再開パスを明示）、(f) §1.1 対話面発火条件を「`enabled` 以上」→「`enabled` または `active`」に変更して順序型誤読を除去。版は v0.1 維持 | CEO 固定確定（2026-04-24） |
| 2026-04-24 | v0.1 fixed | CEO 固定確定判定。§0 ヘッダのステータスを「v0.1 固定」に更新、不可侵化を明記。以後の変更は rev 追記方式のみ | **FIXED** |
| 2026-04-24 | v0.1 rev 1 | **正本間衝突発見による整合修正**。§6 追記着手前の事前検証で、本契約 §2.1/§2.4 の `disabled` 再有効化経路が **master §5（2026-04-15 CEO 承認）と衝突**していることを発見（master: `disabled → pending_consent → enabled` / 本契約 v0.1 固定時: `disabled → enabled` 直接）。CoAlter は pair 機能であり、opt-out 撤回時は相手の再同意取得が必要という master §5 の方が上位整合しているため、本契約側を修正。(a) 削除: §2.1 「`pending_consent` には戻らず、enable 操作で直接 `enabled` へ」/ §2.4 図の `enabled ↔ disabled` 副ループ / §2.4 遷移規則「`disabled → enabled : 明示再開（pending に戻さない）`」。(b) 置換: §2.1 「再有効化は `disabled → pending_consent → enabled`（相手の再同意が必要）」/ §2.4 図を master §5 整合に書き換え、pending_consent 経由の再有効化ループを表現 / §2.4 遷移規則に `disabled → pending_consent` `pending_consent → inactive`（72h 無応答）を追加。(c) 整合先: `docs/coalter-master-design.md` §5 起動状態機械（2026-04-15 CEO 承認）。§0.5 起草プロトコルに「正本間衝突発見時の整合修正は例外として許容」を追記。4 契約点の不可侵条文（§1.6/§2.6/§3.6/§4.5）は不変 | **rev 1 FIXED** |

---

## 9. CEO 固定レビュー時の確認点

CEO が本書を固定判定する際、以下を確認してほしい（rev 1 反映後）:

1. **契約点 ① 二層 surface**: 「対話面での自由テキスト会話」まで含めて良いか（§1.1 / §1.6-5）。§1.1.1 で追加した自由テキスト返答最小粒度（1 サイクル = 1 アクティブ返信、同時入力 FIFO、発話中上書き禁止、出力面の自動送信禁止）の妥当性 — **CEO 固定確定 2026-04-24**
2. **契約点 ② 直交**: `active` 中に S0-S8 が複数サイクル回ることを許容して良いか（§2.2 重要ブロック）。§2.1 に追加した `disabled`（明示 OFF）vs `inactive`（未起動）の語義差の妥当性 — **rev 1 で master §5 整合修正**（`disabled → pending_consent → enabled` 経路、相手の再同意が必要）
3. **契約点 ③ 分離**: 「Stage 1 を走らせない通常モード S5」を許容して良いか（§3.6-4）— **CEO 固定確定 2026-04-24**
4. **契約点 ④ 命名**: external（`F-1`/`F-2`）↔ internal（`F1`/`F2`）の normalize 規則（§4.2）で良いか、あるいは external 側も `F_1`/`F_2` に統一する等を好むか — **CEO 固定確定 2026-04-24**
5. **§6 追記計画**: 11 行の追記案で過不足ないか。追記タイミングは本書固定**直後**か、P1 着手前まで遅延させるか — **CEO 判定: P1 着手前までに必ず入れる（今すぐ可）**
6. **snapshot rev2 固定**: §0.3 で明記した「本契約は handoff rev 2 を固定前提とし、rev 3 以降は本契約 rev 追記で対応」の運用方針で良いか — **CEO 固定確定 2026-04-24**

rev 1 で新たに CEO 確認すべき点:

7. **§0.5 起草プロトコルの例外条文（rev 1 追加）**: 「正本間衝突発見時の整合修正は例外として許容」のルール明文化で良いか。類似ケース再発時にも同プロトコルで rev 修正する運用になる

---

**🎯 結論（v0.1）**: 本書は CoAlter 設計書群の「つなぎの曖昧点」を 4 契約点で固定する P0 統合契約。CEO「複合型 canonical」判断と GPT「P0 = 1+8+5」推奨を直接受けて起草。既存 docs の本文は一切書き換えず、承認後に最小参照追記（11 行）のみ適用する。本契約固定により P1 runtime 契約（signal / 同期 / invocation）と P2 surface 完成（Daily/Travel / mock 吸収）に進める地盤ができる。
