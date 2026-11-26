'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('async function openFile(file){');
const end=html.indexOf('function closeExisting(){',start);
assert.ok(start>=0&&end>start,'reader file-opening workflow must exist');
const source=html.slice(start,end).trim();
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
function makeContext(openText){
 const calls={close:0,errors:[],progress:[],readerTitle:'',bookMeta:''};
 const context={
  requestId:0,readerOpenPending:false,currentBookType:'',
  resetProgress(){},setProgress(id,p,label,detail){calls.progress.push({p,label,detail});},
  showError(message){calls.errors.push(message);},
  closeExisting(){calls.close++;context.readerOpenPending=false;context.requestId++;},
  showReader(title){calls.readerTitle=title;},
  openText,
  openEpub:async()=>{},openScanImage:async()=>{},openPdfScanPreview:async()=>false,
  closeBook(){calls.closed=true;},
  $:id=>id==='bookMeta'?{set textContent(value){calls.bookMeta=value;},get textContent(){return calls.bookMeta;}}:{},
  console:{error(){}}
 };
 vm.createContext(context);
 vm.runInContext(source+';globalThis.runOpenFile=openFile;',context);
 return{context,calls};
}
(async()=>{
 const pending=deferred();
 const first=makeContext(()=>pending.promise);
 const opening=first.context.runOpenFile({name:'book.txt',type:'text/plain',size:12});
 assert.equal(first.context.readerOpenPending,true,'a supported file should mark its asynchronous open as pending');
 assert.equal(first.calls.close,1);
 await first.context.runOpenFile({name:'archive.exe',type:'application/octet-stream',size:4});
 assert.equal(first.calls.close,2,'selecting an unsupported file must invalidate and clean up an earlier pending open');
 assert.equal(first.context.readerOpenPending,false);
 pending.resolve('stale book text');
 await opening;
 assert.equal(first.calls.bookMeta,'','the stale supported file must not be announced as opened');
 assert.equal(first.calls.progress.some(x=>x.label==='Книга готова'),false,'a cancelled open must not overwrite the unsupported-format error');
 assert.equal(first.calls.errors.length,1);
 assert.match(first.calls.errors[0],/Формат не поддерживается/);

 const unsupported=makeContext(async()=>{});
 await unsupported.context.runOpenFile({name:'legacy.doc',type:'application/msword',size:1});
 assert.equal(unsupported.calls.close,0,'rejecting an unsupported file must not close an already-open reader when no load is pending');

 const successful=makeContext(async()=>{});
 await successful.context.runOpenFile({name:'notes.txt',type:'text/plain',size:5});
 assert.equal(successful.context.readerOpenPending,false,'successful open must clear the pending flag');
 assert.equal(successful.calls.bookMeta,'TXT · файл открыт');
 const oversized=makeContext(async()=>{});
 await oversized.context.runOpenFile({name:'large-scan.pdf',type:'application/pdf',size:100*1024*1024+1});
 assert.equal(oversized.calls.close,0,'an oversized file must not close an already-open reader when no load is pending');
 assert.match(oversized.calls.errors[0],/больше 100 МБ/,'PDF/image preview paths must enforce the browser file-size limit before allocating resources');
 console.log('Reader open cancellation and file-size tests passed: stale requests are cancelled, existing books remain open on rejected selections, and oversized PDF/image files are rejected early.');
})().catch(error=>{console.error(error);process.exitCode=1;});
