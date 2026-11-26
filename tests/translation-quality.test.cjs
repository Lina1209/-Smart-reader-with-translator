const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const match=html.match(/function parseTranslationGlossary\(\)\{[\s\S]*?(?=async function requestTranslationChunk\(text,from,to\)\{)/);
if(!match)throw new Error('Glossary and retry helpers not found');
let glossary='New York = Нью-Йорк\nOpenAI = OpenAI\nC++ = Си-плюс-плюс';
const helpers=vm.runInNewContext('(()=>{'+match[0]+';return {parseTranslationGlossary,protectGlossaryTerms,restoreGlossaryTerms,isRetryableTranslationError}})()', {
 $:()=>({value:glossary}),
 translationEngine:'mymemory'
});
const input='I live in New York. OpenAI uses C++ and a new york office.';
const protectedValue=helpers.protectGlossaryTerms(input);
if(protectedValue.text===input||protectedValue.tokens.length!==4)throw new Error('Glossary terms were not protected');
const deskewRestored=helpers.restoreGlossaryTerms(protectedValue.text,protectedValue.tokens);
if(deskewRestored!=='I live in Нью-Йорк. OpenAI uses Си-плюс-плюс and a Нью-Йорк office.')throw new Error('Glossary terms were not deskewRestored exactly: '+deskewRestored);
const sorted=helpers.parseTranslationGlossary();
if(sorted[0].source!=='New York')throw new Error('Longer glossary phrases must be matched first');
if(!helpers.isRetryableTranslationError(new Error('MyMemory недоступен (HTTP 503).')))throw new Error('HTTP 503 should be retried');
if(helpers.isRetryableTranslationError(new Error('MyMemory ограничил запросы или дневная квота исчерпана.')))throw new Error('Quota errors must not be retried');
const cacheStart=html.indexOf('function translationCacheKey(');
const cacheEnd=html.indexOf('\n}',cacheStart);
if(cacheStart<0||cacheEnd<0)throw new Error('Translation cache key helper not found');
const cacheSource=html.slice(cacheStart,cacheEnd+2);
let endpoint='https://one.example',glossaryValue='term = перевод';
const cacheContext={translationEngine:'libretranslate',$:(id)=>({value:id==='libreTranslateEndpoint'?endpoint:glossaryValue})};
const cacheKey=vm.runInNewContext(cacheSource+'; translationCacheKey',cacheContext);
const key1=cacheKey('source','en','ru');
endpoint='https://two.example';
const key2=cacheKey('source','en','ru');
if(key1===key2)throw new Error('Different translation endpoints must not share cached translations');
glossaryValue='term = термин';
const key3=cacheKey('source','en','ru');
if(key2===key3)throw new Error('Different glossary settings must not share cached translations');
const runStart=html.indexOf('function distributeTranslationAcrossRuns(');
const runEnd=html.indexOf('\n}',runStart);
if(runStart<0||runEnd<0)throw new Error('DOCX formatted-run helper not found');
const distribute=vm.runInNewContext(html.slice(runStart,runEnd+2)+'; distributeTranslationAcrossRuns');
const runs=[{nodeValue:'Bold source '},{nodeValue:'and italic source'},{nodeValue:' tail'}];
const translated='  Gras   texte\navec tab\t et fin  ';
distribute(translated,runs);
if(runs.map(x=>x.nodeValue).join('')!==translated)throw new Error('DOCX run redistribution changed spaces, tabs or line breaks');
const blankRuns=[{nodeValue:'first'},{nodeValue:'second'}];
distribute('   ',blankRuns);
if(blankRuns.map(x=>x.nodeValue).join('')!=='   ')throw new Error('Whitespace-only translated paragraphs were not preserved');
if(!html.includes("['p','h1','h2','h3','h4','h5','h6','li','blockquote','figcaption','caption','dt','dd']"))throw new Error('EPUB block coverage missing');
if(!html.includes(".sort((a,b)=>Number(a.match(/slide(\\d+)/i)?.[1]||0)-Number(b.match(/slide(\\d+)/i)?.[1]||0))"))throw new Error('PPTX numeric slide ordering missing');
const pdfStart=html.indexOf('function pdfTextItemsToPlainText(');
const pdfEnd=html.indexOf('\n}',pdfStart);
if(pdfStart<0||pdfEnd<0)throw new Error('PDF text extraction helper not found');
const pdfText=vm.runInNewContext(html.slice(pdfStart,pdfEnd+2)+'; pdfTextItemsToPlainText');
const extracted=pdfText([{str:'First',hasEOL:false},{str:'line',hasEOL:true},{str:'Second',hasEOL:false},{str:'line',hasEOL:true}]);
if(extracted!=='First line\nSecond line')throw new Error('PDF line boundaries were not preserved: '+JSON.stringify(extracted));
const single=pdfText([{str:'A',hasEOL:false},{str:'  B',hasEOL:true},{str:'C',hasEOL:true}]);
if(single!=='A B\nC')throw new Error('PDF text spacing was not normalized safely: '+JSON.stringify(single));
const boxStart=html.indexOf('function restoreOcrBox(');
const boxEnd=html.indexOf('\n',boxStart);
if(boxStart<0||boxEnd<0)throw new Error('OCR bounding-box transform not found');
const restoreBox=vm.runInNewContext(html.slice(boxStart,boxEnd)+'; restoreOcrBox');
const deskewOriginalBox={x0:10,y0:20,x1:30,y1:40};
const expectedBoxes=[
 [0,{x0:10,y0:20,x1:30,y1:40}],
 [90,{x0:20,y0:170,x1:40,y1:190}],
 [180,{x0:70,y0:160,x1:90,y1:180}],
 [270,{x0:60,y0:10,x1:80,y1:30}]
];
for(const [angle,expected] of expectedBoxes){
 const actual=restoreBox(deskewOriginalBox,angle,100,200);
 if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('OCR box rotation '+angle+'° incorrect: '+JSON.stringify(actual));
}
if(!html.includes('image\\/(png|jpeg|webp|gif)')||!html.includes("file.type==='image/gif'?'image/png'"))throw new Error('GIF first-frame OCR and PNG output support missing');
const tokenStart=html.indexOf('function translationLayoutTokens(');
const tokenEnd=html.indexOf('\n',tokenStart);
if(tokenStart<0||tokenEnd<0)throw new Error('CJK layout tokenizer not found');
const layoutTokens=vm.runInNewContext(html.slice(tokenStart,tokenEnd)+'; translationLayoutTokens');
const cjkTokens=layoutTokens('日本語の文章','ja');
if(cjkTokens.join('')!=='日本語の文章'||cjkTokens.length!==6)throw new Error('Japanese text was not segmented for natural line wrapping');
const validStart=html.indexOf('function isValidOcrBox(');
const validEnd=html.indexOf('\n',html.indexOf('function ocrLines(',validStart));
if(validStart<0||validEnd<0)throw new Error('OCR bounding-box validation helpers not found');
const ocrHelpers=vm.runInNewContext(html.slice(validStart,validEnd)+'; ({isValidOcrBox,ocrLines})');
if(!ocrHelpers.isValidOcrBox({x0:0,y0:0,x1:10,y1:10})||ocrHelpers.isValidOcrBox({x0:5,y0:0,x1:2,y1:10})||ocrHelpers.isValidOcrBox({x0:0,y0:0,x1:NaN,y1:10}))throw new Error('OCR bounding-box validation failed');
const filtered=ocrHelpers.ocrLines({lines:[{text:'valid',confidence:90,bbox:{x0:0,y0:0,x1:10,y1:10}},{text:'invalid box',confidence:99,bbox:{x0:5,y0:5,x1:2,y1:2}}]});
if(filtered.length!==1||filtered[0].text!=='valid')throw new Error('OCR accepted an invalid bounding box');
const scaleStart=html.indexOf('function scaleOcrBox(');
const scaleEnd=html.indexOf('\n',scaleStart);
if(scaleStart<0||scaleEnd<0)throw new Error('OCR coordinate scaling helper not found');
const scaleBox=vm.runInNewContext(html.slice(scaleStart,scaleEnd)+'; scaleOcrBox');
const scaledBack=scaleBox({x0:15,y0:30,x1:90,y1:120},1.5);
if(JSON.stringify(scaledBack)!==JSON.stringify({x0:10,y0:20,x1:60,y1:80}))throw new Error('Enhanced OCR coordinates were not mapped to original image size');
if(!html.includes('createEnhancedOcrCanvas(ocrCanvas,1.5)'))throw new Error('Enhanced OCR fallback is not wired into recognition');
const qualityStart=html.indexOf('function ocrQualitySummary(');
const qualityEnd=html.indexOf('\n',qualityStart);
if(qualityStart<0||qualityEnd<0)throw new Error('OCR quality summary helper not found');
const qualitySummary=vm.runInNewContext(html.slice(qualityStart,qualityEnd)+'; ocrQualitySummary',{isValidOcrBox:box=>!!box&&['x0','y0','x1','y1'].every(key=>Number.isFinite(Number(box[key])))&&Number(box.x1)>Number(box.x0)&&Number(box.y1)>Number(box.y0)});
const quality=qualitySummary({lines:[
 {text:'clear',confidence:90,bbox:{x0:0,y0:0,x1:20,y1:10}},
 {text:'uncertain',confidence:10,bbox:{x0:0,y0:12,x1:20,y1:22}},
 {text:'invalid box',confidence:99,bbox:{x0:0,y0:2,x1:0,y1:5}}
]});
if(quality.detected!==3||quality.valid!==2||quality.accepted!==1||quality.rejected!==2||quality.averageConfidence!==90)throw new Error('OCR quality summary does not report rejected or invalid text correctly');
if(!html.includes('Страница '+"'+pageNo+'"+': распознано'))throw new Error('PDF OCR warning for low-confidence pages is missing');

const drawStart=html.indexOf('function drawTranslationInBox(');
const drawEnd=html.indexOf('\nfunction ocrQualitySummary',drawStart);
if(drawStart<0||drawEnd<0)throw new Error('OCR translated-text layout helper not found');
const draw=vm.runInNewContext(html.slice(drawStart,drawEnd)+'; drawTranslationInBox',{
 translationLayoutTokens:value=>Array.from(String(value)),
});
const mockContext={
 font:'10px Arial',save(){},restore(){},beginPath(){},rect(){},clip(){},
 measureText:value=>({width:String(value).length*5}),
 fillText(){},translate(){},scale(){}
};
const overflow=draw(mockContext,'abcdefghijklmnopqrst',0,0,10,5,'en');
if(!overflow||overflow.overflow!==true||overflow.lineCount<2)throw new Error('OCR translation overflow was not detected for a box that cannot contain the translated text');
const fit=draw(mockContext,'OK',0,0,100,30,'en');
if(!fit||fit.overflow!==false)throw new Error('OCR translation helper incorrectly flagged a text that fits its source box');
if(!html.includes('ВНИМАНИЕ ВЁРСТКА:')||!html.includes('layoutWarnings.push'))throw new Error('OCR layout-overflow warnings are not surfaced to users');


const layoutStart=html.indexOf('function ocrLayoutSummary(');
const layoutEnd=html.indexOf('\nfunction ocrQualitySummary',layoutStart);
if(layoutStart<0||layoutEnd<0)throw new Error('OCR layout diagnostics helper not found');
const layoutSummary=vm.runInNewContext(html.slice(layoutStart,layoutEnd)+'; ocrLayoutSummary',{
 ocrLines:data=>(data.lines||[]).filter(line=>String(line.text||'').trim()&&line.confidence>=15&&line.bbox&&line.bbox.x1>line.bbox.x0&&line.bbox.y1>line.bbox.y0).map(line=>({text:line.text,box:line.bbox,confidence:line.confidence}))
});
const makeLine=(text,x0,y0,x1,y1)=>({text,confidence:95,bbox:{x0,y0,x1,y1}});
const twoColumns=[];
for(let row=0;row<6;row++){twoColumns.push(makeLine('left '+row,10,10+row*20,110,22+row*20));twoColumns.push(makeLine('right '+row,260,10+row*20,360,22+row*20));}
if(!layoutSummary({lines:twoColumns}).multiColumn)throw new Error('OCR layout diagnostics failed to flag a synthetic two-column page');
const table=[];
for(let row=0;row<4;row++){table.push(makeLine('cell A'+row,10,10+row*24,90,21+row*24));table.push(makeLine('cell B'+row,130,10+row*24,210,21+row*24));}
if(!layoutSummary({lines:table}).tableLike)throw new Error('OCR layout diagnostics failed to flag a synthetic aligned table-like layout');
const twoColumnSummary=layoutSummary({lines:twoColumns});
if(twoColumnSummary.columnCount!==2||twoColumnSummary.confidence!=='medium')throw new Error('Two-column OCR diagnostics did not report stable column geometry');
const tableSummary=layoutSummary({lines:table});
if(!tableSummary.tableLike||tableSummary.multiColumn||tableSummary.columnCount!==2)throw new Error('Table-like OCR rows were confused with widely separated text columns');
const singleColumn=[];
for(let row=0;row<8;row++)singleColumn.push(makeLine('paragraph line '+row,12,10+row*22,340,22+row*22));
const singleSummary=layoutSummary({lines:singleColumn});
if(singleSummary.multiColumn||singleSummary.tableLike)throw new Error('Single-column text was incorrectly classified as a table or multiple columns');
const sparseSideBySide=[makeLine('left heading',10,10,100,22),makeLine('right note',260,10,350,22),makeLine('caption',10,60,340,72)];
if(layoutSummary({lines:sparseSideBySide}).multiColumn)throw new Error('A single side-by-side pair was incorrectly classified as a multi-column page');
const renderScaleStart=html.indexOf('function createSafePdfViewport(');
const renderScaleEnd=html.indexOf('\n',renderScaleStart);
if(renderScaleStart<0||renderScaleEnd<0)throw new Error('Adaptive PDF render-scale helper not found');
const safeViewport=vm.runInNewContext(html.slice(renderScaleStart,renderScaleEnd)+'; createSafePdfViewport');
const mockPage=(width,height)=>({getViewport:({scale})=>({width:width*scale,height:height*scale,scale})});
const ordinaryViewport=safeViewport(mockPage(612,792),1.4,16000000);
if(ordinaryViewport.scale!==1.4)throw new Error('Ordinary PDF pages should retain the preferred OCR render scale');
const oversizedViewport=safeViewport(mockPage(20000,18000),1.4,16000000);
if(oversizedViewport.width*oversizedViewport.height>16000000.01||oversizedViewport.scale>=1.4)throw new Error('Oversized PDF pages were not constrained to the pixel budget');
if(!html.includes('createSafePdfViewport(page,1.4)')||!html.includes('createSafePdfViewport(page,1.35)'))throw new Error('Adaptive PDF render scale is not used by both PDF OCR paths');


if(!html.includes('Страница '+"'+pageNo+'"+': распознано')||!html.includes('safeToTranslate&&lineNo<replacementLines.length'))throw new Error('Low-confidence PDF pages are not explicitly kept untranslated');
if(!html.includes('вероятная многоколоночная структура')||!html.includes('вероятная табличная структура'))throw new Error('Complex OCR layout warnings are not surfaced');
if(!html.includes('safeToTranslate&&i<replacementLines.length')||!html.includes('Изображение сохранено без замены текста'))throw new Error('Low-confidence image scans are not kept unchanged');

const pdfPipelineStart=html.indexOf('async function translatePdfPreservingFile(');
const pdfPipelineEnd=html.indexOf('\nasync function translateImagePreservingFile',pdfPipelineStart);
if(pdfPipelineStart<0||pdfPipelineEnd<0)throw new Error('PDF reconstruction pipeline not found for resource-lifecycle test');
const pdfPipeline=html.slice(pdfPipelineStart,pdfPipelineEnd);
if(!pdfPipeline.includes('try{const ctx=canvas.getContext')||!pdfPipeline.includes('finally{try{page.cleanup();}catch(e){}canvas.width=canvas.height=0;}'))throw new Error('PDF page canvas is not released in a per-page finally block');
if(!pdfPipeline.includes('if(ocrWorker)await ocrWorker.terminate()'))throw new Error('Shared OCR worker is not terminated in the outer finally block');
const imagePipelineStart=html.indexOf('async function translateImagePreservingFile(');
const imagePipelineEnd=html.indexOf('function pdfTextItemsToPlainText',imagePipelineStart);
if(imagePipelineStart<0||imagePipelineEnd<0)throw new Error('Image OCR pipeline not found for resource-lifecycle test');
const imagePipeline=html.slice(imagePipelineStart,imagePipelineEnd);
if(!imagePipeline.includes('try{const ocr=await recognizeImageCanvas')||!imagePipeline.includes('finally{canvas.width=canvas.height=0;}'))throw new Error('Image OCR canvas is not released in a finally block');

const deskewStart=html.indexOf('function createDeskewCanvas(');
const deskewEnd=html.indexOf('function restoreOcrBox(',deskewStart);
if(deskewStart<0||deskewEnd<0)throw new Error('Fine-angle deskew helpers not found');
const deskewSource=html.slice(deskewStart,deskewEnd)+html.slice(html.indexOf('function restoreDeskewBox(',deskewEnd),html.indexOf('\nfunction scaleOcrBox',deskewEnd));
const deskewHelpers=vm.runInNewContext(deskewSource+'; ({createDeskewCanvas,restoreDeskewBox})');
const fineAngleOriginalBox={x0:30,y0:40,x1:130,y1:70},deskewRadians=3*Math.PI/180,fineAngleRotW=Math.ceil(200*Math.cos(deskewRadians)+100*Math.sin(deskewRadians)),fineAngleRotH=Math.ceil(200*Math.sin(deskewRadians)+100*Math.cos(deskewRadians));
const fineAngleRotatedCorners=[[30,40],[130,40],[30,70],[130,70]].map(([x,y])=>{const dx=x-100,dy=y-50;return[dx*Math.cos(deskewRadians)-dy*Math.sin(deskewRadians)+fineAngleRotW/2,dx*Math.sin(deskewRadians)+dy*Math.cos(deskewRadians)+fineAngleRotH/2]});
const fineAngleRotatedBox={x0:Math.min(...fineAngleRotatedCorners.map(p=>p[0])),y0:Math.min(...fineAngleRotatedCorners.map(p=>p[1])),x1:Math.max(...fineAngleRotatedCorners.map(p=>p[0])),y1:Math.max(...fineAngleRotatedCorners.map(p=>p[1]))};
const fineAngleRestored=deskewHelpers.restoreDeskewBox(fineAngleRotatedBox,3,200,100,fineAngleRotW,fineAngleRotH);
const sourceCenterX=(fineAngleOriginalBox.x0+fineAngleOriginalBox.x1)/2,sourceCenterY=(fineAngleOriginalBox.y0+fineAngleOriginalBox.y1)/2,restoredCenterX=(fineAngleRestored.x0+fineAngleRestored.x1)/2,restoredCenterY=(fineAngleRestored.y0+fineAngleRestored.y1)/2;if(Math.abs(restoredCenterX-sourceCenterX)>1||Math.abs(restoredCenterY-sourceCenterY)>1||fineAngleRestored.x0>fineAngleOriginalBox.x0+1||fineAngleRestored.y0>fineAngleOriginalBox.y0+1||fineAngleRestored.x1<fineAngleOriginalBox.x1-1||fineAngleRestored.y1<fineAngleOriginalBox.y1-1)throw new Error('Deskew bounding-box center or coverage was not restored to the source image');
if(!html.includes('if(bestScore<65)')||!html.includes('for(const angle of [-3,-1.5,1.5,3])'))throw new Error('Fine-angle deskew fallback is not confidence-gated');

if(!html.includes('function createThresholdOcrCanvas(')||!html.includes('createThresholdOcrCanvas(ocrCanvas,1.5)'))throw new Error('Adaptive threshold OCR fallback is missing');
if(!html.includes('enhancedScale=enhanced.width/ocrCanvas.width')||!html.includes('scaleOcrBox(line.bbox,enhancedScale)'))throw new Error('Enhanced OCR boxes do not use the actual bounded preprocessing scale');

const languageHelperStart=html.indexOf('function ocrLanguageForCode('),languageHelperEnd=html.indexOf('\nfunction rotateCanvasForOcr',languageHelperStart);
if(languageHelperStart<0||languageHelperEnd<0)throw new Error('OCR language mapping helper not found');
const languageMapper=vm.runInNewContext(html.slice(languageHelperStart,languageHelperEnd)+'; ocrLanguageForCode');
for(const [input,expected] of [['ru-RU','rus'],['kk-KZ','kaz'],['en','eng'],['zh-CN','chi_sim'],['ja','jpn'],['ar','ara'],['hi','hin'],['fr-FR','fra']])if(languageMapper(input)!==expected)throw new Error('Incorrect OCR model for '+input+': '+languageMapper(input));
if(languageMapper('auto')!=='eng+rus+kaz')throw new Error('Automatic OCR fallback must include English, Russian and Kazakh');

const safeOcrScaleUnderTestHelperStart=html.indexOf('function safeOcrScale('),safeOcrScaleUnderTestHelperEnd=html.indexOf('\nfunction createEnhancedOcrCanvas',safeOcrScaleUnderTestHelperStart);
if(safeOcrScaleUnderTestHelperStart<0||safeOcrScaleUnderTestHelperEnd<0)throw new Error('Safe OCR scaling helper not found');
const safeOcrScaleUnderTest=vm.runInNewContext(html.slice(safeOcrScaleUnderTestHelperStart,safeOcrScaleUnderTestHelperEnd)+'; safeOcrScale');
if(safeOcrScaleUnderTest({width:1000,height:1000},1.5,16000000)!==1.5)throw new Error('Safe OCR scale changed ordinary image dimensions unnecessarily');
if(safeOcrScaleUnderTest({width:10000,height:10000},1.5,16000000)>0.400001)throw new Error('Safe OCR scale exceeded its pixel budget');



console.log('Translation quality tests passed: glossary parsing, longest-first matching, exact term restoration and retry classification.');
 
 const replacementHelperStart=html.indexOf('function isValidOcrBox('),replacementHelperEnd=html.indexOf('async function ensurePdfLib',replacementHelperStart);
 if(replacementHelperStart<0||replacementHelperEnd<0)throw new Error('OCR replacement confidence helper not found');
 const replacementHelpers=vm.runInNewContext(html.slice(replacementHelperStart,replacementHelperEnd)+'; ({ocrLines,ocrLinesForReplacement})');
 const confidenceSample={lines:[
  {text:'Reliable heading',confidence:96,bbox:{x0:10,y0:10,x1:200,y1:40}},
  {text:'Uncertain word',confidence:34,bbox:{x0:10,y0:50,x1:100,y1:80}},
  {text:'Very uncertain',confidence:14,bbox:{x0:10,y0:90,x1:100,y1:120}},
  {text:'Invalid box',confidence:99,bbox:{x0:10,y0:140,x1:10,y1:160}}
 ]};
 const acceptedReplacementLines=replacementHelpers.ocrLinesForReplacement(confidenceSample,35);
 if(acceptedReplacementLines.length!==1||acceptedReplacementLines[0].text!=='Reliable heading')throw new Error('OCR reconstruction confidence filter did not preserve its configured threshold and valid-box rules');
 if(!html.includes('replacementLines=ocrLinesForReplacement(ocr,35)')||!html.includes('for(let lineNo=0;safeToTranslate&&lineNo<replacementLines.length;lineNo++)')||!html.includes('for(let i=0;safeToTranslate&&i<replacementLines.length;i++)'))throw new Error('PDF/image reconstruction does not consistently skip low-confidence OCR lines');


const boundedStart=html.indexOf('function createBoundedOcrCanvas('),boundedEnd=html.indexOf('async function recognizeImageCanvas(',boundedStart);
if(boundedStart<0||boundedEnd<0)throw new Error('Bounded OCR input helper not found');
const boundedHelpers=vm.runInNewContext(html.slice(boundedStart,boundedEnd)+'; ({createBoundedOcrCanvas,restoreBoundedOcrBoxes})',{
 document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})}
});
const boundedSource={width:8000,height:6000},bounded=boundedHelpers.createBoundedOcrCanvas(boundedSource,16000000);
if(!bounded.owned||bounded.canvas.width*bounded.canvas.height>16000000||bounded.scaleX>=1||bounded.scaleY>=1)throw new Error('Large source images must be downscaled before the first OCR pass');
const restored=boundedHelpers.restoreBoundedOcrBoxes({lines:[{bbox:{x0:10,y0:20,x1:30,y1:40}}]},bounded.scaleX,bounded.scaleY).lines[0].bbox;
if(Math.abs(restored.x0-10/bounded.scaleX)>.001||Math.abs(restored.y1-40/bounded.scaleY)>.001)throw new Error('OCR bounding boxes were not mapped back to original image coordinates');
const ordinary=boundedHelpers.createBoundedOcrCanvas({width:1000,height:1000},16000000);
if(ordinary.owned||ordinary.canvas.width!==1000)throw new Error('Small images should not be copied unnecessarily');
if(!html.includes('createBoundedOcrCanvas(canvas)')||!html.includes('restoreBoundedOcrBoxes(best,boundedInput.scaleX,boundedInput.scaleY)'))throw new Error('Bounded OCR input is not connected to recognition and source-coordinate restoration');

