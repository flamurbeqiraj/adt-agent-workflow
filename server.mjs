import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Store} from './lib/store.mjs';
import {unpack,safePath,sha,decode} from './lib/archive.mjs';
import {inventory,mapPages,structureChecks,documentOf,resolveReference,synchronise} from './lib/adt.mjs';
import {PDFService} from './lib/pdf.mjs';
import {BrowserService} from './lib/browser.mjs';
import {OpenAIClient,MODELS} from './lib/openai.mjs';
import {CredentialStore} from './lib/credential.mjs';
import {Jobs,validateGuidelines} from './lib/jobs.mjs';
import {exportProject,restoreImportedHistory} from './lib/export.mjs';
import {preparePreviewScript} from './lib/preview.mjs';
import {editPages} from './lib/manual-pages.mjs';
import {invalidateChangedReviews} from './lib/review.mjs';

const cwd=fileURLToPath(new URL('.',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.mp3':'audio/mpeg','.mp4':'video/mp4','.pdf':'application/pdf','.wasm':'application/wasm'};
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function body(req,max=400*1024*1024){let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>max)throw Object.assign(Error('Upload is too large.'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
async function data(req){try{return JSON.parse((await body(req,2*1024*1024)).toString('utf8')||'{}');}catch{throw Error('Invalid request.');}}
async function listen(server,port){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}

export async function createApp({port=Number(process.env.PORT||8892),previewPort=Number(process.env.PREVIEW_PORT||8893),workspace=path.join(cwd,'.adt-workspace'),ai=new OpenAIClient()}={}){
  const credentials=new CredentialStore(workspace);
  if(credentials.supported)try{ai.key=await credentials.read();}catch{ai.key='';}
  const store=new Store(path.join(workspace,'projects'));await store.init();const csrf=randomBytes(32).toString('hex'),origin=`http://127.0.0.1:${port}`,previewOrigin=`http://127.0.0.1:${previewPort}`,pdf=new PDFService(store),browser=new BrowserService(store,previewOrigin),jobs=new Jobs({store,pdf,browser,ai});
  let example;try{example=JSON.parse(await fs.readFile(path.join(cwd,'example.local.json'),'utf8'));}catch{}
  ai.trace=async(p,job,trace)=>{await store.evidence(p,`traces/${job.id}/${String(job.calls).padStart(4,'0')}.json`,JSON.stringify(trace,null,2));};
  await jobs.recoverCompletedGuidelines();
  const assertIdle=p=>{if(jobs.active.has(p.id))throw Object.assign(Error('Pause the active task first.'),{status:409});};
  async function imported(buffer,name){const files=unpack(buffer),p=await store.create(files,name.replace(/\.zip$/i,''));p.sourceHash=sha(buffer);p.archiveName=name;await restoreImportedHistory(store,p);p.pages=await inventory(store,p);let config;try{config=JSON.parse(decode(await store.read(p,'assets/config.json')));}catch{}p.name=config?.title||documentOf(decode(await store.read(p,p.pages[0].href))).title||p.name;await store.save(p);return p;}
  async function attachPDF(p,buffer,name){if(!buffer.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('Choose a PDF file.');const hash=await store.blob(p,buffer),sameSource=(p.expectedSourceHash||p.pdf?.hash)===hash;p.pdf={name,hash,pages:[],bytes:buffer.length};p.observations=[];p.stage=0;if(!sameSource){p.guidelines=null;p.guidelineRevision=0;p.decisions={};}else if(p.guidelines){validateGuidelines(p.guidelines);p.stage=3;}p.validation=null;await pdf.open(p);await store.save(p);}
  const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');try{
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))throw Object.assign(Error('Invalid host.'),{status:403});const url=new URL(req.url,origin),parts=url.pathname.split('/').filter(Boolean),method=req.method;
    if(parts[0]==='api'){
      if(req.headers.origin&&req.headers.origin!==origin&&req.headers.origin!==`http://localhost:${port}`)throw Object.assign(Error('Cross-origin request blocked.'),{status:403});if(req.headers['sec-fetch-site']==='cross-site')throw Object.assign(Error('Cross-site request blocked.'),{status:403});
      if(method!=='GET'&&req.headers['x-studio-token']!==csrf)throw Object.assign(Error('Refresh the app to continue.'),{status:403});
      if(parts[1]==='session'&&method==='GET')return json(res,{token:csrf,connected:!!ai.key,remembered:await credentials.exists(),canRemember:credentials.supported,models:MODELS,previewOrigin,exampleAvailable:!!example});
      if(parts[1]==='key'&&method==='POST'){const input=await data(req);await ai.connect(input.key,input.model);try{if(input.remember)await credentials.write(ai.key);else await credentials.delete();}catch{ai.disconnect();throw Error('Could not save the key securely. Try connecting without Remember on this computer.');}return json(res,{connected:true,remembered:!!input.remember});}
      if(parts[1]==='key'&&method==='DELETE'){for(const p of store.projects.values())jobs.stop(p);await credentials.delete();ai.disconnect();return json(res,{connected:false});}
      if(parts[1]==='projects'&&parts.length===2&&method==='GET')return json(res,[...store.projects.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(p=>({id:p.id,name:p.name,pages:p.pages.length,pdfPages:p.pdf?.pages?.length||0,updatedAt:p.updatedAt,stage:p.stage,spent:p.usage?.cost||0})));
      if(parts[1]==='projects'&&parts.length===2&&method==='POST'){const p=await imported(await body(req),url.searchParams.get('name')||'My book.zip');return json(res,store.summary(p),201);}
      if(parts[1]==='example'&&method==='POST'){if(!example)throw Error('No local example configured.');const p=await imported(await fs.readFile(example.adt),path.basename(example.adt));await attachPDF(p,await fs.readFile(example.pdf),path.basename(example.pdf));jobs.start(p,'inventory');return json(res,store.summary(p),201);}
      if(parts[1]==='projects'&&parts[2]){const p=store.get(parts[2]),action=parts[3];
        if(!action&&method==='GET')return json(res,store.summary(p));
        if(!action&&method==='DELETE'){assertIdle(p);await store.remove(p.id);if(p.pdf?.hash&&![...store.projects.values()].some(other=>other.pdf?.hash===p.pdf.hash)){const document=pdf.documents.get(p.pdf.hash);pdf.documents.delete(p.pdf.hash);await document?.destroy().catch(()=>{});}return json(res,{deleted:p.id});}
        if(action==='pdf'&&method==='PUT'){assertIdle(p);await attachPDF(p,await body(req),url.searchParams.get('name')||'Original.pdf');return json(res,store.summary(p));}
        if(action==='pdf'&&method==='GET'){const number=Number(parts[4]),width=Number(url.searchParams.get('width')||1000);const b=await pdf.image(p,number,Math.max(180,Math.min(1600,width)));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'private, max-age=3600'});return res.end(b);}
        if(action==='evidence'&&method==='GET'){const name=safePath(parts.slice(4).map(decodeURIComponent).join('/'));const b=await fs.readFile(path.join(store.dir(p.id),'evidence',name));res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'private, max-age=3600'});return res.end(b);}
        if(action==='jobs'&&method==='POST'){const input=await data(req);jobs.start(p,input.type,input.settings||{});return json(res,store.summary(p),202);}
        if(action==='pause'&&method==='POST'){jobs.stop(p);return json(res,{paused:true});}
        if(action==='resume'&&method==='POST'){if(!p.job||p.job.status!=='paused')throw Error('No paused task to resume.');const input=await data(req);jobs.start(p,p.job.type,{...p.job.settings,...input.settings},true);return json(res,store.summary(p),202);}
        if(action==='guidelines'&&method==='PUT'){assertIdle(p);const input=validateGuidelines(await data(req));if(p.guidelines)p.guidelineHistory.push({revision:p.guidelineRevision,value:p.guidelines});p.guidelines=input;p.guidelineRevision++;p.stage=Math.max(p.stage,3);await store.save(p);return json(res,store.summary(p));}
        if(action==='mapping'&&method==='PUT'){assertIdle(p);const input=await data(req),page=p.pages.find(s=>s.href===input.href);if(!page||input.page!==null&&!p.pdf?.pages.some(s=>s.page===input.page))throw Error('Choose a valid section and PDF page.');Object.assign(page,{sourcePage:input.page,mappingStatus:input.page?'mapped':'companion',mappingConfidence:1,mappingReason:'Confirmed by user'});p.mappingRevision=(p.mappingRevision||0)+1;p.decisions[input.href]={...p.decisions[input.href],humanReviewed:false};for(const source of p.pdf.pages)source.sectionHrefs=p.pages.filter(s=>s.sourcePage===source.page).map(s=>s.href);p.validation=null;await store.save(p);return json(res,store.summary(p));}
        if(action==='pages'&&method==='POST'){assertIdle(p);const input=await data(req),selected=await editPages(store,p,input);return json(res,{...store.summary(p),selected});}
        if(action==='review'&&method==='PUT'){assertIdle(p);const input=await data(req);if(!p.pages.some(s=>s.href===input.href))throw Error('Unknown page.');p.decisions[input.href]={...p.decisions[input.href],humanReviewed:!!input.approved,reviewedRevision:p.revision};await store.save(p);return json(res,store.summary(p));}
        if(action==='version'&&method==='POST'){assertIdle(p);const input=await data(req),version=(p.versions[input.href]||[]).find(v=>v.id===input.id);if(!version)throw Error('Version not found.');const map=p.revisions[version.revision];if(!map)throw Error('Version snapshot unavailable.');const beforeFiles={...p.files};let files={...p.files};if(input.wholeProject)files={...map};else{const base=p.revisions[version.baseRevision]||p.original,changed=version.kind==='original'?[input.href]:version.changed;for(const name of changed){if(name!==input.href&&p.files[name]!==base[name]&&p.files[name]!==map[name])throw Object.assign(Error('A shared file changed later. Restore the entire checkpoint or regenerate this page.'),{status:409});if(map[name])files[name]=map[name];else delete files[name];}}
          await synchronise(store,p,files);const before=await structureChecks(store,p),after=await structureChecks(store,p,files);const existing=new Set(before.errors.map(e=>JSON.stringify(e)));if(after.errors.some(e=>!existing.has(JSON.stringify(e))))throw Error('This version would break project references. Restore its whole checkpoint.');await store.revision(p,files,{action:'Selected '+version.label,href:input.href});invalidateChangedReviews(p,beforeFiles,files);p.selectedVersions[input.href]=version.id;const old=p.pages;p.pages=await inventory(store,p);p.retiredPages=(p.retiredPages||[]).filter(old=>!p.pages.some(page=>page.href===old.href));mapPages(p);for(const page of p.pages){const previous=old.find(s=>s.href===page.href);if(previous?.mappingConfidence===1)Object.assign(page,{sourcePage:previous.sourcePage,mappingConfidence:1,mappingStatus:previous.mappingStatus});}await store.save(p);return json(res,store.summary(p));}
        if(action==='file'&&method==='GET'){const name=safePath(url.searchParams.get('path')),revision=url.searchParams.get('revision')||p.revision,map=p.revisions[revision];if(!map)throw Error('Unknown revision.');const b=await store.read(p,name,map);return json(res,{path:name,hash:sha(b),content:decode(b).slice(0,300000)});}
        if(action==='export'&&method==='GET'){assertIdle(p);const {archive,report,evidence}=await exportProject(store,p);p.exportEvidence=evidence;await store.save(p);res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="ADT-${report.status}-${p.id.slice(0,8)}.zip"`,'X-Export-Status':report.status});return res.end(archive);}
        if(action==='report'&&method==='GET'){res.setHeader('Content-Disposition','attachment; filename="ADT-review-report.json"');return json(res,{...store.summary(p),exportEvidence:p.exportEvidence});}
      }
      throw Object.assign(Error('Unknown action.'),{status:404});
    }
    if(method!=='GET')throw Object.assign(Error('Method not allowed.'),{status:405});
    const name=url.pathname==='/'?'index.html':safePath(decodeURIComponent(url.pathname.slice(1)));let target=path.join(cwd,'public',name);if(name==='vendor/fflate.mjs')target=path.join(cwd,'node_modules/fflate/esm/browser.js');res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src ${previewOrigin}; object-src 'none'; base-uri 'none'; form-action 'self'`);const b=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(b);
  }catch(e){if(!res.headersSent)json(res,{error:e.code==='ENOENT'?'File not found.':e.message},e.status||400);else res.end();}});
  const preview=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,previewOrigin),parts=url.pathname.split('/').filter(Boolean);
      if(req.method!=='GET'||parts[0]!=='book'||parts.length<4)throw Error('Not found');
      const p=store.get(parts[1]),revision=parts[2],name=safePath(parts.slice(3).map(decodeURIComponent).join('/')),map=p.revisions[revision];
      if(!map)throw Error('Not found');
      let b=preparePreviewScript(name,await store.read(p,name,map));
      if(/\.html?$/.test(name)){
        const html=b.toString('utf8'),quizId=/data-correct-answers/.test(html)?p.pages.find(page=>page.href===name)?.section_id:null;
        const config=JSON.stringify({project:p.id,origin,href:name,quizId}).replaceAll('<','\\u003c');
        const bridge=`<script data-studio-preview>(function(c){if(parent===window)return;if(c.quizId)try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.includes('.responses.')&&key.endsWith('.'+c.quizId))localStorage.removeItem(key);}}catch{}let last='';function tell(){const id=document.querySelector('meta[name="title-id"]')?.content||document.querySelector('[data-section-id]')?.getAttribute('data-section-id')||'';const value=id||location.pathname;if(value===last)return;last=value;parent.postMessage({type:'adt-preview-location',project:c.project,sectionId:id,href:decodeURIComponent(location.pathname.split('/').slice(4).join('/'))||c.href},c.origin);}addEventListener('load',tell);addEventListener('popstate',tell);new MutationObserver(tell).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['content','data-section-id']});function shortcut(e){if(!['ArrowLeft','ArrowRight','Enter'].includes(e.key)||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.isComposing)return;const target=e.target instanceof Element?e.target:null;if(target?.closest('textarea,select,input:not([type=radio]):not([type=checkbox]),[contenteditable],[role=\"textbox\"]')){if(e.key!=='Enter')e.stopImmediatePropagation();return;}if(e.key==='Enter'&&target?.closest('button,a,[role=\"button\"]'))return;e.preventDefault();e.stopImmediatePropagation();if(e.type==='keydown'&&!(e.repeat&&e.key==='Enter'))parent.postMessage({type:'adt-preview-shortcut',project:c.project,key:e.key},c.origin);}addEventListener('keydown',shortcut,true);addEventListener('keyup',shortcut,true);tell();})(${config});</script>`;
        b=Buffer.from(/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,head=>head+bridge):html.includes('</body>')?html.replace('</body>',bridge+'</body>'):bridge+html);
      }
      res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'; frame-ancestors ${origin} http://localhost:${port}`});res.end(b);
    }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Preview file unavailable.');}
  });
  await listen(preview,previewPort);try{await listen(server,port);}catch(e){preview.close();throw e;}
  return {server,preview,store,pdf,browser,ai,jobs,origin,previewOrigin,close:async()=>{for(const p of store.projects.values())jobs.stop(p);await browser.close();await new Promise(r=>server.close(r));await new Promise(r=>preview.close(r));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const app=await createApp();process.stdout.write(`ADT Studio is ready at ${app.origin}\n`);for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>app.close().then(()=>process.exit(0)));}
