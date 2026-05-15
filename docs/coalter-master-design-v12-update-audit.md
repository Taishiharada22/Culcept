# CoAlter Master Design v1.2 Update **Necessity** Audit

**作成日**: 2026-05-15
**ステータス**: docs-only audit、runtime / code 変更なし、**Master Design 本体は更新しない**
**起草 branch**: `docs/coalter-pre-impl-readiness-batch` (Batch-B の 3/3)

## §0 本書の position

### §0.1 目的

Master Design v1.1 (2026-04-15) 以降、PR #120-#127 で多数の design 追加・整理が行われた。**v1.2 update が必要か / どの section を update すべきか / どの PR 群を反映すべきか / 本体更新を別 PR にするかどうか** を **necessity audit** として整理する。

**極めて重要な scope 制約 (CEO 2026-05-15 補正)**:
- 本 audit は **「v1.2 update 必要性 audit のみ」**、Master Design 本体は **1 bit も touch しない**
- Master Design 本体更新は、必要性が確定した後の **別 PR**
- 本 audit は **decision-ready material** であり、CEO の最終 v1.2 update 採用判断ではない

**audit completion ≠ decision completion ≠ implementation completion** (CEO 2026-05-15 補正、PR #127 §0 継承):
- 本 audit は claude 整理結果、Master Design v1.2 update を確定したものではない
- 「反映すべき」「優先度高」等は claude 側の判断材料提示

### §0.2 Source-of-truth Hierarchy

- **Tier 1**: `docs/coalter-master-design.md` v1.1 (2026-04-15、CEO 承認) — 本書の base reference
- **Tier 1**: PR #120 (`0d925e0c`、2026-05-15) + PR #121 (`df00a8f3`) + PR #122 (`a9f27d44`) + PR #123 (`78cf93b6`) + PR #124 (`fa8f301b`) + PR #125 (`3de29349`) + PR #126 (`27b6102d`) + PR #127 (`31f0c7f4`) 全 main 反映済
- **Tier 2**: B-2 audit (本 Batch-B 1/3、Cross-PR Flag Consolidation)
- **Tier 2**: B-3 audit (本 Batch-B 2/3、Step E pre-checklist)

### §0.3 制約 (極めて重要)

- ❌ **Master Design 本体 (`docs/coalter-master-design.md`) を 1 bit も touch しない**
- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ env / production 変更 / Step E 開始 / bug1 cleanup / Stargazer pivot
- ✅ docs-only audit material 整理 (necessity 判定のみ)

---

## §1 Master Design v1.1 既存 structure (claude grep 結果)

### §1.1 v1.1 主要 section (一次資料)

`docs/coalter-master-design.md` v1.1 (2026-04-15、CEO 承認):

| § | section | 主要内容 |
|---|---|---|
| §1 | 定義と位置づけ | CoAlter / 3 並立 Alter / **対象領域 5 種** (映画 / 食事 / 旅行 / 予定調整 / プレゼント) |
| §2 | 設計原則 7 (学術的根拠付き) | 翻訳者 / パイ拡大 / Sequential Fairness / 個別チャネル / 退出シグナル / 意図的曖昧性 / 反武器化 |
| §3 | 5 層アーキテクチャ | Layer 1 (個人理解) - Layer 2 (関係理解) - Layer 3 (現在会話理解) - Layer 4 (外部世界接続) - Layer 5 (提案生成) |
| §4 | 推薦アルゴリズム | Least Misery + 関係性加重 / 新規性 vs 親しみ / 候補数制約 |
| §5 | 起動・介入モデル | 状態遷移図 / Phase 1 トリガー / 起動フロー / **4 mode (decision/negotiate/clarify/reflect)** / Ambiguity Engine |
| §6 | 安全設計 | 介入拒否 / データプライバシー / Therapy 境界 |
| §7 | 日本文化への適応 | 甘え / 空気を読む / 建前と本音 / 季節 |
| §8 | 既存資産の活用マップ | 転用する / しない |
| §9 | MVP スコープ | **Phase 1 (Talk 限定) / Phase 1.5 (HotPepper) / Phase 2 (negotiate/clarify) / Phase 3 (reflect + Rendezvous) / Phase 4 (関係性インテリジェンス)** |
| §10 | 技術構成 | 新規ファイル / 既存ファイル修正 |
| §11 | 学術的情報ソース | — |

### §1.2 v1.1 で **暗黙のまま** だった重要 design 要素

claude grep で確認:

| 要素 | v1.1 での扱い | PR #120-#127 での明示 |
|---|---|---|
| **PresenceMode** (normal/daily/travel) | §5 で 4 mode に言及するが PresenceMode 軸として明示なし | PR #122 §1 で 3-Axes Orthogonal 確立 |
| **3-Axes Orthogonal** (Action × Presence × Domain) | 暗黙 | PR #122 §1 で明示 |
| **Stage 4 Layout 系統** (UpperLayer / Pattern / Presence) | §3 Layer 5 で言及するが detail なし | PR #95 (L4-l flip 2026-05-10) で実装 + handoff §1.1 で確認 |
| **三段式 (Stage 1 Understand / Stage 2 Curate / Stage 3 Resolve)** | §9 Phase 1 で言及 | PR #102 (D-1 〜 D-2-e2) で structural scaffold 完了 |
| **Provider Foundation** | v1.1 時点では未着想 | PR #110-#119 で provider-agnostic implementation 確立 |
| **Gap 4 (production-side context flag detection)** | v1.1 時点では発見されていない | PR #123 で発見 + 設計確定 |
| **Travel 1-2 泊国内 MVP** | §1 対象領域に「旅行」とのみ記載 | PR #124 で MVP scope 確定 (1-2 泊国内) |
| **Activity 7 軸 Taxonomy** | §1 対象領域に活動なし | PR #126 で 7 軸 taxonomy 整理 |
| **mode enum 共通設計** | v1.1 時点では未着想 | B-2 audit (本 Batch-B 1/3) で 5 enum 統合整理 |

→ **v1.1 から 1 ヶ月で多数の design 追加**、特に PR #122 / #123 / #124 / #125 / #126 / B-2 / B-3 で **architecture-level 追加** あり。

---

## §2 PR #120-#127 mapping (v1.2 section 候補)

### §2.1 各 PR と v1.1 section の対応 (claude 整理結果)

| PR | 主要内容 | v1.2 反映候補 section | 優先度 |
|---|---|---|---|
| **PR #120** (audit v2) | 元計画 completion audit、Source-of-truth hierarchy 確立 | §0 (新規、本書全体への前提) | 中 (記録的) |
| **PR #121** (decision doc) | runtime integration priority decision | §9 MVP scope (Phase 1 完了状態) | 中 (記録的) |
| **PR #122** (normal/daily/travel audit) | **3-Axes Orthogonal architecture 確立**、PresenceMode 明示化 | **§3 5 層 + §5 起動・介入** (architecture core update) | **高** |
| **PR #123** (Gap 4 design) | **production-side context flag detection** 設計 | **§3 Layer 5 (UpperLayer / Pattern variant)** | **高** |
| **PR #124** (Travel design) | **1-2 泊国内 MVP scope 確定**、Travel-β + Itinerary Graph | **§1 対象領域 (旅行 詳細化) + §9 MVP scope** | **高** |
| **PR #125** (Daily Dispatch) | **PresenceMode × Domain cross-axis dispatch** | **§5 起動・介入 (cross-axis dispatch logic)** | **高** |
| **PR #126** (Activity mapping) | **Activity 7 軸 Taxonomy + Daily 内 use case** | **§1 対象領域 (活動 追加)** | **高** |
| **PR #127** (impl unblock audits) | Path α/β + D-2-e3-b/c/d/e + L4-m audit material | §9 MVP scope + §10 技術構成 | 中 (decision-ready material 記録) |

### §2.2 高優先度 5 PR (PR #122 / #123 / #124 / #125 / #126) の architecture-level 追加

これら 5 PR は **v1.1 で暗黙だった architecture** を明示化:

#### §2.2.1 PR #122 — 3-Axes Orthogonal

```
Axis A: Action Mode = decision | negotiate | clarify | (reflect)  ← §5 既存
Axis B: Presence Mode = normal | daily | travel                   ← §3 で暗黙
Axis C: Domain = movie | food | travel | activity | ...           ← §1 で 5 種
```

→ v1.2 で **3-Axes 軸明示** が必要 (v1.1 §5 で「4 mode」表現のみで PresenceMode が暗黙)。

#### §2.2.2 PR #123 — Gap 4 (Layer 5 production reachability)

v1.1 §3 Layer 5 で「提案生成」と書かれているが、**Layout / UpperLayer / Pattern variant の production reach 機構** は未記述。

→ v1.2 で **§3 Layer 5 拡張** が必要 (Layer 5 = 提案生成 + Pattern variant 発火 + production-side context detection)。

#### §2.2.3 PR #124 — Travel 1-2 泊国内 MVP

v1.1 §1 で「旅行」とのみ記載、details なし。

→ v1.2 で **§1 対象領域 (旅行) を 1-2 泊国内 MVP として詳細化** が必要。海外 / 任意期間 / 予約連携 は future scope と明示。

#### §2.2.4 PR #125 — Daily Dispatch (3 層分離)

v1.1 §5 起動・介入で「4 mode」を扱うが、**Presence Mode × Domain cross-axis** は未記述。

→ v1.2 で **§5 起動・介入を 3-Axes Orthogonal で再構成** が必要 (Daily / Travel mode 中の Domain routing logic)。

#### §2.2.5 PR #126 — Activity 7 軸 Taxonomy

v1.1 §1 対象領域に **「活動」がない** (5 種は映画 / 食事 / 旅行 / 予定調整 / プレゼント)。

→ v1.2 で **§1 対象領域に「活動 (activity)」追加** が必要、Daily 内核心 use case として明示。

### §2.3 中優先度 3 PR (PR #120 / #121 / #127) の記録的追加

- PR #120: Source-of-truth Hierarchy 確立 → v1.2 §0 (前提として記載推奨、ただし v1.1 §0 概要レベルで OK)
- PR #121: runtime integration priority decision → v1.2 §9 MVP scope (Phase 1 完了状態を加筆)
- PR #127: impl unblock audits → v1.2 §9 / §10 (decision-ready material 記録、ただし detail は別 doc 参照で OK)

---

## §3 v1.2 update 必要性判定 (claude 整理結果)

### §3.1 v1.2 update が **必要** と判断する根拠

| # | 根拠 | 影響範囲 |
|---|---|---|
| 1 | PR #122 で **3-Axes Orthogonal architecture** 確立、v1.1 §3 / §5 の暗黙が破られている | v1.1 解読困難 |
| 2 | PR #123 で **Gap 4 / Layer 5 production reachability** 概念追加、v1.1 §3 Layer 5 が時代遅れ | v1.1 §3 不完全 |
| 3 | PR #124 で **Travel 1-2 泊国内 MVP** 確定、v1.1 §1 「旅行」とのみは不十分 | v1.1 §1 不完全 |
| 4 | PR #125 で **Daily × Domain cross-axis dispatch** 設計、v1.1 §5 起動・介入の Daily / Travel mode 動作未記述 | v1.1 §5 不完全 |
| 5 | PR #126 で **Activity 7 軸 Taxonomy + Domain 追加**、v1.1 §1 対象領域 5 種に Activity なし | v1.1 §1 不完全 |
| 6 | B-2 audit で **mode enum 共通設計** (`CoalterDomainMode`) 整理、v1.1 §10 技術構成に未記述 | v1.1 §10 不完全 |

→ **6 根拠**、v1.2 update **「必要」** が claude 整理結論 (CEO 採用判断待ち)。

### §3.2 v1.2 update が **不要 or 後送り** と判断する根拠 (counterargument 提示)

CEO 判断材料として反対論も提示:

| # | 反対根拠 |
|---|---|
| 1 | v1.1 は CoAlter の **哲学・原則 (§2)** が core、PR #120-#127 の architecture 追加は **implementation detail**、v1.1 哲学は不変 |
| 2 | Master Design は **頻繁更新すべきでない** (CEO 承認 doc、信頼性維持のため) |
| 3 | implementation 完了前 (Phase 3 開始時) に v1.2 をまとめて update する方が、整合性高い (現状の v1.2 update は **中途半端**) |
| 4 | 各 PR で個別 doc を整備済、Master Design は **index 役割** で OK (Source-of-truth hierarchy で各 PR を参照すれば足る) |

→ **不要 or 後送り** 派の根拠 4 件、ただし claude 整理結論は **必要** (§3.1 根拠 6 件が優勢)。

### §3.3 タイミング推奨 3 案 (claude 整理結果、CEO 承認待ち)

| Option | timing | pros | cons |
|---|---|---|---|
| **A: 即時 v1.2 update** (本 Batch-B merge 直後の別 PR) | 2026-05-15〜2026-05-22 頃 | Source-of-truth 最新、後続 impl PR の base 更新 | implementation 完了前で頻繁更新 risk |
| **B: Phase 3 開始時 v1.2 update** (Phase 3 reflect mode 着手時) | Phase 3 開始 (timing 未定) | 主要 architecture 確定後、整合性高 | 当面 v1.1 の暗黙設計を readers が読み解く負担 |
| **C: implementation 完了時 v1.2 update** (全 Domain rollout 完了後) | CoAlter 全体完了時 | 完全な実態反映、final version | 長期間 v1.1 のまま、 |

**claude 推奨**: **Option A** (即時 v1.2 update)、ただし **本体更新は本 audit 別 PR**。理由:
- 高優先度 5 PR (§2.2) は architecture-level 追加で、v1.1 解読を困難にする
- 後続 impl PR (Phase 1 / Phase 2 / Phase 3) の base reference として v1.2 が必要
- 「頻繁更新」リスクは v1.1 → v1.2 の **1 回のみ**、毎月 update ではない

→ **CEO 採用判断請求**。

---

## §4 反映すべき section (claude 整理結果)

### §4.1 各 section の update 必要度

| section | update 必要度 | claude 整理結果 |
|---|---|---|
| §1 定義と位置づけ | **高** | **対象領域 5 → 6** に Activity 追加、旅行を 1-2 泊国内 MVP として詳細化 |
| §2 設計原則 7 | 低 | 不変、CoAlter 哲学 core は維持 |
| §3 5 層アーキテクチャ | **高** | **Layer 5 拡張** (提案生成 + Pattern variant 発火 + Gap 4 context detection)、Layout / UpperLayer / Pattern variant 明示 |
| §4 推薦アルゴリズム | 中 | Sequential Fairness を全 Domain に適用 (PR #124 Travel / PR #125 Daily Dispatch で言及)、ただし哲学 unchanged |
| §5 起動・介入モデル | **高** | **3-Axes Orthogonal で再構成** (Action Mode × Presence Mode × Domain)、Daily / Travel mode の Domain routing logic 追記 |
| §6 安全設計 | 低 | PR #108 server-side strict redaction が既存、ただし v1.1 §6 と整合 |
| §7 日本文化への適応 | 低 | 不変 |
| §8 既存資産の活用マップ | 中 | PR #110-#119 Provider Foundation を「転用候補」に追加 |
| §9 MVP スコープ | **高** | Phase 1 完了状態 + Phase 2 完了 + 凍結 + Phase 3 後送り を反映 |
| §10 技術構成 | 中 | `CoalterDomainMode` 共通型 + mode enum 5 件追加 (B-2 audit 参照) |
| §11 学術的情報ソース | 低 | PR #124 Itinerary Graph 関連学術 source 追加余地、ただし unchanged も可 |

→ **§1 / §3 / §5 / §9 が高 update 必要度**、§4 / §8 / §10 が中、その他は低。

### §4.2 まだ反映しないもの (本 v1.2 では含まない)

| 要素 | 理由 |
|---|---|
| Phase 3 (reflect mode) 詳細設計 | Phase 3 後送り (CEO directive)、本 v1.2 では Phase 3 後送りと記載のみ |
| Step E 完了後の Phase 4 (関係性インテリジェンス) | Phase 4 設計未着手 |
| 海外旅行 / 任意期間旅行 | future scope、本 v1.2 では除外明示 |
| API 予約連携 (楽天 / じゃらん / TripAdvisor) | future scope |
| Activity domain half-day 以上 / 遠出 | future scope |
| Daily mode × movie / travel chain の詳細 graph composition library | DD3 phase impl 後 |

---

## §5 古い docs との矛盾 (claude grep 結果)

### §5.1 矛盾検出箇所

| 古い doc | 矛盾内容 | 解決方針 |
|---|---|---|
| `docs/coalter-handoff-2026-04-22.md` | Stage 4 L4-l 未着手と書かれている (古い時点) | PR #95 (2026-05-10) で完了済、Source-of-truth hierarchy で main merge を優先 |
| `docs/coalter-implementation-plan-mainstream.md` | Step E movie 専用設計 | B-3 audit で 5 domain generalization 整理、本 doc は維持 (mainstream plan 既存、Step E generalization は別 doc) |
| `docs/coalter-d2e3a-implementation-design-review.md` | D-2-e3-b 詳細不明 | PR #127 Audit 2 + PR #103 で「curator (D-2-e3-b)」と整理 |
| `docs/coalter-master-design.md` v1.1 §1 対象領域 5 種 | Activity が含まれていない | v1.2 で 6 種に拡張 |

### §5.2 矛盾解決 priority (claude 整理結果)

1. **main merge 済 commit / PR を最上位 Source-of-truth** として、古い doc が矛盾する場合は **main 優先** (PR #120 / #122 / #127 で確立済 hierarchy)
2. **古い doc は archive 化** (削除せず維持、ただし「古い、最新は X」と note 追加で OK)
3. **Master Design v1.2 update** で **6 種対象領域 / 3-Axes Orthogonal / Layer 5 拡張** を明示反映

---

## §6 本体更新を別 PR にする推奨 (claude 整理結果)

### §6.1 v1.2 本体更新を別 PR にする 4 理由

1. **scope 分離**: 本 audit は **necessity 判定**、本体更新は **content drafting** で別 work
2. **PR review 効率**: 本体更新 PR では Master Design diff のみを CEO が確認、necessity discussion は不要
3. **rollback 容易**: 本体更新 PR が問題あれば revert 単独可能
4. **段階確認**: 本 audit merge → CEO「v1.2 update 着手承認」→ 本体更新 PR → CEO 採用判断、の 2 段階で安全

### §6.2 v1.2 本体更新 PR (将来別 PR) の推奨構造

CEO 承認後の別 PR で:

| 段階 | 内容 |
|---|---|
| **draft 1** | §1 対象領域 5 → 6 (Activity 追加) + 旅行 1-2 泊国内 MVP 詳細化 |
| **draft 2** | §3 Layer 5 拡張 (Pattern variant 発火 + Gap 4 明示) |
| **draft 3** | §5 起動・介入 3-Axes Orthogonal 再構成 |
| **draft 4** | §9 MVP スコープ Phase 1 完了 + Phase 2 完了凍結 + Phase 3 後送り反映 |
| **final review** | §4 / §8 / §10 中 update + 全体整合性確認 |

→ **5 段階 draft**、各段階で CEO 確認可。一気書きの risk を回避。

---

## §7 まだやらない (本 audit scope 外、極めて重要)

- ❌ **Master Design 本体 (`docs/coalter-master-design.md`) を 1 bit も touch しない**
- ❌ v1.2 update 別 PR の即着手 (本 audit merge + CEO 採用判断後)
- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ env / Production env / Vercel deploy 操作
- ❌ Anthropic Console / API key / 実 API call
- ❌ Supabase migration
- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ Phase 3 (reflect mode) 着手
- ❌ Travel / Daily Dispatch / Activity impl 着手
- ❌ Gap 4 detector impl 着手
- ❌ 本 doc の merge (CEO 判断)

---

## §8 CEO 判断請求 (本 audit 結論)

1. **v1.2 update 必要性判定の承認** — claude 整理結論「必要」 vs 「不要 or 後送り」 vs 別判断
2. **timing 推奨 (Option A 即時 vs Option B Phase 3 開始時 vs Option C 完了時) の採用判断**
3. **本体更新を別 PR にする方針承認** — 本 audit は necessity 判定、別 PR で content drafting
4. **反映 section の優先順承認** — §1 / §3 / §5 / §9 高、§4 / §8 / §10 中、その他 低
5. **まだ反映しないもの確認** — Phase 3 / Phase 4 / 海外旅行 / API 予約連携 / Activity future scope は本 v1.2 では除外
6. **古い doc との矛盾解決方針承認** — main merge 済 PR を最上位 Source-of-truth、古い doc は archive (削除せず note 追加)
7. **v1.2 本体更新 PR の 5 段階 draft 構造承認** (将来別 PR の structure)
