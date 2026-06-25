# Production env / flag マニフェスト（2026-06-26）— 最新 /plan をユーザーに届けるために

> 目的: これまで積み上げた最新の /plan（+派生）をユーザーに届ける。
> 本書は監査記録。env 設定・redeploy・flag ON は CEO 実行。値は表示しない。
> 原則: flag は画面だけでなくロジック（server 挙動・DB write・LLM 呼出・engine 版数）もゲートする。
>   → 全部 ON は不可。前提未達（migration/consent/canary）の write/logic flag は OFF 維持。

## 0. flag とロジックの関係（CEO の問いへの回答）
- 画面 flag: 表示の有無だけ（例 NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED = 月ビュー toggle）。
- ロジック flag: server 挙動を変える。例:
  - ALTER_MORNING_V2_ROUTE_ENABLED … Alter が新 V2 morning engine か旧 V1 か（/api/stargazer/alter:1895 で分岐）。/plan・Home の Alter 提案の中核。
  - PLAN_ALTER_NOTE_LIVE … 各予定の LLM 生成 note を出すか（AI keys 必須）。
  - PLAN_SHIFT_IMPORT_SAVE … 取込確認の DB 保存（migration 前提）。
  - REALITY_* … capture/observe/write/surface（production hard-block・migration/consent 前提）。
- ⇒ flag は画面のみではない。write/LLM/engine を握る flag を前提未達で ON にすると壊れる/漏れる。

---

## A. 必須 INFRA env（flag でない・無いとアプリor機能が動かない）
| 区分 | env | 用途 | 状態 |
|---|---|---|---|
| Supabase | NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY | DB/Auth | 投入済（health 200） |
| AI | ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / AI_DEFAULT_PROVIDER / GEMINI_MODEL_DEFAULT / OPENAI_MODEL_DEFAULT / GEMINI_MODEL | Alter/morning/note の LLM | 要確認（model 既定含む） |
| AI infra | AI_INTERNAL_API_KEY / INTERNAL_API_KEY | 内部 API 認証 | 要確認 |
| App URL | NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL | 絶対URL/redirect | 済 |
| Calendar OAuth | GOOGLE_CALENDAR_CLIENT_ID/SECRET/REDIRECT_URI / MICROSOFT_CALENDAR_CLIENT_ID/SECRET/REDIRECT_URI / OAUTH_STATE_SECRET / OAUTH_TOKEN_ENCRYPTION_KEY | カレンダー連携 | 連携使うなら必須 |
| Maps | GOOGLE_MAPS_API_KEY / NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY | geocode/places/map | /plan マップ・場所検索に必須・要確認 |
| Cron | CRON_SECRET | cron 認証 | 使うなら |
| Push | NEXT_PUBLIC_VAPID_PUBLIC_KEY(+private) | web-push | 通知使うなら任意 |
| Admin | ADMIN_EMAILS / CULCEPT_ADMIN_EMAILS | is_admin/管理 | 任意 |

除外（入れない）: Stripe / TURN(NEXT_PUBLIC_TURN_*) / UPSTASH / staging-test・smoke host flag(PLAN_SHIFT_*_HOST, *_VISUAL_SMOKE_PREVIEW) / DEBUG 系(ALTER_MORNING_TRACE_VERBOSE 等)。

---

## B. /plan を最新の見た目+機能で出すために ON にする flag
| flag | 種別 | 効果 | 状態/推奨 |
|---|---|---|---|
| PLAN_ROUTE_LIVE | 画面 | /plan 描画 | ON 済 |
| PLAN_HOME_SWIPE_ENABLED | 画面 | Home→Plan スワイプ | ON 済 |
| PLAN_COMPOSE_TIMELINE_ENABLED | 画面 | 新 予定追加 UI（旧 Modal 解消） | ON 済 |
| NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED | 画面 | 月ビュー toggle | ON 済 |
| PLAN_ALTER_TAB_ENABLED | 画面 | バッテリータブ | ON 済 |
| NEXT_PUBLIC_PLAN_COALTER_TAB_ENABLED | 画面 | CoAlter タブ | ON 済 |
| ALTER_MORNING_V2_ROUTE_ENABLED | ロジック | Alter を新 V2 morning engine に（提案の中核） | ON 推奨（AI keys + grant 前提） |
| PLAN_ALTER_NOTE_LIVE | ロジック(LLM) | 予定ごとの LLM note | ON 推奨（AI keys 必須・cost cap 内蔵） |
| NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED | 画面 | シフト取込の入口 | ON 可（保存は C 参照） |
| PLAN_DAY_STATE_STORAGE | localStorage | battery tab dogfood 保存 | alter tab とセットで ON 可（DB write 無） |
| NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED | 画面 | Travel 日別詳細 | Travel 出すなら ON |
| NEXT_PUBLIC_PLAN_TRAVEL_MAP_LIVE_ENABLED | 画面+Maps | Travel 実地図 | Maps key 前提で ON |

