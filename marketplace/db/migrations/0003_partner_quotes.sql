CREATE TABLE partner_quotes (
  buyer TEXT NOT NULL, tier TEXT NOT NULL, price INTEGER NOT NULL,
  created_at INTEGER NOT NULL, PRIMARY KEY(buyer, tier)
);
