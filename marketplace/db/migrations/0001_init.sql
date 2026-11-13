-- The app's first table. Add the next change as db/migrations/0002_<what>.sql (never edit an applied file), then:
--   npx wrangler d1 migrations apply DB --local   (ambasada dev)
--   npx ambasada db migrate                       (online)
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX notes_created ON notes (created_at);
