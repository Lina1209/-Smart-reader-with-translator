'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function flattenEpubToc(');
const end=html.indexOf('\n}',start)+2;
assert.ok(start>=0&&end>start,'EPUB TOC flattening helper must exist');
const context={};
vm.createContext(context);
vm.runInContext(html.slice(start,end)+';globalThis.flatten=flattenEpubToc;',context);
const entries=context.flatten([
 {label:'Part One',subitems:[
  {label:'Chapter One',href:'  chapter1.xhtml  '},
  {label:'Chapter Two',href:'chapter2.xhtml',children:[
   {title:'Nested Scene',href:'chapter2.xhtml#scene'}
  ]}
 ]},
 {label:'Part Two',href:'part2.xhtml'},
 null,
 {label:'Empty branch',children:[{label:'Final Chapter',href:'final.xhtml'}]}
]);
assert.deepEqual(JSON.parse(JSON.stringify(entries)),[
 {label:'Chapter One',href:'chapter1.xhtml',depth:1},
 {label:'Chapter Two',href:'chapter2.xhtml',depth:1},
 {label:'Nested Scene',href:'chapter2.xhtml#scene',depth:2},
 {label:'Part Two',href:'part2.xhtml',depth:0},
 {label:'Final Chapter',href:'final.xhtml',depth:1}
],'TOC traversal must retain descendant chapters when a parent has no href and preserve document order and nesting');
console.log('EPUB TOC navigation tests passed: nested children survive href-less parent nodes, order is preserved, and hrefs are normalized.');
