import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMarketplace} from '../lib/ingestion/marketplaces.js';
import {enrichUsage} from '../lib/ingestion/usage.js';
const address='https://www.intersport.se/products/adidas-gazelle-jr-sneakers-barn/test-123';
function page() {
 const group={'@type':'Product',name:'Gazelle JR sneakers',sku:'123',brand:{name:'adidas Originals'},description:'Tidlösa sneakers.',image:['https://cdn.intersport.se/test.jpg'],offers:{price:'849',priceCurrency:'SEK',availability:'https://schema.org/InStock'}};
 const selected={key:'123',brand:'adidas Originals',title:'Gazelle JR sneakers',description:'Komfort i vardagen.',listPrice:{min:849,max:849},sellingPrice:{min:637,max:637},variants:[{key:'1111111111111',size:'3.5',link:'/product?sku=123010',listPrice:849,sellingPrice:637,custom:{sizeFilterValues:[{label:'36'}]},availability:[{channel:'ONLINE',stockNumber:0},{channel:'STORE',stockNumber:7}]},{key:'2222222222222',size:'4',link:'/product?sku=123020',listPrice:849,sellingPrice:637,availability:[{channel:'ONLINE',stockNumber:2}]}]};
 const other={...selected,key:'999',variants:[{...selected.variants[0],listPrice:1}]};
 const flight=JSON.stringify([1,'1:'+JSON.stringify({selected,recommendations:[other]})+'\n']);
 return `<div id="syncle-category-tree">/skor/sneakers</div><script type="application/ld+json">${JSON.stringify(group)}</script><script>self.__next_f.push(${flight})</script>`;
}
test('only the exact product is parsed; online stock and original size labels stay distinct',()=>{
 const row=enrichUsage(parseMarketplace(page(),address,'intersport'));
 assert.equal(row.raw_data.variants.length,2);assert.equal(row.raw_data.variants[0].sku,'123010');
 assert.equal(row.raw_data.variants[0].availability,'https://schema.org/OutOfStock');
 assert.equal(row.raw_data.variants[0].size,'3.5');assert.equal(row.raw_data.variants[0].size_filter_label,'36');assert.equal(row.raw_data.variants[0].size_system,null);
 assert.equal(row.proposed_product.price_sek,849);assert.equal(row.raw_data.variants[0].promotional_price,637);assert.equal(row.raw_data.variants[0].promotion_eligibility,'not_verified');
 assert.equal(row.proposed_product.wear_context,'casual');assert.equal(row.proposed_product.target_age_group,'kids');
});
test('missing or executable product data is never evaluated or accepted as variant evidence',()=>{
 assert.throws(()=>parseMarketplace(page().replace('self.__next_f.push','not_the_source'),address,'intersport'));
 assert.throws(()=>parseMarketplace(page().replace('self.__next_f.push([1,','self.__next_f.push([(()=>{throw 1})(),'),address,'intersport'));
});
