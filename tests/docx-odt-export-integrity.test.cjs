'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
class FakeZip {
  constructor(){this.files={};this.options={};}
  file(name,data,options){this.files[name]=data;this.options[name]=options||{};return this;}
  generateAsync(){return Promise.resolve({files:this.files,options:this.options});}
}
const context={String,Date,Math,ensureZipLibrary:()=>Promise.resolve(FakeZip),escapeXml:value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')};
vm.createContext(context);
const docxStart=html.indexOf('function makeDocxBlob(value){');
const odtStart=html.indexOf('function makeOdtBlob(value){');
const epubStart=html.indexOf('function makeEpubBlob',odtStart);
assert.ok(docxStart>=0&&odtStart>docxStart&&epubStart>odtStart,'DOCX and ODT export helpers must exist');
vm.runInContext(html.slice(docxStart,odtStart)+html.slice(odtStart,epubStart)+';globalThis.makeDocxBlob=makeDocxBlob;globalThis.makeOdtBlob=makeOdtBlob;',context);
(async()=>{
 const sample='Первая строка\r\n\rВторая строка\nТретья & <строка> 😀';
 const docx=await context.makeDocxBlob(sample);
 const odt=await context.makeOdtBlob(sample);
 const dx=docx.files['word/document.xml'];
 const ox=odt.files['content.xml'];
 assert.ok(dx&&dx.includes('<w:document')&&dx.includes('<w:sectPr/>'),'DOCX main document part and section properties must exist');
 assert.ok(dx.includes('<w:p>')&&dx.includes('Первая строка')&&dx.includes('Вторая строка')&&dx.includes('Третья &amp; &lt;строка&gt;'),'DOCX must retain all paragraphs and escape XML text');
 assert.equal((dx.match(/<w:p>/g)||[]).length,4,'DOCX must preserve empty lines as empty paragraphs');
 assert.ok(ox&&ox.includes('<office:document-content')&&ox.includes('<office:body>'),'ODT content document must exist');
 assert.ok(ox.includes('<text:p>Первая строка</text:p>')&&ox.includes('Третья &amp; &lt;строка&gt;'),'ODT must retain paragraphs and escape XML text');
 assert.equal((ox.match(/<text:p>/g)||[]).length,4,'ODT must preserve empty lines as empty paragraphs');
 assert.equal(odt.files.mimetype,'application/vnd.oasis.opendocument.text','ODT mimetype entry must exist');
 assert.equal(odt.options.mimetype.compression,'STORE','ODT mimetype must be stored uncompressed');
 assert.ok(odt.files['META-INF/manifest.xml'].includes('content.xml'),'ODT manifest must declare its content document');
 assert.ok(docx.files['_rels/.rels'].includes('word/document.xml'),'DOCX package relationship must point to the main document');
 console.log('DOCX/ODT export tests passed: package parts, newline normalization, empty paragraphs, XML escaping and MIME.');
})().catch(error=>{console.error(error);process.exitCode=1;});
