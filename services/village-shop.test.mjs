import test from 'node:test';import assert from 'node:assert/strict';import {makeShop,cleanProducts} from './village-shop.mjs';
function setup(){
 const data=new Map();
 const store={get:async k=>data.get(k)??null,put:async(k,v)=>data.set(k,structuredClone(v)),list:async prefix=>({keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))})};
 return {data,shop:makeShop({store},'test_secret')};
}
test('private storage refuses unauthenticated access and stays out of directory',async()=>{
 const {shop,data}=setup();data.set('piggy:order:call_private',{id:'call_private',buyer:'team',service:'product_storage',products:[{name:'Private catalog'}]});
 assert.equal((await shop(new Request('https://test/api/village?id=call_private'))).status,401);
 assert.ok(!(await(await shop(new Request('https://test/api/village?directory=1'))).text()).includes('Private catalog'));
});
test('market pages escape seller HTML and reject executable product links',async()=>{
 assert.throws(()=>cleanProducts([{name:'x',url:'javascript:alert(1)'}]));
 const {shop,data}=setup();data.set('piggy:order:call_public',{id:'call_public',buyer:'<team>',service:'market_stall',name:'<script>alert(1)</script>',products:[{name:'<img src=x onerror=alert(1)>'}]});
 const html=await(await shop(new Request('https://test/api/village?id=call_public'))).text();
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;script&gt;'));
});
test('storage enforces capacity, numeric prices and supported public fields',()=>{
 assert.throws(()=>cleanProducts(Array.from({length:11},()=>({name:'x'}))));
 assert.throws(()=>cleanProducts([{name:'x',price:-1}]));
 assert.deepEqual(cleanProducts([{name:'x',secret:'discard me'}]),[{name:'x',description:''}]);
});
test('public stalls require owner token to update their cards and directory entry',async()=>{
 const {data}=setup(),store={get:async k=>data.get(k)??null,put:async(k,v)=>data.set(k,structuredClone(v)),list:async()=>({keys:[{key:'piggy:stall:call_stall'}]})};
 const shop=makeShop({store,sell:(service,fn)=>async()=>Response.json(await fn({name:'Shop',products:[{name:'Tea'}]},{amount:3,buyer:'seller',call_id:'call_stall'}))},'test_secret');
 const order=await(await shop(new Request('https://test/api/village?service=market_stall',{method:'POST'}))).json();
 const body=JSON.stringify({products:[{name:'Coffee'}]});
 assert.equal((await shop(new Request(order.url,{method:'PUT',body}))).status,401);
 assert.equal((await shop(new Request(order.url,{method:'PUT',body,headers:{Authorization:`Bearer ${order.access_token}`}}))).status,200);
 assert.ok((await(await shop(new Request(order.url))).text()).includes('Coffee'));
 assert.equal(data.get('piggy:stall:call_stall').products[0].name,'Coffee');
});
test('paid fulfillment is idempotent and produces working private storage capabilities',async()=>{
 const {createHmac}=await import('node:crypto'),{data}=setup();
 const store={get:async k=>data.get(k)??null,put:async(k,v)=>data.set(k,structuredClone(v)),list:async()=>({keys:[]})};
 const shop=makeShop({store,sell:(service,fn)=>async()=>Response.json(await fn({products:[{name:'Tea'}]},{amount:2,buyer:'buyer',call_id:'call_purchase'}))},'test_secret');
 const buy=()=>shop(new Request('https://test/api/village?service=product_storage',{method:'POST'}));
 const a=await(await buy()).json(),b=await(await buy()).json();assert.equal(a.access_token,b.access_token);
 assert.equal(a.access_token,createHmac('sha256','test_secret').update('village-storage:call_purchase:buyer').digest('hex'));
 const headers={Authorization:`Bearer ${a.access_token}`,'Content-Type':'application/json'};
 assert.equal((await shop(new Request(a.url,{method:'PUT',headers,body:JSON.stringify({products:[{name:'Coffee'}]})}))).status,200);
 assert.equal((await(await shop(new Request(a.url,{headers}))).json()).products[0].name,'Coffee');
 assert.equal((await(await buy()).json()).products[0].name,'Coffee');
});
