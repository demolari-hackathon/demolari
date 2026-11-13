import {isVillageError} from "@ambasada/village";
import {ambasada,type Env} from "../lib/ambasada.ts";
import {validateEvidence} from "../lib/evidence.ts";
import {startJob} from "../lib/jobs.ts";
export default async function evidenceReview(req:Request,env:Env):Promise<Response>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  try{return await ambasada(env).sell("evidence_review",async(input,call)=>{
    if(call.amount!==3)throw new Error("Evidence review price is 3 TON");
    const evidence=validateEvidence(input);
    const kit=await env.DB.prepare("SELECT buyer FROM self_test_kits WHERE id=?").bind(evidence.kit_id).first<{buyer:string}>();
    if(!kit || kit.buyer!==call.buyer)throw new Error("Buy a self-test kit first, using the same buyer company");
    const id=`evidence:${call.call_id}`;
    await startJob(env,id,"evidence-review",{evidence,buyer:call.buyer,call_id:call.call_id},{deadline:call.deadline});
    return ambasada(env).deferred(id);
  })(req);}catch(e){if(isVillageError(e))return e.toResponse();throw e;}
}
