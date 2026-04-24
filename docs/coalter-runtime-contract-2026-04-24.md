# CoAlter Runtime 契約 — signal 検出源 / 共有 UI 同期 / @coalter vs cooldown 優先順位

**作成日**: 2026-04-24
**ステータス**: **v0.1 FIXED**（CEO 固定確定 2026-04-24、3 点締め付け反映済）
**起草 branch**: `design/coalter-integration-contract-2026-04-24`（`design/coalter-step-a-baseline` から派生）
**前提契約**: `docs/coalter-integration-contract-2026-04-24.md` **v0.1 rev 1 FIXED**（4 契約点不可侵）
**不可侵化**: 以後の変更は rev 追記方式（原則既存本文削除禁止、ただし**正本間衝突発見時の整合修正は例外** — 統合契約 §0.5 準拠）

---

## 0. メタ情報

### 0.1 本書の位置づけ

本書は P0 統合契約 v0.1 rev 1 FIXED の**上に載る runtime 層の契約**である。統合契約が「4 つの不可侵な骨格」を固定したのに対し、本書はその骨格上で**3 つの runtime 論点**を固定する:

| # | 論点 | 統合契約のどこに依存するか |
|---|---|---|
| 3 | signal 検出源 map | ③ Stage 1 vs S4 分離（event bus 分離）の上に signal 経路を載せる |
| 4 | 共有 UI 同期 | ① 対話面二層 surface の同期モデルを固定 |
| 7 | `@coalter` 強制起動 vs cooldown 優先順位 | ② executor availability 遷移規則の上に起動優先順位を載せる |

### 0.2 本書が決めること / 決めないこと

**決める**:
- 上記 3 論点の runtime 挙動規則（優先順位・経路 map・同期モデル）
- 既存正本 doc（v1.1 / UI spec / master / speech template / 三段式 / 統合契約）との整合関係

**決めない**:
- 数値閾値（cooldown 期間秒数・介入価値閾値・signal 強度スコア）→ UI spec §9.3.x / v1.1 §8 の候補化プロセスに委譲
- 実装コード（`lib/coalter/**` / `app/api/coalter/**` touch ゼロ）
- 論点 2（Daily/Travel カード設計）/ 論点 6（S5/S6 UI 具現化）→ P2 で扱う
- 統合契約 4 契約点の不可侵条文（§1.6 / §2.6 / §3.6 / §4.5）の再解釈

### 0.3 前提 doc（正本参照、本書は複製しない）

| 領域 | 正本 | rev / 日付 |
|---|---|---|
| **統合契約 P0** | `docs/coalter-integration-contract-2026-04-24.md` | **v0.1 rev 1 FIXED**（2026-04-24） |
| 全体原則 | `docs/coalter-master-design.md` | v1.1（2026-04-15 CEO 承認） |
| Core UX 存在論 | `docs/coalter-core-ux-layered-presence.md` | v1.1（2026-04-24） |
| UI 解像度 | `docs/coalter-presence-state-ui-spec.md` | v0.1（2026-04-24） |
| 発話文面 | `docs/coalter-speech-template.md` | v0.1（2026-04-24） |
| 映画三段式 | `docs/coalter-movie-three-stage-design.md` | rev 3.2（2026-04-24） |

### 0.4 起草プロトコル（統合契約 §0.5 継承）

- CEO レビューで **v0.1 固定** と判定された後、本書も不可侵化（rev 追記方式）
- 正本間衝突発見時は **§0.5 例外条文**（統合契約と同様）で局所 rev 修正を許容
  - 衝突解消に必要な最小範囲のみ
  - 改訂履歴に（a）削除 / （b）置換 / （c）整合先 を明記
  - 本書の不可侵条文（§1.6 / §2.6 / §3.6）には触らない
  - 統合契約 4 契約点の不可侵条文には**本書 rev では絶対に触れない**（触る必要が生じた時は統合契約側の新契約起草）

### 0.5 本書が触らない境界線

| 項目 | 委譲先 |
|---|---|
| cooldown 期間の具体秒数 | UI spec §9.3.4 candidate A/B/C（CEO 承認 consulted） |
| 介入価値閾値の具体スコア | UI spec §1.3 / v1.1 §8.1 候補化 |
| signal 強度スコアの計算式 | 実装側（executor reducer 内部） |
| 共有メモリの DB スキーマ | 実装側（本書範囲外） |
| Stage 1 Understand の内部アルゴリズム | 三段式 §3（executor 側） |
| 発話文面のトーン | speech template |

---

## 1. 論点 3 — signal 検出源 map

