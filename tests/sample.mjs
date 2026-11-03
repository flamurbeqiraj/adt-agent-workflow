import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {Store} from '../lib/store.mjs';
import {BrowserService} from '../lib/browser.mjs';
import {structureChecks} from '../lib/adt.mjs';
const origin='http://127.0.0.1:8892';
const list=await(await fetch(origin+'/api/projects')).json();const found=list.find(p=>p.pdfPages===50&&p.pages===107);if(!found)throw Error('Import the supplied example first.');
await fs.mkdir('tests/artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{const page=await browser.newPage({viewport:{width:1600,height:1100}});await page.goto(origin);await page.evaluate(id=>localStorage.setItem('studio.project',id),found.id);await page.reload();await page.locator('.step[data-step="4"]').click();await page.selectOption('#section-picker',{index:8});await page.waitForTimeout(2500);await page.screenshot({path:'tests/artifacts/sample-comparison.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tests/artifacts/sample-comparison-phone.png',fullPage:true});console.log('Comparison screenshots saved.');}finally{await browser.close();}
const store=new Store('.adt-workspace/projects');await store.init();const project=store.get(found.id),service=new BrowserService(store,'http://127.0.0.1:8893');const result={input:project.archiveName,structure:await structureChecks(store,project),pages:[]};
try{for(const href of ['pg007_sec001.html','pg009_sec001.html','pg009_sec002.html','pg012_sec001.html','qz001.html']){for(const width of [1200,390]){const {report}=await service.render(project,href,{width,activity:width===1200});result.pages.push(report);console.log(href,width,report.passed?'render passed':'render needs review',report.activities?.status||'');}}await fs.writeFile('tests/artifacts/sample-results.json',JSON.stringify(result,null,2));}finally{await service.close();}
