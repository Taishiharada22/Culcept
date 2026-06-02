# Reality Control OS — Stage 4-A: Runtime Connection Preflight / Threat Model / Call-site Audit

> 起草: Build Unit / 2026-06-03 / **設計＋pure 検証器のみ・実 runtime 未接続・実データ未読取**
> 位置づけ: 純粋核（`lib/plan/reality/` 14 module）＋接続層 skeleton（input-adapter / shadow-runner / dev-report）が完成。
> 本書は **「初めて実ユーザーデータに触れる」前の最終設計ゲート**。コード接続はまだ行わない。
> GPT 監査（2026-06-02）「実 runtime 接続に GO を出す前に preflight 設計を挟め」を受け、独立推論で精密化した。

---

## 0. なぜ runtime 接続前にこのゲートが要るか

純粋核＋fixture テストと「実 PlanClient データを読む」の間には、**redaction 境界が実データで未検証**という本質ギャップがある。read-only/shadow/dev-only でも、adapter か redaction にバグがあれば raw（title / location / user text / 第三者名 / 実 id）が dev 出力・ログ・あるいは誤って本番 path へ漏れうる。

**従来の連携設計書 §2 は "shadow/dev-only だから安全" と書いていたが、これは GPT が正しく指摘した通り危険**。安全は「どこから呼ぶか・どの flag で守るか・raw が流れないか・失敗時に黙って落ちるか・CI で漏れを検知できるか」を *設計し検証* して初めて成り立つ。本書はそれを定義する。

---

## 1. Call-site Audit — どこから呼び得るか / 最小接続先

### 1.1 呼び出し候補の網羅（現状: **どこからも呼ばれていない**）

`runShadow` / `buildRealityInput` / `aggregateShadowReport` を import し得る場所:

| 候補 call-site | 実データ到達性 | 現状 | 将来の扱い |
|---|---|---|---|
| `app/(culcept)/plan/PlanClient.tsx`（anchors＋DayGraph を既に保持） | **高**（実 anchor/DayGraph） | 未 import | Stage 4-B 候補。ただし **client は不可**（raw が client bundle/DOM に出る） |
| Server Action（plan 系） | 高 | 未 import | dev-only gate 付きで候補 |
| `app/api/**`（route handler） | 高 | 未 import | dev-only gate 付きで候補 |
| cron / 通知 worker | 中 | 未 import | Stage 5+（push 段階） |
| test fixture | なし（合成） | ✅ 唯一の呼び出し元 | 現状維持 |

**結論（call-site）**: 現状の唯一の呼び出し元は test。Stage 4-B の最小 call-site は **server 側 1 箇所（Server Action か route handler の dev-only 分岐）に限定**。client からは呼ばない（raw が client に渡る経路を作らない）。

### 1.2 最小 DATA 表面（GPT を超える点 ①）

GPT は「最小 call-site」を求めたが、**より重要なのは最小 DATA 表面**。連携設計書 §1.1 は anchors＋DayGraph＋seeds＋Genome＋state の全写像を想定するが、Stage 4-B の *唯一のゴール* は「**redaction が実データで保たれるか**の確認」。ゴール駆動（逆算）すれば、最初の実データ接触は **境界を exercise する最小読取**で足りる:

- **第 1 段（4-B-1）**: `anchors` + `DayGraph` のみ（`buildRealityInput` の最小引数）。seeds / Genome / state は読まない。
  - 理由: redaction で最も危険なのは **自由文を運ぶ `SourceTrace.reason ← PlanSeed.desiredAction`**（§3 R1）。seeds を含めない第 1 段で id 系 redaction を先に検証し、自由文経路は第 2 段に分離する。
- **第 2 段（4-B-2）**: seeds を追加（自由文経路を allowlist guard 下で検証）。
- Genome / mood / energy は prior/補助ゆえ後段。

各段とも **出力は `assertRedacted` を必ず通す**（§3）。1 件でも `clean=false` なら即 no-op（§5）。

---

## 2. Multi-layer Fail-closed Gate（GPT を超える点 ②: env だけに頼らない）

GPT は「default off / production off / dev-only」を求めた。env flag は必要だが **単層では不十分**（env 設定ミスで本番有効化のリスク）。**3 層の fail-closed** を設計する:

