/**
 * env.DB: this app's SQLite database (Cloudflare D1). The tables come from db/migrations/*.sql:
 * `npx ambasada db migrate` online, `npx wrangler d1 migrations apply DB --local` for `ambasada dev`.
 * A tiny typed layer, no ORM: SQL with ? placeholders in, plain objects out.
 *
 *   const notes = await all<Note>(env.DB, "SELECT * FROM notes ORDER BY id DESC LIMIT ?", 20);
 *   const note = await first<Note>(env.DB, "SELECT * FROM notes WHERE id = ?", id);
 *   const { lastRowId } = await run(env.DB, "INSERT INTO notes (text) VALUES (?)", text);
 *   await batch(env.DB, [["UPDATE a SET n = n - 1 WHERE id = ?", 1], ["UPDATE b SET n = n + 1 WHERE id = ?", 2]]); // one transaction
 */

export type Param = string | number | boolean | null | ArrayBuffer;

/** What this file needs from a D1 binding (env.DB satisfies it). */
export interface Database {
  prepare(query: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}

export interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
}

const statement = (db: Database, query: string, params: Param[]) => db.prepare(query).bind(...params);

/** Every row. */
export async function all<T = Record<string, unknown>>(db: Database, query: string, ...params: Param[]): Promise<T[]> {
  return (await statement(db, query, params).all<T>()).results;
}

/** The first row, or null. */
export function first<T = Record<string, unknown>>(db: Database, query: string, ...params: Param[]): Promise<T | null> {
  return statement(db, query, params).first<T>();
}

/** INSERT, UPDATE, DELETE: how many rows changed and the last inserted id. */
export async function run(db: Database, query: string, ...params: Param[]): Promise<{ changes: number; lastRowId: number }> {
  const { meta } = await statement(db, query, params).run();
  return { changes: meta.changes, lastRowId: meta.last_row_id };
}

/** Several statements in one transaction: all of them apply, or none. */
export async function batch(db: Database, statements: [query: string, ...params: Param[]][]): Promise<void> {
  await db.batch(statements.map(([query, ...params]) => statement(db, query, params)));
}
