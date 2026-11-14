import {createVillage} from '@ambasada/village';
import {makeShop} from '../services/village-shop.mjs';
const village=createVillage({company:'demolatorii-hackathon',apiUrl:'https://hackaton.ambasada.id'});
export default async function handler(req,res){
 if(!process.env.AMBASADA_API_KEY){res.statusCode=410;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Ambasada services have been disconnected.'}));return;}
 try{
  let body;
  if(!['GET','HEAD'].includes(req.method)){
   if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
   else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768){res.statusCode=413;res.end('Request too large');return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
   if(Buffer.byteLength(body??'')>32768){res.statusCode=413;res.end('Request too large');return;}
  }
  const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
  const request=new Request(new URL(req.url,'https://demolari.vercel.app'),{method:req.method,headers,...(body!==undefined?{body}:{})});
  const response=await makeShop(village,process.env.ASSESSMENT_ACCESS_TOKEN)(request);
  res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Village service unavailable'}));}
}
