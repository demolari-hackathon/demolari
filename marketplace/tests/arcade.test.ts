import test from 'node:test';
import assert from 'node:assert/strict';
import {activate,makeGame,outcomes,play,publicGame,payoutFor,sha256,type GameName} from '../lib/arcade-engine.ts';
const fixture=async(game:GameName)=>makeGame({id:'fixture',game,stake:100,access_hash:'secret-hash',client_seed:'client_fixture',pig:0});
test('commitment reproduces all outcomes and hides unpaid/active secrets',async()=>{
  const g=await fixture('mines');
  assert.equal(g.commitment,await sha256(g.seed));
  assert.deepEqual(await outcomes(g.seed,g.client_seed),{winner:g.winner,hazards:g.hazards,bombs:g.bombs});
  assert.equal(new Set(g.bombs).size,3);
  const view=publicGame(g);
  assert.ok(!('seed' in view)&&!('bombs' in view)&&!('access_hash' in view));
  assert.equal(view.proof,undefined);
});
test('pigs cannot finish early and settle exactly one committed outcome',async()=>{
  const g=await fixture('pigs');g.winner=0;activate(g,'payer',1000);
  assert.throws(()=>play(g,'finish',undefined,8999));
  play(g,'finish',undefined,9000);assert.equal(g.payout,380);assert.equal(g.settlement,'pending');
  assert.throws(()=>play(g,'finish',undefined,10000));assert.equal(g.payout,380);
  assert.equal(publicGame(g).proof?.seed,g.seed);
});
test('road losses cannot be cashed out or rerolled',async()=>{
  const g=await fixture('road');g.hazards=[false,true,false,false,false,false,false,false];activate(g,'payer');
  assert.throws(()=>play(g,'cashout'));play(g,'hop');assert.equal(publicGame(g).cashout,1.18);
  play(g,'hop');assert.equal(g.status,'lost');assert.equal(g.payout,0);assert.throws(()=>play(g,'cashout'));
});
test('mines rejects duplicate picks without altering steps and loses on a mine',async()=>{
  const g=await fixture('mines');g.bombs=[2,3,4];activate(g,'payer');play(g,'reveal',0);
  assert.throws(()=>play(g,'reveal',0));assert.equal(g.steps,1);play(g,'reveal',2);
  assert.equal(g.status,'lost');assert.equal(g.payout,0);assert.throws(()=>play(g,'reveal',1));
});
test('eight safe moves stop the round and max return covers every cashout',async()=>{
  for(const name of ['road','mines'] as const){
    const g=await fixture(name);g.hazards=Array(8).fill(false);g.bombs=[22,23,24];activate(g,'payer');
    for(let i=0;i<8;i++){play(g,name==='road'?'hop':'reveal',i);assert.ok(g.payout<=g.max_payout);}
    assert.equal(g.status,'won');assert.equal(g.payout,g.max_payout);
  }
});
test('fixed-stop expected return never exceeds 95% after rounding',()=>{
  for(let k=1;k<=8;k++)for(const stake of [50,100]){
    assert.ok(Math.pow(.8,k)*payoutFor('road',stake,k)<=stake*.95+1e-8);
    let survival=1;for(let i=0;i<k;i++)survival*=(22-i)/(25-i);
    assert.ok(survival*payoutFor('mines',stake,k)<=stake*.95+1e-8);
  }
});
test('unsupported stakes and invalid selections are refused',async()=>{
  await assert.rejects(()=>makeGame({id:'bad',game:'pigs',stake:10000,access_hash:'x',client_seed:'fixture_seed'}));
  await assert.rejects(()=>makeGame({id:'bad',game:'pigs',stake:100,access_hash:'x',client_seed:'fixture_seed',pig:9}));
});