const workerStart=html.indexOf('async function createOcrWorker('),workerEnd=html.indexOf('\nfunction ocrLanguageForCode',workerStart);
if(workerStart<0||workerEnd<0)throw new Error('OCR worker fallback helper not found');
const workerFactory=vm.runInNewContext(html.slice(workerStart,workerEnd)+'; createOcrWorker');
const attempts=[];
const mockTesseract={createWorker:async language=>{attempts.push(language);if(language==='eng+rus+kaz'||language==='eng+rus')throw new Error('traineddata unavailable');return{language,terminate:async()=>{}};}};
(async()=>{
 const fallback=await workerFactory(mockTesseract,'eng+rus+kaz',()=>{},()=>{});
 if(fallback.language!=='eng'||!fallback.fallback||attempts.join(',')!=='eng+rus+kaz,eng+rus,eng')throw new Error('Automatic OCR model fallback did not select the first available model');
 let explicitFailed=false;
 try{await workerFactory({createWorker:async()=>{throw new Error('missing traineddata');}},'kaz',()=>{},()=>{});}catch(error){explicitFailed=/kaz/.test(error.message);}
 if(!explicitFailed)throw new Error('Explicit OCR language failure must be reported, not silently replaced');
 if(!html.includes('let tesseractLoadingPromise=null')||!html.includes('return tesseractLoadingPromise'))throw new Error('Tesseract loader is not protected against concurrent duplicate script injection');
 console.log('OCR worker availability tests passed: model fallback, explicit-language error and shared loader.');
})().catch(error=>{console.error(error);process.exitCode=1;});

