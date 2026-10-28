import { createRpc, createWorker } from './worker.js';
// The public gateway is followed by job-token authentication inside claim_ingest_job.
// Tokens are random, short-lived, single-use, and bound to an operator-approved URL.
const rpc=createRpc({SUPABASE_URL:Deno.env.get('SUPABASE_URL'),SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')});
Deno.serve(createWorker({rpc}));