### 1.1 signal の 5 分類（本書固定）

CoAlter の Presence を動かす入力 signal を**網羅的に 5 種に分類**する。既存正本（v1.1 §8 / master §5）に散在する言及を本書で統合。

| 分類 | 定義 | 典型例 | 源（どこから入る） |
|---|---|---|---|
| **明示（explicit）** | 2 人のいずれかが CoAlter に直接発話・mention した | 「プラン組んで」「1 日の組み方」「旅行行きたい」/ `@coalter` mention / CoAlter ボタン tap / chip tap | 対話面の自由テキスト入力欄・ボタン UI |
| **暗黙（implicit）** | 2 人の会話自体から検出される関係 signal | 温度差 / 膠着 / 片側沈黙 / 共同課題の浮上 | 2 人のメインチャット本文（executor 側の文脈解析） |
| **緊急（critical）** | 高摩擦 / 攻撃性 / 感情ヒートアップを伴う暗黙 signal | 罵倒 / 語気強化 / 連続否定 / 沈黙長期化 | 2 人のメインチャット本文（同上、閾値超えで分岐） |
| **モード昇格（mode-promotion）** | Daily / Travel モードへの明示昇格要求 | 「今日の予定組みたい」/「旅行計画立てたい」/ モード切替 tap | 対話面・モード切替 UI |
| **手動再起動（manual-restart）** | S8 cooldown 中の明示復帰要求 | `@coalter` 強制発火 / CoAlter ボタン tap | 対話面・ボタン UI |

**本分類は網羅的**（新種の signal を足す時は本書 rev で追記、実装が勝手に分類を増やさない）。

### 1.2 強度階層（master §5 整合）

signal の強度を master §5 の 3 段階に整合させる:

| 強度 | 意味 | 典型分類 |
|---|---|---|
| **strong** | 即座に Presence を動かすべき確度の高い signal | 明示 / モード昇格 / 手動再起動 / 緊急 |
| **soft** | 動いても良いが、介入価値閾値で要判定 | 暗黙（温度差・膠着・共同課題） |
| **none** | signal なし（S0 常駐維持） | 上記いずれも発火しない |

**閾値判定の責務**: strong は**無条件**で Presence を動かす。soft は UI spec §1.3 介入価値閾値で判定（本書は閾値数値を定めない）。

### 1.3 経路 map（統合契約 §3 event bus 分離の上に）

**本節が論点 3 の核**。signal 検出は **Presence reducer 側の責務**であり、`executor.understanding.*` bus（Stage 1 ドメイン理解統合）とは独立の event bus 経路を通る:

| signal 分類 | 入る bus | 発行経路 | Presence 遷移 |
|---|---|---|---|
| 明示（自由テキスト / mention） | `presence.state.*` | 対話面入力 → Presence reducer `onExplicitInput` | `active` 昇格 → S0 → S1（S1 短縮なし） |
| 明示（chip tap） | `presence.state.*` | chip UI → Presence reducer `onChipTap` | 現 state 維持（chip の意味に従う） |
| 暗黙（soft） | `presence.state.*` | executor watcher → Presence reducer `onImplicitSignal(softScore)` | 介入価値閾値通過で S0 → S1 |
| 緊急（critical） | `presence.state.*` | executor watcher → Presence reducer `onCriticalSignal` | S0 → **S2 直接**（S1 短縮、v1.1 §8.4 整合） |
| モード昇格（explicit） | `presence.state.*` + `availability.*` | 対話面 / モード tap → availability 遷移 → Presence reducer | `enabled` → `active` + S0 → S1 + mode = Daily/Travel |
| 手動再起動（S8 中） | `presence.state.*` | `@coalter` / ボタン → Presence reducer `onManualRestart` | S8 → S0 → S1（最短再起動ルール §3.5 で上書き可） |

**不可侵規則（統合契約 §3.6-2 継承、rev 1 で「adapter 経由のみ許可」を明記）**:
- signal の正本 bus は **`presence.state.*` 一択**。`executor.understanding.*` は**signal source にはならない**
- **「完全分離」= 直接乗り入れ禁止、adapter 経由のみ許可**:
  - executor 側の事実（Stage 1 Understand 完了 / confidence 推移 / ドメイン候補集約 等）を signal として扱いたい場合は、**専用 adapter / mapper を経由**して `presence.state.*` bus に変換投入する
  - adapter の責務: executor 事実 → presence signal 分類（§1.1 の 5 分類のいずれか）へのマッピング + 強度（§1.2）付与
  - **executor event がそのまま UI signal になることは禁止**（`executor.understanding.*` subscriber が直接 UI renderer や Presence reducer を叩いてはならない）
