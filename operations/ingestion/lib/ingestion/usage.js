const text = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export const usageVersion='product-usage-2026-10-28.1';
export function brandKey(value) {
  const key=text(value).replace(/[^a-z0-9]/g,'');
  return ({adidasoriginals:'adidas',nikesportswear:'nike',newbalance:'new-balance'})[key] ?? key;
}
export function classifyUsage(product, raw={}) {
  const name=text(product.name), description=text(product.source_description ?? raw.json_ld?.description);
  const category=text(raw.json_ld?.category ?? raw.source_category ?? '');
  const evidence=[]; const activities=new Set();
  const add=(activity,rule,field,quote)=>{activities.add(activity);evidence.push({rule,field,quote:String(quote).slice(0,220)});};
  const shoe=/\b(?:skor|sko|sneakers?|shoes?|boots?|cleats?)\b|fotbollssko|loparsko|inomhussko/.test(name+' '+category);
  const footballShoe=/fotbollssko|football boots|soccer cleats/.test(name+' '+category);
  // Gazelle Indoor is a lifestyle model name, not evidence of indoor team sports.
  const gazelle=/\bgazelle\b/.test(name) && brandKey(product.brand)==='adidas' && shoe && !footballShoe;
  if (gazelle) return {wear_context:'casual',sport_activities:[],usage_category:'lifestyle_footwear',usage_classification:{version:usageVersion,state:'classified',basis:'operator_model_rule',evidence:[{rule:'adidas_gazelle_lifestyle',field:'name',quote:product.name}]}};
  const fields=[['name',name,product.name],['source_category',category,raw.json_ld?.category ?? raw.source_category],['source_description',description,product.source_description ?? raw.json_ld?.description]];
  for(const [field,value,original] of fields) {
    if (/fotbollssko|fotbollstroja|fotbollsbyx|fotbollsshorts|fotbollslag|fotbollstraning|football boots|football jersey|soccer cleats|soccer jersey/.test(value)) add('football','explicit_football_use',field,original);
    if (/loparsko|running shoes|running shoe|for lopning|for running/.test(value)) add('running','explicit_running_use',field,original);
    if (/basketbollssko|basketsko|basketball shoes|basketball jersey/.test(value)) add('basketball','explicit_basketball_use',field,original);
    if (/tennissko|tennis shoes/.test(value)) add('tennis','explicit_tennis_use',field,original);
    if (/handbollssko|for handboll|sa som handboll/.test(value)) add('handball','explicit_handball_use',field,original);
    if (/volleyboll|volleyball/.test(value)) add('volleyball','explicit_volleyball_use',field,original);
    if (/inomhussko|indoor court shoes|indoor shoes/.test(value)) add('indoor_training','explicit_indoor_use',field,original);
    if (/traningsklader|traningstroja|training top|training shirt|gym shoes/.test(value)) add('general_training','explicit_training_use',field,original);
  }
  const casualMatches=fields.filter(([,value])=>/livsstil|lifestyle|casual|till vardags|vardagsbruk|passar vardag|passar.*vardag|komfort i vardagen|funkar lika bra som sneakers/.test(value));
  // A retailer's sneakers category is evidence; sportswear or a sporty look alone is not.
  if (/sneakers|livsstil|lifestyle/.test(category)) casualMatches.push(['source_category',category,raw.json_ld?.category ?? raw.source_category]);
  for(const [field,,quote] of casualMatches) evidence.push({rule:'explicit_casual_use',field,quote:String(quote).slice(0,220)});
  const sports=[...activities].sort(), casual=casualMatches.length>0;
  const wear_context=sports.length ? (casual?'mixed':'sport') : casual?'casual':'unknown';
  let usage_category='unknown';
  if(shoe) usage_category=footballShoe?'football_footwear':sports.includes('running')?'running_footwear':sports.includes('basketball')?'basketball_footwear':sports.some(x=>['indoor_training','handball','volleyball','tennis'].includes(x))?'indoor_footwear':casual?'lifestyle_footwear':'unknown';
  else if(sports.includes('football'))usage_category='football_apparel';
  else if(sports.length)usage_category='training_apparel';
  else if(casual)usage_category='casual_apparel';
  return {wear_context,sport_activities:sports,usage_category,usage_classification:{version:usageVersion,state:wear_context==='unknown'?'needs_review':'classified',basis:'source_text',evidence}};
}
export function enrichUsage(item) {
  const usage=classifyUsage(item.proposed_product,item.raw_data);
  const proposal={...item.proposed_product,...usage};
  if(usage.usage_category.endsWith('_footwear')) {
    proposal.category='shoes';
    proposal.subcategory=usage.usage_category;
  }
  return {...item,proposed_product:proposal};
}
