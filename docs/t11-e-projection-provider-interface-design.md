# T11-E Server-only Projection Provider Interface Design（input provider seam・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **設計のみ・実装なし**（docs-only）。
**位置づけ**: 「**`TravelPlanEngineInput` をどう得るか**」を display chain から切り離す **provider seam** を設計する。
dev fixture 入力は dev-only に留め、将来の real input provider が display/projection/cue chain を変えずに plug-in できるようにする。
**核心**: 次の問題は display ではなく「**user/session/M2/route/weather/place を捏造せずに valid な engine input を得る**」こと。provider は **input を供給 or 拒否**し、provenance を明示し、real input 不在では **fail-closed**。
**スコープ**: 設計のみ。コード変更なし。**provider 実装・real input source・本番 `/plan`・engine 挙動・CoAlter runtime・useCoAlter・/talk・M2・DB・API/fetch・route/weather/place live・booking・send・Bundle2・solver・staging/production/push は触らない**。**本レポートで停止**。

---

## §1 前提を疑う — 次は provider interface design で正しいか

| 候補 | 評価 |
|---|---|
| **E server-only projection provider interface design** | **★ 採用**。input 取得が本番化の唯一の blocker・seam を純設計すれば fixture-in-production を構造的に防げる |
| 本番 `/plan` 何もせず待つ | 前進なし。input seam が無いと将来の real input 配線が無秩序化 |
| D CoAlter client display wiring preflight | real projection（=real input）が先 |
| Bundle 2 fit dominance/ranking | GPT HOLD |
| Turbopack root fix | 直交（別タスク・provider 設計は root 非依存で進む） |

**推奨 = E**。理由: (1) 「real input をどう得るか」が本番化の本丸。(2) provider seam を純設計すれば、**fixture が real を騙る経路を型/契約で塞ぎ**、real input 解錠時に Life Ops 同様の gated plug-in ができる。(3) 本番 `/plan`・runtime gate を 1 つも開けない。

---

## §2 provider 問題

- 現 dev preview は **決定論 fixture `TravelPlanEngineInput`**。
- 本番は **real `TravelPlanEngineInput`** が必要。
- travel intake / user slots は **未配線**。
- M2 runtime は **HOLD**。
- route/weather/place live は **HOLD**。
- ★ **fixture 入力が real 入力を装ってはならない**。
- ★ provider seam は **input の provenance（出所）を明示**しなければならない。

---

## §3 provider の役割（境界）

provider は **`TravelPlanEngineInput` を供給 or 拒否するだけ**。以下では **ない**:
engine でない / display mapper でない / UI でない / CoAlter runtime でない / M2 runtime でない / route・weather・place search でない。
→ **real input が無ければ fail-closed**（input を作らず not_ready を返す）。

---

## §4 provider 出力契約（設計の核）

discriminated result（**server-only 型・client へ serialize しない**）:

```
TravelInputResult =
  | { status: "ready";     input: TravelPlanEngineInput; provenance: TravelInputProvenance }
  | { status: "not_ready"; provenance: TravelInputProvenance; missing: TravelInputPrerequisite[] }
```

- **provenance**（honest・出所明示）:
  ```
  TravelInputProvenance {
    sources: TravelInputSourceKind[];   // どの source が input に寄与したか
    realOnly: boolean;                  // dev_fixture を含まない（= 派生）
    completeness?: number;              // 0..1（任意・どれだけ揃っているか）
  }
  TravelInputSourceKind = "dev_fixture" | "session_slots" | "user_intake"
    | "m2_personalization" | "route_weather_place_enriched"  // 将来 source は additive
  ```
- **missing**（not_ready の理由）: `TravelInputPrerequisite[]`（例 "session_slots"/"user_intake"/"destination"/"date"/"route_weather_place"）。
- ★ **authoritative packet / display packet / projection / cues / diagnostics を返さない**（provider は input までで、display chain は別段）。

---

## §5 provider tiers

| tier | 役割 | 今 |
|---|---|---|
| **dev fixture provider** | 決定論 fixture input を供給（provenance=[dev_fixture]） | **許可（dev-only）** |
| server session/intake provider | user session/intake から real slots を組む | **HOLD**（intake 未配線） |
| M2 personalization provider | M2 由来 fit/preference を付与 | **HOLD**（M2-B-2） |
| route/weather/place enrichment provider | route/weather/place を付与 | **HOLD**（live data） |
| production provider aggregator | 上記 real source を集約し real_only input を組む | **HOLD**（本番） |

---

## §6 production rule（real_only / fail-closed）

1. **production provider は real_only**（provenance に dev_fixture を含まない）。
2. **dev_fixture provider は production で block**（gate=fixtureAllowed false → not_ready）。
3. **real input が欠けたら fail-closed**（engine を走らせない・not_ready を返す）。
4. **fixture を silently substitute しない**。
5. **partial user data から fake travel input を生成しない**。
6. **live availability/price/weather を、明示供給されない限り claim しない**。

