import {decode} from './archive.mjs';
import {documentOf} from './adt.mjs';
import {missingGlyphs} from './font-coverage.mjs';

// These are book rules, not instructions found in an imported ADT.
export const BLUEPRINT_RULES=`Use one locally bundled static Poppins family (400, 600, 700) throughout the book, including reader controls; verify glyph coverage. Every visible text element is at least 16 CSS px, with normal reading text around 18–22 px. Use a single centered page shell (start at max-width: 1000px), balanced inline padding, consistent cards and buttons, and height that follows content. Preserve live text and all source-supported learning items. A printed page may become several reader screens. Keep each complete prompt with its response, each image with its explanation and caption, and each quiz question with its choices. Split at meaningful boundaries or use accessible disclosures to shorten ordinary scrolling. Never clip, hide, shrink, or absolutely position content to force a page to fit; at zoom or with expanded answers, allow reachable vertical scrolling. No content may leak into another reader page. Remove stray shapes only after checking the source. Improve images from source assets without inventing detail. Classify activities as digital, physical/offline, discussion, or hybrid before editing: fully implement digital controls and saved state, and do not add false submit or scoring controls to physical or oral tasks. Preserve original grading keys, localization, audio, offline cache, navigation, and LMS resources. Provide keyboard, touch, focus, text feedback, reduced-motion, and screen-reader access. Flag ambiguous source material for teacher review.`;

const unique=items=>[...new Set(items)];
const values=value=>value&&typeof value==='object'?Array.isArray(value)?value.flatMap(values):Object.values(value).flatMap(values):value==null?[]:[value];
const links=(value,out=[])=>{if(Array.isArray(value))for(const item of value)links(item,out);else if(value&&typeof value==='object'){if(typeof value.href==='string')out.push(value.href);for(const item of Object.values(value))links(item,out);}return out;};
const json=async(store,p,name,files)=>{try{return JSON.parse(decode(await store.read(p,name,files)));}catch{return null;}};
const textIDs=doc=>unique([...doc.querySelectorAll('[data-id]')].map(n=>n.getAttribute('data-id')).filter(Boolean));
const activityType=(root,quiz)=>{
  if(quiz)return 'digital';
  if(root.querySelector('input:not([type=hidden]),textarea,select,[contenteditable=true],[role=radio],[role=checkbox]'))return 'digital';
  const types=[...root.querySelectorAll('[data-section-type]')].map(n=>n.getAttribute('data-section-type')||'');
  if(types.some(t=>/activity|exercise|puzzle|draw|quiz|response/i.test(t)))return 'review';
  return 'instruction-or-reading';
};

