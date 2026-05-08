# CoAlter Stage 2.4-B UI 到達性 Smoke 手順書 (CEO 確認待ち)

> **status: Stage 2.4-B 手順書 draft / CEO 確認待ち (2026-05-08 起草)**
> **本書承認後 → CEO 別指示で Preview smoke 実施**。CEO 承認なしで Preview 検証に入らない。
> 由来: Stage 2.4-A1-3 routing spec (`34067d98`) + A2 selector test lock (`e14682cd`)。actual UI 経由で routing spec の各 variant が想定 state で発火するかを Preview env で観測する。

---

## §0 本書の位置づけ

### 0.1 目的
Stage 2.4-B = **UI 到達性 smoke**。selector 単体ではなく **end-to-end (UI → state machine → patternSelector → speech route → UI 表示)** で actual routing state での variant 発火と発話品質を観測する。

### 0.2 背景 (I-10)
Stage 2.3 quality review fixture (`scripts/coalter/stage23-variant-quality-review.ts:112-119`) で **B=S3 / C=S4 / F1=S6** の不整合 state を fixture として LLM 出力品質を検証していた。actual routing state (B=S5 / C=S2,S5 / F-1,F-2=S7) での LLM 挙動は本 review で **直接観測されていない** (routing spec §4 / Appendix B)。本 smoke で actual state 経由の発話本文を初回観測する。

### 0.3 構成
- §1 前提条件 (Preview release / env / 観測ツール)
- §2 Variant 別 smoke シナリオ matrix
- §3 各シナリオで観測する 9 項目
- §4 F-1 特別観察 (3 ケース分類、曖昧 PASS 不可)
- §5 PASS / Yellow / NG 判定基準
- §6 実施手順 step-by-step
- §7 結果報告フォーマット
- §8 不可侵境界
- §9 後続フェーズへの橋渡し

### 0.4 本書範囲外
- selector 単体テスト (Stage 2.4-A2 で完了、`e14682cd`)
- UI timeout / fallback 動作確認 (Stage 2.4-C)
- production-ready audit (Stage 2.4-D)
- impl 修正 (本書 smoke 結果から判断、CEO 個別承認後に別タスク)
- Stage 2.3 fixture 修正 / 再 quality review (Stage 2.4-D で個別判断)

---

## §1 前提条件

### 1.1 Preview release 確認

| 項目 | 期待値 | 確認方法 |
|---|---|---|
| Preview deploy commit HEAD | `e14682cd` 以降 (A2 commit を含む) | Vercel dashboard / `gh` CLI / `git log --oneline -5` |
| Preview URL | CEO 提示要 | Vercel dashboard で対象 branch (`feat/coalter-three-stage`) の Preview URL を取得 |
| Sentry release tag | Preview HEAD と一致 | Sentry > Releases で確認 |
| Sentry environment | `vercel-preview` | Sentry > Issues > environment filter |

> Preview HEAD が `e14682cd` 未満 (A2 commit を含まない) の場合は再 deploy 待ち。observation 開始前に必ず HEAD 一致を確認。

### 1.2 env vars 確認 checklist (Preview env、必須)

| env var | 期待値 | 役割 | 未設定時の影響 |
|---|---|---|---|
| `COALTER_PRESENCE_SPEECH_LLM` | `true` | speech route gate 1 (server LLM 経路有効化) | OFF → `source="static"` `fallbackReason="flag_off"` のみ観測、LLM 挙動観測不能 |
| `ANTHROPIC_API_KEY` | (任意の有効キー) | speech route gate 2 (LLM API call) | 未設定 → 同上 (`flag_off`) |
| `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR` | `true` | client UI で Presence executor を mount | OFF → 上部レイヤー UI が出ず、本 smoke 自体が成立しない (前 S0 で停止) |
| **`NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH`** | **`true`** | **client side で `/api/coalter/speech` への fetch を有効化 (`speechFetchGate.ts:29` の二重 gate client 側)** | **OFF → fetch 起動ゼロ、本 smoke が成立しない (server 側は呼ばれず)** |
| **`NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE`** | **`true` (任意) / 未設定 / `false`** | **Phase 2 観測モード (`speechFetchGate.ts:53`)。ON で session cache + negative cache を skip、effect deps に signal 一意 key を含めて全 signal で再 fetch。OFF で通常 cache 経路** | **ON/OFF どちらでも smoke 実施可。ただし状態は §1.2.1 規約に従い必ず記録、ON 時は通常 run と分離** |
| `NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT` | (default `true` で OK) | legacy CoAlterCard 自動挿入 (Phase 6.C+ Dispatcher と独立) | 既定値で OK、本 smoke では特別変更不要 |
| Sentry DSN | (Vercel 既定) | breadcrumb ingest 先 | 未設定 → breadcrumb 観測不能 |

**check 手順**: Vercel dashboard > Settings > Environment Variables で Preview env を確認。**全 env var が揃わない場合、本 smoke は実施しない**。CEO に状況報告 → 環境整備後に再開。

