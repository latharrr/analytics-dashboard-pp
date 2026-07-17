-- Chat IDs that completed the Telegram bot's password gate, used by
-- /api/telegram/notify-refresh to broadcast the daily "new data fetched"
-- message. Written by /api/telegram/webhook, read only via the
-- service-role client.
CREATE TABLE IF NOT EXISTS analytics_telegram_subscribers (
  chat_id bigint PRIMARY KEY,
  username text,
  verified_at timestamptz NOT NULL DEFAULT now()
);
