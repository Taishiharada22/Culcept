# IcsImportModal レイアウト/デザイン整理案（UI のみ・ロジック不変）

- **対象**: `app/(culcept)/plan/components/IcsImportModal.tsx` の `state.kind === "idle"` セクション（line 446-803、計 358 行）。
- **状態**: **方針案（実装前）**。CEO 承認後に最小差分で実装。
- **branch**: `feat/plan-url-import-productization` 継続（U1-U3 と一連、追加 commit）。
- **絶対条件**: ロジック / 文言 / data-testid / 既存 props・state / handler 全部据え置き。**CSS class とマークアップ構造だけ**整理する。U3 render contract test を**壊さない**。

---

## 0. 問題の同意（CEO 指摘の翻訳）

| CEO 指摘 | 現状コードでの実態 |
|---|---|
| 1つ1つが大きすぎる | py-3 / text-sm / 3 ブロック縦並び（Google card / Outlook card / divider / .ics+URL/ガイド/手入力）= モーダル size lg でも縦に伸び切る |
| 巨大グラデーション主導 | Google: `from-indigo-500 to-purple-600` を connected card に full-bleed / Outlook: `from-sky-500 to-blue-600` 同様 / さらに connected 時の緑 `bg-emerald-500` 「予定を取り込む」ボタンも full-width で派手 |
| 主従区別が弱い | provider × 2 / file / URL / ガイド / 手入力 が全部「フル幅 + 同程度の重み」で並ぶ。divider「または」も視覚的に主従を作っていない |

---

## 1. 目標の見え方（情報階層・3 層）

モーダルを開いた瞬間、上から:

1. **接続済みカレンダー**（主導線・OAuth） — Google / Outlook の **provider card 2 枚**
2. **手動取り込み**（補助） — `.ics ファイル` + `公開カレンダー URL` を**ひとつの subtle セクション**に
3. **URL の取り方ガイド**（補助の補助） — 既存どおり inline accordion、薄い row

各層の "重み" の差（tone / spacing / size）で視線誘導を作る。

---

## 2. 外科的にやること（最小差分）

### 2.1 Provider card（Google / Outlook）

**現状**: 接続済状態で `from-indigo-500 to-purple-600` の full gradient ボタンが面を支配 + 下に独立した緑「予定を取り込む」ボタン。disconnected 時は白＋border のフラットボタン。

**修正後（CEO 図 §3 準拠）**:
- 1 枚の subtle card（`bg-white border border-slate-200 rounded-lg p-3`）
- 上段（row）: **左**= provider icon（既存 SVG・サイズ 18→16）+ provider 名 / **右**= 状態 chip（`接続中` or `未接続`、`text-[10px] bg-{tone}-50 text-{tone}-700 px-1.5 py-0.5 rounded-full`）
- 下段:
  - **connected**: 主ボタン **「予定を取り込む」**（中サイズ・ブランド色は border + text のみ、面ベタ塗りなし。`px-3 py-1.5 text-xs border border-{tone}-300 text-{tone}-700 bg-{tone}-50 rounded-md`） / 副: **「接続を解除」**（`text-[10px] text-slate-400 hover:text-slate-600 underline`）
  - **disconnected**: 中サイズの「接続」ボタン 1 つ（白 + tone border・控えめ）
- **gradient 廃止**（CEO §2「面でベタ塗りしすぎない」「gradient は弱くするかなくしてよい」）。ブランド色は **border + text + chip** に残す（識別は維持）。
- error 行は据え置き（`text-[11px] text-rose-600`）。
- 「もう一度押すと接続を解除します」ヒント文言は**廃止候補**（「接続を解除」副操作で意図が明確になり redundant。ただし削除 = 文言変更なので**残置安全策で**「接続を解除」副操作のみ追加・ヒント文言は据え置き or 視覚的に小さく）。

→ provider card の高さ: 現状約 80-110px（disconnected/connected） → 修正後 約 56-72px に縮む。

### 2.2 Provider card 2 枚を group 化

