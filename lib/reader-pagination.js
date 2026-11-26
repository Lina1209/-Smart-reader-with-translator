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
   const parts=[];let index=0;
   for(const text of Array.from(token)){parts.push({text,index});index+=text.length;}
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
