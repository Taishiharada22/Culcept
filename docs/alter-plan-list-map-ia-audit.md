# Phase 3-N Plan List / Map Information Architecture Audit (= 北極星補正版、 11 拘束条件確定版)

**作成日**: 2026-05-24
**branch**: `docs/plan-list-map-ia-audit`
**前提**: Direction audit `e99406ce` 採用確定 (= CEO + GPT 第 5 補正後最終判定、 decision-log `c21bffd7`)
**性質**: docs only (= 実装変更 0、 既存 file 改変 0、 frozen branches 追加 commit 0、 IA = 情報構造のみ確定)
**入力**: direction audit (= 1379 lines、 19 section、 5 補正反映済) + 11 必須拘束条件 (= §13.1.6 + §13.1.7) + 2 留意点 (= 拘束条件化成功 + 核+拡張分離)
**目的**: List + マップ の Information Architecture を **11 必須拘束条件を取りこぼさず確定**、 List Redesign Spec に進める状態を整える

---

## 0. Executive Summary

### 0.1 本 audit の目的

GPT 第 5 補正で確立した「**概念**」 → 「**拘束条件**」 への昇格を実行:
- direction audit (= 概念整理) → 本 IA audit (= UI と構造の必須条件に落とし切る)
- 11 必須拘束条件 (= §13.1.6 + §13.1.7) を **具体的 spec として確定**
- List / マップ の Information Architecture を **完全確定**、 List Redesign Spec の出発点を作る

### 0.2 結論先出し

