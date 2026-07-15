-- Logs every AI Query panel turn (question, generated SQL, answer).
--
-- Not logged into copilot_chats/copilot_messages: those tables belong to
-- an existing in-app admin-copilot feature, and copilot_chats.admin_id is
-- a NOT NULL foreign key into `users` (Picapool's application users table).
-- This dashboard's shared login has no corresponding users.id, and
-- attaching an arbitrary real admin's id would misattribute every
-- dashboard question to a human who never asked it. This dedicated table
-- avoids that mismatch entirely.
CREATE TABLE IF NOT EXISTS analytics_ai_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  generated_sql text NOT NULL,
  answer text NOT NULL,
  row_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
