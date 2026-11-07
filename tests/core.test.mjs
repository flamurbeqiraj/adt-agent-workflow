import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {zipSync} from 'fflate';
import {safePath,unpack,pack,sha} from '../lib/archive.mjs';
import {Store} from '../lib/store.mjs';
import {inventory,mapPages,structureChecks,synchronise} from '../lib/adt.mjs';
import {PDFService} from '../lib/pdf.mjs';
import {validateGuidelines,GUIDELINE_SCHEMA} from '../lib/jobs.mjs';
import {exportProject,restoreImportedHistory} from '../lib/export.mjs';
import {fixtureFiles,fixtureZIP,fixturePDF,fixtureGuidelines} from './fixtures.mjs';
import {runInNewContext} from 'node:vm';
import {preparePreviewScript} from '../lib/preview.mjs';

test('isolated preview exits SCORM discovery at a cross-origin parent without changing stored bytes',()=>{
  const code='function findAPI(win){while(win){if (win.API) return win.API;win=win.parent;}return null;}result=findAPI(window);',original=Buffer.from(code);
  const foreign={get API(){throw Error('Cross-origin parent');}},context={window:{parent:foreign}};
  runInNewContext(preparePreviewScript('assets/scorm.js',original).toString(),context);assert.equal(context.result,null);assert.equal(original.toString(),code);assert.equal(preparePreviewScript('other.js',original),original);
});

test('exported history round-trips without recursively embedding prior exports',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'adt-history-')),store=new Store(root);await store.init();
  try{const p=await store.create(fixtureFiles());p.pages=await inventory(store,p);p.guidelines=fixtureGuidelines;p.guidelineRevision=3;p.pdf={hash:sha(fixturePDF()),pages:[]};
    const original=p.originalRevision;let archive=(await exportProject(store,p)).archive;
    for(let i=0;i<3;i++){const imported=await store.create(unpack(archive));await restoreImportedHistory(store,imported);imported.pages=await inventory(store,imported);assert.equal(imported.originalRevision,original);assert.equal(imported.guidelines.title,fixtureGuidelines.title);assert.equal(imported.guidelineRevision,3);assert.equal(imported.expectedSourceHash,p.pdf.hash);assert.equal(Object.keys(imported.files).length,7);assert.ok(!Object.values(imported.revisions).some(map=>Object.keys(map).some(name=>name.startsWith('studio/history/'))));imported.pdf=p.pdf;archive=(await exportProject(store,imported)).archive;assert.ok(archive.length<20000);}
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('archive rejects traversal, Windows aliases, duplicate roots and decompression bombs',()=>{for(const name of ['../x','/root','C:/x','x\\y','a/../b','con.txt','x.','a//b'])assert.throws(()=>safePath(name));const bad=zipSync({'../x':Buffer.from('x'),'content/pages.json':Buffer.from('[]')});assert.throws(()=>unpack(bad),/Unsafe/);assert.throws(()=>unpack(pack({...fixtureFiles(),'other/content/pages.json':Buffer.from('[]')})),/Multiple/);const bomb=zipSync({...fixtureFiles(),'big.txt':new Uint8Array(20e6)});assert.throws(()=>unpack(bomb),/compressed/);assert.equal(Object.keys(unpack(fixtureZIP())).length,7);});
test('PDF evidence, many-section mapping, export integrity and immutable history',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'adt-core-'));const store=new Store(root);await store.init();const p=await store.create(fixtureFiles(),'Fixture');p.pages=await inventory(store,p);p.pdf={name:'source.pdf',hash:await store.blob(p,fixturePDF()),pages:[]};const pdf=new PDFService(store);await pdf.analyse(p);assert.equal(p.pdf.pages.length,2);assert.match(p.pdf.pages[0].text,/shared world/);assert.ok(p.pdf.pages[0].runs.length);assert.ok(p.pdf.pages.every(page=>page.width>0&&page.height>0));mapPages(p);assert.equal(p.pages[1].sourcePage,2);assert.ok((await structureChecks(store,p)).passed);const original=p.original['pg001_sec001.html'];const files={...p.files,'pg001_sec001.html':await store.blob(p,(await store.read(p,'pg001_sec001.html')).toString().replace('class="broken"','class="repaired"'))};await store.revision(p,files,{action:'Repair overflow'});assert.equal(p.original['pg001_sec001.html'],original);const result=await exportProject(store,p);assert.equal(result.report.status,'needs-review');assert.equal(result.evidence.runtimeFilesChecked,7);assert.equal(sha(unpack(result.archive)['pg001_sec001.html']),p.files['pg001_sec001.html']);const imported=await store.create(unpack(result.archive),'Reimport');await restoreImportedHistory(store,imported);assert.equal(imported.original['pg001_sec001.html'],original);assert.ok(Object.keys(imported.revisions).length>=2);await fs.rm(root,{recursive:true,force:true});});
test('guidelines carry editable page size and repair plan for later agents',()=>{assert.ok(GUIDELINE_SCHEMA.properties.pageSize);assert.ok(GUIDELINE_SCHEMA.properties.repairPlan);assert.equal(validateGuidelines(fixtureGuidelines),fixtureGuidelines);assert.throws(()=>validateGuidelines({...fixtureGuidelines,pageSize:42}),/pageSize/);});
test('existing book usage keeps its last run and earlier spending after migration',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'adt-spending-'));try{const store=new Store(root);await store.init();const p=await store.create(fixtureFiles());p.usage={input:900,output:100,cost:1.75,calls:4};p.job={id:'old-run',type:'repair',status:'paused',startedAt:'2026-11-06T10:00:00.000Z',settings:{model:'gpt-6.1-sol',budget:5,hrefs:['pg001_sec001.html']},cost:.5,calls:2,completed:[],total:1};delete p.spending;await store.save(p);const reopened=new Store(root);await reopened.init();const restored=reopened.get(p.id);assert.equal(restored.spending.length,1);assert.equal(restored.spending[0].cost,.5);assert.equal(restored.spending[0].model,'gpt-6.1-sol');assert.equal(restored.usage.cost-restored.spending[0].cost,1.25);}finally{await fs.rm(root,{recursive:true,force:true});}});
test('stale offline caches are identified and synchronised',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'adt-cache-')),store=new Store(root);await store.init();const files=fixtureFiles();files['assets/offline-preloader.js']=Buffer.from('var INLINE = '+JSON.stringify({'pg001_sec001.html':'stale'})+';');const p=await store.create(files);assert.ok((await structureChecks(store,p)).errors.some(e=>e.kind==='cache'));await synchronise(store,p,p.files);assert.ok((await structureChecks(store,p)).passed);await fs.rm(root,{recursive:true,force:true});});