export async function auditBook(store,p,files){
  const entries=await json(store,p,'content/pages.json',files);
  if(!Array.isArray(entries))throw Error('Cannot audit a book without content/pages.json.');
  const tocLinks=new Set(links(await json(store,p,'content/toc.json',files)));
  const pages=[];
  for(const [index,entry] of entries.entries()){
    const doc=documentOf(decode(await store.read(p,entry.href,files)));
    const root=doc.querySelector('#content')||doc.querySelector('main')||doc.body;
    const quiz=!!doc.querySelector('#quiz-correct-answers,[data-correct-answers],#quiz-explanations')||/^qz/i.test(entry.section_id);
    const controls=[...root.querySelectorAll('input:not([type=hidden]),textarea,select,button,[contenteditable=true],[role=button],[role=radio],[role=checkbox]')].map(n=>({id:n.id||null,name:n.getAttribute('name')||null,type:n.getAttribute('type')||n.tagName.toLowerCase(),activityItem:n.getAttribute('data-activity-item')||null}));
    const images=[...root.querySelectorAll('img')].map(n=>({src:n.getAttribute('src')||'',alt:n.getAttribute('alt'),id:n.getAttribute('data-id')||null}));
    const audio=[...doc.querySelectorAll('audio[src],source[src]')].map(n=>n.getAttribute('src'));
    const contentBlocks=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,figcaption,label,summary,blockquote,li')].map(n=>({role:n.tagName.toLowerCase(),text:n.textContent.replace(/\s+/g,' ').trim().slice(0,1000),textIds:textIDs(n)})).filter(n=>n.text);
    const inlineText=Object.fromEntries([...root.querySelectorAll('[data-id]')].map(n=>[n.getAttribute('data-id'),n.textContent.replace(/\s+/g,' ').trim()]).filter(([id,value])=>id&&value));
    const quizPayloads=doc.querySelectorAll('#quiz-correct-answers,[data-correct-answers],#quiz-explanations').length;
    pages.push({href:entry.href,sectionId:entry.section_id,position:index+1,printedPage:entry.page_number??p.pages?.find(page=>page.href===entry.href)?.sourcePage??null,tocLink:tocLinks.has(entry.href),language:doc.documentElement.lang||'und',title:root.querySelector('h1,h2,h3')?.textContent.trim()||entry.section_id,contentBlocks,textIds:textIDs(root),inlineText,controls,images,audio,quiz,quizPayloads,activityClass:activityType(root,quiz)});
  }
  const localization={};
  for(const name of Object.keys(files).filter(n=>/^content\/i18n\/[^/]+\/(?:texts|speech_texts|audios|glossary|images)\.json$/.test(n))){
    const data=await json(store,p,name,files);localization[name]={keys:data&&typeof data==='object'?Object.keys(data).length:0,nonempty:values(data).filter(v=>v!==''&&v!==false).length};
  }
  const allIds=pages.flatMap(page=>page.textIds),ids=unique(allIds),idCounts=new Map();for(const id of allIds)idCounts.set(id,(idCounts.get(id)||0)+1);const duplicateTextIds=ids.filter(id=>idCounts.get(id)>1);
  const missingDisplayIds=[],missingSpeechIds=[],displayMismatches=[];
  const dictionaries=new Map();
  for(const page of pages){
    const name=`content/i18n/${page.language}/texts.json`,speechName=`content/i18n/${page.language}/speech_texts.json`;
    if(!dictionaries.has(name))dictionaries.set(name,await json(store,p,name,files));
    if(!dictionaries.has(speechName))dictionaries.set(speechName,await json(store,p,speechName,files));
    const display=dictionaries.get(name),speech=dictionaries.get(speechName);
    for(const id of page.textIds){
      if(display&&!(id in display))missingDisplayIds.push({href:page.href,dictionary:name,id});
      else if(display&&typeof display[id]==='string'&&page.inlineText[id]&&display[id].replace(/\s+/g,' ').trim()!==page.inlineText[id])displayMismatches.push({href:page.href,id,inline:page.inlineText[id],display:display[id]});
      if(speech&&!(id in speech))missingSpeechIds.push({href:page.href,dictionary:speechName,id});
    }
  }
  const counts={screens:pages.length,visibleTextIds:ids.length,activityControls:pages.reduce((n,page)=>n+page.controls.length,0),imageReferences:pages.reduce((n,page)=>n+page.images.length,0),quizScreens:pages.filter(page=>page.quiz).length,quizPayloads:pages.reduce((n,page)=>n+page.quizPayloads,0),audioElements:pages.reduce((n,page)=>n+page.audio.length,0),audioMappings:Object.entries(localization).filter(([name])=>name.endsWith('/audios.json')).reduce((n,[,value])=>n+value.nonempty,0)};
  const fontAssets=Object.keys(files).filter(name=>/\.(?:ttf|otf|woff2?)$/i.test(name));
  const poppinsWeights=[400,600,700].filter(weight=>fontAssets.some(name=>new RegExp(`(?:^|/)Poppins-${weight}\\.(?:ttf|otf|woff2?)$`,'i').test(name)));
  const licenseIncluded=Object.keys(files).some(name=>/(?:^|\/)(?:poppins-)?OFL\.txt$/i.test(name));
  const requiredCharacters=unique([...pages.map(page=>[page.title,...page.contentBlocks.map(block=>block.text),...Object.values(page.inlineText),...page.images.map(image=>image.alt||'')].join(' ')).join('')].filter(char=>/[\p{L}\p{M}\p{N}\p{P}]/u.test(char)));
  const glyphCoverage={};
  for(const weight of poppinsWeights){const name=fontAssets.find(path=>new RegExp(`(?:^|/)Poppins-${weight}\\.(?:ttf|otf)$`,'i').test(path));if(!name){glyphCoverage[weight]={status:'not-tested',reason:'The available font is not a TTF or OTF file.'};continue;}try{const missing=missingGlyphs(await store.read(p,name,files),requiredCharacters);glyphCoverage[weight]={status:missing.length?'failed':'passed',missing:missing.map(char=>({character:char,codepoint:'U+'+char.codePointAt(0).toString(16).toUpperCase()}))};}catch(error){glyphCoverage[weight]={status:'not-tested',reason:error.message};}}
  const fontReadiness={poppinsWeights,licenseIncluded,glyphCoverage,status:poppinsWeights.length===3&&licenseIncluded&&[400,600,700].every(weight=>glyphCoverage[weight]?.status==='passed')?'passed':'review'};
  return {counts,pages,localization,fontAssets,fontReadiness,missingDisplayIds,missingSpeechIds,displayMismatches,duplicateTextIds};
}

export function sourceScreenMap(p,original,final){
  const numbers=unique([...(p.pdf?.pages||[]).map(s=>s.page),...original.pages.map(s=>s.printedPage),...final.pages.map(s=>s.printedPage)].filter(Number.isInteger)).sort((a,b)=>a-b);
  return numbers.map(sourcePage=>({sourcePage,original:original.pages.filter(s=>s.printedPage===sourcePage).map(s=>s.href),final:final.pages.filter(s=>s.printedPage===sourcePage).map(s=>s.href),status:final.pages.some(s=>s.printedPage===sourcePage)?'mapped':'source-only'}));
}
