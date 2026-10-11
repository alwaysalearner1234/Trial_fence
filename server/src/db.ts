import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";
import { config } from "./config";

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  db = new DatabaseSync(config.dbFile);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

function migrate(database: DatabaseSync): void {
  // Additive-only migrations so hosted audit data survives restarts/upgrades.
  // (SQLite is the demo store; see README "Production notes" for the Postgres
  // path. DB_FILE env selects the file location.)
  try {
    database.exec("ALTER TABLE denials ADD COLUMN digest TEXT");
  } catch {
    // Column already exists — created by the current schema below.
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_type TEXT NOT NULL,
      hmac TEXT NOT NULL UNIQUE,
      commitment TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    -- Ordered mirror of the on-chain verified group. Keeps only public identity
    -- commitments (used to rebuild the Merkle tree for proof generation).
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leaf_index INTEGER NOT NULL UNIQUE,
      commitment TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL
    );

    -- Relayer-signed, PII-free denial records produced by the relayer whenever
    -- the contract would revert an enrollment. These are relayer audit records,
    -- NOT site attestations: signer is always the relayer key.
    CREATE TABLE IF NOT EXISTS denials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocol_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      nullifier TEXT,
      digest TEXT NOT NULL,
      signature TEXT NOT NULL,
      signer TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Read-only mirrors of on-chain protocol/site metadata for the dashboards.
    CREATE TABLE IF NOT EXISTS protocols (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}