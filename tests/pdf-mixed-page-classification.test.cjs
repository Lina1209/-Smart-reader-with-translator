'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('async function openPdfScanPreview(');
const end=html.indexOf('async function openScanImage(',start);
assert.ok(start>=0&&end>start,'PDF preview classifier must exist');
const source=html.slice(start,end).trim();
async function runMixedPdf(){
 const visited=[],cleaned=[];
 let destroyed=0;
 const pdf={
  numPages:4,
  async getPage(number){
   visited.push(number);
   return{
    async getTextContent(){return{items:number===4?[{str:'real text on page four'}]:[]};},
    cleanup(){cleaned.push(number);}
   };
  }
 };
 const task={promise:Promise.resolve(pdf),async destroy(){destroyed++;}};
 const context={
  requestId:7,scanPreview:null,
  ensurePdfLibrary:async()=>({getDocument:()=>task}),
  readFileBuffer:async()=>new ArrayBuffer(0),
  loadPdfScanPage:async()=>{throw new Error('scan preview should not open for a mixed PDF');}
 };
 vm.createContext(context);
 vm.runInContext(source+';globalThis.classifyPdf=openPdfScanPreview;',context);
 const result=await context.classifyPdf({name:'mixed.pdf',size:10},'pdf',7);
 assert.equal(result,false,'a PDF with text on any page must use text extraction, not scan-only preview');
 assert.deepEqual(visited,[1,2,3,4],'classifier must inspect beyond the first three scanned pages');
 assert.deepEqual(cleaned,[1,2,3,4],'every inspected PDF page must be cleaned');
 assert.equal(destroyed,1,'the temporary PDF.js loading task must be destroyed after classification');
}
async function runOversizedPdf(){
 let destroyed=0,requested=0;
 const pdf={numPages:2001,async getPage(){requested++;throw new Error('must not inspect pages over the browser safety limit');}};
 const task={promise:Promise.resolve(pdf),async destroy(){destroyed++;}};
 const context={requestId:9,scanPreview:null,ensurePdfLibrary:async()=>({getDocument:()=>task}),readFileBuffer:async()=>new ArrayBuffer(0)};
 vm.createContext(context);
 vm.runInContext(source+';globalThis.classifyPdf=openPdfScanPreview;',context);
 const result=await context.classifyPdf({name:'huge.pdf',size:10},'pdf',9);
 assert.equal(result,false,'PDFs over 2000 pages must fall through to the explicit extraction limit');
 assert.equal(requested,0,'oversized PDF classification must not iterate through thousands of pages');
 assert.equal(destroyed,1,'oversized PDF loading task must be released');
}
(async()=>{
 await runMixedPdf();
 await runOversizedPdf();
 console.log('PDF mixed-page classification tests passed: text on later pages is detected and oversized PDFs are rejected before page iteration.');
})().catch(error=>{console.error(error);process.exitCode=1;});