const quadStart=html.indexOf('function validatePageQuad('),quadEnd=html.indexOf('\nasync function recognizeImageCanvas',quadStart);
if(quadStart<0||quadEnd<0)throw new Error('Page-quadrilateral validation helper not found');
const validateQuad=vm.runInNewContext(html.slice(quadStart,quadEnd)+'; validatePageQuad');
const rectangle=validateQuad([[100,80],[900,80],[900,920],[100,920]],1000,1000);
if(!rectangle.accepted||rectangle.confidence<55)throw new Error('A clear page quadrilateral should pass geometric validation');
const skewed=validateQuad([[180,90],[900,150],[820,930],[90,820]],1000,1000);
if(!skewed.accepted)throw new Error('A plausible perspective-skewed page should pass geometric validation');
const concave=validateQuad([[100,100],[900,100],[400,400],[100,900]],1000,1000);
if(concave.accepted||concave.reason!=='non-convex-or-degenerate')throw new Error('A concave text-like contour must be rejected');
const outside=validateQuad([[-10,20],[900,20],[900,900],[20,900]],1000,1000);
if(outside.accepted||outside.reason!=='corner-outside-image')throw new Error('Corners outside the image must be rejected');
const tiny=validateQuad([[490,490],[510,490],[510,510],[490,510]],1000,1000);
if(tiny.accepted||tiny.reason!=='implausible-area')throw new Error('A tiny text block must not be accepted as a page');

