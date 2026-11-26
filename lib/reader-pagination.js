(function(root){
 'use strict';
 function paginateByHeight(value,measureHeight,maxHeight){
  const source=String(value||''),limit=Number(maxHeight);
  if(typeof measureHeight!=='function'||!Number.isFinite(limit)||limit<=0)throw new TypeError('A valid height measurement and positive page height are required');
  if(!source.trim())return {pages:[],offsets:[]};
  const tokens=source.match(/\\s+|[^\\s]+/gu)||[],pages=[],offsets=[];
  let current='',currentOffset=0,sourceOffset=0;
  const fits=text=>Number(measureHeight(text))<=limit;
  const flush=()=>{if(current.trim()){pages.push(current.trim());offsets.push(currentOffset);}current='';};
  for(const token of tokens){
   const tokenOffset=sourceOffset;sourceOffset+=token.length;
   let piece=token,pieceOffset=tokenOffset;
   if(!fits(current+piece)&&current.trim()){
    flush();
    const leading=(piece.match(/^\\s+/u)||[''])[0].length;
    piece=piece.slice(leading);pieceOffset+=leading;
   }
   if(!piece)continue;
   if(fits(current+piece)){
    if(!current)currentOffset=pieceOffset;
    current+=piece;
    continue;
   }
   if(current.trim())flush();
   const chars=Array.from(piece);let cursor=0;
   while(cursor<chars.length){
    let low=1,high=chars.length-cursor,best=0;
    while(low<=high){
     const mid=Math.floor((low+high)/2),candidate=chars.slice(cursor,cursor+mid).join('');
     if(fits(candidate)){best=mid;low=mid+1;}else high=mid-1;
    }
    if(best===0)best=1;
    const chunk=chars.slice(cursor,cursor+best).join('');
    if(!current)currentOffset=pieceOffset+chars.slice(0,cursor).join('').length;
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
