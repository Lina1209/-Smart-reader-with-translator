'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function safelyReleasePdfResource(');
const end=html.indexOf('function renderScanPreview()',start);
assert.ok(start>=0&&end>start,'PDF preview cleanup helpers must exist');
const source=html.slice(start,end);
const display={width:10,height:10,style:{width:'10px',height:'10px'}};
const context={scanPreview:null,scanZoom:2,scanShowingCorrected:true,$:()=>display};
vm.createContext(context);
vm.runInContext(source+';globalThis.release=releaseScanPreview;',context);
(async()=>{
 const unhandled=[];
 const onUnhandled=reason=>unhandled.push(reason);
 process.on('unhandledRejection',onUnhandled);
 let pageCleanups=0,destroyCalls=0,canvasReleases=0;
 const canvas={set width(value){if(value===0)canvasReleases++;},set height(value){if(value===0)canvasReleases++;}};
 const state={
  original:canvas,corrected:null,
  page:{cleanup(){pageCleanups++;}},
  pdfLoadingTask:{destroy(){destroyCalls++;return Promise.reject(new Error('late PDF destroy failure'));}}
 };
 context.scanPreview=state;
 context.release();
 assert.equal(context.scanPreview,null,'preview ownership must be released synchronously');
 assert.equal(pageCleanups,1);
 assert.equal(destroyCalls,1);
 assert.equal(canvasReleases,2);
 assert.equal(context.scanZoom,1);
 assert.equal(context.scanShowingCorrected,false);
 assert.equal(display.width,0);
 context.release();
 assert.equal(destroyCalls,1,'releasing an already released preview must be idempotent');
 await new Promise(resolve=>setTimeout(resolve,20));
 process.removeListener('unhandledRejection',onUnhandled);
 assert.deepEqual(unhandled,[],'rejected asynchronous PDF destroy must be handled');
 let cleanupCalls=0;
 context.scanPreview={pdfDocument:{cleanup(){cleanupCalls++;return Promise.reject(new Error('late cleanup failure'));}}};
 context.release();
 assert.equal(cleanupCalls,1,'document cleanup must run when no loading task is retained');
 let syncCalls=0;
 context.scanPreview={pdfLoadingTask:{destroy(){syncCalls++;throw new Error('synchronous destroy failure');}}};
 assert.doesNotThrow(()=>context.release(),'synchronous cleanup failures must not interrupt preview release');
 assert.equal(syncCalls,1);
 console.log('PDF preview lifecycle tests passed: synchronous release, rejected cleanup handling, idempotence and fallback cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
