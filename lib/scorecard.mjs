const verdict=(bad,review=false)=>bad?'failed':review?'review':'passed';

export function scoreBook(report,project){
  const shells={};
  for(const page of report.pages)for(const view of page.views.filter(v=>v.variant==='default')){const key=`${view.width}x${view.viewportHeight}`;(shells[key]??=[]).push({href:page.href,x:view.contentBox.x,right:view.contentBox.right,width:view.contentBox.width});}
  const sharedShell={};
  for(const [key,rows] of Object.entries(shells)){
    const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
    const target={x:median(rows.map(r=>r.x)),right:median(rows.map(r=>r.right)),width:median(rows.map(r=>r.width))};
    const mismatches=rows.filter(r=>Math.abs(r.x-target.x)>2||Math.abs(r.right-target.right)>2||Math.abs(r.width-target.width)>2);
    sharedShell[key]={target,mismatches,status:mismatches.length?'failed':'passed'};
  }
  for(const page of report.pages){
    const views=page.views,rows=views.flatMap(v=>v.blueprint?.findings||[]),kinds=new Set(rows.map(r=>r.kind)),defaultScroll=views.some(v=>v.variant==='default'&&v.scrollHeight>8);
    const width=views.some(v=>v.variant==='default'&&sharedShell[`${v.width}x${v.viewportHeight}`]?.mismatches.some(r=>r.href===page.href));
    const activityResults=views.map(v=>v.activities?.status).filter(Boolean),activityStatus=activityResults.includes('failed')?'failed':activityResults.includes('review')?'review':activityResults.length?'passed':'not-tested';
    const axe=page.accessibility?.violations||[];
    page.scorecard={
      width:verdict(width||views.some(v=>v.overflow)),
      heightScroll:verdict(false,defaultScroll),
      padding:verdict(kinds.has('unbalanced-padding')),
      font:verdict(kinds.has('small-text')||kinds.has('font-family')),
      contrast:verdict(axe.some(v=>v.id==='color-contrast'),axe.some(v=>v.id==='color-contrast-enhanced')),
      shapes:project.decisions[page.href]?.humanReviewed?'human-reviewed':'not-tested',
      imageQuality:verdict(views.some(v=>v.missingImages.length),kinds.has('image-resolution')),
      contentOwnership:verdict(kinds.has('content-ownership')||kinds.has('clipped-content')),
      navigation:report.navigation?.status||'not-tested',
      activity:activityStatus,
      accessibility:verdict(axe.length>0||kinds.has('reduced-motion'),!!page.accessibility?.incomplete?.length)
    };
  }
  report.sharedShell=sharedShell;
  return report;
}
