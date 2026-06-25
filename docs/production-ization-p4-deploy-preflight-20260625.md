# P4 — DEPLOY PREFLIGHT（origin/main push 直前の最終確認 / 2026-06-25）

> **本書は確認記録（docs-only）。push/deploy はまだしない。** origin/main push = Vercel 本番 deploy（**不可逆**）= CEO 最終 GO 待ち。
> canonical domain = `culcept.vercel.app`（aneurasync.com は未購入ゆえ今回不使用）。

## 検証結果（Claude 側・read-only）
| # | 項目 | 結果 |
|---|---|---|
| 1 | branch / HEAD / status | ✅ `main` / `8a919db56` / clean |
| 2 | local main が P2 docs まで含む | ✅ P0/P1/P2 全 docs commit が history に在り |
| 3 | backup branch 同期 | ✅ backup = `8a919db56`（local main と一致） |
| 4 | origin/main 凍結（古い deploy 元） | ✅ `5a0c0f7ec`（未更新＝現本番は旧コード） |
| 9 | proxy `MAINLINE_SCOPE_ONLY` gate + archived prefix | ✅ code 健在（ARCHIVED_PREFIXES/ARCHIVED_API_PREFIXES/isArchived 実在） |
| 10 | flag 系 default OFF | ✅ code 既定 OFF（env 未設定で OFF） |
| 11a | tsc baseline | ✅ **55** 維持 |
| 11b | plan/reality/lifeops tests | ✅ **397 files / 6557 passed / 0 failed**（test-timeout=30s） |
| 11c | route confinement smoke（local・flag ON） | ✅ archive(`/wardrobe`・`/rendezvous`・`/api/rendezvous`・`/api/recommendations`・`/api/outbound`・`/api/test/login`)=**全404** / mainline(`/`200・`/plan`307→login・`/stargazer`200)=**非404** |
| 11d | flag OFF 回帰 | ✅ 撤去後 dev OFF 復帰（fashion=従来挙動） |

## CEO 報告ベースの確認（Claude は Vercel/Supabase dashboard を読まない・値非表示）
| # | 項目 | 状態 |
|---|---|---|
| 5/6 | Vercel Production env 存在・URL系統一 | CEO 報告: `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL`/`GOOGLE_CALENDAR_REDIRECT_URI`/`MICROSOFT_CALENDAR_REDIRECT_URI` = **`culcept.vercel.app`** に統一済（Claude は Vercel を読めない＝CEO 目視確認に依拠） |
| 9 | `MAINLINE_SCOPE_ONLY=true` | CEO 報告: 設定済 |
| 10 | flag 系 未設定/OFF | CEO 報告: 未設定（`MAINLINE_SCOPE_ONLY` のみ true） |

## ⚠️ push 前に CEO が Vercel/dashboard 側で要確認（Claude 実行不可）
1. **§1 必須 env が Production scope に揃っているか**（特に **`NEXT_PUBLIC_*` は build 時 inline → push=build 前に必須**）。前ターンの「残り key」（`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_MODEL*`/`OPENAI_MODEL_DEFAULT`/`OAUTH_STATE_SECRET`/`OAUTH_TOKEN_ENCRYPTION_KEY`/`CRON_SECRET`/`AI_INTERNAL_API_KEY`/`INTERNAL_API_KEY`/`GOOGLE`・`MICROSOFT_CALENDAR_CLIENT_ID/SECRET`）の投入完了。
2. **Supabase Auth（#7）**: Site URL = `https://culcept.vercel.app` / Redirect allowlist = `/auth/callback`・`/auth/reset-password`。email/password の確認・reset リンクが Site URL を使うため、**login を使うなら push 前に設定**。
3. **Google/Microsoft provider 側（#8）**: 登録 redirect URI を `https://culcept.vercel.app/api/calendar/{google,microsoft}/callback` に。**calendar 連携を使うなら**必要（未登録でも /plan 本体は動く＝calendar 連携は post-deploy 追補で可）。
4. Gemini「Budget 0」回避の model 設定（`GEMINI_MODEL*`）。
5. §4 除外（Stripe/TURN/UPSTASH/staging-test/flag）を**入れていない**こと。

## 既知の留保（deploy ブロッカーではない）
- **deploy 後の本番画面が最新化される**（現 `culcept.vercel.app` は旧コード＝origin/main 未更新ゆえ正常）。
- **calendar OAuth（Google/MS）は provider redirect 登録まで未完なら未稼働**（/plan 本体は動く・別途追補）。
- **`/api/health` が dev/staging で 503**（confinement の問題でなく health 状態・本番 env で別途確認推奨）。
- **aneurasync.com は未購入**＝今回は `culcept.vercel.app` 運用。custom domain は将来 P5。

## push（= 本番 deploy）コマンド（**CEO GO 後のみ**）
```bash
cd /Users/haradataishi/Culcept-main-reflect-20260604
git log --oneline -1                  # 8a919db56 を確認
git push origin HEAD:main             # ← origin/main を local main へ更新 = Vercel 本番 deploy 発火（不可逆）
```
- push 後: Vercel が `8a919db56` を build/deploy。`MAINLINE_SCOPE_ONLY=true` ゆえ fashion/rendezvous は 404。
- rollback: Vercel 即時 rollback（前 deploy へ）/ origin/main を backup branch から戻す（force・最終手段）。

## CEO 最終 GO 待ち
- ☐ §1 必須 env 投入完了（CEO 確認）。
- ☐ Supabase Auth Site URL/Redirect = culcept.vercel.app（login 使うなら）。
- ☐ **origin/main push（本番 deploy）GO** → 実行者（CEO or Claude on GO）を指定。

---
docs-only。push/deploy/flag ON/secret 表示・Vercel/Supabase 編集 一切なし。