| 観点 | 結論 |
|---|---|
| 11 必須拘束条件 | **すべて確定** (= 各項目に具体的 UI/構造 spec を §2 で記述、 §9 完了判定でチェックリスト) |
| List 主役 | **時間の流れ** (= 1 spine + 4 情報層) |
| マップ 主役 | **空間の today** (= map 主役 + sheet 補完) |
| 削除対象 | 二重表示 + category-by-place + map/list 分離 visual (= §6) |
| Event Execution Layer 自律追加 6 案 | **核 (= GPT 提案) を first-class、 自律追加は拡張候補として後続評価** (= §8、 GPT 第 5 補正留意点 #2) |
| 完了判定 | **11 必須項目 全確定 + 具体 spec 記録 + 曖昧 residual 0** (= §9) |
| 次 sub-phase | List Redesign Spec audit (= 別 audit / 別 branch) に進める状態 |

### 0.3 CEO 判断項目 (= §13 で詳細、 主要項目)

1. 11 必須拘束条件 確定 spec (= §2) の採用
2. List IA 確定 (= §3) の採用
3. マップ IA 確定 (= §4) の採用
4. Event Execution Layer 核+拡張分離 (= §8) の採用
5. 削除対象 (= §6) の採用
6. 次 sub-phase 進行 (= List Redesign Spec audit) 承認

---

## 1. 前提と背景

### 1.1 direction audit との関係

direction audit `e99406ce` (= 1379 lines、 19 section、 5 補正反映済) で確定した方向性を **本 IA audit で UI と構造の必須条件に落とし切る**。

direction audit の主要確定事項:
- 北極星二層構造 (= 生成・反映 主、 観測・編集 体験面)
- Copy contract 14 項目 (= 3 件変更 / 11 件維持)
- 用語統一 (= UI 「マップ」、 内部 「空間軸」)
- 外部データ取り込み future scope (= §10.5)
- 自律 planning engine future scope (= §10.6)
- Event Execution Layer future scope (= §10.7)
- 11 必須拘束条件 (= §13.1.6 + §13.1.7)
- IA Audit 完了判定基準 (= §13.1.8)

### 1.2 IA Audit の責務 (= 概念 → 拘束条件)

| 段階 | 責務 |
|---|---|
| direction audit (= 完了) | **概念**の整理 (= future scope 含む) |
| **本 IA audit** | **UI と構造の必須条件**に落とし切る (= 拘束条件化) |
| 後続 List/Map Redesign Spec | 各 list/map の **詳細 spec** (= component / interaction) |
| 後続 impl | 実装 |

### 1.3 4 留意点 (= GPT 第 5 + 第 6 補正後、 IA Audit で守る)

| # | 留意点 | 本 IA audit での反映 |
|---|---|---|
| 1 | 「取り込み完了」 ではなく「拘束条件化成功」 段階 | §2 で 13 拘束条件すべてに具体 spec、 §9 完了判定でチェックリスト |
| 2 | Event Execution Layer 自律追加 6 案は核+拡張分離 | §8 で核 (= GPT 提案) は IA first-class、 自律 6 案は拡張候補として後続評価 |
| **3** | **3 source は静的共存だけでなく状態遷移まで定義** (= GPT 第 6 補正) | §2.1 末尾に **#12 拘束条件** (= 状態遷移 + 競合解決単位) を追加 |
| **4** | **Event Execution Layer は Plan ↔ Alter 学習ループまで前提化** (= GPT 第 6 補正) | §2.2 末尾に **#13 拘束条件** (= 学習ループ + source 別学習対象 + Plan 側編集反映) を追加 |

---

## 2. 拘束条件 13 項目 確定 spec (= 11 + 第 6 補正 2)

### 2.1 3 source 共存 5+1 拘束条件 (= §13.1.6 確定 + #12 状態遷移)

#### #1 source provenance を UI 上でどう見せるか

**確定 spec**:
- **subtle 色 dot** (= 4 px の small dot、 card 左下 or pin 内部に配置)
  - `user entered`: 色 dot **なし** (= default、 大多数を占める想定)
  - `imported`: **slate-500 dot** (= 静的 source の neutral 色)
  - `Alter generated`: **indigo-500 dot** (= brand color、 但し subtle)

**検討した代替案 (= 不採用)**:
- text badge (= 「import」 「Alter」 等): **overemphasis 違反**
- icon (= cloud / sparkle 等): **visual noise 違反**

**理由**: 一見では普通の anchor、 知りたい時だけ見える = 観測 layer の体験を壊さない。

---

#### #2 各 source の編集可能性

**確定 spec**:

| source | 時刻 | 場所 | title | メモ | Execution Layer |
|---|---|---|---|---|---|
| `user entered` | ✅ 自由 | ✅ 自由 | ✅ 自由 | ✅ 自由 | ✅ 自由 |
| `imported` | 🔒 ロック | 🔒 ロック | ✅ 変更可 | ✅ 変更可 | ✅ 変更可 |
| `Alter generated` (確定前) | 受け入れ前は **未表示** (= 提案中) | — | — | — | — |
| `Alter generated` (確定後) | **user entered 化** (= source provenance 変換) | ✅ 自由 | ✅ 自由 | ✅ 自由 | ✅ 自由 |

**理由**:
- imported = 取り込み source の **真実性保持** (= シフト表の時刻を勝手に動かさない)
- ただし user override 可能領域 (= title / メモ / Execution Layer) で自由を保持
- Alter generated は **受け入れ前 = 提案 / 受け入れ後 = user own** という明確 transition

---

#### #3 会話由来 plan と imported schedule の競合解決

**確定 spec**:
- **競合検出**: 同日同時刻 anchor が複数 source で存在
- **解決**: **user 確認 modal** で明示提示 (= 自動マージ **禁止**)
  - modal 例: 「2026-05-24 14:00-18:00 に複数の予定があります: シフト (imported) / 飲み会 (Alter 提案)。 どちらを採用しますか?」
  - 選択肢: **両方残す** / imported 優先 / Alter 優先 / 修正
- **両方残す** が default (= user の選択尊重、 push しない)

**理由**: 自動マージは user の意図に反する risk、 確認 modal は friction だが思想整合。

---

#### #4 list / map で 3 source 混在時の優先表示ルール

**確定 spec**:
- **時刻順** (= 自然順序、 first sort key)
- **同時刻なら source 順**: `imported` → `user entered` → `Alter generated`
  - 理由: imported = 確定度最高 / user = 自分意志 / Alter generated = 提案
- **同時刻 visual stacking**: List では縦並び (= sub-card)、 Map では同 pin 内 multi-icon

---

#### #5 generated plan を確定前 / 確定後で表現分離

**確定 spec**:

| 状態 | card border | opacity | label chip | tap action |
|---|---|---|---|---|
| **確定前** (= Alter generated proposal) | **dashed** (= 仮確定感) | **0.7** | **「受け入れる ›」** chip (= subtle) | 詳細 sheet で「受け入れる / 修正 / 削除」 |
| **確定後** (= user accepted) | **solid** (= 通常) | **1.0** | なし | 通常 anchor と同じ |

**理由**: 視覚的に「提案 vs 確定」 を即座に区別、 user の判断負荷を下げる。

---

#### #12 3 source 状態遷移 + 競合解決単位 (= GPT 第 6 補正、 静的共存から動的状態へ)

GPT 第 6 補正: 「3 source は静的共存だけでなく **状態遷移まで定義**」

**source 状態の全集合** (= state machine):

| state | 説明 |
|---|---|
| `user_entered` | user が直接入力 |
| `imported` | 文書取り込み (= シフト表 / 時間割 / PDF)、 source 真実性保持 |
| `alter_generated_proposed` | Alter 提案、 **未確定** (= user 受け入れ前) |
| `alter_generated_accepted` | user 受け入れ済 (= 内部状態、 表示上は user_entered に変換、 Alter 由来 hint は保持) |
| (= 後段) `alter_generated_expired` | 提案放置 (= 24h 等) で expire、 archive |

**状態遷移 table** (= 確定 spec):

| 初期 source | 遷移 trigger | 遷移後 source | 備考 |
|---|---|---|---|
| `user_entered` | user 編集 | `user_entered` (= 同) | source 変化なし |
| `user_entered` | 削除 | (= 削除) | — |
| `imported` | user 編集 (= title / メモ / Execution Layer) | **`imported`** (= source 維持) | 編集差分は保存、 originally imported は不変 |
| `imported` | user 編集 (= 時刻 / 場所) | **ロック** (= 編集不可) | 真実性保持 (= §2.1 #2) |
| `imported` | 削除 | (= 削除) | imported source も削除 |
| `imported` | (= 後段) user による override 強要 | (= 後段) `user_overridden_import` | 本 audit では未採用、 §10 後段 evaluation |
| `alter_generated_proposed` | 受け入れる | **`user_entered`** (= Alter 由来 hint 保持) | source 変換、 Alter 由来 history は metadata 保持 |
| `alter_generated_proposed` | **修正後受け入れ** | **`user_entered`** (= Alter 由来 + 修正 hint) | 同上 + user 修正記録 |
| `alter_generated_proposed` | 削除 (= 拒否) | (= 削除) | Alter 学習: 「user は当該提案を拒否」 (= §2.2 #13 連携) |
| `alter_generated_proposed` | 放置 (= 24h 等) | (= 後段) `alter_generated_expired` | 本 audit では simple 削除 default、 後段で expire policy |
| `alter_generated_accepted` | user 編集 | `user_entered` (= 既に user own) | 受け入れ後は user_entered と同等 |

**競合解決の単位** (= 確定 spec):

| 単位 | 適用 | 確定動作 |
|---|---|---|
| **時刻スロット単位** | 同日同時刻範囲で複数 source の anchor 検出 | confirm modal trigger (= §2.1 #3) |
| **anchor 単位** | modal 内の選択 (= imported 残す / Alter 残す / 両方残す / 修正) | 1 anchor 単位で remove or keep |
| **time slot 単位** | 両方残す時の visual handling | List 縦並び (= sub-card stack) / Map 同 pin multi-icon (= §2.1 #4 連携) |

**未確定 / 確定 generated の区別** (= 確定 spec、 §2.1 #5 連携):

- **未確定** (= `alter_generated_proposed`): dashed border + opacity 0.7 + 「受け入れる ›」 chip
- **確定済** (= `alter_generated_accepted` → user_entered 変換後): solid border + opacity 1.0 + chip なし
- **metadata**: 確定後も「Alter 由来」 hint は内部保持 (= 例: subtle indigo dot in card detail)、 但し主画面 visual は user_entered と同等

**理由**: 静的「3 source」 という分類だけでは user 操作後の挙動が曖昧。 状態遷移 table で全 transition を網羅、 競合解決の単位を 3 階層で確定、 未確定/確定の visual + metadata 分離で IA の動的整合を確保。

---

### 2.2 Event Execution Layer 6+1 拘束条件 (= §13.1.7 確定 + #13 学習ループ)

#### #6 Event card 上で軽いサイン

**確定 spec**:
- **「準備 3」 chip** (= text-xs + text-slate-500 + 数字明示)
- 配置: **card footer line** (= title / 時刻 / 場所の下、 footer 右寄せ)
- 0 件: **chip 非表示**
- 6 種類複合: **compound 表示** (= 「準備 3 / 事後 1」、 「持ち物 5 / 当日注意 2」 等)
- visual: **slate 系のみ** (= brand color 不使用、 規約 24-extended 整合)

**検討した代替案 (= 不採用)**:
- icon-only (= clip / list icon 等): 意味不明瞭 → 数字必須
- color-coded badge (= category color): visual noise

---

#### #7 詳細 sheet でどの順番で見せるか

**確定 spec**: 時系列順 + 重要度順

| 順序 | section | default state |
|---|---|---|
| 1 | **準備** (= 持ち物 / 服装 / 充電 等) | expanded |
| 2 | **当日注意** (= 10 分前到着 / 現金のみ 等) | expanded |
| 3 | **実行タスク** (= 共有 / 送付 / 印刷 等) | expanded |
| 4 | **条件依存** (= 雨なら中止 等) | expanded |
| 5 | **事後タスク** (= お礼 / 精算 等) | expanded |
| 6 | **学習メモ** (= 「次回 PC + 充電器」 等) | **default folded** (= 重要度低、 user が「見たい」 時開く) |

**理由**:
- 1-5 は時系列 (= 事前 → 当日 → 事後)
- 6 は user の学習結果 (= 次回向け、 当該予定の実行に直接関係ない)

---

#### #8 どのイベントには出さないのか

**確定 spec**:
- **付与条件 5 系統** (= direction §10.7.3) に当てはまらない場合: **出さない**
- 具体的「出さない」 trigger:
  - **軽い予定** (= 「10 分の電話」 「カフェで休憩」 「散歩」 等の low-energy event)
  - **繰り返し routine** (= 「歯磨き」 「日常ジム」 等で recurring learning #4 が安定済)
  - **transit / 移動 anchor** (= 移動自体は Execution Layer 不要)
- **付与する trigger** (= 5 系統):
  - A. 推論で自動提案 (= 「会議」 → 資料 / PC)
  - B. user が必要だと言った時
  - C. 過去行動から学習
  - D. 外部データ由来
  - E. 高負荷イベントのみ (= 旅行 / 面接 / 病院 / 会議 / プレゼン / 出張 / 重要会食)

**判定 logic**: high-energy keyword 検出 OR user explicit request OR learned pattern hit OR import source contains preparation info → 付与。

---

#### #9 推論 / user 追加 / imported 由来の区別

**確定 spec**: 各実行項目に **icon prefix** (= 1 line に 1 icon)

| 由来 | icon prefix | 例 |
|---|---|---|
| **Alter 推論** | sparkle icon (= 既存 Alter sparkle、 indigo-400) | ✨ 履歴書 |
| **user 追加** | なし (= default) | 印鑑 |
| **imported** (= 文書由来) | small document icon (= slate-400) | 📄 制服 (= シフト表から) |
| **過去学習** | small repeat icon (= slate-400) | ↻ 充電器 (= 毎回持参) |

**理由**:
- icon size: 12 px (= subtle、 visual noise 回避)
- color: source に応じて変更 (= Alter のみ brand 色、 他は slate)
- text 重複禁止 (= 「Alter 推論: 履歴書」 とは書かない、 icon で表現)

---

#### #10 imported event に Execution Layer を付ける時の provenance

**確定 spec**: **hybrid 表示**

```
[imported anchor: シフト 14:00-18:00]
  source: 📄 シフト表 imported
  Execution Layer (= Alter 後付け推論):
    ✨ 制服
    ✨ 社員証
    ↻ お弁当 (= 過去学習)
    (user 追加可)
```

- **anchor 自体** の source: imported (= 不変、 ロック)
- **Execution Layer 項目** の source: 各 line で individual (= Alter / user / imported / 学習 のいずれか)
- 表示: anchor card と Execution Layer は **provenance 分離** (= 別 source として表示)

**理由**: imported anchor は不変、 但し付随する準備 / 持ち物は Alter が後付け推論で柔軟に。

---

#### #11 将来の Alter 会話 deep-dive との接続

**確定 spec**:
- 詳細 sheet の **最下部** に **「Alter で深く考える ›」** button
  - text-sm + text-slate-500 (= subtle)
  - sparkle icon prefix
  - tap → Alter 会話 surface (= 別 layer、 別 phase で実装)
- 例 conversation starter (= sheet で context 受け継ぐ):
  - 「この予定の準備をもっと深く考える」
  - 「足りない準備はある?」
  - 「出発時刻は何時がいい?」
- 主画面では **overemphasis 回避** (= 詳細 sheet 内のみ button 表示、 card 上には出さない)

**本 audit scope**: button の **配置候補** のみ確定。 navigate 先 (= Alter 会話 surface) の実装は別 phase。

---

#### #13 Plan ↔ Alter 学習ループ + source 別学習対象 (= GPT 第 6 補正、 概念から前提化へ)

GPT 第 6 補正: 「Event Execution Layer は Plan ↔ Alter の **学習ループまで前提化**」

**学習ループの全体像** (= 確定 spec):

```
[Alter 推論] → [Plan 表示] → [user 修正/追加/削除] → [学習 store] → [次回 Alter 推論改善]
                                                            ↓
                                              [silent learning、 user に通知しない]
```

**user 修正 → Alter 学習 mapping** (= 確定 spec):

| user 行為 | Alter 学習 |
|---|---|
| Alter 推論項目を **削除** | 「次回同種予定で当該項目は推論しない」 (= recurring negative learning) |
| Alter 推論項目を **修正** | 「修正後内容を次回 default 推論にする」 (= 修正自体が学習 source) |
| **手動追加項目** を作成 | 「次回同種予定で当該項目を推論候補にする」 (= user pattern positive learning) |
| 項目 **order 変更** | 「次回 priority order に反映」 (= priority learning) |
| (= 後段) 項目 **完了マーク** | 「予定時に当該項目が完了されたか」 を追跡、 完了率 metric (= future) |

**source 別の学習対象差** (= 確定 spec):

| source | 学習対象か | 理由 |
|---|---|---|
| **imported** (= 文書由来) | **学習対象外** | 文書 source の事実 (= シフト表 = 会社の確定情報)。 user 修正があれば override として保存、 但し Alter は文書 source を「正本」 と扱い続ける |
| **Alter 推論** | **学習対象** | user 修正で推論モデル更新 (= core learning) |
| **user 追加** | **学習対象** | user の自発的 pattern → 推論候補化 (= positive pattern learning) |
| **過去学習** (= recurring) | **学習対象 (= 強化または弱化)** | user 修正でループ内更新 |

**Plan 側編集 → Alter 側学習反映 spec** (= 確定):

- 編集 event は **学習 store** に送信 (= 例: `alter_learning_events` table、 detail は別 phase)
- Alter は学習 store を参照して次回推論を生成
- user に「学習しました」 表示は **出さない** (= **silent learning**、 push しない)
- 後段で「Alter があなたから学んだこと」 surface で可視化可能 (= future、 別 phase)
- 学習の **可逆性**: user は学習を「忘れさせる」 (= reset 行為) も可能、 但し UI は別 phase で

**学習ループの本 audit scope**:
- 本 IA audit では **学習対象と学習方向の定義のみ**確定
- 学習 store の実装 / Alter 推論 engine 接続 / silent learning UI / 可視化 surface は **別 phase**
- IA 上は「Plan ↔ Alter 双方向接続を前提とする UI 余地」 を確保 (= 例: Execution Layer 項目に「Alter 学習対象」 metadata の見えない slot)

**理由**: 「Event Execution Layer」 が単なる static checklist で終わるか、 **動的学習システム**として育つかの分岐点。 GPT 第 6 補正は後者を前提化、 IA Audit で学習方向を確定することで後段 implementation が「予定 1 件の実行知能 → 1 日の生成精度向上 → 北極星 §6.1 第 1 層」 への直接 driver となる。

---

## 3. List の Information Architecture

### 3.1 主役 (= 時間の流れ)

**確定**: List の主役は **時間の流れ** (= 「1 日が時間軸で展開する」)

- spine = 縦の time axis
- event = spine 上の単位
- transition = event 間の余白
- summary = 1 日全体の俯瞰

→ user が tap で見る情報は「**今日が時間としてどう流れるか**」 に集約。

### 3.2 情報層 (= 1 画面 4 層)

**確定**: List は **4 層構造** (= top to bottom)

| 層 | 内容 | 配置 |
|---|---|---|
| **layer 1: header** | brand + section label「Alter Planning」 + 主見出し「今日のプラン」 + subtitle | 上部固定 (= sticky) |
| **layer 2: navigation** | toggle (= マップ/リスト) + date selector | header 直下 |
| **layer 3: timeline body** | event card (= spine 上) + transition chip | 主スクロール領域 |
| **layer 4: summary footer** | 1 日全体観測 (= 「78% バランス良好」 等) + 「リズムを整えるヒント」 CTA | 下部 (= scroll 下限) |

→ 各層は **責務 1 つ** に絞る (= 二重表示禁止)。

### 3.3 削除対象 (= GPT 第 2 補正反映)

**確定** (= 主画面から外す):

| 削除対象 | 理由 | 移動先 |
|---|---|---|
| **上下二重表示** (= 上 card 一覧 + 下 timeline) | 「どちらが本物?」 問題、 主役曖昧 | 統一して timeline body のみに |
| **category-by-place** (= 家/職場/学校/カフェ/公共/屋外/移動/未分類) | 主画面で主張しすぎ、 今日の流れを壊す | **二次画面** (= 地理プロフィール / 場所パターン surface) に移動 |
| **map / list の visual language 分離** | 別製品に見える | List spec 確定後、 Map に流す (= GPT 順序整合) |

### 3.4 card vs line vs chip 使い分け

**確定**:

| 要素 | 使う場面 | 例 |
|---|---|---|
| **card** | 主役 (= 1 つの event = 1 つの観測単位) | event card (= 時刻 / title / 場所 / 補助文 / image) |
| **line** | spine + transition (= 時間の流れの構造) | timeline spine line / transition 区切り line |
| **chip** | 軽い meta + indicator (= 主役ではない) | transition「移動・リフレッシュ」 / 「準備 3」 indicator |

**判断基準**: 「user が tap で操作する責務があるか」
- ある → card
- 構造表現のみ → line
- 軽い meta → chip

### 3.5 List 上の 3 source 共存 spec (= §2.1 適用)

**確定**:
- card 左下 に **source dot** (= §2.1 #1: なし / slate-500 / indigo-500)
- 編集 affordance (= §2.1 #2): tap で詳細 sheet、 編集可能領域は source ごとに gating
- 競合 (= §2.1 #3): timeline 上で **time slot conflict indicator** (= 細い red 線ではなく subtle slate stacking)、 tap で確認 modal
- 優先表示 (= §2.1 #4): 同時刻なら imported → user → Alter generated の縦 stack
- 確定前後 (= §2.1 #5): Alter generated は dashed border + opacity 0.7 + 「受け入れる」 chip

### 3.6 List 上の Event Execution Layer spec (= §2.2 適用)

**確定**:
- card footer line に **「準備 3」 chip** (= §2.2 #6)
- tap → 詳細 sheet (= 6 section、 §2.2 #7 順序)
- 付与は §2.2 #8 logic (= 全予定に出さない)
- 詳細内の source 区別 (= §2.2 #9): icon prefix
- imported hybrid (= §2.2 #10): anchor source + Execution Layer source 分離
- Alter 会話接続 (= §2.2 #11): sheet 最下部 button

### 3.7 List IA 確定 spec (= ASCII 図)

```
┌─────────────────────────────────────────────┐
│ [layer 1: header (= sticky)]                │
│   ANEURASYNC ALTER                          │
│   Alter Planning (= subtle 紫 Title case)   │
│   今日のプラン                              │
│   時間の流れを把握して、心地よい 1 日に。   │
├─────────────────────────────────────────────┤
│ [layer 2: navigation]                       │
│   マップ | リスト (= toggle、 right)         │
│   < 6月12日 (木) >                          │
├─────────────────────────────────────────────┤
│ [layer 3: timeline body (= scroll)]         │
│                                              │
│   09:00 ●──┐ ┌─────────────────────────┐   │
│            │ │ ┃ event card #1           │   │
│            │ │ 09:00-11:00 カフェ        │   │
│            │ │ 📍 山梨県甲府市〜         │   │
│            │ │ ✨ 集中しやすい〜整理      │   │
│            │ │ [image]                   │   │
│            │ │ ● (= source dot)          │   │
│            │ │ 準備 3 (= chip footer)    │   │
│            │ └───────────────────────────┘   │
│            │                                  │
│   ── 移動・リフレッシュ ─ ─ 11:00-12:00 ── │
│            │                                  │
│   12:00 ●──┤ ┌─────────────────────────┐   │
│            │ │ event card #2 (Alter gen) │   │
│            │ │ dashed border + opacity .7│   │
│            │ │ [受け入れる ›] chip       │   │
│            │ └───────────────────────────┘   │
│                                              │
│   [empty day entry]                          │
│   「ALTER で見る ›」 (= N-3a 連携)           │
├─────────────────────────────────────────────┤
│ [layer 4: summary footer]                   │
│   78% バランス良好                          │
│   集中と休息のバランスが取れた良いプラン。 │
│   「リズムを整えるヒント ›」                │
├─────────────────────────────────────────────┤
│ [bottom tab nav (= global)]                 │
│   今日のプラン / インサイト / Alter メモ / 設定 │
└─────────────────────────────────────────────┘
```

---

## 4. マップの Information Architecture (= List 延長)

### 4.1 主役 (= 空間の today)

**確定**: マップの主役は **空間の today** (= 「1 日が空間軸で展開する」)

- spine = 地理 layout (= map view)
- event = pin (= spine 上の単位)
- transition = dashed route (= pin 間の流れ)
- summary = bottom sheet (= 選択中スポットの意味)

### 4.2 マップ vs sheet (= 主役 / 補完)

**確定**:
- **マップ = 主役** (= 画面 60-70% area)
- **bottom sheet = 補完** (= 画面 30-40% area、 draggable)
- sheet は **3 段階** (= peek 80px / half 50% / full 90%)

### 4.3 pin / route / selected state 階層

**確定**:

| 階層 | 要素 | spec |
|---|---|---|
| 1 | **pin** (= event 単位) | 時刻ラベル + category color + category icon |
| 2 | **route** (= 流れ) | dashed line + slate-400 + 2px、 pin 時系列順 |
| 3 | **selected state** (= 現在 focus) | 1.2x scale + ring + shadow-lg |

### 4.4 凡例 / controls / sheet 役割

| 要素 | 配置 | 役割 |
|---|---|---|
| **凡例** | bottom-left | category 色の意味 (= subtle、 常時 visible) |
| **controls** (= +/-/現在地) | right | map 操作 (= 標準 UX) |
| **bottom sheet** | bottom (= draggable) | 選択中 pin の詳細 (= card 内容と同等) |

### 4.5 マップ 上の 3 source 共存 spec (= List spec 流用)

**確定**:
- pin 内部に **source dot** (= 右下、 §2.1 #1 同色)
- 同時刻同地点の複数 source: **multi-icon pin** (= category icon を縦並び)
- 編集 / 競合 / 優先表示 / 確定前後: List と同 spec

### 4.6 マップ 上の Event Execution Layer spec (= List spec 流用)

**確定**:
- pin 右上に **小さい indicator** (= 「準備あり」 dot)、 非数字 (= 空間 visual の noise 回避)
- tap → bottom sheet 内に Execution Layer section 展開
- sheet 内 spec は List と同 (= 6 section、 source icon prefix、 Alter 接続 button)

### 4.7 マップ IA 確定 spec (= ASCII 図)

```
┌─────────────────────────────────────────────┐
│ [layer 1+2: header + navigation (= List 共通)]│
├─────────────────────────────────────────────┤
│ [layer 3: map area (= 主役、 60-70%)]       │
│                                              │
│   ● pin 09:00 カフェ (= 紫 + ● source dot)  │
│       ┊ dashed                              │
│   ● pin 12:00 ランチ (= オレンジ)            │
│       ┊                                      │
│   ● pin 14:00 オフィス (= 青)                │
│       ┊                                      │
│   ● pin 18:00 帰宅 (= 緑)                    │
│                                              │
│   [legend: bottom-left]                     │
│     カフェ / ランチ / オフィス / 帰宅       │
│   [controls: right]                         │
│     + / - / 現在地                          │
├═════════════════════════════════════════════┤
│ [layer 4: bottom sheet (= 補完、 30-40%、    │
│   draggable peek/half/full)]                │
│   ── handle ──                              │
│   09:00 甲府駅近くのカフェ                  │
│   📍 山梨県甲府市〜  ● (= source dot)        │
│   ✨ 集中しやすい〜整理しましょう           │
│   [image]                                   │
│   準備 3 / 事後 1 (= Execution chip)        │
│   [詳細を見る] [ここへの経路]                │
├─────────────────────────────────────────────┤
│ [bottom tab nav (= List 共通)]              │
└─────────────────────────────────────────────┘
```

---

## 5. 共通 IA 原則

### 5.1 1 画面 1 主役

- List → 時間軸主役 (= timeline spine が中心)
- マップ → 空間軸主役 (= map view が中心)
- 二画面で **同じ 1 日を 2 軸で観測** (= toggle で切替、 同じ source / 同じ data)

### 5.2 二層 visual 統合 (= 観測 / 生成シームレス)

- 観測 (= user entered + imported) と生成 (= Alter generated) は **同じ surface に統合表示**
- 区別は **subtle dot + 確定前後の visual** のみ (= overemphasis 回避)
- user の自然な選択 (= 受け入れる / 修正 / 削除) で観測 → 生成 → 観測のサイクル

### 5.3 source provenance 統一構造

すべての anchor + Execution Layer 項目に source 属性:
- anchor source: `user_entered` | `imported` | `alter_generated`
- Execution Layer 項目 source: `alter_inferred` | `user_added` | `imported` | `learned`

### 5.4 user 編集権限 layer

- user は **常に override 可能** (= imported でも title / メモ / Execution Layer は変更可)
- 但し source 真実性 (= imported の時刻 / 場所) はロック (= §2.1 #2)

---

## 6. 削除 / 主画面外し対象 (= 旧 UI 整理)

### 6.1 List の上下二重表示
- 旧: 上 card 一覧 + 下 timeline で同情報重複
- 新: **timeline body のみ** に統一 (= 4 層構造、 §3.2)

### 6.2 category-by-place
- 旧: 家/職場/学校/カフェ/公共/屋外/移動/未分類が主画面で主張
- 新: **二次画面** (= 地理プロフィール / 場所パターン surface) に移動
- redesign 主画面では非表示

### 6.3 map / list 分離 visual
- 旧: マップ と list で visual language 異なる
- 新: **共通 design tokens + 共通 component** (= source dot / Execution chip / card 共通化)

---

## 7. 参考画像から採るもの / 採らないもの (= 再整理)

| 採るもの | 採らないもの |
|---|---|
| timeline spine 構造 | score の思想 (= 構造論点として §13 IA で再判断) |
| event card 4 要素 (= 時刻/title/場所/補助文/image) | 指導的 copy (= 「整理しましょう」 等は §11.5 第 2 補正で revert + 自然な日本語維持) |
| transition chip | generic lifestyle app 的決め打ち |
| bottom sheet (= マップ) の draggable | — |
| pin の category color + 時間ラベル | — |
| dashed route で 1 日の流れ | — |

---

## 8. Event Execution Layer: 核 + 拡張分離 (= GPT 第 5 補正留意点 #2)

### 8.1 核 (= IA Audit first-class、 必須)

GPT 提案 (= direction §10.7 + §13.1.7):
- **6 種類** (= 準備 / 実行タスク / 条件依存 / 当日注意 / 事後タスク / 学習メモ)
- **5 付与条件** (= A-E、 §10.7.3)
- **10 軸** (= 持ち物 / 事前 / 確認 / 移動 / お金 / コミュ / 服装 / mental / リスク / 事後)
- **構造** (= 「ToDo」 ではなく「準備オブジェクト」、 `EventExecutionLayer` type)
- **UI 3 層** (= 軽いサイン / 詳細セクション / Alter 深掘り)
- **GPT 強化 7** (= 逆算 / 必須任意推奨 / confidence / recurring learning / template / provenance / missing detection)
- **禁止 4** (= 全予定 ToDo / 断定 / 主役化 / 最適化先行)

→ **IA Audit で first-class 採用** (= §2.2 で全 6 拘束条件確定済)

### 8.2 拡張候補 (= 後続評価、 IA first-class ではない)

私の自律追加 6 案 (= direction commit `47da95c1` 報告で提示):

| # | 案 | 評価 (= 拡張候補) |
|---|---|---|
| 8 | 連鎖予定 (= dependency chain) | ⚠️ chain visualization の複雑性、 まず 1 予定単位の Execution が確立後 |
| 9 | alternative paths (= 代替案) | ⚠️ Counter-Factual Observation との境界注意 (= generation 禁止) |
| 10 | シェアド準備 | ⚠️ Rendezvous との接続必要、 別 phase |
| 11 | 過去予定からのテンプレ自動学習 | ⚠️ Alter 学習 engine の実装後 (= future) |
| 12 | buffer time の能動提案 | ⚠️ push UX のリスク、 control を user に保持 |
| 13 | 未完の継続追跡 | ⚠️ 追跡 visual の overemphasis 回避必要 |

→ **後続 evaluation 段階** (= IA first-class 化しない、 GPT 第 5 補正留意点 #2 遵守)

### 8.3 scope 超過 (= 別 layer / 別 audit、 Event Execution Layer 範囲外)

| 案 | 移動先 |
|---|---|
| エネルギー / 集中度予測 | 観測 layer (= Daily Guidance Engine の 6 mode と接続) |
| 時間的密度バランス | 1 日全体 layer (= List summary footer 領域) |
| 予定の意味タグ (semantic tagging) | Daily Guidance Engine 延長 (= 別 audit) |
| 共起予定の重複検出 | 学習 layer 上位 (= 別 audit) |

→ Event Execution Layer (= 予定 1 件の実行知能) と 1 日全体 layer は **別 audit** で扱う。

---

## 9. IA Audit 完了判定 (= §13.1.8 チェックリスト)

### 9.1 13 必須項目 確定状態 (= 11 + 第 6 補正 2)

| # | 項目 | 状態 | 出典 |
|---|---|---|---|
| 1 | source provenance UI | ✅ 確定 (= subtle 色 dot) | §2.1 #1 |
| 2 | 各 source 編集可能性 | ✅ 確定 (= source 別 affordance table) | §2.1 #2 |
| 3 | 会話 plan と imported schedule 競合解決 | ✅ 確定 (= user 確認 modal、 自動マージ禁止) | §2.1 #3 |
| 4 | 3 source 混在時の優先表示 | ✅ 確定 (= 時刻順 + source 順 + stacking) | §2.1 #4 |
| 5 | generated plan 確定前後の表現分離 | ✅ 確定 (= dashed/opacity/chip vs solid) | §2.1 #5 |
| **12** | **3 source 状態遷移 + 競合解決単位** (= 第 6 補正) | ✅ 確定 (= state machine 全 transition table + 競合解決 3 階層 + 未確定/確定 visual+metadata 分離) | §2.1 #12 |
| 6 | Event card 上の軽いサイン | ✅ 確定 (= 「準備 3」 chip、 footer 配置) | §2.2 #6 |
| 7 | 詳細 sheet の表示順序 | ✅ 確定 (= 時系列順 + 学習メモ default folded) | §2.2 #7 |
| 8 | 出さないイベントの判定 | ✅ 確定 (= 5 系統 trigger logic) | §2.2 #8 |
| 9 | 推論 / user / imported 由来区別 | ✅ 確定 (= icon prefix table) | §2.2 #9 |
| 10 | imported event Execution Layer hybrid | ✅ 確定 (= provenance 分離表示) | §2.2 #10 |
| 11 | Alter 会話 deep-dive 接続 | ✅ 確定 (= sheet 最下部 button) | §2.2 #11 |
| **13** | **Plan ↔ Alter 学習ループ + source 別学習対象** (= 第 6 補正) | ✅ 確定 (= user 修正→Alter 学習 mapping + source 別学習対象表 + silent learning + 学習 store 仕様 + IA 上の UI 余地確保) | §2.2 #13 |

### 9.2 完了基準充足確認

| 基準 | 充足 |
|---|---|
| 11 必須項目すべて確定 | ✅ (= §9.1 で全 11 件 confirmed) |
| 各項目に具体的 UI / 構造 spec が記録 | ✅ (= §2 で 11 項目すべて具体 spec) |
| 「概念」 「方向性」 等の曖昧表現での residual | ✅ **0 件** (= §2 で全項目 spec、 「ここで決めます」 表現なし) |

→ **IA Audit 完了基準充足** (= §13.1.8、 direction audit 完了判定通過)

---

## 10. 次 sub-phase (= List Redesign Spec) への接続

### 10.1 引き継ぎ事項 (= List Redesign Spec audit で受け取る)

- List IA 確定 spec (= §3、 4 層構造 + spine + card + chip)
- 11 拘束条件確定 spec (= §2、 List に適用)
- Event Execution Layer 核 (= §8.1)
- 削除対象 (= §6)
- ASCII 図 (= §3.7)

### 10.2 List Redesign Spec で決めるべきこと (= IA を超える、 詳細)

- component 設計 (= EventCard / TimelineSpine / TransitionChip / SummaryFooter)
- typography (= type scale、 §3.1 direction audit 補完)
- spacing scale (= 余白 / padding / gap)
- color tokens (= category color / source dot color / slate scale)
- motion (= framer-motion 既存依存内、 fade / reveal / drag)
- interaction (= tap / hover / focus、 規約 24-extended 整合)
- a11y (= ARIA / keyboard / contrast)

### 10.3 順序 (= direction §13.1 確定、 16 phase)

| # | phase | docs/impl |
|---|---|---|
| 3 (= 本 audit) | **List/Map IA Audit** ★完了予定★ | docs |
| 4 | **List Redesign Spec audit** | docs |
| 5 | List redesign impl | impl |
| 6 | List closeout | docs |
| 7 | Map Redesign Spec audit | docs |
| 8 | Map redesign impl | impl |
| 9 | Map closeout | docs |
| 10 | Design System Extraction audit | docs |
| ... | (= 詳細 direction §13.1) | — |

---

## 11. risk 評価

| risk | level | mitigation |
|---|---|---|
| 11 拘束条件 spec が List Redesign Spec で逸脱 | medium | 本 IA audit を **拘束条件**として継承、 List Redesign Spec 着手時に §9 チェックリスト再確認 |
| Event Execution Layer 自律追加 6 案が拡張で混入 | medium | §8.2 で「IA first-class ではない」 と明示、 後続 evaluation で個別判断 |
| 削除対象 (= category-by-place 等) の二次画面移行で UX 劣化 | medium | 二次画面 audit (= 別 phase) で詳細化 |
| 二重表示の解消で機能消失 | low | 表示形式変更のみ (= 情報量は維持)、 List Redesign Spec で具体化 |
| マップ の visual language が list と乖離 | low | §4 で List 流用 spec 明示、 共通 design tokens 後段 |
| ASCII 図と実装の乖離 | low | List Redesign Spec で実 component 化、 ASCII 図は IA 表現の補助 |

---

## 12. 禁止事項

### 12.1 永続禁止 (= direction §14.1 継承)

- Arrival Risk Memory
- Counter-Factual generation (= Observation は OK)
- 「おすすめ」 / 「これをした方がいい」 / 「最適」 / 「最適化」 / 「推奨」 / 「改善」 / 「警告」 / 「危険」 / 「注意」 / 「リスク」
- amber / orange / red 警告色
- icon / badge / warning box
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- fetch / push / gh / reset / restore / stash / branch delete
- Routes API / 実 API
- Deploy readiness / Stargazer pivot / Rendezvous / Genome pivot / 初期ユーザー獲得

### 12.2 IA Audit 固有禁止

- 11 拘束条件の **曖昧表現での residual** (= 「ここで決める」 「方向性」 等の概念止まり)
- Event Execution Layer 自律追加 6 案の **first-class 化** (= 拡張候補として後続評価のみ)
- direction audit からの **無断逸脱** (= 11 拘束条件と矛盾する spec)
- List Redesign Spec への **先取り実装計画** (= IA は構造のみ、 detail spec は別 audit)

### 12.3 本 audit 段階固有禁止 (= docs only)

- 実装着手 (= 新規 file 作成、 既存 file 改変)
- 別 sub-phase audit (= List Redesign Spec) への独断進行
- frozen branches 追加 commit

---

## 13. CEO 判断項目 (= 報告で停止)

### 13.1 拘束条件確定

| # | 判断項目 |
|---|---|
| 1 | 3 source 共存 **5+1** 拘束条件 spec (= §2.1、 #1-#5 + **#12 状態遷移**) 採用 |
| 2 | Event Execution Layer **6+1** 拘束条件 spec (= §2.2、 #6-#11 + **#13 学習ループ**) 採用 |
| 3 | **13 拘束条件** 完了判定 (= §9) 通過 |

### 13.2 IA 確定

| # | 判断項目 |
|---|---|
| 4 | List IA 確定 spec (= §3、 4 層構造 + ASCII 図) 採用 |
| 5 | マップ IA 確定 spec (= §4、 マップ主役 + sheet 補完) 採用 |
| 6 | 共通 IA 原則 (= §5、 1 画面 1 主役 + 二層統合 + provenance 統一) 採用 |

### 13.3 削除 + Event Execution Layer 分離

| # | 判断項目 |
|---|---|
| 7 | 削除対象 (= §6、 二重表示 / category-by-place / map-list 分離) 採用 |
| 8 | Event Execution Layer 核 + 拡張分離 (= §8) 採用 |

### 13.4 進行

| # | 判断項目 |
|---|---|
| 9 | 次 sub-phase (= List Redesign Spec audit) 進行承認 |

---

## 14. 結論

### 14.1 本 audit の成果

1. **13 必須拘束条件** **全項目確定** (= §2、 11 + 第 6 補正 2、 各項目に具体的 UI/構造 spec、 曖昧 residual 0)
2. List IA 完全確定 (= §3、 4 層構造 + spine + card + chip + ASCII 図)
3. マップ IA 完全確定 (= §4、 マップ主役 + sheet 補完 + List 流用)
4. 共通 IA 原則 (= §5、 1 画面 1 主役 + 二層統合 + provenance 統一 + user 編集権限)
5. 削除対象明示 (= §6、 二重表示 / category-by-place / map-list 分離)
6. Event Execution Layer 核 + 拡張分離 (= §8、 GPT 第 5 補正留意点 #2 遵守)
7. IA Audit 完了基準充足確認 (= §9、 13 項目 全 ✅)
8. List Redesign Spec への引き継ぎ事項整理 (= §10)
9. **3 source 状態遷移 + 競合解決単位確定** (= §2.1 #12、 GPT 第 6 補正、 state machine 全 transition + 競合 3 階層 + 未確定/確定 metadata 分離)
10. **Plan ↔ Alter 学習ループ前提化** (= §2.2 #13、 GPT 第 6 補正、 user 修正→Alter 学習 mapping + source 別学習対象 + silent learning + 学習 store IA 余地)

### 14.2 IA Audit 完了宣言

> 本 IA audit は direction audit `e99406ce` で確立した **11 必須拘束条件** + GPT 第 6 補正 **2 追加拘束条件** (= #12 状態遷移 + #13 学習ループ) の **計 13 拘束条件**をすべて具体的 spec として確定した。 §13.1.8 の完了判定基準 (= 必須項目 + 具体 spec + 曖昧 residual 0) を **充足**。 静的共存から **動的状態遷移**、 概念から **学習ループ前提化**に昇格。 List Redesign Spec audit に進める状態。

### 14.3 次のアクション (= CEO 判断後)

1. CEO 判断 (= §13、 主要 9 項目)
2. 採用なら → **List Redesign Spec audit** に進行 (= 別 audit / 別 branch、 §10.2 の 7 領域)
3. その後 List redesign impl → Map Redesign Spec → impl → Design System Extraction
4. merge: 引き続き /plan complete まで frozen 維持 (= 戦略 C)

### 14.4 自律推奨 (= 思考原則 ⑤ ゴールから逆算)

- /plan complete までの最短経路: IA Audit (= 本 audit) → List Spec → impl → List closeout → Map Spec → impl → Map closeout → Design System → N-3b → ...
- 11 拘束条件を確定したことで、 後続 List Redesign Spec は **逸脱 risk なく着手可能**
- 「概念 → 拘束条件 → spec → impl」 のサイクルが完全に整った
- frozen branches 影響 0、 既存資産活用 100%

---

**完了**: Plan List / マップ Information Architecture Audit (= 北極星補正版、 11 拘束条件確定版)。 実装変更 0、 既存 file 改変 0、 frozen branches 追加 commit 0。 IA 完全確定。 CEO 判断待ち (= §13 の 9 項目)。
