(function(root){
 'use strict';
 function paginateByHeight(value,measureHeight,maxHeight){
  const source=String(value||''),limit=Number(maxHeight);
  if(typeof measureHeight!=='function'||!Number.isFinite(limit)||limit<=0)throw new TypeError('A valid height measurement and positive page height are required');
  if(!source.trim())return {pages:[],offsets:[]};
  const tokens=source.match(/\s+|[^\s]+/gu)||[],pages=[],offsets=[];
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
   const chars=Array.from(token);let cursor=0;
   while(cursor<chars.length){
    let low=1,high=chars.length-cursor,best=0;
    while(low<=high){
     const mid=Math.floor((low+high)/2),candidate=chars.slice(cursor,cursor+mid).join('');
     if(fits(candidate)){best=mid;low=mid+1;}else high=mid-1;
    }
    if(best===0)best=1;
    const prefix=chars.slice(0,cursor).join('');
    const chunk=chars.slice(cursor,cursor+best).join('');
    if(!current)currentOffset=tokenOffset+prefix.length;
    current+=chunk;cursor+=best;
    if(cursor<chars.length)flush();
   }
  }
  flush();
  return {pages,offsets};
 }
 const api={paginateByHeight};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.ReaderPagination=api;
})(typeof globalThis!=='undefined'?globalThis:this);
