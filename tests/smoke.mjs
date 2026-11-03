import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const origin=process.env.STUDIO_ORIGIN||'http://127.0.0.1:8892';
const projects=await(await fetch(origin+'/api/projects')).json();
const project=projects.find(p=>p.pdfPages===50&&p.pages===107);
assert.ok(project,'Load the sample first.');
let browser;
try{browser=await chromium.launch({headless:true});}catch{browser=await chromium.launch({headless:true,channel:'msedge'});}
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByText('Bring your book').waitFor();
  await page.locator('.subnav [data-action=projects]').click();
  await page.locator(`[data-project="${project.id}"]`).click();
  await page.locator('.step[data-step="4"]').click();
  await page.frameLocator('[data-book-frame=new]').locator('#content').waitFor();
  await page.waitForFunction(()=>{const image=document.querySelector('img.source-page');return image?.complete&&image.naturalWidth>0;});
  await fs.mkdir('tests/artifacts',{recursive:true});
  await page.screenshot({path:'tests/artifacts/final-comparison.png',fullPage:true});
  assert.equal(await page.locator('#section-picker option').count(),107);assert.deepEqual(errors,[]);
  console.log('Final app smoke check passed: sample opens, PDF and live comparisons load, no page errors.');
}finally{await browser.close();}
