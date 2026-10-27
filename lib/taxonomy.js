export const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[‐‑–—]/g, '-').replace(/[^a-z0-9%-]+/g, ' ').replace(/\s+/g, ' ').trim();
export function contains(text, phrase) { return (` ${normalize(text)} `).includes(` ${normalize(phrase)} `); }
export const categories = {
  't-shirt': ['t-shirt', 't-shirts', 'tshirt', 'tshirts', 't shirt', 't shirts', 'tee', 'tees', 'topp', 'toppar'],
  jacket: ['jacket', 'jackets', 'jacka', 'jackor', 'regnjacka', 'regnjackor', 'skaljacka', 'skaljackor', 'vinterjacka', 'pufferjacka', 'coat', 'kappa'],
  fleece: ['fleece', 'fleecetroja', 'fleecejacka', 'pilejacka'],
  sweater: ['sweater', 'sweaters', 'sweatshirt', 'sweatshirts', 'troja', 'trojor', 'jultroja', 'jultrojor', 'ulltroja', 'ulltrojor', 'bomullstroja', 'munkjacka', 'hoodie', 'hoodies', 'kofta', 'koftor', 'cardigan', 'stickat', 'knitwear'],
  pants: ['pants', 'trousers', 'byxa', 'byxor', 'bralla', 'brallor', 'tackbralla', 'tackbrallor', 'tackbyxa', 'tackbyxor', 'fleecebyxor', 'mikrofleecebyxor', 'hangselbyxa', 'jeans', 'leggings', 'regnbyxor', 'skalbyxor', 'mjukisbyxor', 'shorts'],
  overall: ['overall', 'overalls', 'overaller', 'skaloverall', 'vinteroverall', 'rain overall'],
  shirt: ['shirt', 'shirts', 'skjorta', 'skjortor'],
  dress: ['dress', 'dresses', 'klanning', 'klanningar'],
  skirt: ['skirt', 'skirts', 'kjol', 'kjolar'],
  socks: ['socks', 'sock', 'strumpa', 'strumpor'],
  underwear: ['underwear', 'underklader', 'kalsonger', 'trosor', 'briefs', 'boxers'],
  pyjamas: ['pyjamas', 'pyjamasar', 'pajamas', 'sleepwear', 'sovklader'],
  swimwear: ['swimwear', 'swimsuit', 'badklader', 'baddrakt', 'badbyxor'],
  body: ['body', 'bodies', 'bodysuit', 'bodysuits', 'bodys'],
  set: ['regnstall', 'regnset', 'rain set', 'rainshower set', 'kladdset', 'clothing set'],
  accessories: ['accessories', 'accessoarer', 'hat', 'hats', 'mossa', 'mossor', 'vante', 'vantar', 'handskar', 'gloves', 'cap', 'keps', 'scarf', 'halsduk', 'polokrage', 'balaklava', 'balaclava'],
};
export function categoryOf(text) {
  let matches = Object.entries(categories).flatMap(([category, aliases]) => aliases.filter(alias => contains(text, alias)).map(alias => ({ category, length: normalize(alias).length })));
  // Fleece is also a material. A named garment such as fleece gloves remains an accessory.
  if (matches.some(match => ['pants', 'overall', 'accessories', 'socks'].includes(match.category))) matches = matches.filter(match => match.category !== 'fleece');
  return matches.sort((a, b) => b.length - a.length)[0]?.category ?? null;
}
export const colors = {
  black: ['black', 'svart', 'svarta'], white: ['white', 'vit', 'vita'], blue: ['blue', 'navy', 'bla', 'blatt', 'marinbla'],
  green: ['green', 'gron', 'grona', 'gront', 'olive'], red: ['red', 'rod', 'roda', 'rott', 'vinrod', 'vinroda', 'vinrott', 'morkrod', 'morkroda', 'morkrott', 'burgundy', 'bordeaux'], pink: ['pink', 'rosa'],
  grey: ['grey', 'gray', 'gra', 'gratt'], beige: ['beige', 'sand', 'khaki'], brown: ['brown', 'brun', 'bruna', 'dark brown'],
  yellow: ['yellow', 'gul', 'gula'], purple: ['purple', 'lila'], orange: ['orange', 'aprikos'],
};
export const colorOf = text => Object.entries(colors).find(([, aliases]) => aliases.some(alias => contains(text, alias)))?.[0] ?? null;
// Reviewed against the product images supplied by the owner, 27 October 2026.
const colorCorrections = { '782309277118013': 'orange', '3870861906659172': 'brown', '191482575054251': 'brown' };
// Supplier's exact "Vinröd" for 917443; other dark shades reviewed in the product images.
const toneCorrections = { '191482575054251': 'burgundy', '663368079014511': 'burgundy', '447061472291901': 'burgundy', '2245702805318512': 'burgundy', '2435717324351612': 'burgundy' };
export function productColor(row) {
  if (colorCorrections[String(row.id)]) return colorCorrections[String(row.id)];
  const text = normalize(`${row.name ?? ''} ${row.product_url ?? ''}`.replace(/[-_/]/g, ' '));
  if (/\b(?:vinro[dt]\w*|morkro[dt]\w*|burgundy|bordeaux|maroon|dark red|wine red)\b/.test(text)) return 'red';
  return colorOf(row.source_color || row.color);
}
export function colorTone(row) {
  if (productColor(row) !== 'red') return productColor(row);
  if (toneCorrections[String(row.id)]) return toneCorrections[String(row.id)];
  const text = normalize(`${row.source_color ?? ''} ${row.color ?? ''} ${row.name ?? ''} ${row.product_url ?? ''}`.replace(/[-_/]/g, ' '));
  return productColor(row) === 'red' && /\b(?:vinro[dt]\w*|morkro[dt]\w*|burgundy|bordeaux|maroon|dark red|wine red)\b/.test(text) ? 'burgundy' : productColor(row);
}
export function multicolorGarment(row) {
  const source = row.source_color || row.color;
  const families = Object.values(colors).filter(aliases => aliases.some(alias => contains(source, alias))).length;
  return families > 1 || garmentPatterns(row).length > 0 || /\b(?:multicolor|multicolour|flerfarg\w*|mix)\b/.test(normalize(source)) || /\b(?:heltackande|all over|allover)\b/.test(normalize(row.source_description));
}
export function pantsKind(row) {
  const text = `${row.name ?? ''} ${row.product_url ?? ''}`.replace(/[-_/]/g, ' ');
  return subcategoryOf(text, 'pants') || row.subcategory;
}
const appearanceTerms = {
  print_tags: { printed: ['print', 'printed', 'tryck', 'tryckt', 'tryckta'] },
  pattern_tags: { striped: ['striped', 'stripes', 'randig', 'randigt', 'randiga', 'rander'], checked: ['checked', 'check', 'rutig', 'rutigt', 'rutiga'], dotted: ['dotted', 'dots', 'prickig', 'prickigt', 'prickiga'], floral: ['floral', 'blommig', 'blommiga', 'blommigt'], animal: ['animal print', 'leopard', 'zebra'], jacquard: ['jacquard'], patterned: ['monstrad', 'monstrade', 'monstrat', 'patterned'] },
  motif_tags: { dog: ['dog', 'dogs', 'hund', 'hundar'], cat: ['cat', 'cats', 'katt', 'katter'], flower: ['flowers', 'blommor'], heart: ['heart', 'hearts', 'hjartan'], dinosaur: ['dinosaur', 'dinosaurie', 'dinosaurier'] },
  decoration_tags: { embroidered: ['embroidered', 'embroidery', 'broderad', 'broderi'], sequins: ['sequins', 'paljetter'] },
};
export function appearanceOf(text) {
  const positive = normalize(text).replace(/\b(?:utan|without|no)\s+(?:tryck|print|prints|monster|patterns?)\b/g, '')
    .replace(/\b(?:striped|randig[at]?|randade)\s+(?:rib\b|ribb\w*|krage\w*|mudd\w*|kant\w*|detalj\w*|collar\w*|cuff\w*|trim\w*|v-ringning\w*|neckline\w*)/g, '')
    .replace(/\b(?:rander|stripes)\s+(?:langs|vid|pa armarna|on the sleeves|along|at the)\b/g, '')
    .replace(/\b(?:three|tre|two|tva|single|en)\s+(?:stripes?|rander|rand)\b/g, '');
  return Object.fromEntries(Object.entries(appearanceTerms).map(([axis, values]) => [axis, Object.entries(values).filter(([, words]) => words.some(word => contains(positive, word))).map(([tag]) => tag)]));
}
export function garmentPatterns(row) {
  const text = `${row.name ?? ''} ${row.source_description ?? ''} ${row.source_pattern ?? ''}`;
  const inferred = appearanceOf(text).pattern_tags;
  const partial = /(?:striped|randig[at]?|randade)\s+(?:rib\b|ribb\w*|krage\w*|mudd\w*|kant\w*|detalj\w*|collar\w*|cuff\w*|trim\w*|v-ringning\w*)|(?:tre|three|two|tva)\s+(?:stripes|rander)/.test(normalize(text));
  return [...new Set([...(row.pattern_tags ?? []).filter(tag => tag !== 'striped' || !partial || inferred.includes('striped')), ...inferred])];
}
export function seasonalGarment(text) {
  return /\b(?:jul(?:troj\w*|motiv\w*|monster\w*|print\w*|gran\w*|fir\w*|tema\w*|ig\w*)?|christmas|xmas|santa|tomte\w*|pepparkak\w*)\b/.test(normalize(text));
}
export function playfulEvidence(row) {
  const raw = normalize(`${row.name ?? ''} ${row.source_description ?? ''} ${row.source_pattern ?? ''}`);
  const noPrint = /\b(?:utan|without|no)\s+(?:tryck|prints?)\b/.test(raw);
  const text = raw.replace(/\b(?:utan|without|no)\s+(?:tryck|prints?|monster|motiv)\b/g, '');
  const patterns = garmentPatterns(row);
  if (patterns.includes('striped')) return { score: 2, reason: 'Randigt' };
  if (patterns.length) return { score: 2, reason: 'Mönstrat' };
  if ((!noPrint && (row.print_tags ?? []).includes('printed')) || /\b(?:print\w*|tryck\w*|motiv\w*)\b/.test(text)) return { score: 3, reason: 'Tryck eller motiv' };
  if ((row.motif_tags ?? []).length) return { score: 3, reason: 'Lekfullt motiv' };
  if (/\b(?:play t-shirt|ritzratz|table tennis)\b/.test(text)) return { score: 3, reason: 'Lekfullt tryck' };
  return { score: 0, reason: '' };
}
export function subcategoryOf(text, category) {
  const has = (...words) => words.some(word => contains(text, word));
  if (category === 'jacket' || category === 'overall') {
    if (has('softshell')) return 'softshell';
    if (has('rain jacket', 'regnjacka', 'shell', 'skaljacka', 'skaloverall', 'rain overall')) return 'shell';
    if (has('winter', 'vinterjacka', 'vinteroverall', 'pufferjacka', 'vadderad')) return 'winter';
  }
  if (category === 'pants') {
    if (has('tackbralla', 'tackbrallor', 'tackbyxa', 'tackbyxor', 'regnbyxa', 'regnbyxor', 'rain pants', 'rain trousers', 'skalbyxa', 'skalbyxor', 'shell pants', 'shell trousers', 'softshell', 'vattentat', 'vattentata', 'vadderad', 'vadderade', 'vinterbyxor', 'skidbyxor', 'snow pants', 'waterproof', 'insulated')) return 'shell-pants';
    if (has('strumpbyxor', 'tights')) return 'tights';
    if (has('jeans')) return 'jeans';
    if (has('shorts')) return 'shorts';
    if (has('leggings')) return 'leggings';
  }
  return null;
}