- Stage 1 Understand は signal 分類には**関与しない**（Stage 1 は decision 時のドメイン候補生成前処理であり、signal 検出の前段階）
- `presence.state.*` bus の購読者は上部レイヤー UI renderer のみ。executor は `presence.state.*` を購読してはならない（逆方向結合防止）

この「adapter 経由のみ許可」原則により、統合契約 §3 の Stage 1 vs S4 直交性と本契約 §1.3 の signal source map 責務分離の両方が崩れなくなる。

### 1.4 signal 検出タイミング

| 分類 | 検出タイミング |
|---|---|
| 明示（自由テキスト） | 入力送信イベント即時 |
| 明示（chip） | tap 即時 |
| 暗黙 | 2 人のメインチャット新規発話ごと（ただし連続発火は debounce。数値は実装側） |
| 緊急 | 暗黙と同タイミング + 閾値 gate |
| モード昇格 | 入力送信 or tap 即時 |
| 手動再起動 | tap or `@coalter` 送信即時 |

**debounce 原則**: 暗黙 / 緊急は 2 人の発話が短時間に連続した時、個別評価ではなく「直近 N 発話窓」での集約評価を行う（N・時間窓は実装側で確定、本書は原則のみ）。

### 1.5 S1 短縮・S1 省略の扱い

v1.1 §8.4（緊急介入で S1 を短縮して S2 直接）と v1.1 §8.1（S0→S1 は自動）を本書で整合:

| 経路 | Presence 遷移 | 根拠 |
|---|---|---|
| 通常経路 | S0 → S1 → S2 | v1.1 §8.1 |
| **緊急短縮** | S0 → **S2**（S1 スキップ） | v1.1 §8.4、signal 分類 = critical のみ |
| **明示直接** | S0 → S1 → S2（通常経路、短縮しない） | 明示でも S1 を経由（consent チェックを回さない例外は緊急のみ） |

**重要**: 明示 signal でも S1 は**スキップしない**（consent チェックを省略しない）。緊急のみが v1.1 §8.4 例外ルート。

### 1.6 既存 docs との整合

| 既存 doc | 該当箇所 | 本契約との関係 |
|---|---|---|
| v1.1 §8.1 | S0→S1 は自動（signal 検出） | 本契約 §1.3 で `presence.state.*` bus 経路として明示 |
| v1.1 §8.4 | 緊急介入で S1 短縮 | 本契約 §1.5 で critical 分類専用の例外経路として固定 |
| v1.1 §8.6 | 再起動条件 4 経路（新 signal / @coalter / ボタン / モード昇格） | 本契約 §1.1 の 5 分類に再起動分類を追加して統合 |
| v1.1 §132 | 明示的シグナル語彙例 | 本契約 §1.1 明示分類の具体例として継承 |
| master §5 | strong / soft / none 3 段階 | 本契約 §1.2 で強度階層として継承 |
| UI spec §1.3 | 介入価値閾値 | 本契約 §1.2 soft の閾値判定先として委譲 |
| 統合契約 §3 | Stage 1 vs S4 event bus 分離 | 本契約 §1.3 不可侵規則の根拠 |

### 1.7 不可侵条文（本論点 3）

1. signal は **5 分類（明示 / 暗黙 / 緊急 / モード昇格 / 手動再起動）**で網羅する。新種は本書 rev 追記のみで足す
2. signal 検出の正本 bus は `presence.state.*` **一択**。`executor.understanding.*` は signal source にならず、「完全分離 = 直接乗り入れ禁止、adapter 経由のみ許可」。executor event がそのまま UI signal になることを禁止する
3. S1 スキップは **critical 分類のみ**。明示でも S0→S1→S2 を経由する
4. strong signal は無条件で Presence を動かす。soft は UI spec §1.3 介入価値閾値で判定
5. `presence.state.*` bus の購読者は UI renderer のみ（executor からの逆方向結合禁止）

---

## 2. 論点 4 — 共有 UI 同期

### 2.1 状態の 2 分類（shared state vs local state）

本論点 4 の対象を**二分**する。**source of truth は shared state についてのみ server 正本**とし、local state は各 client が独自に持つ（server は関与しない）。

#### 2.1.1 shared state（ペア共有、server 正本）

2 人のクライアント間で同期すべき CoAlter 関連状態:

