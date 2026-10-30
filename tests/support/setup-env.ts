import { inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.DATABASE_POOL_MAX = "12";
