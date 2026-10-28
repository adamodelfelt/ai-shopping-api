import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import catalogue from './api/catalogue.js';
try{process.loadEnvFile('.env.local');}catch{}
const root=path.resolve('public');
http.createServer(async(req,res)=>{
  res.status=n=>{res.statusCode=n;return res;};res.json=x=>res.end(JSON.stringify(x));
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/catalogue')return catalogue(req,res);
  const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
  if(!file.startsWith(root+path.sep)){res.statusCode=404;return res.end();}
  try{const b=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(b);}catch{res.statusCode=404;res.end('Not found');}
}).listen(Number(process.env.PORT||(process.argv.includes('--port')?process.argv[process.argv.indexOf('--port')+1]:3000)),'0.0.0.0',()=>console.log('Whool Vint preview ready'));
