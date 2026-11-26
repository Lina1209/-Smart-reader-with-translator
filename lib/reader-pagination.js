(function(root){
 'use strict';
 function paginateByHeight(value,measureHeight,maxHeight){
  const source=String(value||''),limit=Number(maxHeight);
  if(typeof measureHeight!=='function'||!Number.isFinite(limit)||limit<=0)throw new TypeError('A valid height measurement and positive page height are required');
  if(!source.trim())return {pages:[],offsets:[]};
  const tokens=source.match(/\s+|[^\s]+/gu)||[],pages=[],offsets=[];
  const splitGraphemes=token=>{
   if(typeof Intl!=='undefined'&&Intl.Segmenter){
    try{return Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(token),part=>({text:part.segment,index:part.index}));}catch(_){}
   }
   const codepoints=[];let sourceIndex=0;
   for(const text of Array.from(token)){const point=text.codePointAt(0);codepoints.push({text,index:sourceIndex,point});sourceIndex+=text.length;}
   const isExtend=point=>(point>=0x0300&&point<=0x036f)||(point>=0x0483&&point<=0x0489)||(point>=0x0591&&point<=0x05bd)||point===0x05bf||(point>=0x05c1&&point<=0x05c2)||(point>=0x0610&&point<=0x061a)||(point>=0x064b&&point<=0x065f)||point===0x0670||(point>=0x06d6&&point<=0x06ed)||(point>=0x0711&&point<=0x0711)||(point>=0x0730&&point<=0x074a)||(point>=0x07a6&&point<=0x07b0)||(point>=0x07eb&&point<=0x07f3)||(point>=0x0816&&point<=0x082d)||(point>=0x0859&&point<=0x085b)||(point>=0x08d3&&point<=0x0903)||(point>=0x093a&&point<=0x093c)||(point>=0x093e&&point<=0x094f)||(point>=0x0951&&point<=0x0957)||(point>=0x0962&&point<=0x0963)||(point>=0x1ab0&&point<=0x1aff)||(point>=0x1dc0&&point<=0x1dff)||(point>=0x20d0&&point<=0x20ff)||(point>=0xfe20&&point<=0xfe2f)||(point>=0xfe00&&point<=0xfe0f)||(point>=0xe0100&&point<=0xe01ef)||(point>=0x1f3fb&&point<=0x1f3ff)||(point>=0xe0020&&point<=0xe007f);
   const isRegional=point=>point>=0x1f1e6&&point<=0x1f1ff;
   const parts=[];let regionalCount=0;
   for(const item of codepoints){
    const previous=parts[parts.length-1],joinsPrevious=!!previous&&(isExtend(item.point)||item.point===0x200d||previous.text.endsWith('\u200d')||(previous.text==='\r'&&item.text==='\n')||(isRegional(item.point)&&isRegional(previous.text.codePointAt(0))&&regionalCount%2===1));
    if(joinsPrevious){previous.text+=item.text;}else parts.push({text:item.text,index:item.index});
    if(isRegional(item.point))regionalCount=isRegional(previous?.text.codePointAt(0))?regionalCount+1:1;else if(!isExtend(item.point)&&item.point!==0x200d)regionalCount=0;
   }
   return parts;
  };
  let current='',currentOffset=0,sourceOffset=0;
  const fits=text=>Number(measureHeight(text))<=limit;
  const flush=()=>{if(current.length){pages.push(current);offsets.push(currentOffset);}current='';};
  for(const token of tokens){
   const tokenOffset=sourceOffset;sourceOffset+=token.length;
   if(fits(current+token)){
    if(!current)currentOffset=tokenOffset;
    current+=token;
    continue;
   }
   if(current.length)flush();
   const graphemes=splitGraphemes(token);let cursor=0;
   while(cursor<graphemes.length){
    let low=1,high=graphemes.length-cursor,best=0;
    while(low<=high){
     const mid=Math.floor((low+high)/2),candidate=graphemes.slice(cursor,cursor+mid).map(part=>part.text).join('');
     if(fits(candidate)){best=mid;low=mid+1;}else high=mid-1;
    }
    if(best===0)best=1;
    const chunk=graphemes.slice(cursor,cursor+best).map(part=>part.text).join('');
    if(!current)currentOffset=tokenOffset+graphemes[cursor].index;
    current+=chunk;cursor+=best;
    if(cursor<graphemes.length)flush();
   }
  }
  flush();
  return {pages,offsets};
 }
 function findPageIndexForOffset(offsets,offset){
  if(!Array.isArray(offsets)||!offsets.length)return 0;
  const target=Math.max(0,Number(offset)||0);
  let low=0,high=offsets.length-1,best=0;
  while(low<=high){
   const mid=Math.floor((low+high)/2);
   if(Number(offsets[mid])<=target){best=mid;low=mid+1;}else high=mid-1;
  }
  return best;
 }
 const api={paginateByHeight,findPageIndexForOffset};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.ReaderPagination=api;
})(typeof globalThis!=='undefined'?globalThis:this);
