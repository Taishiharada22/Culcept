# Full WorldState Reader — Preflight / Design Review（**docs-only・read-only investigation**・実装なし）

> 2026-06-09 / Build Unit / CEO 指示「full WorldState reader 実装前に、実 plan/schedule/gap/context をどう安全に読むか、既存正本型と実 DB shape が一致するか、read surface と stop 条件を確定」。
> **docs-only**。実装/DB write/route/PlanClient/apply/notification/native/production/enable なし。
> 前提: Live Reader Step 1–3 完了（memory-side 実証済）。`fakeWorldState`/`assembleWorldState`(port) は既存。

---

## 0. 結論（実調査の要旨）
- **schedule reader は既存**（`createDatedColumnRestrictedAnchorSource`＝`external_anchors` を owner-RLS・column-restricted・dated に read）→ **再利用**。
- **gap は DB を読まない**：anchors → `buildDayGraph`（**pure**）→ GapNode（`startTime`/`endTime` HH:MM）→ `gapNodesToAvailableWindows`（既存 adapter）。
- **★context(energy/weather) は CLIENT-side**：`buildDayContextSnapshot` は `app/(culcept)/plan/tabs/CalendarTab.tsx`（client）で呼ばれ、energy=InnerWeather・weather は client 状態。**server-readable な context table は無い** → **server reader は context を読めない → 引数注入 or null**。
- **energy 値域は 0..1 確定**：`DayContextPrimitives.baseEnergyLevel` = 「InnerWeather 由来 **0..1 正規化** energy」。→ `worldStateEnergy` の clamp[0,1] のままで正しい（再正規化不要）。
- **stop 条件には未抵触**（全 read owner-RLS・column-restricted・service_role 不要・production 不要）。ただし context client-side は **設計制約**として明示。

---

## 1. schedule / plan source
| 項目 | 確定 |
|---|---|
| table / reader | `external_anchors`・**既存** `createDatedColumnRestrictedAnchorSource`（`from(external_anchors).select(ANCHOR_COLUMNS_SQL).eq(user_id).eq(date).limit`）。owner-RLS・column-restricted（"*"/raw 不可）。 |
| 実 anchor 型 | `ExternalAnchor`{id,userId,**title**,**startTime**(HH:mm or ISO),**endTime?**,locationText?,locationCategory?,**rigidity**,sourceId,confirmedAt,confidence?,sensitiveCategory?} |
| → PlanItemSnapshot 最小 mapping | `{ itemId: anchor.id; startMin: parse(startTime); endMin: parse(endTime); title: **null(redact)**; governance: deriveFromRigidity(rigidity, sensitiveCategory) }` |
| start/end 取得 | startTime/endTime（**HH:mm と ISO 両対応の parser が必要**・既存 hhmmToMinutes は HH:MM のみ → ISO 分岐追加） |
| title redaction | **label=null**（raw title を持ち込まない・既存 schedule mapper が担保）。sensitiveCategory ある anchor も時刻のみ採用 |
| governance | ExternalAnchor は governance を持たない → **rigidity から導出**（origin=imported / authority=import_locked / flexibility・protection を rigidity・sensitive から）。**既存 anchor→governance helper の有無を Step 4-A で確認**（無ければ最小導出） |

## 2. DayGraph / gap source
| 項目 | 確定 |
|---|---|
| DB か pure か | **pure**。anchors → `buildDayGraph({anchors})` → `BuildDayGraphResult.graph.nodes`。**gap 用の DB read は無い**（anchors の 1 read のみ） |
| GapNode shape | `startTime`/`endTime`（"HH:MM" local）→ `gapNodesToAvailableWindows`（既存・hhmmToMinutes で分化） |
| **shape 注意** | `buildDayGraph` は **`ExternalAnchor[]`** を要求。anchor reader は `ColumnRestrictedAnchorRow`→`projectToRealityInput`（別 shape）。→ **Step 4-B で「column-restricted row → buildDayGraph が必要とする最小 anchor 形」mapping を確認**（buildDayGraph が startTime/endTime/id のみ使うなら容易） |
| gap meaning | `classifyGap` は travel/energy/meal 等の追加 signal が必要＝GapNode 単体で揃わない → **既定 null（捏造しない）**・文脈が揃えば resolver 注入（既存 adapter 仕様） |

