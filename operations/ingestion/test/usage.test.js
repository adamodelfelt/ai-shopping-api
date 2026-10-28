import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyUsage,brandKey,enrichUsage} from '../lib/ingestion/usage.js';
test('Gazelle and Gazelle Indoor remain casual despite sports heritage wording',()=>{
 for(const name of ['Gazelle JR sneakers','GAZELLE INOMHUSSKOR Barn']) {
  const value=classifyUsage({brand:'Adidas Originals',name,source_description:'Den klassiska löparskon inspirerad av fotboll och träning.'});
  assert.equal(value.wear_context,'casual');assert.equal(value.usage_category,'lifestyle_footwear');assert.deepEqual(value.sport_activities,[]);
 }
});
test('football boots do not become casual because the design references streetwear',()=>{
 const value=classifyUsage({brand:'Nike',name:'Tiempo Streetgato JR fotbollsskor',source_description:'Framtagna för kompisspel med inspiration från streetwear.'});
 assert.equal(value.wear_context,'sport');assert.deepEqual(value.sport_activities,['football']);assert.equal(value.usage_category,'football_footwear');
});
test('running and indoor activities retain explicit use and mixed daily use',()=>{
 const run=classifyUsage({brand:'New Balance',name:'Fresh Foam JR löparskor',source_description:'Passar vardag, lek och lätt aktivitet. Funkar lika bra som sneakers som till löpning.'});
 assert.equal(run.wear_context,'mixed');assert.ok(run.sport_activities.includes('running'));
 const indoor=classifyUsage({brand:'Asics',name:'Upcourt JR inomhusskor',source_description:'Passar skolidrotten.'});
 assert.equal(indoor.usage_category,'indoor_footwear');assert.deepEqual(indoor.sport_activities,['indoor_training']);
});
test('brand alone never implies sports use or a sport',()=>{
 for(const brand of ['Nike','Adidas','Puma','New Balance','ASICS']) {
  const value=classifyUsage({brand,name:'Hoodie barn',source_description:'Sportig stil med mjuk bomull.'});
  assert.equal(value.wear_context,'unknown');assert.deepEqual(value.sport_activities,[]);assert.equal(value.usage_classification.state,'needs_review');
 }
});
test('evidence remains separate from raw product data and brand aliases are normalized',()=>{
 const item={proposed_product:{brand:'Puma',name:'Ultra JR fotbollsskor'},raw_data:{currency:'SEK'}};
 const enriched=enrichUsage(item);assert.equal(enriched.proposed_product.category,'shoes');assert.deepEqual(item.raw_data,{currency:'SEK'});assert.equal(item.proposed_product.category,undefined);
 assert.equal(brandKey('Adidas Originals'),'adidas');assert.equal(brandKey('New Balance'),'new-balance');
});
