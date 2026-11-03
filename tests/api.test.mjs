import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {OpenAIClient} from '../lib/openai.mjs';
import {Jobs,recoverPageObservation} from '../lib/jobs.mjs';
import {Store} from '../lib/store.mjs';
import {fixtureFiles} from './fixtures.mjs';
import {fixtureZIP,fixturePDF,fixtureGuidelines} from './fixtures.mjs';

test('local API separates preview origin, guards mutations, persists guides, and exports safe snapshots',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'adt-api-'));const app=await createApp({port:8898,previewPort:8899,workspace});
  try{const origin=app.origin,session=await(await fetch(origin+'/api/session')).json(),headers={'X-Studio-Token':session.token};
    assert.equal((await fetch(origin+'/api/projects',{method:'POST',body:fixtureZIP()})).status,403);
    assert.equal((await fetch(origin+'/api/session',{headers:{Origin:app.previewOrigin}})).status,403);
    const p=await(await fetch(origin+'/api/projects?name=fixture.zip',{method:'POST',headers,body:fixtureZIP()})).json();assert.equal(p.pages.length,2);
    const upload=await fetch(origin+'/api/projects/'+p.id+'/pdf?name=source.pdf',{method:'PUT',headers,body:fixturePDF()});assert.equal(upload.status,200);
    const guide=await(await fetch(origin+'/api/projects/'+p.id+'/guidelines',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(fixtureGuidelines)})).json();assert.equal(guide.guidelineRevision,1);
    assert.equal((await fetch(origin+'/api/projects/'+p.id+'/file?path=..%2Fsecret')).status,400);
    const preview=await fetch(app.previewOrigin+'/book/'+p.id+'/'+p.revision+'/pg001_sec001.html');assert.equal(preview.status,200);assert.match(preview.headers.get('Content-Security-Policy'),/connect-src 'self'/);assert.ok(!(await preview.text()).includes(session.token));
    const report=await(await fetch(origin+'/api/projects/'+p.id+'/report')).json();assert.equal(report.pdf.pages.length,0);assert.ok(!JSON.stringify(report).includes(session.token));
    const zip=await fetch(origin+'/api/projects/'+p.id+'/export');assert.equal(zip.status,200);assert.equal(zip.headers.get('X-Export-Status'),'needs-review');
    await app.store.save(app.store.get(p.id));const onDisk=JSON.parse(await fs.readFile(path.join(workspace,'projects',p.id,'project.json'),'utf8'));assert.equal(onDisk.guidelines.headingFont,'Helvetica');
  }finally{await app.close();await fs.rm(workspace,{recursive:true,force:true});}
});
test('OpenAI spending guard stops before a request and records usage without storing credentials',async()=>{
  let calls=0;const ai=new OpenAIClient({transport:async()=>{calls++;return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:25},output:[]}));}});ai.key='sk-test-12345678901234567890';const p={usage:{input:0,output:0,cost:0,calls:0}},job={cost:0,calls:0,settings:{model:'gpt-6.1-sol',budget:.001}};
  await assert.rejects(ai.call(p,job,{input:[{role:'user',content:'test'}],instructions:'test',maxTokens:10000}),/Spend limit/);assert.equal(calls,0);job.settings.budget=1;await ai.call(p,job,{input:[{role:'user',content:'test'}],instructions:'test',maxTokens:100});assert.equal(calls,1);assert.equal(p.usage.input,100);assert.equal(job.calls,1);assert.ok(job.cost>0);assert.ok(!JSON.stringify({p,job}).includes(ai.key));ai.disconnect();await assert.rejects(ai.call(p,job,{input:[],instructions:'test'}),/Connect/);
});