現状: Google card / Outlook card が個別に上下マージン `mb-5` で並ぶ。
修正後: **2 枚を gap-2 で縦並びの 1 group**にし、その下に `border-t` で次セクションへ。group 上に小さい section label **「接続済みカレンダーから取り込む」**（`text-[10px] text-slate-400 uppercase tracking-wide mb-2`、CEO §7「section title」）。

### 2.3 「または」divider → section title へ

現状: `my-4 flex items-center gap-3 text-[10px] text-slate-400 / 「または」` の横線 + テキスト。
修正後: divider は廃止、代わりに **section label**「**手動で取り込む**」（同 `text-[10px] text-slate-400 uppercase tracking-wide mt-4 mb-2`）。section title が主従を作る（CEO §7）。

### 2.4 file + URL を 1 セクション内にまとめる

**現状**: `.ics ファイル input` の下に `border-t` を挟んで URL 副導線を入れる構造（CEO 指摘「同じ重さ」になっている）。

**修正後**: **1 つの subtle セクション**（`bg-slate-50/50 border border-slate-200 rounded-lg p-2.5`）の中に file と URL を入れ、**provider card より薄く**見せる。
- 内側 row 1: `.ics ファイルから` — 既存 file input + 小さい label
- 内側 row 2: 公開カレンダー URL から — 既存 input + button + classifier feedback
- 区切り: `border-t border-slate-200/60` の薄い線

### 2.5 URL input の最適化

CEO §5:
- input height 縮小: `py-1.5` → `py-1`、`text-xs` 維持
- 「取り込む」ボタンサイズ縮小: `px-3 py-1.5` → `px-2.5 py-1`
- placeholder 据え置き
- helper text（label「または公開カレンダーの URL から…」）は中央寄せ → **左寄せ**で section label として `text-[10px] text-slate-500`

### 2.6 Classifier feedback の見た目

CEO §5「小さく、賢く、邪魔しない」:
- `ics_body` の赤カード:
  - 現状: `border-rose-200 bg-rose-50/60 p-2.5` + 2 行テキスト + 「ファイルから取り込む →」CTA
  - 修正後: `border-rose-200/70 bg-rose-50/40 px-2 py-1.5` で薄く、テキスト 1 行に圧縮可能ならする（**ただし文言は変更しない** = CSS のみで詰める）、CTA はインラインリンク化
- `ok` / `page_guess` / `not-a-url`: `mt-1.5 text-[10px]` → `mt-1 text-[10px]` で行間を 1 つ詰める

### 2.7 ガイド accordion を更に軽く

CEO §6:
- トグル：現状 `text-[10px]` → 据え置き、ただし icon「▸ / ▾」を `text-slate-300` に
- accordion row（provider title）: 現状 `py-1.5` → `py-1`
- 展開中の説明 body: `px-2.5 py-2` → `px-2 py-1.5`、step `text-[10px]` 維持

### 2.8 「手入力で 1 件ずつ」副導線

**現状**: 最下段の独立ブロック `mt-5 pt-4 border-t`。
**修正後**: 据え置き（既に控えめテキストリンク）。ただし `mt-5 pt-4` → `mt-4 pt-3` で 1 段詰める。文言・data-testid 不変。

### 2.9 modal 全体

CEO「軽く・シャープ」「subtle border + soft background」「影は弱く」:
- modal は `GlassModal size="lg"` のまま（変更不可、size 変更は modal 用途の意味が変わる）
- 内側コンテナ `space-y-4` → `space-y-3` で全体縮小
- 各 section 間のマージンを統一して呼吸感を作る

---

## 3. 削除しない／変更しないもの（不変条件・絶対）

- **state / handler / props / hook**: 一切触らない（`handleGoogleToggle` / `handleGoogleImport` / `handleMicrosoftToggle` / `handleMicrosoftImport` / `handleFileChange` / `handleUrlFetch` / `openFilePicker` / `setUrlGuideOpen` / `setExpandedGuideKey` 全部据え置き）
- **data-testid**: 既存全 testid を保持（render contract test が固定している）
  - `ics-import-modal` / `google-connect-toggle` / `google-connect-toggle-hint` / `google-connect-error` / `google-import-trigger` / `google-importing` / `microsoft-*`（対称）/ `ics-file-input` / `ics-url-input` / `ics-url-fetch-btn` / `url-classify-ics-body` / `-cta` / `-ok` / `-page-guess` / `-not-a-url` / `url-guide-toggle` / `url-guide-content` / `url-guide-{key}` / `-toggle` / `-body` / `ics-submitted` / `ics-approve-btn` / `ics-switch-to-manual` / `google-importing` / `microsoft-importing`
