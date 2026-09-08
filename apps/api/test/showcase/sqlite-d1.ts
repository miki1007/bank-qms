import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export class SqliteD1 {
  readonly sql = new DatabaseSync(":memory:");
  constructor() {
    const directory = fileURLToPath(
      new URL("../../../../drizzle/", import.meta.url),
    );
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort())
      this.sql.exec(readFileSync(`${directory}/${file}`, "utf8"));
  }
  prepare(sql: string) {
    return new Statement(this.sql, sql);
  }
  async batch(statements: Statement[]) {
    this.sql.exec("BEGIN IMMEDIATE");
    try {
      const result = statements.map((statement) => statement.execute());
      this.sql.exec("COMMIT");
      return result;
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
  }
}
class Statement {
  private values: unknown[] = [];
  constructor(
    private db: DatabaseSync,
    private query: string,
  ) {}
  bind(...values: unknown[]) {
    const next = new Statement(this.db, this.query);
    next.values = values;
    return next;
  }
  execute() {
    const statement = this.db.prepare(this.query);
    const results = statement.all(...(this.values as never[]));
    return {
      results,
      success: true,
      meta: {
        changes: Number(
          this.db.prepare("SELECT changes() AS count").get()?.count ?? 0,
        ),
      },
    };
  }
  async first() {
    return this.execute().results[0] ?? null;
  }
  async all() {
    return this.execute();
  }
  async run() {
    return this.execute();
  }
}
