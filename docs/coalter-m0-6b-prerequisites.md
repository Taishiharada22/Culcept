# CoAlter Stage 1 Understand — M0-6B 着手前提（正式）

**locked 2026-04-20 / CEO 承認前提 / 実装未着手**

本書は M0-6B（実 API shadow 接続 + 内部ペア少数）の **着手可否判定の唯一の基準** を定義する。
ここに書かれた前提 3 件 + CEO 明示承認が揃わない限り、`lib/coalter/understanding/`
配下に実 API adapter を追加しない / env var に実キーを設定しない。

---

## 1. 内部ペア運用フロー（1 枚）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 内部ペア = 既存 2 アカウント A / B を 1 組として使う                │
│ (新規アカウント作成は行わない)                                       │
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼
  ┌────────────────────────────────┐
  │ ① 内部対応表（CEO 手元 local）    │
  │   pairHash ⇆ { userIdA, userIdB } │
  │   email / displayName は記録せず   │
  │   supabase から userId を引くのみ  │
  └────────────────────────────────┘
              │
              ▼
  ┌──────────────────────────────────────────────┐
  │ ② 匿名化 export スクリプト（M0-6B で追加予定）    │
  │    input:  { pairHash, sessionIds[] }           │
  │    output: internal-pair-<pairHash>.json        │
  │      - email / displayName / userId は含めない  │
  │      - turns.body は含めない（M0-4 compress で既にブロック） │
  │      - ObservationBundle 構造化フィールドのみ     │
  │      - pairHash のみ識別子として使用             │
  └──────────────────────────────────────────────┘
              │
              ▼
  ┌────────────────────────────────┐
  │ ③ replay runner (shadow-only)     │
  │    scripts/coalter/shadow-real-api │
  │    (M0-6B で追加予定、本書時点で未実装) │
  │    - env COALTER_UNDERSTANDING_LLM_SHADOW=1 │
  │    - adapter: Anthropic ZDR endpoint │
  │    - DB / analytics / log に書込なし │
  └────────────────────────────────┘
              │
              ▼
  ┌────────────────────────────────┐
  │ ④ 集約出力（stdout のみ）          │
  │    - mode 別 modeAgreement          │
  │    - llmOutcome 分布                │
  │    - latency p50/p95/p99            │
  │    - confidenceDelta 分布           │
  │    prompt / raw output は stdout にも出さない │
  └────────────────────────────────┘
              │
              ▼
  ┌────────────────────────────────┐
  │ ⑤ 手書きで decision-log.md に転記   │
  │    （自動保存しない、集計値のみ）    │
  └────────────────────────────────┘
