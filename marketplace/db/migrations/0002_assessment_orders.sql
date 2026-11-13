CREATE TABLE assessment_orders (
  id TEXT PRIMARY KEY, access_hash TEXT NOT NULL, intake TEXT NOT NULL,
  tier TEXT NOT NULL, session_id TEXT UNIQUE, created_at INTEGER NOT NULL
);
CREATE INDEX assessment_orders_session ON assessment_orders(session_id);
