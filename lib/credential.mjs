import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('./windows-credential.ps1',import.meta.url));

export class CredentialStore {
  constructor(workspace){this.path=path.join(workspace,'.openai-key.dpapi');}
  get supported(){return process.platform==='win32';}
  async exists(){return this.supported&&await fs.stat(this.path).then(()=>true,()=>false);}
  async run(mode,key=''){
    if(!this.supported)throw Error('Remembering a key is available only on Windows.');
    if(mode==='write')await fs.mkdir(path.dirname(this.path),{recursive:true});
    return await new Promise((resolve,reject)=>{
      const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Mode',mode,'-Path',this.path],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      let output='';child.stdout.setEncoding('utf8');
      child.stdout.on('data',part=>output+=part);
      child.stderr.resume();
      child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(Error('Windows could not access the protected key.')));
      child.stdin.end(key);
    });
  }
  async read(){return await this.exists()?this.run('read'):'';}
  async write(key){await this.run('write',key);}
  async delete(){if(await this.exists())await this.run('delete');}
}