```

## 2. Consent / 匿名化 / 保持 / 削除ポリシー

### 2.1 Consent

- **対象**: 既存 2 アカウント A / B のオーナー（= CEO 含む内部関係者 2 名）
- **形式**: `docs/coalter-internal-pair-consent-2026-04.md` として本人署名相当の
  記述を残す。署名は **git commit の author 情報 + 本文内の本人確認** で代替する
  （法務契約書は不要、内部検証目的のため）。
- **同意文言の必須要素**:
  1. 既存の会話履歴を Stage 1 Understand の shadow 評価に使うこと
  2. Anthropic ZDR 経由で LLM に送信すること（prompt は構造化フィールドのみ、
     turns.body / email / displayName / userId は含まない）
  3. 生成された LLM 出力は DB / analytics / log に保存しないこと
  4. M0-6B 完了後 or 同意撤回時に `internal-pair-*.json` を削除すること
  5. 撤回申し出はいつでも可能（email または口頭、記録は CEO 管理）

### 2.2 匿名化（export 時点での強制事項）

| 項目 | 処理 |
| --- | --- |
| `email` | export に含めない |
| `displayName` | export に含めない |
| `userId` (supabase) | export に含めない。代わりに `pairHash` + `side: "a"/"b"` で表現 |
| `turns.body` | export に含めない（M0-4 `compressTodayInput` の `_COMPRESS_GUARD` で既に構造的禁止） |
| `pairHash` の算出 | `sha256(userIdA + ":" + userIdB + ":" + pepper)[0..16]`、pepper は CEO 手元 `.env.local` のみ |
| `sessionId` | export に含めてよい（内部識別のため）。ただし LLM prompt には投入しない |

### 2.3 Export 形式 `internal-pair-*.json`

- ファイル名: `internal-pair-<pairHash>.json`
- 保存場所: `scripts/coalter/internal-pairs/`（**`.gitignore` 済み、repo には commit しない**）
- スキーマ: M0-6B 実装時に TS 型を `lib/coalter/understanding/__testkit__/` に追加
  （`ObservationBundle` の部分集合、匿名化済みフィールドのみ）
- 生成者: CEO 手元の tsx script（`scripts/coalter/export-internal-pair.ts` を
  M0-6B で追加予定）
- 検証: 生成直後に `scripts/coalter/leak-audit.sh` + `leakAudit.test.ts` で漏洩 0 確認

### 2.4 保持 / 削除 / ローカル保護

| 段階 | アクション |
| --- | --- |
| 生成時 | CEO 手元 macOS (`~/Culcept/scripts/coalter/internal-pairs/`) のみ。クラウド同期無効（iCloud Drive / Dropbox 対象外ディレクトリに配置） |
| 検証期間 | M0-6B 集計完了まで（想定 7 日以内） |
| 削除トリガ | 以下いずれか: (a) M0-6B shadow 集計完了 (b) 昇格判定完了 (c) 同意撤回 (d) 上記いずれでもない場合でも 30 日経過 |
| 削除手順 | `rm -rf scripts/coalter/internal-pairs/` + `docs/decision-log.md` に削除記録 |
| バックアップ | 禁止（Time Machine 含む対象外フォルダに配置） |

**[CEO lock 2026-04-20 追加]** 対応表 `~/.coalter/pair-map.json` および
`scripts/coalter/internal-pairs/` のローカル保護は以下を必ず実施する:

| 項目 | 設定内容 |
| --- | --- |
| ディレクトリ権限 | `chmod 700 ~/.coalter/` / `chmod 700 scripts/coalter/internal-pairs/` （owner のみ rwx） |
| ファイル権限 | `chmod 600 ~/.coalter/pair-map.json` / 各 `internal-pair-*.json`（owner rw のみ、group / other 参照不可） |
| Time Machine 除外 | `tmutil addexclusion ~/.coalter/` および `tmutil addexclusion scripts/coalter/internal-pairs/` をセットアップ手順に含める |
| iCloud Drive / Dropbox | dotfile (`~/.coalter/`) はデフォルト同期対象外。ただし `~/Documents/` 等にエイリアス／シンボリックリンクを張らないこと |
| 3rd-party バックアップ | Backblaze / Arq 等を利用している場合はユーザー責任で対象フォルダを除外設定する（設定確認はセットアップ時に CEO が明示チェック） |
| 手順書 | M0-6B セットアップスクリプト追加時に、上記 `chmod` / `tmutil` を初期化ルーチンに組み込む |

---

## 3. M0-6B 前提 3 件 — 証拠物の形

着手可と判定するための **「何をもって揃ったと判断するか」** を証拠物レベルで定義する。
すべて **docs/ に commit 可能な形** で残し、CEO が単独で確認できる状態にする。

### 前提 ① — 内部ペア 20 件以上の consent / 匿名化経路

**証拠物**:

| 種別 | 格納場所 | 必須記述 |
| --- | --- | --- |
| Consent 記録 | `docs/coalter-internal-pair-consent-2026-04.md` | §2.1 の必須要素 5 項目を満たす文書。A / B それぞれの同意記録 |
| 対応表メモ | **repo 外**（CEO 手元 `~/.coalter/pair-map.json`） | pairHash ⇆ userId の内部対応表。**repo には commit しない** |
| 匿名化テスト | `tests/unit/coalter/understanding/internalPairExport.test.ts` （M0-6B で追加） | export 関数出力に email/displayName/userId/body が含まれないことを assert |
| ペア多様性注記 | `docs/coalter-m0-6b-prerequisites.md`（本書） | 「ペア多様性 = 1 のため Gate A-4 は着手条件としては OK だが、昇格判定では加重を下げる」旨を明記 |
| セッション件数 | replay 入力 JSON のメタデータ | `sessions.length >= 20` を満たす shadow 実行 1 回のログを `docs/coalter-m0-6b-shadow-run-<日付>.md` に集計値転記 |

**NG 条件**: 上記いずれかが欠けていれば着手不可。**email / userId / 本文が commit 可能ファイル側に記録されていた時点で即 NG**。

### 前提 ② — Anthropic ZDR 構成確認

**証拠物**:

| 種別 | 格納場所 | 必須記述 |
| --- | --- | --- |
| ZDR enrollment 確認 | `docs/coalter-m0-6b-zdr-evidence.md` | Anthropic Console で ZDR が有効化されている組織の organization id（prefix のみ）と、`console.anthropic.com/settings/data-retention` のスクリーンショット（PNG は repo には commit しない、記載日のみ残す） |
| API endpoint 確認 | 同上 | shadow 実行で使う API key が所属する組織が ZDR enrolled organization と一致することの確認手順 |
| Key 管理 | `.env.local`（commit しない） | `COALTER_UNDERSTANDING_SHADOW_API_KEY` 名で保持。prod key とは別 key を発行 |
| 非 ZDR 時のフェイルファスト | M0-6B 実装の adapter 側 TODO として記載 | ZDR 無効 org の key が検出されたら起動時に throw |

**NG 条件**: ZDR 有効化が書面で確認できない時点で着手不可。prod key と同一 key を使う場合も着手不可。

### 前提 ③ — prompt / raw output / PII 非保存の code review

**証拠物**:

| 種別 | 格納場所 | 必須記述 |
| --- | --- | --- |
| 静的監査 | 既存 `scripts/coalter/leak-audit.sh` の PASS ログ | M0-6B adapter 追加後に再実行、全 4 identifier OK |
| runtime 監査 | 既存 `tests/unit/coalter/understanding/leakAudit.test.ts` の PASS | M0-6B adapter を含めた状態で全テスト PASS |
| code review 記録 | `docs/coalter-m0-6b-code-review.md` | CEO or Build Unit 担当者 1 名による review PASS log。チェック項目: (a) adapter が DB/analytics/log に書込なし (b) prompt 組立関数が `turns.body` / `email` / `displayName` / `userId` を参照しない (c) catch した exception に raw output を含めない (d) console.log 経路がない |
| PR or commit 参照 | review 対象の commit hash を review 文書に記載 | review 対象の diff 範囲を明示 |

**NG 条件**: review 文書に commit hash が無い / チェック項目 4 つの明示 PASS 記録が無い場合は着手不可。

---

## 4. M0-6B 着手可否 判定チェックリスト

以下を **all-of** で満たし、かつ CEO の明示承認（decision-log.md へのエントリ）が揃った時点で M0-6B に着手可。

```
[ ] 前提① consent / 匿名化
    [ ] docs/coalter-internal-pair-consent-2026-04.md 作成、2 名分の同意記録あり
    [ ] §2.1 の必須要素 5 項目を満たす
    [ ] ペア多様性=1 の注記が本書に明記されている（↑済み）
    [ ] 対応表は repo 外に配置、commit されていない
    [ ] 対応表 / internal-pairs/ に chmod 700/600 + Time Machine 除外が適用済み
    [ ] sessions.length >= 20 が揃っている

