import assert from 'node:assert/strict';
const base='http://localhost:3000';
const headers={'Content-Type':'application/json'};
async function getRound(c){const r=await fetch(`${base}/api/arcade/state?id=${c.id}`,{headers:{Authorization:`Bearer ${c.access}`}});const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b.round;}
async function create(game,pay=true){
  const response=await fetch(`${base}/api/arcade/start`,{method:'POST',headers,body:JSON.stringify({game,stake:.5,pig:0,client_seed:crypto.randomUUID(),nickname:'Fixture pig',public_score:true})});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
  assert.ok(['127.0.0.1','localhost'].includes(new URL(data.url).hostname),'Integration tests must only approve the local fake-money checkout');
  const page=await fetch(data.url+'/approve',{method:'POST',redirect:'manual'});
  assert.equal(page.status,303);
  const hash=new URLSearchParams(new URL(page.headers.get('location')).hash.slice(1));
  const c={id:hash.get('round'),access:hash.get('access')};assert.ok(c.id&&c.access);return {c,round:await getRound(c)};
}
let r=await fetch(`${base}/api/arcade/config`);assert.equal(r.status,200);assert.equal((await r.json()).play_currency,true);
const road=await create('road');assert.equal(road.round.status,'active');assert.ok(!road.round.proof);
r=await fetch(`${base}/api/arcade/state?id=${road.c.id}`,{headers:{Authorization:'Bearer wrong'}});assert.equal(r.status,404);
let request={...road.c,action:'hop',revision:road.round.revision,request_id:crypto.randomUUID()};
r=await fetch(`${base}/api/arcade/action`,{method:'POST',headers,body:JSON.stringify(request)});assert.equal(r.status,200);let state=(await r.json()).round;
const retry=await fetch(`${base}/api/arcade/action`,{method:'POST',headers,body:JSON.stringify(request)});assert.equal((await retry.json()).round.revision,state.revision);
console.log('Road entry paid; wrong token rejected; duplicate hop did not advance again.');
if(state.status==='active'){
  request={...road.c,action:'cashout',revision:state.revision,request_id:crypto.randomUUID()};
  const a=await fetch(`${base}/api/arcade/action`,{method:'POST',headers,body:JSON.stringify(request)});const b=await a.json();assert.equal(b.round.settlement,'sent');
}
let paidMine=false;
for(let n=0;n<12&&!paidMine;n++){
  const mine=await create('mines');
  r=await fetch(`${base}/api/arcade/action`,{method:'POST',headers,body:JSON.stringify({...mine.c,action:'reveal',cell:0,revision:mine.round.revision,request_id:crypto.randomUUID()})});state=(await r.json()).round;
  if(state.status==='lost')continue;
  const cash={...mine.c,action:'cashout',revision:state.revision,request_id:crypto.randomUUID(),recipient:'attacker'};
  const both=await Promise.all([1,2].map(()=>fetch(`${base}/api/arcade/action`,{method:'POST',headers,body:JSON.stringify(cash)}).then(r=>r.json())));
  assert.equal(both[0].round.settlement,'sent',JSON.stringify(both[0]));assert.equal(both[0].round.payout,both[1].round.payout);assert.equal(both[0].round.revision,both[1].round.revision);
  paidMine=true;
}
assert.ok(paidMine);console.log('Mines cash-out transferred fake credits; concurrent retries returned the same settled round.');
const pig=await create('pigs');assert.equal(pig.round.status,'active');await new Promise(r=>setTimeout(r,8500));state=await getRound(pig.c);
assert.ok(['won','lost'].includes(state.status));assert.ok(state.proof?.seed);console.log('Pig race completed from a committed server outcome.');
const feed=await (await fetch(`${base}/api/arcade/feed`)).json();assert.ok(feed.rounds>=2);assert.ok(feed.payouts>0);console.log('Completed rounds and opt-in leaderboard updated.');
