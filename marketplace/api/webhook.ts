import { isVillageError } from "@ambasada/village";
import { ambasada, type Env } from "../lib/ambasada.ts";
import { startPaidOrder } from "../lib/orders.ts";
import {bankCall} from './arcade.ts';
export default async function webhook(req: Request, env: Env): Promise<Response> {
  try {
    const event = await ambasada(env).verifyWebhook(req);
    if (event.type === "checkout.paid" && event.data.session?.id) {
      const session=event.data.session;
      if(session.metadata?.arcade_round){
        const answer=await bankCall(env,'/paid',{id:session.metadata.arcade_round,session:session.id});
        if(!answer.ok)throw new Error('Could not activate paid game; webhook will retry');
      }else await startPaidOrder(env,session.id);
    }
    return new Response("ok");
  } catch (error) { if (isVillageError(error)) return error.toResponse(); throw error; }
}
