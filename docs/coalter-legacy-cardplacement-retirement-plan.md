# CoAlter legacy CoAlterCard 退役計画 (Legacy CardPlacement Retirement Plan)

**作成日**: 2026-04-27
**ステータス**: v0.1 DRAFT（Stage 0.5 Phase L0-b で起草、Stage 4 で参照・更新）
**起草 branch**: `feat/coalter-three-stage`
**正本依存**:
- `docs/coalter-integration-contract-2026-04-24.md` v0.1 rev 1 FIXED §1.4（legacy CoAlterCard の位置づけ）
- `docs/coalter-implementation-plan-layout.md` v0.2 §3.3 / §7.3 / §7.12 / §7.13（Stage 0.5 / Stage 4 retirement 経路）
- `docs/coalter-handoff-2026-04-22.md` rev 6 §4.1（Phase 2 凍結 6 項目 — Phase 6.C+ Dispatcher 経路は不可侵）

---

## §0 メタ情報

### §0.1 本書の位置づけ

本書は **CoAlter `CoAlterCard` の自動挿入 surface（legacy 経路）の退役計画** を事前 doc 化する。Stage 4 で `ChatClient.tsx` 本実装に入る際に、**flag による段階的 OFF flip → CEO 承認 → 1 rev 後の code 削除** という退役 roadmap を**事前に固定**することで、Stage 1-3 進行中の設計判断と Stage 4 着手時の混乱を防ぐ。

### §0.2 スコープ

**本書が決めること**:
- 退役対象の**正確な特定**（実 file path / 実 line range / 該当条件式 / 共存する**退役対象外**経路の明示）
- 退役の **goal** と統合契約 §1.4 整合
- 退役 **phase 4 段階**（flag 追加 → shadow 観測 → CEO 承認 flip → 1 rev 後 code 削除）
- **flag 設計**（`COALTER_LEGACY_CARD_AUTO_INSERT`、scope 限定）
- **rollback 経路**（flag 再 ON 即復帰）
- **削除 CEO 審議タイミング**（L4-l flip 後 1 rev、推奨 2 週間以上）

**本書が決めないこと**:
- legacy 経路を全 OFF にする具体的な日付（運用判断、CEO が L4-l 着手時に決める）
- 明示 handoff UI（`HandoffButton.tsx`）の visual spec（→ UI spec §4.3.8 / §2.7 に従う）
- Phase 2 3-mode body / `coalterDispatch` / metadata schema 等の凍結項目（**1 bit も touch しない**）

### §0.3 正本依存

| 正本 doc | §番号 | 役割 |
|---|---|---|
| **integration contract v0.1 rev 1 FIXED** | **§1.4** | legacy CoAlterCard の退役対象規定 |
| integration contract | §1.5 / §1.6 | 二重表示禁止原則 / 不可侵条文 |
| **layout plan v0.2** | **§3.3** | 本書起草指示（章立て / Gate / commit msg） |
| layout plan v0.2 | §7.3 (L4-c) | 退役の本実装 phase（flag 追加 + 明示 handoff UI 新設） |
| layout plan v0.2 | §7.12 (L4-l) | 本番 flip phase（3 flag 同時 flip + CEO 審議） |
| layout plan v0.2 | §7.13 (L4-m) | legacy code 削除 phase（L4-l flip 後 1 rev + CEO 別審議） |
| handoff §4.1 | — | Phase 2 凍結 6 項目（Phase 6.C+ Dispatcher 経路は不可侵） |

### §0.4 不可触対象

本書の実装中（Stage 4 L4-c / L4-l / L4-m）でも **1 bit も touch しない**:

- **Phase 6.C+ `CoAlterCardDispatcher` 経路**（`coalter.hasCard && coalter.currentCard` 条件、後述 §1.2）
- Phase 2 3-mode body / `isExecutorThemeEnabled` / `coalterDispatch` 5 step / metadata schema / status API / `resolveActiveFromMetadata`（handoff §4.1 凍結）
- 統合契約 §1.6 不可侵条文（surface 二層 / S0-S8 対話面完結 / 明示 tap 発火 / 二重表示禁止 / 仲介者性）