★ env 読みは **provider に入れない**: gate（`fixtureAllowed` 等）を **引数で受ける**（Life Ops `isLifeOpsMainlineAllowed` 同様・env は route 境界で評価）。→ provider helper は pure。

---

## §7 display chain との関係

```
provider → TravelInputResult(status:ready, input)   … input のみ
  → runTravelPlanEngine(input)                        … engine（display tier を bypass しない）
    → toDisplayPacket → buildPlanIntelligenceProjection → deriveCoAlterProjectionCues
```

- provider は **engine input のみ返す**（display tier を bypass しない）。
- provider は **projection を直接返さない**。**例外**: 既存 hand-built projection fixture（`dev-travel-projection`）は engine を通さない dev 専用 artifact＝**`dev_fixture` と明示マーク**された場合のみ（production では不可）。本 provider の主契約は engine-input 供給。

---

## §8 privacy / authority

- provider は private/source-sensitive input を **server-only** で扱う（`TravelPlanEngineInput` は private slots/fit/cancelWeather を含み得る＝**client へ serialize しない**）。
- **client は raw provider input を受け取らない**（client は projection/cues のみ・§7）。
- provider は **executionAuthority / booking/scheduling authority を産まない**。
- provider は **raw M2 personalization を露出しない**。
- provider は **diagnostics を default で露出しない**。
- **client-only privacy filtering しない**（除去は engine 射影で済む）。

---

## §9 integration architecture options

| 案 | 内容 | 評価 |
|---|---|---|
| **A. docs-only provider interface design** | 本書 | **★ 今ここ（完了で次へ）** |
| B. pure provider types only | 型のみ（TravelInputResult/provenance/source/prerequisite） | A 承認後の実装第一歩 |
| C. dev fixture provider implementation only | dev fixture provider + real_only/fail-closed helper | B と同 bundle で可 |
| D. production provider aggregator preflight | 本番集約の前段 | **HOLD**（real source 未） |
| E. Turbopack root fix first | dev server 修正 | 直交・別タスク |

**推奨 = A（本 docs）完了 → 次は B+C（pure types + dev fixture provider のみ）**。D は HOLD・E は別タスク。

---

## §10 設計承認後の推奨実装バンドル

- **pure provider types**（`TravelInputResult` / `TravelInputProvenance` / `TravelInputSourceKind` / `TravelInputPrerequisite`）。
- **dev fixture provider のみ**（既存 `FIXTURE_ENGINE_INPUT` を provenance=[dev_fixture] で供給・gate `fixtureAllowed` false→not_ready）。
- **production provider なし**・**M2 provider なし**・**route/weather/place provider なし**・**app 本番配線なし**。
- tests: real_only / fail-closed semantics。

---

## §11 将来実装の test 期待

1. dev fixture provider は **dev/preview 文脈でのみ** input を返す（gate true）。
2. **production 相当 gate（fixtureAllowed false）→ fixture provider は not_ready**（reject）。
3. **provider unavailable（not_ready）では engine を走らせない**。
4. provider は **display packet / projection / cues を返さない**。
5. **prerequisite 欠如時に fake fallback input を作らない**。
6. **fetch/API/DB/Supabase import なし**。
7. **M2 runtime import なし**。
8. **UI/app import なし**（pure なら）。
9. **tsc baseline 55 不変**・既存 preview tests 不変 green。

---

## §12 Turbopack root 問題との関係

- **別管理**（provider 設計は root 問題を解かずに進む・test は vitest で root 非依存）。
- **visual browser 検証**は将来 root fix を要する。
- **root fix は別 CEO GO**。

---

## §13 出力 + CEO 判断請求

- 本書は **provider seam の設計のみ**。実装なし。
- **推奨次フェーズ = B+C（pure provider types + dev fixture provider のみ・real_only/fail-closed・本番/M2/route/weather provider なし）**。

### CEO 判断請求
1. **provider = `TravelPlanEngineInput` を供給 or 拒否するだけ・display tier を bypass しない・real input 無で fail-closed** という役割定義を承認するか。
2. **出力契約 = {ready, input, provenance} / {not_ready, provenance, missing}・provenance に source 明示・realOnly フラグ**で良いか。
3. **production rule = real_only・dev_fixture は production block・fixture を silently substitute しない・fake input 生成しない・gate は引数受け（env は route 境界）** で良いか。
4. **`TravelPlanEngineInput` は server-only（client へ serialize しない・client は projection/cues のみ）** で良いか。
5. 次フェーズ = **B+C（pure types + dev fixture provider のみ）** で良いか（vs D/E は HOLD/別タスク）。

実装は CEO 承認まで着手しない（provider interface 設計レポートで停止）。
