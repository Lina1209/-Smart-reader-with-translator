'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('async function loadPdfScanPage(pageNo){');
const end=html.indexOf('async function openPdfScanPreview(',start);
assert.ok(start>=0&&end>start,'PDF page renderer must exist');
const source=html.slice(start,end).trim();
function makeElement(){return {disabled:false};}
function makeContext(){
 const elements={prevBtn:makeElement(),nextBtn:makeElement(),pageStatus:{textContent:''}};
 const context={
  scanPreview:null,scanShowingCorrected:false,
  $:id=>elements[id]||(elements[id]=makeElement()),
  setProgress(){},createSafePdfViewport:()=>({width:100,height:140}),
  document:{createElement:()=>({width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){}})})},
  detectPageQuadFromCanvas:()=>({accepted:false,confidence:0}),
  rectifyPageCanvas:()=>({accepted:false}),renderScanPreview(){}
 };
 vm.createContext(context);
 vm.runInContext(source+';globalThis.runPage=loadPdfScanPage;',context);
 return {context,elements};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
(async()=>{
 const {context,elements}=makeContext();
 const pending=deferred();let getPageCalls=0,cleanups=0;
 const page={cleanup(){cleanups++;},render(){return{promise:Promise.resolve()};}};
 const state={pageIndex:0,pageCount:3,pdfDocument:{getPage(){getPageCalls++;return pending.promise;}}};
 context.scanPreview=state;
 const first=context.runPage(1);
 assert.equal(state.pageLoading,true,'page load must lock navigation immediately');
 assert.equal(elements.prevBtn.disabled,true);assert.equal(elements.nextBtn.disabled,true);
 const second=context.runPage(2);await second;
 assert.equal(getPageCalls,1,'a second page request must not race an active render');
 pending.resolve(page);await first;
 assert.equal(state.pageIndex,1);assert.equal(state.pageLoading,false);assert.equal(state.page,page);
 assert.equal(elements.prevBtn.disabled,true);assert.equal(elements.nextBtn.disabled,false);
 assert.equal(cleanups,0,'successfully displayed page must remain owned by the preview');
 const failure=new Error('fixture render unavailable');
 state.pdfDocument={getPage:async()=>{throw failure;}};
 await assert.rejects(context.runPage(2),/fixture render unavailable/);
 assert.equal(state.pageIndex,1,'failed navigation must restore the previous page index');
 assert.equal(state.pageLoading,false,'failed navigation must unlock the controls');
 assert.equal(elements.prevBtn.disabled,true);assert.equal(elements.nextBtn.disabled,false);
 const stalePending=deferred();let staleCleanups=0;
 const stalePage={cleanup(){staleCleanups++;}};
 state.pdfDocument={getPage:()=>stalePending.promise};
 const staleRun=context.runPage(2);context.scanPreview=null;
 stalePending.resolve(stalePage);await staleRun;
 assert.equal(staleCleanups,1,'a page resolving after preview release must be cleaned up');
 assert.equal(state.pageLoading,true,'released preview must not mutate its obsolete loading state');
 console.log('PDF page navigation tests passed: serialized requests, failure recovery and stale-page cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
