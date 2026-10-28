export const normalize=x=>String(x??'').toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const groups=[['sneaker','sneakers','gympaskor','vardagsskor'],['troja','sweater','sweatshirt','hoodie','huvtroja'],['byxa','byxor','mjukisbyxor','jeans','traningsbyxor'],['fotboll','fotbollsskor','football','soccer','mercurial'],['jacka','jackor','jacket','ytterklader'],['set','kit','paket','tracksuit']];
function tokenMatch(token,hay){const group=groups.find(g=>g.includes(token));return (group||[token]).some(t=>hay.includes(t));}
export function selectItems(items,state){
 const words=normalize(state.query).split(' ').filter(Boolean).filter(x=>!['i','en','ett','till','barn','storlek','stl','med','och','for'].includes(x));
 let out=items.filter(x=>{
  if(state.source&&x.source_id!==state.source||state.category&&x.category!==state.category||state.brand&&x.brand_slug!==state.brand||state.size&&x.size!==state.size||state.context&&x.wear_context!==state.context||state.format&&x.price_type!==state.format)return false;
  if(Number(state.maxPrice)>0&&x.price_sek>Number(state.maxPrice))return false;
  const hay=normalize([x.title,x.brand,x.size,x.category_label,x.color,x.activity,x.wear_context==='casual'?'vardag':'',x.wear_context==='sport'?'sport':''].join(' '));
  return words.every(t=>/^\d+$/.test(t)?normalize(x.size).split(' ').includes(t):tokenMatch(t,hay));
 });
 const sort=state.sort||'recommended';
 return out.sort((a,b)=>sort==='price-asc'?a.price_sek-b.price_sek:sort==='price-desc'?b.price_sek-a.price_sek:sort==='recent'?Date.parse(b.observed_at)-Date.parse(a.observed_at):(a.price_type==='auction')-(b.price_type==='auction')||a.display_rank-b.display_rank);
}
export function safeProductUrl(item){try{const u=new URL(item.url);const hosts={vinted:'www.vinted.se',tradera:'www.tradera.com',inimini:'inimini.se',glamupkids:'glamupkids.se',barnensbudget:'barnensbudget.se',nimt:'nimtsecondhand.se'};return u.protocol==='https:'&&u.hostname===hosts[item.source_id]&&!u.username&&!u.password?u.href:null;}catch{return null;}}
