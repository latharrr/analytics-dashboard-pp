-- Matching KPIs (newly tracked, per the spec). Real enum values confirmed
-- via pg_enum: flatmate_interaction_status (intro_sent, accepted, rejected,
-- expired, pending); flatmate_payment_status (none, escrowed, refunded,
-- captured, refund_failed, refunding).
CREATE MATERIALIZED VIEW mv_matching_kpis AS
SELECT
  (SELECT count(*) FROM flatmate_interactions) AS total_interactions,
  (SELECT count(*) FROM flatmate_interactions WHERE created_at >= now() - interval '30 days') AS interactions_last_30_days,
  (SELECT count(*) FROM flatmate_interactions WHERE interaction_status = 'accepted') AS accepted_interactions,
  (SELECT count(*) FROM flatmate_interactions WHERE payment_status = 'captured') AS captured_payments,
  (SELECT count(*) FROM user_lifestyle_profiles) AS lifestyle_profiles_completed,
  (SELECT count(*) FROM user_tag_affinity) AS tag_affinity_signals,
  (SELECT count(*) FROM user_tags) AS user_tag_assignments,
  (SELECT count(*) FROM tags WHERE is_active = true) AS active_tags,
  (SELECT count(*) FROM tag_categories WHERE is_active = true) AS active_tag_categories,
  (SELECT count(*) FROM intent_questions WHERE is_active = true) AS active_intent_questions,
  (SELECT count(*) FROM intent_question_responses) AS intent_question_responses;

CREATE UNIQUE INDEX ON mv_matching_kpis ((1));
GRANT SELECT ON mv_matching_kpis TO analytics_readonly;
