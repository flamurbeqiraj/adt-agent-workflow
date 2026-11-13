import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {OpenAIClient} from '../lib/openai.mjs';
import {Jobs,recoverPageObservation} from '../lib/jobs.mjs';
import {Store} from '../lib/store.mjs';
import {sha,unpack} from '../lib/archive.mjs';
import {invalidateChangedReviews} from '../lib/review.mjs';
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
    const report=await(await fetch(origin+'/api/projects/'+p.id+'/report')).json();assert.equal(report.inventory.original.counts.screens,2);assert.equal(report.inventory.final.counts.screens,2);assert.ok(Array.isArray(report.sourceToFinalScreens));assert.ok(!JSON.stringify(report).includes(session.token));
    const zip=await fetch(origin+'/api/projects/'+p.id+'/export');assert.equal(zip.status,200);assert.equal(zip.headers.get('X-Export-Status'),'needs-review');
    await fetch(origin+'/api/projects/'+p.id+'/review',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({href:p.pages[0].href,approved:true})});
    const saved=await fetch(origin+'/api/projects/'+p.id+'/export');
    const imported=await(await fetch(origin+'/api/projects?name=reviewed.zip',{method:'POST',headers,body:Buffer.from(await saved.arrayBuffer())})).json();
    const reopened=await(await fetch(origin+'/api/projects/'+imported.id+'/pdf?name=source.pdf',{method:'PUT',headers,body:fixturePDF()})).json();
    assert.equal(reopened.decisions[p.pages[0].href].humanReviewed,true);
    await app.store.save(app.store.get(p.id));const onDisk=JSON.parse(await fs.readFile(path.join(workspace,'projects',p.id,'project.json'),'utf8'));assert.equal(onDisk.guidelines.headingFont,'Helvetica');
  }finally{await app.close();await fs.rm(workspace,{recursive:true,force:true});}
});
test('books can be deleted without affecting other books, but not during an active task',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'adt-delete-')),app=await createApp({port:8902,previewPort:8903,workspace});
  try{const session=await(await fetch(app.origin+'/api/session')).json(),headers={'X-Studio-Token':session.token};
    const first=await(await fetch(app.origin+'/api/projects?name=first.zip',{method:'POST',headers,body:fixtureZIP()})).json();
    const second=await(await fetch(app.origin+'/api/projects?name=second.zip',{method:'POST',headers,body:fixtureZIP()})).json();
    const endpoint=app.origin+'/api/projects/'+first.id;
    assert.equal((await fetch(endpoint,{method:'DELETE'})).status,403);
    app.jobs.active.set(first.id,new AbortController());
    assert.equal((await fetch(endpoint,{method:'DELETE',headers})).status,409);
    app.jobs.active.delete(first.id);
    assert.equal((await fetch(endpoint,{method:'DELETE',headers})).status,200);
    assert.equal((await fetch(endpoint)).status,404);
    await assert.rejects(fs.stat(path.join(workspace,'projects',first.id)),{code:'ENOENT'});
    assert.equal((await fetch(app.origin+'/api/projects/'+second.id)).status,200);
    assert.deepEqual((await(await fetch(app.origin+'/api/projects')).json()).map(p=>p.id),[second.id]);
  }finally{await app.close();await fs.rm(workspace,{recursive:true,force:true});}
});

