import {flightNodes} from './flight.js';
export const SOURCE_HOSTS={vinted:'www.vinted.se',tradera:'www.tradera.com',inimini:'inimini.se',glamupkids:'glamupkids.se',barnensbudget:'barnensbudget.se'};
export const SOURCE_NAMES={vinted:'Vinted',tradera:'Tradera',inimini:'Inimini',glamupkids:'Glam Up Kids',barnensbudget:'Barnens Budget'};
export function decode(s){return String(s??'').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):'';}).replace(/&(?:amp|quot|apos|lt|gt|nbsp|aring|auml|ouml|Aring|Auml|Ouml);/g,m=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ','&aring;':'å','&auml;':'ä','&ouml;':'ö','&Aring;':'Å','&Auml;':'Ä','&Ouml;':'Ö'})[m]);}
export function clean(s){return decode(String(s??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function fragment(html,attribute){const m=new RegExp('<([a-z][a-z0-9]*)\\b[^>]*'+attribute+'[^>]*>','i').exec(html);if(!m)return '';const start=m.index+m[0].length,rx=new RegExp('<\\/?'+m[1]+'\\b[^>]*>','gi');rx.lastIndex=start;let depth=1,n;while((n=rx.exec(html))){if(n[0].startsWith('</'))depth--;else if(!n[0].endsWith('/>'))depth++;if(!depth)return html.slice(start,n.index);}return '';}
const testText=(html,id)=>clean(fragment(html,'data-testid="'+id+'"'));
const number=s=>{const m=clean(s).match(/([\d\s]+(?:[.,]\d{1,2})?)\s*kr/);return m?Number(m[1].replace(/\s/g,'').replace(',','.')):null;};
function nodes(html){const out=[];for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const j=JSON.parse(m[1]);for(const x of Array.isArray(j)?j:[j])out.push(...(x['@graph']||[x]));}catch{}}return out;}
export function classify(title,description='',sourceCategory=''){
 const t=clean(title).toLowerCase(),hay=[t,description,sourceCategory].join(' ').toLowerCase();
 let category=/kit|\bset\b|paket|träningssätt|tracksuit/.test(t)?'sets':/skor|sneaker|tossor|boots|sandal|flight court|\bbuty\b/.test(t)?'shoes':/byx|jeans|shorts|leggings|tights|pros\b/.test(t)?'bottoms':/munkjack|hoodie|huvtröj/.test(t)?'tops':/jack|overall|coat|takki/.test(t)?'outerwear':/tröj|t-shirt|shirt|sweater|body|kofta|topp|paita|bluza/.test(t)?'tops':'unknown';
 if(category==='unknown')category=/skor|sneaker|trainers|footwear/i.test(sourceCategory)?'shoes':/t-shirt|tröj|toppar/i.test(sourceCategory)?'tops':/byx|shorts|leggings/i.test(sourceCategory)?'bottoms':'unknown';
 let wear_context='unknown',activity=null,activity_label=null,rule=null;
 if(category==='shoes'&&/gazelle/i.test(t)){wear_context='casual';rule='gazelle_model_casual';}
 else if(/fotboll|football|soccer|mercurial|piłki nożnej|futsal/.test(hay)){wear_context='sport';activity='football';activity_label='Fotboll';rule='explicit_football';}
 else if(/löparskor|running shoes|löpning/.test(hay)){wear_context='sport';activity='running';activity_label='Löpning';rule='explicit_running';}
 else if(/inomhusskor|inomhusträning|inne gympaskor|handboll|volleyboll/.test(hay)){wear_context='sport';activity='indoor_training';activity_label='Inomhussport';rule='explicit_indoor';}
 else if(/tränings|sportkläder|sport-bh|sportsbh|training|dri-fit|fysisk aktivitet/.test(hay)){wear_context='sport';activity='general_training';activity_label='Träning';rule='explicit_training';}
 else if(category==='shoes'&&/sneaker|court|dunk|air force/.test(hay)||/vardag|casual|jeans/.test(hay)){wear_context='casual';rule='explicit_casual';}
 return {category,category_label:({tops:'Överdel',bottoms:'Byxor & shorts',shoes:'Skor',outerwear:'Ytterkläder',sets:'Set & paket',unknown:'Ej klassificerad'})[category],wear_context,activity,activity_label,usage_evidence:rule?{rule,quote:clean(title+' '+description).slice(0,350)}:null};
}
export function parseListing(html,source,url,{childScope=false}={}){
 const u=new URL(url);if(u.protocol!=='https:'||u.hostname!==SOURCE_HOSTS[source]||u.username||u.password)throw new Error('source_not_allowed');
 const ns=nodes(html),g=ns.find(x=>x['@type']==='Product'&&x.name);if(!g)throw new Error('product_payload_changed');
 if(g.url&&new URL(g.url,url).pathname!==u.pathname)throw new Error('product_identity_mismatch');
 const offers=Array.isArray(g.offers)?g.offers:[g.offers||{}],offer=offers.find(o=>/InStock$/.test(o.availability||''))||offers[0];
 let title=clean(g.name),brand=clean(typeof g.brand==='string'?g.brand:g.brand?.name),description=clean(g.description).split(/\bSKICK\b/)[0].trim(),size='',condition='',defects=null,material=null,price=Number(offer.price),currency=offer.priceCurrency,price_type='fixed',fee=null,shipping=null,end_date=null;
 let availability=/InStock$/.test(offer.availability||'')?'available':/OutOfStock|SoldOut$/.test(offer.availability||'')?'sold':'unknown';
 const quality_flags=[],evidence={json_ld:{name:g.name,sku:g.sku,brand:g.brand,offers:g.offers,category:g.category},usage:null};
 const visible=clean(html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i,''));
 let external_id=String(g.sku||offer.sku||u.pathname.split('/').pop());let sourceCategory=clean(g.category);
 if(source==='vinted'){
  external_id=u.pathname.match(/\/items\/(\d+)/)?.[1]||external_id;
  size=testText(html,'item-attributes-size').replace(/^Storlek\s*/,'').trim();condition=testText(html,'item-attributes-status').replace(/^Skick\s*/,'').trim();material=testText(html,'item-attributes-material').replace(/^Material\s*/,'').trim()||null;
  const total=number(testText(html,'total-combined-price'));if(total!==null&&total>=price)fee=Math.round((total-price)*100)/100;
  const statuses=flightNodes(html,o=>String(o.item_id??o.id)===external_id&&('is_reserved'in o||'can_buy'in o));
  if(statuses.some(o=>o.is_reserved===true))availability='reserved';
  else if(statuses.some(o=>o.is_hidden===true||o.can_buy===false))availability='unknown';
  else if(!statuses.some(o=>o.can_buy===true))quality_flags.push('availability_jsonld_only');
  childScope=/\bBarn\b/i.test(sourceCategory);
 }else if(source==='tradera'){
  external_id=u.pathname.match(/\/item\/\d+\/(\d+)/)?.[1]||external_id;
  const found=flightNodes(html,o=>String(o.itemId)===external_id&&'openingBid'in o&&'isActive'in o);
  if(found.length!==1)throw new Error('exact_item_payload_missing');const item=found[0];
  title=clean(item.title);description=clean(item.description);sourceCategory=clean(item.categoryName);
  const attrs=key=>(item.attributes||[]).find(x=>x.backingField===key)?.values?.map(x=>clean(x.displayName)).join(' / ');
  size=attrs('shoe_size')||attrs('child_size')||attrs('size')||'';condition=attrs('condition')||'';brand=attrs('brand')||brand;
  price_type=item.fixedPrice>0?'fixed':'auction';price=item.fixedPrice>0?item.fixedPrice:item.openingBid;
  if(price_type==='fixed'&&item.paymentCalculations?.buyerProtectionCostForFixedPrice!==undefined)fee=Number(item.paymentCalculations.buyerProtectionCostForFixedPrice);
  const costs=(item.shippingOptions||[]).filter(o=>!o.isTakeaway&&!o.isNotSpecified&&o.toCountryCodeIso2==='SE').map(o=>o.cost).filter(x=>typeof x==='number');if(costs.length)shipping=Math.min(...costs);
  end_date=item.endDate||null;availability=item.isActive&&!item.hasEnded&&!item.forciblyClosed&&!item.isCancelled?'available':item.hasEnded||item.isCancelled?'sold':'unknown';
  childScope=ns.some(x=>x['@type']==='BreadcrumbList'&&JSON.stringify(x).includes('Barn'));
  evidence.pricing={type:item.itemType,opening_bid:item.openingBid,fixed_price:item.fixedPrice,end_date,fee_sek:fee,shipping_from:shipping};
 }else if(source==='inimini'){
  const raw=description;condition=raw.match(/\bskick\s*([A-D])\b/i)?.[1];condition=condition?'Skick '+condition:'';
  const mat=raw.match(/Material:\s*(.+?)(?=SKICK|$)/);material=mat?mat[1].trim():null;
  defects=raw.replace(/^.*?\bskick\s*[A-D][.\s-]*/i,'').replace(/-?\s*Fotografen uppskattar[\s\S]*/i,'').replace(/Material:[\s\S]*/,'').trim()||null;
  if(/NewCondition$/.test(offer.itemCondition||'')){quality_flags.push('condition_schema_conflict');evidence.condition_resolution='Product-specific secondhand grade overrides generic NewCondition template';}
 }else if(source==='glamupkids'){
  const start=visible.indexOf(title);const productText=start>=0?visible.slice(start,start+5000):'';
  const match=productText.match(/Skick\s+(.*?)(?:Defekter|Skickbedömning|Varumärke)/);condition=match?.[1]?.trim()||'';
  defects=productText.match(/Defekter\s+(.*?)(?:Skickbedömning|Skick\s+Se|Vår skickskala)/)?.[1]?.trim()||null;
 }
 const allowedBrands=[['new-balance','New Balance'],['geggamoja','Geggamoja'],['adidas','Adidas'],['nike','Nike'],['puma','Puma'],['asics','ASICS']];
 const brandMatch=x=>allowedBrands.find(([slug,label])=>new RegExp('\\b'+label.replace(' ','[ -]?')+'\\b','i').test(x));
 let bm=brandMatch(brand);if(!bm&&['inimini','barnensbudget'].includes(source)){bm=brandMatch(title);if(bm){quality_flags.push('brand_from_product_title');evidence.brand_resolution={field:'product_title',quote:title};}}
 const brand_slug=bm?.[0]||null;if(bm)brand=bm[1];
 if(!size)size=title.match(/(?:storlek|stolek|strl\.?|stl\.?)\s*[:.-]?\s*(\d+(?:[.,]\d+)?(?:\s*[/–-]\s*\d+)?(?:\s*cm)?|[XSML]{1,4})/i)?.[1]||'';
 const type=classify(title,description,sourceCategory);evidence.usage=type.usage_evidence;delete type.usage_evidence;
 const flags=[];if(!bm)flags.push('brand_outside_queue');if(/\bH\s*&\s*M\b|\bZara\b|\bMango\b|\bL\.?O\.?G\.?G\b/i.test(title+' '+description))flags.push('excluded_or_parked_brand');if(!childScope)flags.push('child_audience_unverified');if(!size)flags.push('size_missing');if(type.category==='unknown')flags.push('category_unknown');if(currency!=='SEK'||!Number.isFinite(price)||price<=0||price>20000)flags.push('price_unverified');if(/sport-bh|sportsbh|\bunderkläder\b/i.test(title+' '+description))flags.push('mixed_size_or_underwear');
 let image_url=Array.isArray(g.image)?g.image[0]:g.image;if(image_url&&typeof image_url==='object')image_url=image_url.url;
 try{const image=new URL(image_url,url);if(image.protocol!=='https:')throw new Error();image_url=image.href;}catch{image_url=null;quality_flags.push('image_missing');}
 if(!condition)quality_flags.push('condition_not_stated');
 if(!defects&&description&&!['glamupkids','barnensbudget'].includes(source))defects=description.slice(0,1500);
 return {source_id:source,source_name:SOURCE_NAMES[source],external_id,url:u.href,title,brand,brand_slug,size:clean(size),condition_label:condition||'Ej uppgivet',condition_text:description.slice(0,1500)||null,defects,material,...type,color:clean(g.color)||null,price_sek:price,currency,price_type,fee_sek:fee,shipping_sek:shipping,end_date,image_url,availability,observed_at:new Date().toISOString(),quality_flags:[...quality_flags,...flags],review_status:flags.length?'held':'ready',evidence};
}
