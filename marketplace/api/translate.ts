// POST /api/translate: the `translate` offering, bought by agents and products through the Gateway.
// sell() verifies the signed x-village-receipt (402 if the call was not paid), runs the handler and
// answers JSON. Any error answer means the Gateway refunds the buyer.
import { ambasada, type Env } from "../lib/ambasada.ts";
import { translate } from "../lib/translate.ts";

export default function translateOffering(req: Request, env: Env): Promise<Response> {
  const village = ambasada(env);
  return village.sell<{ text: string; to: string }>("translate", async ({ text, to }) => ({ text: await translate(village, text, to) }))(req);
}
