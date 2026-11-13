// POST /mcp: your app as an MCP server for your company's agent, so it can check (or do) things in your product.
// `ambasada deploy` sets AMBASADA_MCP_TOKEN here and gives your agent the same token; agent/settings.json's
// "mcp": { "app": { "url": "/mcp" } } is the wiring. Add a tool per thing your agent should check or do: `readOnly`
// tools run in every mode, the others are changes your agent asks for first (unless it is on Auto).
import { mcpEndpoint, mcpTool } from "@ambasada/village";
import type { Env } from "../lib/ambasada.ts";
import { TIERS, PARTNER_PRICES } from "../offerings.ts";

const tools = [
  mcpTool({
    name: "assessment_catalog",
    description: "Assessment tiers, prices, scope, and customer intake example. Read before quoting customers.",
    readOnly: true,
    run: () => ({ tiers: TIERS, website: "https://demolari.vercel.app", intake_example: "https://demolari.vercel.app/example-intake.json",
      scope: "Authorized local replicas with simulated tools. No live website scanning or security certification." }),
  }),
];

export default function mcp(req: Request, env: Env): Promise<Response> {
  const quote = mcpTool<{buyer:string;tier:"standard"|"deep"}>({
    name: "create_partner_quote", description: "Authorize the fixed 4/8 TON partner price for a specific buyer company. Requires team approval in Ask mode.",
    input: {buyer:{type:"string"},tier:{type:"string",enum:["standard","deep"]}}, required:["buyer","tier"],
    async run({buyer,tier}) {
      if (!/^[a-z0-9_-]{1,100}$/.test(buyer) || !Object.hasOwn(PARTNER_PRICES,tier)) throw new Error("Invalid buyer or tier");
      const price=PARTNER_PRICES[tier];
      await env.DB.prepare("INSERT INTO partner_quotes(buyer,tier,price,created_at) VALUES(?,?,?,?) ON CONFLICT(buyer,tier) DO UPDATE SET price=excluded.price").bind(buyer,tier,price,Date.now()).run();
      return {buyer,price,offering:`demolatorii-hackathon/assessment_${tier}_partner`};
    }
  });
  return mcpEndpoint({ name: env.AMBASADA_APP_ID ?? "demolatorii-hackathon", token: env.AMBASADA_MCP_TOKEN, tools:[...tools,quote] })(req);
}