test('approving a previewed version selects the exact page exported',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'adt-reviewed-export-'));
  const app=await createApp({port:8912,previewPort:8913,workspace});
  try{
    const session=await(await fetch(app.origin+'/api/session')).json(),headers={'X-Studio-Token':session.token,'Content-Type':'application/json'};
    const created=await(await fetch(app.origin+'/api/projects?name=fixture.zip',{method:'POST',headers,body:fixtureZIP()})).json();
    const p=app.store.get(created.id),href=p.pages[0].href,otherHref=p.pages[1].href,original=(await app.store.read(p,href)).toString(),otherOriginal=(await app.store.read(p,otherHref)).toString();
    const updated=original.replace('class="broken"','class="reviewed"');
    const files={...p.files,[href]:await app.store.blob(p,updated),[otherHref]:await app.store.blob(p,otherOriginal.replace('Your turn','Another version'))},revision=sha(JSON.stringify(files)).slice(0,20);
    p.revisions[revision]=files;
    p.versions[href]=[{id:'candidate-1',href,revision,baseRevision:p.revision,kind:'candidate',label:'Reviewed candidate',changed:[href,otherHref]}];
    await app.store.save(p);
    const otherReview=await fetch(app.origin+'/api/projects/'+p.id+'/review',{method:'PUT',headers,body:JSON.stringify({href:otherHref,approved:true})});
    assert.equal(otherReview.status,200);
    const currentReview=await fetch(app.origin+'/api/projects/'+p.id+'/review',{method:'PUT',headers,body:JSON.stringify({href,approved:true})});
    assert.equal(currentReview.status,200);
    assert.equal((await currentReview.json()).revision,created.revision);
    const response=await fetch(app.origin+'/api/projects/'+p.id+'/review',{method:'PUT',headers,body:JSON.stringify({href,approved:true,versionId:'candidate-1',previewRevision:revision})});
    assert.equal(response.status,200);
    const reviewed=await response.json();
    assert.equal(reviewed.decisions[href].humanReviewed,true);
    assert.equal(reviewed.selectedVersions[href],'candidate-1');
    assert.equal(reviewed.decisions[href].reviewedVersionId,'candidate-1');
    assert.equal(reviewed.decisions[href].reviewedPageSHA256,files[href]);
    assert.equal(reviewed.decisions[otherHref].humanReviewed,true);
    assert.equal(p.files[otherHref],p.original[otherHref]);
    assert.notEqual(reviewed.revision,created.revision);
    const exported=await fetch(app.origin+'/api/projects/'+p.id+'/export');
    assert.equal(exported.status,200);
    const archive=unpack(Buffer.from(await exported.arrayBuffer()));
    assert.equal(archive[href].toString(),updated);
    assert.equal(archive[otherHref].toString(),otherOriginal);
    assert.equal(JSON.parse(archive['studio/review-report.json']).decisions[href].humanReviewed,true);
    assert.equal(sha(archive[href]),reviewed.decisions[href].reviewedPageSHA256);
  }finally{await app.close();await fs.rm(workspace,{recursive:true,force:true});}
});

test('selecting a saved page keeps later generated manifest changes',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'adt-version-merge-'));
  const app=await createApp({port:8914,previewPort:8915,workspace});
  try{
    const session=await(await fetch(app.origin+'/api/session')).json(),headers={'X-Studio-Token':session.token,'Content-Type':'application/json'};
    const created=await(await fetch(app.origin+'/api/projects?name=fixture.zip',{method:'POST',headers,body:fixtureZIP()})).json();
    const p=app.store.get(created.id),href=p.pages[0].href,original=(await app.store.read(p,href)).toString();
    const other=(await app.store.read(p,p.pages[1].href)).toString(),cache=prefix=>`${prefix}var INLINE = ${JSON.stringify({[href]:original,[p.pages[1].href]:other})};`;
    const initialManifest=await app.store.blob(p,'<manifest><resource></resource></manifest>');
    p.files['imsmanifest.xml']=initialManifest;
    p.files['assets/offline-preloader.js']=await app.store.blob(p,cache(''));
    const baseRevision=sha(JSON.stringify(p.files)).slice(0,20);
    p.revision=baseRevision;p.revisions[baseRevision]={...p.files};
    const candidateManifest=await app.store.blob(p,'<manifest><resource><file href="pg001_sec001.html"/></resource></manifest>');
    const updated=original.replace('class="broken"','class="reviewed"');
    const candidateFiles={...p.files,[href]:await app.store.blob(p,updated),'imsmanifest.xml':candidateManifest,'assets/offline-preloader.js':await app.store.blob(p,cache('/* candidate */')),'assets/book.js':await app.store.blob(p,'/* candidate shared code */')};
    const candidateRevision=sha(JSON.stringify(candidateFiles)).slice(0,20);
    p.revisions[candidateRevision]=candidateFiles;
    p.versions[href]=[{id:'candidate-with-manifest',href,revision:candidateRevision,baseRevision,kind:'candidate',label:'Reviewed candidate',changed:[href,'imsmanifest.xml','assets/offline-preloader.js','assets/book.js']}];
    p.files['imsmanifest.xml']=await app.store.blob(p,'<manifest><resource><file href="pg002_sec001.html"/></resource></manifest>');
    p.files['assets/offline-preloader.js']=await app.store.blob(p,cache('/* later */'));
    p.files['assets/book.js']=await app.store.blob(p,'/* later shared code */');
    p.revision=sha(JSON.stringify(p.files)).slice(0,20);p.revisions[p.revision]={...p.files};
    await app.store.save(p);
    const response=await fetch(app.origin+'/api/projects/'+p.id+'/review',{method:'PUT',headers,body:JSON.stringify({href,approved:true,versionId:'candidate-with-manifest'})});
    assert.equal(response.status,200,await response.text());
    assert.equal(p.decisions[href].reviewedVersionId,'candidate-with-manifest');
    assert.equal((await app.store.read(p,href)).toString(),updated);
    assert.match((await app.store.read(p,'imsmanifest.xml')).toString(),/pg002_sec001\.html/);
    assert.match((await app.store.read(p,'assets/offline-preloader.js')).toString(),/\/\* later \*\//);
    assert.equal((await app.store.read(p,'assets/book.js')).toString(),'/* later shared code */');
  }finally{await app.close();await fs.rm(workspace,{recursive:true,force:true});}
});