const detectorStart=html.indexOf('function detectPageQuadFromEdges('),detectorEnd=html.indexOf('\nfunction detectPageQuadFromCanvas',detectorStart);
if(detectorStart<0||detectorEnd<0)throw new Error('Page boundary detector helper not found');
const detectPage=vm.runInNewContext(html.slice(detectorStart,detectorEnd)+'; detectPageQuadFromEdges',{validatePageQuad});
const syntheticEdges=[];
for(let x=120;x<=880;x+=2){syntheticEdges.push({x,y:100},{x,y:900});}
for(let y=100;y<=900;y+=2){syntheticEdges.push({x:120,y},{x:880,y});}
// Internal text-like strokes should not displace the large page boundary.
for(let y=180;y<820;y+=55)for(let x=190;x<790;x+=3)syntheticEdges.push({x,y});
const detected=detectPage(syntheticEdges,1000,1000);
if(!detected.accepted||detected.confidence<62||!detected.points||detected.points.length!==4)throw new Error('A high-contrast page boundary was not detected reliably: '+JSON.stringify(detected));
const noPage=detectPage(Array.from({length:200},(_,i)=>({x:200+(i%20)*5,y:200+Math.floor(i/20)*5})),1000,1000);
if(noPage.accepted)throw new Error('A compact text-like cluster must not be accepted as a page boundary');
if(!html.includes('previewOnly:true')||!html.includes("reason:'no-reliable-page-boundary'"))throw new Error('Page detection must remain preview-only and reject uncertain candidates');

