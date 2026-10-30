// Usage: DATABASE_URL=postgres://… npm run db:migrate
import { migrate } from "./lib/migrate";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (or MIGRATION_DATABASE_URL) to run migrations.");
  process.exit(1);
}

migrate(url).catch((error) => {
  console.error(error);
  process.exit(1);
});
