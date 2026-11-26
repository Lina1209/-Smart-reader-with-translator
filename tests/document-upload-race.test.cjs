'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function bindDocumentUpload(inputId,textareaId,nameId,statusId,progressId){');
const end=html.indexOf("\nbindDocumentUpload('translatorFileInput'",start);
assert.ok(start>=0&&end>start,'document upload binding must exist');
const source=html.slice(start,end);
assert.match(html,/async function extractDocumentText\(file,progressId,openToken,isCurrentOverride\)/,'document extraction must accept a per-upload current-request guard');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
(async()=>{
 const elements=new Map();
 const makeElement=()=>({files:[],value:'',textContent:'',disabled:false,dispatchEvent(){this.dispatched=true;},addEventListener(name,fn){this.listener=fn;}});
 for(const id of ['upload','text','name','status','progress'])elements.set(id,makeElement());
 const pending=new Map(),guards=new Map();
 const context={
  $:id=>elements.get(id),
  resetProgress(){},setProgress(){},
  extractDocumentText(file,progressId,openToken,isCurrent){guards.set(file.name,isCurrent);return pending.get(file.name).promise;},
  preserveSourceFile:null,preservedTranslationBlob:null,
  Event:function(type,options){this.type=type;this.options=options;},
  console:{warn(){}}
 };
 vm.createContext(context);
 vm.runInContext(source+';globalThis.bind=bindDocumentUpload;',context);
 context.bind('upload','text','name','status','progress');
 const input=elements.get('upload');
 const first=deferred(),second=deferred();
 pending.set('first.docx',first);pending.set('second.docx',second);
 input.files=[{name:'first.docx'}];input.value='first.docx';
 const firstRun=input.listener({currentTarget:input});
 input.files=[{name:'second.docx'}];input.value='second.docx';
 const secondRun=input.listener({currentTarget:input});
 assert.equal(guards.get('first.docx')(),false,'the first upload must become stale after a newer selection');
 assert.equal(guards.get('second.docx')(),true,'the latest upload must remain current');
 first.resolve('STALE FIRST DOCUMENT');
 await firstRun;
 assert.equal(elements.get('text').value,undefined,'a stale first upload must not write into the target text area');
 assert.equal(input.value,'second.docx','a stale upload must not clear the newer file selection');
 second.resolve('CURRENT SECOND DOCUMENT');
 await secondRun;
 assert.equal(elements.get('text').value,'CURRENT SECOND DOCUMENT','the latest upload must populate the text area');
 assert.equal(elements.get('name').textContent,'Загружено: second.docx','the latest filename must remain visible');
 assert.equal(input.value,'','the current upload may clear its own file selection when complete');
 console.log('Document upload race tests passed: stale uploads cannot overwrite newer content, progress state or file selection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