---

## §1 legacy CoAlterCard 現状

### §1.1 退役対象 / 退役対象外の区別（**本書の最重要固定**）

`ChatClient.tsx` 内の CoAlter 提案カード AnimatePresence ブロックは **Phase 6.C 以降に二経路化**されている。本書は**前者のみを退役対象とする**:

> **退役対象**:
> - `!coalter.hasCard && coalter.hasProposal && coalter.currentProposal` 経路の `CoAlterCard` 自動 mount
> - 実 path: `app/(culcept)/talk/[threadId]/ChatClient.tsx`
> - 実 line range: **`:1741-1759`**（AnimatePresence 内 legacy fallback ブロック）
>
> **退役対象外（維持）**:
> - `coalter.hasCard && coalter.currentCard` 経路の `CoAlterCardDispatcher`
> - 実 path: 同上
> - 実 line range: **`:1721-1740`**（Phase 6.C+ discriminated union dispatch）
> - **根拠**: handoff §4.1 Phase 2 凍結 6 項目（`coalterDispatch` 5 step / metadata.card に該当）。本書の退役対象から完全除外する
> - **統合契約 §1.4 が指す「legacy 自動挿入」は前者のみ**

→ この区別は Stage 4 L4-c で「どちらを flag OFF にするか」を一意に確定するための核。**混同事故防止**。

### §1.2 該当 code の正確な引用

`app/(culcept)/talk/[threadId]/ChatClient.tsx:1715-1759`:

```tsx
{/* ── CoAlter 提案カード (Phase 6.C: discriminated union dispatch) ── */}
{/*
 * CEO 6.C 条件 #4:
 *   card.mode (decision / negotiate / clarify) で switch し、1 カード内で混在させない。
 *   currentCard があれば Dispatcher 経由、無ければ従来の CoAlterCard (decision) にフォールバック。
 */}
<AnimatePresence>
  {coalter.hasCard && coalter.currentCard && (              {/* ★ 退役対象外: line 1721-1740 */}
    <motion.div className="py-3 px-2"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <CoAlterCardDispatcher
        card={coalter.currentCard}
        onDismiss={coalter.dismissProposal}
        onAdopt={coalter.adoptCandidate}
        onRefine={coalter.refine}
        pendingAxisDeltas={coalter.pendingAxisDeltas}
        onAxisToggle={coalter.toggleAxisDelta}
        onReroll={coalter.reroll}
        onCloseRefine={() => { /* ローカルで閉じるだけ */ }}
        awaitingAnswer={coalter.awaitingAnswer}
        onAnswerInChat={(q) => coalter.markAwaitingAnswer(q)}
        onCancelAwaiting={() => coalter.markAwaitingAnswer(null)}
        onHandoffEvent={handleCoAlterHandoffEvent}
      />
    </motion.div>
  )}
  {!coalter.hasCard && coalter.hasProposal && coalter.currentProposal && (   {/* ★ 退役対象: line 1741-1759 */}
    <motion.div className="py-3 px-2"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <CoAlterCard
        proposal={coalter.currentProposal}
        onDismiss={coalter.dismissProposal}
        onAdopt={coalter.adoptCandidate}
        onRefine={coalter.refine}
        pendingAxisDeltas={coalter.pendingAxisDeltas}
        onAxisToggle={coalter.toggleAxisDelta}
        onReroll={coalter.reroll}
        onCloseRefine={() => { /* ローカルで閉じるだけ */ }}
        awaitingAnswer={coalter.awaitingAnswer}
        onAnswerInChat={(q) => coalter.markAwaitingAnswer(q)}
        onCancelAwaiting={() => coalter.markAwaitingAnswer(null)}
        onHandoffEvent={handleCoAlterHandoffEvent}
      />
    </motion.div>
  )}
</AnimatePresence>
```

### §1.3 「自動挿入」の定義

