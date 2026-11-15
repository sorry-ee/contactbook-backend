CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  owner TEXT NOT NULL,
  body TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  UNIQUE(owner, fingerprint)
);
--> statement-breakpoint
CREATE INDEX contacts_owner_idx ON contacts(owner);
