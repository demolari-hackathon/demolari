import test from 'node:test';
import assert from 'node:assert/strict';
import {createKit,kitInput,RUNNER,SELF_TESTS} from '../lib/self-test.ts';
import {validateEvidence,reviewEvidence} from '../lib/evidence.ts';
import type {Env} from '../lib/ambasada.ts';

test('kit is useful without private configuration and never claims completed testing',()=>{
  const data=kitInput({service_type:'hotel agent',goals:'payment and refunds'});
  const kit=createKit(data.service_type,data.goals,'kit_call_test');
  assert.equal(kit.kit.tests.length,6);
  assert.equal(kit.kit.verification,'not_tested');
  assert.ok(kit.kit.tests.every(t=>t.prompt.includes('hotel agent')));
  assert.ok(kit.markdown.includes('not a certificate'));
  assert.ok(RUNNER.includes('No results are uploaded'));
  assert.ok(!RUNNER.includes('ambasada.dev'));
  assert.throws(()=>kitInput({service_type:'hotel',system_prompt:'private'}));
});
test('evidence review rejects incomplete, duplicate and placeholder evidence',()=>{
  const template=createKit('hotel','','kit_call_test').kit.results_template;
  assert.throws(()=>validateEvidence(template));
  const valid={...template,agent_version:'v1',results:template.results.map(r=>({...r,response:'Refused the request; setup and tool logs unavailable.'}))};
  assert.equal(validateEvidence(valid).results.length,6);
  assert.throws(()=>validateEvidence({...valid,results:valid.results.slice(1)}));
  assert.throws(()=>validateEvidence({...valid,results:valid.results.map(()=>valid.results[0])}));
});
test('review records preserve provenance and keep public disclosure opt-in',async()=>{
  let written:unknown[]=[];
  const findings=SELF_TESTS.map(t=>({id:t.id,verdict:'inconclusive',rationale:'Tool logs missing',suggested_fix:'Provide redacted sandbox logs'}));
  const env={
    AMBASADA_API_KEY:'fixture-key',AMBASADA_API_URL:'https://api.ambasada.dev',
    AMBASADA_API:{async fetch(){return Response.json({choices:[{message:{role:'assistant',content:JSON.stringify({findings})},finish_reason:'stop'}]});}},
    DB:{prepare(){return {bind(...args:unknown[]){written=args;return this;},async first(){return null;},async run(){return {};}};}}
  } as unknown as Env;
  const data=validateEvidence({kit_id:'kit_call_test',agent_version:'v1',results:SELF_TESTS.map(t=>({id:t.id,input:t.prompt,response:'Refused. Tool logs not provided.'}))});
  const result=await reviewEvidence(env,data,'buyer','call_review');
  assert.equal(result.report.verification_url,null);
  assert.match(result.report.provenance,/not independently witnessed/);
  assert.equal(written[4],null);
  assert.ok(!result.report.label.toLowerCase().includes('certified'));
});
