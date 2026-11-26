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
const restored=helpers.restoreGlossaryTerms(protectedValue.text,protectedValue.tokens);
if(restored!=='I live in Нью-Йорк. OpenAI uses Си-плюс-плюс and a Нью-Йорк office.')throw new Error('Glossary terms were not restored exactly: '+restored);
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
const originalBox={x0:10,y0:20,x1:30,y1:40};
const expectedBoxes=[
 [0,{x0:10,y0:20,x1:30,y1:40}],
 [90,{x0:20,y0:170,x1:40,y1:190}],
 [180,{x0:70,y0:160,x1:90,y1:180}],
 [270,{x0:60,y0:10,x1:80,y1:30}]
];
for(const [angle,expected] of expectedBoxes){
 const actual=restoreBox(originalBox,angle,100,200);
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
if(!html.includes('createEnhancedOcrCanvas(canvas,1.5)'))throw new Error('Enhanced OCR fallback is not wired into recognition');
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

console.log('Translation quality tests passed: glossary parsing, longest-first matching, exact term restoration and retry classification.');
