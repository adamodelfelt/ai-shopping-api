import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, createRpc, failureCategory } from '../worker.js';
const input={job_id:'11111111-1111-4111-8111-111111111111',token:'a'.repeat(64)};
const request=body=>new Request('https://worker.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const job={retailer:'stadium',brand:'Adidas',product_url:'https://www.stadium.se/product/1/test'};
const evidence={proposed_product:{brand:'Adidas'},raw_data:{variants:[{sku:'1',size:'110'}]}};
test('unauthorized, malformed and oversized jobs never contact a retailer',async()=>{
 let external=0;const worker=createWorker({rpc:async()=>null,collectClient:async()=>{external++;}});
 assert.equal((await worker(request(input))).status,403);
 for(const bad of [{...input,url:'https://evil.test'},null,[],{...input,token:'x'}, {...input,token:'x'.repeat(3000)}]) assert.ok((await worker(request(bad))).status>=400);
 assert.equal(external,0);
});
test('a claimed allowlisted product is staged once; no catalogue operation is available',async()=>{
 const calls=[];const worker=createWorker({rpc:async(name,args)=>{calls.push(name);if(name==='claim_ingest_job')return job;assert.equal(name,'complete_ingest_job');assert.deepEqual(args.p_item.raw_data,evidence.raw_data);assert.equal(args.p_item.proposed_product.brand,'Adidas');assert.equal(args.p_item.proposed_product.wear_context,'unknown');return {run_id:'test',staged:1,duplicates:0,published:0};},collectClient:async(origin,options)=>{assert.equal(origin,'https://www.stadium.se');assert.equal(options.attempts,1);return async()=>'<product>';},parse:()=>evidence});
 assert.equal((await worker(request(input))).status,200);assert.deepEqual(calls,['claim_ingest_job','complete_ingest_job']);
 const rpc=createRpc({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-runtime-only'},async()=>{throw new Error('should not be called');});
 await assert.rejects(rpc('review_scraped_product',{}));await assert.rejects(rpc('products',{}));
});
test('unexpected domains and mismatched brands stop before staging',async()=>{
 for(const badJob of [{...job,product_url:'https://evil.test'},{...job,brand:'H&M'},{...job,brand:'Unapproved'}]) {
 const calls=[];const worker=createWorker({rpc:async(name)=>{calls.push(name);return name==='claim_ingest_job'?badJob:null;},collectClient:async()=>async()=>'<product>',parse:()=>evidence});
 assert.equal((await worker(request(input))).status,502);assert.ok(!calls.includes('complete_ingest_job'));assert.ok(calls.includes('fail_ingest_job'));
 }
});
test('retailer access failures stop without retries or storing provider error bodies',async()=>{
 const calls=[];const worker=createWorker({rpc:async(name,args)=>{calls.push([name,args]);return name==='claim_ingest_job'?job:null;},collectClient:async()=>{throw new Error('private provider payload');}});
 const response=await worker(request(input));assert.equal(response.status,502);assert.ok(!(await response.text()).includes('private provider'));
 assert.equal(calls[1][1].p_reason,'collection_stopped');
});
test('failure diagnostics distinguish runtime incompatibility, access denial and source changes without exposing bodies',()=>{
 assert.equal(failureCategory(new ReferenceError('Buffer is not defined')),'runtime_compatibility');
 assert.equal(failureCategory(new Error('Retailer request stopped (HTTP 403)')),'retailer_http_403');
 assert.equal(failureCategory(new Error('Retailer robots.txt disallows this URL')),'robots_disallowed');
 assert.equal(failureCategory(new SyntaxError('private document content')),'product_payload_changed');
});
