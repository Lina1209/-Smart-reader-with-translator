const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');

const start=html.indexOf('async function translatePptxSmartArtDataText(');
const end=html.indexOf('\n}',start);
if(start<0||end<0)throw new Error('PowerPoint SmartArt data-text translator was not found');
const helper=html.slice(start,end+2);
const translate=vm.runInNewContext(helper+'; translatePptxSmartArtDataText',{
 translateDocumentNodeText:async value=>'translated:'+value
});
const drawingNs='http://schemas.openxmlformats.org/drawingml/2006/main';
const makeNode=(text)=>({textContent:text});
const smartArtNodes=[makeNode('Process'),makeNode('Decision'),makeNode('')];
const unrelatedNode=makeNode('Do not translate unrelated XML');
const doc={getElementsByTagNameNS:(ns,tag)=>ns===drawingNs&&tag==='t'?smartArtNodes:[]};
(async()=>{
 const count=await translate(doc,'en','ru','progress');
 if(count!==2)throw new Error('Expected two visible SmartArt strings to be translated, got '+count);
 if(smartArtNodes[0].textContent!=='translated:Process'||smartArtNodes[1].textContent!=='translated:Decision')throw new Error('SmartArt data strings were not translated in place');
 if(smartArtNodes[2].textContent!=='')throw new Error('Empty SmartArt text nodes must remain empty');
 if(unrelatedNode.textContent!=='Do not translate unrelated XML')throw new Error('Unrelated namespace text must remain untouched');
 const writerStart=html.indexOf('async function translatePreservingFile(file,from,target,statusId){');
 const writerEnd=html.indexOf("\n$('standaloneTranslate').addEventListener",writerStart);
 const writer=html.slice(writerStart,writerEnd);
 if(!writer.includes('translatePptxSmartArtDataText(doc,from,target,progressId)'))throw new Error('SmartArt data translation is not wired into PPTX export');
 if(!writer.includes("getPptxTranslatableContentPaths(Object.keys(zip.files))"))throw new Error('PPTX export must process the selected slide and SmartArt data parts');
 if(!html.includes('части SmartArt с настройками макета, стиля и цвета'))throw new Error('PPTX notice must describe remaining non-text SmartArt resources');
 console.log('PowerPoint SmartArt data translation tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