test('an opted-in key survives a server restart and Disconnect removes it', {skip:process.platform!=='win32'},async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'adt-key-'));
  const key='sk-test-credential-1234567890123456';
  const fake=()=>new OpenAIClient({transport:async()=>new Response('{}',{status:200})});
  let app;
  try{
    app=await createApp({port:8902,previewPort:8903,workspace,ai:fake()});
    let session=await(await fetch(app.origin+'/api/session')).json();
    assert.equal(session.connected,false);
    const connect=await fetch(app.origin+'/api/key',{method:'POST',headers:{'X-Studio-Token':session.token,'Content-Type':'application/json'},body:JSON.stringify({key,model:'gpt-6.1-sol',remember:true})});
    assert.equal(connect.status,200);
    await app.close();app=null;
    app=await createApp({port:8902,previewPort:8903,workspace,ai:fake()});
    session=await(await fetch(app.origin+'/api/session')).json();
    assert.equal(session.connected,true);assert.equal(session.remembered,true);
    assert.equal(app.ai.key,key);
    const disconnected=await fetch(app.origin+'/api/key',{method:'DELETE',headers:{'X-Studio-Token':session.token}});
    assert.equal(disconnected.status,200);
    await app.close();app=null;
    app=await createApp({port:8902,previewPort:8903,workspace,ai:fake()});
    session=await(await fetch(app.origin+'/api/session')).json();
    assert.equal(session.connected,false);assert.equal(session.remembered,false);
    assert.ok(!(await fs.readdir(workspace)).some(name=>name.includes('openai-key')));
  }finally{await app?.close();await fs.rm(workspace,{recursive:true,force:true});}
});
test('page analysis recovers a complete section assessment followed by whitespace until the token cap',async()=>{
  const prefix='{"summary":"Eight prompts match","pageType":"worksheet","sections":[{"href":"pg010_sec001.html","action":"edit","confidence":0.99,"issues":["Layout differs"],"evidence":"The controls sit beside the butterfly"}]';
  const response={status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:100,output_tokens:4500},output:[{type:'message',content:[{type:'output_text',text:prefix+' \n '.repeat(500)}]}]};
  const ai=new OpenAIClient({transport:async()=>new Response(JSON.stringify(response))});ai.key='sk-test-12345678901234567890';const p={usage:{input:0,output:0,cost:0,calls:0}},job={cost:0,calls:0,settings:{model:'gpt-6.1-sol',budget:1}};
  const result=await ai.structured(p,job,{input:[{role:'user',content:'page 10'}],instructions:'Compare',maxTokens:4500,recoverIncomplete:(text,r)=>recoverPageObservation(text,r,1)});
  assert.equal(result.sections[0].href,'pg010_sec001.html');assert.equal(result.sourceOnlyNote,'');assert.equal(job.calls,1);
  assert.equal(recoverPageObservation(prefix+' \n ',{incomplete_details:{reason:'max_output_tokens'}},0),undefined);
  assert.equal(recoverPageObservation(prefix.slice(0,-5),{incomplete_details:{reason:'max_output_tokens'}},1),undefined);
  await assert.rejects(ai.structured(p,job,{input:[],instructions:'Compare',maxTokens:4500}),/incomplete/);
});
test('resume rejects changed inputs without losing the paused checkpoint',()=>{
  const jobs=new Jobs({ai:{key:'test'},store:{}}),p={id:'test',revision:'new-revision',pdf:{hash:'source',pages:[]},pages:[],guidelines:fixtureGuidelines,guidelineRevision:1,job:{type:'repair',status:'paused',expectedRevision:'old-revision',sourceHash:'source',guidelineRevision:1,mappingRevision:0}};
  assert.throws(()=>jobs.start(p,'repair',{},true),/selected project changed/);assert.equal(p.job.status,'paused');p.revision='old-revision';p.mappingRevision=1;assert.throws(()=>jobs.start(p,'repair',{},true),/mappings changed/);assert.equal(p.job.status,'paused');p.mappingRevision=0;p.guidelineRevision=2;assert.throws(()=>jobs.start(p,'repair',{},true),/Guidelines changed/);assert.equal(p.job.status,'paused');
});

test('a completed guideline response is recovered without another model call',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'adt-recover-')),store=new Store(path.join(workspace,'projects'));await store.init();
  let app;
  try{
    const p=await store.create(fixtureFiles(),'Recovered book'),colors=Array.from({length:17},(_,i)=>({name:'Source color '+i,color:'#'+i.toString(16).padStart(6,'0')}));
    p.pdf={hash:'source-hash',pages:[{page:1}]};p.stage=2;
    p.job={id:'11111111-1111-4111-8111-111111111111',type:'guidelines',status:'paused',error:'Choose up to 12 valid palette colors.',sourceHash:p.pdf.hash,expectedRevision:p.revision,guidelineRevision:0,settings:{model:'gpt-6.1-sol'},calls:1,cost:.1,events:[]};
    await store.save(p);
    await store.evidence(p,`traces/${p.job.id}/0001.json`,JSON.stringify({request:{model:'gpt-6.1-sol',text:{format:{name:'book_guidelines'}}},response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...fixtureGuidelines,palette:colors,rules:Array.from({length:32},(_,i)=>'Source rule '+i)})}]}]}}));
    app=await createApp({port:8894,previewPort:8895,workspace,ai:new OpenAIClient({transport:()=>{throw Error('Unexpected model call');}})});
    const recovered=app.store.get(p.id);assert.equal(recovered.job.status,'completed');assert.equal(recovered.job.calls,1);assert.equal(recovered.job.recoveredFromTrace,true);assert.equal(recovered.guidelineRevision,1);assert.equal(recovered.guidelines.palette.length,17);assert.equal(recovered.guidelines.rules.length,32);
    const summary=await(await fetch(app.origin+'/api/projects/'+p.id)).json();assert.equal(summary.job.message,'Guidelines ready');assert.equal(summary.stage,3);
  }finally{await app?.close();await fs.rm(workspace,{recursive:true,force:true});}
});
