import {offering} from '@ambasada/village';
import previous from './legacy-offerings.ts';
export {TIERS,PARTNER_PRICES} from './legacy-offerings.ts';
export type {Tier} from './legacy-offerings.ts';
export default [
  offering({name:'pig_race',price:1,endpoint:'/api/pig_race',description:'Piggy Derby: a funded 1 TON play pass for an animated four-pig race. Choose pig 0–3 (optional). Each has 25% chance; winning return 3.8 TON includes stake. Event play credits, full entry can be lost. Returns a private play URL; payout goes to the buyer wallet.',input:{pig:'integer?'},output:{play_url:'string',round:'object',rules:'string'},timeout_ms:10000}),
  offering({name:'road_run',price:1,endpoint:'/api/road_run',description:'Hog Crossing: a funded 1 TON interactive play pass. Hop through traffic, 80% survival per hop, or cash out after a safe hop; maximum eight. 95% expected return before rounding, full entry can be lost. Returns a private play URL; winnings go to the buyer wallet. Event play credits.',input:{},output:{play_url:'string',round:'object',rules:'string'},timeout_ms:10000}),
  offering({name:'mines_game',price:1,endpoint:'/api/mines_game',description:'Truffle Trouble: a funded 1 TON Mines play pass. Three mines among 25 tiles; reveal up to eight safe tiles and cash out. 95% expected return before rounding. A mine loses the entry. Returns a private play URL; winnings go to the buyer wallet. Event play credits.',input:{},output:{play_url:'string',round:'object',rules:'string'},timeout_ms:10000}),
  ...previous.map(o=>({...o,status:'paused' as const})),
];
