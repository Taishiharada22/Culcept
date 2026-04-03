# Origin（ジャーナル / 日記）改善パック

## この機能を改善させるための依頼文
```
以下はAneurasyncのOrigin（ジャーナル/日記）機能に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（Stargazerパイプライン、Rendezvousパイプライン、Home画面のContextReel等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: app/(culcept)/origin/(118ファイル), app/api/origin/(17ルート), lib/origin/(95ファイル)
```

## 1. この機能の役割
ユーザーの日常行動・思考・感情を記録し、構造化された自己分析データとしてStargazerに供給する「観測入力チャネル」。単なる日記アプリではなく、記録→仮説→検証→パターン発見のループを回す自己理解ツール。

## 2. 現状の事実
- ページ: app/(culcept)/origin/ に118ファイル
- メインクライアント: OriginPageClient.tsx（75,257バイト、約2,000行推定）
- コンポーネント: _components/ に115ファイル
- APIルート: app/api/origin/ に17個
- ライブラリ: lib/origin/ に95ファイル
- サブシステム5つ: Memory系(6)、Daily Orbit系(25ファイル)、Life Profile系(11)、タイムライン系(5)、分析系(4)
- AI機能: ai-draft（下書き生成）、go-deeper（深掘り探索）
- Stargazer連携: stargazerPipeline.ts（OriginデータをStargazer観測にフィード）
- Rendezvous連携: rendezvousPipeline.ts
- beta運用中（2026-03-29 Go）。機能凍結・観測フェーズ。新機能追加禁止
- UI凍結（3タブFV確定 2026-03-30）

## 3. 世界トップ比較
- Day One: ジャーナル特化。テンプレート、写真/音声/位置情報、暗号化、複数デバイス同期
- Notion日記: 自由形式、テンプレート、データベースビュー、AI要約
- Reflectly: AI日記。感情トラッキング、AIフィードバック、ガイド付きジャーナリング
- Journey: 感情トラッキング、写真/音声、カレンダービュー、Google Fit連携
- Daylio: マイクロジャーナリング。気分 x 活動の相関分析。データビジュアライゼーション

## 4. 測定指標
| 指標 | 現状値 | Day One | Reflectly | Daylio |
|------|--------|---------|-----------|--------|
| メインクライアントサイズ | 75,257B | N/A | N/A | N/A |
| サブコンポーネント数 | 115 | N/A | N/A | N/A |
| サブシステム数 | 5 | 2 | 2 | 1 |
| AI機能 | 2（draft, deeper） | なし | 1（要約） | なし |
| 他機能連携 | 2（Stargazer, Rendezvous） | なし | なし | Google Fit |
| APIルート数 | 17 | N/A | N/A | N/A |
| ライブラリファイル数 | 95 | N/A | N/A | N/A |

## 5. 全問題点
1. OriginPageClient.tsx 75,257バイトの単一クライアントコンポーネント。コード分割困難
2. 115コンポーネントのうち、実際にOriginPageClientから参照されるものの数が不明
3. beta運用・機能凍結中のため、改善は計測改善のみに限定
4. 5サブシステム（Memory, DailyOrbit, LifeProfile, Timeline, Analysis）の関係性が複雑
5. Daily Orbit系25ファイルは日常記録専用。頻度の高い機能だが、ファイル数が多い
6. Stargazer連携パイプラインの動作確認が未実施の可能性
7. AI draft/go-deeperのLLMコストが計測されていない可能性

## 6. 全改善案
A. OriginPageClient.tsxの分割（タブ/セクション別動的インポート）
B. 115コンポーネントの参照マップ作成、未使用コンポーネント特定
C. Stargazer連携パイプラインの動作確認テスト作成
D. AI機能のLLMコスト計測追加
E. Daily Orbit 25ファイルのモジュール整理
F. beta KPI（EntryGate回答率、証拠カード表示率等）の自動ダッシュボード化

## 7. 改善案への反証
A反証: beta運用・機能凍結中。リファクタは凍結解除後に行うべき
B反証: 参照マップ作成は作業であり改善ではない。現状動作しているなら不要
D反証: betaフェーズではコスト最適化より機能検証が優先

## 8. 反証後の再修正
A再修正: 凍結中だが、75KBの単一ファイルはバグ修正時の認知負荷が高い。「分割」ではなく「分割計画の策定」を凍結中に行い、凍結解除後に実行
C再修正: パイプラインのテストはバグ修正の範囲内。凍結に反しない

## 9. 確定改善
1. Stargazer連携パイプラインの動作確認テスト作成（バグ修正範囲）
2. beta KPIクエリ（scripts/origin-beta-kpis.sql）の定期実行設定確認
3. AI機能のLLMコスト計測追加（logging.ts連携）

## 10. 要検証改善
1. OriginPageClientの実際のバンドルサイズ（dynamic import後のchunkサイズ）
2. 115コンポーネントの実参照率
3. Daily Orbit利用頻度（日次アクティブ率）
4. go-deeper機能の利用率

## 11. 要判断改善
1. OriginPageClient分割のタイミング（beta凍結解除後の最優先か）
2. beta KPI不達時のピボット方針
3. Daily Orbit 25ファイルの整理優先度

## 12. 修正時の副作用 / 依存関係
- PageClient分割 → タブ間の状態共有ロジック変更。useHomeDataとの連携確認
- パイプラインテスト → Stargazer側のテスト基盤にも依存
- KPI計測 → analytics基盤、Supabaseクエリ権限

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの
- 削る: 未参照コンポーネント（特定後）
- 残す: 5サブシステム全体（beta運用中のため構造変更なし）、Stargazer/Rendezvous連携
- 強化: KPI計測、パイプラインテスト、LLMコスト可視化
- 統合: なし（凍結中）

## 14. この機能が世界トップを超えるための最終条件
Day OneやReflectlyは「記録→振り返り」で完結。Originが超えるには: (1) 記録が自動的にStargazerの45軸精度を上げる「観測入力」として機能すること、(2) ユーザーが「日記を書くと自己理解が深まる」を体感できること、(3) DayOneの「美しい記録体験」+Reflectlyの「AIフィードバック」+独自の「構造的自己分析」の三位一体。beta運用中のKPI（D7/D14リテンション）が全ての判断基盤。
