# RC2a-1c: Redaction / Ledger / Action Identity Patch（GPT 監査 12 点の裁定）

- 日付: 2026-06-13 / 裁定サマリ: **方針採用 11 / 部分反証 1（#4）/ 範囲確認 1（#12）**
- 優先順位: 本書 → RC2a-1b → RG0.6b → RG0.6a → RG0.6
- 実装範囲: docs patch（全 12 点の方針固定）+ **既存型の誤り訂正のみ**の外科修正（#1/#2/#6/#7/#10）。
  まだ型が存在しないノード（EnvironmentAttribute / learning forgetting / sourceActionId runtime / RequestRealityFrame）は
  **docs 方針のみ — 空中で型を作らない**（該当ノード実装時に確定する方が正確 — §13 メタ提起）

---

## 1. redactedRefId を「不可逆」と書いた誤りの訂正（採用）

「raw id へ不可逆」は過信だった。FNV64 + client 固定 salt は暗号学的 blinding ではない。正本:
- redactedRefId は **匿名化でも cryptographic blinding でもない** — obfuscation / pseudonymous reference にすぎない
- 低エントロピー rawRef（"home"/"office" 等）は推測され得る
- **sensitive ref は原則 remove**。blind id を残すのは UI diff 等で必要な最小限のみ
- **authority 判断に絶対に使わない** / privacy boundary として過信しない
- 真の blind id が必要なら **server-side secret salt / HMAC は別 gate**（client では実現不能と明記）

## 2. PredictionEntry「full payload 保存」表現の精密化（採用 — 型修正）

報告の「full payload 保存」は不正確だった。実際に保存しているのは inputRevisionSet / derivationVersions（**元入力そのものではない**）。PredictionLedger は「何を当てに行ったか」の人間監査可能な台帳であるべき:
- `inputRevisionSet` は full source payload ではない（revision = 短縮指紋）
- PredictionEntry に **frozenContext** を追加: `frozenEvidenceRefs` / `frozenSourceTrace` / `frozenInputSummary`（凍結時点の根拠の人間可読要約）
- evidenceRef の指す先が後で変わっても、当時何を根拠に予測したかが残る
- **frozenContext は per-viewer redaction 後の safe trace**（PII / 他人情報を生で焼き込まない）

## 3. sourceActionId の永続 counter 責務（採用 — docs のみ・SSC 実装は未着手）

v0 を明示的に local-only single-writer に限定:
- **v0 = local-only single-writer 前提**。multi-tab / multi-device は **unsupported（または blocked）**
- ordinal counter は per-day localStorage に保存。**counter 採番と entry 保存は atomic**（保存失敗時は counter を進めない = 採番ロールバック）。retry は同一 sourceActionId を再利用（冪等）
- offline 復帰: 保存済み log（ordinal 列）が正本 — 再 derive で順序が変わらない
- legacy: sourceActionId を持たない既存 UserCorrection[] は `legacy:<subjectiveDate>:<ordinal>`（配列位置）として **読み取り専用**で扱う
- random id は禁止（維持）/ server 化時は user/day/surface/device/session scope を含む必要（将来 gate）
- **sourceActionId 生成は SSC 実装 gate**（本 patch では契約のみ・runtime なし）

## 4. canonicalSerialize の Unicode 方針（**部分反証** — 現状は構造的に問題なし）

GPT 懸念「日本語文字列を含むと NFC/NFD 差で revision 不安定」を検証 → **現状の revision payload には生ユーザー文字列が一切入らない**ことを確認（recordRevisionOf の hash 対象 = HH:MM 正規化時刻 / EstimateFieldKey・direction・moodCode・sleepQuality・planVerdict の enum / dayFelt・manualLevels の number / ConfidentValue の enum+number）。dayState が最初から enum/number/正規化時刻で設計されているため **Unicode 正規化問題に構造的免疫**がある。裁定（**案 A を採用 + 将来の boundary 規律**）:
- **revision / identity payload には ID / enum / normalized field のみを入れる**（生ユーザー文字列を入れない）— 現状成立・契約として固定
- 将来 RequestRealityFrame（desiredAction / areaHint / placeBrandHint）や displayLabel が revision payload に入る場合は **boundary で NFC 正規化してから canonicalSerialize に渡す**（canonicalSerialize は「全 string は NFC 済み」を前提とする・自身では正規化しない = 上流責務）
- canonicalSerialize のコメントに本前提を追記（コード挙動は変えない — 現状入力に生文字列がないため）

## 5. RealityInstant 正本化と既存 3 実装の移行計画（採用 — docs のみ）

二重正本を残さない移行方針を固定（実装は別 slice）:
- `makeRealityInstantJst`（RealityInstant factory）を**唯一の正本**にする
- 既存 `jstNowMinutes` / `toJstWallClock` / `subjectiveDateFor` は将来 **RealityInstant を内部参照する wrapper 化 / deprecated 化**（W6 で安定したコードのため、移行は専用 slice で慎重に — 本 patch では触らない）
- **RC2a 以降の新規 pure 関数は直接 Date / getHours を呼ばず RealityInstant のみを受け取る**（時刻ソース分裂の構造的封じ込め）
- 既存 3 実装との等価性 fixture（RC2a-1 で追加）は**移行中の guard であり永続的な二重正本ではない**（移行完了で wrapper 経由の同一性に置換）

## 6. Prediction actual を NightCheck だけに固定しない（採用 — 型修正）