| shared state | 粒度 | 正本 doc |
|---|---|---|
| **executor availability** | ペア永続 | master §5 / 統合契約 §2.1 |
| **Presence 状態（S0-S8）** | 発話サイクル単位 | 統合契約 §2.2 |
| **Action Mode** | ターン単位（UI 表現は Presence 非依存） | phase2 凍結 |
| **発話本文カード**（対話面） | 発話単位 | v1.1 §3.1 / UI spec §4 |
| **chip tap 結果** | tap 単位 | UI spec §4 chip |
| **共有メモリ surface の可視状態** | 項目単位 | v1.1 §10 / UI spec §8 |
| **提案カード** | 提案単位 | UI spec §4.3.8 |
| **handoff 状態**（明示共有 tap の結果） | handoff 単位 | UI spec §2.7 / §4.3.8 |
| **mode**（通常 / Daily / Travel） | active セッション単位 | v1.1 §5 |

#### 2.1.2 local state（各 client ローカル、server 関与せず）

各クライアントが独自に保持する UI 状態:

- 入力中テキスト（送信前の draft）
- hover / focus
- 一時展開 UI（tooltip / ホバー展開カード等の途中状態）
- スクロール位置
- アニメーション中間フレーム

**重要**: local state は **server にも相手 client にも同期しない**。相手側と自分側で違って見えるのが正常な状態（入力中テキストを相手に見せない等）。

### 2.2 同期媒体（shared state の source of truth）

**shared state については pair-chat server を唯一の source of truth とする**（local state は server 関与外）。client は server を購読する非対称モデル。

| 方向 | 挙動 |
|---|---|
| **client → server** | ユーザー操作（自由テキスト送信 / chip tap / モード切替 tap 等）は server に送信、server で state 更新後に全 client へ broadcast |
| **server → client** | server の state 更新を**両 client に等しく broadcast**。client は受信して UI 再描画 |
| **client → client（直接）** | **禁止**（CoAlter の同期を P2P 経路に乗せない。master §5「個別チャネル非許可」整合） |

**server 単調時刻**: server が受信イベントに単調増加タイムスタンプを付与する（vector clock 不要、単一論理 server 前提）。同時到着時の順序は server 側 FIFO（先着優先）。

### 2.3 eventually consistent 前提

CoAlter は**最終整合性**で運用する（完全同時整合性を要求しない）:

- 片方 client が数百 ms 〜数秒遅れで state 更新を受信することを許容
- client は server ack までは optimistic update 可（ただし ack 失敗時は revert）
- 両 client で Presence state が一時的に乖離（例: 片方 S1 / 片方 S0）していても、server broadcast 到達時点で整合する

### 2.4 オフライン・再接続時の挙動

| 状態 | 挙動 |
|---|---|
| **client オフライン中** | 現在の Presence state を**フリーズ表示**（last known state）。新規 signal 検出も server 側で行われるため、オフライン client は signal 発生を観測できない |
| **client 再接続時** | server から state snapshot を fetch → 即座に再描画。オフライン中に発生したイベント stream の再生はしない（snapshot 同期のみ） |
| **server 未到達の送信**（オフライン中の送信） | client 側でキュー保持 → 再接続時に送信試行。server 到達後は通常の broadcast 経路 |
| **両 client オフライン** | Presence は動かない（signal 検出は server 側の executor watcher が担うが、client UI がなければ発火しない運用）。再接続時に snapshot 同期 |

**フリーズ表示の UI**: オフライン中であることを明示する UI は speech template / UI spec 側で扱う（本書は挙動規則のみ）。

### 2.5 矛盾時の調停規則

client optimistic update と server state が矛盾した場合:

1. **server が勝つ**（client は revert）
2. revert アニメは静かに fade（UI spec アニメ原則に従う、本書は数値を定めない）
3. ユーザー入力は消さない（入力欄の内容は revert 対象外）

**例外**: 共有メモリ surface 項目の編集 / 削除は、同時編集時 **last-write-wins**（server 受信順）。衝突解消 UI は設けない（両ユーザーには broadcast で結果が届く）。

### 2.6 片方先行容認（統合契約 §1.1.1 継承）の表現

統合契約 §1.1.1「片方入力中、もう片方が先行送信」の場合:

- 先行送信側の発話は**両 client に即 broadcast**
- 入力中側の client は入力欄内容を**保持**（消さない）
- Presence サイクルは先行送信で進む（両 client で同じ state を観測）

同時入力 FIFO（統合契約 §1.1.1-2）の server 実装: server 受信順で処理、後着は次サイクル扱い。

### 2.7 複数デバイス（同一ユーザー）

同一ユーザーが複数デバイスで同時ログインしている場合:

