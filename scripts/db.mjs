// Starts a local PostgreSQL server (downloaded binaries, no Homebrew/Docker needed).
// Data lives in .data/pg. Connection: postgresql://buildbot:buildbot@127.0.0.1:5433/buildbot
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".data", "pg");
const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "buildbot",
  password: "buildbot",
  port: 5433,
  persistent: true,
  onLog: () => {},
  onError: (m) => process.stderr.write(String(m)),
});

if (fresh) {
  console.log("Initialising database cluster in .data/pg ...");
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("buildbot");
} catch {
  /* exists */
}
console.log("PostgreSQL running on 127.0.0.1:5433 (database: buildbot). Press Ctrl+C to stop.");

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
