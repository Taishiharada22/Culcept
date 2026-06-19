# Real Supabase Repository Adapter Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし・concrete adapter 実装なし・generated types 生成なし・real DB なし**。実装は CEO 承認後。
> 上位文脈: durable 安全層（SQL 設計・pure types・in-memory harness・SQL draft〔apply smoke 済〕・DB port + mapping adapter）完成。**残 gap = concrete Supabase port**。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論設計 ⑦超越的アイデア ⑧世界トップシェア。

---

## 0. grounding（②・実コード精査）
- `supabaseServer()`（`lib/supabase/server.ts`）= `createServerClient`（@supabase/ssr・**user-RLS**・cookie auth）。travel action は既に `supabaseServer().auth.getUser()` で auth を取得。
- **generated `Database` types は repo に無い**（`*.types.ts` 不在）。
- ★ **既存 user-RLS repository の house style**（`lib/plan/reality/learning/supabase-prm-learning-event-reader.ts` 等）:
  - `import "server-only"` + **注入された最小 structural client interface**（`from(table).select(cols).eq().order().limit()` 等を構造で定義し、実 Supabase client が structural に満たす）。**`createClient` を内部でしない**（注入）。
  - **service_role 禁止**・column-restricted・**fail-open**・**barrel 非 export・未配線**。
  - → **generated types を回避**して user-RLS adapter を書く確立パターン（ただし read のみが現状の precedent）。
- `TravelSessionDbPort`（port）+ `createTravelSessionRepositoryFromDbPort`（mapping + 検証 + forbidden guard）は実装済。SQL draft の RLS owner-only + CHECK は apply smoke で検証済。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | 評価 |
|---|---|
| **concrete Supabase adapter **設計**（本書・docs-only）** | **推奨・次**。残 concrete 作業（client 制約・generated types 要否・atomicity・error mapping・配線点）を実装前に確定。zero risk |
| generated types / local Supabase smoke（Docker） | 後（**設計が前提条件として位置づける**・Docker 動作環境要） |
| server action persistence preflight | 後（port 実装の後・persistence 配線は別 GO） |
| production deny release | **最後**（durable 完成後） |
| work pause | 却下（durable は近い・設計は無リスク） |

**推奨: concrete adapter 設計 次・docs-only。** 根拠（①⑤⑧）: port + mapping adapter は揃った。残るは「`TravelSessionDbPort` の **real Supabase 実装**」。だが (i) generated types 不在、(ii) Docker local Supabase は本 sandbox で不可、(iii) staging/production apply 未実施 → **unknown な generated types/実 schema に対し concrete を盲目実装するのは危険**。よって**設計で制約と前提条件を確定**し、実装は前提充足後の別 GO にする。

---

## 2. 現 durable stack（②）
| 層 | 状態 |
|---|---|
| SQL 設計（docs） | ✅ |
| SQL draft + local ephemeral apply smoke（RLS owner-only + CHECK 検証） | ✅（ephemeral・staging 未 apply） |
| persisted model 型 | ✅ |
| in-memory repository harness | ✅ |
| DB port 型（`TravelSessionDbPort` + rows） | ✅ |
| DB port repository adapter（mapping + 検証） | ✅ |
| **concrete Supabase port** | ❌ **HOLD（本書で設計）** |
| generated types / staging apply / persistence 配線 / production 解禁 | ❌ HOLD |

## 3. concrete adapter problem（③）
- `TravelSessionDbPort` は在るが **real Supabase 実装が無い**。
- **generated types 不在**。
- **Docker local Supabase が本環境で不可**（daemon 無応答）。
- **staging/production DB apply 未実施**。
- → **unknown な generated types/実 schema に対し plan なしで concrete を実装するのは危険**。

## 4. adapter architecture（§4）
- concrete adapter は **`TravelSessionDbPort` を実装**（port interface のみ）。
- repository 契約は layered のまま:
  - `TravelSessionRepositoryContract`（domain）
  - `createTravelSessionRepositoryFromDbPort`（mapping + **domain 検証 + forbidden guard を既に担う**）
  - `createSupabaseTravelSessionDbPort(client)`（**本書で設計する concrete port**・table ops のみ）
- concrete adapter は **domain 検証をしない**（mapping adapter が担当済）。
- concrete adapter は **user-RLS table 操作のみ**（insert/select/delete を owner-scoped）。

