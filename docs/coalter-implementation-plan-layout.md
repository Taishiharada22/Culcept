# CoAlter 実装手順書 — レイアウト系統（Core UX / 上部レイヤー / Presence UI / Pattern）

**作成日**: 2026-04-24
**ステータス**: v0.1 DRAFT（新セッション即時着手版 / CEO 承認待ち）
**起草 branch**: `feat/coalter-three-stage`（実装進入時は別 feat branch 推奨、§9 参照）
**正本依存**:
- `docs/coalter-core-ux-layered-presence.md` v1.1（Core UX 存在論、不可侵 §15.2）
- `docs/coalter-presence-state-ui-spec.md` v0.1（UI 解像度 / 状態×モード matrix / Pattern→State 許可 matrix、不可侵）
- `docs/coalter-speech-template.md` v0.1（文面 / 禁止表現、不可侵）
- `docs/coalter-integration-contract-2026-04-24.md` v0.1 rev 1 FIXED（P0 骨格契約、不可侵）
- `docs/coalter-runtime-contract-2026-04-24.md` v0.1 FIXED（P1 runtime 契約、不可侵）
- `docs/coalter-master-design.md` v1.1（全体原則、§5 起動状態機械、不可侵）

---

## 0. メタ情報

### 0.1 本書の位置づけ

本書は CoAlter **レイアウト系統の実装手順書**である。本流修正系統（Bug-1 / Bug-2 / 三段式）は `docs/coalter-implementation-plan-mainstream.md` に委譲する。

**本書が扱う範囲**:
- Core UX v1.1 Stage 0.5 / 1 / 2 / 3 / 4 の実装順序（§12.1）
- 上部レイヤー UI（対話面 = 画面上部 CoAlter レイヤー）の静的試作 → executor 骨格 → E2E → 本実装
- **3 Presence Mode（通常 / Daily / Travel）の UI レイアウト・モード切替 logic・昇格降格フロー・拒否 3 分類**（Core UX v1.1 §2 / UI spec §6）
- S0-S8 Presence 状態機械（reducer / state machine）
- Pattern variant（A / B / C / D / E / F-1 / F-2）の文面合成・許可 matrix
- **共有メモリ surface（由来 × 確定度 × 可視性 3 軸、可視性操作 UI、後退導線）**（UI spec §8.2-§8.4）
- **緊急介入視覚層（critical signal → urgent layer / 解除条件 / 非判定性継承）**（UI spec §8.5-§8.6）
- **連投抑制 構造的担保**（UI spec §1.6 / Core UX §11.4）
- **UI 基礎要素**: UI 密度の段階（§1.4）/ アニメカテゴリ（§1.5）/ z-index（§2.3）/ focus 競合（§2.4）/ scroll 連動（§2.5）/ 入力欄との競合境界（§2.6）/ action 実行後の handoff 境界（§2.7）
- **共有メモリ項目の視覚記号型・ラベル階層・有効組み合わせ制約**（UI spec §8.3）
- **speechBuilder LLM 合成 hook**（speech template §3-§9 静的テンプレ → 動的合成、Stage 4 段階）
- executor availability（`inactive` / `pending_consent` / `enabled` / `active` / `disabled`）との直交
- legacy CoAlterCard の明示 handoff 経由への置換
- **telemetry / 観測計測**（Presence 遷移率 / Pattern 使用分布 / 同意率 / mode 昇格降格率 / 拒否分類別件数 / 緊急介入発火率 / 連投抑制発火率 / legacy fallback 率）
- **a11y / loading / error / empty state**（各 S × mode における 4 補助状態）

**本書が扱わない範囲**:
- Bug-1 / Bug-2 / 三段式本流（→ mainstream plan）
- Action Mode（decision / negotiate / clarify） — Phase 2 凍結、触らない
- LLM 発話生成の prompt engineering の詳細（speech template に準拠、本書で新規設計しない）

### 0.2 本書が決めること / 決めないこと

**決める**:
- Stage 0.5 → 1 → 2 → 3 → 4 の**実装順序と依存関係**
- 各 Stage の**Phase 分解 / 変更ファイル / 型定義 / テストケース / CEO 承認ポイント**
- 各 Stage の**gate 充足条件とロールバック手順**
- kill switch（presence/upperLayer/pattern 関連）の地図
- legacy CoAlterCard の退役経路

**決めない**:
- UI の visual spec（色 / 形 / アニメ時間 / iconography） — UI spec / v1.1 §9 / v1.1 §1.5 に準拠、本書で新規数値を定めない
- 文面のトーン詳細 — speech template に準拠
- shared state の同期実装（WebSocket / polling / Supabase Realtime のどれか）— Stage 2 で CEO 判断（§5.5）
- Action Mode のコード touch（Phase 2 凍結契約で全面禁止）

### 0.3 State Safety Rule（絶対遵守）

本実装に着手する新セッションは以下を**機械的に厳守**する（mainstream plan と同一、再掲）:

1. `git stash` / `git reset --hard` / `git checkout --` / `git clean -f` / `git restore .` は一切使わない
2. 30 分以上の作業 or 3 ファイル以上の変更で必ず commit（WIP でも可）
3. `git add -A` / `git add .` 禁止。必ず `git add <file1> <file2>` でファイル個別指定
4. tsc / build 確認のために stash を使わない。そのまま実行 or WIP commit 後に実行
5. セッション終了時、未 commit 変更があれば WIP commit を作って終える

### 0.4 不可触対象（Core UX v1.1 §15.2 + 統合契約 §5 整合）

以下は本書の実装中**1 bit も touch しない**:

| 対象 | 正本 | 不可侵理由 |
|---|---|---|
| Core UX v1.1 §1（CoAlter 共有 Alter 再定義） | `coalter-core-ux-layered-presence.md` §15.2 | 存在論固定 |
| Core UX v1.1 §2.3-2.4（通常モード本体 / 3 軸直交） | 同上 | Presence Mode 核 |
| Core UX v1.1 §3.1-3.3（上部レイヤー定義） | 同上 | レイヤー構造 |
| Core UX v1.1 §8.1（S0-S8 は Presence/UI 状態、reducer / executor と別） | 同上 | 直交原則 |
| Core UX v1.1 §11（絶対禁止 5 項目） | 同上 | 禁忌 |
| Phase 2 凍結 6 項目 | handoff §4.1 | 不可侵 |
| Action Mode（decision/negotiate/clarify）遷移ロジック | `coalter-phase2-3mode-design.md`（凍結） | Presence と直交、Phase 2 で固定済 |
| legacy CoAlterCard 自動挿入（Stage 4 前まで） | 統合契約 §1.4 | 移行期は維持 |
| 統合契約 4 契約点不可侵条文 | integration §1.6 / §2.6 / §3.6 / §4.5 | rev 追記禁止 |
| Runtime 契約 3 論点不可侵条文 | runtime §1.7 / §2.9 / §3.7 | rev 追記禁止 |

---

## 1. 全体ロードマップ

### 1.1 5 Stage の依存関係

