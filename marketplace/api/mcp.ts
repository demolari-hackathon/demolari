import {mcpEndpoint,mcpTool} from '@ambasada/village';
import type {Env} from '../lib/ambasada.ts';
export default function mcp(req:Request,env:Env){return mcpEndpoint({name:'piggy-arcade',token:env.AMBASADA_MCP_TOKEN,tools:[mcpTool({
  name:'arcade_catalog',description:'Read current Piggy Arcade rules and play-pass prices before speaking to customers.',readOnly:true,
  run:()=>({website:'https://demolari.vercel.app',currency:'Hack A Ton event TON, not blockchain or cash',
    free_demos:true,website_stakes:[.5,1],market_pass_price:1,
    offerings:['demolatorii-hackathon/pig_race','demolatorii-hackathon/road_run','demolatorii-hackathon/mines_game'],
    rules:{pig_race:'4 equal pigs, 25% each; winner returns 3.8x including entry.',road_run:'80% independent survival per hop; cash out after safe hops, maximum 8. Cars are animation, not timing skill.',mines:'3 mines among 25 tiles; cash out after safe picks, maximum 8.'},
    limitations:'95% expected return before rounding, not a profit guarantee. An entry can be lost in full. Payouts go to the wallet that paid. A market pass gives a private browser play URL; it is not an immediate guaranteed win. Security products are paused.'})
})]})(req);}
