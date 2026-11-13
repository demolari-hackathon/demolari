import {makeGame,activate,play,publicGame,randomSeed,payoutFor,RULES} from './arcade-engine.js';
const $=id=>document.getElementById(id);
const API='https://demolatorii-hackathon.ambasada.dev';
const pigs=[{name:'Rosie',color:'#efa1b0',dark:'#d17b94'},{name:'Waffles',color:'#e8c36f',dark:'#c59c4c'},{name:'Pickles',color:'#a8bd88',dark:'#819d62'},{name:'Blueberry',color:'#a8becf',dark:'#7a9fb8'}];
let selected='pigs',pig=0,stake=1,round=null,credentials=null,demo=false,demoGame=null,busy=false,config=null;
let raceFrame=null,pollTimer=null,audio=null,sound=false,lastRaceId=null;
const money=n=>Number(n||0).toFixed(2);
const terminal=()=>round&&!['active','awaiting_payment'].includes(round.status);
function pigSVG(index=0){const p=pigs[index];return `<svg viewBox="0 0 110 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M19 43C5 31 5 53 16 48" fill="none" stroke="${p.dark}" stroke-width="4" stroke-linecap="round"/><path d="M29 58v12m17-12v12m30-13v12m15-16v12" stroke="${p.dark}" stroke-width="8" stroke-linecap="round"/><ellipse cx="55" cy="44" rx="37" ry="25" fill="${p.color}"/><path d="m68 23 4-19 18 18" fill="${p.dark}"/><ellipse cx="83" cy="38" rx="23" ry="24" fill="${p.color}"/><path d="m86 21 9-13 5 18" fill="${p.dark}"/><ellipse cx="96" cy="46" rx="14" ry="10" fill="${p.dark}"/><circle cx="92" cy="45" r="2" fill="#3d443a"/><circle cx="101" cy="45" r="2" fill="#3d443a"/><circle cx="87" cy="32" r="3" fill="#293d32"/><path d="M80 39q4 3 8 0" fill="none" stroke="${p.dark}" stroke-width="2"/><ellipse cx="43" cy="32" rx="12" ry="5" fill="#fff" opacity=".12"/></svg>`;}
$('brand-pig').innerHTML=pigSVG(0);
$('road-player').innerHTML=pigSVG(0);
function buildScenes(){
  $('track').innerHTML=pigs.map((p,i)=>`<div class="lane"><span class="lane-number">0${i+1}</span><div class="runner ${i===pig?'selected':''}" id="runner-${i}">${pigSVG(i)}</div></div>`).join('');
  $('pig-picker').innerHTML=pigs.map((p,i)=>`<button class="pig-pick ${i===pig?'selected':''}" data-pig="${i}" aria-label="Choose ${p.name}" aria-pressed="${i===pig}">${pigSVG(i)}${p.name}</button>`).join('');
  document.querySelectorAll('[data-pig]').forEach(b=>b.addEventListener('click',()=>{if(round&&!terminal())return;pig=Number(b.dataset.pig);buildScenes();renderControls();}));
  $('road-board').innerHTML='<div class="road-row grass"></div>'+Array.from({length:8},(_,i)=>`<div class="road-row"><span class="car"></span>${i%2===0?'<span class="car second"></span>':''}</div>`).join('');
  $('mine-grid').replaceChildren(...Array.from({length:25},(_,i)=>{const b=document.createElement('button');b.className='mine-tile';b.textContent='·';b.setAttribute('aria-label',`Reveal tile ${i+1}`);b.addEventListener('click',()=>act('reveal',i));return b;}));
}
const descriptions={
  pigs:{tag:'PIGGY DERBY',title:'Back your pig.',description:'One wins. Three reconsider their career.',status:'Pick your favorite. They all have the same chance.',rules:'25% chance per pig. Winning return 3.8×. Expected return 95%; a round can lose the full entry.'},
  road:{tag:'HOG CROSSING',title:'How far will you go?',description:'Every safe hop grows your cash-out.',status:'Start a round, then hop or take your return.',rules:'80% survival per crossing. Car timing is visual; odds are independent of click timing. Cash out after any safe hop, up to eight.'},
  mines:{tag:'TRUFFLE TROUBLE',title:'Dig a little deeper.',description:'Find the gems. Avoid the three mines.',status:'Start a round, then choose a tile. Cash out after any safe pick.',rules:'Three mines among 25 tiles. Pick up to eight safe tiles. Returns follow the exact survival probability, with 95% expected return before rounding.'}
};
function chooseGame(game,clearLink=true){
  if(round&&!terminal())return showError('Finish your current round before starting another.');
  selected=game;round=null;credentials=null;demo=false;demoGame=null;clearInterval(pollTimer);cancelAnimationFrame(raceFrame);lastRaceId=null;
  if(clearLink)history.replaceState(null,'',location.pathname);
  document.querySelectorAll('[data-game]').forEach(b=>{const active=b.dataset.game===game;b.classList.toggle('selected',active);b.setAttribute('aria-selected',active);});
  ['pigs','road','mines'].forEach(g=>$(g==='pigs'?'pig-scene':`${g}-scene`).hidden=g!==game);
  const d=descriptions[game];$('game-tag').textContent=d.tag;$('control-title').textContent=d.title;$('control-description').textContent=d.description;$('stage-status').textContent=d.status;$('tiny-rules').textContent=d.rules;
  $('error').hidden=true;$('stage-result').hidden=true;buildScenes();renderControls();
}
function showError(message){$('error').textContent=message;$('error').hidden=false;}
function beep(win=false){if(!sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=win?660:330;g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.16);o.start();o.stop(audio.currentTime+.17);}catch{}}
function renderControls(){
  const active=round?.status==='active',pending=round?.status==='awaiting_payment',end=terminal();
  $('pig-picker').hidden=selected!=='pigs';$('nickname-section').hidden=!!round&&!end;
  document.querySelectorAll('[data-stake]').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.stake)===stake);b.disabled=!!round&&!end;});
  document.querySelectorAll('[data-pig]').forEach(b=>b.disabled=!!round&&!end);
  const steps=round?.steps??0,ret=selected==='pigs'?stake*3.8:round?.cashout||payoutFor(selected,Math.round(stake*100),1)/100;
  $('payout-label').textContent=selected==='pigs'?'Return if your pig wins':steps?'Available to cash out':'Return after first safe move';
  $('payout').replaceChildren(document.createTextNode(`${money(ret)} `));const small=document.createElement('small');small.textContent='TON';$('payout').append(small);
  $('multiplier').textContent=`${(ret/stake).toFixed(2)}×`;
  $('mode-tag').classList.toggle('demo',demo);$('mode-tag').textContent=demo?'FREE DEMO · NO TON':active?'PAID ROUND':end?'ROUND COMPLETE':pending?'AWAITING PAYMENT':'READY WHEN YOU ARE';
  $('play-button').disabled=busy||pending||(active&&selected!=='road');
  if(active&&selected==='road')$('play-button').textContent=`Hop ${steps+1} / 8 →`;
  else if(active)$('play-button').textContent=selected==='pigs'?'And they’re off…':'Pick a tile on the board ←';
  else $('play-button').textContent=`${end?'Play again':selected==='pigs'?'Race':'Play'} for ${stake} TON →`;
  $('cashout-button').hidden=!active||selected==='pigs'||!steps;
  $('cashout-button').disabled=busy;$('cashout-value').textContent=`${money(round?.cashout)} TON`;
  $('demo-button').disabled=busy||(!!round&&!end);$('demo-button').textContent=end?'Another free demo ↗':'Just here for a free demo ↗';
  const tiles=[...$('mine-grid').children];tiles.forEach((b,i)=>{
    const revealed=round?.revealed?.includes(i),bomb=round?.proof?.bombs?.includes(i);
    b.disabled=busy||!active||selected!=='mines'||revealed;
    b.className=`mine-tile${revealed?(bomb?' bomb':' safe'):end&&bomb?' hint-bomb':''}`;
    b.textContent=revealed?(bomb?'✹':'◆'):end&&bomb?'✹':'·';
  });
  $('safe-count').textContent=`${steps} / 8 safe picks`;
  const rowHeight=$('road-board').querySelector('.road-row:not(.grass)')?.getBoundingClientRect().height||44;
  $('road-player').style.bottom=`${42+Math.min(steps,8)*rowHeight}px`;$('road-player').classList.toggle('hit',round?.status==='lost');
  $('stage-result').hidden=!end;
  if(end){
    const won=round.payout>0;
    $('result-icon').textContent=won?'★':'↺';
    $('result-title').textContent=won?`${demo?'Demo return':'Return'}: ${money(round.payout)} TON`:selected==='pigs'?'A noble effort. Not a podium.':selected==='road'?'Traffic had other plans.':'That wasn’t a truffle.';
    $('result-copy').textContent=demo?'Practice round only. No entry charged and no TON paid.':round.settlement==='pending'?'Transfer pending. The server will retry the same payout ID; refresh to check.':round.payout>0?'Transfer confirmed to the wallet that paid the entry.':'Entry lost. A new round starts with a new random seed.';
    $('stage-status').textContent=demo?'Free demo complete. Real rounds require approval in Ambasada.':round.settlement==='pending'?'Payout is pending; your claim is recorded.':!round.funded?'Entry expired without a funded round.':`Round complete · net ${round.payout-round.stake>=0?'+':''}${money(round.payout-round.stake)} TON`;
    if(!demo&&!round.funded){$('result-title').textContent='Entry expired.';$('result-copy').textContent='No funded game was played.';}
  }else if(active){$('stage-status').textContent=selected==='pigs'?'The race is running. The server settles the committed result.':`${demo?'DEMO · ':''}${steps} safe moves · ${steps?`cash out ${money(round.cashout)} TON or continue`:'make your first move'}`;}
  $('proof-content').textContent=round?JSON.stringify({mode:demo?'demo':'paid',...round},null,2):'Start a round to see its details.';
}
async function request(path,options={}){
  const response=await fetch(`${API}${path}`,{...options,signal:AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'The game service could not complete that request.');return data;
}
async function startPaid(){
  if(busy)return;
  if(round?.status==='active')return selected==='road'?act('hop'):undefined;
  if(round?.settlement==='pending')return showError('Your payout is pending. Refresh its status before starting a new round.');
  $('error').hidden=true;busy=true;renderControls();
  try{
    const d=await request('/api/arcade/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game:selected,stake,pig,client_seed:randomSeed(),nickname:$('nickname').value,public_score:$('public-score').checked})});
    const url=new URL(d.url);if(url.protocol!=='https:'||!['hackaton.ambasada.dev','hackaton.ambasada.id'].includes(url.hostname))throw new Error('Unexpected payment destination.');
    $('stage-status').textContent='Opening Ambasada to approve the entry…';location.assign(url.href);
  }catch(e){showError(e.message);}finally{busy=false;renderControls();}
}
async function startDemo(){
  if(busy||round&&!terminal())return;
  credentials=null;demo=true;demoGame=await makeGame({id:`demo_${crypto.randomUUID()}`,game:selected,stake:Math.round(stake*100),access_hash:'demo',pig,client_seed:randomSeed()});
  activate(demoGame,'demo');round=publicGame(demoGame);lastRaceId=null;$('error').hidden=true;buildScenes();renderControls();if(selected==='pigs')runRace();beep();
}
async function act(action,cell){
  if(busy||round?.status!=='active')return;
  busy=true;$('error').hidden=true;renderControls();
  try{
    if(demo){play(demoGame,action,cell);if(demoGame.settlement==='pending')demoGame.settlement='sent';round=publicGame(demoGame);}
    else{
      const d=await request('/api/arcade/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...credentials,action,cell,revision:round.revision,request_id:crypto.randomUUID()})});round=d.round;
    }
    beep(terminal()&&round.payout>0);if(terminal())refreshFeed();
  }catch(e){showError(e.message);if(!demo)await fetchRound().catch(()=>{});}finally{busy=false;renderControls();}
}
async function fetchRound(){
  if(!credentials)return;
  const d=await request(`/api/arcade/state?id=${encodeURIComponent(credentials.id)}`,{headers:{Authorization:`Bearer ${credentials.access}`}});
  round=d.round;renderControls();
  if(selected==='pigs'&&lastRaceId!==round.id)runRace();
  if(terminal()&&round.settlement!=='pending'){clearInterval(pollTimer);refreshFeed();}
}
function runRace(){
  cancelAnimationFrame(raceFrame);lastRaceId=round.id;
  const animate=async()=>{
    const elapsed=Math.max(0,Date.now()-(round.started||Date.now()));
    const progress=Math.min(.96,elapsed/8000);
    if(demo&&round.status==='active'&&elapsed>=8000){play(demoGame,'finish',undefined,Date.now());if(demoGame.payout)demoGame.settlement='sent';round=publicGame(demoGame);renderControls();beep(round.payout>0);}
    const max=Math.max(50,$('track').clientWidth-145);
    pigs.forEach((_,i)=>{
      const el=$(`runner-${i}`);if(!el)return;
      const done=!!round.proof,win=round.proof?.winner===i;
      const p=done?(win?1:.78+i*.018):Math.min(.96,progress*(.82+i*.035)+Math.sin(elapsed/520+i)*.025*progress);
      el.style.transform=`translateX(${Math.max(0,p)*max}px)`;
      el.classList.toggle('running',round.status==='active');el.classList.toggle('finished',done&&win);
    });
    if(round.status==='active')raceFrame=requestAnimationFrame(animate);
  };raceFrame=requestAnimationFrame(animate);
}
function textNode(tag,text,cls){const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;}
async function refreshFeed(){try{
  const feed=await request('/api/arcade/feed');
  if(feed.recent?.length)$('activity-list').replaceChildren(...feed.recent.map(r=>{
    const row=textNode('div','','activity-row'),name=textNode('span',''),wrap=textNode('span',r.name),icon=textNode('i',r.game==='pigs'?'♟':r.game==='road'?'↟':'◆','game-icon');wrap.append(textNode('small',descriptions[r.game]?.tag||r.game));name.append(icon,wrap);row.append(name,textNode('span',`${money(r.stake)} TON`),textNode('span',`${money(r.payout)} TON`,r.payout>r.stake?'win-value':''));return row;
  }));
  if(feed.leaders?.length)$('leaders').replaceChildren(...feed.leaders.map((r,i)=>{const row=textNode('div','','leader-row');row.append(textNode('span',String(i+1).padStart(2,'0'),'leader-rank'),textNode('span',r.name),textNode('b',`${r.net>=0?'+':''}${money(r.net)} TON`));return row;}));
  $('total-rounds').textContent=feed.rounds;$('total-payouts').textContent=money(feed.payouts);
}catch{/* Keep a quiet empty state until real data is available. */}}
async function init(){
  const hash=new URLSearchParams(location.hash.slice(1));
  busy=!!(hash.get('round')&&hash.get('access'));
  buildScenes();chooseGame('pigs',false);
  try{config=await request('/api/arcade/config');$('service-status').textContent=config.open?'Piggy bank is open':'Paid entries paused · demos are open';}
  catch{$('service-status').textContent='Paid service unavailable · try a demo';}
  if(hash.get('round')&&hash.get('access')){
    credentials={id:hash.get('round'),access:hash.get('access')};
    try{
      const d=await request(`/api/arcade/state?id=${encodeURIComponent(credentials.id)}`,{headers:{Authorization:`Bearer ${credentials.access}`}});
      const saved=credentials;selected=d.round.game;round=null;chooseGame(selected,false);credentials=saved;round=d.round;stake=round.stake;pig=round.pig;
      history.replaceState(null,'',`#round=${encodeURIComponent(saved.id)}&access=${encodeURIComponent(saved.access)}`);
      buildScenes();renderControls();$('play').scrollIntoView();
      if(selected==='pigs')runRace();pollTimer=setInterval(()=>fetchRound().catch(e=>showError(e.message)),1500);
    }catch(e){showError(e.message);}
  }
  busy=false;renderControls();refreshFeed();
}
document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>chooseGame(b.dataset.game)));
document.querySelectorAll('[data-stake]').forEach(b=>b.addEventListener('click',()=>{if(round&&!terminal())return;stake=Number(b.dataset.stake);renderControls();}));
$('play-button').addEventListener('click',startPaid);$('demo-button').addEventListener('click',startDemo);$('cashout-button').addEventListener('click',()=>act('cashout'));
$('sound').addEventListener('click',()=>{sound=!sound;$('sound').textContent=sound?'♫ on':'♫ off';$('sound').setAttribute('aria-pressed',String(sound));beep();});
['rules-link','footer-rules'].forEach(id=>$(id).addEventListener('click',()=>$('rules-dialog').showModal()));
$('proof-button').addEventListener('click',()=>$('proof-dialog').showModal());document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&credentials)fetchRound().catch(()=>{});});
window.addEventListener('resize',()=>{renderControls();if(round?.game==='pigs')runRace();});
init().catch(e=>showError(e.message));
