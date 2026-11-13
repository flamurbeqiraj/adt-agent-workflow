// Runs in the preview browser. Keep this function self-contained for page.evaluate.
export function measurePage(){
  const root=document.querySelector('#content')||document.querySelector('main')||document.body;
  const box=root.getBoundingClientRect(),style=getComputedStyle(root);
  const rect=b=>({x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height),right:Math.round(b.right),bottom:Math.round(b.bottom)});
  const visible=node=>{const s=getComputedStyle(node),b=node.getBoundingClientRect();return b.width>0&&b.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&s.opacity!=='0'&&!node.closest('[aria-hidden="true"],[hidden]');};
  const samples=[...root.querySelectorAll('h1,h2,h3,p,figcaption')].filter(visible).slice(0,30).map(node=>{const b=node.getBoundingClientRect(),s=getComputedStyle(node);return {text:node.textContent.trim().slice(0,120),font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};});
  const text={count:0,minSize:null,under16:[],otherFamilies:[],outsidePage:[],clipped:[]};
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    const content=node.textContent.trim(),parent=node.parentElement;
    if(!content||!parent||/^(SCRIPT|STYLE|NOSCRIPT|TITLE|SVG)$/.test(parent.tagName)||!visible(parent))continue;
    const range=document.createRange();range.selectNodeContents(node);
    const fragments=[...range.getClientRects()].filter(b=>b.width>0&&b.height>0);
    if(!fragments.length)continue;
    const s=getComputedStyle(parent),size=parseFloat(s.fontSize),label=content.slice(0,80);
    text.count++;if(Number.isFinite(size))text.minSize=text.minSize===null?size:Math.min(text.minSize,size);
    if(size<16&&text.under16.length<20)text.under16.push({text:label,size,font:s.fontFamily});
    if(!/^["']?(?:Book)?Poppins["']?(?:,|$)/i.test(s.fontFamily.trim())&&!parent.closest('.fa,.fas,.far,.fab,.fa-solid,.fa-regular,.fa-brands')&&text.otherFamilies.length<20)text.otherFamilies.push({text:label,font:s.fontFamily});
    for(const b of fragments){
      if(root.contains(parent)&&(b.left<box.left-2||b.right>box.right+2||b.top<box.top-2||b.bottom>box.bottom+2)&&text.outsidePage.length<20)text.outsidePage.push(label);
      if(text.clipped.length>=20)continue;
      for(let ancestor=parent;ancestor&&ancestor!==document.body;ancestor=ancestor.parentElement){
        const a=getComputedStyle(ancestor),r=ancestor.getBoundingClientRect();
        if((/hidden|clip/.test(a.overflowX)&&(b.left<r.left-2||b.right>r.right+2))||(/hidden|clip/.test(a.overflowY)&&(b.top<r.top-2||b.bottom>r.bottom+2))){text.clipped.push(label);break;}
      }
    }
  }
  const controls=[...root.querySelectorAll('input:not([type=hidden]),textarea,select,button,[role=button],[role=radio],[role=checkbox]')].filter(visible);
  for(const node of controls){const s=getComputedStyle(node),size=parseFloat(s.fontSize),label=(node.getAttribute('aria-label')||node.textContent||node.id||node.name||node.tagName).trim().slice(0,80);if(size<16&&text.under16.length<20)text.under16.push({text:label,size,font:s.fontFamily});if(!/^["']?(?:Book)?Poppins["']?(?:,|$)/i.test(s.fontFamily.trim())&&text.otherFamilies.length<20)text.otherFamilies.push({text:label,font:s.fontFamily});}
  const images=[...root.querySelectorAll('img')].filter(visible).map(node=>{const b=node.getBoundingClientRect(),src=node.getAttribute('src')||'',vector=/\.svg(?:$|[?#])/i.test(src)||src.startsWith('data:image/svg+xml');return {src,alt:node.getAttribute('alt'),naturalWidth:node.naturalWidth,naturalHeight:node.naturalHeight,displayWidth:Math.round(b.width),displayHeight:Math.round(b.height),vector,sourcePixelsPerCssPixel:vector?null:b.width&&b.height?Number(Math.min(node.naturalWidth/b.width,node.naturalHeight/b.height).toFixed(2)):0};});
  const motion={prefersReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,active:[]};
  if(motion.prefersReducedMotion)for(const node of [root,...root.querySelectorAll('*')]){if(!visible(node))continue;const s=getComputedStyle(node),hasDuration=value=>value.split(',').some(part=>parseFloat(part)>0);if((hasDuration(s.animationDuration)||hasDuration(s.transitionDuration))&&motion.active.length<20)motion.active.push(node.tagName.toLowerCase()+(node.id?'#'+node.id:''));}
  const padding={left:parseFloat(style.paddingLeft)||0,right:parseFloat(style.paddingRight)||0};
  const documentHeight=Math.round(document.documentElement.scrollHeight),viewportHeight=innerHeight;
  return {title:document.title,blank:!root.textContent.trim()&&!root.querySelector('img')||!visible(root),width:innerWidth,viewportHeight,height:documentHeight,scrollHeight:Math.max(0,documentHeight-viewportHeight),scrollWidth:document.documentElement.scrollWidth,contentBox:rect(box),padding,overflow:document.documentElement.scrollWidth>innerWidth+3,missingImages:images.filter(i=>!i.naturalWidth).map(i=>i.src),controls:controls.length,samples,textAudit:text,images,motion,disclosures:{open:root.querySelectorAll('details[open]').length,closed:root.querySelectorAll('details:not([open])').length}};
}
