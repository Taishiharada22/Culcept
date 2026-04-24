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
- S0-S8 Presence 状態機械（reducer / state machine）
- Pattern variant（A / B / C / D / E / F-1 / F-2）の文面合成・許可 matrix
- 共有メモリ surface / 介入 UI
- executor availability（`inactive` / `pending_consent` / `enabled` / `active` / `disabled`）との直交
- legacy CoAlterCard の明示 handoff 経由への置換

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
│  CEO 承認: 着手時の短確認 + preview 完成時の visual レビュー       │
│  境界: ChatClient / lib/coalter に 1 bit も影響しない              │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 2 — 通常 executor 骨格                                      │
│  配置: lib/coalter/presence/** 新規（既存 coalterDispatch 非接触） │
│  内容: S0-S8 reducer / signal adapter / Pattern variant type /    │
│       Pattern→State 許可 matrix / executor availability 直交      │
│  CEO 承認: 骨格 landing 後に観測フェーズ合意                       │
│  境界: Action Mode / CoAlterCard / 既存 coalterDispatch 非接触    │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Stage 3 — preview E2E                                             │
│  配置: app/(dev)/coalter-preview/full/** + Stage 2 executor 結合  │
│  内容: 通常モード 1 サイクル S0→S1→S2→...→S8 の preview 内完結動作│
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
│       同意フロー UI / 再有効化経路                                 │
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

### 4.5 Phase L1-e — CEO visual レビュー

- [ ] CEO が preview を開き、v1.1 §3.1 ASCII / UI spec §5 / §7 / §4 との整合を目視確認
- [ ] CEO 承認で Stage 1 完了

### 4.6 Stage 1 完了状態

- `app/(dev)/coalter-preview/upper-layer/**` に静的 preview が存在
- S0-S8 / Pattern A-F2 / 状態×モード matrix の全要素が視覚化
- 本番 ChatClient / lib/coalter に影響ゼロ
- Stage 2 で「Pattern の何を出力するか」「S の何を表示するか」の contract を reducer に持たせる準備完了

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

### 5.8 Stage 2 完了条件

- [ ] L2-a 〜 L2-g 全 Phase PASS
- [ ] `tests/unit/coalter/presence/` 全 PASS
- [ ] `tests/unit/coalter/` 累積全 PASS（既存テスト回帰ゼロ）
- [ ] `npx tsc --noEmit` エラー 0
- [ ] 既存 `coalterDispatch.ts` / `coalterOrchestrator.ts` / CoAlterCard / 他 `lib/coalter/**` に diff ゼロ
- [ ] `npm run build` 成功
- [ ] CEO が骨格 landing 後の観測フェーズ合意

**ロールバック**: Phase 単位 revert（L2-g → f → e → d → c → b → a）。新規サブディレクトリのみなので影響局所。

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

### 6.4 Phase L3-d — CEO 観測フェーズ

- [ ] CEO が preview で 7 シナリオを全て確認
- [ ] Pattern / state / 発話トーンが Core UX v1.1 / speech template / UI spec と整合
- [ ] **観測フェーズ終了** = CEO 承認で Stage 4 着手可

### 6.5 Stage 3 完了条件

- [ ] L3-a 〜 L3-d 全 Phase PASS
- [ ] preview で 7 シナリオ再現
- [ ] `tests/unit/coalter/presence/` 累積全 PASS
- [ ] ChatClient 非接触継続
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

### 7.6 Phase L4-f — 本番 flip（flag ON、CEO 審議）

**最終段階**:

1. preview / staging で full E2E 観測（1 週間以上）
2. CEO 審議: mainstream E-3（三段式 flip）との整合、legacy 退役審議
3. CEO 承認で `COALTER_PRESENCE_EXECUTOR=true` + `COALTER_LEGACY_CARD_AUTO_INSERT=false` を本番反映
4. `docs/decision-log.md` に記録

**ロールバック**: 両 flag を元に戻す → 即既存 UI / legacy 自動挿入に復帰。

### 7.7 Phase L4-g — legacy code 削除（1 rev 後 CEO 審議）

**前提**: L4-f flip 後 1 rev（推奨: 2 週間以上）観測して問題ゼロ

| ファイル | 種別 | 変更 |
|---|---|---|
| `app/components/chat/ChatClient.tsx` | **修正** | legacy CoAlterCard 自動挿入コード（`:1898-1908` 付近）を削除 |
| `lib/coalter/flags.ts` | **修正** | `legacyCardAutoInsertEnabled` flag 削除 |
| 関連テスト | 削除 or 更新 | |

**Gate**:
- [ ] CEO 審議承認
- [ ] 削除後も `tests/` 全 PASS
- [ ] `docs/coalter-legacy-cardplacement-retirement-plan.md` を「完了」で close

### 7.8 Stage 4 完了条件

- [ ] L4-a 〜 L4-g 全 Phase PASS
- [ ] `COALTER_PRESENCE_EXECUTOR=true` 本番稼働
- [ ] `COALTER_LEGACY_CARD_AUTO_INSERT=false` 本番稼働
- [ ] legacy code 削除（L4-g 完了）
- [ ] 統合契約 §1.4 整合達成
- [ ] CEO 最終承認

---

## 8. Kill switch 地図（layout 系統）

| env key | flag | 既定 | ON 時の挙動 | 影響範囲 |
|---|---|---|---|---|
| **`COALTER_PRESENCE_EXECUTOR`** | `presenceExecutorEnabled` (L2-g 新設) | **OFF** | presence/ reducer + 上部レイヤー UI 起動 | Stage 2 以降 |
| **`COALTER_LEGACY_CARD_AUTO_INSERT`** | `legacyCardAutoInsertEnabled` (L4-c 新設) | **ON（移行期）** | legacy CoAlterCard 自動挿入維持 | Stage 4 未満で ON、flip で OFF |

**原則**:
- Stage 2-3 では `COALTER_PRESENCE_EXECUTOR=false` が既定（preview は dev flag で局所 ON）
- Stage 4 本番 flip までは両 flag の本番値を変更しない
- 全 flag OFF で Stage 1 前の CoAlter 挙動が 1 bit も変わらない（handoff §3 継続）

---

## 9. Commit 粒度と branch 戦略

### 9.1 Commit 粒度（Stage 別）

| Stage | Phase 数 | Commit 数 | 粒度原則 |
|---|---|---|---|
| Stage 0.5 | L0-a **着地済** / L0-b | 1 commit（L0-b のみ） | L0-a は `a98114c4` で着地済 / L0-b 新規 doc 1 |
| Stage 1 | L1-a 〜 e | 5 commit | 基盤 / 状態 / Pattern / matrix / レビュー |
| Stage 2 | L2-a 〜 g | 7 commit | 型 / signal / reducer / pattern selector / availability / shared state / flag |
| Stage 3 | L3-a 〜 d | 4 commit | ハーネス / E2E / 同期 mock / レビュー |
| Stage 4 | L4-a 〜 g | 7 commit | マウント / signal / legacy 置換 / 同意 / 同期 / flip / 削除 |

**合計**: 約 24 commit（layout 系統、L0-a 着地済み分を除く）

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
| Stage 1 | §4.6（preview 静的、CEO visual レビュー）|
| Stage 2 | §5.8（executor 骨格、CEO 観測フェーズ合意）|
| Stage 3 | §6.5（preview E2E、CEO 観測フェーズ合格）|
| Stage 4 | §7.8（本番 flip + legacy 削除、CEO 最終承認）|

### 10.2 レイアウト系統 全完了

- Stage 0.5 〜 4 全完了
- `COALTER_PRESENCE_EXECUTOR=true` / `COALTER_LEGACY_CARD_AUTO_INSERT=false` 本番稼働
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
2. **Day 1-3**: Stage 1 L1-a 〜 e（preview 静的試作）→ CEO visual レビュー
3. **Day 3-6**: Stage 2 L2-a 〜 g（executor 骨格）→ CEO 観測フェーズ合意
4. **Day 6-9**: Stage 3 L3-a 〜 d（preview E2E）→ CEO 観測フェーズ合格
5. **Day 9+**: Stage 4 着手判断（mainstream E-3 整合 + CEO 別承認）
6. **Day 9-12 (CEO 承認後)**: Stage 4 L4-a 〜 f（本番 flip）
7. **Day 12 + 2 週間観測**: Stage 4 L4-g（legacy code 削除、CEO 別承認）

**マイルストーン**:
- Milestone L-0.5: Stage 0.5 完了（statutory refs 追記 + 退役計画 doc）
- Milestone L-1: Stage 1 完了（preview 静的試作）
- Milestone L-2: Stage 2 完了（executor 骨格）
- Milestone L-3: Stage 3 完了（preview E2E）
- Milestone L-4a: Stage 4 本番 flip
- Milestone L-4g: legacy 削除完了

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

---

**🎯 結論（v0.1 DRAFT）**: 本書は Core UX v1.1 / UI spec / speech template / 統合契約 / runtime 契約 を**統合した実装手順書**。既存正本 doc を**新規解釈せず**、Stage 0.5 → 1 → 2 → 3 → 4 の順序と commit 粒度で実装を進める。新セッションは本書冒頭から順に commit を重ねれば、上部レイヤー本番実装と legacy 退役が論理的に達成される。本流修正系統（Bug-1/2/三段式）は `docs/coalter-implementation-plan-mainstream.md` に委譲。両 plan の合流点は §14 で明示。