- **全デバイスで同じ state を観測**（server broadcast は user 単位ではなく pair 単位）
- デバイス間の入力競合は server FIFO で処理
- Presence state は pair 単位で一意、デバイスごとに異なる state を持たない

### 2.8 既存 docs との整合

| 既存 doc | 該当箇所 | 本契約との関係 |
|---|---|---|
| v1.1 §10 共有メモリ | メモリ抽象モデル | 本契約 §2.1 同期対象として列挙、具体同期挙動は本書で固定 |
| v1.1 §3.1-3.2 レイヤー構造 | 上部レイヤー配置 | 本契約 §2.1 発話本文カード同期対象として統合 |
| UI spec §8 共有メモリと介入 UI | surface 編集・削除導線 | 本契約 §2.5 矛盾時調停の委譲先（last-write-wins 例外） |
| UI spec §2.1-2.7 マウント・handoff | UI 発火条件 | 本契約 §2.2 broadcast 経路の UI 側正本 |
| master §5 個別チャネル非許可 | pair 共有原則 | 本契約 §2.2 client → client 直接禁止の根拠 |
| 統合契約 §1.1.1 | 片方先行容認 | 本契約 §2.6 で同期モデル上の表現を固定 |

### 2.9 不可侵条文（本論点 4）

1. **shared state についてのみ** pair-chat server を**唯一の source of truth** とする（§2.1.1 列挙の状態群）。client → client 直接同期を禁止
2. **local state**（入力中テキスト / hover / focus / 一時展開 UI / スクロール位置 / アニメ中間フレーム等、§2.1.2）は server・相手 client のいずれにも同期しない。client 独自に保持する
3. **eventually consistent** 前提（shared state のみ対象）。完全同時整合性を要求しない
4. client optimistic update と server state が shared state について矛盾した場合は **server が勝つ**
5. Presence state は **pair 単位で一意**（デバイスごと・ユーザーごとに異なる state を持たない）

---

## 3. 論点 7 — `@coalter` 強制起動 vs cooldown 優先順位

### 3.1 `@coalter` 発火の 5 種類（本書固定）

ユーザーが CoAlter を**能動的に呼ぶ**経路を網羅する:

| 発火種類 | 記法 | 発生場所 |
|---|---|---|
| **mention 型** | 自由テキストに `@coalter` prefix | 対話面入力欄 |
| **ボタン型** | CoAlter ボタン tap（`ChatClient.tsx:1898-1908` 付近 legacy / Stage 4 で上部レイヤー導線） | メインチャット下部 / 上部レイヤー |
| **chip 応答型** | Presence 提示 chip の tap | 上部レイヤー chip UI |
| **自由テキスト返信型** | `@coalter` prefix なしで対話面入力欄に送信 | 対話面入力欄 |
| **モード切替型** | Daily / Travel モード切替 tap | 対話面モード切替 UI |

**注記**: 「`@coalter` 強制起動」という用語は本書では **(a) mention 型・(b) ボタン型・(e) モード切替型**を指す（`active` 化を明示的にユーザーが要求する経路）。chip 応答型・自由テキスト返信型は「既に進行中の対話への応答」であり、強制起動ではない。

### 3.2 cooldown の 5 種類（本書固定）

CoAlter の介入を**一時的に抑制する**状態を網羅する:

| cooldown 種類 | 発火契機 | 影響範囲 | 正本 |
|---|---|---|---|
| **通常 S8 cooldown** | Presence サイクル完了（S7 → S8） | 次サイクル開始まで（最短 5 分、v1.1 §8.6） | v1.1 §8.5-8.6 |
| **rupture cooldown** | rupture signal 検出（関係の強い断絶） | 期間中は S1 昇格禁止、S0 常駐のみ | HDM P3 `recentRuptureFlags` |
| **dignity cooldown** | dignity 違反検出（尊厳に触れる状況） | 期間中は一切発話しない（静寂維持） | HDM P4 Safety Layer |
| **mode 拒否 cooldown** | ユーザーがモード昇格を拒否 | 当該モード（Daily or Travel）の再提案禁止 | UI spec §1144-1175 |
| **提案拒否 cooldown** | ユーザーが提案を拒否 / 後退要求 | 同テーマの再提案禁止 | UI spec §1144-1175 |

**5 種類は独立**（UI spec §1153 整合）。複数同時発動可（例: 通常 S8 cooldown + mode 拒否 cooldown）。

### 3.3 優先順位 framework（本節が論点 7 の核）

`@coalter` 発火と cooldown が**衝突した時の判定順序**を以下で固定する。上位ほど強く、上位で棄却された発火は下位の判定に進まない:

