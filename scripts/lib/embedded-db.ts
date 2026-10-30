import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

// A real PostgreSQL server bundled as an npm dependency, so local development
// and the test suites need no Docker or system install.

const USER = "unison";
const PASSWORD = "unison";
const DATABASE = "unison";

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export interface EmbeddedDb {
  url: string;
  stop: () => Promise<void>;
}

export async function startEmbeddedDb(options: {
  dataDir: string;
  port: number;
  persistent: boolean;
}): Promise<EmbeddedDb> {
  const dataDir = path.resolve(options.dataDir);
  await mkdir(path.dirname(dataDir), { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port: options.port,
    persistent: options.persistent,
    onLog: () => {},
    onError: () => {},
  });

  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(DATABASE);
  } catch {
    // already exists (persistent data dir)
  }

  return {
    url: `postgres://${USER}:${PASSWORD}@127.0.0.1:${options.port}/${DATABASE}`,
    stop: () => pg.stop(),
  };
}
