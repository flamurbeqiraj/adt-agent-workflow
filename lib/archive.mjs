import {unzipSync, zipSync} from 'fflate';
import {createHash} from 'node:crypto';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const decode = value => Buffer.from(value).toString('utf8');
export const bytes = value => typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
export function safePath(value) {
  if(typeof value !== 'string' || !value || value.length > 500 || /[\\\x00-\x1f:]/.test(value) || value.startsWith('/') || value.split('/').some(x=>x==='..'||x==='.'||x==='__proto__'||x==='constructor'||x==='prototype'||!x) || value.split('/').some(x=>/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x)) || /[. ](?:\/|$)/.test(value)) throw Error('Unsafe project path.');
  return value;
}
export function unpack(input) {
  const buffer=Buffer.from(input);
  if(buffer.length>400*1024*1024) throw Error('Choose an archive smaller than 400 MB.');
  let end=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0) throw Error('This file is not a ZIP archive.');
  const count=buffer.readUInt16LE(end+10);let offset=buffer.readUInt32LE(end+16),total=0;
  if(count>15000||count===65535)throw Error('Archive exceeds the 15,000-file limit.');
  const seen=new Set();
  for(let i=0;i<count;i++){
    if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid ZIP directory.');
    const flags=buffer.readUInt16LE(offset+8),compressed=buffer.readUInt32LE(offset+20),size=buffer.readUInt32LE(offset+24),nameLength=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32),attrs=buffer.readUInt32LE(offset+38);
    const name=buffer.subarray(offset+46,offset+46+nameLength).toString('utf8'),clean=name.replace(/\/$/,'');
    if(clean)safePath(clean);
    if(flags&1)throw Error('Encrypted ZIP files are not supported.');
    if(((attrs>>>16)&0xf000)===0xa000)throw Error('Archives cannot contain symbolic links.');
    if(size>160*1024*1024 || size/Math.max(1,compressed)>300)throw Error('Archive contains an oversized or unusually compressed file.');
    total+=size;if(total>900*1024*1024)throw Error('Expanded project exceeds 900 MB.');
    const key=name.toLowerCase();if(seen.has(key))throw Error('Archive contains duplicate paths.');seen.add(key);
    offset+=46+nameLength+extra+comment;
  }
  const files=unzipSync(buffer,{filter:f=>!f.name.endsWith('/')});
  const roots=Object.keys(files).filter(p=>p==='content/pages.json'||p.endsWith('/content/pages.json')).map(p=>p.slice(0,-'content/pages.json'.length));
  if(roots.length!==1)throw Error(roots.length?'Multiple ADT readers found. Upload one reader.':'No ADT content/pages.json found.');
  const root=roots[0];
  return Object.fromEntries(Object.entries(files).filter(([p])=>p.startsWith(root)).map(([p,b])=>[safePath(p.slice(root.length)),Buffer.from(b)]));
}
export function pack(files){return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([p,b])=>[safePath(p),new Uint8Array(b)])),{level:6}));}
