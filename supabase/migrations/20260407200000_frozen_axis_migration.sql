-- ============================================================
-- P2-5: Frozen Axis Migration
-- boundary_respect → boundary_awareness 統合
-- pressure_risk + exclusivity_pressure → control_tendency サブスコア化
--
-- 設計書: docs/design/stargazer-alter-axis-architecture.md §8-C/D/E
-- ロールバック: forwardTo解除 + スコア復旧（旧行は保持されるため可能）
--
-- ⚠️ CEO承認後に実行すること
-- ============================================================

-- ────────────────────────────────────────────────
-- §8-C: boundary_respect → boundary_awareness 統合
-- ────────────────────────────────────────────────

-- boundary_awarenessの新スコア = boundary_awareness(0.7) + boundary_respect(0.3)
-- boundary_respectの行は削除せず保持（analytics後方互換）
UPDATE stargazer_axis_scores SET
  score = (
    COALESCE(
      (SELECT score FROM stargazer_axis_scores AS ba
       WHERE ba.user_id = stargazer_axis_scores.user_id
       AND ba.axis_id = 'boundary_awareness') * 0.7
    +
      (SELECT score FROM stargazer_axis_scores AS br
       WHERE br.user_id = stargazer_axis_scores.user_id
       AND br.axis_id = 'boundary_respect') * 0.3,
      stargazer_axis_scores.score  -- fallback: 元の値を維持
    )
  )
WHERE axis_id = 'boundary_awareness'
  AND EXISTS (
    SELECT 1 FROM stargazer_axis_scores AS br
    WHERE br.user_id = stargazer_axis_scores.user_id
    AND br.axis_id = 'boundary_respect'
  );

-- ────────────────────────────────────────────────
-- §8-D/E: pressure_risk + exclusivity_pressure → control_tendency サブスコア化
-- ────────────────────────────────────────────────

-- control_tendencyの新スコア = general_control(0.5) + pressure_risk(0.3) + exclusivity_pressure(0.2)
-- pressure_risk, exclusivity_pressureの行は削除せず保持（analytics後方互換）
UPDATE stargazer_axis_scores SET
  score = (
    COALESCE(
      (SELECT score FROM stargazer_axis_scores AS ct
       WHERE ct.user_id = stargazer_axis_scores.user_id
       AND ct.axis_id = 'control_tendency') * 0.5
    +
      (SELECT score FROM stargazer_axis_scores AS pr
       WHERE pr.user_id = stargazer_axis_scores.user_id
       AND pr.axis_id = 'pressure_risk') * 0.3
    +
      (SELECT score FROM stargazer_axis_scores AS ep
       WHERE ep.user_id = stargazer_axis_scores.user_id
       AND ep.axis_id = 'exclusivity_pressure') * 0.2,
      stargazer_axis_scores.score  -- fallback: 元の値を維持
    )
  )
WHERE axis_id = 'control_tendency'
  AND (
    EXISTS (
      SELECT 1 FROM stargazer_axis_scores AS pr
      WHERE pr.user_id = stargazer_axis_scores.user_id
      AND pr.axis_id = 'pressure_risk'
    )
    OR EXISTS (
      SELECT 1 FROM stargazer_axis_scores AS ep
      WHERE ep.user_id = stargazer_axis_scores.user_id
      AND ep.axis_id = 'exclusivity_pressure'
    )
  );

-- ────────────────────────────────────────────────
-- 検証クエリ（実行後に確認用）
-- ────────────────────────────────────────────────

-- 影響行数の確認:
-- SELECT count(*) FROM stargazer_axis_scores WHERE axis_id = 'boundary_awareness';
-- SELECT count(*) FROM stargazer_axis_scores WHERE axis_id = 'control_tendency';

-- frozen軸の旧データ保持確認:
-- SELECT count(*) FROM stargazer_axis_scores WHERE axis_id IN ('boundary_respect', 'pressure_risk', 'exclusivity_pressure');
