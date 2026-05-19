# CoAlter AOO Phase E-2-0 — Prerequisite Sequencing Plan (Phase E-0 Correction)

**ステータス**: Phase E-2-0 起票 (docs-only)、Phase E-1 close (`docs/coalter-aoo-phase-e1-close.md`、PR #215 merged `b07eeab5`) を前提
**作成日**: 2026-05-20
**目的**: Phase E-0 plan 内に潜在していた **時系列矛盾** (kill switch / Sentry baseline / drill が「E-3 で実施」と「E-2-α 着手 gate」の両方に存在) を構造的に解消し、E-2-α (Production env touch) 前に達成すべき残 4 gate の **正しい実施順** を確定する。Production env touch は本 PR では絶対に行わない。

---

## §0. 本 doc の射程

- ✅ 残 4 gate の **実施順** を確定 (sequencing)
- ✅ kill switch / Sentry baseline / drill の **定義** を明確化
- ✅ Phase E-0 plan §2 (sub-phase 構成) との **矛盾整理 + 修正案** を提示
- ✅ 次 implementation PR (E-2-1 / E-2-2 / E-2-3 / E-2-α) の **具体的な scope と順序** を提示
- ✅ Claude 自立推論で **人間を超越する設計** (preflight assertion script / drill scenario library / propagation observability 等) を加算
- ❌ Phase E-2 実装 (E-2-1 以降) には進まない
- ❌ Production env / all-Preview env / Development env touch 一切なし
- ❌ runtime code 変更 / Supabase migration / redeploy 一切なし
- ❌ C-5 着手 なし

---

## §1. なぜ E-2-0 が必要か (Phase E-0 内に潜在していた contradiction)

Phase E-0 plan (`docs/coalter-aoo-phase-e-plan.md`、PR #211 merged `314ed277`) は **5 sub-phase 構成** で起票された:

| Sub-phase | scope | 期間 | 前提 |
|---|---|---|---|
| E-0 | productization plan | 1 day | Phase D close |
| E-1 | visible smoke | 3-5 days | E-0 merge |
| E-2 | Production gradual rollout | 1-3 weeks | E-1 PASS |
| **E-3** | **monitoring + kill switch** | **1 week** | **E-2 in progress (並列可)** |
| E-4 | Phase E close | 1 day | E-3 stable |

しかし、Phase E-0 §9.2 で確定された **E-2-α 着手 8 condition gate** の中で、上記 E-3 の構成要素 (kill switch / Sentry baseline) が **E-2-α の前提** として要求されていた:

| # | E-2-α gate condition | E-0 sub-phase 帰属 (元) |
|---|---|---|
| 1 | E-1 visible smoke PASS | E-1 |
| 2 | E-1 canary cleanup 完了 | E-1 |
| 3 | E-1 close 記録 main 着地 | E-1 close (PR #215) |
| **4** | **kill switch L1 + L3 drill 済** | **E-3 (= E-2 並列)** ← **矛盾** |
| **5** | allowlist 実装 (Option A) 着地 | (E-0 で帰属未指定) ← **未明示** |
| 6 | reflection-only canon CI test 着地 | E-1 (PR #213) |
| 7 | CEO 直接承認 | E-2-α 起票時 |
| **8** | **Sentry baseline 記録済** | **E-3 (= E-2 並列)** ← **矛盾** |

### 1.1 矛盾の正体

- E-3 を「E-2 in progress (並列可)」と定義した時点で、E-3 の構成要素は **E-2-α の後** に実施されることが暗黙に許容される
- しかし E-2-α 着手 gate #4 と #8 は、**E-2-α の前** に達成されている必要がある
- 結果として、**「並列だが先行が必要」という時系列不整合**が plan に潜在
- 加えて、**gate #5 (allowlist)** は E-0 plan で sub-phase に帰属が明示されておらず、「E-2-α 前の別 PR」とだけ書かれていた

PR #215 (E-1 close) で CEO が gate を再確認した際に、この矛盾が顕在化した。本 E-2-0 はこれを **構造的に解消** する。

---

## §2. 矛盾の構造的説明 + 修正方針

### 2.1 構造的説明

Phase E-0 plan §2.1 / §10 / §11 / §13 における **kill switch / Sentry baseline / drill の扱い**:

| 言及箇所 | 内容 | 整合性 |
|---|---|---|
| §2.1 表 | E-3 = "monitoring + kill switch" / 期間 1 week / 前提 "E-2 in progress (並列可)" | ❌ E-2-α 前提と矛盾 |
| §5.3 | kill switch drill = "E-2-α 開始前に canary 環境で drill" | ✅ E-2-α 前と明示 |
| §9.2 gate #4 | "kill switch L1 + L3 が drill 済" | ✅ E-2-α 前と明示 |
| §9.2 gate #8 | "Sentry baseline error rate 記録済" | ✅ E-2-α 前と明示 |
| §10 exit criteria | "kill switch L1 + L3 drill 成功" | (Phase E 終了条件、E-2-α 前提とは別) |
| §11.7 (Claude 自立推論) | "failure injection drill in canary" として **E-2-α 着手前必須 gate** | ✅ E-2-α 前と明示 |

→ **§2.1 だけが時系列を曖昧にしていた**。他の §5.3 / §9.2 / §11.7 はすべて「E-2-α 前」を明示。したがって本 E-2-0 で **§2.1 の表記を修正** すれば矛盾は解消する。

### 2.2 修正方針 (3 option 比較)

#### Option A: Phase E-0 plan を直接 edit する

- メリット: 単一 source of truth、reader が混乱しない
- デメリット: 既に main に着地した permanent canon を変更する = 履歴に編集が残る
- 整合性: ✅

#### Option B: 本 E-2-0 doc が **Phase E-0 §2.1 を上書き宣言**、phase-e-plan.md は不変

- メリット: phase-e-plan.md を永続記録として残せる、E-2-0 が修正記録となる
- デメリット: 2 つの doc を読まないと最新計画が分からない
- 整合性: 修正の参照経路を明示すれば OK

#### Option C: 両方 (本 E-2-0 doc + phase-e-plan.md に小さな pointer 追記)

- メリット: phase-e-plan.md を開いた reader が即座に E-2-0 を見つけられる
- デメリット: 2 file change、レビュー範囲拡大
- 整合性: ✅✅ (最も robust)

**Claude 推奨**: **Option C** (両方)。phase-e-plan.md の §2.1 表に「※ 本表記は E-2-0 sequencing で修正、本 doc §2.2 + §4 参照」の 1 行 footnote を追加するだけで矛盾が即座に reader に伝わる。

→ 本 PR の changed files に `docs/coalter-aoo-phase-e-plan.md` の 1 行 footnote 追加も含める。

---

## §3. 残 4 gate の正しい実施順 (Claude reasoning + CEO 期待表現)

### 3.1 CEO 期待表現 (PR #215 補正で確定済、本 doc で sequencing 確定)

Phase E-1 close で CEO が確定した残 4 condition (canonical 一覧、文字列完全一致):

1. **kill switch L1 + L3 drill 済**
2. **allowlist 実装 (Option A env-based) 着地**
3. **CEO 直接承認**
4. **Sentry baseline 記録**

### 3.2 各 gate の依存関係分析

| gate | 種別 | 必要 artifact | 依存 |
|---|---|---|---|
| kill switch L1 | env 削除 script + runbook | docs / script | (依存なし、env 操作のみ) |
| kill switch L3 | Supabase migration + runtime read code | DB migration + runtime code | Mirror runtime (既存) |
| allowlist Option A | env-based check runtime code | runtime code | Mirror runtime (既存) |
| Sentry baseline | error rate 観測 + 記録 | observation + docs | Mirror runtime (既存) で error 出すパスが必要 |
| failure injection drill | canary 環境で kill switch を発火 + Sentry alert 観測 | canary deploy + kill switch + Sentry | kill switch + Sentry baseline (script) + allowlist |
| CEO 直接承認 | 文書化承認 | docs (PR description / decision-log) | E-2-α 起票時に取得 |

### 3.3 構造的に正しい実施順 (依存逆算)

1. **kill switch L1 + L3 を実装** (これは drill の前提)
2. **allowlist Option A を実装** (drill 時の visible Mirror gate)
3. **Sentry baseline を測定 + 記録** (drill 前の baseline 確立)
4. **failure injection drill を canary で実施** (kill switch + Sentry + allowlist すべてを同時に exercise)
5. **CEO 直接承認** (1-4 完了後の最終 gate、E-2-α 起票 PR で取得)
6. **E-2-α 着手** (Production env touch)

### 3.4 並列化可能性の検討

- 1 (kill switch) と 2 (allowlist) は **互いに独立** → 並列可能 (PR 同時起票 + 別々に merge OK)
- 3 (Sentry baseline) は kill switch / allowlist code を実機に置いた後の方が現実的な error rate を測れる → 1 + 2 の後
- 4 (drill) は 1 + 2 + 3 すべての後
- 5 (CEO 承認) は 4 の後

→ 並列化を考慮した最適順:

```
[E-2-1: kill switch L1 + L3] ⇄ [E-2-2: allowlist Option A]
                              ↓ (両方 main 着地後)
                       [E-2-3: Sentry baseline + drill]
                              ↓ (drill PASS)
                          [E-2-α: Production env touch + CEO 承認]
```

ただし**並列実装は人的 review コストを増やす**ため、CEO 判断で **sequential** にすることも合理的:

```
[E-2-1: kill switch] → [E-2-2: allowlist] → [E-2-3: Sentry + drill] → [E-2-α]
```

Claude 推奨: **sequential** (PR review の集中、依存の明示、人的 cost 最小)。Phase E はそもそも「速度より整合性と世界観を優先」(CLAUDE.md 意思決定原則) なので並列化は不要。

---

## §4. Sub-phase 再編成 (E-3 を E-2-1 / E-2-3 に分割、E-3' を post-α 観測 only に再定義)

### 4.1 旧構成 (Phase E-0 plan §2.1) — **本 E-2-0 で修正**

| Sub-phase | scope | 矛盾 |
|---|---|---|
| E-0 | productization plan | (なし) |
| E-1 | visible smoke | (なし) |
| E-2 | Production gradual rollout | (なし) |
| E-3 | monitoring + kill switch (E-2 並列) | ❌ kill switch / Sentry が E-2-α 前提と矛盾 |
| E-4 | Phase E close | (なし) |

### 4.2 新構成 (本 E-2-0 で確定)

| Sub-phase | scope | 種別 | 期間 | 前提 |
|---|---|---|---|---|
| E-0 | productization plan | docs | 1 day | (closed) |
| E-1 | visible smoke canary | implementation + smoke | 3-5 days | (closed) |
| E-1 close | E-1 close docs | docs | 1 day | (closed) |
| **E-2-0** (本 PR) | **prerequisite sequencing plan** | **docs** | **1 day** | **E-1 close** |
| **E-2-1** | **kill switch L1 + L3 foundation** | **implementation (runtime + migration + tests + docs)** | **3-5 days** | **E-2-0 merge** |
| **E-2-2** | **allowlist Option A implementation** | **implementation (runtime + tests)** | **2-3 days** | **E-2-1 merge** |
| **E-2-3** | **Sentry baseline + failure injection drill** | **implementation (observation + canary drill)** | **3-5 days** | **E-2-1 + E-2-2 merge** |
| **E-2-α** | **Production env touch + CEO 7-day 観測** | **env injection + 観測** | **1 day env 投入 + 7 days 観測** | **E-2-3 PASS + CEO 直接承認** |
| E-2-β | invited user 1-3 名 + 7 days 観測 | env update + onboarding tooltip | 7-10 days | E-2-α PASS |
| E-2-γ | 拡大判断 | judgment | (CEO 判断) | E-2-β PASS |
| **E-3'** (旧 E-3 から再定義) | **continuous monitoring + reflection text catalog** (E-2-α 後の永続観測) | **post-α observability tooling** | **1 week tooling + 永続 monitoring** | **E-2-α 開始後並列** |
| E-4 | Phase E close | docs | 1 day | E-2-γ + E-3' stable |

### 4.3 旧 E-3 の構成要素の再帰属

| 旧 E-3 構成要素 | 新 sub-phase |
|---|---|
| kill switch L1 (env 削除 script + runbook) | **E-2-1** |
| kill switch L3 (Supabase runtime flag + migration + code) | **E-2-1** |
| Sentry baseline (error rate 記録) | **E-2-3** |
| failure injection drill | **E-2-3** |
| Mirror event log catalog (Phase E-0 §11.5、reflection text catalog) | **E-3'** (post-α 観測 only、E-2-α 着手 gate ではない) |
| 月次 alignment review (Phase E-0 §11.10) | **E-3'** |

→ **旧 E-3 で「並列可」だった部分** = 純粋に post-α な observability tooling のみ。これを **E-3'** として残す。**E-2-α の前提となる部分は E-2-1 / E-2-3 に移管**。

---

## §5. 各 sub-phase の詳細

### 5.1 E-2-1: kill switch foundation (L1 + L3)

#### scope
- **L1 implementation**: env 削除 script + 緊急 runbook
- **L3 implementation**: Supabase migration (`app_settings` table 新規) + runtime code (`MirrorHost` mount 時に L3 flag を read、false なら null render)
- tests: L1 script の dry-run + L3 runtime check + RLS policy

#### 含めない (E-2-2 / E-2-3 で扱う)
- allowlist 実装 (E-2-2)
- Sentry baseline 観測 (E-2-3)
- drill 実施 (E-2-3)

#### 期待 deliverables
- `scripts/coalter/mirror-kill-switch-l1.sh` (env removal script、CEO 用 runbook 内 reference)
- `supabase/migrations/<datetime>_coalter_mirror_app_settings.sql` (migration、`app_settings` table 新規)
- `lib/coalter/mirror/runtimeKillSwitch.ts` (Supabase from app_settings の read 関数)
- `components/coalter/mirror/MirrorHost.tsx` の差分 (mount 時の L3 check 追加、最小 diff)
- `tests/unit/coalter/mirror/runtimeKillSwitch.test.ts` (L3 read logic tests)
- `docs/coalter-aoo-phase-e2-1-kill-switch-runbook.md` (L1 + L3 operator runbook)
- decision-log entry

#### env / Supabase touch
- env: 0 (本 PR では env 投入なし、env 値の参照定義のみ)
- Supabase migration: **1 件** (`app_settings` 新規 table、CEO 直接承認必須)
- runtime code 変更: **最小限** (Mirror runtime に L3 check を追加、No-Effect Contract 維持の範囲で)

#### Mirror runtime No-Effect Contract への影響
- 現状: `MirrorHost` は flag OFF 時 null return、I/O 0、storage 0
- L3 追加後: `MirrorHost` mount 時に 1 回の Supabase read 追加 (`app_settings.mirror_channel_enabled` を fetch)
- **No-Effect Contract 改訂が必要**: 「flag ON 時、mount 時に 1 read 許容」を canon に追加
- 改訂は本 PR の docstring 内に明記、test で enforce

### 5.2 E-2-2: allowlist Option A implementation

#### scope
- env-based allowlist runtime check
- env var name: `NEXT_PUBLIC_MIRROR_ALLOWLIST_USER_IDS` (comma-separated UUID list)
- fail-closed default: env 未設定 / 空文字 / 不正 format → allowlist match = false → Mirror OFF

#### 期待 deliverables
- `lib/coalter/mirror/userAllowlist.ts` (env parse + user.id match 関数)
- `useMirrorEngine` 内に allowlist check 追加 (mount 時、user fetch 後)
- `tests/unit/coalter/mirror/userAllowlist.test.ts` (env parse + match logic + fail-closed)
- decision-log entry

#### 4-layer flag gating (Phase E-0 §13.2 で固定された canon、本 E-2-2 で運用化)
- L1: env scope (`NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED`、build-time)
- L2: useMirrorEngine 内の flag 確認 (既存)
- **L3 (本 PR で追加): allowlist match (`userAllowlist(user.id)`)**
- L4: SleepUIToggle (user session-local、既存)

→ いずれか OFF で Mirror OFF (構造的 fail-closed)。

#### env / Supabase touch
- env: 0 (本 PR では env 投入なし)
- Supabase migration: 0
- runtime code 変更: 中 (useMirrorEngine に check 1 つ追加、~30 lines)

### 5.3 E-2-3: Sentry baseline + failure injection drill

#### scope (2 part)

**Part A: Sentry baseline**
- 現状 Mirror module の Sentry error rate を 7 days 観測
- 観測 method: Sentry MCP / dashboard で `tag:module=coalter.mirror` の event 数を 1h 単位で記録
- baseline doc: `docs/coalter-aoo-phase-e2-3-sentry-baseline.md` に時系列記録

**Part B: failure injection drill in canary**
- 新 canary branch を作成 (E-1 の `feat/coalter-e1-visible-smoke-canary` パターン踏襲)
- canary scope env を再投入 (E-1 と同じ 6 件 + allowlist env 1 件 = 7 件)
- canary build + D-1 verify
- drill 実施 (§8 で定義する scenario library を順次 exercise)
- drill 結果を decision-log 記録 (timing 計測)

#### drill scenarios (§8 で詳述、計 5 scenarios)
1. 合成 Sentry alert → L1 kill (env 削除) → propagation 計測
2. 合成 Sentry alert → L3 kill (Supabase flag flip) → propagation 計測
3. false positive Mirror render → SleepUIToggle (user-level) → 影響範囲確認
4. PII leak 疑いシナリオ → L1 + L3 同時発動 + post-mortem
5. canon 違反疑いシナリオ → canon CI test を後追いで block + Mirror runtime 即停止

#### 期待 deliverables
- `docs/coalter-aoo-phase-e2-3-sentry-baseline.md` (baseline 記録)
- `docs/coalter-aoo-phase-e2-3-drill-runbook.md` (drill 手順 + scenario library)
- decision-log entry (drill 結果 + timing)
- canary cleanup (drill 後 6+1 envs 削除、E-1 pattern)

#### env / Supabase touch
- env: canary scope のみ (7 件投入 → drill 後削除)
- Supabase: 0 (kill switch L3 の `app_settings` table read のみ、migration 不要 = E-2-1 で済)
- runtime code 変更: 0 (E-2-1 + E-2-2 のコードを exercise するのみ)

### 5.4 E-2-α: Production env touch + CEO 7-day observation

#### scope
- CEO Production scope に 2 keys 投入:
  - `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED=true`
  - `NEXT_PUBLIC_MIRROR_ALLOWLIST_USER_IDS=<CEO user.id>`
- next Production deploy で env 適用
- CEO ブラウザで Production を使い、Mirror UI 観測 (7 days 連続)

#### 期待 deliverables
- env 投入 (CEO 手動)
- 反転テスト (§14.10 参照、env 投入後即 L1 kill で 1 分以内 revert 確認)
- 7-day observation log (decision-log 毎日 1 entry: error rate / discomfort / canon 違反 / kill switch 不発火)
- E-2-α close docs (E-1 close pattern 踏襲)

#### env / Supabase touch
- env: **Production scope 2 keys のみ** (Mirror Channel 限定緩和、CEO §12.1 補正範囲内)
- Supabase: 0 (新規 migration なし、E-2-1 で済んだ `app_settings` を read するのみ)
- runtime code 変更: 0 (本 phase は env 投入 + 観測 only)

---

## §6. kill switch L1 / L3 の定義

### 6.1 L1 (env-level、build deploy 経由)

| 項目 | 定義 |
|---|---|
| trigger | CEO が `vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED production --yes` 実行 |
| 効果範囲 | Production scope の Mirror flag が削除 |
| 反映時間 | **~5 分** (Vercel が次の deploy を作るまで or env propagation lag) |
| Mirror 状態 | `process.env.NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` が undefined → `COALTER_FLAGS.mirrorChannelEnabled` false → `MirrorHost` null return → DOM から消える |
| 復旧手順 | env 再投入 (`vercel env add ...`、CEO 手動) |
| 適用シーン | 確実な恒久 OFF (incident 落ち着いた後の状態安定化) |

### 6.2 L3 (runtime-level、Supabase flag 経由)

| 項目 | 定義 |
|---|---|
| trigger | CEO が Supabase Studio で `app_settings` table の `mirror_channel_enabled` row を `false` に update (or SQL: `UPDATE app_settings SET value = '{"enabled": false}' WHERE key = 'mirror_channel_enabled';`) |
| 効果範囲 | Supabase 全 client (Production + Preview 全 deploy) で同時に flag false |
| 反映時間 | **<1 sec** (Mirror が mount 時に Supabase read、cached < 5 sec)。最大 5 sec lag |
| Mirror 状態 | `runtimeKillSwitch.ts` の read が `{enabled: false}` を返す → `MirrorHost` mount で early return → DOM null |
| 復旧手順 | Supabase Studio で `mirror_channel_enabled` を `true` に戻す (即時反映) |
| 適用シーン | 緊急即時 OFF (PII leak / canon 違反 / user discomfort 高確度時) |

### 6.3 L1 vs L3 比較 + 使い分け

| 観点 | L1 | L3 |
|---|---|---|
| 速度 | 5 分 | <1 秒 |
| 状態保持 | 永続 (env 復元しない限り) | DB 状態 (CEO 操作で即 revert 可) |
| 操作場所 | Vercel CLI / Web UI | Supabase Studio / SQL |
| 監査 trail | Vercel env history | Supabase row updated_at + 別 audit table (§14.2) |
| 失敗 mode | env propagation lag | DB connection 失敗時 fail-open or fail-closed (要設計、§14.4) |

**使い分け recommendation**: L3 を **第一手** (即時)、L1 を **第二手** (恒久)。incident 検知 → L3 で即停止 → 原因 audit → 解消後 L3 で再開 OR L1 で恒久 OFF。

---

## §7. Sentry baseline の取得方法

### 7.1 baseline 取得対象 metrics

| metric | 取得方法 | 単位 |
|---|---|---|
| Mirror module Sentry event 数 | tag filter `module=coalter.mirror` の event count / 1h | events/hour |
| Mirror engine error rate | event の error level / 全 event ratio | % |
| Mirror visible render 回数 (E-3' で本格化) | Sentry custom event 数 | events/hour |
| Sleep / Close click rate | Sentry custom event 数 (E-3' で本格化) | events/session |

### 7.2 baseline 取得手順

```bash
# Sentry MCP 経由 (Claude が実行可、env touch 0)
# Step 1: 過去 7 days の Mirror 関連 event 数を取得
# Step 2: 1h-bucket で集計、median / max を記録
# Step 3: docs/coalter-aoo-phase-e2-3-sentry-baseline.md に記録

# baseline 取得 = read-only観測、env touch 0
# Sentry が現時点で Mirror event を取得していない場合は "0 baseline" として記録
```

### 7.3 baseline の使い方 (E-2-α 着手後)

- E-2-α 開始後、1h / 6h / 24h / 7d で再集計
- baseline からの **乖離が threshold 超え** (例: error rate > baseline + 3σ) なら alert
- 乖離 alert → CEO 判断で kill switch 発動

### 7.4 baseline が「0」の場合の扱い

E-1 時点では Mirror が Production で動いていない → baseline error rate は **0 or 非常に低い**。これは正常 (Mirror が動いていない場合、Mirror error は出ない)。

baseline 0 を canon として記録し、E-2-α 後の **任意の Mirror error が baseline 逸脱** とする (CEO 判断で kill switch 発動)。

---

## §8. failure injection drill の内容 (scenario library)

drill = **複数 scenario の連続 exercise**。「kill switch が動く」を確認するだけでなく、**真の Bad Day を simulate** して operator (CEO) の muscle memory を作る。

### 8.1 Drill scenarios (5 scenarios)

| # | scenario | trigger | 期待 outcome | 計測 metric |
|---|---|---|---|---|
| 1 | 合成 Sentry alert → L1 kill | Sentry API で synthetic error event を投げる | CEO が alert 検知 → `vercel env rm` 実行 → 次 deploy で Mirror null → propagation 計測 | alert→action time, action→propagation time |
| 2 | 合成 Sentry alert → L3 kill | 同上 | CEO が Supabase Studio で flag false → 既存 deploy で Mirror null (5 sec 内) | alert→action time, action→DOM null time |
| 3 | false positive Mirror render → SleepUIToggle | (canary で forced canary mode + user が SleepUIToggle click を simulate) | session-local sleep ON → Mirror null (session 内) | session 内 propagation time |
| 4 | PII leak 疑い → L1 + L3 同時発動 + post-mortem | synthetic PII string を Mirror template に injection 試行 (canon CI test で block されることを確認) | canon CI test PASS → injection 失敗 → L1 + L3 即発動 → 全 deploy Mirror null + post-mortem doc | canon CI gate 動作確認 + dual kill 動作確認 |
| 5 | canon 違反疑い (Question/Proposal text) → 即停止 | synthetic Question 文字列を template に追加 PR | canon CI test FAIL → merge block | CI gate response time |

### 8.2 Drill report 構造

各 scenario について decision-log + drill-runbook に記録:

```markdown
### Scenario 1: 合成 Sentry alert → L1 kill
- 実施日時: 2026-MM-DD HH:MM
- alert 発火 → CEO 検知: X 分
- CEO 検知 → action 実行: Y 分
- action → DOM null 確認: Z 分
- 合計 alert → mitigation: X + Y + Z 分
- 期待 SLA (CEO 補正): < 30 分 → PASS / FAIL
- 観測 evidence: (Sentry event ID, vercel deploy id, screenshot ref)
```

### 8.3 Drill PASS 条件

- 全 5 scenarios が期待 outcome 通り完了
- alert → mitigation 時間が **SLA threshold 内** (各 scenario で個別、§8.1 の計測 metric を CEO が判定)
- post-mortem doc が記録される

---

## §9. allowlist Option A の実装範囲

### 9.1 env var 設計

| key | 値 format | 例 |
|---|---|---|
| `NEXT_PUBLIC_MIRROR_ALLOWLIST_USER_IDS` | comma-separated UUIDs | `f47ac10b-58cc-4372-a567-0e02b2c3d479,abc12345-...` |

### 9.2 runtime check 設計

```typescript
// lib/coalter/mirror/userAllowlist.ts (E-2-2 で新規)

/**
 * 環境変数 NEXT_PUBLIC_MIRROR_ALLOWLIST_USER_IDS を parse し、
 * 指定 user.id が allowlist に含まれるかを判定する。
 *
 * fail-closed: env 未設定 / 空文字 / 不正 UUID 含む場合は false 返却。
 */
export function isUserInMirrorAllowlist(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.NEXT_PUBLIC_MIRROR_ALLOWLIST_USER_IDS;
  if (!raw || raw.trim() === "") return false;
  const ids = raw.split(",").map(s => s.trim()).filter(s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s));
  return ids.includes(userId);
}
```

### 9.3 useMirrorEngine 統合点

```typescript
// hooks/useMirrorEngine.ts (E-2-2 で minimal diff)
//   - 既存の flag check の後、user.id を fetch して allowlist check を追加
//   - allowlist match なら既存 engine logic 続行、no match なら early return null

// 既存:
if (!COALTER_FLAGS.mirrorChannelEnabled) return { visible: null, ... };

// E-2-2 追加:
const user = useCurrentUser(); // 既存 hook
if (!isUserInMirrorAllowlist(user?.id)) return { visible: null, ... };

// (続き既存 engine logic)
```

### 9.4 fail-closed の意義

- env 未設定 → allowlist match = false → Mirror OFF
- env 投入 mistake (CEO の typo 等) → 該当 user が allowlist に居なければ Mirror OFF
- これにより「allowlist 設定漏れで全 user に Mirror が出る」事故を構造的に防ぐ (defense-in-depth)

### 9.5 tests

| test | 内容 |
|---|---|
| env 未設定 → false | 必須 |
| env 空文字 → false | 必須 |
| env に対象 user.id 含む → true | 必須 |
| env に対象 user.id 含まない → false | 必須 |
| env に不正 format (non-UUID) 含む → 不正 entry は無視、有効 entry のみ照合 | 必須 |
| user.id が null / undefined → false | 必須 (fail-closed) |
| 大文字混入 → 小文字正規化なし (UUID は小文字前提) | 仕様確認 |

---

## §10. CEO 直接承認の取得タイミング

各 sub-phase PR で CEO 直接承認が必要なポイント:

| PR | CEO 承認内容 | timing |
|---|---|---|
| 本 PR (E-2-0) | **本 sequencing plan 全体の方針承認** + 既存 phase-e-plan §2.1 修正承認 | CEO PR review 時 |
| E-2-1 (kill switch) | Supabase migration 承認 (新規 table `app_settings`)、L3 read logic 承認 | E-2-1 PR review 時 |
| E-2-2 (allowlist) | runtime code 変更 (useMirrorEngine 内 allowlist check 追加) 承認、env var name 確定 | E-2-2 PR review 時 |
| E-2-3 (Sentry + drill) | drill scenarios 承認、canary infra 再構築承認 (env 7 件投入再開) | E-2-3 PR review 時 |
| **E-2-α (Production env touch)** | **Production env への 2 keys 投入の最終承認** (canon §12.1 緩和の単一発動点) | **E-2-α 起票 PR の最初に CEO 直接承認 statement を要求** |

→ CEO 直接承認 = **5 ポイント** で取得。E-2-α の承認が最重要 (Production 緩和の発動点)。

---

## §11. E-2-α 着手の最終条件 (8 condition 再整理)

PR #215 で確定した E-2-α 着手 gate 8 condition を、本 E-2-0 の sub-phase に帰属付け:

| # | condition | 帰属 sub-phase | 状態 |
|---|---|---|---|
| 1 | E-1 visible smoke PASS | E-1 | ✅ 達成 (PR #213) |
| 2 | E-1 canary cleanup 完了 | E-1 close | ✅ 達成 (PR #215) |
| 3 | E-1 close 記録 main 着地 | E-1 close | ✅ 達成 (PR #215) |
| **4** | **kill switch L1 + L3 drill 済** | **E-2-3 (本 E-2-0 で再帰属)** | ⏸ 未達 (E-2-1 + E-2-2 + E-2-3 順次達成必要) |
| **5** | **allowlist 実装 (Option A) 着地** | **E-2-2 (本 E-2-0 で明示)** | ⏸ 未達 |
| 6 | reflection-only canon CI test 着地 | E-1 | ✅ 達成 (PR #213) |
| 7 | CEO 直接承認 | E-2-α 起票時 | ⏸ 未取得 |
| **8** | **Sentry baseline 記録済** | **E-2-3 (本 E-2-0 で再帰属)** | ⏸ 未達 |

→ **4 達成 / 4 残**。残 4 は **E-2-1 → E-2-2 → E-2-3 → E-2-α** の順に達成。

---

## §12. 既存 Phase E plan との矛盾整理 + 修正案 (Option C 採用)

### 12.1 `docs/coalter-aoo-phase-e-plan.md` への 1 行 footnote 追加

`docs/coalter-aoo-phase-e-plan.md` §2.1 の sub-phase 一覧表の直後に、以下の 1 行 footnote を追加:

```markdown
> ⚠️ **本 §2.1 の sub-phase 構成は Phase E-2-0 sequencing plan で修正されている**
> (E-3 の構成要素のうち kill switch / Sentry baseline / drill は E-2-α gate の prerequisite
> となるため、E-2-1 / E-2-3 に分割移管された)。最新の sub-phase 構成は
> `docs/coalter-aoo-phase-e2-0-sequencing.md` §4.2 を参照。
```

これにより phase-e-plan.md を開いた reader は即座に修正の存在を知る。

### 12.2 phase-e-plan.md の他 section への影響

| section | 矛盾の有無 | 措置 |
|---|---|---|
| §2.1 sub-phase 表 | ✅ 矛盾 | §12.1 で 1 行 footnote 追加 |
| §5 E-3 設計 (kill switch / monitoring) | 部分的に矛盾 (timing が "E-2 並列" だった) | §4.3 の再帰属で解消、phase-e-plan.md は変更しない (footnote で誘導済) |
| §9.2 8 condition gate | 整合 | (変更なし) |
| §10 exit criteria | 整合 | (変更なし) |
| §11.7 failure injection drill | 整合 (E-2-α 前必須) | (変更なし) |

→ `docs/coalter-aoo-phase-e-plan.md` への変更は **§2.1 の 1 行 footnote のみ**。他は本 E-2-0 doc の参照で吸収。

---

## §13. 次 PR 案 (具体的な PR splitting)

### 13.1 推奨順序 (sequential、CEO Q8 補正で E-2-1 を split)

```
[本 PR: E-2-0 docs sequencing] ← merge 待ち
        ↓ merge
[E-2-1a: Supabase migration + audit table + RLS (SQL/docs only)]
        ↓ merge (= PR 着地、Production DB apply は別 step)
        ↓ CEO 明示承認 + DB apply (manual)
[E-2-1b: runtime read code + L1 script + tests + runbook]
        ↓ merge
[E-2-2: allowlist Option A implementation]
        ↓ merge
[E-2-3: Sentry baseline + drill (canary、Production env touch なし)]
        ↓ merge + drill PASS
[E-2-α: Production env touch + 7-day 観測]
```

注: E-2-1a の **DB apply は CEO 明示承認後**。PR merge ≠ DB apply (分離)。

### 13.2 各 PR の概算

| PR | scope | 推定 line diff | 期間 | env touch | Supabase migration |
|---|---|---|---|---|---|
| 本 PR (E-2-0) | docs sequencing | +600 (本 doc + decision-log) | 1 day | 0 | 0 |
| E-2-1 | kill switch L1 + L3 | +200-300 (script + migration + runtime + tests + docs) | 3-5 days | 0 | **1 件** (`app_settings`) |
| E-2-2 | allowlist Option A | +100-150 (runtime + tests + 1 file) | 2-3 days | 0 | 0 |
| E-2-3 | Sentry baseline + drill | +400-500 (baseline doc + drill runbook + decision-log + canary infra再用 + 7 envs invocation) | 3-5 days | canary scope 7 envs (drill 期間のみ) | 0 |
| E-2-α | Production env touch | env injection のみ、code 0 | 1 day env + 7 days 観測 | **Production scope 2 keys** | 0 |

合計 Production touch: 2 keys (E-2-α のみ)。Supabase migration: 1 件 (E-2-1)。

### 13.3 並列化検討

理論的には E-2-1 と E-2-2 は依存独立だが、Claude 推奨は **sequential** (§3.4 の理由)。CEO 判断で並列化可。

### 13.4 PR splitting alternative

代替案として E-2-1 + E-2-2 を 1 PR にまとめる選択肢もある (両方 runtime code 変更):

| 代替 | PR count | review burden | risk profile |
|---|---|---|---|
| 5 PR sequential (推奨) | 5 (E-2-0 → α) | 各 PR 小さい、review 集中 | 各 PR 独立 rollback 容易 |
| 4 PR (E-2-1 + E-2-2 統合) | 4 | E-2-1+2 が中程度、他は小 | runtime 変更が 1 PR に集中 (rollback 範囲拡大) |

**Claude 推奨**: **5 PR sequential** (各 PR 独立 rollback、review 集中)。

---

## §14. Claude 自立推論 — 人間超越アイデア

CEO 提示 9 項目以外に、本 sequencing plan に組み込みたい設計・logic のアイデア。

### 14.1 Preflight assertion script (E-2-α 着手前の機械的 gate)

**問題**: E-2-α 着手 8 condition のうち 4 つは docs / decision-log の人手 review に依存。漏れが起こりうる。

**アイデア**: `scripts/coalter/e2a-preflight.ts` を E-2-α 起票 PR に含める。CEO が `npx tsx scripts/coalter/e2a-preflight.ts` を実行し、以下を機械的 verify:

```typescript
// 8 condition の機械 check (擬似 code)
const checks = [
  { id: 1, label: "E-1 visible smoke PASS", verify: () => decisionLogContains("Phase E-1 正式 close") },
  { id: 2, label: "E-1 canary cleanup", verify: () => decisionLogContains("E-1 cleanup 完了") },
  { id: 3, label: "E-1 close docs main 着地", verify: () => fileExists("docs/coalter-aoo-phase-e1-close.md") },
  { id: 4, label: "kill switch L1 + L3 drill", verify: () => decisionLogContains("drill PASS") },
  { id: 5, label: "allowlist 実装着地", verify: () => fileExists("lib/coalter/mirror/userAllowlist.ts") },
  { id: 6, label: "canon CI test", verify: () => fileExists("tests/unit/coalter/mirror/reflectionCanonInvariant.test.ts") },
  { id: 7, label: "CEO 直接承認", verify: () => prDescriptionContains("CEO 直接承認: YES") },
  { id: 8, label: "Sentry baseline 記録", verify: () => fileExists("docs/coalter-aoo-phase-e2-3-sentry-baseline.md") },
];
const failed = checks.filter(c => !c.verify());
if (failed.length > 0) {
  console.log("🔴 PREFLIGHT FAIL:", failed.map(c => `#${c.id} ${c.label}`));
  process.exit(1);
}
console.log("🟢 PREFLIGHT PASS — E-2-α 着手可");
process.exit(0);
```

→ E-2-α 起票 PR で preflight script が exit 0 になることを **CI gate** にする (workflow にも組み込み可)。

### 14.2 L3 kill switch audit trail

**問題**: L3 (Supabase flag) flip が誰によって・いつ実施されたかの forensic 記録が `app_settings.updated_at` だけだと弱い。

**アイデア**: 別 audit table を作る (E-2-1 に同梱):

```sql
CREATE TABLE coalter_mirror_kill_switch_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,  -- 'enable' | 'disable'
  triggered_by_user_id UUID,  -- auth.uid()
  triggered_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT,  -- 任意 metadata
  prior_state JSONB
);
```

L3 flip 時に trigger で audit row を auto insert。CEO は理由を任意で記載可能。

### 14.3 Drill scenario library (§8 で reference) を decision-log と双方向 link

**問題**: drill 結果が decision-log に埋もれると後から参照困難。

**アイデア**: drill scenarios 専用 doc (`docs/coalter-aoo-phase-e-drill-results.md`) を E-2-3 で作成、各 drill 実施を append。canon doc から決定的にリンク。Phase E-2-α 着手前に CEO が 1 文書で全 drill 結果を確認可能。

### 14.4 L3 read 失敗時の fail-open vs fail-closed canon

**問題**: `app_settings` Supabase read が失敗 (DB connection error 等) した場合、Mirror を どう扱うか? fail-open (Mirror 続行) vs fail-closed (Mirror OFF)。

**Claude 推奨**: **fail-closed** (Mirror OFF)。理由:
- Mirror は便益あるが必須機能ではない (Aneurasync 思想: reflection、第二の自己だが必須ではない)
- DB 失敗時に Mirror が動作続行する状態は kill switch の意義を弱める
- user 体験劣化 = Mirror 一時非表示 (許容範囲)

→ canon に明記、E-2-1 で実装。

### 14.5 Reversibility test in E-2-α (即時 revert 検証)

**問題**: env injection 後の rollback が「理論上動く」だけで実機検証されないリスク。

**アイデア**: E-2-α env 投入直後 (Mirror 動作確認後すぐ)、CEO が L1 kill (env removal) を実行 → 1 分以内に Mirror が Production で消えることを実機確認。確認後 env 再投入で 7-day 観測開始。

→ 「reversibility は仕様」ではなく「実機検証済」を E-2-α の最初に達成。

### 14.6 Pre-mortem ワークショップ (E-2-3 と並列、CEO judgment)

**問題**: drill scenario が想定の範囲内に限られる。想定外の事故が見逃される。

**アイデア**: E-2-3 期間中、CEO + Claude で 1 時間 pre-mortem (「Mirror が Production で大失敗した、何が起きた?」を最大 5 シナリオ想像 + 対策 mapping)。decision-log に記録。drill scenarios の追加根拠となる。

### 14.7 Defense-in-depth circuit breaker (auto-disable after N kills)

**問題**: 24h 内に 3 回以上 kill switch 発動 → 構造的不安定 = phase 後退判断必要。

**アイデア**: L3 audit table (§14.2) を集計し、24h 内に 3+ disable があれば Mirror を 7 days 強制 disable (再有効化に CEO 直接 +5 condition 達成必要)。自動 lockout で post-mortem を強制。E-3' (post-α monitoring) で実装、E-2-α では人手判断で代用。

### 14.8 FORCED_CANARY の Production 禁止を canon に正式昇格

**問題**: 「FORCED_CANARY は canary のみ」は Phase E-0 §3.4 で言及されているが、canon としては弱い。

**アイデア**: 本 E-2-0 で **正式 canon 化**:
- `docs/coalter-aoo-canary-deploy-anti-patterns.md` に新 anti-pattern 1.6 追加: 「FORCED_CANARY を canary 以外 (Production / all-Preview / Development) に投入する」
- CI test で env var が任意 Production env file に含まれていないことを check (env file scan)

ただし本 E-2-0 では anti-patterns doc を touch せず、E-2-1 で実施 (canon canon 化は E-2-1 同梱が現実的)。

### 14.9 Allowlist の deny-list precedence (optional、E-2-2 で検討)

**問題**: invited user 1-3 名のうち、特定 user が discomfort 報告した時、allowlist 全体を変えると他 user も影響受ける。

**アイデア**: 別 env var `NEXT_PUBLIC_MIRROR_DENYLIST_USER_IDS` を実装、deny-list が allow-list より優先。CEO 操作 1 step で特定 user のみ OFF 可能。

E-2-2 では allowlist のみ実装、deny-list は E-2-β 着手時に追加検討。

### 14.10 Reflection text catalog as drill subject (§14.3 と併用)

**問題**: drill が抽象的 ("synthetic error" のみ) だと、本物の Mirror text 関連 error の検出経路が verify されない。

**アイデア**: drill scenario 1 (合成 Sentry alert) で、**実際の Mirror template text を emit する canary deploy** を用意 (FORCED_CANARY=true + Mirror engine 発火) し、その text を Sentry custom event として送出。CEO が alert 受信 → kill switch 発動 = 「本物の path で kill が動く」確認。

E-2-3 drill scenario 1 の精度を上げる。

---

## §15. 不可侵境界 (本 E-2-0 PR + Phase E 全期間)

### 15.1 本 E-2-0 PR 全期間 (docs only)

| 項目 | 状態 |
|---|---|
| runtime app code (`app/` / `lib/` / `components/` / `hooks/`) | **0 diff** |
| Mirror runtime / ChatClient / useMirrorEngine / CoAlter API routes | **0 diff** |
| `package.json` / `package-lock.json` / `vercel.json` / `.canary-trigger.json` | **0 diff** |
| `scripts/coalter/verify-canary-deploy.ts` | **0 diff** |
| `tests/unit/coalter/mirror/reflectionCanonInvariant.test.ts` | **0 diff** |
| `docs/coalter-supabase-ref-canon.md` | **0 diff** |
| Production env / all-Preview env / Development env | **0 touch** |
| canary scope env | **0** (E-1 cleanup 後 0 維持) |
| `SUPABASE_SERVICE_ROLE_KEY` 任意 scope 追加投入 | **0** |
| Supabase migration | **0** |
| **Phase E-2-1 以降の実装** | **0** (本 PR は docs only、E-2-1 別 PR で起票) |
| **C-5 着手** | **0** |

### 15.2 Phase E-0 canon の継承 (永続維持)

| canon | 維持 |
|---|---|
| `lib/supabase` anon-only contract | ✅ E-2-1 + E-2-2 + E-2-3 でも維持 |
| Mirror runtime No-Effect Contract | ⚠️ E-2-1 で **1 read 許容** に改訂 (canon update、§5.1 docstring で明記) |
| Supabase ref canon (D-3-α) | ✅ 維持 |
| anti-patterns canon | ✅ 維持 + §14.8 で拡張 |
| D-1 verification 3 gates | ✅ E-2-3 drill で再活用 |
| reflection-only canon CI test (E-1) | ✅ 維持 |

### 15.3 Phase E-2 以降で **新たに不可侵化** する原則 (CEO Q4 + 追加補正反映、2026-05-20 確定)

| 新 canon | 内容 | 起源 sub-phase |
|---|---|---|
| L1 + L3 kill switch は両層必須 | (Phase E-0 §13.2 既存) | E-2-1 で実装 |
| **L3 read 失敗は fail-closed (Mirror OFF)** ★ | §14.4 (CEO Q7 確定) | E-2-1b で実装 |
| Production env 緩和は 2 keys のみ | (Phase E-0 §12.1 既存) | E-2-α で発動 |
| **L3 kill switch は監査ログあり** ★ | CEO 追加補正 (§16.1.1 #3、`coalter_mirror_kill_switch_audit` table) | E-2-1a migration |
| **L3 kill switch は rollback 容易性あり** ★ | CEO 追加補正 (§16.1.1 #3、Supabase Studio で flag 値を元に戻すだけで即時復旧) | E-2-1a + E-2-1b |
| **FORCED_CANARY は canary でのみ、Production / all-Preview / Development 投入永続禁止** ★ | CEO Q4 + 追加補正 (§16.1.1 #4、§14.8 正式 canon 化) | E-2-1 で anti-patterns 1.6 追記 |
| **migration PR 着地 ≠ DB apply、Production DB apply は CEO 明示承認後のみ** ★ | CEO Q8 補正 (§16.1.1 #2) | E-2-1a 起票時 |
| Drill = 5 scenarios、Production env touch なし、canary / non-production 相当のみ | CEO Q5 補正 (§16.1) | E-2-3 で実施 |
| Sentry 未設定 / 取得不能なら E-2-3 で blocker として記録 | CEO Q6 補正 (§16.1) | E-2-3 で実装 |
| Preflight assertion script を E-2-α gate に組み込む | §14.1 (CEO Q4 必須採用) | E-2-α PR で実装 |
| L3 audit trail (`coalter_mirror_kill_switch_audit` table) | §14.2 (CEO Q4 必須採用) | E-2-1a migration |
| Reversibility test in E-2-α (env 投入直後 1 分 revert 実機確認) | §14.5 (CEO Q4 必須採用) | E-2-α 開始時 |
| Circuit breaker (24h 3+ kills で 7 days lockout) | §14.7 (CEO Q4 非必須) | E-3' (post-α) で検討 |

(★ = CEO 直接補正で確定した canon、優先度 highest)

---

## §16. 本 E-2-0 起票後の次 action

### 16.1 CEO answers (Q1-Q8、2026-05-20 approved)

CEO 直接判定済 (PR #217 review 時、E-2-1 以降の sub-phase 設計に永続反映):

| # | 質問 | **CEO answer** | 根拠 / 制約 |
|---|---|---|---|
| Q1 | sub-phase 再編成案 (§4.2) 承認 | **YES** | E-2-1 kill switch foundation → E-2-2 allowlist → E-2-3 Sentry baseline + drill → E-2-α の順で進める |
| Q2 | phase-e-plan に footnote 同梱 (Option C) | **YES** | ただし **E-0 本体を大きく書き換えず**、**E-2-0 を正本として参照させる** (本 §12.1 の footnote 方式で確定) |
| Q3 | sequential vs 並列 | **sequential** | E-2-α 前 gate は順番に潰す、並列実装はしない |
| Q4 | §14 10 idea の E-2 期間導入を選択 | **14.1 + 14.2 + 14.4 + 14.5 + 14.8 を必須** | (14.1 preflight / 14.2 L3 audit / 14.4 fail-closed / 14.5 reversibility / **14.8 FORCED_CANARY Production 禁止 canon 化** 追加) |
| Q5 | drill scenarios 5 個承認 | **YES** | ただし E-2-α 前 drill は **canary / non-production 相当** で実施、**Production env には触らない** |
| Q6 | Sentry baseline 取得方法承認 | **YES** | read-only、secret 露出なし。**Sentry 未設定 / 取得不能なら E-2-3 で blocker として記録** |
| Q7 | L3 read fail-closed canon 確定 | **YES** | L3 read 失敗時は Mirror OFF |
| Q8 | E-2-1 Supabase migration 承認 | **条件付き YES** | **migration PR 起票は承認**。ただし **DB apply / Production 適用は別途 CEO 承認まで禁止**。**migration + runtime read を一気に大きくしすぎる場合は E-2-1a / E-2-1b に分割** |

### 16.1.1 CEO 追加補正 (Phase E 全期間遵守、本 PR review 時に明示要求)

1. **E-2-1 PR splitting 方針**:
   - **「migration を PR に入れること」と「DB へ apply すること」を明確に分離** (PR review = code change のみ、apply = 別 step CEO 直接承認後)
   - migration + runtime read の合計 diff が大きい場合は **E-2-1a (migration + audit table + RLS、SQL/docs only) + E-2-1b (runtime read code + tests + integration)** に分割
   - **Claude 判断**: 推定 diff ~595 lines (§13.2 概算)。境界線にあるため **split 推奨** (本 doc §2.2 参照)

2. **E-2-1 段階の Production 禁止事項** (canon、本 PR で明示固定):
   - **Production env 変更禁止** (E-2-α まで)
   - **Production DB apply 禁止** (CEO 明示承認後のみ apply 可)
   - **all-Preview env 変更禁止**
   - **Development env 変更禁止**

3. **L3 kill switch 必須要件** (canon、本 PR で明示固定):
   - **fail-closed** (read 失敗 → Mirror OFF、Q7 で確定)
   - **監査ログあり** (L3 flip ごとに audit trail row insert、§14.2 の `coalter_mirror_kill_switch_audit` table)
   - **rollback 容易性あり** (Supabase Studio で flag 値を元に戻すだけで即時復旧、L3 flip → L3 unflip が atomic operation)

4. **FORCED_CANARY Production 投入禁止を Phase E canon として明記** (§14.8 を canon 昇格):
   - `NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED` は **canary branch-scoped Preview のみ**
   - **Production / all-Preview / Development scope への投入を永続禁止**
   - E-2-1 PR 同梱で `docs/coalter-aoo-canary-deploy-anti-patterns.md` に新 anti-pattern 1.6 として追記

### 16.1.2 E-2-1 split 判断 (CEO Q8 補正反映、Claude 推奨)

Q8 補正に従い、E-2-1 を以下に分割することを推奨:

| Sub-PR | scope | 推定 diff | DB apply | 起票順 |
|---|---|---|---|---|
| **E-2-1a** | Supabase migration SQL + audit table + RLS policies + trigger function + 移行 runbook (docs / SQL only、**runtime code 0 diff**) | ~250 lines | **migration PR 着地 = SQL 投入のみ、Production DB apply は別途 CEO 承認** | 1 |
| **E-2-1b** | runtime read code (`lib/coalter/mirror/runtimeKillSwitch.ts` + MirrorHost 統合) + L1 script + L1 + L3 operator runbook + tests | ~350 lines | (DB 変更なし、E-2-1a apply 済 が前提) | 2 (E-2-1a merge + Production DB apply 後) |

→ 合計 ~600 lines を 2 PR に分割、各 PR が独立 review 可能、Production DB apply gating が明示される。

### 16.2 次 PR 案 (推奨 sequential)

| PR | branch | scope | 期間 | 起票 timing |
|---|---|---|---|---|
| 本 PR (E-2-0) | `docs/coalter-aoo-phase-e2-0-sequencing` | docs sequencing | 1 day | merge 待ち |
| E-2-1 | `feat/coalter-e2-1-kill-switch-foundation` | kill switch L1 + L3 (migration + runtime + tests + runbook) | 3-5 days | 本 PR merge + Q1-Q8 answer 後 |
| E-2-2 | `feat/coalter-e2-2-allowlist-option-a` | allowlist Option A (runtime + tests) | 2-3 days | E-2-1 merge 後 |
| E-2-3 | `feat/coalter-e2-3-sentry-baseline-drill` | Sentry baseline doc + drill runbook + canary drill | 3-5 days | E-2-2 merge 後 |
| E-2-α | `feat/coalter-e2-alpha-production-rollout` | Production env touch + 7-day 観測 + 反転テスト | 1 day env 投入 + 7 days 観測 | E-2-3 drill PASS + preflight PASS + CEO 直接承認 |

### 16.3 推奨実装候補 (本 PR merge 後の最初の PR)

**Claude 推奨**: **E-2-1 (kill switch foundation)** を最初に起票。理由:
- L1 + L3 が **すべての他 sub-phase の安全網**
- Supabase migration が含まれるため CEO 直接承認のレビュー時間が必要 → 早めに着手
- allowlist (E-2-2) より先に kill switch が main にあれば、E-2-2 実装中も kill switch が available

---

**End of Phase E-2-0 sequencing plan.** 本 doc は Phase E-2-1 〜 E-2-α 全期間の永続 reference。E-2-1 〜 E-2-α 起票 PR は本 doc §X.X を参照し、設計逸脱がないか自己 audit する。
