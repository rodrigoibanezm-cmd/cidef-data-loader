import { analyzeIntent } from '../lib/analyze/analyzeIntent.js';
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST required'});
  try{
    const { analysis_iteration }=await analyzeIntent(req.body??{});
    return res.status(200).json({ok:true,analysis_iteration});
  }catch(error){
    return res.status(error?.code?400:500).json({ok:false,error:error?.message||'Analyze failed',...(error?.code?{error_code:error.code}:{})});
  }
}