B の前提（ロジック ON 時）:
1. AI keys（A）が揃っていること（V2 engine / alterNote が LLM を呼ぶ）。
2. /api/stargazer/alter・/api/alter-morning/plan・anchors が触る table の grant（/plan grant slice + α）。→ C-grant 監査要。

---

## C. ON にしてはいけない（前提未達・壊れる/漏れる/コスト/dev/canary）
| flag | 理由（なぜ OFF） |
|---|---|
| PLAN_SHIFT_IMPORT_SAVE | DB 保存は migration(6B) 前提。未適用で ON だと取込保存が失敗。入口(B)は出せるが保存は別 GO |
| PLAN_SHIFT_DRAFT_LIVE_ENABLED / PLAN_SHIFT_VLM_INPUT_MODE | VLM live 抽出・cost/品質 GO 前提 |
| PLAN_PERSONAL_MODEL_INTEGRATION / PLAN_CANARY_USER_IDS | Personal Model V2 は canary 段階展開。一般 ON は別判断 |
| PLAN_TRAVEL_PERSONALIZATION_REAL_READ / PLAN_COALTER_PERSONALIZATION_REAL_READ | 実軸 read は consent gate + caller 配線未。ON でも no-op or 不正 |
| NEXT_PUBLIC_PLAN_TRAVEL_SUPABASE_REPO_ENABLED | Supabase travel repo は skeleton(throw)。ON で壊れる |
| PLAN_COALTER_SEND_LOCAL / READ_LOCAL / NEXT_PUBLIC_PLAN_COALTER_CHAT_LIVE / READ_MESSAGES / SEND_MESSAGES / DEV_*_ID | local-only / dev 注入専用。production は session 作成未実装 |
| PLAN_COALTER_BRAIN_PREVIEW(+NEXT_PUBLIC_) / PLAN_TRAVEL_PERSONALIZATION_PREVIEW / REALITY_PIPELINE_PREVIEW | dev preview 専用（triple-guard・production hard-block） |
| NEXT_PUBLIC_PLAN_COALTER_ENGINE_LIVE / RELATION_LIVE / THREAD_CONTEXT | CoAlter live は fixture/段階 gate。production 接続は別 GO |
| 全 REALITY_*（CAPTURE_LIVE/OBSERVE/SURFACE/KILL/CANARY、CONSUMED_REFLECTION、LEARNING_EVENT_WRITE、REVIEW_WRITE、SECOND_SELF_SURFACE、TENDENCY_FEEDBACK_*、OS_SURFACE_PROD、COMPLETE_SHADOW、ALTER_BRIDGE_LIVE） | production hard-block・dev/staging 専用・migration/consent 前提。絶対 OFF |
| 全 LIFEOPS_*（READONLY 群 / MAINLINE / STRUCTURED / PROD_* / FEEDBACK_*） | dormant・consumer 無し・migration+2週観測+GO 前提。OFF |
| 全 STARGAZER_FLAGS（COUNTERFACTUAL_LIVE / PERSPECTIVE_ENGINE_LIVE / EXPLICIT/IMPLICIT_SEARCH_LIVE / USE_DERIVED_FACTS / ANON_ENABLED / GATE_OVERRIDES 等） | 点火は DB drift 解消 + scope 確定 + privacy 監査が前提。OFF 維持 |
| ALTER_MORNING_*_ALLOWLIST（TRANSPORT_V2/DIALOG_STATE_V2/PLACES_SEARCH/VISUAL_FLOW/OP5_SHADOW）, ALTER_THIN_SLICE_* | per-user canary CSV。V2 本体は B の ALTER_MORNING_V2_ROUTE_ENABLED で出る。allowlist は段階展開用（空=global fallback） |
| PLACE_DETAILS_ENRICH_PROD_ALLOWED / PE_L1_ENABLED 等 | enrich/perspective の段階 gate。体験中核でない |

---

## D. 残タスク（B をロジック ON にする前に潰す）
1. C-grant 監査（最優先）: ALTER_MORNING_V2_ROUTE_ENABLED / PLAN_ALTER_NOTE_LIVE を ON にすると morning engine が読む table 群に grant が要る。clean prod は系統的 grant 欠落ゆえ /plan grant slice に alter/morning 経路 table を追補しないと 42501。次監査で .from() 洗い出し→最小 grant 確定。
2. AI keys/model 既定の存在確認（A）。
3. Maps key 確認（A）。
4. shift import を使える状態にするには entry + save + migration（C）。今は入口のみ表示が安全。

---

## まとめ（CEO アクション）
- 入れる: A（必須 infra・特に AI keys / Maps key / OAuth secrets 確認）+ B（/plan 表示 flag は ON 済 + ALTER_MORNING_V2_ROUTE_ENABLED・PLAN_ALTER_NOTE_LIVE を C-grant 監査後に ON）。
- 入れない: C（REALITY_*/LIFEOPS_*/STARGAZER_*/dev/local/canary/save 系）。
- 次の作業: D-1 = alter/morning 経路の grant 監査（read-only）→ /plan grant slice 統合版確定 → V2 engine + alterNote を安全に ON にできる。

禁止（本セッション）: env 設定/redeploy/flag ON/SQL 実行/db push/secret 表示 — 一切なし。