| 順位 | 判定 | 棄却時の挙動 |
|---|---|---|
| **1（最上位）** | executor availability が `disabled` / `inactive` / `pending_consent` か | **UI 要素そのものが非表示**（`@coalter` 入力欄・ボタン自体が出ない）。発火不能。統合契約 §2.2 整合 |
| **2** | dignity cooldown 中か | **介入を棄却、ただし短い抑制応答は返す**（§3.3.1）。判断・提案・S1 以降への昇格は行わない |
| **3** | rupture cooldown 中か | **S1 昇格を棄却**（発火自体は受け付ける）。S0 常駐を維持し、**短い抑制応答**のみ（§3.3.1）。判断・提案には進まない |
| **4** | mode 拒否 cooldown 中か（モード切替型発火のみ） | **当該モード切替を棄却**。他種の発火は通常通り処理 |
| **5** | 提案拒否 cooldown 中か（同テーマの場合のみ） | **当該テーマの提案パスを棄却**。他テーマの発火・他経路（雑談・メモリ）は通常通り処理 |
| **6（最下位）** | 通常 S8 cooldown 中か（最短 5 分以内の再発火か） | **`@coalter` 強制起動（mention / ボタン / モード切替型）で上書き可**。即座に S0 → S1 経路を起動。ただし chip 応答型・自由テキスト返信型は上書きしない（S8 retreat 期間中の誤操作扱い） |

**重要な解釈**:

- **rupture・dignity は超越 cooldown**。`@coalter` 強制でも**介入は上書きしない**。関係の断絶や尊厳の危機に対して、ユーザーの明示要求があっても CoAlter は判断・提案に進まない（CoAlter は「呼ばれたら必ず出る」存在ではない）。ただし**無反応にはしない**（§3.3.1）
- **通常 S8 cooldown は `@coalter` 強制で上書き可**。5 分最短再起動ルール（v1.1 §581）は `@coalter` 強制で 0 に短縮される。これは v1.1 §8.6 の「手動再起動」経路と整合
- **mode 拒否 / 提案拒否は範囲限定**。当該モード・当該テーマのみ棄却、他経路は通る

### 3.3.1 超越 cooldown 中の抑制応答（rev 1 で追加）

dignity / rupture cooldown 中に `@coalter` 発火が届いた時、CoAlter は**完全無反応にしない**。以下で固定する:

- **原則**: 「発火拒否」ではなく「**介入拒否 + 応答は返す**」
- **応答形式**: 短い抑制応答（1 文、最小限）。例: 「今は少し間を置く設定です」「今は見守るね」等（具体文面は speech template 側で規定）
- **応答後の挙動**: 再介入はしない。S0 常駐を維持（rupture）または静穏維持（dignity）
- **応答を返す条件**: `@coalter` 強制起動（mention / ボタン / モード切替）に対してのみ。chip 応答・自由テキスト返信には反応しない（これらはそもそも通常対話フローであり、超越 cooldown 中は到達しない）

この抑制応答により、以下の 3 つが同時に成立する:

1. ユーザーには **CoAlter が壊れたように見えない**（応答は返る）
2. dignity / rupture の**上位性は守られる**（介入・判断・提案には進まない）
3. 「呼ばれても出ない」の雑さを回避（沈黙ではなく、意図を持った抑制として応える）

### 3.4 availability `disabled` 下の `@coalter` 挙動

統合契約 §2.2 より、`disabled` / `inactive` / `pending_consent` では**上部レイヤーが非表示**。よって:

- `@coalter` 入力欄は非表示（`@coalter` mention を打つ場がない）
- CoAlter ボタンは非表示（tap の対象がない）
- モード切替 UI も非表示

**例外**: `pending_consent` 状態では**同意フロー UI** が別途表示される（master §5）。これは `@coalter` 発火経路ではない（CoAlter 本体を呼ぶのではなく、起動同意を求める UI）。

**再有効化経路**（統合契約 §2.1 rev 1 整合）:
- `disabled` から `@coalter` 強制で直接 `enabled` には戻らない
- `disabled → pending_consent → enabled`（相手の再同意必須）
- `@coalter` 相当の UI は `enabled` 以降でのみ表示される

### 3.5 5 分最短再起動ルールとの関係

v1.1 §581「最短再起動間隔: 5 分（既存 `recentProposalWithin5Min` と整合）」:

- 本書 §3.3 順位 6 に統合。通常 S8 cooldown の実体として扱う
- `@coalter` 強制起動（mention / ボタン / モード切替）で上書き可 = 5 分ルールは強制起動時 0 に短縮
- 暗黙 signal（soft / critical）による S0 → S1 自動昇格は 5 分ルール**維持**（本書では上書き対象外）