退役対象（line 1741-1759）が「自動挿入」と呼ばれる理由:

- **ユーザー明示 tap なし**で発火する: `coalter.hasProposal && coalter.currentProposal` が truthy になった瞬間、`AnimatePresence` 経由で `CoAlterCard` が**自動的に画面挿入**される
- **対話面ではなく対話面+自動 mount** の二重 surface 化（統合契約 §1.4 で退役対象とされる根拠）
- 統合契約 §1.6-3「出力面への送信は**ユーザー明示 tap** でのみ発火する（自動送信禁止）」と整合しない

退役対象外（line 1721-1740）が**退役対象でない理由**:

- Phase 6.C+ `discriminated union dispatch` 経路で、Phase 2 凍結 6 項目（`coalterDispatch` 5 step / metadata.card）の正規消費先
- handoff §4.1 で固定済、本書の touch 範囲外
- legacy 退役 flag (`COALTER_LEGACY_CARD_AUTO_INSERT`) と**無関係**に常時動作する

### §1.4 plan §3.3 / §7.3 の参照値との差分

layout plan v0.2 §3.3 / §7.3 が指す `app/components/chat/ChatClient.tsx:1898-1908` は **plan 起草時の古い参照値**。実機で確認した実態は本 §1.1-1.2 のとおり（path / line ともに異なる）。

本書は**実測値を正本**として記録する。plan §3.3 / §7.3 の参照値同期は**別タスク**（v0.3 minor revision 候補）として CEO に別途提起する（本書の commit には含めない）。

---

## §2 退役ゴール

### §2.1 統合契約 §1.4 引用（正本）

統合契約 §1.4 より:

> 現行 `ChatClient.tsx:1898-1908` 付近の CoAlterCard メッセージ表示（メインチャット吹き出し列への自動挿入）は **legacy surface** として退役対象。
>
> - **移行期（本契約固定時〜Stage 4 本実装完了まで）**: 既存 CoAlterCard の自動挿入は**維持**する。Bug-1 / Bug-2 修正（Step C/D）は既存 surface 上で進行、観測を止めない
> - **Stage 3 preview**: 上部レイヤー UI を preview 限定で先行実装。本番 ChatClient への介入は無し
> - **Stage 4 本実装**: CEO 承認で `ChatClient.tsx` に上部レイヤー導入。同時に legacy CoAlterCard の自動挿入を**明示 handoff 経由のみ**に置換（= 出力面への送信はユーザー承認 tap で発火、自動挿入は廃止）
> - **legacy 退役完了時期**: Stage 4 で別判断（本契約では固定しない）

### §2.2 本書が固定する退役 goal

1. **退役対象**（§1.1）の自動挿入を **Stage 4 L4-l flip 時に OFF** にする（`COALTER_LEGACY_CARD_AUTO_INSERT=false`）
2. 同時に**明示 handoff button**（`HandoffButton.tsx`、UI spec §4.3.8 / §2.7）を mount し、**ユーザー明示 tap でのみ**メインチャットへ broadcast する経路に置換する（統合契約 §1.6-3 / §1.6-4 整合）
3. flip 後 1 rev（推奨 2 週間以上）観測して問題ゼロを確認した後、**legacy code 物理削除**（L4-m）を CEO 別審議で実施
4. 削除完了で本書を「完了」で close する

### §2.3 退役完了の判定軸

| 軸 | 判定 |
|---|---|
| flag flip | `COALTER_LEGACY_CARD_AUTO_INSERT=false` が production 反映済 |
| 自動挿入の停止 | 退役対象 line（§1.1）が flag OFF で **rendering されないことを実測** |
| 明示 handoff 動作 | `HandoffButton.tsx` 経由で 1 回きり broadcast が動作 |
| 二重表示禁止 | 統合契約 §1.6-4 の二重表示禁止が flip 後も維持 |
| Dispatcher 経路の不変 | 退役対象外 line（§1.1）が flip 後も flag 無関係に動作 |
| code 削除 | L4-m 完了で legacy code 物理削除 + flag 削除 |
| 本書 close | 上記すべて達成で「完了」status へ |