#### 1.2.1 Observation mode 記録規約 (CEO 厳守)

`NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE` は Stage 2.4-B 実施に必須ではないが、**ON / OFF 状態を全シナリオで必ず記録** する (§7.2 サマリに entry 必須)。

- **OFF (= 通常 run、default)**: cache / dedupe 経路含む production-equivalent 挙動を観測。Stage 2.4-B 「actual UI reachability」の本来観測対象。
- **ON (= observation run)**: cache skip により同 (variant, state, mode) で連続 sample が取れる。多数 sample / 統計性が必要な場合のみ。Production 不変原則で **絶対 Production に入れない**。

**運用規約**:
1. 通常 run と observation run は **必ず分離記録**。同 sheet に混在禁止
2. observation mode ON での実施は **「通常 run の補助」位置付け**。primary 観測は OFF run で行う
3. observation mode が ON の場合、§7.2 サマリで明示、PASS / Yellow / NG 判定も run 別に算出
4. observation mode 切替は env 変更 → Vercel re-deploy 経由 (smoke 中の動的 toggle 不可)

### 1.3 観測ツール

#### 1.3.1 Sentry breadcrumbs (4 category、本 smoke の主観測線)

| category | message | level | payload |
|---|---|---|---|
| `coalter.presence` | `coalter.presence.state_transition` | info | `pairId, from, to, trigger, ts` |
| `coalter.pattern` | `coalter.pattern.used` | info | `pairId, variant, state, mode, hasSecondary, speechSource, retries, latencyMs, validationFailed, fallbackReason, ts` |
| `coalter.mode` | `coalter.mode.transition` | info | `pairId, from, to, trigger, ts` |
| `coalter.urgent` | `coalter.urgent.triggered` | warning | `pairId, category, form, memoryFallback, ts` |

> **本 smoke の中心は `coalter.pattern.used`**。variant / state / mode / hasSecondary / speechSource を直接読む。
> **観測場所**: Sentry > Issues / Discover で session を絞る。breadcrumb 単体 event として観測されるかは Sentry 設定に依存 (transaction / session 内 trail で確認可)。

#### 1.3.2 Network panel (Browser DevTools)

| endpoint | method | observation |
|---|---|---|
| `/api/coalter/speech` | POST | request body (`variant, state, mode, context`) と response body (`body, tone, source, retries, latencyMs, validationFailed, fallbackReason, secondaryLine?`) を読む |

#### 1.3.3 UI 上部レイヤー (visual)

- 上部レイヤーカードに表示される **variant 発話本文** を目視 + screenshot で記録
- chip / 副次同伴行 (F-2 主 + F-1 副次) も記録
- I-10 対策の中心観測線

### 1.4 Synthetic input / PII 禁止 (CEO 厳守)

Stage 2.4-B smoke 実施・記録・共有のすべての段階で **synthetic input のみ** を使用する。実在情報の混入を絶対禁止する。

#### 1.4.1 禁止する入力

| 種別 | 例 (NG) | 代替 (synthetic OK 例) |
|---|---|---|
| 実在人物名 | 親族 / 友人 / 配偶者 / 同僚の実名 | 「Aさん」「Bさん」「相手」「パートナー」等の汎称、もしくは明確に架空名 |
| 実住所 | 自宅 / 職場 / 知人住所 | 「ある場所」「最寄り駅」等抽象、もしくは明確に架空地名 |
| 実予定 | 実際に予定された会食 / 旅行 / 面談 | 「夕食を一緒に取る予定」等抽象、もしくは明確に架空シナリオ |
| 実関係トラブル | 自分・他者の実際の関係問題 (配偶者・親子・友人間) | 「意見が違う場面」「すれ違いが起きている状況」等抽象 synthetic |

#### 1.4.2 共有時の規約

- **screenshot 共有**: PII (人名 / 住所 / 連絡先) は redact 必須
- **Network response body 共有 / dump**: synthetic case のみ。実在 PII を含む observation は smoke 結果から除外し、シナリオ自体を synthetic で再実施
- **Sentry breadcrumb / event export**: 実在 PII を含む `pairId` / context 文字列が混入しないよう、synthetic アカウント / synthetic ペアのみで実施

#### 1.4.3 違反時の扱い

PII 混入が観測 / 共有後に判明した場合:
1. 直ちに smoke 中止 (該当 run 全体の結果を破棄)
2. CEO に即時報告
3. synthetic input で再実施

---

## §2 Variant 別 smoke シナリオ matrix

### 2.1 シナリオ 一覧 (12 base scenarios + F-1 特別 3 ケース)