| 再発火契機 | 5 分ルール適用 |
|---|---|
| `@coalter` mention | 上書き（0 に短縮） |
| CoAlter ボタン tap | 上書き（0 に短縮） |
| モード切替 tap | 上書き（0 に短縮） |
| 暗黙 soft signal | 維持（5 分経過まで再発火しない） |
| 緊急 critical signal | **上書き可**（緊急介入は 5 分ルール超越。v1.1 §8.4 整合） |
| chip 応答 | 通常 S8 に入っていない（サイクル継続中）なので 5 分ルール非適用 |
| 自由テキスト返信 | 通常 S8 に入っていない（同上） |

**critical signal の 5 分ルール超越**: v1.1 §8.4 緊急介入は 5 分ルールを超越する（「強いすれ違い / 攻撃性 / 感情のヒートアップ」は待てない）。

### 3.6 既存 docs との整合

| 既存 doc | 該当箇所 | 本契約との関係 |
|---|---|---|
| v1.1 §578 | `@coalter` / ボタン押下での手動再起動 | 本契約 §3.1 ボタン型・mention 型として細分化 |
| v1.1 §581 | 最短再起動間隔 5 分 | 本契約 §3.5 で強制起動時 0 短縮ルールを固定 |
| v1.1 §8.4 | 緊急介入 S1 短縮 | 本契約 §3.5 critical の 5 分ルール超越根拠 |
| v1.1 §8.6 | 再起動条件 4 経路 | 本契約 §3.1 の 5 種類発火に統合 |
| UI spec §1139 | cooldown 中も明示トリガー応答可 | 本契約 §3.3 順位 6 で「通常 S8 cooldown は `@coalter` 強制で上書き」として固定。ただし dignity / rupture は超越として別扱い |
| UI spec §1144-1175 | 拒否 3 分類 独立 cooldown | 本契約 §3.2 で 5 種類 cooldown に拡張（rupture / dignity を追加） |
| UI spec §1175 | cooldown カウントダウン禁止 | 本契約対象外（UI 表現ルール、本書は挙動規則のみ） |
| master §378 | pending_consent は強制しない | 本契約 §3.4 `disabled` 下 UI 非表示の根拠 |
| 統合契約 §2.2 | availability が Presence の可動域を制約 | 本契約 §3.3 順位 1 の根拠 |

### 3.7 不可侵条文（本論点 7）

1. `@coalter` 発火は **5 種類**（mention / ボタン / chip / 自由テキスト / モード切替）で網羅
2. cooldown は **5 種類**（通常 S8 / rupture / dignity / mode 拒否 / 提案拒否）で網羅
3. **優先順位 6 段階**（availability → dignity → rupture → mode 拒否 → 提案拒否 → 通常 S8）を逆転させない
4. **dignity / rupture は超越 cooldown**（`@coalter` 強制でも**介入は上書き不可**）。ただし**完全無反応にはしない**。超越 cooldown 中に `@coalter` 強制起動が届いた場合は **短い抑制応答**（§3.3.1）を返す（「介入拒否 + 応答は返す」原則）
5. 通常 S8 cooldown は `@coalter` **強制起動（mention / ボタン / モード切替）で上書き可**。chip 応答・自由テキスト返信では上書きしない
6. availability `disabled` 下では `@coalter` 発火 UI 自体が**非表示**（発火不能）

---

## 4. 残る論点（本契約外 — P2 で扱う）

本書は P1 runtime 契約として 3 論点を固定する。以下は P2 で扱う:

| 論点 | 扱う場所 | 本契約との依存 |
|---|---|---|
| 2. Daily/Travel カード設計 | 新設計 doc 起草 | 統合契約 ① 出力面 handoff + 本契約 §2 同期モデル |
| 6. mock 画像と S5/S6 UI 具現化 | UI spec §5 拡張 | 統合契約 ① 対話面 + 本契約 §2 同期モデル |

**P1 範囲外だが関連する項目**:

| 項目 | 扱う場所 |
|---|---|
| cooldown 期間の具体秒数（S8 / rupture / dignity / mode 拒否 / 提案拒否） | UI spec §9.3.4 candidate（CEO 承認） |
| 介入価値閾値の具体スコア | UI spec §1.3 / v1.1 §8.1 |
| signal 検出器の内部アルゴリズム・閾値 | 実装側（executor reducer） |
| 共有メモリ項目の編集 / 削除導線 | UI spec §8 |
| オフライン時 UI 明示の文面 | speech template / UI spec |