---

## §3 移行期の扱い（Stage 1-3 中）

### §3.1 移行期の挙動規定

統合契約 §1.4 / layout plan v0.2 §1.1 整合:

- **Stage 0.5 〜 Stage 3 完了まで**: legacy 自動挿入は **flag ON 既定で維持**
- 理由: Bug-1 / Bug-2 観測が legacy surface 上で進行中、観測を止めない
- 理由: Stage 1-3 の preview 試作 / executor 骨格 / preview E2E はすべて `app/(dev)/coalter-preview/**` 内完結で、本番 ChatClient へ介入しない（plan §0.4 / §1.1 / §1.2 で固定）

### §3.2 Stage 別の touch 範囲

| Stage | legacy 経路への touch | 退役対象外 (Dispatcher) への touch |
|---|---|---|
| 0.5 (L0-a / L0-b) | ❌ なし（doc のみ）| ❌ なし |
| 1 (L1-a 〜 L1-k) | ❌ なし（preview dir 完結）| ❌ なし |
| 2 (L2-a 〜 L2-m) | ❌ なし（lib/coalter/presence/** 新設のみ）| ❌ なし |
| 3 (L3-a 〜 L3-j) | ❌ なし（preview E2E）| ❌ なし |
| **4 L4-c** | ✅ **flag 追加**で OFF 時スキップ + 明示 handoff UI 新設 | ❌ なし |
| **4 L4-l** | ✅ **flag flip OFF**（CEO 審議承認後）| ❌ なし |
| **4 L4-m** | ✅ **code 物理削除**（CEO 別審議承認後）| ❌ なし |

### §3.3 移行期の不変条件（Phase L0-b 〜 L4-c 着手前）

- 退役対象 line（§1.1、現実 line 1741-1759）の挙動は flag 導入前まで**完全不変**
- 退役対象外 line（§1.1、現実 line 1721-1740）は本書の全期間を通じて touch されない
- `import CoAlterCard from "@/components/coalter/CoAlterCard"` （line 13）は L4-m まで残置
- handleCoAlterHandoffEvent / coalter.dismissProposal / coalter.adoptCandidate 等の callback hook 群は不変

---

## §4 retirement phase（4 段階）

退役は **4 段階の連続フロー** で実施する。各段階は layout plan v0.2 §7 の対応 Phase に **1:1 で整合**する。

### §4.1 段階 1: flag 追加 + 明示 handoff UI 新設（L4-c）

**対応 plan Phase**: layout plan v0.2 §7.3 (Phase L4-c)

**目的**: 退役対象を flag で gate し、明示 handoff UI を mount する。flag は既定 ON のため**挙動変化ゼロ**で landing。

**実施内容**:

| file | 種別 | 概要 |
|---|---|---|
| `lib/coalter/flags.ts` | **修正** | `legacyCardAutoInsertEnabled` 新設（既定 ON、env `COALTER_LEGACY_CARD_AUTO_INSERT`）|
| `app/(culcept)/talk/[threadId]/ChatClient.tsx` | **修正** | 退役対象 line（現実 line 1741-1759）の AnimatePresence 子要素条件を `legacyCardAutoInsertEnabled && !coalter.hasCard && coalter.hasProposal && coalter.currentProposal` に拡張 |
| `app/components/chat/HandoffButton.tsx`（plan §7.3 で新規）| **新規** | UI spec §4.3.8 / §2.7 の明示 handoff button |
| `tests/unit/coalter/legacyCardAutoInsertFlag.test.ts` | **新規** | flag ON で legacy 自動挿入 / flag OFF で handoff button のみ |
| `tests/unit/coalter/handoffButton.test.ts` | **新規** | 明示 tap → 1 回きり broadcast / 自動 broadcast しない（統合契約 §1.6-3） |

**Gate**:
- [ ] flag ON で legacy 自動挿入維持（移行期、挙動変化ゼロ）
- [ ] flag OFF で自動挿入なし、明示 handoff button 表示
- [ ] 二重表示禁止（統合契約 §1.6-4）が flag OFF でも維持
- [ ] 退役対象外 line（line 1721-1740）が flag に**無関係**で動作（test で証明）

**注**: plan §7.3 の参照 path `app/components/chat/ChatClient.tsx` は古い。実装時には実 path `app/(culcept)/talk/[threadId]/ChatClient.tsx` を使う（本書 §1.4 整合、退役 doc が現実を写す）。

### §4.2 段階 2: shadow 観測（L4-c〜L4-l 間）

**対応 plan Phase**: layout plan v0.2 §7.4-7.11（L4-d 〜 L4-k）の進行中、preview / staging で並走観測

**目的**: 退役対象 line を **flag OFF 想定で preview / staging 観測**する（production は flag ON で稼働継続）。

**実施内容**:

- preview / staging 環境でのみ `COALTER_LEGACY_CARD_AUTO_INSERT=false` に切替
- 明示 handoff button 経由の broadcast 動作を観測
- legacy 経路への dependency が他に存在しないこと（callback / state / DOM 依存）を実測
- production は **既定 ON のまま**、観測中の不安定性を本番に流さない

**Gate**:
- [ ] preview / staging で flag OFF 動作 1 週間以上
- [ ] handoff button 経由の broadcast 成功率の観測
- [ ] 二重表示禁止が flag OFF で維持される実測
- [ ] エラー / fallback の頻度が production の flag ON 時と差がないこと

### §4.3 段階 3: 本番 flip — 3 flag 同時（L4-l、CEO 審議必須）

**対応 plan Phase**: layout plan v0.2 §7.12 (Phase L4-l)

**目的**: production 本番で 3 flag を同時 flip し、上部レイヤー本実装 + legacy 退役 + speech LLM 合成を**同時 ON 化**する。

**実施内容**:

| 操作 | 内容 |
|---|---|
| **CEO 審議** | mainstream E-3（三段式 flip）との整合確認、legacy 退役審議、preview / staging 観測結果のレビュー |
| **3 flag 同時 flip** | `COALTER_PRESENCE_EXECUTOR=true` / **`COALTER_LEGACY_CARD_AUTO_INSERT=false`** / `COALTER_PRESENCE_SPEECH_LLM=true` |
| **decision-log 記録** | flip 内容と CEO 承認を `docs/decision-log.md` に明記 |

**Gate**:
- [ ] CEO 審議承認
- [ ] 3 flag 同時 flip
- [ ] decision-log 記録
- [ ] flip 直後の挙動を 24h 観測（telemetry / error rate）

**Rollback**: 3 flag を元に戻す（§6 参照）

### §4.4 段階 4: legacy code 削除（L4-m、L4-l flip 後 1 rev、CEO 別審議）

**対応 plan Phase**: layout plan v0.2 §7.13 (Phase L4-m)

**目的**: L4-l flip 後 1 rev（推奨 2 週間以上）観測して問題ゼロを確認した後、legacy code を物理削除する。

**実施内容**:

| file | 種別 | 概要 |
|---|---|---|
| `app/(culcept)/talk/[threadId]/ChatClient.tsx` | **修正** | legacy CoAlterCard 自動挿入 code（現実 line 1741-1759）を削除 |
| `app/(culcept)/talk/[threadId]/ChatClient.tsx` | **修正** | `import CoAlterCard from "@/components/coalter/CoAlterCard"`（line 13）を削除（他に使われていないこと確認） |
| `lib/coalter/flags.ts` | **修正** | `legacyCardAutoInsertEnabled` flag 削除 |
| `tests/unit/coalter/legacyCardAutoInsertFlag.test.ts` | **削除** | flag ごと不要 |
| 関連 test | 削除 or 更新 | legacy 経路 test を整理 |

**Gate**:
- [ ] CEO 別審議承認（L4-l flip 後 1 rev 以上経過、推奨 2 週間以上）
- [ ] 削除後も既存 `tests/` 全 PASS
- [ ] `import CoAlterCard` の参照ゼロ確認
- [ ] 退役対象外 (Dispatcher 経路) は不変で動作
- [ ] 本書（`coalter-legacy-cardplacement-retirement-plan.md`）を「完了」status で close

---

## §5 flag 設計

### §5.1 flag 名と env

| 項目 | 値 |
|---|---|
| **flag 名** | `legacyCardAutoInsertEnabled` |
| **env 名** | `COALTER_LEGACY_CARD_AUTO_INSERT` |
| **既定値** | **`true` (ON)** |
| **flip 時期** | Stage 4 L4-l（CEO 審議承認後）|
| **flip 後値** | **`false` (OFF)** |
| **削除時期** | Stage 4 L4-m（L4-l flip 後 1 rev 以上、CEO 別審議承認後） |

### §5.2 flag scope の精緻化（**最重要固定**）

`COALTER_LEGACY_CARD_AUTO_INSERT=false` で OFF にするのは **退役対象 (line 1741-1759 = legacy 経路の AnimatePresence 子要素ブロックのみ)**。

- ✅ **flag OFF で停止する経路**: `!coalter.hasCard && coalter.hasProposal && coalter.currentProposal` 条件下の `<CoAlterCard>` 自動 mount（line 1741-1759）
- ❌ **flag と無関係に常時動作する経路**: `coalter.hasCard && coalter.currentCard` 条件下の `<CoAlterCardDispatcher>`（line 1721-1740、Phase 6.C+ discriminated union dispatch、handoff §4.1 凍結項目）

→ flag は **legacy 経路の AnimatePresence 子要素のみ**を gate する。Dispatcher 経路は flag の存在自体を**参照しない**。

### §5.3 実装時の条件式（L4-c で適用予定）

```tsx
{/* 退役対象外 (Dispatcher) — flag に無関係 */}
{coalter.hasCard && coalter.currentCard && (
  <CoAlterCardDispatcher ... />
)}