[ ] 前提② Anthropic ZDR
    [ ] docs/coalter-m0-6b-zdr-evidence.md 作成
    [ ] Console での ZDR 有効化確認
    [ ] shadow 用 API key が ZDR enrolled 組織 + prod と別 key
    [ ] adapter の fail-fast 実装 TODO が明記されている

[ ] 前提③ code review
    [ ] leak-audit.sh PASS (M0-6B adapter 追加後)
    [ ] leakAudit.test.ts PASS (M0-6B adapter 追加後)
    [ ] docs/coalter-m0-6b-code-review.md 作成、4 項目 PASS 記録
    [ ] review 対象 commit hash 記載

[ ] CEO 明示承認
    [ ] docs/decision-log.md に「[CoAlter M0-6B 着手承認]」エントリ

[ ] 本書（coalter-m0-6b-prerequisites.md）の変更が無い
    （仕様ずらしが混入していないことの sanity check）
```

**いずれか 1 つでも未達** の時点で、`lib/coalter/understanding/` に実 API adapter を
追加する / `.env.local` に実キーを設定する / shadow-real-api を実行する の **3 つは禁止**。

---

## 5. 本書更新ルール

本書の内容は M0-6B 着手判定の基準点であるため、以下ルールで保守する:

- 変更は CEO 承認済みの decision-log.md エントリ経由でのみ実施
- 証拠物の形を緩めること（例: 「code review は口頭でも可」など）は不可
- 証拠物の形を **強める** 方向の改訂は CEO への申請のみで OK
- 着手後に発覚した漏洩リスクは即時に本書に反映し、以後の shadow 実行を停止する

---

## 関連ドキュメント

- [coalter-m0-promotion-gates.md](./coalter-m0-promotion-gates.md) — M0 昇格 Gate（正式版）
- [coalter-m0-6a-challenge-agreement-memo.md](./coalter-m0-6a-challenge-agreement-memo.md) — M0-6A challenge 60% 切り分け