test('batch selection keeps later shared code, restores reviews, and reports broken candidates',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'adt-latest-batch-'));
  const app=await createApp({port:8916,previewPort:8917,workspace});
  try{
    const session=await(await fetch(app.origin+'/api/session')).json(),headers={'X-Studio-Token':session.token,'Content-Type':'application/json'};
    const created=await(await fetch(app.origin+'/api/projects?name=fixture.zip',{method:'POST',headers,body:fixtureZIP()})).json();
    const p=app.store.get(created.id),first=p.pages[0].href,second=p.pages[1].href;
    const firstHtml=(await app.store.read(p,first)).toString(),secondHtml=(await app.store.read(p,second)).toString(),shared=p.files['assets/book.js'];
    const firstCandidate=firstHtml.replace('class="broken"','class="reviewed"');
    const firstMap={...p.files,[first]:await app.store.blob(p,firstCandidate),'assets/book.js':await app.store.blob(p,'/* older shared code */')};
    const firstRevision=sha(JSON.stringify(firstMap)).slice(0,20);p.revisions[firstRevision]=firstMap;
    p.versions[first]=[{id:'latest-first',href:first,revision:firstRevision,baseRevision:p.revision,kind:'candidate',changed:[first,'assets/book.js']}];
    const secondMap={...p.files,[second]:await app.store.blob(p,secondHtml.replace('pg001_sec001.html','missing.html'))};
    const secondRevision=sha(JSON.stringify(secondMap)).slice(0,20);p.revisions[secondRevision]=secondMap;
    p.versions[second]=[{id:'latest-second',href:second,revision:secondRevision,baseRevision:p.revision,kind:'candidate',changed:[second]}];
    p.decisions[first]={humanReviewed:false,reviewedRevision:p.revision};p.decisions[second]={humanReviewed:false,reviewedRevision:p.revision};
    p.files['assets/book.js']=await app.store.blob(p,'/* later shared code */');
    p.revision=sha(JSON.stringify(p.files)).slice(0,20);p.revisions[p.revision]={...p.files};await app.store.save(p);
    const response=await fetch(app.origin+'/api/projects/'+p.id+'/latest-versions',{method:'POST',headers,body:JSON.stringify({revision:p.revision})});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.deepEqual(result.applied.map(row=>row.href),[first]);
    assert.deepEqual(result.skipped.map(row=>row.href),[second]);
    assert.deepEqual(result.preservedSharedFiles,['assets/book.js']);
    assert.equal(result.restoredReviews,2);
    assert.equal(result.project.pages.length,2);
    assert.equal(result.project.selectedVersions[first],'latest-first');
    assert.ok(result.project.pages.every(page=>result.project.decisions[page.href].humanReviewed));
    assert.equal((await app.store.read(p,'assets/book.js')).toString(),'/* later shared code */');
    assert.notEqual(p.files['assets/book.js'],shared);
    const exportedBytes=Buffer.from(await(await fetch(app.origin+'/api/projects/'+p.id+'/export')).arrayBuffer()),archive=unpack(exportedBytes);
    assert.equal(archive[first].toString(),firstCandidate);
    assert.equal(archive[second].toString(),secondHtml);
    const reimported=await(await fetch(app.origin+'/api/projects?name=batch-export.zip',{method:'POST',headers,body:exportedBytes})).json();
    assert.equal(reimported.selectedVersions[first],'latest-first');
    assert.deepEqual(reimported.latestSelection.skipped.map(row=>row.href),[second]);
    assert.ok(reimported.pages.every(page=>reimported.decisions[page.href].humanReviewed));
  }finally{await app.close();await fs.rm(workspace,{recursive:true,force:true});}
});

