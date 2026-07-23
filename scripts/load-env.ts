import { config } from "dotenv";

// Side-effect module: load .env.local (fallback .env) BEFORE anything that
// reads process.env at import time (e.g. src/db reads DATABASE_URL). Import
// this first — ESM evaluates imported modules in import-statement order, so
// putting `import "./load-env"` above the db-touching imports guarantees the
// env is populated in time.
config({ path: [".env.local", ".env"] });