---

## 5. 改訂履歴

| 日付 | 版 | 変更内容 | 承認 |
|---|---|---|---|
| 2026-04-24 | v0.1 DRAFT | 初稿起草。統合契約 v0.1 rev 1 FIXED の上に、論点 3（signal 検出源 map）/ 論点 4（共有 UI 同期）/ 論点 7（`@coalter` 強制 vs cooldown 優先順位）の 3 つを runtime 契約として固定候補化。既存正本（v1.1 / UI spec / master / 統合契約）との整合表付き | CEO レビュー待ち |
| 2026-04-24 | v0.1（固定前締め付け） | CEO v0.1 レビュー後の 3 点締め付け反映: (a) 論点 3-② §1.3 に **「完全分離 = 直接乗り入れ禁止、adapter 経由のみ許可」** を明記（executor 事実を signal に変換する場合は adapter/mapper 経由のみ）、§1.7-2 も強化、(b) 論点 4-④ §2.1 を **shared state / local state の 2 分類**に再構成（§2.1.1 shared / §2.1.2 local）、§2.2 冒頭に **「shared state についてのみ唯一の source of truth」** を明記、§2.9 不可侵条文も対応修正、(c) 論点 7-⑧ **§3.3.1 超越 cooldown 中の抑制応答** を新設（dignity / rupture cooldown 中も `@coalter` 強制には短い抑制応答を返す = 「介入拒否 + 応答は返す」原則）、§3.3 表・重要な解釈・§3.7-4 不可侵条文を整合修正。版は v0.1 のまま（固定前修正のため昇格しない） | CEO 固定確定（2026-04-24） |
| 2026-04-24 | v0.1 FIXED | CEO 固定確定判定。§0 ヘッダのステータスを「v0.1 FIXED」に更新、不可侵化を明記。以後の変更は rev 追記方式のみ（正本間衝突時は統合契約 §0.5 準拠で局所 rev 修正許容） | **FIXED** |

---

## 6. CEO レビュー時の確認点

CEO が本書を v0.1 固定判定する際、以下を確認してほしい:

1. **論点 3 — signal 5 分類（§1.1）**: 明示 / 暗黙 / 緊急 / モード昇格 / 手動再起動 の 5 種類で網羅できているか。足りない分類はないか
2. **論点 3 — event bus 経路（§1.3）**: signal 検出を `presence.state.*` bus に一元化し、`executor.understanding.*` bus から完全分離する方針で良いか（統合契約 §3.6-2 の強化）
3. **論点 3 — S1 スキップは critical のみ（§1.5）**: 明示 signal でも S1 は経由する（consent チェック省略は緊急のみ）で良いか
4. **論点 4 — source of truth は server（§2.2）**: client → client 直接同期を禁止し、pair-chat server を唯一の source of truth とする方針で良いか
5. **論点 4 — eventually consistent（§2.3）**: 完全同時整合性を要求せず、数百 ms 〜数秒の乖離を許容する運用で良いか
6. **論点 4 — 複数デバイス挙動（§2.7）**: 同一ユーザーの multi-device は全てで同一 state を観測（デバイス単位の独立 state を持たない）で良いか
7. **論点 7 — 優先順位 6 段階（§3.3）**: availability → dignity → rupture → mode 拒否 → 提案拒否 → 通常 S8 の順序で良いか
8. **論点 7 — dignity / rupture 超越（§3.3 重要な解釈）**: `@coalter` 強制でも dignity / rupture は上書きしない（CoAlter は「呼ばれたら必ず出る」存在ではない）で良いか
9. **論点 7 — 強制起動の範囲（§3.1 注記 + §3.5）**: mention / ボタン / モード切替のみを「強制起動」とし、chip 応答・自由テキスト返信は対象外とする定義で良いか
10. **論点 7 — critical の 5 分ルール超越（§3.5）**: 緊急 signal は 5 分ルールを超越する（v1.1 §8.4 整合）で良いか

---

**🎯 結論（v0.1 DRAFT）**: 本書は統合契約 v0.1 rev 1 FIXED の上に載る P1 runtime 契約。論点 3 / 4 / 7 の 3 つを固定候補として草案。既存正本 docs の本文は一切書き換えず、整合関係を明示表で示す。数値閾値（cooldown 秒数・介入価値スコア）は UI spec / 実装側に委譲し、本書は**優先順位と経路規則のみ**を固定する。本契約固定後、P2（Daily/Travel カード・S5/S6 UI 具現化）に進める地盤ができる。
