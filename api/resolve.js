import { resolveSemanticParse } from '../lib/resolve/resolveSemanticParse.js';
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST required'});
  try{
    const resolution_bundle=await resolveSemanticParse(req.body??{});
    return res.status(200).json({ok:true,resolution_bundle});
  }catch(error){
    return res.status(error?.code?400:500).json({ok:false,error:error?.message||'Resolve failed',...(error?.code?{error_code:error.code}:{})});
  }
}
