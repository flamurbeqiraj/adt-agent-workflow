import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {decode} from './archive.mjs';
import {documentOf,inventory,resolveReference,serialize,structureChecks,synchronise} from './adt.mjs';

const relative=(from,to)=>path.posix.relative(path.posix.dirname(from),to)||path.posix.basename(to);
function replaceLinks(html,from,removed,replacement){
  const doc=documentOf(html);
  for(const link of doc.querySelectorAll('a[href]')){
    const label=(link.getAttribute('rel')||'')+' '+(link.getAttribute('aria-label')||'')+' '+link.textContent.trim();
    if(resolveReference(from,link.getAttribute('href'))===removed&&!/\b(next|forward|previous|prev|back)\b/i.test(label))link.setAttribute('href',relative(from,replacement));
  }
  for(const meta of doc.querySelectorAll('meta[http-equiv="refresh"]')){
    if(meta.getAttribute('content')?.includes(removed))meta.setAttribute('content',meta.getAttribute('content').replaceAll(removed,replacement));
  }
  return serialize(doc);
}

async function updateReaderLinks(store,p,files,entries,oldOrder,created){
  for(const [index,entry] of entries.entries()){
    const raw=decode(await store.read(p,entry.href,files)),doc=documentOf(raw);
    for(const link of doc.querySelectorAll('a[href]')){
      const label=(link.getAttribute('rel')||'')+' '+(link.getAttribute('aria-label')||'')+' '+link.textContent.trim();
      const direction=/\b(next|forward)\b/i.test(label)?1:/\b(previous|prev|back)\b/i.test(label)?-1:0;
      const target=resolveReference(entry.href,link.getAttribute('href'));
      const previousIndex=oldOrder.indexOf(entry.href);
      if(!direction||!target||previousIndex<0||target!==oldOrder[previousIndex+direction])continue;
      const neighbor=entries[index+direction];
      if(neighbor)link.setAttribute('href',relative(entry.href,neighbor.href));else link.remove();
    }
    if(entry.href===created){
      const main=doc.querySelector('#content')||doc.querySelector('main')||doc.body;
      const nav=doc.createElement('nav');nav.setAttribute('aria-label','Page navigation');
      for(const [label,neighbor] of [['Previous',entries[index-1]],['Next',entries[index+1]]])if(neighbor){const link=doc.createElement('a');link.textContent=label;link.setAttribute('href',relative(entry.href,neighbor.href));nav.appendChild(link);}
      main.querySelector('nav[aria-label="Page navigation"]')?.remove();main.appendChild(nav);
    }
    const updated=serialize(doc);
    if(updated!==serialize(documentOf(raw)))files[entry.href]=await store.blob(p,updated);
  }
}

