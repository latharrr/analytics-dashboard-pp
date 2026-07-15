-- Monetization KPIs. Real rental_campaign_conversions.status values
-- confirmed via introspection: initiated, paid. Real flat_leads.status
-- values (enum flat_lead_status): applied, owner_approved, owner_rejected,
-- fees_paid, expired, post_visit_rejected, token_pending, finalized, closed.
CREATE MATERIALIZED VIEW mv_monetization_kpis AS
SELECT
  (SELECT count(*) FROM rental_referral_clicks) AS total_clicks,
  (SELECT count(*) FROM rental_referral_clicks WHERE clicked_at >= now() - interval '30 days') AS clicks_last_30_days,
  (SELECT count(*) FROM rental_referral_campaigns WHERE is_active = true) AS active_campaigns,
  (SELECT count(*) FROM rental_referral_links WHERE disabled_at IS NULL) AS active_links,
  (SELECT count(*) FROM rental_campaign_conversions) AS total_conversions,
  (SELECT count(*) FROM rental_campaign_conversions WHERE status = 'paid') AS paid_conversions,
  (SELECT round(sum(amount)::numeric, 2) FROM rental_campaign_conversions WHERE status = 'paid') AS total_paid_amount,
  (SELECT count(*) FROM user_rental_campaign_attributions WHERE revoked_at IS NULL AND expires_at > now()) AS active_attributions,
  (SELECT count(*) FROM flat_leads) AS total_flat_leads,
  (SELECT count(*) FROM flat_leads WHERE status IN ('finalized', 'closed')) AS finalized_flat_leads,
  (
    SELECT round(
      100.0 * (SELECT count(*) FROM rental_campaign_conversions WHERE status = 'paid')
      / NULLIF((SELECT count(*) FROM rental_referral_clicks), 0),
      2
    )
  ) AS click_to_paid_rate_pct;

CREATE UNIQUE INDEX ON mv_monetization_kpis ((1));
GRANT SELECT ON mv_monetization_kpis TO analytics_readonly;
