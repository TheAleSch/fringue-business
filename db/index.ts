import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let connection: ReturnType<typeof postgres> | null = null;

function getConnection() {
  if (!connection) {
    connection = postgres(process.env.DATABASE_URL!, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  }
  return connection;
}

export const db = drizzle(getConnection(), { schema });
