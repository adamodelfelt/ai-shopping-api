import {parseListing,SOURCE_HOSTS} from './parser.js';
const allowed=new Set(['vint_authenticate','vint_catalogue','vint_claim_refresh','vint_record_observation','vint_complete_refresh']);
async function rpc(name:string,args:Record<string,unknown>={}){if(!allowed.has(name))throw new Error('rpc_not_allowed');const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok)throw new Error('database_error');return response.json();}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function refresh(job:any){let success=0,error:string|null=null;try{for(const item of job.items.slice(0,8)){const u=new URL(item.url);if(u.protocol!=='https:'||u.hostname!==SOURCE_HOSTS[job.source_id]){error='source_changed';break;}
 try{const r=await fetch(item.url,{headers:{'User-Agent':'Whool-Vint/0.1 (bounded secondhand beta; exact registered product refresh)'},redirect:'error',signal:AbortSignal.timeout(12000)});
 if([403,429].includes(r.status)){error='http_'+r.status;break;}if(!r.ok){error='partial_failure';continue;}
 const length=Number(r.headers.get('content-length')||0);if(length>7000000)throw new Error('source_changed');const html=await r.text();if(html.length>7000000)throw new Error('source_changed');
 const parsed=parseListing(html,job.source_id,item.url,{childScope:true});await rpc('vint_record_observation',{p_lease_id:job.lease_id,p_listing_id:item.id,p_payload:parsed});success++;
 }catch{error='partial_failure';}await pause(1100);}}catch{error='network_error';}
 await rpc('vint_complete_refresh',{p_lease_id:job.lease_id,p_source_id:job.source_id,p_success:success,p_error:error});}
Deno.serve(async(req:Request)=>{const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
 if(req.method!=='GET')return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers});
 const key=req.headers.get('x-whool-vint-key')||'';if(!/^[a-f0-9]{64}$/.test(key))return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers});
 try{if(!await rpc('vint_authenticate',{p_key:key}))return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers});
 const data=await rpc('vint_catalogue');const job=await rpc('vint_claim_refresh');if(job){const task=refresh(job).catch(()=>{});EdgeRuntime.waitUntil(task);}
 return new Response(JSON.stringify(data),{headers});
 }catch{return new Response(JSON.stringify({error:'catalogue_unavailable'}),{status:503,headers});}
});
