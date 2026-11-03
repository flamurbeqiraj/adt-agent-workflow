import fs from 'node:fs/promises';

const origin=process.env.STUDIO_ORIGIN||'http://127.0.0.1:8892';
const projects=await(await fetch(origin+'/api/projects')).json();
const project=projects.find(p=>p.pdfPages===50&&p.pages===107);
if(!project)throw Error('Import the supplied Shoqëria example first.');
const endpoint=origin+'/api/projects/'+project.id;
let current=await(await fetch(endpoint)).json();
if(current.job?.type!=='verify'||!['running','completed'].includes(current.job.status)){
  const {token}=await(await fetch(origin+'/api/session')).json();
  const response=await fetch(endpoint+'/jobs',{method:'POST',headers:{'X-Studio-Token':token,'Content-Type':'application/json'},body:JSON.stringify({type:'verify'})});
  if(!response.ok)throw Error((await response.json()).error);
}
let previous='';
for(;;){
  current=await(await fetch(endpoint)).json();
  const progress=`${current.job.progress}/${current.job.total} · ${current.job.message}`;
  if(progress!==previous){console.log(progress);previous=progress;}
  if(current.job.status==='paused')throw Error(current.job.error||'Verification paused.');
  if(current.job.status==='completed')break;
  await new Promise(resolve=>setTimeout(resolve,3000));
}
const report=current.validation;
const activityRows=report.pages.flatMap(page=>page.views[0].activities.rows);
const summary={project:current.id,pdfPages:current.pdf.pages.length,sections:current.pages.length,status:report.status,views:report.pages.reduce((n,p)=>n+p.views.length,0),renderFailures:report.pages.flatMap(p=>p.views.filter(v=>!v.passed).map(v=>({href:p.href,width:v.width}))),activityRows:activityRows.length,activityFailures:activityRows.filter(r=>r.status==='failed'),activityReview:activityRows.filter(r=>r.status==='review'),accessibilityViolations:report.pages.reduce((n,p)=>n+p.accessibility.violations.length,0),navigation:report.navigation,liveAI:false};
await fs.mkdir('tests/artifacts',{recursive:true});
await fs.writeFile('tests/artifacts/full-book-validation.json',JSON.stringify(report,null,2));
await fs.writeFile('tests/artifacts/full-book-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,navigation:{status:summary.navigation.status,steps:summary.navigation.rows.length}},null,2));
