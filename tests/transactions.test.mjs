import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../lib/store.mjs';
import {RepairAgent} from '../lib/agent.mjs';
import {inventory,mapPages} from '../lib/adt.mjs';
import {fixtureFiles,fixtureGuidelines} from './fixtures.mjs';

async function scenario(actions,{failure=false,sourceOnly=false,critique='pass'}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'adt-transaction-')),store=new Store(root);await store.init();
  try{
    const p=await store.create(fixtureFiles());p.pages=await inventory(store,p);p.guidelines=fixtureGuidelines;p.guidelineRevision=1;p.pdf={hash:'source',pages:[{page:1,text:'A shared world',runs:[]},{page:2,text:'Your turn',runs:[]},{page:3,text:'A new lesson',runs:[]}]};mapPages(p);
    const original=p.revision,outputs=[],renders=[];let step=0;
    const ai={structured:async()=>({verdict:critique,sourceFidelity:4,visualFidelity:4,consistency:4,responsiveUsability:4,summary:'Fixture critique',issues:[]}),call:async(_p,_job,request)=>{const last=request.input.at(-1);if(last.type==='function_call_output')outputs.push(last.output);assert.ok(step<actions.length,'Agent requested an unexpected extra turn');const action=await actions[step]({p,store,outputs});return {output:[{type:'function_call',call_id:'test-'+step++,name:action.name,arguments:JSON.stringify(action.args)}]};}};
    const browser={render:async(_p,href,options)=>{renders.push({href,...options});return {report:{href,passed:!failure,activities:{status:'passed'}},image:Buffer.from('test-image')};},navigation:async()=>({status:'passed',rows:[]})};
    const agent=new RepairAgent({store,ai,browser,pdf:{image:async()=>Buffer.from('source-image')},progress:async()=>{}});
    const page=sourceOnly?{href:'source_3.html',section_id:'source_3',sourcePage:3,title:'New page'}:p.pages[0];
    const result=await agent.run(p,{settings:{model:'test',budget:20},cost:0},page,new AbortController().signal);
    return {p,original,result,outputs,renders};
  }finally{await fs.rm(root,{recursive:true,force:true});}
}
const action=(name,args)=>async()=>({name,args});
const source=action('read_pdf_page',{page:1});
const render=action('render_adt_page',{href:'pg001_sec001.html',width:1200});
const check=action('run_checks',{href:'pg001_sec001.html'});
const finish=decision=>action('finish_page',{decision,summary:'Inspected source and candidate.',issues:[]});
const patch=async({p})=>({name:'patch_project_files',args:{files:[{path:'pg001_sec001.html',expected_hash:p.files['pg001_sec001.html'],replacements:[{search:'class="broken"',replacement:'class="repaired"'}]}],reason:'Repair heading overflow.',source_pages:[1],removed_controls:[]}});

test('targeted file patches produce immutable versions and preserve the original',async()=>{
  const {p,original,result}=await scenario([source,patch,render,check,finish('edit')]);assert.equal(result.decision,'edit');assert.notEqual(p.revision,original);assert.equal(p.originalRevision,original);assert.equal(p.versions['pg001_sec001.html'].length,2);assert.equal(p.versions['pg001_sec001.html'][1].kind,'selected');
});
test('failed browser candidates stay in history without replacing the selected reader',async()=>{
  const {p,original,result}=await scenario([source,patch,render,check,finish('edit'),finish('review')],{failure:true});assert.equal(result.decision,'review');assert.equal(p.revision,original);assert.equal(p.versions['pg001_sec001.html'][1].kind,'candidate');
});
test('independent visual critique can reject an otherwise functional candidate',async()=>{
  const {p,original,result,outputs}=await scenario([source,patch,render,check,finish('edit'),finish('review')],{critique:'improve'});assert.equal(result.decision,'review');assert.equal(p.revision,original);assert.ok(outputs.some(o=>typeof o==='string'&&o.includes('needs another repair')));assert.equal(p.decisions['pg001_sec001.html'].critique.verdict,'improve');
});
test('activity removal without an existing replacement is rejected',async()=>{
  const remove=async({p,store})=>({name:'apply_project_edits',args:{edits:[{path:'pg001_sec001.html',expected_hash:p.files['pg001_sec001.html'],content:(await store.read(p,'pg001_sec001.html')).toString().replace('<textarea id="thoughts"></textarea>','')}],reason:'Test an invalid control removal.',source_pages:[1],removed_controls:[{id:'thoughts',reason:'Replacement claimed',retained_id:'nonexistent'}]}});
  const {p,original,outputs}=await scenario([source,remove,render,finish('review')]);assert.equal(p.revision,original);assert.ok(outputs.some(o=>typeof o==='string'&&o.includes('Control identity removed')));
});
test('source-only pages can be added to the reading order and versioned',async()=>{
  const create=async({p,store})=>({name:'apply_project_edits',args:{edits:[{path:'source_3.html',expected_hash:'',content:(await store.read(p,'pg002_sec001.html')).toString().replaceAll('Your turn','A new lesson').replaceAll('kindness','new-answer')}],reason:'Create an editable source page.',source_pages:[3],removed_controls:[]}});
  const order=async({p})=>({name:'change_reading_order',args:{entries:[...p.pages.map(s=>({section_id:s.section_id,href:s.href,source_page:s.sourcePage})),{section_id:'source_3',href:'source_3.html',source_page:3}],reason:'Add the source page to the reader.',source_pages:[3]}});
  const {p,result}=await scenario([action('read_pdf_page',{page:3}),create,order,action('render_adt_page',{href:'source_3.html',width:1200}),action('run_checks',{href:'source_3.html'}),finish('add')],{sourceOnly:true});assert.equal(result.decision,'add');assert.equal(p.pages.length,3);assert.ok(p.files['source_3.html']);assert.equal(p.original['source_3.html'],undefined);assert.equal(p.pages[2].sourcePage,3);assert.equal(p.pdf.pages[2].sectionHrefs[0],'source_3.html');
});
test('removing a page updates references and retains an archived original',async()=>{
  const updateLink=async({p})=>({name:'patch_project_files',args:{files:[{path:'pg002_sec001.html',expected_hash:p.files['pg002_sec001.html'],replacements:[{search:'href="pg001_sec001.html"',replacement:'href="index.html"'}]}],reason:'Update navigation after removing a duplicate.',source_pages:[1],removed_controls:[]}});
  const remove=action('change_reading_order',{entries:[{section_id:'pg002_sec001',href:'pg002_sec001.html',source_page:2}],reason:'Remove a source-unsupported duplicate.',source_pages:[1]});
  const {p,result,renders}=await scenario([source,updateLink,remove,check,finish('remove')]);assert.equal(result.decision,'remove');assert.equal(p.pages.length,1);assert.ok(!p.files['pg001_sec001.html']);assert.ok(p.original['pg001_sec001.html']);assert.equal(p.retiredPages[0].href,'pg001_sec001.html');assert.ok(renders.some(r=>r.href==='pg002_sec001.html'&&r.revision===p.revision));assert.ok(renders.filter(r=>r.revision===p.revision).every(r=>r.href==='pg002_sec001.html'));
});
