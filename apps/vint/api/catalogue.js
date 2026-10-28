const GATEWAY='https://ufcpoxmuygoyseocmrtl.supabase.co/functions/v1/whool-vint';
export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  if(!process.env.VINT_GATEWAY_KEY)return res.status(503).json({error:'catalogue_not_configured'});
  try{
    const response=await fetch(GATEWAY,{headers:{'x-whool-vint-key':process.env.VINT_GATEWAY_KEY},signal:AbortSignal.timeout(35000),redirect:'error'});
    if(!response.ok)throw new Error('gateway_http_'+response.status);
    const data=await response.json();
    if(!Array.isArray(data.items)||!Array.isArray(data.sources))throw new Error('invalid_response');
    res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(data);
  }catch(error){const reason=/^gateway_http_\d{3}$|^invalid_response$/.test(error.message)?error.message:'network_error';return res.status(503).json({error:'catalogue_temporarily_unavailable',reason});}
}
