export const isReviewed=(project,href)=>!!project.decisions[href]?.humanReviewed&&(!project.decisions[href].reviewedPageSHA256||project.decisions[href].reviewedPageSHA256===project.files[href]);

export function invalidateChangedReviews(project,before,after){
  const changed=new Set([...Object.keys(before),...Object.keys(after)].filter(name=>before[name]!==after[name]));
  const shared=[...changed].some(name=>/\.(?:css|js|mjs)$/.test(name)&&name!=='assets/offline-preloader.js');
  for(const page of project.pages){
    if(shared||changed.has(page.href)){
      if(project.decisions[page.href])project.decisions[page.href].humanReviewed=false;
    }
  }
}
