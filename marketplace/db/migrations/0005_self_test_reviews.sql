CREATE TABLE self_test_kits(id TEXT PRIMARY KEY,buyer TEXT NOT NULL,service_type TEXT NOT NULL,goals TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE evidence_reviews(id TEXT PRIMARY KEY,buyer TEXT NOT NULL,kit_id TEXT NOT NULL,agent_version TEXT NOT NULL,public_record TEXT,private_result TEXT NOT NULL,created_at INTEGER NOT NULL);