```
層1  env flag         PLAN_FLAGS.realityShadowDevOnly（既定 false / production 強制 false）
層2  module boundary  実 runtime 接続関数は integration barrel から *再 export しない*。
                      dev-only entry（例: lib/plan/reality/integration/dev-runtime.ts）からのみ到達。
層3  capability arg    接続関数は明示トークン引数 { devOnly: true } を要求。production code path
                      では取得経路が無い。引数欠落 → no-op。
```

- **production = 構造的 no-op**: `process.env.NODE_ENV === "production"` で層1 が必ず false。さらに層2 で本番 import 経路が存在しない。
- **flag が無い / 不正 / production** のいずれでも **必ず no-op**（例外を投げない・既存 UX を一切変えない）。
- 既存 canary パターン（`enhanceAlterNotes` の dev/canary gate）を流用。

---

## 3. Redaction Boundary / Threat Model（GPT を超える点 ③: allowlist by construction）

### 3.1 型監査で確定した leak 表面（file:line 根拠）

| # | 箇所 | 内容 | 判定 |
|---|---|---|---|
| **R1** | `RealityInput`（input-adapter.ts:175-183） | `DayNode.id`(:102) / `anchors` map キー(:200) / `SourceTrace.ref ← s.id`(:144) ＝実 id。**`SourceTrace.reason ← s.desiredAction`(:144) ＝自由文**（plan-seed.ts:45 `desiredAction?: string`、元発話 `signal` 由来） | **内部型として正当だが出力厳禁** |
| **R2** | `ShadowSummary`（shadow-runner.ts:56-67） | `bestRef`/`rejected[].ref` は `refOf`（raw id→`c{i}`）で redact(:90-98)、`line` は手組み(:120-123)。**三つとも型は `string`** | 今日 safe だが「規律」依存。一編集で raw 混入しても **型は通る** |
| **R3** | `DevReportRedacted`（dev-report.ts:25-38） | counts/enum のみ、ref 無し | **構造的に safe**（テスト済） |

### 3.2 境界規則

- **R1**: `RealityInput` は kernel 内部入力。**serialize / emit / log しない**。dev 出力に出してよいのは `ShadowSummary` / `DevReportRedacted` のみ。
- **R2**: `ShadowSummary` の全 string-leaf を **allowlist 表明**で構造化する（規律→構造）。
- **R3**: `DevReportRedacted` の ref-free 状態を表明で固定する。

### 3.3 allowlist > blocklist（革新点）

「既知 raw を消す」blocklist は **テストした raw しか守れない**。代わりに **出力 string を既知の安全語彙だけに許す allowlist** を採る → **想定外の漏洩まで捕捉**。

実装済（pure・runtime-unconnected）: **`lib/plan/reality/integration/redaction-guard.ts`**
- 安全語彙 = EngineMode / GateKind / RiskLevel / DeliveryMode の enum ∪ ephemeral ref `^c(\d+|\?)$` ∪ invariant id `^INV-\d+$`。
- `line` は **厳密文法**（`SHADOW_LINE`、shadow-runner の構築と一致。`delivery=渋谷…` 等の混入を弾く）。
- `assertRedacted(v) → { clean, offendingPaths }`：違反は **JSON path のみ**返す。**offending な raw 値は戻り値に含めない**（検出器自身が leak-safe ＝ verdict をログ/集計しても raw は漏れない）。
- 型付き wrapper: `assertShadowSummaryRedacted` / `assertDevReportRedacted`。
- **tripwire**: 万一 `RealityInput` を誤って出力に混ぜると、`SourceTrace.reason`(自由文)/`ref`(実 id) が allowlist 違反として flagged される（テスト実証済）。

### 3.4 N-version redaction（Stage 4-B 用に文書化・今は未実装）

最高 stakes の漏洩防止策として、redaction の **独立二重化**を将来オプションとする: redacted 出力を、redactor とは *別系統* の `assertRedacted` で再走査し、不一致なら abort。今は過剰（rule ③ シンプル優先）ゆえ未実装。Stage 4-B で実データ量が増えた段で再検討。

