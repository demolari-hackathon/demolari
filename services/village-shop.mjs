import {createHmac,timingSafeEqual} from 'node:crypto';
export const PRODUCTS={
 beach_chair:{price:2,title:'Royal Beach Chair',description:'A personalized virtual beach chair: illustrated SVG keepsake and hosted ownership page. Digital village collectible, not a physical chair or beach reservation.'},
 market_stall:{price:3,title:'Farmer’s Market Table',description:'Your own public digital market table with up to 10 product cards, prices and links. Hosted page plus listing in our village-market directory. No physical table, checkout processing or guaranteed visitors.'},
 product_storage:{price:2,title:'Village Product Storehouse',description:'Private JSON storage for up to 10 product records (maximum 8 KB total), with authenticated read and replace API. Event-duration digital catalog storage; no physical warehousing or files.'}
};
const BASE='https://demolari.vercel.app/api/village';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(x,max,fallback='')=>{if(x===undefined)return fallback;if(typeof x!=='string'||x.length>max)throw Error(`Text must be at most ${max} characters`);return x.trim()||fallback;};
export function cleanProducts(items=[]){
 if(!Array.isArray(items)||items.length>10)throw Error('Supply up to 10 product records');
 const products=items.map(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid product');
  const name=text(p.name,80);if(!name)throw Error('Every product needs a name');
  const description=text(p.description,300),url=text(p.url,400);
  if(url&&new URL(url).protocol!=='https:')throw Error('Product links must use HTTPS');
  if(p.price!==undefined&&(!Number.isFinite(p.price)||p.price<0))throw Error('Prices must be nonnegative numbers');
  return {name,description,...(url?{url}:{}),...(p.price!==undefined?{price:p.price}:{})};
 });
 if(Buffer.byteLength(JSON.stringify(products))>8192)throw Error('Products must fit in 8 KB');
 return products;
}
const page=(title,body)=>new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Piggy Village</title><link rel="stylesheet" href="/village.css"></head><body><main><a class="wordmark" href="/village.html">PIGGY VILLAGE ↗</a><p class="kicker">A LITTLE PLACE IN THE VILLAGE</p><h1>${esc(title)}</h1>${body}<footer>Digital village services · available for the event · no physical goods or guaranteed sales.<br><a href="/">Visit Piggy Arcade</a></footer></main></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function accessFor(secret,id,buyer){return createHmac('sha256',secret).update(`village-storage:${id}:${buyer}`).digest('hex');}
function authorized(req,secret,row){const token=Buffer.from(req.headers.get('Authorization')?.replace(/^Bearer /,'')??''),expected=Buffer.from(accessFor(secret,row.id,row.buyer));return token.length===expected.length&&timingSafeEqual(token,expected);}
export function makeShop(village,secret){return async req=>{
 const u=new URL(req.url),service=u.searchParams.get('service'),id=u.searchParams.get('id');
 try{
  if(req.method==='GET'&&!id){
   if(u.searchParams.has('directory')){
    const list=await village.store.list('piggy:stall:');
    const rows=(await Promise.all(list.keys.map(k=>village.store.get(k.key)))).filter(Boolean);
    return page('The farmer’s market',`<p>Digital tables run by village teams. ${rows.length} published stalls. Listing here does not imply endorsement.</p><div class="cards">${rows.map(r=>`<a class="card" href="${BASE}?id=${encodeURIComponent(r.id)}"><h2>${esc(r.name)}</h2><p>${r.products.length} products · ${esc(r.buyer)}</p></a>`).join('')||'<p>The first table is waiting for its shopkeeper.</p>'}</div>`);
   }
   return json({products:PRODUCTS,terms:'Digital services for the Hack A Ton event. Storage is for product metadata only, not secrets or backups.'});
  }
  if(id){
   if(!/^call_[A-Za-z0-9_-]{1,100}$/.test(id))return json({error:'Not found'},404);
   const row=await village.store.get(`piggy:order:${id}`);if(!row)return json({error:'Not found'},404);
   if(row.service==='product_storage'||(row.service==='market_stall'&&req.method==='PUT')){
    if(!secret||!authorized(req,secret,row))return json({error:'Storage access token required'},401);
    if(req.method==='PUT'){
     const body=await req.text();if(Buffer.byteLength(body)>16000)return json({error:'Request too large'},413);
     row.products=cleanProducts(JSON.parse(body).products);await village.store.put(`piggy:order:${id}`,row);
     if(row.service==='market_stall')await village.store.put(`piggy:stall:${id}`,{id,buyer:row.buyer,name:row.name,products:row.products});
    }else if(req.method!=='GET')return json({error:'Method not allowed'},405);
    return json({id,products:row.products,capacity:10,max_bytes:8192,terms:PRODUCTS[row.service].description});
   }
   if(req.method!=='GET')return json({error:'Method not allowed'},405);
   if(u.searchParams.has('svg')&&row.service==='beach_chair')return new Response(chairSVG(row.name),{headers:{'Content-Type':'image/svg+xml','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'no-store'}});
   if(row.service==='beach_chair')return page(row.name,`<p>Virtual beach-chair collectible · owned by ${esc(row.buyer)}</p><img class="chair" src="${BASE}?id=${id}&amp;svg=1" alt="Your personalized virtual beach chair"><p>${esc(PRODUCTS.beach_chair.description)}</p><a class="button" href="${BASE}?id=${id}&amp;svg=1">Open your SVG artwork ↗</a>`);
   return page(row.name,`<p>A public digital table by ${esc(row.buyer)}. Contact the seller through the village marketplace.</p><div class="cards">${row.products.map(p=>`<article class="card"><h2>${esc(p.name)}</h2><p>${esc(p.description)}</p>${p.price!==undefined?`<b>${esc(p.price)} TON</b>`:''}${p.url?`<p><a href="${esc(p.url)}" rel="noopener noreferrer">Visit product ↗</a></p>`:''}</article>`).join('')||'<p>This seller’s table is ready. No products were supplied.</p>'}</div><a href="${BASE}?directory=1">Browse the farmer’s market ↗</a>`);
  }
  if(req.method!=='POST'||!PRODUCTS[service])return json({error:'Unknown service'},404);
  if(!secret)return json({error:'Service configuration unavailable'},503);
  return village.sell(service,async(input,call)=>{
   if(call.amount!==PRODUCTS[service].price)throw Error('Payment amount does not match this service');
   if(!/^call_[A-Za-z0-9_-]{1,100}$/.test(call.call_id))throw Error('Invalid receipt ID');
   const key=`piggy:order:${call.call_id}`;
   let row=await village.store.get(key);
   if(row&&(row.buyer!==call.buyer||row.service!==service))throw Error('Order conflict');
   if(!row){
    row={id:call.call_id,buyer:call.buyer,service,name:text(input.name,80,`${call.buyer}’s ${PRODUCTS[service].title}`),products:service==='beach_chair'?[]:cleanProducts(input.products),created_at:new Date().toISOString()};
    await village.store.put(key,row);
   }
   if(service==='market_stall')await village.store.put(`piggy:stall:${row.id}`,{id:row.id,buyer:row.buyer,name:row.name,products:row.products});
   return {id:row.id,service,url:`${BASE}?id=${row.id}`,terms:PRODUCTS[service].description,
    ...(service==='beach_chair'?{artwork_url:`${BASE}?id=${row.id}&svg=1`}:{}),
    ...(service==='product_storage'?{access_token:accessFor(secret,row.id,row.buyer),products:row.products,instructions:'Keep access_token private. GET the URL with Authorization: Bearer <access_token>. PUT {"products":[...]} to replace the catalog; maximum 10 records and 8 KB.'}:{}),
    ...(service==='market_stall'?{products:row.products,directory_url:`${BASE}?directory=1`,access_token:accessFor(secret,row.id,row.buyer),instructions:'Your shop page is public. Keep access_token private. PUT {"products":[...]} to the URL with Authorization: Bearer <access_token> to replace up to 10 product cards.'}:{})};
  })(req);
 }catch(e){return json({error:e.message?.startsWith('Supply')||e.message?.startsWith('Product')||e.message?.startsWith('Text')?e.message:'Unable to deliver this service. No completed delivery is available.'},400);}
};}
function chairSVG(name){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" rx="32" fill="#d6ece7"/><circle cx="650" cy="110" r="55" fill="#f5ca72"/><path d="M0 350Q200 300 400 355T800 340V600H0" fill="#efdfac"/><path d="m285 445 125-285h140L425 445Z" fill="#f0a8b8" stroke="#264b3a" stroke-width="12"/><path d="m337 330 45-100h140l-45 100Z" fill="#fff4d8"/><path d="m270 460 210-25m-90-10-15 100m105-90 55 90" stroke="#264b3a" stroke-width="14" stroke-linecap="round"/><path d="M160 350V130m-105 25q105-160 210 0Z" fill="#efba6d" stroke="#264b3a" stroke-width="8"/><text x="400" y="565" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#264b3a">${esc(name)}</text><text x="400" y="50" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#264b3a">PIGGY VILLAGE · VIRTUAL BEACH CLUB</text></svg>`;}
