import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingPlan, stageSnapshot } from '../lib/ingestion/review.js';
import { parseMarketplace } from '../lib/ingestion/marketplaces.js';
const snapshot={store:'stadium',collectedAt:new Date().toISOString(),complete:false,products:[{name:'Tröja barn',retailer:'stadium',product_url:'https://www.stadium.se/product/1/test',currency:'SEK',price_sek:null,variants:[{size:'110',availability:null}]}]};
test('partial and invalid source evidence is staged without inventing a price or publishing', async()=>{
  const plan=stagingPlan(snapshot);
  assert.equal(plan.p_run.complete,false);assert.equal(plan.p_items[0].proposed_product.price_sek,null);
  assert.deepEqual(plan.p_items[0].raw_data.variants,snapshot.products[0].variants);
  assert.equal(plan.p_items[0].proposed_product.currency,undefined);
  assert.equal(stagingPlan({...snapshot,products:[{...snapshot.products[0],retailer:'ahlens'}]}).p_items[0].proposed_product.retailer,'ahlens');
  let calls=0;
  const result=await stageSnapshot(snapshot,async(route,params,options)=>{calls++;assert.equal(route,'rpc/stage_scrape');assert.equal(options.method,'POST');return {run_id:'test',published:0,staged:1,duplicates:0};});
  assert.equal(calls,1);assert.equal(result.published,0);
  await assert.rejects(stageSnapshot(snapshot,async()=>({run_id:'test',published:1,staged:1,duplicates:0})));
});
test('review batch caps and timestamp validation fail before database writes',()=>{
  assert.throws(()=>stagingPlan({...snapshot,products:Array(51).fill(snapshot.products[0])}));
  assert.throws(()=>stagingPlan({...snapshot,collectedAt:'invalid'}));
  assert.throws(()=>stagingPlan({...snapshot,collectedAt:new Date(Date.now()+3_600_000).toISOString()}));
});
test('marketplace parser keeps variant identity, unknown stock and mixed prices visible for review',()=>{
  const product={'@type':'ProductGroup',name:'Tröja barn',brand:{name:'Test'},productGroupID:'abc',hasVariant:[{sku:'v1',size:'110',offers:{price:199,priceCurrency:'SEK',availability:'https://schema.org/InStock'}},{sku:'v2',size:'116',offers:{price:249,priceCurrency:'SEK'}}]};
  const html=`<script type="application/ld+json">${JSON.stringify(product)}</script>`;
  const row=parseMarketplace(html,'https://www.stadium.se/product/1/test','stadium');
  assert.equal(row.proposed_product.price_sek,null);assert.equal(row.proposed_product.material,null);
  assert.equal(row.proposed_product.target_gender,null);
  assert.equal(row.raw_data.variants[1].availability,null);assert.equal(row.raw_data.variants[0].sku,'v1');
  assert.throws(()=>parseMarketplace(html,'https://evil.test/product','stadium'));
  assert.throws(()=>parseMarketplace('<script type="application/ld+json">process.exit()</script>','https://www.stadium.se/product/1/test','stadium'));
});
