import {isVillageError} from '@ambasada/village';
import {ambasada,type Env} from '../lib/ambasada.ts';
import {randomSeed,sha256,type GameName} from '../lib/arcade-engine.ts';
const bank=(env:Env)=>env.ARCADE.getByName('treasury-v1');
export async function bankCall(env:Env,path:string,data?:unknown){return bank(env).fetch(new Request(`https://bank${path}`,{method:data?'POST':'GET',...(data?{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})}));}
export default async function arcade(req:Request,env:Env):Promise<Response>{
  const u=new URL(req.url),action=u.pathname.replace('/api/arcade/','');
  if(req.method==='GET'&&['config','feed'].includes(action))return bankCall(env,`/${action}`);
  if(req.method==='GET'&&action==='state')return bankCall(env,'/state',{id:u.searchParams.get('id'),access:req.headers.get('Authorization')?.replace(/^Bearer /,'')});
  if(req.method!=='POST')return new Response('Method not allowed',{status:405});
  try{
    const raw=await req.text();if(raw.length>5000)return Response.json({error:{message:'Request too large'}},{status:413});
    const d=JSON.parse(raw) as Record<string,unknown>;
    if(action==='start'){
      const access=randomSeed(),id=crypto.randomUUID();
      return bankCall(env,'/create',{...d,id,access,access_hash:await sha256(access),ip_hash:await sha256(req.headers.get('CF-Connecting-IP')??'local'),stake:Math.round(Number(d.stake)*100)});
    }
    if(action==='action')return bankCall(env,'/action',d);
    return new Response('Not found',{status:404});
  }catch{return Response.json({error:{message:'Invalid game request'}},{status:400});}
}
export async function arcadeTicket(req:Request,env:Env):Promise<Response>{
  const names:Record<string,GameName>={pig_race:'pigs',road_run:'road',mines_game:'mines'};
  const name=new URL(req.url).pathname.split('/').pop()!,game=names[name];
  if(req.method!=='POST'||!game)return new Response('Not found',{status:404});
  try{return await ambasada(env).sell(name,async(input,call)=>{
    if(call.amount!==1)throw new Error('Game passes cost 1 TON');
    if(!env.ASSESSMENT_ACCESS_TOKEN)throw new Error('Game pass signing is not configured');
    const access=await sha256(`${env.ASSESSMENT_ACCESS_TOKEN}:arcade:${call.call_id}`),id=`ticket_${call.call_id}`;
    const res=await bankCall(env,'/ticket',{id,game,stake:100,buyer:call.buyer,access_hash:await sha256(access),client_seed:randomSeed(),pig:input.pig??0,nickname:'Agent player',public_score:false});
    const body=await res.json() as {round?:unknown;error?:{message:string}};
    if(!res.ok)throw new Error(body.error?.message??'Game unavailable');
    return {play_url:`https://demolari.vercel.app/#round=${id}&access=${access}`,round:body.round,rules:'A funded play pass, not a guaranteed win. TON is event play currency.'};
  })(req);}catch(e){if(isVillageError(e))return e.toResponse();throw e;}
}
