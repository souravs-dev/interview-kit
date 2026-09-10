import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { connectDb } from "./db/connection.js";
import { createPipelineDeps } from "./adapters/createPipelineDeps.js";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // No .env file present — assume env vars are already set some other way (e.g. a hosting platform).
}

const PORT = Number(process.env.PORT ?? 4000);
const MONGODB_URI = process.env.MONGODB_URI;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");
}

await connectDb(MONGODB_URI);

const app = createApp({ frontendOrigin: FRONTEND_ORIGIN, pipelineDeps: createPipelineDeps(process.env) });

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
