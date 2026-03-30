-- Decision Engine: 納得感5段階を追加
-- feedback_note (当たってた/ずれてた/まだわからない) とは別軸で記録

ALTER TABLE stargazer_decision_engine_logs
  ADD COLUMN IF NOT EXISTS satisfaction_rating INTEGER
    CHECK (satisfaction_rating BETWEEN 1 AND 5);

COMMENT ON COLUMN stargazer_decision_engine_logs.satisfaction_rating IS
  '納得感 1-5段階。feedback_note(正確性)とは別に記録';