actual source は複数あり得る。v0 を「headline grading actual = NightCheck」に限定しつつ拡張枠を持つ:
- 型に `actualSourceKind: "night_check" | "self_report" | "completion" | "drift" | "location" | "manual" | null`
- v0 で値が入るのは "night_check" のみ。selfReportObservation は actual ではなく calibration evidence（RC2a-1b §8 維持）
- event-level prediction の actual は将来 done/drift/location（horizon "event"・RC2b 以降）
- 「actual は NightCheck のみ」を永久化しない

## 7. calibrationSource の構造化（採用 — 型修正）

`calibrationSource: string | null` を廃止し B1 の受け口を用意:
```ts
calibration: {
  calibrationRefs: string[],
  policyVersion: string,
  learningSourceKind: "correction" | "night_check" | "drift" | "mixed",
  sampleSize: number,
  evidenceQuality: "high" | "medium" | "low",
  recencyWindowDays: number,
} | null
```

## 8. EnvironmentReality の field-level freshness 型方針（採用 — docs のみ・型未作成）

EnvironmentReality 型はまだ存在しない（RG0.6a/b で docs 定義のみ）。型を空中で作らず方針を固定 — **実装は RC2b**:
- 各 env field は **RealityAttribute を素のまま使わず `EnvironmentAttribute<T>` で拡張**: `RealityAttribute<T> & { freshness, fetchedAt, validUntil, sourceLocation }`
- node-level freshness は **summary**（API 系 field の fetch metadata の要約）であり field-level freshness と分離
- daylight は field-level で別 source（§9）

## 9. daylight の location 不足時（採用 — docs のみ）

- location あり → solar/time/location derived（高 confidence）
- **location なし → unknown または broad timezone estimate（low confidence）**。broad estimate を使う場合 `displayPolicy: debugOnly | notActionable`
- weather freshness と結合しない（§8）/ **daylight を出発判断の根拠にするのは location 解決後（RC4+）**

## 10. graphViewerKey の logging 制限（採用 — コメント追記）

pseudonymous（≠匿名）= 固定 salt ゆえ linkability が残る。使用範囲を制限:
- **cache key に限定**。analytics / log には原則出さない。出す場合は session/day scope に更に限定
- raw auth user id と相互参照できる場所を限定
- per-viewer projection の権限判断は auth user id（key では判断しない — RC2a-1b §6 維持）

## 11. learning に反証 / 忘却を追加（採用 — docs のみ・型は B1 で）

positive/negative 分離（RC2a-1b §11）に加え、世界トップの学習に必須の機構を方針固定（実装 B1）:
- **contradiction / counterexample handling**: 反証された pattern は confidence downshift（消去でなく弱化）
- **decay / forgetting**: recency window 外の signal を減衰（古い傾向を永続的に引きずらない）
- **concept drift 検出**: 連続する反証で pattern を stale 判定 → suppression
- **user override = hard reset**（最上位・即時）
- **minimum sample size before promotion**（少数事例の過学習防止 — §7 sampleSize と接続）
- **confidence downshift after failed suggestion**
- safety override（permission boundary は学習で弱めない）は不変（RC2a-1b §11）

## 12. 本 patch の実装範囲（範囲確認 — 採用）

- docs: 本書
- code（既存型の誤り訂正のみ）: predictionLedgerTypes.ts（#2 frozenContext / #6 actualSourceKind / #7 calibration 構造化）/ graphIdentity.ts（#4 Unicode 前提コメント / #10 logging 制限コメント）
- tests: canonical の生文字列非含有前提を示す fixture（NFC/NFD が別 revision になる = 生文字列を入れない理由の固定）+ 型コンパイル担保
- **やらない**: MovementReality compile / commitmentSignal / decisionDebt / deriveMomentSnapshot / assembler / EnvironmentAttribute 型作成 / SSC runtime / RealityInstant 既存関数の deprecate / UI / localStorage / API / DB / push・PR・deploy

## 13. メタ提起（CEO 判断材料 — 鵜呑みにしない立場から）

RG0.6 → RG0.6a → RG0.6b → RC2a-1 → RC2a-1b → RC2a-1c と **6 ラウンド identity/ledger 契約を hardening した**。各ラウンドは実害ある指摘を含み（特に SSC 論理バグ・redactedRefId 過信は本物）、契約は確実に堅牢化した。一方で残る指摘の多く（EnvironmentAttribute 型 / learning forgetting / RequestRealityFrame normalization / actual source 拡張）は、**該当ノードを実際に実装する時に空中の型議論より正確に確定できる**領域に入りつつある。

提案: 次は **RC2a-2（MovementReality v0 compile）を実装に移す**。理由 —
1. MovementReality は本 patch までの identity/provenance 契約を**実コードで初めて検証する**（型だけの契約が現実に耐えるか）
2. mv ノードが実在すれば、後続（collapse risk の「移動未解決」参照・decisionDebt の placeDebt）が空中でなく実体に接続する
3. これ以上の純 docs hardening は収穫逓減。識別契約の核（id 決定性・provenance・Ledger 不変性・redaction 原則）は既に固まった

ただし GO は CEO 判断。本書はあくまで「RC2a-2 を docs から実装へ移す準備が整った」ことの提起であり、追加の identity 指摘があれば RC2a-1d で受ける用意もある。

— RC2a-1c 完了で停止。
