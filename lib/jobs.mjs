import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {object,string,number,array,enumOf,referenceGuard,MODELS} from './openai.mjs';
import {inventory,mapPages,structureChecks} from './adt.mjs';
import {RepairAgent} from './agent.mjs';

export const GUIDELINE_SCHEMA=object({title:string,palette:array(object({name:string,color:string})),headingFont:string,bodyFont:string,typography:string,layout:string,spacing:string,artwork:string,activities:string,rules:array(string),families:array(object({name:string,description:string})),uncertainties:array(string)});
const OBSERVATION_SCHEMA=object({sourceOnlyNote:string,summary:string,pageType:string,sections:array(object({href:string,action:enumOf('keep','edit','review'),confidence:number,issues:array(string),evidence:string}))});
export function recoverPageObservation(text,response,sectionCount){
  if(response.incomplete_details?.reason!=='max_output_tokens')return;
  const prefix=text.trimEnd();
  if(!prefix.startsWith('{'))return;
  try{return JSON.parse(prefix);}catch{}
  if(sectionCount<1||!prefix.endsWith(']')||prefix.includes('"sourceOnlyNote"'))return;
  try{
    const result=JSON.parse(prefix+',"sourceOnlyNote":""}');
    if(typeof result.summary==='string'&&typeof result.pageType==='string'&&Array.isArray(result.sections)&&result.sections.length===sectionCount)return result;
  }catch{}
}
export function validateGuidelines(g){if(!g||typeof g!=='object')throw Error('Invalid guidelines.');for(const key of ['title','headingFont','bodyFont','typography','layout','spacing','artwork','activities'])if(typeof g[key]!=='string'||g[key].length>5000)throw Error('Invalid guideline field: '+key);if(!Array.isArray(g.palette)||g.palette.length>32||g.palette.some(c=>typeof c.name!=='string'||c.name.length>200||!/^#[a-f0-9]{6}$/i.test(c.color)))throw Error('Guidelines need up to 32 named colors in #RRGGBB format.');if(!Array.isArray(g.rules)||g.rules.length>100||g.rules.some(r=>typeof r!=='string'||r.length>2000))throw Error('Guidelines need up to 100 short book rules.');if(!Array.isArray(g.families)||g.families.length>40||g.families.some(r=>typeof r.name!=='string'||typeof r.description!=='string'))throw Error('Invalid page families.');if(!Array.isArray(g.uncertainties))throw Error('Invalid review notes.');return g;}
export class Jobs {
  constructor({store,pdf,browser,ai}){Object.assign(this,{store,pdf,browser,ai});this.active=new Map();}
  async recoverCompletedGuidelines(){
    for(const p of this.store.projects.values()){
      const job=p.job;
      if(job?.type!=='guidelines'||job.status!=='paused'||p.guidelines||job.sourceHash!==p.pdf?.hash||job.expectedRevision!==p.revision||job.guidelineRevision!==p.guidelineRevision)continue;
      const folder=path.join(this.store.dir(p.id),'evidence','traces',job.id);
      let names;try{names=(await fs.readdir(folder)).filter(name=>/^\d{4}\.json$/.test(name)).sort().reverse();}catch{continue;}
      for(const name of names){
        try{
          const trace=JSON.parse(await fs.readFile(path.join(folder,name),'utf8'));
          if(trace.request?.model!==job.settings.model||trace.request?.text?.format?.name!=='book_guidelines'||trace.response?.status!=='completed')continue;
          const answer=trace.response.output?.flatMap(item=>item.content||[]).find(item=>item.type==='output_text')?.text;
          const guidelines=validateGuidelines(JSON.parse(answer));
          p.guidelines=guidelines;p.guidelineRevision++;p.stage=Math.max(p.stage,3);
          job.completed=['guidelines'];job.total=1;job.progress=1;job.status='completed';job.phase='ready';job.message='Guidelines ready';job.finishedAt=new Date().toISOString();job.recoveredFromTrace=true;delete job.error;
          job.events.push({at:job.finishedAt,message:'Guidelines ready from saved model response',phase:'ready',href:null});
          await this.store.save(p);break;
        }catch{continue;}
      }
    }
  }
  async progress(p,job,message,details={}){job.message=message;Object.assign(job,details);job.events.push({at:new Date().toISOString(),message,phase:job.phase,href:details.href||null});job.events=job.events.slice(-120);await this.store.save(p);}
  start(p,type,settings={},resume=false){if(this.active.has(p.id))throw Error('A task is already running.');if(!['inventory','analyse','guidelines','repair','verify'].includes(type))throw Error('Unknown workflow step.');if(!p.pdf&&type!=='verify')throw Error('Add the original PDF first.');if(['analyse','guidelines','repair'].includes(type)&&!this.ai.key)throw Error('Connect your OpenAI key to continue.');
    const config={model:settings.model||'gpt-6.1-sol',effort:'high',budget:Number(settings.budget??20),instructions:String(settings.instructions||'').slice(0,6000),hrefs:settings.hrefs||null,sourcePages:settings.sourcePages||[]};if(!MODELS[config.model]||!Number.isFinite(config.budget)||config.budget<1||config.budget>500)throw Error('Choose a model and a run budget from $1 to $500.');if(config.hrefs&&(!Array.isArray(config.hrefs)||config.hrefs.some(h=>!p.pages.some(s=>s.href===h))))throw Error('Unknown page selection.');if(!Array.isArray(config.sourcePages)||config.sourcePages.some(n=>!p.pdf?.pages.some(s=>s.page===n&&!s.sectionHrefs.length)))throw Error('Choose source-only PDF pages.');if(type==='repair'&&!p.guidelines)throw Error('Generate or save your book guidelines first.');
    const job=resume?p.job:{id:randomUUID(),type,status:'running',phase:type,message:'Starting',completed:[],progress:0,total:0,cost:0,calls:0,settings:config,events:[],startedAt:new Date().toISOString(),sourceHash:p.pdf?.hash,guidelineRevision:p.guidelineRevision,mappingRevision:p.mappingRevision||0,expectedRevision:p.revision};if(resume){if(job.expectedRevision&&job.expectedRevision!==p.revision)throw Error('The selected project changed; start a new run.');if((job.mappingRevision||0)!==(p.mappingRevision||0))throw Error('Source mappings changed; start a new run.');if(job.sourceHash!==p.pdf?.hash)throw Error('The source changed; start a new run.');if(job.type==='repair'&&job.guidelineRevision!==p.guidelineRevision)throw Error('Guidelines changed; start a new repair run.');job.settings={...job.settings,...config};job.status='running';delete job.error;}
    p.job=job;const controller=new AbortController();this.active.set(p.id,controller);this.store.save(p).then(()=>this.execute(p,job,controller.signal)).then(async()=>{job.status='completed';job.progress=job.total;job.finishedAt=new Date().toISOString();await this.progress(p,job,'Ready for the next step');}).catch(async e=>{job.status='paused';job.error=controller.signal.aborted?'Paused by you.':e.message;await this.progress(p,job,controller.signal.aborted?'Paused — progress saved':e.message);}).finally(()=>this.active.delete(p.id));return job;
  }
  stop(p){this.active.get(p.id)?.abort(new DOMException('Paused','AbortError'));}
  async execute(p,job,signal){
    if(job.type==='inventory'){
      await this.progress(p,job,'Reading the original PDF',{phase:'pdf'});await this.pdf.analyse(p,async(n,total)=>{job.progress=n;job.total=total;await this.progress(p,job,`Reading PDF page ${n} of ${total}`,{phase:'pdf'});},signal);
      await this.progress(p,job,'Connecting pages and activities',{phase:'mapping'});p.pages=await inventory(this.store,p);mapPages(p);p.baseline=await structureChecks(this.store,p);p.stage=Math.max(p.stage,1);await this.store.save(p);return;
    }
    if(job.type==='analyse'){
      if(!p.pdf.pages?.length)throw Error('Finish the local inventory first.');job.total=p.pdf.pages.length;
      for(const source of p.pdf.pages){signal.throwIfAborted();const key='pdf-'+source.page;if(job.completed.includes(key))continue;await this.progress(p,job,`Comparing PDF page ${source.page}`,{phase:'compare',progress:job.completed.length});const sections=p.pages.filter(s=>s.sourcePage===source.page),content=[{type:'input_text',text:JSON.stringify({page:source.page,sourceText:source.text,measurements:source.runs,sections:sections.map(({text,...rest})=>({...rest,text:text.slice(0,14000)}))})},{type:'input_image',image_url:'data:image/png;base64,'+(await this.pdf.image(p,source.page,1000)).toString('base64'),detail:'high'}];for(const section of sections){signal.throwIfAborted();const rendered=await this.browser.render(p,section.href);content.push({type:'input_text',text:'Current ADT '+section.href+' '+JSON.stringify(rendered.report)},{type:'input_image',image_url:'data:image/png;base64,'+rendered.image.toString('base64'),detail:'high'});}
        const result=await this.ai.structured(p,job,{instructions:`${referenceGuard} Compare every supplied ADT section with the PDF page. Identify content, artwork, layout, typography, alignment, activity and duplicate defects. Distinguish observed defects from uncertainty. Return each supplied href once. A page without a section needs an explicit sourceOnlyNote; otherwise set it to an empty string. Write compact JSON without formatting whitespace. Do not invent an exact match or mistake companion activities for hallucinations.`,input:[{role:'user',content}],schema:OBSERVATION_SCHEMA,name:'page_observation',maxTokens:4500,recoverIncomplete:(text,response)=>recoverPageObservation(text,response,sections.length)},signal);if(!result||typeof result.summary!=='string'||typeof result.pageType!=='string'||typeof result.sourceOnlyNote!=='string'||!Array.isArray(result.sections)||result.sections.length!==sections.length||sections.some(s=>result.sections.filter(r=>r.href===s.href).length!==1)||result.sections.some(s=>!['keep','edit','review'].includes(s.action)||!Number.isFinite(s.confidence)||!Array.isArray(s.issues)||s.issues.some(i=>typeof i!=='string')||typeof s.evidence!=='string')||(!sections.length&&!result.sourceOnlyNote.trim()))throw Error('Analysis omitted or misidentified a section. Resume to retry this source page.');p.observations=p.observations.filter(o=>o.page!==source.page).concat({page:source.page,...result,model:job.settings.model,revision:p.revision});job.completed.push(key);await this.store.save(p);
      }p.stage=Math.max(p.stage,2);return;
    }
    if(job.type==='guidelines'){
      job.total=1;await this.progress(p,job,'Creating your book guidelines',{phase:'guidelines'});
      if(!p.pdf.pages.length)throw Error('Finish the PDF inventory first.');
      const selected=new Set([p.pdf.pages[0].page]);
      for(const type of new Set(p.observations.map(o=>o.pageType))){const observation=p.observations.find(o=>o.pageType===type);if(selected.size<8)selected.add(observation.page);}
      for(let i=1;i<=4&&selected.size<8;i++)selected.add(p.pdf.pages[Math.floor((p.pdf.pages.length-1)*i/4)].page);
      const content=[{type:'input_text',text:JSON.stringify({sourcePages:p.pdf.pages.map(({text,runs,...rest})=>rest),observations:p.observations,existing:p.guidelines})}];
      for(const number of selected){signal.throwIfAborted();const source=p.pdf.pages.find(p=>p.page===number);await this.progress(p,job,`Inspecting the style of PDF page ${number}`,{phase:'guidelines'});content.push({type:'input_text',text:JSON.stringify({page:number,sourceText:source.text,measuredTypography:source.runs})},{type:'input_image',image_url:'data:image/png;base64,'+(await this.pdf.image(p,number,1000)).toString('base64'),detail:'high'});}
      const fonts=Object.keys(p.files).filter(name=>/\.(ttf|otf|woff2?)$/i.test(name));content.push({type:'input_text',text:JSON.stringify({availableFonts:fonts,sourceEvidencePages:[...selected]})});
      await this.progress(p,job,'Waiting for OpenAI to finish the guidelines',{phase:'model'});
      const g=await this.ai.structured(p,job,{instructions:`${referenceGuard} Create editable design and repair guidelines faithful to this book. Inspect the supplied source images and measured typography; do not infer the palette from text summaries alone. Use observed palettes and fonts; explicitly flag unavailable fonts and uncertain mappings. Use 6–18 named palette colors in #RRGGBB format. Keep each rule short and actionable. Preserve different page families. Never prescribe generic rounded cards unless the book has them. Include source-specific content and activity preservation rules.`,input:[{role:'user',content}],schema:GUIDELINE_SCHEMA,name:'book_guidelines'},signal);validateGuidelines(g);if(p.guidelines)p.guidelineHistory.push({revision:p.guidelineRevision,value:p.guidelines});p.guidelines=g;p.guidelineRevision++;p.stage=Math.max(p.stage,3);job.completed=['guidelines'];job.phase='ready';await this.store.save(p);return;
    }
    if(job.type==='repair'){
      const targets=[...p.pages.filter(s=>!job.settings.hrefs||job.settings.hrefs.includes(s.href)),...(job.settings.sourcePages||[]).map(n=>({section_id:'source_'+n,href:'source_'+n+'.html',title:'Source page '+n,sourcePage:n,language:p.pages[0]?.language||'und',controls:0,images:0,isQuiz:false,mappingConfidence:1,mappingStatus:'source-only',text:'Create an editable ADT page from this source page, matching the book reader and guidelines.'}))];job.total=targets.length;const agent=new RepairAgent({store:this.store,pdf:this.pdf,browser:this.browser,ai:this.ai,progress:this.progress.bind(this)});for(const section of targets){signal.throwIfAborted();if(job.completed.includes(section.href))continue;if(!section.sourcePage){p.decisions[section.href]={decision:'review',summary:'No source page is mapped.',issues:['Confirm the source mapping to enable repair.']};}else await agent.run(p,job,section,signal);job.expectedRevision=p.revision;job.completed.push(section.href);job.progress=job.completed.length;await this.store.save(p);}p.stage=Math.max(p.stage,4);return;
    }
    if(job.type==='verify'){
      job.total=p.pages.length;const revision=p.revision;const report=p.validation?.revision===revision?p.validation:{revision,structure:await structureChecks(this.store,p),pages:[],status:'running',checkedAt:new Date().toISOString()};p.validation=report;
      for(const section of p.pages){signal.throwIfAborted();if(job.completed.includes(section.href)&&report.pages.some(r=>r.href===section.href))continue;await this.progress(p,job,`Checking ${section.title}`,{phase:'verify',href:section.href,progress:job.completed.length});const views=[];for(const width of [1200,768,390]){signal.throwIfAborted();const result=await this.browser.render(p,section.href,{width,revision,activity:width===1200});views.push(result.report);}const accessibility=await this.browser.accessibility(p,section.href,revision);report.pages=report.pages.filter(r=>r.href!==section.href).concat({href:section.href,views,accessibility});job.completed.push(section.href);await this.store.save(p);}
      await this.progress(p,job,'Checking the original reader navigation',{phase:'navigation'});report.navigation=await this.browser.navigation(p,{revision,signal,onProgress:async(n,total)=>this.progress(p,job,`Turning through the reader · ${n} of ${total}`,{phase:'navigation'})});
      if(p.revision!==revision)throw Error('Project changed during validation. Run the checks again.');report.status=report.structure.passed&&report.navigation.status==='passed'&&report.pages.every(r=>r.views.every(v=>v.passed)&&r.views[0].activities.status==='passed'&&!r.accessibility.violations.length)?'passed':'review';report.completedAt=new Date().toISOString();p.stage=Math.max(p.stage,5);await this.store.save(p);
    }
  }
}