test('manual New ADT page edits preserve review marks across page changes and restart',async()=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'adt-manual-'));let app=await createApp({port:8910,previewPort:8911,workspace});
  try{
    const session=await(await fetch(app.origin+'/api/session')).json(),headers={'X-Studio-Token':session.token,'Content-Type':'application/json'};
    let project=await(await fetch(app.origin+'/api/projects?name=fixture.zip',{method:'POST',headers,body:fixtureZIP()})).json();
    project=await(await fetch(app.origin+'/api/projects/'+project.id+'/pdf?name=source.pdf',{method:'PUT',headers,body:fixturePDF()})).json();
    app.jobs.start(app.store.get(project.id),'inventory');
    while(app.store.get(project.id).job.status==='running'||app.jobs.active.has(project.id))await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(app.store.get(project.id).job.status,'completed');
    project=await(await fetch(app.origin+'/api/projects/'+project.id)).json();
    for(const page of project.pages)project=await(await fetch(app.origin+'/api/projects/'+project.id+'/review',{method:'PUT',headers,body:JSON.stringify({href:page.href,approved:true})})).json();
    const edit=async(action,href,revision=project.revision)=>{
      const response=await fetch(app.origin+'/api/projects/'+project.id+'/pages',{method:'POST',headers,body:JSON.stringify({action,href,revision})});
      const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));project=result;return project;
    };
    const first=project.pages[0].href;
    await edit('add',first);
    const added=project.selected;
    assert.equal(project.pages[1].href,added);assert.equal(project.pages[1].sourcePage,1);
    assert.match((await app.store.read(app.store.get(project.id),added)).toString(),/Regenerate this page/);
    assert.match((await app.store.read(app.store.get(project.id),first)).toString(),new RegExp(`href="${added}"[^>]*>Next`));
    assert.deepEqual(JSON.parse((await app.store.read(app.store.get(project.id),'content/toc.json')).toString()).map(item=>item.href),project.pages.map(item=>item.href));
    assert.equal((await fetch(app.origin+'/api/projects/'+project.id+'/pages',{method:'POST',headers,body:JSON.stringify({action:'remove',href:added,revision:'stale'})})).status,409);
    await edit('up',added);assert.equal(project.pages[0].href,added);
    await edit('down',added);assert.equal(project.pages[1].href,added);
    await edit('remove',added);assert.equal(project.pages.length,2);assert.ok(project.retiredPages.some(page=>page.href===added));
    assert.equal((await app.store.read(app.store.get(project.id),'content/pages.json')).toString().includes(added),false);
    const firstHtml=(await app.store.read(app.store.get(project.id),first)).toString();
    assert.match(firstHtml,/href="pg002_sec001.html"[^>]*>Next/);
    assert.ok(project.pages.every(page=>project.decisions[page.href].humanReviewed));
    await app.close();app=await createApp({port:8910,previewPort:8911,workspace});
    const reopened=await(await fetch(app.origin+'/api/projects/'+project.id)).json();
    assert.ok(reopened.pages.every(page=>reopened.decisions[page.href].humanReviewed));
  }finally{await app?.close();await fs.rm(workspace,{recursive:true,force:true});}
});

test('content edits clear only affected review marks, while shared style edits clear all',()=>{
  const project={pages:[{href:'one.html'},{href:'two.html'}],decisions:{'one.html':{humanReviewed:true},'two.html':{humanReviewed:true}}};
  const before={'one.html':'a','two.html':'b','book.css':'c'};
  invalidateChangedReviews(project,before,{...before,'one.html':'updated'});
  assert.equal(project.decisions['one.html'].humanReviewed,false);
  assert.equal(project.decisions['two.html'].humanReviewed,true);
  invalidateChangedReviews(project,before,{...before,'book.css':'updated'});
  assert.equal(project.decisions['two.html'].humanReviewed,false);
});
test('OpenAI spending guard stops before a request and records usage without storing credentials',async()=>{
  let calls=0;const ai=new OpenAIClient({transport:async()=>{calls++;return new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:25},output:[]}));}});ai.key='sk-test-12345678901234567890';const p={usage:{input:0,output:0,cost:0,calls:0}},job={cost:0,calls:0,settings:{model:'gpt-6.1-sol',budget:.001}};
  await assert.rejects(ai.call(p,job,{input:[{role:'user',content:'test'}],instructions:'test',maxTokens:10000}),/Spend limit/);assert.equal(calls,0);job.settings.budget=1;await ai.call(p,job,{input:[{role:'user',content:'test'}],instructions:'test',maxTokens:100});const solCost=job.cost;job.settings.model='gpt-6-luna';await ai.call(p,job,{input:[{role:'user',content:'test'}],instructions:'test',maxTokens:100});assert.equal(calls,2);assert.equal(p.usage.input,200);assert.equal(job.calls,2);assert.ok(solCost>0);assert.equal(job.modelCosts['gpt-6.1-sol'],solCost);assert.ok(Math.abs(job.modelCosts['gpt-6-luna']-(job.cost-solCost))<1e-12);assert.ok(!JSON.stringify({p,job}).includes(ai.key));ai.disconnect();await assert.rejects(ai.call(p,job,{input:[],instructions:'test'}),/Connect/);
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