export async function editPages(store,p,{action,href,revision}){
  if(revision!==p.revision)throw Object.assign(Error('The book changed. Refresh and try again.'),{status:409});
  const current=p.pages.find(page=>page.href===href);
  if(!current?.sourcePage||!p.pdf?.pages.some(page=>page.page===current.sourcePage))throw Error('Choose a page with a confirmed PDF source.');
  if(!['up','down','add','remove'].includes(action))throw Error('Choose a page action.');
  const old=p.pages,entries=JSON.parse(decode(await store.read(p,'content/pages.json'))),oldOrder=entries.map(entry=>entry.href),at=entries.findIndex(entry=>entry.href===href);
  const same=old.filter(page=>page.sourcePage===current.sourcePage),position=same.findIndex(page=>page.href===href);
  if(action==='up'&&position===0||action==='down'&&position===same.length-1)throw Error('This page is already at the end of this PDF page.');
  if(action==='remove'&&entries.length===1)throw Error('Keep at least one ADT page in the book.');
  const files={...p.files},before=p.revision,baseline=await structureChecks(store,p),allowed=new Set(baseline.errors.map(error=>JSON.stringify(error)));
  let selected=href,created=null;
  if(action==='up'||action==='down'){
    const other=same[position+(action==='up'?-1:1)],target=entries.findIndex(entry=>entry.href===other.href);
    [entries[at],entries[target]]=[entries[target],entries[at]];
  }else if(action==='add'){
    const stem=href.replace(/\.html?$/i,''),extension=href.slice(stem.length);let number=2;
    while(files[`${stem}_new${number}${extension}`]||old.some(page=>page.href===`${stem}_new${number}${extension}`)||(p.retiredPages||[]).some(page=>page.href===`${stem}_new${number}${extension}`))number++;
    created=`${stem}_new${number}${extension}`;
    const id=`${current.section_id}_new${number}`;
    const original=documentOf(decode(await store.read(p,href))),doc=documentOf('<!doctype html><html><head></head><body></body></html>');
    doc.documentElement.setAttribute('lang',original.documentElement.getAttribute('lang')||'en');
    for(const node of original.head.querySelectorAll('meta[name="viewport"],link[rel="stylesheet"]'))doc.head.appendChild(node.cloneNode(true));
    const title=doc.createElement('title');title.textContent=`New page for PDF page ${current.sourcePage}`;doc.head.appendChild(title);
    const main=doc.createElement('main');main.id='content';main.setAttribute('data-section-id',id);
    const heading=doc.createElement('h1');heading.textContent=`New page for PDF page ${current.sourcePage}`;main.appendChild(heading);
    const note=doc.createElement('p');note.textContent='Regenerate this page to build its content from the source PDF.';main.appendChild(note);
    doc.body.appendChild(main);
    files[created]=await store.blob(p,serialize(doc));
    entries.splice(at+1,0,{section_id:id,href:created,page_number:current.sourcePage});
    selected=created;
  }else{
    entries.splice(at,1);delete files[href];
    selected=same[position+1]?.href||same[position-1]?.href||entries[Math.min(at,entries.length-1)].href;
    for(const name of Object.keys(files).filter(name=>/\.html?$/i.test(name))){
      const raw=decode(await store.read(p,name,files));
      const updated=replaceLinks(raw,name,href,selected);
      if(updated!==serialize(documentOf(raw)))files[name]=await store.blob(p,updated);
    }
    if(files['content/toc.json']){
      const toc=JSON.parse(decode(await store.read(p,'content/toc.json',files)));
      const prune=value=>Array.isArray(value)?value.filter(item=>item?.href!==href&&item?.section_id!==current.section_id).map(prune):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,prune(item)])):value;
      files['content/toc.json']=await store.blob(p,JSON.stringify(prune(toc),null,2));
    }
  }
  files['content/pages.json']=await store.blob(p,JSON.stringify(entries,null,2));
  await updateReaderLinks(store,p,files,entries,oldOrder,created);
  if(files['content/toc.json']){
    const toc=JSON.parse(decode(await store.read(p,'content/toc.json',files)));
    if(Array.isArray(toc)){
      if(created)toc.splice(Math.max(0,toc.findIndex(item=>item?.href===href))+1,0,{href:created,title:`New page for PDF page ${current.sourcePage}`});
      const order=new Map(entries.map((entry,index)=>[entry.href,index]));
      toc.sort((a,b)=>(order.get(a.href)??Infinity)-(order.get(b.href)??Infinity));
      files['content/toc.json']=await store.blob(p,JSON.stringify(toc,null,2));
    }
  }
  await synchronise(store,p,files);
  const check=await structureChecks(store,p,files),fresh=check.errors.filter(error=>!allowed.has(JSON.stringify(error)));
  if(fresh.length)throw Error('Page edit would break book references: '+JSON.stringify(fresh.slice(0,5)));
  await store.revision(p,files,{action:`Manual page ${action}`,href});
  p.pages=await inventory(store,p);
  for(const page of p.pages){const previous=old.find(item=>item.href===page.href);if(previous)Object.assign(page,{sourcePage:previous.sourcePage,mappingConfidence:previous.mappingConfidence,mappingStatus:previous.mappingStatus,mappingReason:previous.mappingReason});else Object.assign(page,{sourcePage:current.sourcePage,mappingConfidence:1,mappingStatus:'mapped',mappingReason:'Added manually for this PDF page.'});}
  if(action==='remove'){
    p.retiredPages=[...(p.retiredPages||[]),{...current,retiredAt:new Date().toISOString(),previousRevision:before,reason:'Removed manually from the New ADT reader.'}];
    delete p.decisions[href];
  }
  if(created){
    const version={id:randomUUID(),revision:p.revision,baseRevision:before,href:created,label:'Blank page added manually',at:new Date().toISOString(),kind:'selected',prompt:'',guidelineRevision:p.guidelineRevision,model:'',changed:[created]};
    p.versions[created]=[version];p.selectedVersions[created]=version.id;
  }
  for(const source of p.pdf.pages)source.sectionHrefs=p.pages.filter(page=>page.sourcePage===source.page).map(page=>page.href);
  p.mappingRevision=(p.mappingRevision||0)+1;p.validation=null;
  await store.save(p);
  return selected;
}
