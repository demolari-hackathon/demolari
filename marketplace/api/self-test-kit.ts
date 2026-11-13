import { isVillageError } from "@ambasada/village";
import { ambasada,type Env } from "../lib/ambasada.ts";
import { kitInput,createKit } from "../lib/self-test.ts";
export default async function selfTestKit(req:Request,env:Env):Promise<Response>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  try{return await ambasada(env).sell("self_test_kit",async(input,call)=>{
    if(call.amount!==2)throw new Error("Kit price is 2 TON");
    const d=kitInput(input),id=`kit_${call.call_id}`;
    const result=createKit(d.service_type,d.goals,id);
    await env.DB.prepare("INSERT OR IGNORE INTO self_test_kits(id,buyer,service_type,goals,created_at) VALUES(?,?,?,?,?)").bind(id,call.buyer,d.service_type,d.goals,Date.now()).run();
    return result;
  })(req);}catch(e){if(isVillageError(e))return e.toResponse();throw e;}
}
