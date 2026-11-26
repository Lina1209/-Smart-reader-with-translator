'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function documentArchiveMimeType(ext){');
const end=html.indexOf('async function translatePreservingFile(file,from,target,statusId){',start);
assert.ok(start>=0&&end>start,'Document archive validation helpers must exist');
const source=html.slice(start,end);
const pdfStart=html.indexOf('function createValidatedPdfBlob(bytes){');
const pdfEnd=html.indexOf('async function translatePdfPreservingFile(file,from,target,progressId){',pdfStart);
assert.ok(pdfStart>=0&&pdfEnd>pdfStart,'PDF output validation helper must exist');
const pdfSource=html.slice(pdfStart,pdfEnd);
let safetyChecks=0;
const context={Blob,Error,Number,String,Object,RegExp,Promise,assertZipArchiveSafe(archive){safetyChecks++;assert.ok(archive&&archive.files,'Archive safety check must receive a loaded archive');}};
vm.createContext(context);
vm.runInContext(source+';globalThis.mimeFor=documentArchiveMimeType;globalThis.validateArchive=validateGeneratedDocumentArchive;',context);
vm.runInContext(pdfSource+';globalThis.validatePdf=createValidatedPdfBlob;',context);
function makeArchive(paths,mimetype){
 const files={};
 for(const path of paths)files[path]={dir:false};
 if(mimetype!==undefined)files.mimetype={dir:false};
 return {files,file(path){if(!files[path])return null;return {async:async()=>path==='mimetype'?mimetype:''};}};
}
function fakeZip(archive,{fail=false}={}){
 return {async loadAsync(){if(fail)throw Error('bad zip');return archive;}};
}
const cases=[
 ['docx',['[Content_Types].xml','_rels/.rels','word/document.xml'],'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
 ['odt',['mimetype','content.xml','META-INF/manifest.xml'],'application/vnd.oasis.opendocument.text'],
 ['epub',['mimetype','META-INF/container.xml','OEBPS/content.opf','OEBPS/chapter.xhtml'],'application/epub+zip'],
 ['xlsx',['[Content_Types].xml','xl/workbook.xml'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
 ['xlsm',['[Content_Types].xml','xl/workbook.xml'],'application/vnd.ms-excel.sheet.macroEnabled.12'],
 ['pptx',['[Content_Types].xml','ppt/presentation.xml','ppt/slides/slide1.xml'],'application/vnd.openxmlformats-officedocument.presentationml.presentation']
];
(async()=>{
 for(const [ext,paths,mime] of cases){
  const archive=makeArchive(paths,ext==='odt'?'application/vnd.oasis.opendocument.text':ext==='epub'?'application/epub+zip':undefined);
  const blob=await context.validateArchive(new Blob(['archive']),ext,fakeZip(archive));
  assert.equal(blob.type,mime,ext+' must use its canonical output MIME type');
  assert.ok(blob.size>0,ext+' output must be non-empty');
 }
 assert.equal(context.mimeFor('docx'),cases[0][2]);
 assert.equal(context.mimeFor('pptx'),cases[5][2]);
 const validPdf=context.validatePdf(new Uint8Array([37,80,68,70,45,49,46,55,10]));
 assert.equal(validPdf.type,'application/pdf');
 assert.ok(validPdf.size>=8);
 assert.throws(()=>context.validatePdf(new Uint8Array([1,2,3,4,5,6,7,8])),/сигнатуру/);
 assert.throws(()=>context.validatePdf(new Uint8Array([])),/сигнатуру/);
 await assert.rejects(context.validateArchive(new Blob([]),'docx',fakeZip(makeArchive([]))),/пуст/);
 await assert.rejects(context.validateArchive(new Blob(['bad']),'docx',fakeZip(null,{fail:true})),/повторно открыть/);
 await assert.rejects(context.validateArchive(new Blob(['zip']),'docx',fakeZip(makeArchive(['[Content_Types].xml']))),/word\/document\.xml/);
 await assert.rejects(context.validateArchive(new Blob(['zip']),'epub',fakeZip(makeArchive(['mimetype','META-INF/container.xml','OEBPS/content.opf','OEBPS/ch.xhtml'],'wrong/type'))),/неверный MIME/);
 await assert.rejects(context.validateArchive(new Blob(['zip']),'pptx',fakeZip(makeArchive(['[Content_Types].xml','ppt/presentation.xml']))),/ни один слайд/);
 assert.ok(safetyChecks>=cases.length+5,'Every loaded archive must pass the archive safety gate');
 console.log('Document export integrity tests passed: non-empty archives, ZIP read-back, required package parts, MIME types and malformed-output rejection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
