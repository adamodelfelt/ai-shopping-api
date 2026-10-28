import { retailerClient } from './lib/ingestion/http.js';
import { parseMarketplace } from './lib/ingestion/marketplaces.js';

const supported = { stadium: 'https://www.stadium.se', ahlens: 'https://www.ahlens.se' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
export function failureCategory(error) {
  if (['source_not_allowed','brand_mismatch','staging_failed'].includes(error.message)) return error.message;
  const code=error.message?.match(/^Retailer request stopped \(HTTP (\d{3})\)$/)?.[1];
  if (['403','429','404','500','502','503','504'].includes(code)) return `retailer_http_${code}`;
  if (error.message==='Retailer robots.txt disallows this URL') return 'robots_disallowed';
  if (error instanceof ReferenceError) return 'runtime_compatibility';
  if (error.message==='Product JSON-LD missing' || error instanceof SyntaxError) return 'product_payload_changed';
  if (error.message==='Worker database operation failed') return 'database_stage_error';
  if (error instanceof TypeError || ['AbortError','TimeoutError'].includes(error.name)) return 'retailer_network_error';
  return 'collection_stopped';
}
export function createWorker({ rpc, collectClient = retailerClient, parse = parseMarketplace, now = () => new Date() }) {
  return async request => {
    if (request.method === 'GET') return reply(200, { service: 'whool-ingest-review', mode: 'allowlisted-products-to-review-only', version: '2026-10-28.1' });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { error: 'json_required' });
    const bytes = []; let length = 0;
    for await (const chunk of request.body ?? []) { length += chunk.byteLength; if (length > 2048) return reply(413, { error: 'body_too_large' }); bytes.push(chunk); }
    let input;
    try { const all = new Uint8Array(length); let offset=0; for (const part of bytes) {all.set(part,offset);offset+=part.byteLength;} input=JSON.parse(new TextDecoder().decode(all)); } catch { return reply(400,{error:'invalid_json'}); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'job_id,token'
      || !/^[0-9a-f-]{36}$/.test(input.job_id) || !/^[0-9a-f]{64}$/.test(input.token)) return reply(400,{error:'invalid_job'});
    let job;
    try { job=await rpc('claim_ingest_job',{p_job_id:input.job_id,p_token:input.token}); } catch { return reply(503,{error:'job_check_unavailable'}); }
    if (!job) return reply(403,{error:'job_not_authorized'});
    try {
      const origin=supported[job.retailer], target=new URL(job.product_url);
      if (!origin || target.origin!==origin || target.username || target.password || target.port || /^h\s*&?\s*m$/i.test(job.brand)) throw new Error('source_not_allowed');
      const get=await collectClient(origin,{attempts:1,timeout:20_000});
      const html=await get(job.product_url);
      const evidence=parse(html,job.product_url,job.retailer);
      if (evidence.proposed_product.brand?.trim().toLowerCase()!==job.brand.trim().toLowerCase()) throw new Error('brand_mismatch');
      const result=await rpc('complete_ingest_job',{p_job_id:input.job_id,p_token:input.token,p_observed_at:now().toISOString(),p_item:evidence});
      if (!result || result.published!==0 || result.staged+result.duplicates!==1) throw new Error('staging_failed');
      return reply(200,{job_id:input.job_id,status:'staged',...result});
    } catch (error) {
      const reason=failureCategory(error);
      try { await rpc('fail_ingest_job',{p_job_id:input.job_id,p_token:input.token,p_reason:reason}); } catch { /* expiry handling in the scheduler fails closed */ }
      return reply(502,{job_id:input.job_id,status:'paused_for_review',reason});
    }
  };
}

export function createRpc(env, fetchImpl=fetch) {
  const base=new URL(env.SUPABASE_URL ?? '');
  if (base.protocol!=='https:' || !/^[a-z0-9]+\.supabase\.co$/.test(base.hostname) || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Runtime configuration missing');
  const allowed=new Set(['claim_ingest_job','complete_ingest_job','fail_ingest_job']);
  return async(name,args)=>{
    if (!allowed.has(name)) throw new Error('Unsupported worker operation');
    const response=await fetchImpl(new URL(`/rest/v1/rpc/${name}`,base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json'},body:JSON.stringify(args)});
    if (!response.ok) throw new Error('Worker database operation failed');
    return response.json();
  };
}