| # | variant | actual routing state | mode | trigger 案 (要 Preview 検証) | expected primary | expected secondary | I-10 観点 |
|---|---|---|---|---|---|---|---|
| **2.1.1** | A | S2 | normal | 関係シグナル検出 + 入口承認 (`infoMissing=false`) | A | (なし) | A は元から actual S2 一致、I-10 影響なし |
| **2.1.2** | A | S2 | daily | 同上 + Daily mode 昇格 | A | (なし) | 同上 |
| **2.1.3** | A | S2 | travel | 同上 + Travel mode 昇格 | A | (なし) | 同上 |
| **2.1.4** | **B** | **S5** | normal | needFraming 立つ user 入力 (要 Preview 検証) | B | (なし) | **I-10 必須**: Stage 2.3 fixture (S3) と異なる actual S5 の発話品質を初観測 |
| **2.1.5** | **C** | **S2** | normal | infoMissing=true (S2 で情報欠落) | C | (なし) | **I-10 必須**: Stage 2.3 fixture (S4) と異なる actual S2 の発話品質を初観測 |
| **2.1.6** | **C** | **S5** | normal | uncertaintyHigh=true (S5 で不確実性) | C | (なし) | **I-10 必須**: actual S5 経由の C 発話品質を初観測 |
| **2.1.7** | D | S5 | normal | oneSidedFatigue=true | D | (なし) | D は元から actual S5 一致、I-10 影響なし |
| **2.1.8** | D | S5 | daily | 同上 | D | (なし) | 同上 |
| **2.1.9** | D | S5 | travel | oneSidedFatigue=true + relationshipSignalsClear=true | D | (なし) | Travel D suppression 解除挙動の確認 (routing spec §2.1 #1) |
| **2.1.10** | E | S5 | normal | needTranslation=true | E | (なし) | E は元から actual S5 一致、I-10 影響なし |
| **2.1.11** | F-2 | S7 | normal | S7 到達 (default) | F-2 | (なし) | F-2 は元から actual S7 一致、I-10 影響なし |
| **2.1.12** | F-2 + F-1 副次 | S7 | daily | S7 到達 + relationshipNoiseHigh=true | F-2 | F-1 (副次) | routing spec §2.2 row 3a |
| **2.1.13** | F-2 + F-1 副次 | S7 | travel | S7 到達 (default) | F-2 | F-1 (副次、常時) | routing spec §2.2 row 4 |
| **2.1.14** | F-1 standalone (試行) | S7 | normal | S7 到達 (F-1 standalone primary trigger を試行) | **要観察** (3 ケース分類、§4) | (なし) | **I-10 必須 + S7 normal F-1 spec 曖昧、§4 で曖昧 PASS 不可** |

### 2.2 trigger 案について (Preview 検証で実際の挙動確認)

`routing spec §3.2 / §3.1` の context flag (`needFraming` / `uncertaintyHigh` / `oneSidedFatigue` / `needTranslation` / `relationshipSignalsClear` / `relationshipNoiseHigh` / `infoMissing`) は **設定主体・閾値が UI spec §9 保留 (CEO 裁定 I-2)**。

**手順**:
1. シナリオごとに想定 user 入力例を試す (例: 2.1.4 B@S5 → 「お互いの考えを整理したい」のような言語化要求)
2. **実際に context flag が立つか** は smoke で観測する (`coalter.pattern.used` breadcrumb の `context` payload、または speech POST request body で確認)
3. 立たない場合は trigger 案を別パターンで試行 (3 回まで)。それでも立たない場合は **「trigger 不明」として記録**、強制発火させない (= 曖昧 PASS 不可)
4. 「routing spec が想定する flag の trigger が UI 経由で出せるか」自体が観測対象

> **不変**: trigger を強制するために `signalAdapter` / `preRouterGate` / `patternSelector` / context flag 設定主体を **触らない**。観測のみ。

---

## §3 各シナリオで観測する 9 項目

各シナリオ実施時、以下 9 項目を全て記録する。**1 項目でも欠けたら不完全観測**として扱う。

| # | 観測項目 | 観測線 | 期待値 (routing spec / A1-3 由来) |
|---|---|---|---|
| 1 | UI 上部レイヤーで variant 発話本文が表示されるか | UI 視認 | variant 別 template に従った発話 (1-6 行、speech template §3-§9) |
| 2 | `coalter.presence.state_transition` breadcrumb の経路 | Sentry | S0 → S1 → S2 → S3 → S4 → S5 (or S2 / S7) → ... → S8 |
| 3 | `coalter.pattern.used` breadcrumb の `variant / state / mode` | Sentry | シナリオ表 §2.1 の expected と一致 |
| 4 | `coalter.pattern.used` の `hasSecondary` | Sentry | 副次同伴がある時 true (F-2 主 + F-1 副次)、それ以外 false |
| 5 | `/api/coalter/speech` POST response の `source` | Network | 期待 `"llm"` (env 揃っていれば)。`"static"` / `"fallback"` の場合は §5 判定基準に従う |
| 6 | speech response `fallbackReason` | Network | `null` (`source="llm"` 時)、または期待された理由 (`flag_off` / `llm_error` / `validation_failed` / `timeout`) |
| 7 | speech response `latencyMs` | Network | LLM 経路で 500ms〜10000ms (timeout 上限)、`source="static"` で 0 |
| 8 | speech response `validationFailed` | Network | `false` (`source="llm"` 通過時)、`true` の場合は §5 判定 |
| 9 | speech response `retries` | Network | 0 (1 発で通過) / 1〜2 (retry 後成功) / -1 (全 retry 失敗で fallback、`source="static"` 時は常 0) |

**観測 fail-safe**:
- 9 項目を smoke 結果 sheet (§7) に必ず記録
- 1 項目でも観測不能 (Sentry 未設定 / Network panel 開き忘れ等) なら **当該シナリオは「観測不完全」マーク**、再実施

---

## §4 F-1 特別観察 (CEO 厳守、曖昧 PASS 不可、3 軸 strict 分離)

### 4.1 背景

routing spec §3.2 S7 mode=normal で **F-1 standalone primary trigger** が現状 spec / impl とも曖昧 (A2 commit `e14682cd` の observation)。Stage 2.4-A2 では blocker でなかったが、本 smoke で actual UI 上での到達性を必ず確認する。

### 4.2 F-1 観測の三分類 (independent records、相互排他)

F-1 は **「primary 到達 / secondary 到達 / 到達不能」の 3 軸を独立に記録** する。1 つの軸を別軸の代替 / 上位互換として扱わない (CEO 厳守)。特に **secondary 到達を primary PASS の代替に絶対しない**。

#### 4.2.1 三分類の定義

| 軸 | 定義 | 観測条件 | 検出される routing spec § |
|---|---|---|---|
| **(I) F-1 primary 到達** | F-1 が **primary** として発火。`coalter.pattern.used` の `variant === "F1"` かつ `hasSecondary === false` (副次同伴なしの単独表示) | UI 上、提案カードに F-1 関係提案が単独で表示される | routing spec §1.2 S7 priority 2「F-1 standalone — 通常モードのみ」 |
| **(II) F-1 secondary 到達** | F-1 が **副次同伴** として発火。`coalter.pattern.used` の `variant === "F2"` かつ `hasSecondary === true` (F-2 主 + F-1 副次 1 行)。**注**: secondary は `coalter.pattern.used.variant` には現れない (variant=F2 のまま hasSecondary=true で識別) | UI 上、F-2 提案カード内最終行に「— 関係配慮 1 行 —」相当の F-1 副次が表示 | routing spec §2.2 row 3 (Daily relationshipNoiseHigh) / row 4 (Travel 常時) |
| **(III) F-1 到達不能** | どのシナリオ・mode でも F-1 が primary でも secondary でも観測されない | 全シナリオで `coalter.pattern.used` の `variant === "F1"` も `hasSecondary === true` も発生しない | routing spec / impl のどちらかと不整合 (CEO 個別判断要) |

#### 4.2.2 軸の独立性 (CEO 厳守)

- (I) と (II) は **完全独立**。同一 smoke run 内で両方観測される可能性あり (例: normal で F-1 primary、Daily で F-1 secondary 副次同伴)
- **(II) を観測しても (I) の代替・上位互換にしない**。primary 到達は primary 軸単独で判定
- (III) は (I) と (II) の **両方が成立しない時のみ** 確定。(II) 観測されたら (III) 不成立

### 4.3 シナリオ 2.1.14 (F-1 standalone primary @ S7 normal、3 試行)

シナリオ 2.1.14 は **(I) primary 到達** の存在を S7 normal で確認するためのもの。3 試行 (異なる synthetic user 入力パターン) を実施し、各試行を以下 sub-table で判定。

| 試行 | (I) primary 到達 | (II) secondary 到達 (混入時) | (III) 到達不能 (両方不成立時) |
|---|---|---|---|
| 試行 1 | observed / not observed | observed / not observed (注: normal で観測されたら spec 矛盾、要分析) | observed / not observed |
| 試行 2 | observed / not observed | observed / not observed | observed / not observed |
| 試行 3 | observed / not observed | observed / not observed | observed / not observed |

**確定ロジック** (S7 normal 軸別):
- 1 試行でも (I) primary 到達 observed → **(I) primary 軸 PASS** (CEO 報告 + spec sharpen 別タスク根拠)
- 全試行で (I) not observed AND (II) も normal で not observed → **(III) 到達不能 確定** (Yellow + spec ambiguity 確認、CEO 判断)
- 全試行で (I) not observed AND (II) が normal で observed → **異常: routing spec §2.2 row 1/2 (S7 normal で副次同伴なし) と矛盾 NG**、CEO 個別判断

### 4.4 secondary 軸の観察 (シナリオ 2.1.12 / 2.1.13、別軸)

(II) F-1 secondary 到達は本来 Daily / Travel mode で発火する (routing spec §2.2 row 3 / 4)。シナリオ 2.1.12 (Daily, relationshipNoiseHigh=true) / 2.1.13 (Travel, 常時) で観察する。**本 §4.4 で観測される (II) は §4.3 の (I) primary PASS の代替には絶対ならない**。

| シナリオ | mode | trigger | (II) 期待 | 判定 |
|---|---|---|---|---|
| 2.1.12 | Daily | relationshipNoiseHigh=true | observed (副次同伴 1 行表示) | observed → routing spec §2.2 row 3 PASS / not observed → NG |
| 2.1.13 | Travel | 常時 (default) | observed (副次同伴 1 行表示) | observed → routing spec §2.2 row 4 PASS / not observed → NG |

### 4.5 三分類の strict 分離まとめ

CEO 厳守ルール (再強調):

1. **F-1 primary 到達 / F-1 secondary 到達 / F-1 到達不能 を別々に記録**
2. **secondary 到達を primary PASS 扱いしない**
3. **曖昧 PASS 不可**: 1 軸でも判定が記録できないシナリオは「観測不完全」として再実施
4. §7 結果報告では **3 軸を別 row で記録**、1 軸あたり 1 判定を発行

---

## §5 PASS / Yellow / NG 判定基準

### 5.1 全 variant 共通基準

| 判定 | 条件 |
|---|---|
| **PASS** | 観測 9 項目全揃 + actual state がシナリオ表 §2.1 の expected と一致 + `source === "llm"` + `validationFailed === false` + 発話本文が speech template §3-§9 に整合 (Stage 2.3 PASS 品質と同等) |
| **Yellow** | 観測 9 項目揃 + actual state 一致だが、以下のいずれか:<br>- `source === "fallback"` で `fallbackReason` 既知 (`llm_error` / `validation_failed` / `rate_limited` / `timeout`)<br>- 発話本文が Stage 2.3 PASS 品質と微差 (致命でない、CEO 報告)<br>- F-1 standalone ケース C (§4.2、spec ambiguity 確認) |
| **NG** | 観測 9 項目欠 / actual state 不一致 / variant 不発火 / regression / F-1 standalone ケース B (§4.2 spec vs impl 不一致) / 発話本文が Stage 2.3 PASS と著しく乖離 |

### 5.2 I-10 対策の判定 (B / C / F-1 actual state 観測時、必須)

| 観測 | 判定 |
|---|---|
| B@S5 / C@S2 / C@S5 / F-1@S7 で actual state での発話本文が Stage 2.3 PASS と同等品質 | **I-10 PASS** (Stage 2.3 PASS の actual state での再現性確認、I-10 issue resolved) |
| 一部 variant で著しい品質乖離 | **I-10 Yellow** + Stage 2.4-D で再 quality review を別計画として CEO 個別判断 (routing spec Appendix B.5) |
| variant 不発火 (B が S5 で出ない / C が S2/S5 で出ない / F-1 が S7 で出ない) | **I-10 NG** (routing spec §3.2 / §4.1 と impl の不一致、CEO 個別判断) |

### 5.3 F-1 三軸判定 (§4 strict 分離、CEO 厳守: secondary は primary PASS 扱いしない)

§4.2 の三軸 (I primary / II secondary / III 到達不能) を **独立に判定**。secondary 観測を primary PASS の代替に絶対しない。

| 軸 | 観測結果 | smoke 全体への影響 |
|---|---|---|
| **(I) F-1 primary 到達** | observed (in S7 normal、シナリオ 2.1.14 の少なくとも 1 試行) | F-1 primary 軸 **PASS** + spec sharpen 別タスクの根拠 (CEO 報告) |
| **(I) F-1 primary 到達** | not observed (3 試行全て) | F-1 primary 軸 **Yellow** (spec ambiguity 確認、CEO 判断) — **(II)/(III) と独立に判定** |
| **(II) F-1 secondary 到達** | Daily/Travel で observed (2.1.12 / 2.1.13) | secondary 軸 **PASS** (routing spec §2.2 row 3/4) — **(I) PASS とは別評価** |
| **(II) F-1 secondary 到達** | normal で observed (2.1.14 試行で混入) | **NG** (routing spec §2.2 row 1/2 違反、CEO 個別判断、smoke 全体停止) |
| **(II) F-1 secondary 到達** | Daily/Travel で not observed | secondary 軸 **NG** (routing spec §2.2 row 3/4 違反) |
| **(III) F-1 到達不能** | (I) と (II) 両方が not observed | 到達不能軸 確定 → 全シナリオ通算で F-1 がいずれも発火しない異常、**NG** (CEO 個別判断) |
| **(III) F-1 到達不能** | (II) のみ observed (Daily/Travel で副次同伴は出る) | 到達不能 不成立 (= F-1 は副次同伴経路では発火している、primary 経路の Yellow は (I) 単独評価) |

---

## §6 実施手順 step-by-step

### 6.1 事前準備 (smoke 実施前、CEO 承認後)

1. CEO から Preview URL を受領
2. 本書 §1.1 / §1.2 で Preview HEAD と env vars を確認
3. **どれかが揃わなければ smoke 中止 → CEO 状況報告**
4. Sentry > Issues を開く (environment=`vercel-preview`、release=Preview HEAD)
5. Browser DevTools の Network panel (`/api/coalter/speech` filter) と Console を開く
6. smoke 結果 sheet (§7 template) を準備

### 6.2 各シナリオ実行 (12 シナリオ + F-1 3 試行)

各シナリオで以下を順に実行:

```
[Step 1] シナリオ trigger を UI 上の chat に投入
   ↓
[Step 2] presence transition 観測
   - coalter.presence.state_transition breadcrumb で expected state まで遷移したか
   - 中間 state (S0→S1→S2→...) も全て記録
   ↓
[Step 3] coalter.pattern.used 観測
   - variant / state / mode / hasSecondary / speechSource / retries / latencyMs /
     validationFailed / fallbackReason を全 field 記録
   ↓
[Step 4] /api/coalter/speech POST observation
   - request body (variant / state / mode / context)
   - response body (body / tone / source / retries / latencyMs / validationFailed /
     fallbackReason / secondaryLine?)
   ↓
[Step 5] UI 上部レイヤー目視
   - variant 発話本文を screenshot 記録 (I-10 対策、actual state での品質確認)
   - 副次同伴 (F-2 主 + F-1 副次) がある時は 1 行追加表示も screenshot
   ↓
[Step 6] §3 9 観測項目を smoke 結果 sheet に記録
   ↓
[Step 7] §5 判定基準で PASS / Yellow / NG 判定
```

### 6.3 シナリオ間 cool-down

各シナリオ間で **5 分以上の cool-down** を取る (UI spec §1.6 / v1.1 §8.6 同 state 5 分再起動禁止に整合)。連続実行で `rate_limited` fallback が観測される場合は cool-down 不足として記録。

### 6.4 Canary throw #1 — base scenarios (2.1.1〜2.1.13) 完了後

base scenarios (シナリオ 2.1.1〜2.1.13、12 行) を全て実施した後、Sentry に **breadcrumb session の export 用 canary error event** を 1 件起こす。Sentry 上では Issue が 1 件作成され、当該 session の breadcrumb trail (4 category 全) が同 event の context として保全される。

#### 6.4.1 実行コマンド (Browser DevTools Console)

```javascript
setTimeout(() => { throw new Error("CoAlter Stage 2.4-B smoke base") }, 0)
```

#### 6.4.2 確認

- Sentry > Issues で `CoAlter Stage 2.4-B smoke base` が 1 件出現することを確認
- 出現しない場合: Sentry DSN / sample rate / network blocking のいずれかを確認、再実行
- 出現後: Issue を開いて breadcrumb trail に `coalter.presence.state_transition` / `coalter.pattern.used` / `coalter.mode.transition` (該当時 `coalter.urgent.triggered`) が含まれることを確認

#### 6.4.3 不可侵

- 本 throw 文以外の console 操作 (eval / inject) はしない
- Production env / production データに対して絶対実行しない (Preview env 限定)

### 6.5 F-1 特別シナリオ (2.1.14) の実施

§4.3 の三分類 (I primary 到達 / II secondary 到達 / III 到達不能) を判定するため、シナリオ 2.1.14 のみ **3 回試行** (異なる **synthetic** user 入力パターン、§1.4 PII 禁止)。各試行を 3 軸別 record で残す (§4.5 strict 分離)。

### 6.6 Canary throw #2 — F-1 特別観察 (2.1.14) 完了後

F-1 特別シナリオ 3 試行 完了後、もう 1 件 canary throw を実行。base scenarios と F-1 特別の breadcrumb session を **別 Issue で分離保全** するため。

#### 6.6.1 実行コマンド (Browser DevTools Console)

```javascript
setTimeout(() => { throw new Error("CoAlter Stage 2.4-B smoke f1-special") }, 0)
```

#### 6.6.2 確認

- Sentry > Issues で `CoAlter Stage 2.4-B smoke f1-special` が 1 件出現
- breadcrumb trail に F-1 試行 3 回分の `coalter.pattern.used` (variant=F1 or F2 + hasSecondary) が含まれることを確認
- §4 三分類判定の根拠記録として保全

### 6.7 smoke 終了後

- 全シナリオ結果を §7 template に転記
- canary throw 2 件の Sentry Issue URL を §7 サマリに添付
- 不完全観測 (9 項目揃わず) シナリオがあれば再実施 (or CEO 判断で skip)
- 最終判定を本書 §5 基準で算出
- 結果報告作成 → CEO 提示

---

## §7 結果報告フォーマット

### 7.1 シナリオ別 結果 sheet (12 base + 3 F-1 試行 = 15 行 + F-1 三軸分離 record)

| # | シナリオ | 9 項目観測 | actual state | source | fallbackReason | latencyMs | validationFailed | retries | 発話本文 (UI screenshot、synthetic redact 済) | 判定 (PASS/Yellow/NG) | I-10 観点 (B/C/F-1 のみ) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.1.1 | A@S2 normal | _/9 | _ | _ | _ | _ | _ | _ | _ | _ | (該当なし) |
| 2.1.4 | **B@S5 normal** | _/9 | _ | _ | _ | _ | _ | _ | _ | _ | **I-10 PASS/Yellow/NG** |
| 2.1.5 | **C@S2 normal** | _/9 | _ | _ | _ | _ | _ | _ | _ | _ | **I-10 PASS/Yellow/NG** |
| 2.1.6 | **C@S5 normal** | _/9 | _ | _ | _ | _ | _ | _ | _ | _ | **I-10 PASS/Yellow/NG** |
| 2.1.12 | F-2 + F-1 副次 (Daily) | _/9 | _ | _ | _ | _ | _ | _ | _ | _ | (副次同伴 = §4 (II)) |
| 2.1.13 | F-2 + F-1 副次 (Travel) | _/9 | _ | _ | _ | _ | _ | _ | _ | _ | (副次同伴 = §4 (II)) |
| ... (他シナリオ同様) | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |
| 2.1.14a | F-1 試行 1 | _/9 | _ | _ | _ | _ | _ | _ | _ | I/II/III 別 record | **§4 三軸 record** |
| 2.1.14b | F-1 試行 2 | _/9 | _ | _ | _ | _ | _ | _ | _ | I/II/III 別 record | **§4 三軸 record** |
| 2.1.14c | F-1 試行 3 | _/9 | _ | _ | _ | _ | _ | _ | _ | I/II/III 別 record | **§4 三軸 record** |

### 7.1.1 F-1 三軸分離 record (CEO 厳守、§4.5)

§4.2 / §4.3 に従い、F-1 観測は 3 軸を **独立 row** で記録。secondary 到達を primary PASS 扱いしない。

| 軸 | 観測元シナリオ | 観測結果 | 判定 |
|---|---|---|---|
| **(I) F-1 primary 到達** | 2.1.14 試行 1/2/3 (S7 normal) | observed / not observed (試行ごと) | 1 試行でも observed → PASS / 全試行で not observed → §4.3 確定ロジックで Yellow or NG |
| **(II) F-1 secondary 到達** | 2.1.12 (Daily) / 2.1.13 (Travel) / 2.1.14 (normal で混入時の異常検出) | observed / not observed (シナリオごと) | Daily/Travel で observed → PASS、normal で observed → 異常 NG (§4.3 末尾)、Daily/Travel で not observed → NG |
| **(III) F-1 到達不能** | 全シナリオ通算 | (I)(II) 両方 not observed なら確定 | (II) のみ observed の場合は (III) 不成立 |

### 7.2 集約サマリ (CEO 提示用)

```
Stage 2.4-B smoke 結果サマリ (date: YYYY-MM-DD HH:MM JST)

Preview HEAD: <commit hash>
env vars:
  - COALTER_PRESENCE_SPEECH_LLM:                          true / false
  - ANTHROPIC_API_KEY:                                     present / absent
  - NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR:                 true / false
  - NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH:             true / false
  - NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE:  true / false / unset (== 通常 run / observation run の区分)
  - NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT:           true / false (default true)

Run 種別 (§1.2.1 規約):
  - 通常 run (observation mode OFF): primary 観測対象
  - observation run (observation mode ON): 補助、別 sheet

Synthetic input / PII 確認 (§1.4):
  - 全シナリオで synthetic input 使用: yes / no
  - PII 混入: 0 件 / N 件 (混入時は再実施、CEO 報告)

Canary throws:
  - #1 (base scenarios 完了後): Sentry Issue URL = <URL>
  - #2 (F-1 特別観察完了後):    Sentry Issue URL = <URL>

シナリオ別判定:
  - PASS:    n / 15
  - Yellow:  n / 15
  - NG:      n / 15
  - 不完全:  n / 15

I-10 必須観測 (B/C/F-1 actual state):
  - B@S5:        PASS/Yellow/NG (詳細)
  - C@S2:        PASS/Yellow/NG (詳細)
  - C@S5:        PASS/Yellow/NG (詳細)
  - F-1@S7:      三軸 record (下記)
  - F-2@S7:      PASS/Yellow/NG

F-1 三軸 record (§4.5 strict 分離):
  - (I) primary 到達:    observed in 試行 [1/2/3 のいずれか or なし]、judgement: PASS / Yellow / NG
  - (II) secondary 到達: シナリオ 2.1.12 = observed/not、シナリオ 2.1.13 = observed/not、(2.1.14 normal で混入は NG)
  - (III) 到達不能:      (I) と (II) 両方 not observed なら確定 / そうでなければ不成立

  注: secondary 到達は primary PASS の代替に絶対しない (CEO 厳守、§4.2.2)。

routing spec / impl mismatch 観測:
  - <該当する mismatch があれば 1 行ごとに>
  - もしくは「0 件」

Stage 2.4-C / D 着手判断:
  - C 着手 GO / NG (timeout/fallback 動作確認)
  - D 着手 GO / NG (production-ready audit)

CEO 個別判断要件:
  - <該当があれば列挙>
```

### 7.3 報告とともに添付するもの

- 全シナリオの screenshot (UI 上部レイヤー、最低 1 枚 / シナリオ。**PII redact 必須、§1.4.2**)
- Sentry breadcrumb の export (canary throw #1 / #2 の Issue URL、breadcrumb trail)
- Network panel の HAR file (or relevant POST response の JSON dump、**synthetic case のみ、§1.4.2**)

### 7.4 共有時の synthetic / PII 規約 (再強調)

§1.4.2 の規約を report 共有時に守る:
- screenshot は PII redact 済みのみ
- Network response body / HAR は synthetic case のみ共有 (実 PII 含むものは smoke 結果から除外し再実施)
- Sentry export も synthetic アカウント / synthetic ペアのみ

---

## §8 不可侵境界 (Stage 2.4-B 期間中、CEO 厳守)

### 8.1 触らない

- `lib/coalter/presence/patternSelector.ts` (Stage 2.4-A2 で test lock 済)
- `lib/coalter/presence/constants.ts`
- `lib/coalter/presence/types.ts`
- `lib/coalter/presence/signalAdapter.ts` (context flag 設定主体、§9 保留 / I-2 / I-3)
- `lib/coalter/presence/preRouterGate.ts` 等の上流
- speech 系: `speechValidator` / `speechPostValidator` / `speechBuilder` / `speechPromptBuilder` / `llmCall`
- speech route (`app/api/coalter/speech/route.ts`)
- UI 本体: `ChatClient.tsx` / `UpperLayerMount.tsx` / `UrgentLayer`
- `model` (`claude-sonnet-4-5-20250929`)
- `max_tokens` / `length_override`
- `timeout` constant
- production env

### 8.2 戻らない

- Stage 2.3 prompt 修正に戻らない
- Stage 2.3 fixture state を expected に混ぜない
- 自律 fix-forward 禁止

### 8.3 spec/impl mismatch 観測時の扱い

- mismatch 発見 → **本 smoke 内で fix しない**
- §7 報告に詳細 (シナリオ番号 / 観測値 / spec 条文) を記録
- CEO 判断待ち (impl 修正 / spec 緩和 / 別タスク化)

---

## §9 後続フェーズへの橋渡し

| Stage | 着手条件 | 本 smoke との関係 |
|---|---|---|
| **Stage 2.4-B 実施** | 本書 CEO 承認後 → CEO 別指示 | (本書) |
| **Stage 2.4-B 結果報告** | 本 smoke 完了後 | §7 サマリを CEO 提示 |
| **Stage 2.4-C** (UI timeout / fallback 動作確認) | B 報告後 CEO 判断 | B で `source="fallback"` / `fallbackReason="timeout"` を観測した場合の追跡 task。本書 §5 判定の Yellow/NG 詳細を持ち越し |
| **Stage 2.4-D** (production-ready audit) | A/B/C 全 PASS 後 CEO 判断 | I-10 (Stage 2.3 fixture vs actual state 発話品質乖離) の最終判定。B Yellow なら D で再 quality review (35-call 等) を別計画として CEO 個別判断 (routing spec Appendix B.5) |
| **F-1 standalone trigger spec sharpen** (別タスク) | B でケース A 観測 → routing spec §3.2 S7 normal の sharpen 根拠 / B でケース C 確定 → 現状 impl が正本か、spec を緩和するか CEO 判断 | 本書 §4 由来 |

---

## Appendix A — 関連文書

- `docs/coalter-presence-routing-spec.md` (A1-3 正本候補、commit `34067d98`)
- `docs/coalter-stage24-a1-routing-spec-draft.md` (A1-1/A1-2 working draft)
- `tests/unit/coalter/presence/patternSelectorRoutingSpec.test.ts` (A2 selector test、commit `e14682cd`)
- `docs/coalter-presence-state-ui-spec.md` v0.1 §7.12 / §4.3 / §7.10 (上位正本)
- `docs/coalter-speech-template.md` v0.1 §3-§9 (上位正本、変更禁止)
- `lib/coalter/presence/sentryTelemetry.ts` (breadcrumb wiring)
- `lib/coalter/presence/telemetryEvents.ts` (event 型定義、`PatternUsedEvent` 等)
- `app/api/coalter/speech/route.ts` (speech response 仕様、参考のみ不接触)

---

## Appendix B — 改訂履歴

| 版 | 日付 | 内容 |
|---|---|---|
| 0.1-draft | 2026-05-08 | 初版起草 (Stage 2.4-B 手順書、CEO 確認待ち)。A1-3 routing spec + A2 selector test を踏まえた UI 到達性 smoke の前段階 |
| 0.1-draft.2 | 2026-05-08 | CEO review #1 反映: (1) §1.2 env vars に `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` 追加、`NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_OBSERVATION_MODE` ON/OFF 記録規約 §1.2.1 追加。 (2) §6.4 / §6.6 に Sentry breadcrumb 取得用 canary throw 2 箇所 (base scenarios 後 / F-1 特別観察後) 明記。 (3) §4 F-1 判定を strict 分離 (I primary / II secondary / III 到達不能 を独立 record、secondary を primary PASS 扱いしない明示)。 (4) §1.4 Synthetic input / PII 禁止追加 + §7.3 / §7.4 共有規約に反映 |

---

**End of CoAlter Stage 2.4-B UI 到達性 Smoke 手順書 v0.1-draft (CEO 確認待ち)**