## 5. Supabase client 制約（§5）
- **user-RLS Supabase server client のみ**（`supabaseServer()`＝createServerClient）。
- **service_role なし**・**admin client なし**・**bypass なし**。
- **auth user 必須**（呼び元 action が getUser で確認・未認証は unavailable）。
- **ownerUserId は auth user と一致**するか **RLS が最終強制**（client 信頼の owner override なし）。
- **public access なし**。
- ★ house style に倣い **client は注入**（concrete port は `createClient` を内部でしない・structural client interface を受ける）。

## 6. generated types 要件（§6・①重要判断）
- generated `Database` types は **local apply 後に review** すべき。
- 理想は typed `Database` を import（write の column 安全）。
- **但し generated types 不在なら concrete 実装は HOLD が CEO 方針**。
- ★ **codebase precedent（prm readers）は generated types を回避し structural client interface で user-RLS adapter を書く**。WRITE（insert/delete）は read より高リスクゆえ column 名の type 安全が望ましい。
- **推奨（⑦）**: 2 経路を CEO が選択。
  - **(A 安全) generated types を待つ**: Docker 動作環境で local Supabase apply → `supabase gen types` review → typed `Database` で concrete 実装。**最も type-safe・CEO 既定の preferred**。
  - **(B 実用) structural client + mock 契約 test**: precedent に倣い最小 structural write/read client interface を定義し concrete logic（table ops・owner-scope・error mapping）を **mock のみで検証**（real DB/generated types 不要）。real-DB 配線は generated types/RLS smoke 後。**write 安全性は test + DB CHECK/RLS が担保**。
- どちらでも **temporary untyped 部分は明示マーク + 契約 test 必須**。

## 7. operations（§7）
- insertSession / insertInputs / insertLinks / selectBundleByOwner / listByOwner / deleteByOwner。
- **全 owner-scoped filter**（`.eq('owner_user_id', ownerUserId)` / session 経由）。
- **RLS が最終 gate**（client filter が漏れても RLS が owner 外を拒否）。
- **display/projection/cue 永続なし**・**href/generatedUrl 永続なし**（port row に列が無い＝構造的に不能）。

## 8. transaction / atomicity（§8）
- ★ **Supabase JS client は複数 `.from()` 呼び出しを跨ぐ transaction を持たない**（各 insert は別 HTTP request）。→ session+inputs+links の 3 table save は **plain client では atomic でない**。
| 案 | 内容 | 評価 |
|---|---|---|
| A. RPC / transaction function | Postgres 関数で atomic | **HOLD**（DB 関数＝migration 要・SECURITY DEFINER は RLS bypass ゆえ INVOKER + owner check 必須・複雑） |
| **B. insert session → children + 失敗時 cleanup** | session insert→inputs/links insert→部分失敗なら session を delete（**FK ON DELETE CASCADE で children も削除**） | **◎ 推奨 MVP**（service_role/RPC なし・draft の cascade を活用・明確な失敗意味論） |
| C. non-atomic MVP（明確な失敗意味論） | cleanup なし | 次善（孤児 children リスク） |

**推奨: B（session insert → children → 失敗時に session delete でロールバック相当）。** service_role/RPC 不要。RPC atomic は **HOLD**（migration + RLS 設計が要る別 GO）。

## 9. error handling（§9）
- DB error → **中立 persistence error**（`forbidden_field`/`non_inert_link`/`not_owner`/`invalid_input`）に map。
  - RLS denial（owner 外 insert/select）→ **`not_owner` 相当**（行が見えない＝null・select は owner-scoped ゆえ自然に空）。
  - CHECK violation（generated_maps_search / generated=true / inert=false / red_line 等）→ **`invalid_input`**。
  - duplicate id → invalid_input（uuid 採番ゆえ稀）。
  - partial write → §8-B cleanup 後 `invalid_input`/error。
  - network / unavailable → 中立 error（**raw DB diagnostics を client に出さない**・必要なら server-only log のみ）。
- ★ 現 `TravelSessionPersistenceError` に network 用 neutral が無い → **additive `unavailable` を足すか invalid_input に寄せる**（実装時判断・additive）。

## 10. adapter 実装前の RLS smoke 要件（§10）
- **Docker 動作環境で real auth schema 付き local Supabase apply**（本 sandbox の Docker は無応答ゆえ ephemeral postgres + auth stub で代替済＝近似 proof）。
- generated types review。
- owner insert/select/update/delete・**non-owner denial**。
- links `generated_maps_search` reject・`red_line` reject・generated=true/inert=false reject（**ephemeral smoke で確認済**）。
- forbidden 列なし・**service_role なし**。

