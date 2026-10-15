import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { readdir, readFile } from 'node:fs/promises';
import { config } from './config.js';

export const pool = mysql.createPool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  database: config.DB_NAME,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 100,
  timezone: 'Z',
  decimalNumbers: true,
  multipleStatements: false,
});
export type Db = Pool | PoolConnection;
export type Value = string | number | boolean | null | Date;
export async function rows<T>(db: Db, sql: string, params: Value[] = []): Promise<T[]> {
  const [result] = await db.execute<RowDataPacket[]>(sql, params);
  return result as T[];
}
export async function transaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function migrate() {
  const connection = await pool.getConnection();
  try {
    const lock = await rows<{ acquired: number }>(
      connection,
      "SELECT GET_LOCK('autokeep_migrations', 30) AS acquired",
    );
    if (lock[0].acquired !== 1) throw new Error('MIGRATION_LOCK_UNAVAILABLE');
    await connection.execute(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))',
    );
    for (const file of (await readdir('db'))
      .filter((name) => /^\d+_[a-z_]+\.sql$/.test(name))
      .sort()) {
      if (
        (await rows(connection, 'SELECT name FROM schema_migrations WHERE name = ?', [file])).length
      )
        continue;
      const sql = await readFile(new URL(`../../db/${file}`, import.meta.url), 'utf8');
      for (const statement of sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await connection.execute(statement);
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    }
  } finally {
    await connection.execute("SELECT RELEASE_LOCK('autokeep_migrations')");
    connection.release();
  }
}
