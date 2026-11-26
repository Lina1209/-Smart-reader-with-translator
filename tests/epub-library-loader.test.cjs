'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('let zipLibraryPromise=null,epubLibraryPromise=null;');
const end=html.indexOf('function epubPositionKey(file){',start);
assert.ok(start>=0&&end>start,'EPUB library loader helpers must exist');
const source=html.slice(start,end);
function createContext({failAll=false}={}){
 const window={}; const scripts=[]; let shouldFail=failAll;
 const document={createElement(){return {parentNode:null,src:'',onload:null,onerror:null};},head:{appendChild(script){scripts.push(script);script.parentNode=this;queueMicrotask(()=>{if(shouldFail){script.onerror&&script.onerror();}else if(script.src.includes('jszip')){window.JSZip=function JSZip(){};script.onload&&script.onload();}else{window.ePub=function ePub(){};script.onload&&script.onload();}});},removeChild(script){script.parentNode=null;}}};
 const context={window,document,console:{warn(){}},Promise,Error};
 context.setFail=value=>{shouldFail=value;};
 vm.createContext(context);
 vm.runInContext(source+';globalThis.ensureZip=ensureZipLibrary;globalThis.ensureEpub=ensureEpubLibrary;',context);
 return {context,window,scripts};
}
(async()=>{
 const {context,window,scripts}=createContext();
 const [a,b,c]=await Promise.all([context.ensureEpub(),context.ensureEpub(),context.ensureZip()]);
 assert.equal(a,window.ePub,'EPUB loader must return the library');
 assert.equal(b,a,'parallel EPUB callers must share the same loaded library');
 assert.equal(c,window.JSZip,'ZIP loader must return the library');
 assert.equal(scripts.length,2,'parallel callers must inject only one script per library');
 const retry=createContext({failAll:true});
 await assert.rejects(retry.context.ensureEpub(),/Не удалось загрузить JSZip/);
 assert.equal(retry.scripts.length,2,'failed CDN attempts must both be tried');
 retry.context.setFail(false);
 const lib=await retry.context.ensureEpub();
 assert.equal(lib,retry.window.ePub,'a later call must retry successfully after a failed load');
 assert.equal(retry.scripts.length,4,'retry must load ZIP and EPUB libraries again');
 console.log('EPUB library loader tests passed: concurrent calls are deduplicated and failed loads can be retried.');
})().catch(error=>{console.error(error);process.exitCode=1;});
