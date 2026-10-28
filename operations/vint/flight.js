// React Flight contains data. Parse JSON boundaries only; never execute scripts.
function jsonAt(s,start){let depth=0,quote=false,escape=false;for(let i=start;i<s.length;i++){const c=s[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;continue;}if(c==='"'){quote=true;continue;}if(c==='['||c==='{')depth++;if(c===']'||c==='}'){if(--depth===0)return JSON.parse(s.slice(start,i+1));}}throw new Error('incomplete_flight');}
export function flightText(html){const chunks=[];for(const m of html.matchAll(/self\.__next_f\.push\(/g)){try{const a=jsonAt(html,m.index+m[0].length);if(typeof a?.[1]==='string')chunks.push(a[1]);}catch{}}return chunks.join('');}
export function flightNodes(html,predicate){const chunks=[flightText(html)];
const found=[];let visited=0;function walk(v,depth=0){if(++visited>200000||depth>35)return;if(typeof v==='string'&&v.length>1&&(v[0]==='{'||v[0]==='[')){try{walk(JSON.parse(v),depth+1);}catch{}return;}if(!v||typeof v!=='object')return;if(!Array.isArray(v)&&predicate(v))found.push(v);for(const x of Object.values(v))walk(x,depth+1);}
const text=chunks.join('');for(const m of text.matchAll(/(?:^|\n|[}\]])[0-9a-f]+:(?=[\[{])/g)){try{walk(jsonAt(text,m.index+m[0].length));}catch{}}
return found;}