## 3. ContextSnapshot source（★最重要発見）
| 項目 | 確定 |
|---|---|
| 取得元 | `buildDayContextSnapshot(primitives, weather)`。primitives = `{density, baseEnergyLevel(0..1), travelMinutes[]}`。**呼び出しは CalendarTab.tsx（client）** |
| server 可否 | **density は server 派生可**（dayGraph from anchors）。**energy(InnerWeather)/weather は CLIENT 状態**で server-readable table 無し → **server reader は読めない** |
| 方針 | full WorldState reader（server）は **context を引数注入**（client が渡す）**or null**（欠損→readiness が partial で surface・捏造しない）。**energy/weather を server で勝手に作らない** |
| energy 値域 | **0..1 確定**（baseEnergyLevel 正規化済）。`worldStateEnergy` clamp[0,1] のまま正しい |
| 欠損時 | fail-open（null）→ `assessWorldState` が partial/insufficient で flag（既存契約） |

## 4. mobility source
- **placeholder のまま**（`{typicalTravelBufferMin}` or null）。**MAP 正本（mobilityObservation/personalPace）を侵さない**。live route/GPS/GTFS に進まない。

## 5. permission level
- **引数で渡す**（full WorldState reader で読まない）。**安全 default = Level 2（propose）**。settings table read は v1 で不要（将来 user 設定読取は別 gate）。

## 6. guarded full shadow plan
- staging ref(hjcrvndumgiovyfdacwc) allowlist・本番(aljav…) denylist・service_role 検出 fatal・GO flag 必須・read-only・write 0・redacted。
- **context は fixture 注入**（server で energy/weather を読めないため・density は anchors から pure 派生可）。memory は Step 3 同様 seed→cleanup or empty。

## 7. implementation slices（分割案）
| slice | 内容 | 種別 / gate |
|---|---|---|
| **4-A schedule reader** | 既存 anchor source 再利用 + **ExternalAnchor/row → PlanItemSnapshot pure mapper**（time parser HH:mm+ISO・title redact・governance from rigidity） | pure mapper + 既存 reader 再利用 |
| **4-B gap adapter** | column-restricted row → buildDayGraph 入力 form 確認 + `buildDayGraph`(pure) → GapNode → `gapNodesToAvailableWindows` | pure |
| **4-C context（注入境界）** | **server で energy/weather を読まない**。density は anchors から派生可。context は **port で注入**（client/fixture）・欠損は null→readiness | interface + 注入（実 read なし） |
| **4-D full WorldState assembler** | `assembleWorldState`(既存 port) の **real port 実装**（schedule/gap=anchor 由来・context=注入・mobility placeholder・permission 引数） | server-only wiring（anchor read = DB read gate） |
| **4-E guarded full shadow** | staging で anchors を read → WorldState 組立 → pipeline → redacted envelope 観測（context fixture・write 0・cleanup） | staging read gate |

---

## 8. 報告事項（CEO 判断用）
- **読む対象（server）**：`external_anchors`（owner-RLS・column-restricted・既存 reader）→ schedule + gap（buildDayGraph pure）。density は anchors から pure 派生。
- **読まない対象**：context の **energy/weather（client-side・注入）**・mobility（MAP placeholder）・permission（引数）・PlanClient/route/DB write/apply。
- **selected columns 案**：`ANCHOR_COLUMNS_SQL`（既存・raw/title 詳細を不要なら除外検討・最低 id/startTime/endTime/rigidity・title は **読むが mapper で redact**）。
- **mapping 案**：ExternalAnchor → PlanItemSnapshot（time parser・title→null・governance from rigidity）。anchors → buildDayGraph → GapNode → AvailableWindow。
- **energy 値域確認方針**：**確定済 0..1**（baseEnergyLevel 正規化）。shadow でも実値が [0,1] かを assert で再確認。
- **次に実装してよい最小 scope（推奨）**：**4-A schedule reader（pure mapper 中心・既存 anchor reader 再利用）+ 4-B gap（pure）**。両者は **DB read を新規追加せず**（4-A は既存 anchor reader を使うが、reader 自体は既存）pure mapper が主。
- **gate 該当**：4-D の **anchor を実 client で read**・4-E の **staging full shadow 実行**（実データ read gate）。4-A/4-B の pure mapper は no-gate（fake/fixture でテスト可）。

## 9. stop 条件チェック（全クリア・1 件は設計制約）
production ref 不使用 / service_role 不要 / owner-RLS で read 可 / forbidden column 不要（column-restricted 既存）/ raw・title は **redact して返す**（詳細を未 redact で返さない）/ Plan 本線接続 不要 / route/API 不要 / DB write 不要 / MAP/GPS/live route/GTFS に踏み込まない / **energy 値域は確定（0..1）** / **既存 shape の差異 = context が client-side（設計制約・stop でない・注入で解決）+ buildDayGraph 入力 form（Step 4-B で確認）**。
