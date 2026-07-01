import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

import { initRuntime, CogneeClient } from './src/cogneeClient.ts';
initRuntime();

const client = await CogneeClient.create();
const ds = "debug_" + Date.now();

await client.remember({ type: "text", text: "Paris is the capital of France." }, ds);
await client.waitForIndexingComplete(ds);

const r = await client.search("Paris", {
  datasets: [ds],
  searchType: "GRAPH_COMPLETION",
  onlyContext: true,
  topK: 500,
});

console.log("search_type:", r.search_type);
console.log("result:", JSON.stringify(r.result));
console.log("graphs keys:", r.graphs ? Object.keys(r.graphs) : null);
console.log("graphs:", JSON.stringify(r.graphs, null, 2));

await client.forget({ kind: "dataset", dataset: { name: ds } });
