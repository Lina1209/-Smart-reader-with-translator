const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');

const start=html.indexOf('async function translateXlsxChartStringCaches(');
const end=html.indexOf('\n}',start);
if(start<0||end<0)throw new Error('Excel chart string-cache translator was not found');
const helper=html.slice(start,end+2);
const translated=vm.runInNewContext(helper+'; translateXlsxChartStringCaches',{
 translateDocumentNodeText:async value=>'translated:'+value
});
const valueNode=value=>({textContent:value});
const levelOne=[valueNode('North'),valueNode('South')];
const levelTwo=[valueNode('Q1'),valueNode('Q2')];
const strCache={getElementsByTagNameNS:(ns,tag)=>tag==='v'?levelOne:[]};
const multiLevelCache={getElementsByTagNameNS:(ns,tag)=>tag==='v'?levelTwo:[]};
const document={
 getElementsByTagNameNS:(ns,tag)=>tag==='strCache'?[strCache]:tag==='multiLvlStrCache'?[multiLevelCache]:[]
};
(async()=>{
 const count=await translated(document,'en','fr','progress');
 if(count!==4)throw new Error('Expected four cached chart labels to be translated, got '+count);
 const actual=[...levelOne,...levelTwo].map(node=>node.textContent);
 const expected=['translated:North','translated:South','translated:Q1','translated:Q2'];
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Chart cache labels were not translated in place: '+JSON.stringify(actual));
 const xlsxStart=html.indexOf("}else if(ext==='xlsx'||ext==='xlsm'){",html.indexOf('async function translatePreservingFile('));
 const pptxStart=html.indexOf("}else if(ext==='pptx'){",xlsxStart);
 const xlsx=html.slice(xlsxStart,pptxStart);
 if(!xlsx.includes("await translateXlsxChartStringCaches(doc,from,target,progressId)"))throw new Error('Excel chart string caches are not wired into archive translation');
 if(!html.includes('Комментарии, колонтитулы, текст фигур, сводные кэши и встроенные объекты могут остаться без перевода;'))throw new Error('Excel limitation notice is missing after cached chart label support');
 if(!helper.includes("['strCache','multiLvlStrCache']"))throw new Error('Only explicit string caches should be translated; numeric caches and formulas must remain untouched');
 console.log('Excel chart string-cache translation tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