{/* 退役対象 (legacy) — flag ON 時のみ rendering */}
{COALTER_FLAGS.legacyCardAutoInsertEnabled
  && !coalter.hasCard
  && coalter.hasProposal
  && coalter.currentProposal && (
  <CoAlterCard ... />
)}

{/* 明示 handoff UI — flag OFF 時に hand-off を提供（L4-c で新設）*/}
{!COALTER_FLAGS.legacyCardAutoInsertEnabled && coalter.hasProposal && (
  <HandoffButton ... />
)}
```

### §5.4 flag 削除（L4-m）後の最終形

L4-m 完了後、`legacyCardAutoInsertEnabled` flag は**完全削除**される。コードベースに `COALTER_LEGACY_CARD_AUTO_INSERT` の参照は残らない。Dispatcher 経路は flag 不在で常時動作する（既存挙動維持）。

---

## §6 rollback

### §6.1 段階 3 (L4-l flip) からの rollback

**rollback 手順**:

1. `COALTER_LEGACY_CARD_AUTO_INSERT=true` に戻す（env 再設定）
2. 同時 flip した他 2 flag (`COALTER_PRESENCE_EXECUTOR` / `COALTER_PRESENCE_SPEECH_LLM`) も plan §7.12 の rollback 手順に従って戻す
3. production deploy で即時反映
4. 既存 UI / legacy 自動挿入 / 静的 speech に**即復帰**
5. decision-log に rollback 事由を記録

**rollback 復帰時間**: env 反映 + production deploy = 数分〜10 分以内

### §6.2 rollback 後の再 flip

rollback 後の問題解消・再観測完了後、CEO 別審議で再 flip 可能。再 flip までは flag ON のまま running。

### §6.3 段階 4 (L4-m code 削除) からの rollback

L4-m で code 物理削除した後の rollback は **git revert** での復元のみ:

1. L4-m commit を `git revert <commit-hash>` で生成（destructive 操作なし）
2. flag 含めて legacy code を復元
3. CEO 審議で revert commit を merge
4. flag を ON に戻して legacy 経路を再開

**注**: code 削除後の rollback は **L4-l flip 後 1 rev (推奨 2 週間以上) 観測で問題ゼロ確認** という前提条件を経ている。実態として L4-m 後の rollback は災害対応的位置づけ。

---

## §7 削除 CEO 審議のタイミング

### §7.1 削除前提条件

L4-m（legacy code 物理削除）を発動するには、以下のすべてを満たす必要がある:

| 前提 | 詳細 |
|---|---|
| **L4-l flip 完了** | `COALTER_LEGACY_CARD_AUTO_INSERT=false` が production 稼働中 |
| **観測期間** | L4-l flip 後 **1 rev 以上**（**推奨: 2 週間以上**）|
| **問題ゼロ実測** | 観測期間中に legacy 経路への dependency 浮上ゼロ、明示 handoff button の broadcast 失敗率が許容範囲内、二重表示禁止 (§1.6-4) 違反ゼロ |
| **mainstream E-3 整合** | mainstream plan の三段式 flip と整合性確認済（layout plan §1.2 / §7.12 整合）|
| **CEO 別審議** | L4-l 審議とは**別の審議**で CEO 承認 |

### §7.2 CEO 別審議の項目

L4-m 発動の CEO 別審議では、最低以下を確認する:

1. L4-l flip 後の telemetry（legacy fallback 率 = 0、明示 handoff 利用率、二重表示禁止違反 = 0）
2. ユーザー報告 / サポートエスカレーション件数
3. 退役対象外（Dispatcher 経路）の不変動作確認
4. `import CoAlterCard` の参照箇所が legacy 経路 1 箇所のみであり、削除後に他コードが破損しないこと
5. 関連 test の整理計画
6. rollback 手順（§6.3）の確認

### §7.3 完了判定 — 本書の close

L4-m 完了で本書を **「完了」status** に更新する:

- `## §0 メタ情報` の `**ステータス**:` を `v1.0 RETIRED（L4-m 完了、{date}）` に更新
- 改訂履歴に L4-m 完了日と CEO 承認 ID を追記
- `docs/decision-log.md` に「legacy CoAlterCard 退役完了」エントリ
- 本書は以後 reference doc として保持（削除しない）

