// Decode data only. Never evaluate React/Next source or execute source functions.
function jsonAt(source,start) {
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<source.length;i++) {
    const c=source[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"'){quoted=true;continue;}
    if(c==='['||c==='{')depth++;
    if(c===']'||c==='}') {depth--;if(depth===0)return JSON.parse(source.slice(start,i+1));}
  }
  throw new Error('Incomplete source data');
}
export function intersportEvidence(html, group, address) {
  const chunks=[];
  for(const match of html.matchAll(/self\.__next_f\.push\(/g)) {
    const at=match.index+match[0].length;
    const value=jsonAt(html,at);
    if(Array.isArray(value)&&typeof value[1]==='string')chunks.push(value[1]);
  }
  const matches=[];
  function walk(value) {
    if(Array.isArray(value)){for(const x of value)walk(x);return;}
    if(!value||typeof value!=='object')return;
    if(String(value.key)===String(group.sku)&&Array.isArray(value.variants)&&value.variants.length)matches.push(value);
    for(const child of Object.values(value))walk(child);
  }
  for(const line of chunks.join('').split('\n')) {
    const body=line.slice(line.indexOf(':')+1);
    if(!['[','{'].includes(body[0]))continue;
    let value;try{value=JSON.parse(body);}catch{continue;}walk(value);
  }
  const product=matches[0];
  if(!product)throw new Error('Product variant payload missing');
  if(matches.some(p=>JSON.stringify(p.variants)!==JSON.stringify(product.variants)))throw new Error('Conflicting product variant payload');
  const offer=Array.isArray(group.offers)?group.offers[0]:group.offers;
  const variants=product.variants.map(v=>{
    const online=v.availability?.find(a=>a.channel==='ONLINE');
    const link=new URL(v.link,address);
    return {sku:link.searchParams.get('sku'),gtin:String(v.key),size:v.size ?? null,
      size_filter_label:v.custom?.sizeFilterValues?.[0]?.label ?? null,size_system:null,
      color:group.color ?? null,price:typeof v.listPrice==='number'?v.listPrice:null,
      promotional_price:typeof v.sellingPrice==='number'?v.sellingPrice:null,promotion_eligibility:'not_verified',
      currency:offer?.priceCurrency ?? null,availability:typeof online?.stockNumber==='number'?(online.stockNumber>0?'https://schema.org/InStock':'https://schema.org/OutOfStock'):null,
      online_stock:online?.stockNumber ?? null,url:link.href,seller:'Intersport'};
  });
  return {variants,source_product:{key:product.key,title:product.title,brand:product.brand,description:product.description ?? null,list_price:product.listPrice,selling_price:product.sellingPrice},
    source_category:html.match(/id="syncle-category-tree"[^>]*>([^<]+)</)?.[1] ?? null};
}
