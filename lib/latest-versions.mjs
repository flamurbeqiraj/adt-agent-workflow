import {decode} from './archive.mjs';
import {inventory,mapPages,structureChecks,synchronise} from './adt.mjs';

export async function selectLatestVersions(store,p,revision){
  if(revision!==p.revision)throw Object.assign(Error('The book changed. Refresh and try again.'),{status:409});
  const originalPages=p.pages,initial=await structureChecks(store,p),allowed=new Set(initial.errors.map(error=>JSON.stringify(error)));
  let files={...p.files};
  const applied=[],skipped=[],preserved=new Set();
  for(const page of originalPages){
    const version=p.versions[page.href]?.at(-1);
    if(!version||version.kind==='original'||p.selectedVersions[page.href]===version.id)continue;
    const snapshot=p.revisions[version.revision],base=p.revisions[version.baseRevision]||p.original;
    if(!snapshot?.[page.href]){skipped.push({href:page.href,id:version.id,reason:'The saved version has no reader page.'});continue;}
    let snapshotPages;
    try{snapshotPages=JSON.parse(decode(await store.read(p,'content/pages.json',snapshot)));}
    catch{skipped.push({href:page.href,id:version.id,reason:'The saved reading order is unavailable.'});continue;}
    const pageFiles=new Set([...originalPages.map(item=>item.href),...snapshotPages.map(item=>item.href)]),draft={...files},kept=[];
    for(const name of new Set([page.href,...(version.changed||[])])){
      if(['assets/offline-preloader.js','imsmanifest.xml','content/pages.json'].includes(name))continue;
      if(name!==page.href&&pageFiles.has(name))continue;
      if(name!==page.href&&draft[name]!==base[name]&&draft[name]!==snapshot[name]){kept.push(name);continue;}
      if(snapshot[name])draft[name]=snapshot[name];else delete draft[name];
    }
    try{
      await synchronise(store,p,draft);
      const check=await structureChecks(store,p,draft),newErrors=check.errors.filter(error=>!allowed.has(JSON.stringify(error)));
      if(newErrors.length){skipped.push({href:page.href,id:version.id,reason:`Saved page needs ${newErrors[0].message}.`});continue;}
    }catch(error){skipped.push({href:page.href,id:version.id,reason:error.message});continue;}
    files=draft;applied.push({href:page.href,id:version.id});for(const name of kept)preserved.add(name);
  }
  const changed=Object.keys(files).some(name=>files[name]!==p.files[name])||Object.keys(p.files).some(name=>!files[name]);
  if(changed)await store.revision(p,files,{action:'Selected latest saved page versions',pages:applied.map(item=>item.href)});
  for(const {href,id}of applied)p.selectedVersions[href]=id;
  if(changed){
    p.pages=await inventory(store,p);
    mapPages(p);
    for(const page of p.pages){const previous=originalPages.find(item=>item.href===page.href);if(previous?.mappingConfidence===1)Object.assign(page,{sourcePage:previous.sourcePage,mappingConfidence:1,mappingStatus:previous.mappingStatus});}
  }
  let restoredReviews=0;
  for(const page of p.pages){
    const decision=p.decisions[page.href];
    if(!decision?.humanReviewed&&!decision?.reviewedRevision)continue;
    if(!decision.humanReviewed)restoredReviews++;
    const selected=(p.versions[page.href]||[]).find(version=>version.id===p.selectedVersions[page.href]);
    Object.assign(decision,{humanReviewed:true,reviewedRevision:p.revision,reviewedVersionId:selected&&p.revisions[selected.revision]?.[page.href]===p.files[page.href]?selected.id:null,reviewedPageSHA256:p.files[page.href]});
  }
  p.latestSelection={revision:p.revision,skipped};
  await store.save(p);
  return {applied,skipped,preservedSharedFiles:[...preserved],restoredReviews};
}
