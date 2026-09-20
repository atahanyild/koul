import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { FundsRecord, FundsStore } from "./funds.js";

/** Local demo store. Keep this directory private: records contain SEP bearer tokens and pre-authorized XDR. */
export class FileFundsStore implements FundsStore {
  constructor(readonly directory: string) {}
  private path(id: string): string {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid transfer ID");
    return join(this.directory, `${id}.json`);
  }
  async get(id: string): Promise<FundsRecord | undefined> {
    try { return JSON.parse(await readFile(this.path(id), "utf8")) as FundsRecord; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }
  async put(record: FundsRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temp = join(this.directory, `${record.id}.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(record), { mode: 0o600 });
    await rename(temp, this.path(record.id));
  }
}