### §7.4 退役完了後の責務

退役完了後の CoAlter 出力面 surface は:

- **対話面**: 上部レイヤー UI（plan §1 Stage 4 L4-a / L4-f / L4-g / L4-h で本実装済）
- **出力面**: 明示 handoff button (`HandoffButton.tsx`) → ユーザー明示 tap で **1 回きり**メインチャットへ broadcast（統合契約 §1.6-3）

これにより統合契約 §1.4 「自動挿入廃止 / 明示 handoff 経由のみ」が達成される。

---

## 改訂履歴

| 日付 | 版 | 変更内容 | 承認 |
|---|---|---|---|
| 2026-04-27 | v0.1 DRAFT | 初稿起草。Stage 0.5 Phase L0-b 着手。退役対象 / 退役対象外の 2 経路区別、4 段階 retirement phase、flag scope 精緻化、rollback / CEO 別審議タイミングを固定 | CEO 確認待ち |

---

**🎯 結論（v0.1 DRAFT）**: 本書は CoAlter `CoAlterCard` の **legacy 自動挿入経路（実 line 1741-1759）のみ** を退役対象として固定し、Phase 6.C+ `CoAlterCardDispatcher` 経路（実 line 1721-1740）は**不可侵**として保護する。Stage 4 で 4 段階 retirement phase（flag 追加 → shadow 観測 → 3 flag 同時 flip → 1 rev 後 code 削除）を経て、統合契約 §1.4 「自動挿入廃止 / 明示 handoff 経由のみ」を達成する。flag `COALTER_LEGACY_CARD_AUTO_INSERT` は legacy 経路のみを gate し、Dispatcher 経路は flag と無関係に動作する。