---

## 4. Report Policy

- **最初は関数戻り値の redacted object のみ**（`ShadowSummary` / `DevReportRedacted`）。
- **console.log 禁止 / file 出力禁止 / DB 保存禁止**。画面表示・保存・送信は **別承認**（Stage 4-C 以降）。
- dev 観測は「戻り値を test/dev harness で受け、`assertRedacted` を通してから counts を見る」に限る。

---

## 5. Failure Behavior（fail-closed・既存 UX 不変）

| 失敗 | 挙動 |
|---|---|
| flag 無し / 不正 / production | **no-op**（何も実行しない） |
| adapter 失敗（時刻 parse 不能等） | 当該 anchor/node を skip（`eventNodeToDayNode` は既に null 返し）。全滅なら no-op |
| kernel 失敗（rank/gate 例外） | catch → no-op。例外を既存 UX に伝播させない |
| **redaction 失敗（`assertRedacted.clean=false`）** | **出力を破棄し no-op**。redacted な `offendingPaths.length` のみ dev カウント可（raw は出さない） |
| データ欠損 | 部分入力で続行 or no-op。silent に壊さない |

原則: **どの失敗でも raw を出さず、既存 DayGraph/通知/UI を 1mm も変えない**。

---

## 6. Test Plan（一部は **既に実行済**）

| 検証 | 状態 |
|---|---|
| raw 文字列が出力（`JSON.stringify`）に出ない | ✅ 実装済（shadow-runner test / redaction-guard keystone） |
| 実 id を持つ候補 → 出力は `c{i}` に redact | ✅ keystone test（`cand(RAW)` → bestRef `c0`、JSON に RAW 不在） |
| allowlist が enum/ephemeral/INV を許可・raw を拒否 | ✅ redaction-guard test |
| `line` 文法が注入を弾く | ✅ redaction-guard test |
| verdict が leak-safe（raw 値を含まない） | ✅ redaction-guard test |
| `DevReportRedacted` は常に clean | ✅ redaction-guard test |
| RealityInput 誤出力で自由文/id が flagged（tripwire） | ✅ redaction-guard test |
| **production flag で no-op** | ⏳ Stage 4-B（gate 実装時。今は接続関数自体が無い） |
| **flag off で呼ばれても何も起きない** | ⏳ Stage 4-B |

→ **redaction 境界の検証は pure harness として先行完了**。残りは gate（接続関数）実装時に追加。

---

## 7. 禁止事項（Stage 4-A で引き続き厳守）

まだ実 runtime から呼ばない。以下は全て禁止:
**route / UI / PlanClient / Server Action 接続、実ユーザーデータ読取、console.log / file 出力、DB 保存 / migration、push 送信 / 通知 queue、PRM 実更新、native SDK、Routes API 課金、自動予定変更。**
raw（title / location / user text / 第三者名 / raw source signal / 永続 id / anchor id / source id / location id）を出さない。

---

## 8. Stage 4-A 成果物（本ゲートで実装したもの）

- ✅ 本設計書（call-site / gate / threat model / report / failure / test / 禁止）
- ✅ `lib/plan/reality/integration/redaction-guard.ts`：**pure allowlist 検証器**（実データ・runtime に一切触れない）
- ✅ `tests/unit/realityRedactionGuard.test.ts`：adversarial 14 tests（keystone で実 `runShadow` 出力を検証）
- ✅ 全 reality 198 tests PASS / full tsc 総エラー 0 / ts-nocheck なし

**未着手（要 CEO 承認）**: Stage 4-B = 多層 gate（env+module+capability）実装 ＋ server 側 dev-only call-site から **最小 DATA 表面（anchors+DayGraph）** で `runShadow` を実走 → `assertRedacted` 通過確認。**ここが初めて実ユーザーデータに触れる一線**。

---

## 9. CEO 判断ポイント

1. 本 Stage 4-A（preflight 設計＋pure redaction guard）を実データ接続前ゲートとして承認するか
2. 次（Stage 4-B）= 多層 gate 実装 ＋ **最小 DATA 表面での dev-only 実走** に進むか（**初の実データ接触**・要明示承認）
3. それとも一旦停止して全体レビューか
