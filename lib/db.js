// Postgres (Neon) connection. Two tables, created on first use:
//   records: every ad, dealer, staff user and member, as JSON text (some encrypted), keyed by kind + id
//   files:   car photos (public) and ID / business documents (private, encrypted), as bytes
import { neon } from "@neondatabase/serverless";

let client, ready;

function sql() {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("The database is not connected yet.");
    client = neon(url);
  }
  return client;
}

async function init() {
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS records (
    kind text NOT NULL, id text NOT NULL, data text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, id))`;
  await q`CREATE TABLE IF NOT EXISTS files (
    id text PRIMARY KEY, owner text NOT NULL, content_type text NOT NULL, public boolean NOT NULL,
    data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  await q`CREATE INDEX IF NOT EXISTS files_owner ON files (owner)`;
}

// Returns the query function once the tables exist.
export async function db() {
  ready ||= init().catch((e) => { ready = null; throw e; });
  await ready;
  return sql();
}