```
┌─────────────────────────────────────────────────────────────────┐
│ Stage 0.5 — 下位 doc 整理（本書以外の doc はほぼ着地済）            │
│  既存: core UX v1.1 / UI spec v0.1 / speech template v0.1        │
│        integration v0.1 rev 1 FIXED / runtime v0.1 FIXED          │
│  残作業: integration §6 追記計画の 11 行追記（着手承認済、最小差分）│
│        + Stage 4 legacy 退役計画 doc 起草（§7.3 参照）             │
│  判定: CEO が本書を固定 + §3 追記タスク完了 で Stage 1 着手可      │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 1 — preview 静的試作                                        │
│  配置: app/(dev)/coalter-preview/upper-layer/** 限定               │
│  内容: 上部レイヤー ASCII の React 静的再現 / S0-S8 切替だけのモック│
│       Pattern 合成のプレビューカード                              │
│       Daily / Travel mode 画面 / モード切替 / 昇格降格 UI フロー    │
│       共有メモリ surface / 緊急介入視覚層 / UI 基礎要素全項目       │
│  CEO 承認: 着手時の短確認 + preview 完成時の visual レビュー       │
│  境界: ChatClient / lib/coalter に 1 bit も影響しない              │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 2 — 通常 + Daily + Travel executor 骨格                      │
│  配置: lib/coalter/presence/** 新規（既存 coalterDispatch 非接触） │
│  内容: S0-S8 reducer / signal adapter / Pattern variant type /    │
│       Pattern→State 許可 matrix / executor availability 直交      │
│       modeReducer (3 mode 昇格・降格 logic) / 共有メモリ store     │
│       拒否 3 分類 reducer / 緊急介入 trigger / 連投抑制構造的担保   │
│       speechBuilder LLM 合成 hook (interface のみ、実装は Stage 4) │
│  CEO 承認: 骨格 landing 後に観測フェーズ合意                       │
│  境界: Action Mode / CoAlterCard / 既存 coalterDispatch 非接触    │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 3 — preview E2E                                             │
│  配置: app/(dev)/coalter-preview/full/** + Stage 2 executor 結合  │
│  内容: 通常モード 1 サイクル S0→S1→S2→...→S8 の preview 内完結動作│
│       Daily / Travel mode 1 サイクル E2E / モード昇格降格 E2E      │
│       共有メモリ surface E2E / 緊急介入視覚層 E2E / 拒否 3 分類 E2E│
│       2 人 mock 会話 / Pattern A-F2 発話 / chip 応答              │
│  CEO 承認: 観測フェーズ終了時                                      │
│  境界: ChatClient への介入は引き続きゼロ                           │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 4 — ChatClient 本実装（CEO 承認必須）                        │
│  配置: app/components/chat/ChatClient.tsx + 上部レイヤー統合       │
│  内容: 上部レイヤー本番マウント / executor availability UI         │
│       legacy CoAlterCard 自動挿入 → 明示 handoff へ置換            │
│       同意フロー UI / 再有効化経路 / shared state 同期実装         │
│       モード切替 UI 本番マウント / 共有メモリ surface 本番マウント  │
│       緊急介入視覚層 本番マウント / speechBuilder LLM 合成本番化    │
│       telemetry 計測 / a11y / loading / error / empty state       │
│  CEO 承認: 別承認（core UX v1.1 §6.4 ⚠️ + 統合契約 §1.4）          │
│  境界: mainstream plan の Step E 完了と**整合**させて flip         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 依存の論理的根拠

**Stage 0.5 → 1 順序**:
- 統合契約 §6 の 11 行追記が入っていないと、Stage 1 の preview が「6 families vs 7 variants」の wording 不整合に直面する（integration ④ 裁定が本文に反映されていない）
- legacy 退役計画 doc が無いと Stage 4 で慌てて作ることになり、Stage 1/2/3 の設計が legacy との共存形式に依存してしまう

**Stage 1 → 2 順序**:
- Stage 1 で UI の ASCII 構造 / Pattern variant の見た目 / S0-S8 の UI 差を先に固めないと、Stage 2 executor 骨格が「何を出力するか」の contract を持てない
- 静的試作で UI spec §5 各 S ASCII + §7 Pattern→State matrix が実装可能であることを視覚確認する（data 無しで）

**Stage 2 → 3 順序**:
- reducer / signal adapter が動かないと E2E は成立しない
- Pattern variant type / 許可 matrix / availability 直交は Stage 2 で実装し、Stage 3 は結合確認

**Stage 3 → 4 順序**:
- preview E2E で発話サイクル S0→S8 が完結することを視覚確認してから ChatClient に入れる
- 本実装時に preview で気付いた不整合が流入しないよう、preview 合格を gate にする

**mainstream との関係**:
- Stage 2 で `lib/coalter/presence/**` を新設する際、mainstream D-1 の `lib/coalter/understanding/**` と名前空間を**分ける**（understanding は executor 側、presence は UI 側、統合契約 §3 event bus 分離準拠）
- Stage 4 の本番 flip は mainstream E-3（三段式本番 flip）と**同時か後**に行う。先に flip すると上部レイヤーが動いていない状態で三段式が本稼働し、canonical surface 契約 ① が崩れる可能性

### 1.3 Commit 粒度の原則

| 粒度 | 運用 |
|---|---|
| **1 Phase = 1 commit**（各 Stage 内部 Phase） | Phase 境界でロールバック可能 |
| **WIP commit を活用** | 30 分/3 ファイル境界で WIP。Phase 完了後に rebase / squash せず WIP をそのまま残してよい |
| **新ファイル追加と既存ファイル修正は同一 commit に含めてよい** | commit msg で「新設」「既存修正」「削除」を分けて書く |
| **テストは同一 commit に含める** | 「実装 + テスト」で 1 Phase 完結 |
| **Stage 4 は CEO 承認ごとに micro-phase commit** | ChatClient touch は rollback 可能性を最大化する |

---

## 2. 前提契約の厳守（全 Stage 共通）

### 2.1 統合契約 4 契約点（integration v0.1 rev 1 FIXED）

全 Stage で以下を逸脱しない:

| 契約点 | 核 | 本書での影響 |
|---|---|---|
| **① canonical surface は対話面 + 明示 handoff の二層** | 自動メインチャット介入禁止、handoff はユーザー明示 tap のみ | Stage 4 で legacy CoAlterCard 自動挿入を明示 handoff に置換する実装が必要 |
| **② availability × Presence × Action Mode の 3 レイヤー直交** | 1 enum に統合しない、1:1 mapping しない | Stage 2 reducer で availability / Presence / Action を別 store に持つ |
| **③ Stage 1 Understand と S4 理解更新中は別物** | event bus 分離（`executor.understanding.*` vs `presence.state.*`） | Stage 2 reducer は `presence.state.*` bus のみ購読、executor event は adapter 経由のみ |
| **④ family 6 / variant 7 の二層命名** | variant を正本、family は derive | Stage 2 で `PatternVariant` type を基軸、UI 表示は external `F-1`/`F-2`（内部は `F1`/`F2`） |

### 2.2 Runtime 契約 3 論点（runtime v0.1 FIXED）

全 Stage で以下を逸脱しない:

| 論点 | 核 | 本書での影響 |
|---|---|---|
| **論点 3 — signal 5 分類 / event bus 分離** | signal 正本 bus は `presence.state.*` 一択、adapter 経由のみ許可 | Stage 2 signalAdapter.ts で executor 事実 → presence signal 変換、executor event の直接購読禁止 |
| **論点 4 — shared state vs local state / server 正本** | shared state のみ server 正本、eventually consistent | Stage 2 / 3 で shared state 識別 + optimistic update + server 勝ちの調停 |
| **論点 7 — @coalter 強制 vs cooldown 優先順位 6 段階** | availability → dignity → rupture → mode 拒否 → 提案拒否 → 通常 S8。rupture/dignity は超越 cooldown（抑制応答は返す） | Stage 2 cooldownResolver.ts で 6 段階優先順位判定 |

### 2.3 Core UX v1.1 §15.2 不可侵項

全 Stage で**修正禁止**:

- §1（CoAlter 共有 Alter 再定義）
- §2.3（通常モード本体性）
- §2.4（3 軸直交）
- §3.1-3.3（上部レイヤー構造と役割）
- §8.1（Presence 状態と reducer/executor の別レイヤー性）
- §11（絶対禁止 5 項目）

### 2.4 §11 絶対禁止 5 項目（実装時の禁忌）

Stage 1-4 の UI / executor が**絶対にやってはいけない**（Core UX v1.1 §11）:

1. 裁判官にならない（関係の優劣判定を UI に出さない）
2. メインチャットの主役を奪わない（上部レイヤーで完結、メインチャットに自動介入しない）
3. いきなり提案で逃がさない（Pattern A/B/C を経ずに F へ直行しない、UI spec §7.12 matrix で gate）
4. 連投しない（Core UX v1.1 §1.6 連投抑制 + UI spec §1.6 構造的担保）
5. 何でも Daily/Travel にしない（通常モードを本体として維持、モード昇格は明示 signal のみ）

---

## 3. Stage 0.5 — 下位 doc 整理と整合追記

**目的**: Stage 1 着手前に、既存 doc 群の相互整合を完全にする。

### 3.1 既存状態（Stage 0.5 は大部分が着地済）

| doc | 状態 | 本 Stage での扱い |
|---|---|---|
| `coalter-core-ux-layered-presence.md` v1.1 | 着地（+ statutory refs 追記済 / commit `a98114c4`） | 不可侵、参照のみ |
| `coalter-presence-state-ui-spec.md` v0.1 | 着地（+ statutory refs 追記済 / commit `a98114c4`） | 不可侵、参照のみ |
| `coalter-speech-template.md` v0.1 | 着地（+ statutory refs 追記済 / commit `a98114c4`） | 不可侵、参照のみ |
| `coalter-integration-contract-2026-04-24.md` v0.1 rev 1 FIXED | 着地（design/coalter-integration-contract-2026-04-24 ブランチで起草、`feat/coalter-three-stage` に merge 済 / HEAD = 7d481e45） | 不可侵、参照のみ |
| `coalter-runtime-contract-2026-04-24.md` v0.1 FIXED | 着地（同上） | 不可侵、参照のみ |
| `coalter-master-design.md` v1.1 | 着地（+ statutory refs 追記済 / commit `a98114c4`） | 不可侵、参照のみ |
| `coalter-movie-three-stage-design.md` rev 3.2 | 着地（+ statutory refs 追記済 / commit `a98114c4`） | 不可侵、参照のみ |
| `coalter-handoff-2026-04-22.md` rev 6 | 着地（+ statutory refs 追記済 / commit `a98114c4`） | 不可侵、参照のみ |

### 3.2 Phase L0-a — 統合契約 §6 最小参照追記【**着地済**】

**正本**: integration contract §6「影響範囲 — 承認後の最小参照追記計画」（CEO 承認済「P1 着手前までに必ず入れる（今すぐ可）」）

**状態**: **着地済**。`design/coalter-integration-contract-2026-04-24` branch の commit `a98114c4` で実施。10 箇所 / 22 行追加（blockquote `> 参照` 形式、既存本文一切編集せず）。`feat/coalter-three-stage` に merge 済（merge commit `7d481e45`）。

**着地済みの追記内訳（参考、新セッションは追加作業不要）**:

| # | 対象 doc | 箇所数 | 行数 | 契約点 |
|---|---|---|---|---|
| 1 | `coalter-core-ux-layered-presence.md` | 4（§4 章題直後 / §4.6 F 節頭 / §8.1 末尾 / §13.3 4 軸拡張） | 9 | ② ③ ④ |
| 2 | `coalter-presence-state-ui-spec.md` | 2（§0.4 末尾 / §4.3.5 S4） | 4 | ③ ④ |
| 3 | `coalter-speech-template.md` | 1（§0.6 上流差分注記末尾） | 2 | ④ |
| 4 | `coalter-movie-three-stage-design.md` | 1（§2.1 Pipeline 図直後） | 2 | ③ |
| 5 | `coalter-master-design.md` | 1（§5 起動状態機械の状態ルール直後） | 2 | ② |
| 6 | `coalter-handoff-2026-04-22.md` | 1（§3 正本 doc 一覧、UI spec / speech template / 統合契約 3 行追加） | 3 | 全体 |
| **合計** | 6 doc | **10 箇所** | **22 行** | |

**新セッションでの作業**: **なし**（本 Phase はスキップ）。commit `a98114c4` の内容を git log で確認するのみで可。差分を再確認したい場合は `git show a98114c4`。

### 3.3 Phase L0-b legacy 退役計画 doc 起草（1 commit、**未着手**）

**目的**: Stage 4 で legacy CoAlterCard 自動挿入を明示 handoff 経由に置換する際の**退役計画**を事前 doc 化する。Stage 1-3 進行中に参照され、Stage 4 着手時には更新のみで済むようにする。

**新設 doc**: `docs/coalter-legacy-cardplacement-retirement-plan.md`

**章立て（最小骨格）**:
- §0 メタ（位置づけ / スコープ / 正本依存）
- §1 legacy CoAlterCard 現状（`ChatClient.tsx:1898-1908` 付近の自動挿入フロー）
- §2 退役ゴール（統合契約 §1.4 準拠: 「自動挿入廃止 / 明示 handoff 経由のみ」）
- §3 移行期の扱い（Stage 1-3 中は legacy 維持、Stage 4 flip）
- §4 retirement phase（flag 追加 → shadow 観測 → CEO 承認 flip → 1 rev 後に code 削除）
- §5 flag 設計（`COALTER_LEGACY_CARD_AUTO_INSERT` 既定 ON、Stage 4 で OFF flip）
- §6 rollback（flag を再 ON で即復帰）
- §7 削除 CEO 審議のタイミング（Stage 4 flip 後 1 rev 観測した後）

**Gate**:
- [ ] doc が §0-§7 を持つ
- [ ] 統合契約 §1.4 を正本として参照
- [ ] `ChatClient.tsx` の該当行を明示引用
- [ ] Stage 4 フロー（§7）が本書 §7 と整合

**Commit msg**:
```
docs(coalter): legacy CoAlterCard 退役計画 doc 起草

新設:
- docs/coalter-legacy-cardplacement-retirement-plan.md v0.1 DRAFT

正本: integration contract §1.4（Stage 4 で置換判断）
目的: Stage 4 ChatClient 本実装時に参照される退役 roadmap を事前化
```

### 3.5 Stage 0.5 完了条件

- [x] Phase L0-a 10 箇所 / 22 行 statutory refs 追記完了（**着地済** commit `a98114c4`）
- [ ] Phase L0-b 退役計画 doc 起草完了（**新セッションで着手**）
- [ ] CEO が Stage 0.5 完了を承認（Phase L0-b 完了後、短確認で可）

---

## 4. Stage 1 — preview 静的試作

**目的**: 上部レイヤー UI / Pattern variant / S0-S8 UI 差の**視覚的試作**を preview 内で行う。`ChatClient.tsx` / `lib/coalter/**` に影響ゼロ。

**配置**: `app/(dev)/coalter-preview/upper-layer/**`（preview dir 内完結）

### 4.1 Phase L1-a — ディレクトリ / ルーティング基盤

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/page.tsx` | **新規** | preview トップページ、state picker UI（S0-S8 切替 / Pattern variant picker / mode picker） |
| `app/(dev)/coalter-preview/upper-layer/layout.tsx` | **新規** | preview 用 layout（本番 layout と分離） |

**Gate**:
- [ ] preview URL でページが開く
- [ ] 本番 ChatClient / navigation に影響ゼロ（`npm run build` 成功、既存 route 変化なし）

### 4.2 Phase L1-b — 上部レイヤー ASCII の React 静的再現（S0-S8）

**正本**: Core UX v1.1 §3.1 / UI spec §5.3-5.11（各 S の ASCII レイアウト）

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/components/UpperLayerShell.tsx` | **新規** | 上部レイヤーの外枠（glassmorphism design system 借用、v1.1 §3.1 ASCII の React 翻訳） |
| `app/(dev)/coalter-preview/upper-layer/components/states/S0Observing.tsx` 〜 `S8Cooldown.tsx` | **新規 9 件** | UI spec §5.3-5.11 各 ASCII を React 化（S0 見守り / S1 介入気配 / S2 入口発話 / S3 返答待ち / S4 理解更新中 / S5 橋渡し中 / S6 提案可能 / S7 提案表示 / S8 クールダウン） |
| `app/(dev)/coalter-preview/upper-layer/components/Chip.tsx` | **新規** | 常設 chip component（UI spec §3.4 準拠） |

**制約**:
- **本書で visual 数値（px / ms / color hex）を新規提案しない**。v1.1 §9 / UI spec §1.5 アニメカテゴリ / glassmorphism design system の既存 token を借用
- 全 state component は**props = mock data**（実 signal 非接続）

**Gate**:
- [ ] 9 state 全て preview 上で表示切替可能
- [ ] state picker で S0 → S8 を全部遷移できる
- [ ] UI spec §5.3-5.11 の ASCII と視覚的整合（CEO 短確認）

### 4.3 Phase L1-c — Pattern variant 合成プレビュー

**正本**: speech template §3-§9（Pattern A/B/C/D/E/F-1/F-2 文面テンプレート）/ UI spec §7.10 合成規則 / §7.12 Pattern→State 許可 matrix

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/components/patterns/PatternA.tsx` 〜 `PatternF2.tsx` | **新規 7 件** | Pattern A/B/C/D/E/F1/F2 の**文面カード** React 化。文面は speech template §3-§9 の例文を**そのまま静的表示**（LLM 呼ばない） |
| `app/(dev)/coalter-preview/upper-layer/mock/patterns.ts` | **新規** | Pattern variant 7 種の mock 文面（speech template §3-§9 例文の copy、編集しない） |
| `app/(dev)/coalter-preview/upper-layer/components/PatternPicker.tsx` | **新規** | Pattern picker UI。A-F2 切替 + 合成（F-1 + F-2 共存時の §7.10 規則視覚確認） |

**Gate**:
- [ ] 7 pattern 全て preview 上で表示切替可能
- [ ] UI spec §7.12 Pattern→State 許可 matrix の全セル（9 state × 7 pattern = 63 セル）で「許可 / 禁止」が視覚確認できる
- [ ] speech template §2 共通禁止表現（裁定 / 代弁 / 評定 / 尋問 / 追い詰め / 確定）が mock 文面に含まれない（目視レビュー）

### 4.4 Phase L1-d — 状態×モード優先順位 matrix 可視化

**正本**: UI spec §4「状態 × モード 優先順位マトリクス」【中核】

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/components/StateModeMatrix.tsx` | **新規** | UI spec §4 マトリクス本体を表として React 表示（通常 / Daily / Travel × S0-S8 の 27 セル、各セル 6 属性） |
| `app/(dev)/coalter-preview/upper-layer/mock/stateModeMatrix.ts` | **新規** | マトリクスデータ（UI spec §4.3 コピー、編集しない） |

**Gate**:
- [ ] 27 セルが全て埋まっている（UI spec §4.3 の網羅性確認）
- [ ] §4.4「状態優先切替の例外」が preview 上で確認できる（A3 例外の visual demo）

### 4.5 Phase L1-e — Daily Mode 画面 React 静的再現

**正本**: Core UX v1.1 §2.1（3 Presence Mode 定義）/ §2.2（通常 vs Daily/Travel 役割の中心）/ UI spec §4「状態×モード優先順位マトリクス」Daily 列 / §5.3-5.11 各 S の Daily 列差分

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/components/modes/DailyMode.tsx` | **新規** | Daily mode の上部レイヤー外枠（v1.1 §2 / UI spec §4 の Daily 列を React 化） |
| `app/(dev)/coalter-preview/upper-layer/components/modes/daily/S0Daily.tsx` 〜 `S8Daily.tsx` | **新規 9 件** | UI spec §4.3.1-4.3.9 の Daily 列セル（6 属性: 表示要素 / 文面トーン / chip / mode 表示 / 緊急介入 / 拒否動線）を S0-S8 各々で React 化 |
| `app/(dev)/coalter-preview/upper-layer/mock/dailyContext.ts` | **新規** | Daily mode の mock 文脈（今日の予定 / 今日の出来事の整理） |

**制約**:
- 通常モードと UI 構造を共有（DailyMode.tsx は外枠差分のみ、S0-S8 sub-component は通常モード版を base に diff 表示）
- v1.1 §2.3「Daily/Travel は昇格モード」原則：Daily mode 単独起動の preview ではなく、通常 → Daily 昇格を mock 切替で表現
- v1.1 §11.5「何でも Daily/Travel にしない」：Daily mode 起動条件を明示 signal（手動切替 mock or 状態優先昇格 mock）に限定

**Gate**:
- [ ] Daily mode 9 state（S0-S8 × Daily）が preview 上で表示切替可能
- [ ] UI spec §4.3 Daily 列の 9 セル 6 属性が網羅
- [ ] 通常 → Daily 昇格 mock が動作
- [ ] CEO 短確認で Core UX §2.2 の「役割の中心が違う」が視覚的に伝わる

### 4.6 Phase L1-f — Travel Mode 画面 React 静的再現

**正本**: Core UX v1.1 §2.1（3 Presence Mode 定義）/ UI spec §4「状態×モード優先順位マトリクス」Travel 列 / §5.3-5.11 各 S の Travel 列差分

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/components/modes/TravelMode.tsx` | **新規** | Travel mode の上部レイヤー外枠（v1.1 §2 / UI spec §4 の Travel 列を React 化） |
| `app/(dev)/coalter-preview/upper-layer/components/modes/travel/S0Travel.tsx` 〜 `S8Travel.tsx` | **新規 9 件** | UI spec §4.3.1-4.3.9 の Travel 列セル（6 属性）を S0-S8 各々で React 化 |
| `app/(dev)/coalter-preview/upper-layer/mock/travelContext.ts` | **新規** | Travel mode の mock 文脈（旅程 / 行先 / 旅プラン整理） |

**制約**:
- 通常モードと UI 構造を共有
- v1.1 §2.3「昇格モード」原則：Travel mode 起動条件を明示 signal に限定

**Gate**:
- [ ] Travel mode 9 state（S0-S8 × Travel）が preview 上で表示切替可能
- [ ] UI spec §4.3 Travel 列の 9 セル 6 属性が網羅
- [ ] 通常 → Travel 昇格 mock が動作

### 4.7 Phase L1-g — モード切替 / 昇格・降格 UI フロー preview

**正本**: UI spec §6 全体（モード切替と昇格／降格 UI）/ Core UX v1.1 §2.3 通常モード本体性

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/components/ModeSwitcher.tsx` | **新規** | 手動切替 UI（§6.3 手動切替フロー）/ 通常 ⇄ Daily ⇄ Travel button |
| `app/(dev)/coalter-preview/upper-layer/components/AutoEscalationBanner.tsx` | **新規** | 自動昇格 UI（§6.4 S5 状態優先切替時の昇格通知 banner） |
| `app/(dev)/coalter-preview/upper-layer/components/ModeReturn.tsx` | **新規** | 通常モード復帰 UI（§6.5）/ Daily/Travel から通常への戻り |
| `app/(dev)/coalter-preview/upper-layer/components/RejectionFlows.tsx` | **新規** | 拒否 3 分類の UI mock（§6.6.1 mode 昇格拒否 / §6.6.2 個別提案拒否 / §6.6.3 介入そのものの後退要求） |
| `app/(dev)/coalter-preview/upper-layer/mock/modeTransitions.ts` | **新規** | 切替・昇格・降格・拒否の状態遷移 mock |

**制約**:
- §6.2 の 3 形態（手動切替 / 自動昇格 / 復帰）を全て preview 上で再現
- §6.6 の 3 分類拒否は**異なる UI** で区別（拒否種別の混同禁止）
- §6.7 再介入条件サマリの cooldown 期間も visual 表示
- §6.8 拒否の非判定性：拒否が「悪い」「失敗」と読まれる視覚要素を一切出さない

**Gate**:
- [ ] §6.2 3 形態が preview 上で動作
- [ ] §6.6 3 分類拒否がそれぞれ異なる UI で表示
- [ ] §6.7 再介入条件 cooldown が表示される
- [ ] §6.8 非判定性の visual 検証（CEO 短確認）

### 4.8 Phase L1-h — 共有メモリ surface preview

**正本**: UI spec §8.2 共有メモリ surface 表示モデル / §8.3 由来×確定度×可視性 3 軸 / §8.4 可視性操作 UI / Core UX v1.1 §10 共有メモリとモード別文脈管理

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/components/memory/MemorySurface.tsx` | **新規** | 共有メモリ surface 本体（§8.2.1 コンポーネント形態） |
| `app/(dev)/coalter-preview/upper-layer/components/memory/MemoryAccessRail.tsx` | **新規** | アクセス導線 UI（§8.2.2、上部レイヤー右端 rail） |
| `app/(dev)/coalter-preview/upper-layer/components/memory/MemoryItemCard.tsx` | **新規** | 個別メモリ項目 card（§8.3.2 視覚記号型 + §8.3.3 ラベル階層 + §8.3.4 有効組み合わせ制約） |
| `app/(dev)/coalter-preview/upper-layer/components/memory/VisibilityControls.tsx` | **新規** | 可視性 4 操作 UI（§8.4.1 観測停止 / 訂正 / 削除 / 範囲縮小） + §8.4.1.1 操作の意味境界 |
| `app/(dev)/coalter-preview/upper-layer/components/memory/RetreatRail.tsx` | **新規** | 後退導線 UI（§8.4.2） |
| `app/(dev)/coalter-preview/upper-layer/mock/memoryItems.ts` | **新規** | mock メモリ項目（由来 6 種 × 確定度 3 段階 × 可視性 3 段階の網羅サンプル） |

**制約**:
- §8.3.1 3 軸の独立定義：由来・確定度・可視性は **1:1 mapping しない**（独立の組み合わせを表現）
- §8.3.4 有効組み合わせ制約：禁止組み合わせ（例: 由来=暗黙観測 ∧ 確定度=確定 など）が UI で生成されない
- §8.4.3 操作フィードバックのトーン：操作後の応答が裁定的にならない（§6.8 非判定性継承）
- §8.4.4 片側可視性の範囲：A 側可視 / B 側可視 / 両側可視の 3 種が UI で区別

**Gate**:
- [ ] §8.2-§8.4 全 component が preview 上で表示
- [ ] §8.3.1 3 軸が独立して切替可能
- [ ] §8.3.4 禁止組み合わせが UI で生成されない（test）
- [ ] §8.4 4 操作が動作、各操作後の visual feedback が §8.4.3 トーン準拠

### 4.9 Phase L1-i — 緊急介入視覚層 preview

**正本**: UI spec §8.5 緊急介入視覚層 / §8.6 memory surface と urgent layer の優先順位 / runtime contract §1.5 critical signal

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/components/urgent/UrgentLayer.tsx` | **新規** | 緊急介入視覚層本体（§8.5.2 視覚形態） |
| `app/(dev)/coalter-preview/upper-layer/components/urgent/UrgentMessageCard.tsx` | **新規** | 緊急発話 card（§8.5.3 トーンと視覚言語） |
| `app/(dev)/coalter-preview/upper-layer/components/urgent/UrgentRelease.tsx` | **新規** | 解除 UI（§8.5.4 解除条件: 自動 / 手動 / cooldown） |
| `app/(dev)/coalter-preview/upper-layer/mock/urgentScenarios.ts` | **新規** | critical signal 投入 mock（dignity 抵触 / rupture 検出 / safety 違反） |

**制約**:
- §8.5.5 §6.8 非判定性の継承：緊急発火後の発話・visual で「悪い」「失敗」を表現しない
- §8.6.1 平常時・緊急時の優先順位：urgent layer 表示時に memory surface は降格 or 縮退（§8.6.2 使い分け）
- §8.6.3 同時出現時の禁止組み合わせ：urgent + 提案 (S7) 同居禁止など
- §8.6.4 遷移アニメのトーン連続性：urgent 起動時の motion が裁定的にならない（v1.1 §1.5 アニメカテゴリ準拠）

**Gate**:
- [ ] critical signal 投入で urgent layer が起動
- [ ] §8.5.4 3 解除条件が動作
- [ ] §8.6.1 優先順位 + §8.6.3 禁止組み合わせが UI 構造的に enforce
- [ ] CEO 短確認で §8.5.3 「裁定にならない」「権威にならない」トーンを目視

### 4.10 Phase L1-j — UI 基礎要素 preview（密度 / アニメ / focus / scroll / z-index / 入力欄競合）

**正本**: UI spec §1.4 UI 密度の段階 / §1.5 アニメカテゴリ / §1.6 連投抑制の構造的担保 / §2.3 z-index / §2.4 focus 競合 / §2.5 scroll 連動 / §2.6 入力欄との競合境界 / §2.7 action 実行後の handoff 境界

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/upper-layer/components/foundation/DensityShowcase.tsx` | **新規** | UI 密度 4 段階の visual demo（§1.4: minimal / standard / focused / urgent） |
| `app/(dev)/coalter-preview/upper-layer/components/foundation/AnimationCatalog.tsx` | **新規** | アニメカテゴリ visual demo（§1.5: enter / exit / state-shift / urgent / retreat の 5 カテゴリ） |
| `app/(dev)/coalter-preview/upper-layer/components/foundation/ZIndexInspector.tsx` | **新規** | z-index 階層 visualizer（§2.3: メインチャット / 上部レイヤー / urgent / modal の重なり） |
| `app/(dev)/coalter-preview/upper-layer/components/foundation/FocusGuard.tsx` | **新規** | focus 競合制御（§2.4: 上部レイヤー focus 取得時のメインチャット保護） |
| `app/(dev)/coalter-preview/upper-layer/components/foundation/ScrollSync.tsx` | **新規** | scroll 連動（§2.5: メインチャット scroll に対する上部レイヤー追従ルール） |
| `app/(dev)/coalter-preview/upper-layer/components/foundation/InputBoundary.tsx` | **新規** | 入力欄との競合境界（§2.6: 入力中 / IME 中の上部レイヤー応答抑制） |
| `app/(dev)/coalter-preview/upper-layer/components/foundation/HandoffBoundary.tsx` | **新規** | action 実行後の handoff 境界（§2.7: 手動 handoff 後の cooldown） |
| `app/(dev)/coalter-preview/upper-layer/components/foundation/RateLimitDemo.tsx` | **新規** | 連投抑制構造的担保 demo（§1.6 / Core UX §11.4: 同一 state 連続発話禁止 / cooldown 強制） |

**制約**:
- §1.5 で定義される motion token をそのまま使う（新規数値禁止、§0.2 整合）
- glassmorphism design system の既存 z-index token を借用（§2.3 数値はそこに準拠）
- §2.6 入力欄との競合：IME composition 中は signal 起動禁止（構造的担保、test 必須）

**Gate**:
- [ ] §1.4 4 段階密度が visual で確認できる
- [ ] §1.5 5 カテゴリアニメが動作
- [ ] §2.3 z-index 階層が正しい
- [ ] §2.4-§2.7 4 境界が**構造的に**enforce（テスト含む）
- [ ] §1.6 連投抑制の demo で「2 連発が起きない」が visual 確認

### 4.11 Phase L1-k — CEO visual レビュー（Stage 1 全体）

- [ ] CEO が preview を開き、v1.1 §3.1 ASCII / UI spec §4 / §5 / §6 / §7 / §8 全体との整合を目視確認
- [ ] 通常 / Daily / Travel 3 mode 全てが preview 上で動作
- [ ] モード切替 / 昇格降格 / 拒否 3 分類 / 共有メモリ / 緊急介入 / UI 基礎要素 が**全て揃っている**ことを CEO が確認
- [ ] CEO 承認で Stage 1 完了

### 4.12 Stage 1 完了状態

- `app/(dev)/coalter-preview/upper-layer/**` に静的 preview が存在
- S0-S8 / Pattern A-F2 / 状態×モード matrix（27 セル）の全要素が視覚化
- **3 Presence Mode（通常 / Daily / Travel）9×3 = 27 sub-layout が全て React 化**
- **モード切替 / 昇格降格 / 拒否 3 分類 / 共有メモリ surface / 緊急介入視覚層 / UI 基礎要素**が preview 上で動作
- 本番 ChatClient / lib/coalter に影響ゼロ
- Stage 2 で「Pattern の何を出力するか」「S の何を表示するか」「mode の何を切り替えるか」「memory の何を保持するか」「urgent の何で起動するか」の contract を reducer / store に持たせる準備完了

---

## 5. Stage 2 — 通常 executor 骨格

**目的**: S0-S8 reducer / signal adapter / Pattern variant type / 許可 matrix / executor availability 直交 を**新規サブディレクトリ** `lib/coalter/presence/**` に実装する。既存 `coalterDispatch.ts` は非接触。

### 5.1 Phase L2-a — 型定義と基盤

**配置**: `lib/coalter/presence/`（新規サブディレクトリ、既存 `lib/coalter/**` の他ファイル非接触）

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/types.ts` | **新規** | 型定義: `PresenceState` (`"S0" \| ... \| "S8"`) / `PresenceMode` (`"normal" \| "daily" \| "travel"`) / `PatternVariant` (`"A" \| ... \| "F1" \| "F2"`) / `PatternFamily` / `toFamily` / `ExecutorAvailability` (`"disabled" \| "inactive" \| "pending_consent" \| "enabled" \| "active"`) / `Signal` 分類 type（明示/暗黙/緊急/モード昇格/手動再起動、runtime §1.1） |
| `lib/coalter/presence/constants.ts` | **新規** | 定数: cooldown 種類、signal 強度（strong/soft/none）、Pattern→State 許可 matrix（UI spec §7.12 の TypeScript 定数化） |
| `tests/unit/coalter/presence/types.test.ts` | **新規** | 型 shape 固定 / `toFamily` 逆変換（F1 → F, F2 → F, その他 → identity）/ matrix 網羅性（9 state × 7 variant = 63 セル埋め） |

**Gate**:
- [ ] `npx tsc --noEmit` エラー 0
- [ ] 既存 `coalterDispatch.ts` / `coalterOrchestrator.ts` / CoAlterCard 関連ファイルに diff ゼロ

### 5.2 Phase L2-b — signalAdapter（event bus 分離）

**正本**: runtime contract §1「論点 3」 / integration §3 event bus 分離

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/signalAdapter.ts` | **新規** | executor 事実 → presence signal 変換 adapter（runtime §1.3「adapter 経由のみ許可」）。5 signal 分類を `presence.state.*` 事象に map |
| `lib/coalter/presence/signalClassifier.ts` | **新規** | signal 強度分類（strong / soft / none、runtime §1.2）+ 暗黙 signal 検出器の entry point（内部閾値アルゴリズムは executor 側委譲、本書で定めない） |
| `tests/unit/coalter/presence/signalAdapter.test.ts` | **新規** | 5 分類の正確性 / 未知 signal は `none` に落ちる / executor event が直接 signal に漏れない（構造 gate） |
| `tests/unit/coalter/presence/signalClassifier.test.ts` | **新規** | strong / soft / none 分類 / S1 スキップは critical のみ（runtime §1.5） |

**Gate**:
- [ ] signal 5 分類の test PASS
- [ ] adapter 経由でない signal 投入 path が**構造的に存在しない**（import 構造レビュー）
- [ ] executor event（`executor.understanding.*`）の直接購読コードが `presence/**` に存在しない

### 5.3 Phase L2-c — reducer（S0-S8 state machine）

**正本**: Core UX v1.1 §8（S0-S8 状態遷移）/ UI spec §5（各 S 詳細）/ §5.12（遷移継承）/ runtime §1.5（S1 スキップ）

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/reducer.ts` | **新規** | `presenceReducer(state, event): state` 実装。9 状態 + 許可遷移 + 緊急短縮（S0→S2）+ 退出（S7→S8）+ 再起動（S8→S0） |
| `lib/coalter/presence/transitions.ts` | **新規** | 許可遷移 matrix（S×S の 9×9 論理表、Core UX v1.1 §8.3 基本フロー / §8.4 例外ルート / §8.5 退出 / §8.6 再起動 統合） |
| `tests/unit/coalter/presence/reducer.test.ts` | **新規** | ① 基本フロー S0→S1→S2→S3→S4→S5→S6→S7→S8 / ② 緊急短縮 S0→S2（critical signal） / ③ 退出 S7→S8 / ④ 再起動 S8→S0 / ⑤ 未許可遷移で state 不変 |
| `tests/unit/coalter/presence/transitions.test.ts` | **新規** | 9×9 許可 matrix の網羅性（対称性不要だが穴なし） |

**Gate**:
- [ ] 基本 9 遷移 PASS
- [ ] 緊急短縮 PASS
- [ ] 退出 / 再起動 PASS
- [ ] 未許可遷移で state が不変（defensive）
- [ ] `npx tsc --noEmit` エラー 0

### 5.4 Phase L2-d — patternSelector（Pattern→State 許可 matrix）

**正本**: UI spec §7.12 Pattern→State 許可 matrix（Two-Stage Gating 正本）/ speech template §3-§9 文面テンプレート

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/patternSelector.ts` | **新規** | `selectPattern(state, mode, context): PatternVariant \| null` 実装。§7.12 matrix に従い許可 pattern を返す。UI spec §7.10 合成規則（F-1/F-2 共存）/ §7.11 非同居規則を実装 |
| `tests/unit/coalter/presence/patternSelector.test.ts` | **新規** | 63 セル（9 state × 7 variant）の許可/禁止テスト |
| `tests/unit/coalter/presence/patternCompositionRules.test.ts` | **新規** | §7.10 F-1/F-2 共存 / §7.11 非同居（A/F 同時禁止など） |

**Gate**:
- [ ] 63 セル test PASS
- [ ] 合成規則 / 非同居規則 test PASS
- [ ] speech template §2 共通禁止表現を含む文面を generate しない（mock LLM で検証）

### 5.5 Phase L2-e — availability / cooldown resolver

**正本**: master §5（起動状態機械）/ integration §2（availability 直交）/ runtime §3（優先順位 6 段階）

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/availability.ts` | **新規** | `ExecutorAvailability` 遷移 + `enabled → disabled`（opt-out）/ `disabled → pending_consent → enabled`（相手の再同意、master §5 rev 1 整合） |
| `lib/coalter/presence/cooldownResolver.ts` | **新規** | runtime §3.3 優先順位 6 段階判定（availability → dignity → rupture → mode 拒否 → 提案拒否 → 通常 S8）。§3.3.1 超越 cooldown 抑制応答の hook point |
| `tests/unit/coalter/presence/availability.test.ts` | **新規** | 5 状態遷移 / `disabled → enabled` 直接遷移禁止 / pending_consent 経由 |
| `tests/unit/coalter/presence/cooldownResolver.test.ts` | **新規** | ① 6 段階優先順位 / ② dignity/rupture 超越（@coalter 強制でも介入拒否、抑制応答は返す）/ ③ 通常 S8 の @coalter 強制上書き / ④ critical signal の 5 分ルール超越 |

**Gate**:
- [ ] availability 5 状態遷移 PASS
- [ ] cooldown 優先順位 6 段階 PASS
- [ ] 超越 cooldown 抑制応答 PASS
- [ ] critical 5 分超越 PASS

### 5.6 Phase L2-f — shared state 同期インフラ（server 正本）

**正本**: runtime §2「論点 4」（shared state / local state / server 正本）

**CEO 判断ポイント**: 同期媒体（WebSocket / Supabase Realtime / polling）の選択は CEO 承認必須。本書では interface のみ定義。

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/sharedState.ts` | **新規** | `SharedState` interface（availability / presenceState / mode / speechCard / chipTap / memorySurface / proposalCard / handoffStatus） |
| `lib/coalter/presence/syncAdapter.ts` | **新規（interface 層）** | `SyncAdapter` interface（`broadcast` / `subscribe` / `ack`）。実装（WebSocket / Supabase Realtime）は CEO 承認後の別 Phase |
| `lib/coalter/presence/localState.ts` | **新規** | `LocalState` interface（入力中テキスト / hover / focus / tooltip / scroll）。client ローカル、server 非同期 |
| `lib/coalter/presence/optimisticReconcile.ts` | **新規** | optimistic update と server state の矛盾時「server が勝つ」調停（runtime §2.5） |
| `tests/unit/coalter/presence/sharedState.test.ts` | **新規** | SharedState enum 網羅性 / local state と shared state の overlap ゼロ |
| `tests/unit/coalter/presence/optimisticReconcile.test.ts` | **新規** | server 勝ちの調停 / 入力欄は revert 対象外 / last-write-wins 衝突 |

**Gate**:
- [ ] shared / local 分類の網羅性
- [ ] optimistic update の test PASS
- [ ] CEO 承認済の場合のみ SyncAdapter 実装（本 Phase では interface のみ、実装は Stage 3 or 別 Phase）

### 5.7 Phase L2-g — kill switch 整備

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/flags.ts` | **修正** | `presenceExecutorEnabled` 新設（既定 OFF、env `COALTER_PRESENCE_EXECUTOR`）。Stage 4 以前は OFF、Stage 4 で ON flip |
| `tests/unit/coalter/presenceExecutorFlag.test.ts` | **新規** | flag invariant（既定 OFF、env で ON） |

**Gate**:
- [ ] flag OFF 既定
- [ ] flag OFF で既存 coalter 挙動が 1 bit 変わらない（test で検証）

### 5.8 Phase L2-h — modeReducer（mode 昇格・降格 logic）

**正本**: Core UX v1.1 §2.3 通常モード本体性 / §2.4 3 軸の関係 / UI spec §6.4 自動昇格 / §6.5 通常モードへの復帰 / runtime contract §1.1 signal 5 分類のうち「モード昇格」signal

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/modeReducer.ts` | **新規** | `modeReducer(mode, event): mode` 実装。3 形態（手動切替 / 自動昇格 / 復帰）の遷移 logic |
| `lib/coalter/presence/modeEscalationDetector.ts` | **新規** | 自動昇格判定（UI spec §6.4 S5 状態優先切替時）。Daily/Travel 起動条件: 明示 signal のみ（v1.1 §11.5 何でも Daily/Travel にしない原則） |
| `lib/coalter/presence/modeReturnLogic.ts` | **新規** | 通常モード復帰 logic（UI spec §6.5）/ Daily/Travel 文脈完了 or 明示降格で通常へ |
| `tests/unit/coalter/presence/modeReducer.test.ts` | **新規** | ① 通常 → Daily 手動切替 / ② 通常 → Travel 手動切替 / ③ 通常 → Daily/Travel 自動昇格（明示 signal） / ④ 暗黙 signal で昇格しない（§11.5 enforce） / ⑤ Daily → 通常復帰 / ⑥ Travel → 通常復帰 / ⑦ Daily ↔ Travel 直接遷移禁止 |
| `tests/unit/coalter/presence/modeEscalationDetector.test.ts` | **新規** | 明示 signal で昇格 / 暗黙 signal で昇格しない / state 優先昇格条件 |

**Gate**:
- [ ] modeReducer 7 ケース PASS
- [ ] §11.5「何でも Daily/Travel にしない」原則が構造的に担保（暗黙 signal 起動 path が**存在しない**）
- [ ] Daily ↔ Travel 直接遷移禁止が enforce

### 5.9 Phase L2-i — 共有メモリ store（3 軸: 由来 × 確定度 × 可視性）

**正本**: UI spec §8.3 共有メモリ項目の由来・確定度・可視性ラベル / Core UX v1.1 §10 共有メモリとモード別文脈管理

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/memoryStore.ts` | **新規** | 共有メモリ store。`MemoryItem` 型: `{ id, content, origin, certainty, visibility, modeContext, createdAt, updatedAt }` |
| `lib/coalter/presence/memoryTypes.ts` | **新規** | 型定義: `Origin` (6 種) / `Certainty` (3 段階: 仮 / 暫定 / 確定) / `Visibility` (3 段階: A 側のみ / B 側のみ / 両側) / `ModeContext` (通常 / Daily / Travel) |
| `lib/coalter/presence/memoryConstraints.ts` | **新規** | §8.3.4 有効組み合わせ制約。禁止組み合わせ enforcer（暗黙観測 ∧ 確定 など） |
| `lib/coalter/presence/memoryVisualType.ts` | **新規** | §8.3.2 視覚記号型 → 表示形式 mapping（type-safe） |
| `lib/coalter/presence/memoryLabelHierarchy.ts` | **新規** | §8.3.3 ラベル階層ルール |
| `lib/coalter/presence/modeContextManager.ts` | **新規** | Core UX §10.2 モード別セッション文脈の保持・切替 / §10.3 モード遷移時の文脈継承ルール |
| `tests/unit/coalter/presence/memoryStore.test.ts` | **新規** | CRUD + 3 軸独立性（§8.3.1）+ 禁止組み合わせ rejected（§8.3.4）|
| `tests/unit/coalter/presence/modeContextManager.test.ts` | **新規** | mode 遷移時の文脈継承（§10.3 ルール準拠） |

**Gate**:
- [ ] §8.3 全項目の TypeScript 型化
- [ ] §8.3.4 禁止組み合わせが**構造的に**生成不可能（コンパイル時 or runtime guard）
- [ ] mode 遷移時の文脈継承ルール test PASS

### 5.10 Phase L2-j — 拒否 3 分類 reducer

**正本**: UI spec §6.6 拒否の 3 分類（mode 昇格拒否 / 個別提案拒否 / 介入そのものの後退要求）/ §6.7 再介入条件サマリ / §6.8 拒否の非判定性

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/rejectionReducer.ts` | **新規** | 拒否 3 分類 state machine。`RejectionType = "mode_escalation" \| "individual_proposal" \| "coalter_retreat"` |
| `lib/coalter/presence/reentryConditions.ts` | **新規** | §6.7 再介入条件サマリ。各拒否種別の cooldown 期間・解除条件・再介入 trigger |
| `tests/unit/coalter/presence/rejectionReducer.test.ts` | **新規** | ① mode 昇格拒否で mode 復帰 / ② 個別提案拒否で次提案までの cooldown 増加 / ③ coalter 後退要求で availability `disabled` 遷移 / ④ 3 種拒否の混同なし（独立した state） |
| `tests/unit/coalter/presence/reentryConditions.test.ts` | **新規** | §6.7 cooldown 期間 / 再介入 trigger の正確性 |

**Gate**:
- [ ] 3 拒否種別の独立性が構造的に担保（1 enum or 1 reducer に統合しない、§2.3.1 直交原則準拠）
- [ ] §6.8 非判定性：拒否後の state が「失敗」「悪い」を内部表現として持たない
- [ ] §6.7 再介入条件 test 全 PASS

### 5.11 Phase L2-k — 緊急介入 trigger logic

**正本**: UI spec §8.5 緊急介入視覚層 / §8.6 優先順位 / runtime contract §1.5 critical signal

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/urgentTrigger.ts` | **新規** | critical signal → urgent layer 起動 logic（§8.5.1 責務） |
| `lib/coalter/presence/urgentReleaseLogic.ts` | **新規** | §8.5.4 解除条件（自動 / 手動 / cooldown）の 3 path |
| `lib/coalter/presence/urgentMemoryPriority.ts` | **新規** | §8.6.1 平常時 / 緊急時優先順位 / §8.6.2 降格 vs 縮退 / §8.6.3 同時出現禁止組み合わせ enforcer |
| `tests/unit/coalter/presence/urgentTrigger.test.ts` | **新規** | dignity 抵触 / rupture 検出 / safety 違反で urgent 起動 |
| `tests/unit/coalter/presence/urgentMemoryPriority.test.ts` | **新規** | urgent 起動時に memory surface が降格 or 縮退（§8.6.2 使い分け）/ urgent + S7 同居禁止（§8.6.3） |

**Gate**:
- [ ] critical signal 3 種で urgent 起動
- [ ] §8.5.4 3 解除 path が動作
- [ ] §8.6.3 禁止組み合わせが構造的に enforce

### 5.12 Phase L2-l — 連投抑制 構造的担保

**正本**: UI spec §1.6 連投抑制の構造的担保 / Core UX v1.1 §11.4 連投しない / §5.2 1 回の発話でやることは 1 つ / §5.3 長く話さない

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/rateLimitGuard.ts` | **新規** | 連投抑制 guard。同一 state 連続発話禁止 / cooldown 強制 / 1 発話 1 タスク enforcer |
| `lib/coalter/presence/utteranceQueue.ts` | **新規** | 発話 queue（同時発話禁止、構造的に 1 発話単位の serialize） |
| `tests/unit/coalter/presence/rateLimitGuard.test.ts` | **新規** | ① 同一 state で 2 連発が**構造的に**起きない / ② cooldown 中の発話 reject / ③ §5.2 1 発話 1 タスク違反検出 / ④ §5.3 文長 override 違反検出 |

**Gate**:
- [ ] 連投が**コード構造で**禁止（試行に対して reject、ログ警告ではなく enforce）
- [ ] §11.4 連投しない原則の構造的担保が test で検証

### 5.13 Phase L2-m — speechBuilder LLM 合成 hook（interface のみ）

**正本**: speech template §3-§9 文面テンプレート / Core UX v1.1 §4 通常モード発話パターン 6 種

**目的**: Stage 1 で「LLM 呼ばない」だった speechBuilder の **interface 層** を Stage 2 で先に定義し、Stage 4 で本実装する準備をする。本 Phase では interface のみ、実装は Stage 4。

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/speechBuilder.ts` | **新規（interface 層）** | `buildPresenceSpeech(variant, state, mode, context): Promise<SpeechOutput>` の interface。実装は Stage 4 で LLM 合成導線を追加 |
| `lib/coalter/presence/speechValidator.ts` | **新規** | speech template §2 共通禁止表現の構造検査（語彙レベル） + §1.2.1 6 項目 checker（LLM 出力の事後 validation 用 entry point） |
| `lib/coalter/presence/speechTypes.ts` | **新規** | `SpeechOutput` 型 / `ToneCategory` / `LengthOverride` / Pattern 別の文長制約（speech template §3.3 / §4.3 / §5.3 / §6.3 / §7.3 / §8.3 文長 override） |
| `tests/unit/coalter/presence/speechValidator.test.ts` | **新規** | §2 共通禁止表現の検出 / §1.2.1 6 項目 checker / mainstream plan の Bug-1 lexeme 正本との整合 |

**Gate**:
- [ ] interface 型が speech template §3-§9 全 Pattern に対応
- [ ] §2 禁止表現 validator が動作
- [ ] mainstream plan EMOTION_TAG_LEXEMES 正本との整合（dual source 禁止、import 経由のみ）
- [ ] LLM 呼び出し実装は Stage 4 に委譲（本 Phase で touch しない）

### 5.14 Stage 2 完了条件

- [ ] L2-a 〜 L2-m 全 Phase PASS
- [ ] `tests/unit/coalter/presence/` 全 PASS
- [ ] `tests/unit/coalter/` 累積全 PASS（既存テスト回帰ゼロ）
- [ ] `npx tsc --noEmit` エラー 0
- [ ] 既存 `coalterDispatch.ts` / `coalterOrchestrator.ts` / CoAlterCard / 他 `lib/coalter/**` に diff ゼロ
- [ ] `npm run build` 成功
- [ ] **3 Presence Mode reducer / 共有メモリ store / 拒否 3 分類 / 緊急介入 trigger / 連投抑制 / speechBuilder interface が全て揃う**
- [ ] CEO が骨格 landing 後の観測フェーズ合意

**ロールバック**: Phase 単位 revert（L2-m → l → k → j → i → h → g → f → e → d → c → b → a）。新規サブディレクトリのみなので影響局所。

---

## 6. Stage 3 — preview E2E（上部レイヤー UI × executor 骨格 結合）

**目的**: Stage 1 preview と Stage 2 executor 骨格を結合し、preview 内で**通常モード 1 サイクル** S0 → S8 が完結動作することを示す。ChatClient は引き続き非接触。

**配置**: `app/(dev)/coalter-preview/full/**`（Stage 1 の upper-layer preview を完成版に拡張）

### 6.1 Phase L3-a — preview E2E ハーネス

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/full/page.tsx` | **新規** | full preview トップページ。2 人の mock 会話入力 / executor 起動 / presence state 可視化 |
| `app/(dev)/coalter-preview/full/components/MockConversation.tsx` | **新規** | 2 人のチャット mock（A/B の発言を timeline 形式で入力） |
| `app/(dev)/coalter-preview/full/components/PresenceDebugPanel.tsx` | **新規** | 現在の state / mode / availability / pattern variant / signal 強度を debug 表示 |
| `app/(dev)/coalter-preview/full/hooks/usePresenceExecutor.ts` | **新規** | Stage 2 reducer + signal adapter + pattern selector を preview 内で駆動する hook |

**Gate**:
- [ ] 2 人の mock 会話で signal 発火 → reducer 遷移 → 上部レイヤー UI に state 表示
- [ ] Pattern selector が許可 matrix を遵守（禁止 pattern 非出力）
- [ ] availability 切替で S0 / S1-S8 可動域が変わる

### 6.2 Phase L3-b — 1 サイクル E2E 動作

**目的**: S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 の 9 遷移が 1 サイクル内で preview 上で観察できる。

| シナリオ | 入力 signal | 期待遷移 | 期待 Pattern |
|---|---|---|---|
| 通常経路 | 暗黙 soft signal（膠着検出 mock） | S0 → S1 → S2 | S2 で Pattern B（状況言語化）発話 |
| chip 応答 | S3 で「もう少し話す」chip tap | S3 → S4 → S5 | S5 で Pattern E（橋渡し）発話 |
| 提案 | S5 → S6 → S7 | | S7 で Pattern F-1（関係提案） |
| handoff | S7 で「チャットに共有」tap（mock） | S7 → S8 | 明示 handoff mock（実 broadcast はしない） |
| 退出 | S8 cooldown | S8 常駐 | retreat message（speech template §9.x） |
| 緊急短縮 | critical signal 投入 | S0 → S2 直接 | S2 で Pattern B（ただし緊急トーン） |
| 超越 cooldown | dignity cooldown 中に @coalter 強制 | S0 常駐 | 抑制応答 1 文（speech template 側） |

**Gate**:
- [ ] 7 シナリオ全て preview で再現可能
- [ ] 各シナリオで speech template §2 禁止表現を含まない発話のみ出力（目視レビュー）
- [ ] `§11 絶対禁止 5 項目` 違反がゼロ（CEO 短確認）

### 6.3 Phase L3-c — 共有 UI 同期 mock

**正本**: runtime §2（shared vs local state）

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/(dev)/coalter-preview/full/hooks/useMockSyncAdapter.ts` | **新規** | mock SyncAdapter（in-memory / 遅延 sim）で shared state 同期を preview 内シミュレート |
| `app/(dev)/coalter-preview/full/components/TwoClientView.tsx` | **新規** | 画面を 2 分割して A client / B client を同時表示。mock SyncAdapter 経由で broadcast |
| `tests/unit/coalter/presence/mockSyncAdapter.test.ts` | **新規** | server 勝ち調停 / eventually consistent の挙動 / 片方先行容認 |

**Gate**:
- [ ] 2 分割画面で shared state が両側に伝播
- [ ] local state（入力中テキスト）が相手側に伝播しない
- [ ] optimistic update の revert が視覚確認できる

### 6.4 Phase L3-d — Daily Mode 1 サイクル E2E

**目的**: Daily mode で S0 → S8 の 9 遷移が preview 上で観察できる。

| シナリオ | 入力 signal | 期待遷移 | 期待発話 |
|---|---|---|---|
| Daily 通常経路 | Daily 暗黙 signal mock（今日の予定整理 trigger） | S0(Daily) → S1 → S2 | S2 で Pattern B (Daily 文脈) |
| Daily chip 応答 | S3(Daily) で chip tap | S3 → S4 → S5 | S5 で Pattern E (Daily 橋渡し) |
| Daily 提案 | S5(Daily) → S6 → S7 | | S7 で Pattern F-2 (生活提案、Daily 文脈) |
| Daily 退出 | Daily 文脈完了 | S7 → S8 → S0(通常) | 通常モード復帰（§6.5）|

**Gate**:
- [ ] Daily 4 シナリオ全て preview で再現
- [ ] Daily 文脈完了後に**通常モード自動復帰**（§6.5）

### 6.5 Phase L3-e — Travel Mode 1 サイクル E2E

**目的**: Travel mode で S0 → S8 の 9 遷移が preview 上で観察できる。

| シナリオ | 入力 signal | 期待遷移 | 期待発話 |
|---|---|---|---|
| Travel 通常経路 | Travel 明示 signal（旅程整理 trigger） | S0(Travel) → S1 → S2 | S2 で Pattern B (Travel 文脈) |
| Travel chip 応答 | S3(Travel) で chip tap | S3 → S4 → S5 | S5 で Pattern E (Travel 橋渡し) |
| Travel 提案 | S5(Travel) → S6 → S7 | | S7 で Pattern F-2 (旅程提案) |
| Travel 退出 | Travel 文脈完了 | S7 → S8 → S0(通常) | 通常モード復帰 |

**Gate**:
- [ ] Travel 4 シナリオ全て preview で再現
- [ ] Travel 文脈完了後に**通常モード自動復帰**

### 6.6 Phase L3-f — モード昇格・降格 E2E

**正本**: UI spec §6.4 自動昇格 / §6.5 通常モード復帰 / §6.3 手動切替

| シナリオ | 入力 | 期待遷移 |
|---|---|---|
| 手動 → Daily | ModeSwitcher tap | 通常 → Daily（§6.3） |
| 手動 → Travel | ModeSwitcher tap | 通常 → Travel |
| 自動昇格（S5 状態優先） | S5 で Daily 文脈 signal | 通常 → Daily 自動昇格 banner（§6.4） |
| 通常復帰 | Daily 完了 or 明示降格 | Daily → 通常（§6.5） |
| Daily ↔ Travel 直接遷移 | mock 試行 | **拒否される**（modeReducer §11.5 enforce） |
| 何でも Daily/Travel 防止 | 暗黙 signal で Daily 起動試行 | **拒否される**（§11.5 構造的担保） |

**Gate**:
- [ ] 6 シナリオ全て preview で再現
- [ ] §11.5「何でも Daily/Travel にしない」の structural enforce が動作

### 6.7 Phase L3-g — 共有メモリ surface E2E

**正本**: UI spec §8.2-§8.4 / Core UX §10

| シナリオ | 入力 | 期待挙動 |
|---|---|---|
| メモリ追加 | mock 観測 trigger | MemorySurface に MemoryItemCard 追加（origin / certainty / visibility 3 軸表示） |
| 可視性操作 | VisibilityControls 4 操作各々 | 観測停止 / 訂正 / 削除 / 範囲縮小（§8.4.1）|
| 後退導線 | RetreatRail tap | 全メモリ後退 + UI トーン §8.4.3 準拠 |
| 禁止組み合わせ生成試行 | 由来=暗黙 ∧ 確定度=確定 を試行 | **構造的に拒否**（§8.3.4） |
| 片側可視性 | A 側のみ visibility | A 側 client にのみ表示、B 側に表示されない（§8.4.4） |
| mode 文脈継承 | 通常 → Daily 昇格 | §10.3 ルール準拠で文脈継承 |

**Gate**:
- [ ] 6 シナリオ全て動作
- [ ] §8.3.4 / §8.4.3 / §10.3 の 3 ルールが visual + 構造で確認

### 6.8 Phase L3-h — 緊急介入視覚層 E2E

**正本**: UI spec §8.5-§8.6 / runtime §1.5

| シナリオ | 入力 | 期待挙動 |
|---|---|---|
| dignity 抵触 critical | mock dignity signal | urgent layer 起動 + memory surface 縮退（§8.6.2） |
| rupture 検出 critical | mock rupture signal | urgent layer 起動 + memory surface 降格 |
| safety 違反 critical | mock safety signal | urgent layer 起動 + 全 chip 非表示（§8.6.3 禁止組み合わせ enforce） |
| 自動解除 | mock 5 分経過 | urgent layer 自動解除（§8.5.4） |
| 手動解除 | UrgentRelease tap | urgent layer 即解除 |
| cooldown 解除 | mock cooldown 完了 | urgent layer 解除 + 平常 memory surface 復帰 |
| urgent + S7 同居試行 | mock | **構造的に拒否**（§8.6.3） |
| トーン連続性 | urgent 起動 → 解除 | §8.6.4 アニメ連続性が裁定的にならない（CEO 短確認） |

**Gate**:
- [ ] 8 シナリオ全て動作
- [ ] §8.6.3 禁止組み合わせが UI 構造で enforce
- [ ] §8.5.5 / §8.6.4 非判定性継承が CEO 確認で合格

### 6.9 Phase L3-i — 拒否 3 分類 E2E

**正本**: UI spec §6.6 拒否 3 分類 / §6.7 再介入条件 / §6.8 非判定性

| シナリオ | 入力 | 期待挙動 |
|---|---|---|
| mode 昇格拒否 | 自動昇格 banner で拒否 | mode は通常維持、cooldown §6.7 |
| 個別提案拒否 | S7 提案を拒否 | 同種提案 cooldown 増加（§6.7） |
| coalter 後退要求 | RetreatRail で「介入そのものを止める」 | availability `enabled` → `disabled` 遷移 + 再有効化経路表示（§6.7） |
| 3 拒否の独立性 | 3 種を順番に試行 | 各拒否が**他の拒否 state を変更しない**（独立性 enforce） |
| 非判定性 | 各拒否後 visual 確認 | 「失敗」「悪い」表現がゼロ（§6.8 / CEO 確認） |
| 再介入条件サマリ | 各 cooldown 完了 | §6.7 表通りの解除条件で再介入可能 |

**Gate**:
- [ ] 6 シナリオ全て動作
- [ ] §6.6 3 分類の独立性が確認
- [ ] §6.8 非判定性が CEO 確認で合格

### 6.10 Phase L3-j — CEO 観測フェーズ

- [ ] CEO が preview で全シナリオ（通常 7 + Daily 4 + Travel 4 + mode 6 + memory 6 + urgent 8 + rejection 6 = **41 シナリオ**）を確認
- [ ] Pattern / state / mode / memory / urgent / 発話トーンが Core UX v1.1 / speech template / UI spec / runtime contract と整合
- [ ] **観測フェーズ終了** = CEO 承認で Stage 4 着手可

### 6.11 Stage 3 完了条件

- [ ] L3-a 〜 L3-j 全 Phase PASS
- [ ] preview で 41 シナリオ再現
- [ ] `tests/unit/coalter/presence/` 累積全 PASS
- [ ] ChatClient 非接触継続
- [ ] **3 Presence Mode + 共有メモリ + 緊急介入 + 拒否 3 分類が preview E2E で全て動く**
- [ ] CEO 観測フェーズ合格

---

## 7. Stage 4 — ChatClient 本実装（CEO 承認必須）

**目的**: 上部レイヤー UI を `ChatClient.tsx` に本番マウントし、legacy CoAlterCard 自動挿入を明示 handoff 経由に置換する。**CEO 別承認必須**（Core UX v1.1 §6.4 ⚠️ + 統合契約 §1.4）。

**前提**:
- Stage 3 観測フェーズ合格
- Stage 0.5 legacy 退役計画 doc（`coalter-legacy-cardplacement-retirement-plan.md`）確定
- mainstream plan E-3（三段式本番 flip）と**整合タイミング**（mainstream 先 or 同時、後 は避ける）
- **CEO 承認を受けて着手** — 本書は手順のみ、実行判断は CEO

### 7.1 Phase L4-a — 上部レイヤー本番マウント（flag OFF）

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/components/chat/ChatClient.tsx` | **修正** | 上部レイヤー component のマウントを追加。`presenceExecutorEnabled` flag OFF で**既存レイアウト完全不変**、ON で上部レイヤー表示（現段階では OFF のまま） |
| `app/components/chat/UpperLayerMount.tsx` | **新規** | 上部レイヤーの本番 entry point（Stage 1 preview component を本番用に移植） |
| `tests/unit/coalter/chatClientUpperLayerMount.test.ts` | **新規** | flag OFF で ChatClient の diff ゼロ（render snapshot 一致） |

**Gate**:
- [ ] flag OFF で既存 ChatClient render が 1 bit も変わらない（snapshot test）
- [ ] flag ON で上部レイヤーがマウントされる（E2E mock）
- [ ] `npm run build` 成功

**ロールバック**: `COALTER_PRESENCE_EXECUTOR=false`（既定）→ 即既存 UI に戻る。

### 7.2 Phase L4-b — signal adapter 本番接続

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/components/chat/ChatClient.tsx` | **修正** | 2 人のメインチャット発話 → signalAdapter 経由で presence reducer へ（flag ON 時のみ）。**メインチャット本文の UI には 1 bit も影響しない** |
| `tests/unit/coalter/chatClientSignalWiring.test.ts` | **新規** | flag OFF でメインチャット発話が presence reducer に届かない / flag ON で届く |

**Gate**:
- [ ] flag OFF で既存挙動不変
- [ ] flag ON で signal 5 分類が reducer に正しく伝播

### 7.3 Phase L4-c — legacy CoAlterCard 退役

**正本**: 統合契約 §1.4 / 退役計画 doc（`coalter-legacy-cardplacement-retirement-plan.md`）

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/flags.ts` | **修正** | `legacyCardAutoInsertEnabled` 新設（既定 **ON**、env `COALTER_LEGACY_CARD_AUTO_INSERT`）。移行期は ON、flip で OFF |
| `app/components/chat/ChatClient.tsx` | **修正** | `ChatClient.tsx:1898-1908` 付近の CoAlterCard 自動挿入を `legacyCardAutoInsertEnabled` OFF 時にスキップ。同時に **明示 handoff UI**（「チャットに共有」button + tap で 1 回きり broadcast）を追加 |
| `app/components/chat/HandoffButton.tsx` | **新規** | UI spec §4.3.8 / §2.7 の明示 handoff button |
| `tests/unit/coalter/legacyCardAutoInsertFlag.test.ts` | **新規** | flag ON で legacy 自動挿入 / flag OFF で handoff button のみ |
| `tests/unit/coalter/handoffButton.test.ts` | **新規** | 明示 tap → 1 回きり broadcast / 自動 broadcast しない（統合契約 §1.6-3） |

**Gate**:
- [ ] flag ON で legacy 自動挿入維持（移行期）
- [ ] flag OFF で自動挿入なし、明示 handoff button 表示
- [ ] 二重表示禁止（統合契約 §1.6-4）：対話面 S5 発話と handoff 送信メッセージが自動コピーされない

### 7.4 Phase L4-d — 同意フロー UI / 再有効化経路

**正本**: master §5 / 統合契約 §2.1-2.4（availability 遷移）

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/components/chat/CoAlterConsentFlow.tsx` | **新規** | pending_consent UI（相手への同意要求 + 自分の同意入力） |
| `app/components/chat/CoAlterDisabledUi.tsx` | **新規** | disabled 状態の UI（「CoAlter は OFF」表示 + 再有効化動線） |
| `app/components/chat/CoAlterReactivationFlow.tsx` | **新規** | `disabled → pending_consent → enabled` 経路の UI（master §5 rev 1 整合） |
| `tests/unit/coalter/consentFlow.test.ts` | **新規** | 72h 無応答 → inactive 復帰 |
| `tests/unit/coalter/reactivationFlow.test.ts` | **新規** | disabled → pending_consent → enabled の 2 step 遷移 |

**Gate**:
- [ ] pending_consent UI が表示 / 拒否 / 無応答タイムアウトを全てカバー
- [ ] `disabled → enabled` 直接遷移が UI 上存在しない

### 7.5 Phase L4-e — shared state 同期実装（CEO 承認必須）

**CEO 判断ポイント**: Supabase Realtime / WebSocket / polling のいずれを採用するか。本書では後者の選択肢のみ提示し、実装前に CEO 承認。

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/syncAdapter.ts` | **実装追加** | 採用した同期媒体の実装（Supabase Realtime が第一候補、既存 talk_messages 同期インフラ流用可能） |
| `app/api/coalter/presence/**` | **新規 API（CEO 承認後）** | server 側 presence state 管理 API |
| migration file | **新規** | `coalter_presence_states` table（ペア単位、shared state 永続化） |
| `tests/integration/coalter/presenceSyncE2E.test.ts` | **新規** | 2 client E2E 同期 |

**Gate**:
- [ ] CEO が同期媒体を承認
- [ ] migration が Stargazer 方式（CEO 承認 + 未実行でも可）に従う
- [ ] E2E test で eventually consistent の挙動実測

### 7.6 Phase L4-f — モード切替 UI 本番マウント

**正本**: UI spec §6 / Core UX v1.1 §2

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/components/chat/ModeSwitcher.tsx` | **新規** | preview L1-g の component を本番化（手動切替 button） |
| `app/components/chat/AutoEscalationBanner.tsx` | **新規** | 自動昇格 banner（§6.4） |
| `app/components/chat/ModeReturnPrompt.tsx` | **新規** | 通常モード復帰 UI（§6.5） |
| `app/components/chat/RejectionFlows.tsx` | **新規** | 拒否 3 分類 UI（§6.6） |
| `app/components/chat/ChatClient.tsx` | **修正** | 上部レイヤー mount に modeSwitcher / banner / rejection を統合（flag ON 時のみ） |
| `tests/unit/coalter/chatClientModeSwitch.test.ts` | **新規** | flag OFF で diff ゼロ / flag ON でモード切替動作 / Daily ↔ Travel 直接遷移禁止 |

**Gate**:
- [ ] flag OFF で既存 ChatClient 不変
- [ ] flag ON で 3 mode 切替が本番 UI で動作
- [ ] 拒否 3 分類が独立 UI で動作

### 7.7 Phase L4-g — 共有メモリ surface 本番マウント

**正本**: UI spec §8.2-§8.4 / Core UX §10

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/components/chat/MemorySurface.tsx` | **新規** | preview L1-h の本番化 |
| `app/components/chat/MemoryAccessRail.tsx` | **新規** | アクセス導線（§8.2.2） |
| `app/components/chat/MemoryItemCard.tsx` | **新規** | 個別メモリ card（§8.3.2 視覚記号 + §8.3.3 ラベル階層） |
| `app/components/chat/VisibilityControls.tsx` | **新規** | 4 操作 UI（§8.4.1） |
| `app/components/chat/RetreatRail.tsx` | **新規** | 後退導線（§8.4.2） |
| `app/api/coalter/memory/**` | **新規 API** | server 側 memory CRUD API（CEO 承認後） |
| migration | **新規** | `coalter_memory_items` table（origin / certainty / visibility / mode_context 列含む） |
| `tests/integration/coalter/memorySurfaceE2E.test.ts` | **新規** | 2 client memory 同期 / 片側可視性 / 禁止組み合わせ rejected |

**Gate**:
- [ ] §8.3.4 禁止組み合わせが server 側でも enforce
- [ ] §8.4.4 片側可視性が server side で enforce
- [ ] memory CRUD E2E PASS
- [ ] CEO 承認済の場合のみ migration 実行（Stargazer 方式）

### 7.8 Phase L4-h — 緊急介入視覚層 本番マウント

**正本**: UI spec §8.5-§8.6 / runtime §1.5

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/components/chat/UrgentLayer.tsx` | **新規** | preview L1-i の本番化 |
| `app/components/chat/UrgentMessageCard.tsx` | **新規** | 緊急発話 card（§8.5.3 トーン） |
| `app/components/chat/UrgentRelease.tsx` | **新規** | 解除 UI（§8.5.4） |
| `app/components/chat/ChatClient.tsx` | **修正** | urgent layer を上部レイヤー最上位に mount（flag ON 時のみ）/ memory surface との優先順位 enforcer |
| `tests/integration/coalter/urgentLayerE2E.test.ts` | **新規** | critical signal 投入 → urgent 起動 / §8.6 優先順位 enforce |

**Gate**:
- [ ] critical signal 3 種で urgent 起動
- [ ] §8.6.3 禁止組み合わせが本番 UI で enforce
- [ ] §8.6.4 トーン連続性 CEO 確認

### 7.9 Phase L4-i — speechBuilder LLM 合成本番化

**正本**: speech template §3-§9 / Stage 2 L2-m interface

**目的**: Stage 2 で interface のみだった speechBuilder の **LLM 合成実装** を本番化する。

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/speechBuilder.ts` | **修正（実装追加）** | LLM 合成実装（speech template §3-§9 を prompt として注入、Pattern variant 別の文長 override 適用） |
| `lib/coalter/presence/speechPromptBuilder.ts` | **新規** | speech template §3-§9 → LLM prompt 構築。§1.2.1 6 項目 + §2 共通禁止表現を必ず prompt に含める |
| `lib/coalter/presence/speechPostValidator.ts` | **新規** | LLM 出力に対する事後 validator（§2 禁止語彙静的検査 + §1.2.1 6 項目 checker）。違反時は再生成 or fallback |
| `lib/coalter/flags.ts` | **修正** | `presenceSpeechLLMEnabled` 新設（既定 OFF、env `COALTER_PRESENCE_SPEECH_LLM`）。Stage 4 中盤で ON flip |
| `tests/unit/coalter/presence/speechBuilder.test.ts` | **新規** | LLM mock で 7 Pattern × 9 state × 3 mode = 189 ケース / 禁止表現 reject / 文長 override 遵守 |
| `tests/unit/coalter/presence/speechPostValidator.test.ts` | **新規** | §2 違反検出 / §1.2.1 6 項目検出 / fallback 経路 |

**Gate**:
- [ ] flag OFF で speechBuilder は静的 mock 文面（Stage 1 の挙動維持）
- [ ] flag ON で LLM 合成 + 事後 validator が動作
- [ ] §2 / §1.2.1 違反が**ゼロ**（ランダム 100 ケース sampling）
- [ ] mainstream Bug-1 lexeme 正本との dual source 禁止

### 7.10 Phase L4-j — telemetry / 計測実装

**正本**: 本書 §0.1（telemetry / 観測計測項目一覧）

| ファイル | 種別 | 変更 |
|---|---|---|
| `lib/coalter/presence/telemetry.ts` | **新規** | 計測 emitter。8 項目: ① Presence state 遷移率 / ② Pattern 使用分布 / ③ 同意・再有効化率 / ④ legacy fallback 率 / ⑤ mode 昇格・降格率 / ⑥ 拒否分類別件数 / ⑦ 緊急介入発火率 / ⑧ 連投抑制発火率 |
| `lib/coalter/presence/telemetryEvents.ts` | **新規** | event 型定義（PostHog or 自前 analytics への送信 entry point） |
| `app/api/coalter/presence/telemetry/route.ts` | **新規 API** | server 側計測収集 endpoint |
| `tests/unit/coalter/presence/telemetry.test.ts` | **新規** | 8 項目すべての emit / fail-open / payload schema |

**Gate**:
- [ ] 8 項目すべてが presence state 動作中に emit される
- [ ] 計測失敗で本体 UI が止まらない（fail-open）
- [ ] payload schema が固定（後方互換維持）

### 7.11 Phase L4-k — a11y / loading / error / empty state

**正本**: UI spec §1（UI 全体原則）/ §5 各 S レイアウト

**目的**: 各 S × mode（27 セル）における 4 補助状態（loading / error / empty / a11y focus）の UI を本番化。

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/components/chat/states/StateLoadingFallback.tsx` | **新規** | 各 S の loading 状態（v1.1 §1.5 アニメカテゴリ準拠） |
| `app/components/chat/states/StateErrorFallback.tsx` | **新規** | 各 S の error 状態（fail-open、§6.8 非判定性継承） |
| `app/components/chat/states/StateEmptyFallback.tsx` | **新規** | 各 S の empty 状態（観測なし時の minimal 表示） |
| `app/components/chat/states/StateAriaWrapper.tsx` | **新規** | a11y 属性 wrapper（aria-live / aria-label / role= など） |
| `tests/unit/coalter/chatClientFallbacks.test.ts` | **新規** | 各 S × mode の 4 補助状態が rendering / a11y axe-core 静的検査 PASS |
| `tests/integration/coalter/a11yE2E.test.ts` | **新規** | スクリーンリーダー mock で urgent layer の announcement 動作 |

**Gate**:
- [ ] 27 セル × 4 補助状態 = 108 ケースが全て rendering
- [ ] axe-core 静的検査 PASS
- [ ] urgent layer の aria-live="assertive" が機能

### 7.12 Phase L4-l — 本番 flip（flag ON、CEO 審議）

**最終段階**:

1. preview / staging で full E2E 観測（1 週間以上、L4-f / g / h / i / j / k 全反映）
2. CEO 審議: mainstream E-3（三段式 flip）との整合、legacy 退役審議
3. CEO 承認で flag flip:
   - `COALTER_PRESENCE_EXECUTOR=true`
   - `COALTER_LEGACY_CARD_AUTO_INSERT=false`
   - `COALTER_PRESENCE_SPEECH_LLM=true`（speechBuilder LLM 合成）
4. `docs/decision-log.md` に記録

**ロールバック**: 3 flag を元に戻す → 即既存 UI / legacy 自動挿入 / 静的 speech に復帰。

### 7.13 Phase L4-m — legacy code 削除（1 rev 後 CEO 審議）

**前提**: L4-l flip 後 1 rev（推奨: 2 週間以上）観測して問題ゼロ

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/components/chat/ChatClient.tsx` | **修正** | legacy CoAlterCard 自動挿入コード（`:1898-1908` 付近）を削除 |
| `lib/coalter/flags.ts` | **修正** | `legacyCardAutoInsertEnabled` flag 削除 |
| 関連テスト | 削除 or 更新 | |

**Gate**:
- [ ] CEO 審議承認
- [ ] 削除後も `tests/` 全 PASS
- [ ] `docs/coalter-legacy-cardplacement-retirement-plan.md` を「完了」で close

### 7.14 Stage 4 完了条件

- [ ] L4-a 〜 L4-m 全 Phase PASS
- [ ] `COALTER_PRESENCE_EXECUTOR=true` 本番稼働
- [ ] `COALTER_LEGACY_CARD_AUTO_INSERT=false` 本番稼働
- [ ] `COALTER_PRESENCE_SPEECH_LLM=true` 本番稼働
- [ ] 3 mode 本番 UI / 共有メモリ surface / 緊急介入視覚層 / speechBuilder LLM / telemetry 8 項目 / a11y 4 補助状態 が全て稼働
- [ ] legacy code 削除（L4-m 完了）
- [ ] 統合契約 §1.4 整合達成
- [ ] CEO 最終承認

---

## 8. Kill switch 地図（layout 系統）

| env key | flag | 既定 | ON 時の挙動 | 影響範囲 |
|---|---|---|---|---|
| **`COALTER_PRESENCE_EXECUTOR`** | `presenceExecutorEnabled` (L2-g 新設) | **OFF** | presence/ reducer + 上部レイヤー UI 起動 | Stage 2 以降 |
| **`COALTER_LEGACY_CARD_AUTO_INSERT`** | `legacyCardAutoInsertEnabled` (L4-c 新設) | **ON（移行期）** | legacy CoAlterCard 自動挿入維持 | Stage 4 未満で ON、flip で OFF |
| **`COALTER_PRESENCE_SPEECH_LLM`** | `presenceSpeechLLMEnabled` (L4-i 新設) | **OFF** | speechBuilder の LLM 合成本番化 | Stage 4 中盤以降 |

**原則**:
- Stage 2-3 では `COALTER_PRESENCE_EXECUTOR=false` が既定（preview は dev flag で局所 ON）
- Stage 4 本番 flip までは 3 flag の本番値を変更しない
- 全 flag OFF で Stage 1 前の CoAlter 挙動が 1 bit も変わらない（handoff §3 継続）

---

## 9. Commit 粒度と branch 戦略

### 9.1 Commit 粒度（Stage 別）

| Stage | Phase 数 | Commit 数 | 粒度原則 |
|---|---|---|---|
| Stage 0.5 | L0-a **着地済** / L0-b | 1 commit（L0-b のみ） | L0-a は `a98114c4` で着地済 / L0-b 新規 doc 1 |
| Stage 1 | L1-a 〜 k（11 Phase） | 11 commit | 基盤 / S0-S8 / Pattern / matrix / Daily / Travel / モード切替 / 共有メモリ / 緊急介入 / UI 基礎 / レビュー |
| Stage 2 | L2-a 〜 m（13 Phase） | 13 commit | 型 / signal / reducer / pattern selector / availability / shared state / flag / modeReducer / 共有メモリ store / 拒否 3 分類 / 緊急介入 trigger / 連投抑制 / speechBuilder interface |
| Stage 3 | L3-a 〜 j（10 Phase） | 10 commit | ハーネス / 通常 E2E / 同期 mock / Daily E2E / Travel E2E / mode E2E / 共有メモリ E2E / 緊急介入 E2E / 拒否 E2E / レビュー |
| Stage 4 | L4-a 〜 m（13 Phase） | 13 commit | マウント / signal / legacy 置換 / 同意 / 同期 / mode UI / 共有メモリ UI / 緊急介入 UI / speechBuilder LLM / telemetry / a11y / flip / 削除 |

**合計**: 約 48 commit（layout 系統、L0-a 着地済み分を除く）

### 9.2 Branch 戦略

- Stage 0.5 〜 3: `feat/coalter-three-stage` で進行可（既存 branch 活用）
- Stage 4: 別 branch `feat/coalter-upperlayer-prod` 推奨（CEO 承認まで isolation）
- Stage 4 完了後 merge to main（CEO 承認 + PR review 必須）

---

## 10. 全体 Gate / 完了条件

### 10.1 Stage 別完了判定

| Stage | 完了条件 |
|---|---|
| Stage 0.5 | §3.5（§6 追記 + 退役計画 doc） |
| Stage 1 | §4.12（preview 静的全要素、CEO visual レビュー）|
| Stage 2 | §5.14（executor 骨格 + 3 mode + 共有メモリ + 拒否 + 緊急介入 + 連投抑制 + speech interface、CEO 観測フェーズ合意）|
| Stage 3 | §6.11（preview E2E 41 シナリオ、CEO 観測フェーズ合格）|
| Stage 4 | §7.14（本番 flip + speechBuilder LLM + telemetry + a11y + legacy 削除、CEO 最終承認）|

### 10.2 レイアウト系統 全完了

- Stage 0.5 〜 4 全完了
- `COALTER_PRESENCE_EXECUTOR=true` / `COALTER_LEGACY_CARD_AUTO_INSERT=false` / `COALTER_PRESENCE_SPEECH_LLM=true` 本番稼働
- 3 Presence Mode（通常 / Daily / Travel）本番稼働
- 共有メモリ surface（3 軸: 由来×確定度×可視性）本番稼働
- 緊急介入視覚層 本番稼働
- 拒否 3 分類 本番稼働
- 連投抑制 構造的担保 本番稼働
- speechBuilder LLM 合成 本番稼働
- telemetry 8 項目 計測稼働
- a11y / loading / error / empty 4 補助状態 全 27 セル稼働
- 統合契約 4 契約点 / runtime 3 論点 / Core UX v1.1 不可侵項 全て遵守実測
- mainstream plan の E-3（三段式本番 flip）と整合完了
- legacy CoAlterCard 自動挿入コード削除

---

## 11. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| Stage 1 preview が UI spec §5 ASCII と乖離 | Stage 2 contract が不正確になる | L1-e CEO visual レビューで matrix / ASCII 目視確認 |
| Stage 2 reducer が許可遷移 matrix と乖離 | Stage 3 E2E で想定外遷移 | L2-c reducer.test で 9×9 + 例外ルート網羅 |
| Pattern selector が禁止発話を出す | §11 禁止事項違反 | L2-d patternCompositionRules.test + L3-b 目視レビュー + speech template §2 禁止語彙静的検査 |
| executor availability と Presence が 1:1 mapping される | 統合契約 ② 違反 | L2-e availability test で `enabled` = S0 常駐のみの直交性を構造 test |
| Stage 1 Understand と S4 が event bus 混線 | 統合契約 ③ 違反 | L2-b signalAdapter.ts に executor event 直接購読を構造的に禁止 |
| Stage 4 で legacy CoAlterCard との二重表示 | 統合契約 ①-4 違反 | L4-c で flag OFF 時に自動挿入を完全スキップ / 手動 handoff は 1 回きり |
| shared state 同期が CEO 未承認で先走る | 本番影響 | L2-f は interface のみ、実装は L4-e で CEO 承認後 |
| mainstream E-3 より先に Stage 4 flip | 三段式が上部レイヤー無しで稼働 | Stage 4 着手前に mainstream E-3 と整合タイミング判定を CEO 審議 |
| State Safety 違反（stash / reset --hard） | 変更消失 | §0.3 機械的遵守 / Hook でブロック / 3 ファイル毎 WIP commit |

---

## 12. 本書の触らない境界線（再掲）

| 領域 | 正本 | 不可侵理由 |
|---|---|---|
| Core UX v1.1 §15.2 不可侵項（§1/§2.3-2.4/§3.1-3.3/§8.1/§11） | `coalter-core-ux-layered-presence.md` | 存在論固定 |
| Phase 2 3-mode body（decision/negotiate/clarify） | `coalter-phase2-3mode-design.md`（凍結） | 2026-04-19 CEO 6.D 合格、Presence と直交 |
| Phase 2 凍結 6 項目 | handoff §4.1 | 不可侵 |
| Bug-1 / Bug-2 / 三段式本流 | mainstream plan に委譲 | 本書スコープ外 |
| 統合契約 4 契約点不可侵条文 | integration §1.6 / §2.6 / §3.6 / §4.5 | rev 追記禁止 |
| Runtime 契約 3 論点不可侵条文 | runtime §1.7 / §2.9 / §3.7 | rev 追記禁止 |
| speech template §2 禁止表現 | speech template | トーン正本 |
| UI spec §4 状態×モード matrix / §7.12 Pattern→State 許可 matrix | UI spec | 許可 matrix 正本 |

---

## 13. 着手順序（新セッション即時開始版）

新セッションはこの順序で進める:

1. **Day 0**: Stage 0.5 Phase L0-a は**着地済**（commit `a98114c4` 確認のみ）/ L0-b（退役計画 doc 起草）のみ着手 → CEO 短確認
2. **Day 1-7**: Stage 1 L1-a 〜 k（preview 静的試作 11 Phase: 基盤 / S0-S8 / Pattern / matrix / Daily / Travel / モード切替 / 共有メモリ / 緊急介入 / UI 基礎 / CEO レビュー）
3. **Day 7-14**: Stage 2 L2-a 〜 m（executor 骨格 13 Phase: 型 / signal / reducer / patternSelector / availability / shared state / flag / modeReducer / memoryStore / rejectionReducer / urgentTrigger / rateLimitGuard / speechBuilder interface）
4. **Day 14-21**: Stage 3 L3-a 〜 j（preview E2E 10 Phase: ハーネス / 通常 E2E / 同期 mock / Daily E2E / Travel E2E / mode E2E / memory E2E / urgent E2E / rejection E2E / CEO 観測）
5. **Day 21+**: Stage 4 着手判断（mainstream E-3 整合 + CEO 別承認）
6. **Day 21-35 (CEO 承認後)**: Stage 4 L4-a 〜 l（本番 flip 12 Phase: マウント / signal / legacy 置換 / 同意 / 同期 / mode UI / memory UI / urgent UI / speechBuilder LLM / telemetry / a11y / 本番 flip）
7. **Day 35 + 2 週間観測**: Stage 4 L4-m（legacy code 削除、CEO 別承認）

**マイルストーン**:
- Milestone L-0.5: Stage 0.5 完了（statutory refs 追記 + 退役計画 doc）
- Milestone L-1: Stage 1 完了（preview 静的試作 全要素）
- Milestone L-2: Stage 2 完了（executor 骨格 + 3 mode + memory + rejection + urgent + rateLimit + speech interface）
- Milestone L-3: Stage 3 完了（preview E2E 41 シナリオ）
- Milestone L-4l: Stage 4 本番 flip（3 mode + memory + urgent + speechBuilder LLM + telemetry + a11y）
- Milestone L-4m: legacy 削除完了

---

## 14. mainstream plan との合流点

| 合流ポイント | 説明 |
|---|---|
| **Stage 0.5 L0-a と mainstream Step A 後** | handoff §3 正本一覧に integration / runtime 契約を追加する追記は両 plan で整合 |
| **Stage 2 L2-e availability と mainstream D-1 understanding** | Presence availability と understanding の event bus 分離を両 plan で遵守（統合契約 §3 / runtime §1.3）|
| **Stage 4 着手判定と mainstream E-3 本番 flip** | 両 flip の整合タイミングを CEO が判定（同時 or mainstream 先が推奨、layout 先は避ける）|
| **Stage 4 L4-c legacy 退役と mainstream D-3 三段式** | 三段式本稼働 + legacy 退役後に旧実装（`webConnector.parseMovieScreenings` 等）の削除 CEO 審議 |

---

## 15. 改訂履歴

| 日付 | 版 | 変更内容 | 承認 |
|---|---|---|---|
| 2026-04-24 | v0.1 DRAFT | 初稿起草。Stage 0.5 / 1 / 2 / 3 / 4 の Phase 分解、commit 粒度、変更ファイル、型定義、テスト、gate、ロールバック、kill switch 地図、mainstream との合流点を網羅 | CEO 承認待ち |
| 2026-04-27 | v0.2 DRAFT | CEO 指示により Daily/Travel UI（L1-e/f）/ モード切替・昇格降格（L1-g, L2-h, L3-f, L4-f）/ 共有メモリ surface（L1-h, L2-i, L3-g, L4-g）/ 緊急介入視覚層（L1-i, L2-k, L3-h, L4-h）/ UI 基礎要素（L1-j）/ 拒否 3 分類（L2-j, L3-i）/ 連投抑制（L2-l）/ speechBuilder LLM（L2-m, L4-i）/ telemetry（L4-j）/ a11y（L4-k）を全面追加。22 新 Phase、commit 数 24 → 48、§0.1 範囲拡張、§1.1 ロードマップ全段拡張、§8 kill switch 3 件化、§13 着手順序更新 | CEO 承認待ち |

---

**🎯 結論（v0.2 DRAFT）**: 本書は Core UX v1.1 / UI spec / speech template / 統合契約 / runtime 契約 を**統合した実装手順書**。既存正本 doc を**新規解釈せず**、Stage 0.5 → 1 → 2 → 3 → 4 の順序と commit 粒度で実装を進める。新セッションは本書冒頭から順に commit を重ねれば、上部レイヤー本番実装（**3 Presence Mode + 共有メモリ surface + 緊急介入視覚層 + 拒否 3 分類 + 連投抑制 + speechBuilder LLM + telemetry + a11y**）と legacy 退役が論理的に達成される。本流修正系統（Bug-1/2/三段式）は `docs/coalter-implementation-plan-mainstream.md` に委譲。両 plan の合流点は §14 で明示。