- **文言**: 一切変更しない（CEO「文言の意味変更しない」）
- **aria 属性**: `aria-pressed` / `aria-expanded` / `role="alert"` 据え置き
- **ロジック**: 取り込み・接続・classification・ガイド開閉・state 遷移すべて不変

---

## 4. テスト方針（U3 render contract 連動）

既存 render contract test（`tests/unit/plan/icsImportModalU3RenderContract.test.tsx`、8 ケース）が固定しているのは:
- `data-testid="ics-import-modal"` の有無
- 既存 testid（input / btn / file / Google / Outlook）の継続
- `url-guide-toggle` の文言「URL の取り方がわからない」
- 初期 `aria-expanded="false"`
- 空入力時 classifier feedback 不出現

→ **すべて本案で保持される**。テスト変更なし。

念のため：
- testid 名は一切変更しない
- aria 属性・初期 state も維持
- 「URL の取り方がわからない」「URL の取り方を閉じる」「✓ カレンダー URL のようです」「公開カレンダーの URL ではないかもしれません」「<code>https://</code> または <code>webcal://</code> の URL を貼ってください」文言全部据え置き

追加テスト不要（class 変更だけ。SSR では style/外観の差はそもそも検出しない契約）。

---

## 5. 想定される差分の規模

- 編集対象: **1 ファイル `IcsImportModal.tsx` の idle section（line 446-803）のみ**
- 編集タイプ: CSS class 文字列の差し替え + 一部ラッパー div の入れ替え（layout 再編成 = group 化と border-t 配置）
- 行数: 概算 -40 ～ -60 行（マークアップ詰め + 統合 = ネット減）/ +0 〜 +20 行（section label, chip 追加）/ ネット **-20 〜 -40 行**

---

## 6. 実装手順（CEO 承認後・最小差分・各段 stop 不要 = 一括）

CEO 方針「ロジック不変・デザインだけ」→ 1 commit で完結が外科的。順番:

1. provider card 2 枚を gradient ベタ → subtle card + chip + 主従ボタンに置換（最大の見た目変化）
2. divider 「または」→ section label「手動で取り込む」へ
3. file + URL を subtle セクションでくくる
4. URL input / button / classifier feedback / guide accordion の余白・サイズ縮小
5. modal 全体 `space-y` 調整
6. tsc baseline 1112 不変・render contract 8 PASS・plan/ics 全 PASS・full suite で flake 以外 0 failure 確認
7. self Playwright smoke（CEO 判断）

---

## 7. CEO 判断仰ぐ点

1. **gradient 全廃 vs 弱化**: 全廃推奨（CEO §2「なくしてもよい」を採用、ブランド色は border + text + chip で残す）。これでよいか。
2. **「もう一度押すと接続を解除します」ヒント**: 「接続を解除」副操作追加で意図明確化されるため redundant、ただし**残置**で安全側にする。これでよいか（廃止すべきなら別途指示）。
3. **section label 文言**: 「接続済みカレンダーから取り込む」/ 「手動で取り込む」/ ガイドはそのまま。新規文言追加だが、**section title であり既存文言の意味変更ではない**。これでよいか。
4. **手入力切替「手入力で 1 件ずつ追加する →」**: 据え置き（位置・文言不変）。これでよいか。
5. self Playwright smoke を実施するか、CEO 実機で見るか。

---

## 8. 今回の stop

- 本書 = **方針案のみ**。実装は CEO 承認後。
- branch `feat/plan-url-import-productization` に本 doc を commit して停止。
- **GO の場合**: §6 の順で**一括 1 commit**で実装（最小差分のため小割しない方が読みやすい）→ render contract + tsc 検証 → 報告 → 次の stop。
- staging smoke / merge / remote は引き続き CEO gate（U3 と同じ）。
