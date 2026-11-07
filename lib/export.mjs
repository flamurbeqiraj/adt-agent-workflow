import {pack,unpack,decode,sha} from './archive.mjs';
import {structureChecks,inventory} from './adt.mjs';
import {isReviewed} from './review.mjs';

export async function exportProject(store,p){
  const check=await structureChecks(store,p),files=await store.all(p),current=p.revision;
  const reviewed=p.pages.every(page=>isReviewed(p,page.href));
  const status=check.passed&&p.validation?.revision===current&&p.validation?.status==='passed'&&reviewed?'verified':'needs-review';
  const report={format:1,app:'ADT Studio Agent',status,generatedAt:new Date().toISOString(),source:{pdfSHA256:p.pdf?.hash,adtSHA256:p.sourceHash},revision:current,guidelineRevision:p.guidelineRevision,guidelines:p.guidelines,pageMap:p.pages.map(({text,...rest})=>rest),removedSections:p.retiredPages||[],sourcePages:p.pdf?.pages.map(({text,runs,...rest})=>rest),decisions:p.decisions,observations:p.observations,structure:check,browserValidation:p.validation,usage:p.usage,spending:p.spending||[],changes:p.changeLog,limitations:['Automated accessibility checks do not certify assistive-technology use.','Teacher and LMS review remain separate.','AI quality requires review against the source PDF.']};
  files['studio/review-report.json']=Buffer.from(JSON.stringify(report,null,2));
  files['studio/guidelines.json']=Buffer.from(JSON.stringify(p.guidelines,null,2));
  const history={format:1,original:p.original,originalRevision:p.originalRevision,revisions:p.revisions,versions:p.versions,selectedVersions:p.selectedVersions,decisions:p.decisions,guidelineHistory:p.guidelineHistory,guidelineRevision:p.guidelineRevision,sourcePDFHash:p.pdf?.hash,retiredPages:p.retiredPages||[],usage:p.usage,spending:p.spending||[]};
  files['studio/history.json']=Buffer.from(JSON.stringify(history));
  const hashes=new Set(Object.values(p.revisions).flatMap(Object.values));for(const hash of hashes)files['studio/history/blobs/'+hash]=await store.read(p,'blob',{'blob':hash});
  const archive=pack(files),reopened=unpack(archive),mismatch=Object.keys(p.files).filter(name=>!reopened[name]||sha(reopened[name])!==p.files[name]);if(mismatch.length)throw Error('Export did not preserve all runtime files: '+mismatch.slice(0,5).join(', '));
  return {archive,report,evidence:{sha256:sha(archive),runtimeFilesChecked:Object.keys(p.files).length,byteIdenticalToRevision:current,structuralStatus:check.passed?'passed':'review',browserChecksApply:p.validation?.revision===current,verifiedAt:new Date().toISOString()}};
}
export async function restoreImportedHistory(store,p){if(!p.files['studio/history.json'])return;let h;try{h=JSON.parse(decode(await store.read(p,'studio/history.json')));}catch{return;}if(h.format!==1||!h.revisions||!h.versions)return;for(const [id,map]of Object.entries(h.revisions)){if(!/^[a-f0-9]{20}$/.test(id)||!map||typeof map!=='object')throw Error('Invalid imported version archive.');for(const [name,hash]of Object.entries(map)){const raw=await store.read(p,'studio/history/blobs/'+hash);if(sha(raw)!==hash)throw Error('A saved version has a broken hash.');await store.blob(p,raw);}}
  if(!h.original||!h.revisions[h.originalRevision])throw Error('The original version is missing from this archive.');
  p.revisions={...h.revisions};p.versions=h.versions;p.selectedVersions=h.selectedVersions||{};p.decisions=h.decisions&&typeof h.decisions==='object'?h.decisions:{};p.original=h.original;p.originalRevision=h.originalRevision;p.guidelineHistory=h.guidelineHistory||[];p.guidelineRevision=h.guidelineRevision||0;p.expectedSourceHash=h.sourcePDFHash;p.retiredPages=h.retiredPages||[];if(h.usage&&Number.isFinite(h.usage.cost)&&h.usage.cost>=0)p.usage=h.usage;if(Array.isArray(h.spending))p.spending=h.spending;
  if(p.files['studio/guidelines.json'])try{p.guidelines=JSON.parse(decode(await store.read(p,'studio/guidelines.json')));}catch{}
  for(const name of Object.keys(p.files))if(name.startsWith('studio/history/')||['studio/history.json','studio/review-report.json','studio/guidelines.json'].includes(name))delete p.files[name];
  p.revision=sha(JSON.stringify(p.files)).slice(0,20);p.revisions[p.revision]={...p.files};
}
