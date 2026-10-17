import { drizzle } from 'drizzle-orm/node-sqlite';
import { DatabaseSync } from 'node:sqlite';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new DatabaseSync(DATABASE_URL);
// SQLite leaves foreign keys (and so ON DELETE CASCADE) off unless asked.
client.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

// Drizzle 1.0 takes the client in a config object; relations are added here once the schema has them.
export const db = drizzle({ client });
