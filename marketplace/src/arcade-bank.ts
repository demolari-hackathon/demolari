import {DurableObject} from 'cloudflare:workers';
import {createVillage} from '@ambasada/village';
import type {Env} from '../lib/ambasada.ts';
import {activate,GameError,makeGame,play,publicGame,RULES,sha256,type Game} from '../lib/arcade-engine.ts';

/** One serialized, persistent treasury and game ledger. No browser decides paid outcomes. */
export class ArcadeBank extends DurableObject<Env>{
  async fetch(req:Request){return this.ctx.blockConcurrencyWhile(async()=>{
    try{return Response.json(await this.handle(req),{headers:{'Cache-Control':'no-store'}});}
    catch(e){return Response.json({error:{message:e instanceof GameError?e.message:'Game service unavailable. Retry without creating another round.'}},{status:e instanceof GameError?e.status:503});}
  });}
  private village(){return createVillage({env:this.env as unknown as Record<string,unknown>});}
  private async save(g:Game){await this.ctx.storage.put(`g:${g.id}`,g);}
  private async release(g:Game){if(g.reserved){const held=await this.ctx.storage.get<number>('reserved')??0;g.reserved=false;await this.ctx.storage.put({reserved:Math.max(0,held-g.max_payout),[`g:${g.id}`]:g});}}
  private async settle(g:Game){
    if(g.settlement==='pending'&&g.buyer&&g.payout>0){
      // Commit the liability before calling the bank. Retrying this key cannot pay twice.
      await this.save(g);
      try{await this.village().transfer(g.buyer,g.payout/100,{reason:`Piggy Arcade ${g.game} ${g.id}`,idempotencyKey:`arcade:payout:${g.id}`});g.settlement='sent';await this.save(g);}
      catch{await this.ctx.storage.setAlarm(Date.now()+60000);return;}
    }
    if(g.status!=='active'&&g.status!=='awaiting_payment'&&g.settlement!=='pending')await this.release(g);
  }
  private async refresh(g:Game){
    if(g.status==='awaiting_payment'&&g.session){
      const s=await this.village().getCheckout(g.session);
      if(s.status==='paid'){
        if(s.client_reference_id!==g.id||Math.round(s.amount*100)!==g.stake||!s.buyer)throw new GameError('Payment does not match this round',409);
        activate(g,s.buyer);await this.save(g);await this.ctx.storage.setAlarm(Date.now()+10000);
        await this.village().deliverCheckout(s.id,{text:`Piggy Arcade ${g.game} round funded. Play at https://demolari.vercel.app. Maximum return ${(g.max_payout/100).toFixed(2)} TON.`}).catch(()=>{});
      }else if(s.status==='expired'){g.status='refunded';g.payout=0;await this.release(g);}
    }
    if(g.game==='pigs'&&g.status==='active'&&Date.now()-(g.started??Date.now())>=RULES.race_ms){play(g,'finish');await this.save(g);}
    await this.settle(g);
  }
  private async handle(req:Request):Promise<unknown>{
    const url=new URL(req.url),path=url.pathname;
    if(path==='/config'){
      const reserved=await this.ctx.storage.get<number>('reserved')??0;
      const count=(await this.ctx.storage.list({prefix:'g:',limit:1000})).size;
      const w=await this.village().wallet();
      return {open:count<1000&&w.available*100-reserved>=2600,currency:'TON',play_currency:true,rules:RULES,reserved:reserved/100,
        games:{pigs:{win_chance:.25,multiplier:3.8},road:{survival_per_step:.8,max_steps:8},mines:{mines:3,tiles:25,max_safe_picks:8}},
        note:'Event play credits only. No blockchain or cash withdrawals. Payouts include stake; returns rounded down to 0.01 TON.'};
    }
    if(path==='/feed'){
      const all=await this.ctx.storage.list<Game>({prefix:'g:',limit:1000});
      const done=[...all.values()].filter(g=>g.buyer&&!['active','awaiting_payment'].includes(g.status)&&g.settlement!=='pending');
      const scores=new Map<string,{name:string;net:number;wins:number}>();
      for(const g of done.filter(g=>g.public_score)){
        const key=g.buyer??g.id,old=scores.get(key)??{name:g.nickname,net:0,wins:0};old.net+=(g.payout-g.stake)/100;if(g.payout>g.stake)old.wins++;scores.set(key,old);
      }
      return {rounds:done.length,payouts:done.reduce((n,g)=>n+g.payout,0)/100,leaders:[...scores.values()].sort((a,b)=>b.net-a.net).slice(0,10),
        recent:done.sort((a,b)=>b.created-a.created).slice(0,10).map(g=>({game:g.game,name:g.public_score?g.nickname:'Player',stake:g.stake/100,payout:g.payout/100}))};
    }
    const d=await req.json() as Record<string,unknown>;
    if(path==='/create'||path==='/ticket'){
      const id=String(d.id);
      const existing=await this.ctx.storage.get<Game>(`g:${id}`);
      if(existing)return {round:publicGame(existing)};
      if((await this.ctx.storage.list({prefix:'g:',limit:1000})).size>=1000)throw new GameError('Event round capacity reached. Free demos remain open.',503);
      if(path==='/create'){
        const games=await this.ctx.storage.list<Game>({prefix:'g:',limit:1000});
        if([...games.values()].filter(x=>x.ip_hash===d.ip_hash&&x.status==='awaiting_payment'&&Date.now()-x.created<600000).length>=3)throw new GameError('Three entries are already awaiting payment. Finish or let them expire first.',429);
      }
      const g=await makeGame(d as unknown as Parameters<typeof makeGame>[0]);
      const reserved=await this.ctx.storage.get<number>('reserved')??0,wallet=await this.village().wallet();
      if(wallet.available*100-reserved-g.max_payout<2000)throw new GameError('Treasury is covering current games. Try a demo or come back shortly.',503);
      await this.ctx.storage.put({reserved:reserved+g.max_payout,[`g:${id}`]:g});
      try{
        if(path==='/ticket')activate(g,String(d.buyer));
        else{
          const s=await this.village().checkout({amount:g.stake/100,description:`Piggy Arcade: ${g.game}, one round`,
            success_url:`https://demolari.vercel.app/?session={CHECKOUT_SESSION_ID}#round=${id}&access=${String(d.access)}`,cancel_url:'https://demolari.vercel.app/',client_reference_id:id,
            expires_in:300,metadata:{arcade_round:id}}, {idempotencyKey:`arcade:entry:${id}`});
          g.session=s.id;await this.save(g);await this.ctx.storage.setAlarm(Date.now()+60000);
          return {url:s.url,round:publicGame(g)};
        }
      }catch(e){await this.release(g);throw e;}
      await this.save(g);await this.ctx.storage.setAlarm(Date.now()+10000);return {round:publicGame(g)};
    }
    const g=await this.ctx.storage.get<Game>(`g:${String(d.id)}`);
    if(path==='/paid'){
      if(!g||g.session!==d.session)throw new GameError('Payment round not found',404);
      await this.refresh(g);return {ok:true};
    }
    if(!g||await sha256(String(d.access??''))!==g.access_hash)throw new GameError('Round not found',404);
    await this.refresh(g);
    if(path==='/action'){
      if(typeof d.request_id!=='string'||d.request_id.length>100)throw new GameError('Missing action ID');
      if(g.last_request===d.request_id)return {round:publicGame(g)};
      if(g.revision!==d.revision)throw new GameError('Round changed; refresh before your next move',409);
      play(g,String(d.action),d.cell as number|undefined);g.last_request=d.request_id;await this.save(g);await this.settle(g);
    }
    return {round:publicGame(g)};
  }
  async alarm(){
    await this.ctx.blockConcurrencyWhile(async()=>{
      const all=await this.ctx.storage.list<Game>({prefix:'g:',limit:1000});let pending=false;
      const active=[...all.values()].filter(g=>g.reserved),offset=(await this.ctx.storage.get<number>('alarm_cursor')??0)%Math.max(1,active.length);
      const batch=[...active.slice(offset),...active.slice(0,offset)].slice(0,10);
      for(const g of batch){
        if(g.reserved){try{
          await this.refresh(g);
          if(g.status==='active'&&Date.now()-(g.started??Date.now())>3600000){
            if(g.steps>0&&g.game!=='pigs')play(g,'cashout');else{g.status='refunded';g.payout=g.stake;g.settlement='pending';}
            await this.save(g);await this.settle(g);
          }
          if(g.status==='awaiting_payment'&&!g.session&&Date.now()-g.created>600000)await this.release(g);
        }catch{}if(g.reserved)pending=true;}
      }
      await this.ctx.storage.put('alarm_cursor',offset+batch.length);
      if(pending||active.length>batch.length)await this.ctx.storage.setAlarm(Date.now()+15000);
    });
  }
}
