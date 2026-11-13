// Read the Unicode cmap from a local static TrueType/OpenType font.
export function missingGlyphs(font,characters){
  const u16=at=>at>=0&&at+2<=font.length?font.readUInt16BE(at):null;
  const u32=at=>at>=0&&at+4<=font.length?font.readUInt32BE(at):null;
  const tables=u16(4);if(tables===null||tables>200)throw Error('Invalid font table directory.');
  let cmap=null;
  for(let i=0;i<tables;i++){const at=12+i*16;if(at+16>font.length)throw Error('Truncated font table directory.');if(font.toString('ascii',at,at+4)==='cmap'){cmap=u32(at+8);break;}}
  if(cmap===null||cmap+4>font.length)throw Error('Font has no Unicode character map.');
  const count=u16(cmap+2),subtables=[];
  if(count===null||count>100)throw Error('Invalid font character map.');
  for(let i=0;i<count;i++){const record=cmap+4+i*8,platform=u16(record),encoding=u16(record+2),relative=u32(record+4),at=cmap+relative,format=u16(at);if((platform===0||platform===3&&(encoding===1||encoding===10))&&[4,12].includes(format))subtables.push({at,format});}
  if(!subtables.length)throw Error('Font has no supported Unicode character map.');
  const contains=(table,code)=>{
    const at=table.at;
    if(table.format===12){const groups=u32(at+12);if(groups===null||groups>100000)return false;let low=0,high=groups-1;while(low<=high){const middle=(low+high)>>1,start=u32(at+16+12*middle),end=u32(at+20+12*middle),glyph=u32(at+24+12*middle);if(start===null||end===null||glyph===null)return false;if(code<start)high=middle-1;else if(code>end)low=middle+1;else return glyph+code-start!==0;}return false;}
    if(code>0xffff)return false;
    const segments=(u16(at+6)||0)/2,endCodes=at+14,startCodes=endCodes+2*segments+2,deltas=startCodes+2*segments,ranges=deltas+2*segments;
    for(let i=0;i<segments;i++){const end=u16(endCodes+2*i),start=u16(startCodes+2*i);if(end===null||start===null)return false;if(code<start||code>end)continue;const delta=u16(deltas+2*i),range=u16(ranges+2*i);if(delta===null||range===null)return false;let glyph;if(range===0)glyph=(code+delta)&0xffff;else{glyph=u16(ranges+2*i+range+2*(code-start));if(glyph===null)return false;if(glyph)glyph=(glyph+delta)&0xffff;}return glyph!==0;}
    return false;
  };
  return [...new Set(characters)].filter(char=>!subtables.some(table=>contains(table,char.codePointAt(0))));
}
