-- Trust & Verification KPIs.
CREATE MATERIALIZED VIEW mv_trust_kpis AS
SELECT
  (SELECT count(*) FROM trust_ledger) AS total_trust_actions,
  (SELECT count(DISTINCT user_id) FROM trust_ledger) AS users_with_trust_activity,
  (
    SELECT round(count(*)::numeric / NULLIF(count(DISTINCT user_id), 0), 2)
    FROM trust_ledger
  ) AS avg_trust_actions_per_active_user,
  (SELECT round(sum(points)::numeric, 0) FROM trust_ledger) AS total_points_awarded,
  (SELECT count(*) FROM trust_rules WHERE is_active = true) AS active_trust_rules,
  (SELECT count(*) FROM kyc_gate_rules WHERE requires_kyc = true) AS kyc_required_actions,
  (SELECT count(*) FROM digilocker_accounts) AS digilocker_linked_accounts;

CREATE UNIQUE INDEX ON mv_trust_kpis ((1));
GRANT SELECT ON mv_trust_kpis TO analytics_readonly;