## 11. 将来 test（§11・実装時）
- **mock Supabase client** が正しい table 操作（from/insert/select/eq/delete）に map。
- **service_role import なし**・**admin client なし**。
- forbidden 列を select しない。
- insert rows が DB port row（snake_case）に一致。
- RLS denial → **中立 failure**（raw diag なし）。
- CHECK violation → 中立 failure。
- **concrete port を挿しても `createTravelSessionRepositoryFromDbPort` 契約 test が pass**（in-memory harness と交換可能）。
- app/UI / M2 runtime / CoAlter/useCoAlter / `/talk` / booking/calendar/action を import しない。
- **tsc baseline 不変（55）**。

## 12. 実装オプション + 推奨（§12・⑤）
| 案 | 内容 | 評価 |
|---|---|---|
| A. generated types + local Supabase smoke を待つ | Docker 環境で apply→gen types→typed 実装 | **type-safe・CEO preferred** |
| **B. mock-only Supabase adapter（structural client + 契約 test）** | precedent に倣い concrete logic を mock で検証・real DB/types 不要 | **◎ 次の実装可能 step**（無 DB・generated types 不要・write logic を安全に固める） |
| C. generated types 後に typed concrete 実装 | local apply 後 | A の続き（real-DB 配線） |
| D. RPC/transaction を後で設計 | atomic 強化 | 後（HOLD） |
| E. persistence を止め非 DB Travel work へ | — | 代替（durable が近いので非推奨） |

**推奨: B（mock-only structural concrete adapter + 契約 test）を次の実装 step**に。precedent（prm readers）に倣い real DB/generated types なしで concrete port の logic（table ops・owner-scope・§8-B cleanup・§9 error mapping）を mock で固める。**その後 A/C（Docker 環境で local Supabase apply→generated types review→real-DB 配線）**。**RPC atomic（D）・staging apply・persistence 配線・production 解禁は HOLD。**
> ★ CEO §6 の「generated types を待つ（A）」が最も type-safe。B は precedent 準拠の現実解で **real DB を touch せず concrete logic を前進**できる。どちらを先にするかは CEO 判断（B は無 DB ゆえ本トラックの規律と最も整合）。

## 13. Stop
- 本書（Real Supabase Repository Adapter Design）で**停止**。
- concrete adapter 実装は **CEO 承認まで行わない**（generated types 生成・local reset・staging/production apply・service_role・persistence 配線も HOLD）。

---

## 出力サマリ
- **前提（①⑤⑧）**: 次は **concrete Supabase adapter 設計（docs-only）**。port + mapping は揃い、残は `TravelSessionDbPort` の real Supabase 実装。だが generated types 不在・Docker local Supabase 不可・staging 未 apply ゆえ、**設計で制約/前提を確定し実装は前提充足後**。
- **architecture（④）**: layered 維持（domain contract → mapping adapter〔検証/guard 済〕 → **concrete `createSupabaseTravelSessionDbPort(client)`〔table ops のみ・注入 client〕**）。
- **client（⑤）**: user-RLS `supabaseServer()` のみ・**service_role/admin/bypass なし**・owner は auth/RLS 強制・注入 client（house style）。
- **generated types（①⑥）**: 不在。(A) generated types を待つ＝最 type-safe・CEO preferred／(B) precedent の structural client + mock 契約 test＝real DB/types 不要で concrete logic を前進。
- **atomicity（③）**: Supabase JS は跨 table transaction なし → **B案: session→children→失敗時 session delete（cascade）** を推奨 MVP（service_role/RPC なし）。RPC atomic は HOLD。
- **error（⑨）**: DB error→中立 persistence error（RLS denial→not_owner/空・CHECK→invalid_input・network→中立）・**raw diag を client に出さない**。`unavailable` neutral の additive 追加は実装時判断。
- **推奨次フェーズ**: **B（mock-only structural concrete adapter + 契約 test・無 DB・generated types 不要）**、その後 **A/C（Docker 環境で local Supabase apply→gen types→real-DB 配線）**。RPC/staging apply/persistence 配線/production 解禁は HOLD。
- 本フェーズは **docs-only** — コード/型/テスト/SQL/generated types 不変・tsc 55・push なし・production 非接触。
