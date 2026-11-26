'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function makeEpubBlob(value,title){');
const end=html.indexOf('function ',start+12);
assert.ok(start>=0&&end>start,'EPUB export helper must exist');
class FakeZip {
  constructor(){this.files={};this.options={};}
  file(name,data,options){this.files[name]=data;this.options[name]=options||{};return this;}
  generateAsync(){return Promise.resolve({files:this.files,options:this.options});}
}
const context={
  Date,
  Math,
  ensureZipLibrary:()=>Promise.resolve(FakeZip),
  escapeXml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
};
vm.createContext(context);
vm.runInContext(html.slice(start,end)+';globalThis.makeEpubBlob=makeEpubBlob;',context);
(async()=>{
  const first=await context.makeEpubBlob('Первая строка\r\n\rВторая строка\nТретья строка','Книга & тест');
  const second=await context.makeEpubBlob('Текст','Книга & тест');
  assert.equal(first.files.mimetype,'application/epub+zip','EPUB mimetype entry must be present');
  assert.equal(first.options.mimetype.compression,'STORE','EPUB mimetype must be stored uncompressed');
  for(const path of ['META-INF/container.xml','OEBPS/content.opf','OEBPS/chapter.xhtml','OEBPS/nav.xhtml'])assert.ok(first.files[path],`Missing EPUB resource: ${path}`);
  const opf=first.files['OEBPS/content.opf'];
  assert.match(opf,/<dc:identifier id="book-id">read-translate-export-[a-z0-9]+-[a-z0-9]+<\/dc:identifier>/,'EPUB identifier must be unique and generated');
  assert.notEqual(opf,second.files['OEBPS/content.opf'],'Repeated exports must not reuse identical metadata');
  const modified=opf.match(/<meta property="dcterms:modified">([^<]+)<\/meta>/);
  assert.ok(modified&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(modified[1]),'EPUB modified timestamp must be a valid UTC timestamp');
  assert.ok(first.files['OEBPS/chapter.xhtml'].includes('<p>Первая строка</p><p></p><p>Вторая строка</p><p>Третья строка</p>'),'EPUB must normalize CRLF, lone CR and LF while retaining blank paragraphs');
  assert.ok(first.files['OEBPS/chapter.xhtml'].includes('<title>Книга &amp; тест</title>'),'EPUB title must be XML-escaped');
  console.log('EPUB export integrity tests passed: package resources, mimetype, paragraph structure and fresh metadata.');
})().catch(error=>{console.error(error);process.exitCode=1;});
