import * as duckdb from "@duckdb/duckdb-wasm";
import emptyURL from "./empty-db.bin?url";
import wasmURL from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import workerURL from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

export type Param = string | number | boolean | null;
export class Engine {
  private constructor(
    readonly db: duckdb.AsyncDuckDB,
    public con: duckdb.AsyncDuckDBConnection,
    readonly worker: Worker,
  ) {}
  static async open(bytes?: Uint8Array) {
    const worker = new Worker(workerURL),
      db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    try {
      await db.instantiate(wasmURL);
      await db.registerFileBuffer(
        "record-life.duckdb",
        bytes?.slice() ??
          new Uint8Array(await (await fetch(emptyURL)).arrayBuffer()),
      );
      await db.open({
        path: "record-life.duckdb",
        accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
        query: { castBigIntToDouble: true, castDecimalToDouble: true },
      });
      const con = await db.connect();
      await con.query(
        "SET autoinstall_known_extensions=false; SET autoload_known_extensions=false; SET enable_external_access=false",
      );
      return new Engine(db, con, worker);
    } catch (e) {
      await db.terminate();
      worker.terminate();
      throw e;
    }
  }
  async exec(sql: string, params: Param[] = []) {
    if (!params.length) {
      await this.con.query(sql);
      return;
    }
    const statement = await this.con.prepare(sql);
    try {
      await statement.query(...params);
    } finally {
      await statement.close();
    }
  }
  async rows<T = Record<string, unknown>>(
    sql: string,
    params: Param[] = [],
  ): Promise<T[]> {
    const statement = await this.con.prepare(sql);
    try {
      const result = await statement.query(...params);
      return result.toArray().map(
        (row) =>
          Object.fromEntries(
            result.schema.fields.map((field) => {
              const value = row[field.name];
              // Arrow Date/Timestamp getters return milliseconds. Do not auto-load the
              // remote DuckDB JSON extension: every query must also work fully offline.
              const normalized =
                value == null
                  ? null
                  : field.type.typeId === 8
                    ? new Date(Number(value)).toISOString().slice(0, 10)
                    : field.type.typeId === 10
                      ? new Date(Number(value)).toISOString().slice(0, -1)
                      : typeof value === "bigint"
                        ? Number(value)
                        : value;
              return [field.name, normalized];
            }),
          ) as T,
      );
    } finally {
      await statement.close();
    }
  }
  async bytes() {
    await this.exec("CHECKPOINT");
    return this.db.copyFileToBuffer("record-life.duckdb");
  }
  async close() {
    try {
      await this.con.close();
    } finally {
      await this.db.terminate();
      this.worker.terminate();
    }
  }
}
