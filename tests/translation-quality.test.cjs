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
const spacedRuns=[{nodeValue:'first'},{nodeValue:' '},{nodeValue:'second'}];
distribute('Translated phrase',spacedRuns);
if(spacedRuns.map(x=>x.nodeValue).join('')!=='Translated phrase')throw new Error('DOCX translation lost spaces when Word stored a separator in a whitespace-only run');
if(spacedRuns[1].nodeValue!=='')throw new Error('Whitespace-only formatting runs must not receive translated words');
const weightedRuns=[{nodeValue:'12345'},{nodeValue:' '},{nodeValue:'123456'}];
distribute('one two three four five',weightedRuns);
if(weightedRuns[0].nodeValue!=='one two '||weightedRuns[1].nodeValue!==''||weightedRuns[2].nodeValue!=='three four five')throw new Error('DOCX run distribution must use original non-empty run weights while skipping whitespace-only runs');
const xmlSpace='http://www.w3.org/XML/1998/namespace';
const xmlRuns=['first','second'].map(value=>({nodeValue:value,parentElement:{attrs:{},setAttributeNS(ns,name,val){this.attrs[name]=val;}}}));
distribute('  translated phrase  ',xmlRuns);
if(xmlRuns.map(x=>x.nodeValue).join('')!=='  translated phrase  ')throw new Error('DOCX leading/trailing whitespace was not preserved across runs');
if(xmlRuns[0].parentElement.attrs['xml:space']!=='preserve'||xmlRuns[1].parentElement.attrs['xml:space']!=='preserve')throw new Error('DOCX boundary whitespace must set xml:space="preserve" on affected text runs');
const docxParagraphHelper=html.slice(html.indexOf('function translateXmlParagraphs('),html.indexOf('async function translatePreservingFile('));
if(!docxParagraphHelper.includes('if(!node.nodeValue)continue;')||!docxParagraphHelper.includes("texts.some(node=>String(node.nodeValue||'').trim())"))throw new Error('DOCX paragraph extraction must retain whitespace-only separators while skipping empty paragraphs');
const visibleTextStart=html.indexOf('function isDocxVisibleTextNode(');
const visibleTextEnd=html.indexOf('\n}',visibleTextStart);
if(visibleTextStart<0||visibleTextEnd<0)throw new Error('DOCX visible-text node guard not found');
const isDocxVisibleTextNode=vm.runInNewContext(html.slice(visibleTextStart,visibleTextEnd+2)+'; isDocxVisibleTextNode');
for(const tag of ['t']){const node={parentElement:{localName:tag}};if(!isDocxVisibleTextNode(node))throw new Error('Visible DOCX text node was incorrectly skipped: '+tag);}
for(const tag of ['instrText','delText','del','fldChar','tab']){const node={parentElement:{localName:tag}};if(isDocxVisibleTextNode(node))throw new Error('DOCX field/deleted/non-text element was incorrectly treated as visible text: '+tag);}
for(const tag of ['del','moveFrom']){const node={parentElement:{localName:'t',parentElement:{localName:tag,parentElement:null}}};if(isDocxVisibleTextNode(node))throw new Error('DOCX deleted/moved-from revision text must not be translated: '+tag);}
const simpleFieldNode={parentElement:{localName:'t',parentElement:{localName:'r',parentElement:{localName:'fldSimple',parentElement:null}}}};
if(isDocxVisibleTextNode(simpleFieldNode))throw new Error('DOCX simple-field result text must not be translated because Word can regenerate it from the field instruction');
const storyPattern=/^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i;
for(const path of ['word/document.xml','word/header1.xml','word/footer2.xml','word/footnotes.xml','word/endnotes.xml','word/comments.xml'])if(!storyPattern.test(path))throw new Error('DOCX translation must include the story part '+path);
for(const path of ['word/styles.xml','word/numbering.xml','word/settings.xml','word/theme/theme1.xml'])if(storyPattern.test(path))throw new Error('DOCX style/relationship metadata must not be treated as translatable story text: '+path);
const insertedNode={parentElement:{localName:'t',parentElement:{localName:'ins',parentElement:null}}};
if(!isDocxVisibleTextNode(insertedNode))throw new Error('Visible inserted DOCX revision text must remain translatable');
const drawingText={parentElement:{localName:'t',namespaceURI:'http://schemas.openxmlformats.org/drawingml/2006/main',parentElement:null}};
if(!isDocxVisibleTextNode(drawingText))throw new Error('Visible DrawingML text in DOCX shapes/text boxes must be translated');
const wordText={parentElement:{localName:'t',namespaceURI:'http://schemas.openxmlformats.org/wordprocessingml/2006/main',parentElement:null}};
if(!isDocxVisibleTextNode(wordText))throw new Error('Visible WordprocessingML text must remain translatable');
const unrelatedText={parentElement:{localName:'t',namespaceURI:'urn:unrelated:test',parentElement:null}};
if(isDocxVisibleTextNode(unrelatedText))throw new Error('Unrelated XML text nodes must not be translated as DOCX content');
const preserveEntryStart=html.indexOf('async function translatePreservingFile(');
const preserveEntryEnd=html.indexOf("if(['docx','epub','odt','xlsx','xlsm','pptx'].includes(ext))",preserveEntryStart);
if(preserveEntryStart<0||preserveEntryEnd<0)throw new Error('Document-preservation entry point not found');
const preserveEntry=html.slice(preserveEntryStart,preserveEntryEnd);
if(!preserveEntry.includes('file.size>100*1024*1024'))throw new Error('Preserving translation must reject files above the browser memory safety limit');
const zipGuardStart=html.indexOf('function assertZipArchiveSafe(zip){');
const zipGuardEnd=html.indexOf('async function ensureZipLibrary(){',zipGuardStart);
if(zipGuardStart<0||zipGuardEnd<0)throw new Error('ZIP archive safety guard missing');
const zipGuard=html.slice(zipGuardStart,zipGuardEnd);
for(const guard of ['entries.length>5000','size>64*1024*1024','total>256*1024*1024','size/compressed>1000'])if(!zipGuard.includes(guard))throw new Error('ZIP archive guard missing limit: '+guard);
if((html.split('assertZipArchiveSafe(zip)').length-1)<3)throw new Error('ZIP safety guard must protect ODT, PPTX extraction and preserving archive translation');
if(!(preserveEntry.indexOf('file.size>100*1024*1024')<preserveEntry.indexOf('readFileBuffer(file)')))throw new Error('Oversized files must be rejected before allocating their ArrayBuffer');
if(!(preserveEntry.indexOf("if(ext==='pdf')")<preserveEntry.indexOf('readFileBuffer(file)'))||!(preserveEntry.indexOf("includes(ext)){return await translateImagePreservingFile")<preserveEntry.indexOf('readFileBuffer(file)')))throw new Error('PDF and image translation must not allocate an unused duplicate file buffer');
const docxBranch=html.slice(html.indexOf("if(ext==='docx'){"),html.indexOf("}else if(ext==='odt'){") );
if(!docxBranch.includes('75/paths.length,true'))throw new Error('DOCX translation must limit extraction to visible w:t text nodes');
if(!html.includes("['p','h1','h2','h3','h4','h5','h6','li','blockquote','figcaption','caption','dt','dd','div','section','article','pre','address','td','th']"))throw new Error('EPUB block coverage missing for div-based, semantic and table content');
if(!html.includes("const nestedBlockTags=new Set(['p','h1','h2','h3','h4','h5','h6','li','blockquote','figcaption','caption','dt','dd','div','section','article','pre','address','td','th'])")||!html.includes("let parent=node.parentElement,nested=false")||!html.includes("while(parent&&parent!==block)"))throw new Error('EPUB text walker must exclude nested block descendants while retaining wrapper-owned text');
const epubTranslationStart=html.indexOf("}else if(ext==='epub'){");
const epubTranslationEnd=html.indexOf("}else if(ext==='xlsx'||ext==='xlsm')",epubTranslationStart);
if(epubTranslationStart<0||epubTranslationEnd<0)throw new Error('EPUB translation branch not found');
const epubTranslationSource=html.slice(epubTranslationStart,epubTranslationEnd);
if(!epubTranslationSource.includes('/\\.(xhtml|html|htm|ncx)$/i.test(p)'))throw new Error('EPUB navigation NCX files must be included with XHTML chapters');
if(!epubTranslationSource.includes("isNcx?'application/xml':'application/xhtml+xml'")||!epubTranslationSource.includes("if(isNcx){await translateXmlParagraphs(doc,'text'"))throw new Error('EPUB NCX navigation labels must be parsed as XML and translated without rewriting href targets');
const epubOpenStart=html.indexOf('async function openEpub(file,openToken)')>=0?html.indexOf('async function openEpub(file,openToken)'):html.indexOf('async function openEpub(file)');
const epubOpenEnd=html.indexOf("\n$('prevBtn').onclick",epubOpenStart);
if(epubOpenStart<0||epubOpenEnd<0)throw new Error('EPUB open workflow not found');
const epubOpenSource=html.slice(epubOpenStart,epubOpenEnd);
const firstDisplay=Math.min(...['await rendition.display()','await openedRendition.display()'].map(value=>{const index=epubOpenSource.indexOf(value);return index<0?Number.MAX_SAFE_INTEGER:index;}));
const relocatedHandler=epubOpenSource.indexOf("rendition.on('relocated'");
if(firstDisplay<0||relocatedHandler<0||relocatedHandler>firstDisplay)throw new Error('EPUB relocated listener must be registered before first display so initial page state is available');
if(!html.includes(".sort((a,b)=>Number(a.match(/slide(\\d+)/i)?.[1]||0)-Number(b.match(/slide(\\d+)/i)?.[1]||0))"))throw new Error('PPTX numeric slide ordering missing');
const xlsxStart=html.indexOf("}else if(ext==='xlsx'||ext==='xlsm'){");
const xlsxEnd=html.indexOf("}else if(ext==='pptx'){",xlsxStart);
if(xlsxStart<0||xlsxEnd<0)throw new Error('XLSX translation branch not found');
const xlsxSource=html.slice(xlsxStart,xlsxEnd);
const richRunCalls=xlsxSource.split('distributeTranslationAcrossRuns(trans,textNodes)').length-1;
if(richRunCalls!==2)throw new Error('XLSX shared and inline rich-text runs must both retain their original run structure');
if(!xlsxSource.includes("nodes.flatMap(node=>Array.from(node.childNodes).filter(child=>child.nodeType===3))"))throw new Error('XLSX shared strings must collect all rich text nodes before translation');
if(!xlsxSource.includes("cell.getElementsByTagNameNS('*','t')"))throw new Error('XLSX inline strings must preserve all text runs in each cell');
if(!html.includes("translateXmlParagraphs(doc,'p',from,target,progressId,5+80*i/slides.length,80/slides.length)"))throw new Error('PPTX progress updates must use the active translator progress panel');
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
let paintCalls=0;
const dryContext={...mockContext,fillText(){paintCalls++;}};
const dryFit=draw(dryContext,'Translated',0,0,100,30,'en',{paint:false});
if(!dryFit.fits||paintCalls!==0)throw new Error('OCR preflight must measure translated text without painting it');
draw(dryContext,'Translated',0,0,100,30,'en',{paint:true});
if(paintCalls===0)throw new Error('OCR final render must paint after a successful fit check');
const pdfLoop=html.slice(html.indexOf('async function translatePdfPreservingFile'),html.indexOf('async function translateImagePreservingFile'));
if(!pdfLoop.includes("loading=pdfjs.getDocument({data:pdfBytes});let sourcePdf=null,outPdf=null,sourcePdfForCopy=null;"))throw new Error('PDF reconstruction must declare cleanup state before parsing');
if(!pdfLoop.includes("sourcePdf=await loading.promise;\n  outPdf=await PDFLib.PDFDocument.create();"))throw new Error('PDF reconstruction must protect document loading and output creation with cleanup');
if(!pdfLoop.includes("if(sourcePdf)await sourcePdf.cleanup();}catch(e){}try{await loading.destroy();}"))throw new Error('PDF reconstruction must clean up even when PDF parsing fails');
if(!pdfLoop.includes("catch(error){try{page.cleanup();}catch(cleanupError){}throw error;}"))throw new Error('PDF pages must be released when text or operator inspection fails');
if(!pdfLoop.includes("let viewport=null,canvas=null,rectifiedCanvas=null;\n   try{\n    viewport=createSafePdfViewport(page,2.0,16000000);canvas=document.createElement('canvas');"))throw new Error('PDF page resources must be protected if viewport creation or canvas allocation fails');
if(!pdfLoop.includes("if(canvas){canvas.width=canvas.height=0;}"))throw new Error('PDF page canvas cleanup must tolerate viewport or allocation failures');
if(!pdfLoop.includes("}finally{try{page.cleanup();}catch(cleanupError){}}"))throw new Error('Copied native PDF pages must be released even when page copying fails');
const imageLoop=html.slice(html.indexOf('async function translateImagePreservingFile'),html.indexOf('function pdfTextItemsToPlainText'));
if(!imageLoop.includes('detectPageQuadFromCanvas(canvas)')||!imageLoop.includes('rectifyPageCanvas(canvas,detected.points,6000000,3000)'))throw new Error('Photographed document images must attempt bounded perspective rectification before OCR');
if(!imageLoop.includes('recognizeImageCanvas(ocrInput')||!imageLoop.includes('mapRectifiedOcrDataToSource(ocr,rectification.outputToSource)'))throw new Error('Rectified image OCR boxes must be mapped back to original image coordinates before replacement');
if(!imageLoop.includes('if(rectifiedCanvas){rectifiedCanvas.width=rectifiedCanvas.height=0;}'))throw new Error('Temporary rectified image canvas must be released on success and failure');
if(!imageLoop.includes('canvas.toBlob(resolve,mime'))throw new Error('Image output must be encoded from the original-size source canvas, not the rectified OCR canvas');
for(const [name,source] of [['PDF',pdfLoop],['image',imageLoop]]){
 const preflight=source.indexOf('paint:false'),background=source.indexOf('estimateSafeBackgroundFill'),paint=source.indexOf('paintTranslationInOcrBox(');
 if(preflight<0||background<0||paint<0||!(preflight<background&&background<paint))throw new Error(name+' OCR replacement must preflight fit before clearing the original background');
 if(!source.includes('исходный текст сохранён без перезаписи'))throw new Error(name+' OCR overflow must preserve original source text and warn the user');
}
if(!html.includes('ВНИМАНИЕ ВЁРСТКА:')||!html.includes('layoutWarnings.push'))throw new Error('OCR layout-overflow warnings are not surfaced to users');



const strokeStart=html.indexOf('function detectLongStraightRuleInOcrBox('),strokeEnd=html.indexOf('function translationLayoutTokens(',strokeStart);
if(strokeStart<0||strokeEnd<0)throw new Error('OCR straight-rule safety helper not found');
const strokeGuard=vm.runInNewContext(html.slice(strokeStart,strokeEnd)+'; detectLongStraightRuleInOcrBox',{isValidOcrBox:box=>!!box&&Number.isFinite(box.x0)&&Number.isFinite(box.y0)&&Number.isFinite(box.x1)&&Number.isFinite(box.y1)&&box.x1>box.x0&&box.y1>box.y0});
const makePixelContext=(width,height,marks=[])=>{
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<width*height;i++){pixels[i*4]=255;pixels[i*4+1]=255;pixels[i*4+2]=255;pixels[i*4+3]=255;}
 for(const [x,y] of marks){const k=(y*width+x)*4;pixels[k]=0;pixels[k+1]=0;pixels[k+2]=0;}
 return{canvas:{width,height},getImageData:(left,top,w,h)=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const src=((top+y)*width+left+x)*4,dst=(y*w+x)*4;data.set(pixels.slice(src,src+4),dst);}return{data};}};
};
const horizontalRule=[];for(let x=0;x<100;x++)horizontalRule.push([x,9]);
if(!strokeGuard(makePixelContext(100,20,horizontalRule),{x0:0,y0:0,x1:100,y1:20},'rgb(255,255,255)').detected)throw new Error('OCR safety guard failed to detect a thin horizontal rule crossing the text region');
const verticalRule=[];for(let y=0;y<20;y++)verticalRule.push([50,y]);
if(!strokeGuard(makePixelContext(100,20,verticalRule),{x0:0,y0:0,x1:100,y1:20},'rgb(255,255,255)').detected)throw new Error('OCR safety guard failed to detect a vertical rule crossing the text region');
const sparseGlyphs=[];for(let x=8;x<15;x++)for(let y=5;y<14;y++)sparseGlyphs.push([x,y]);for(let x=32;x<39;x++)for(let y=5;y<14;y++)sparseGlyphs.push([x,y]);for(let x=65;x<72;x++)for(let y=5;y<14;y++)sparseGlyphs.push([x,y]);
if(strokeGuard(makePixelContext(100,20,sparseGlyphs),{x0:0,y0:0,x1:100,y1:20},'rgb(255,255,255)').detected)throw new Error('OCR safety guard incorrectly rejected ordinary separated glyph-like marks');
if(!html.includes('detectLongStraightRuleInOcrBox(ctx,cellBox,bg.color)')||!html.includes('detectLongStraightRuleInOcrBox(ctx,cellBox,fill.color)'))throw new Error('PDF and image OCR must both guard against rules crossing a replacement box');

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

const tableGridStart=html.indexOf('function buildOcrTableGrid('),tableGridEnd=html.indexOf('function ocrLayoutSummary(',tableGridStart);
if(tableGridStart<0||tableGridEnd<0)throw new Error('OCR table-grid analysis helper not found');
const tableGridBuilder=vm.runInNewContext(html.slice(tableGridStart,tableGridEnd)+';buildOcrTableGrid',{isValidOcrBox:box=>!!box&&Number.isFinite(box.x0)&&Number.isFinite(box.y0)&&Number.isFinite(box.x1)&&Number.isFinite(box.y1)&&box.x1>box.x0&&box.y1>box.y0});
const gridLines=[];
for(let row=0;row<4;row++){
 gridLines.push({text:'left cell '+row,box:{x0:10+row*.5,y0:10+row*24,x1:90,y1:21+row*24}});
 gridLines.push({text:'right cell '+row,box:{x0:130+row*.4,y0:10+row*24,x1:210,y1:21+row*24}});
}
const detectedGrid=tableGridBuilder(gridLines);
if(!detectedGrid||detectedGrid.rows.length!==4||detectedGrid.columns.length!==2)throw new Error('OCR table grid did not identify four rows and two stable columns');
if(detectedGrid.rows.some(row=>row.cells.length!==2||row.cells[0].columnIndex!==0||row.cells[1].columnIndex!==1))throw new Error('OCR table cells were assigned to the wrong columns');
const cellBoundsStart=html.indexOf('function constrainOcrLineToTableCell('),cellBoundsEnd=html.indexOf('function ocrLayoutSummary(',cellBoundsStart);
if(cellBoundsStart<0||cellBoundsEnd<0)throw new Error('OCR table-cell boundary helper not found');
const constrainCell=vm.runInNewContext(html.slice(cellBoundsStart,cellBoundsEnd)+';constrainOcrLineToTableCell');
const overlapCells=[];
for(let row=0;row<3;row++){
 overlapCells.push({text:'wide left '+row,box:{x0:10,y0:10+row*24,x1:135,y1:21+row*24}});
 overlapCells.push({text:'narrow right '+row,box:{x0:125,y0:10+row*24,x1:160,y1:21+row*24}});
}
const overlapGrid=tableGridBuilder(overlapCells);
if(!overlapGrid)throw new Error('Overlapping synthetic table columns should still produce a diagnostic grid');
const boundedLeft=constrainCell(overlapCells[0],overlapGrid),boundedRight=constrainCell(overlapCells[1],overlapGrid);
if(!boundedLeft||!boundedRight||boundedLeft.x1>boundedRight.x0||Math.abs(boundedLeft.x1-130)>0.01||Math.abs(boundedRight.x0-130)>0.01)throw new Error('OCR replacement bounds must be clipped at the midpoint between overlapping neighbouring cells');
const unequalCells=[];
for(let row=0;row<3;row++){
 unequalCells.push({text:'short left '+row,box:{x0:10,y0:10+row*24,x1:75,y1:21+row*24}});
 unequalCells.push({text:'wide right '+row,box:{x0:130,y0:10+row*24,x1:250,y1:21+row*24}});
}
const unequalGrid=tableGridBuilder(unequalCells);
const shortCell=constrainCell(unequalCells[0],unequalGrid),wideCell=constrainCell(unequalCells[1],unequalGrid);
if(!shortCell||!wideCell||shortCell.x1!==75||wideCell.x0!==130||wideCell.x1!==250)throw new Error('Different column widths must retain their independent OCR cell bounds');
const foreignLine={text:'unmapped',box:{x0:300,y0:10,x1:350,y1:21}};
if(constrainCell(foreignLine,overlapGrid)!==null)throw new Error('A line not assigned to a detected table cell must not be painted');
if(!html.includes('constrainOcrLineToTableCell(line.lines[0],tableGrid)'))throw new Error('PDF and image OCR rendering must use detected cell bounds');
if(!html.includes('function paintTranslationInOcrBox(ctx,text,box,targetCode,backgroundColor)'))throw new Error('Polygon-clipped OCR replacement helper is missing');
const polygonPainterStart=html.indexOf('function paintTranslationInOcrBox('),polygonPainterEnd=html.indexOf('function mapRectifiedOcrDataToSource',polygonPainterStart);
const polygonPainter=html.slice(polygonPainterStart,polygonPainterEnd);
if(!polygonPainter.includes('ctx.lineTo(box.polygon[i].x,box.polygon[i].y)')||!polygonPainter.includes('ctx.clip()'))throw new Error('OCR replacement background and translated text must be clipped to the mapped perspective polygon');
if(!html.includes('paintTranslationInOcrBox(ctx,translated,cellBox,target,bg.color)')||!html.includes('paintTranslationInOcrBox(ctx,translated,cellBox,target,fill.color)'))throw new Error('Both PDF and image OCR paths must use polygon-clipped replacement');
if((html.match(/const replacementGroups=rectification\|\|layout\.multiColumn\|\|layout\.tableLike\?/g)||[]).length!==2)throw new Error('PDF and image OCR must keep per-line polygons after perspective correction instead of merging them into rectangular paragraph bounds');

const uncertainGrid=tableGridBuilder([
 {text:'one',box:{x0:10,y0:10,x1:90,y1:22}},
 {text:'two',box:{x0:220,y0:10,x1:300,y1:22}},
 {text:'three',box:{x0:20,y0:60,x1:100,y1:72}},
 {text:'four',box:{x0:240,y0:60,x1:320,y1:72}}
]);
if(uncertainGrid!==null)throw new Error('Sparse side-by-side OCR fragments must not be promoted to a table grid');
if(!html.includes('содержимое переводится отдельными OCR-фрагментами без объединения ячеек'))throw new Error('Table-safe OCR translation warning is not surfaced');

const renderScaleStart=html.indexOf('function createSafePdfViewport(');
const renderScaleEnd=html.indexOf('\n',renderScaleStart);
if(renderScaleStart<0||renderScaleEnd<0)throw new Error('Adaptive PDF render-scale helper not found');
const safeViewport=vm.runInNewContext(html.slice(renderScaleStart,renderScaleEnd)+'; createSafePdfViewport');
const mockPage=(width,height)=>({getViewport:({scale})=>({width:width*scale,height:height*scale,scale})});
const ordinaryViewport=safeViewport(mockPage(612,792),2.0,16000000);
if(ordinaryViewport.scale!==2.0)throw new Error('Ordinary PDF pages should retain the preferred OCR render scale');
const oversizedViewport=safeViewport(mockPage(20000,18000),2.0,16000000);
if(oversizedViewport.width*oversizedViewport.height>16000000.01||oversizedViewport.scale>=2.0)throw new Error('Oversized PDF pages were not constrained to the pixel budget');
if(!html.includes('createSafePdfViewport(page,2.0,16000000)')||!html.includes('createSafePdfViewport(page,1.35)'))throw new Error('High-resolution adaptive rendering is not used by PDF reconstruction and text extraction');
if(!html.includes("canvas.toBlob(resolve,'image/jpeg',.98)"))throw new Error('PDF reconstruction must use the updated high-quality JPEG setting');
if(!html.includes("Сохранено исходных электронных страниц без изменений: '+preservedNativePages"))throw new Error('PDF summary must distinguish copied native pages from OCR raster pages');
if(!html.includes('текст оставлен оригинальным и не переведён'))throw new Error('PDF summary must disclose that preserved native pages remain untranslated');
if(!html.includes('перевод выполнен только там, где распознавание и восстановление фона прошли проверки'))throw new Error('PDF summary must disclose the guarded OCR translation policy');
if(!html.includes('translatedRasterPages++')||!html.includes('untranslatedRasterPages++'))throw new Error('PDF processing must count translated and untranslated raster pages separately');


if(!html.includes('Страница '+"'+pageNo+'"+': распознано')||!html.includes('safeToTranslate&&lineNo<replacementGroups.length'))throw new Error('Low-confidence PDF pages are not explicitly kept untranslated');
if(!html.includes('вероятная многоколоночная структура')||!html.includes('вероятная табличная структура'))throw new Error('Complex OCR layout warnings are not surfaced');
if(!html.includes('safeToTranslate&&i<replacementGroups.length')||!html.includes('Изображение сохранено без замены текста'))throw new Error('Low-confidence image scans are not kept unchanged');

const pdfPipelineStart=html.indexOf('async function translatePdfPreservingFile(');
const pdfPipelineEnd=html.indexOf('\nasync function translateImagePreservingFile',pdfPipelineStart);
if(pdfPipelineStart<0||pdfPipelineEnd<0)throw new Error('PDF reconstruction pipeline not found for resource-lifecycle test');
const pdfPipeline=html.slice(pdfPipelineStart,pdfPipelineEnd);
if(!pdfPipeline.includes("const ctx=canvas.getContext('2d'")||!pdfPipeline.includes('finally{\n    if(rectifiedCanvas){rectifiedCanvas.width=rectifiedCanvas.height=0;}')||!pdfPipeline.includes('try{page.cleanup();}catch(e){}if(canvas){canvas.width=canvas.height=0;}'))throw new Error('PDF source and temporary rectified canvases are not released in a per-page finally block');
if(!pdfPipeline.includes('if(ocrWorker)await ocrWorker.terminate()'))throw new Error('Shared OCR worker is not terminated in the outer finally block');
const recognizeStart=html.indexOf('async function recognizeImageCanvas('),recognizeEnd=html.indexOf('function releaseScanPreview',recognizeStart);
if(recognizeStart<0||recognizeEnd<0)throw new Error('Image OCR recognition function not found for cleanup test');
const recognizeSource=html.slice(recognizeStart,recognizeEnd);
if(!recognizeSource.includes("if(!sharedWorker){try{await worker.terminate();}catch(error)"))throw new Error('OCR worker shutdown errors must not mask recognition results or the original OCR error');
const imagePipelineStart=html.indexOf('async function translateImagePreservingFile(');
const imagePipelineEnd=html.indexOf('function pdfTextItemsToPlainText',imagePipelineStart);
if(imagePipelineStart<0||imagePipelineEnd<0)throw new Error('Image OCR pipeline not found for resource-lifecycle test');
const imagePipeline=html.slice(imagePipelineStart,imagePipelineEnd);
if(!imagePipeline.includes('try{\n  let ocrInput=canvas,rectification=null;')||!imagePipeline.includes('finally{\n  if(rectifiedCanvas){rectifiedCanvas.width=rectifiedCanvas.height=0;}\n  canvas.width=canvas.height=0;\n }'))throw new Error('Image OCR source and temporary rectification canvases must be released in a finally block');

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
 if(!html.includes('replacementLines=ocrLinesForReplacement(ocr,35)')||!html.includes('for(let lineNo=0;safeToTranslate&&lineNo<replacementGroups.length;lineNo++)')||!html.includes('for(let i=0;safeToTranslate&&i<replacementGroups.length;i++)'))throw new Error('PDF/image reconstruction does not consistently skip low-confidence OCR lines');


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



if(!html.includes('async function openScanImage(file,ext,openToken)')||!html.includes('detectPageQuadFromCanvas(original)')||!html.includes('rectifyPageCanvas(original,points,6000000,3000)')||!html.includes('scanOriginalBtn')||!html.includes('scanCorrectedBtn')||!html.includes('releaseScanPreview()'))throw new Error('Scanned image reader preview must compare original and preview-only perspective correction with cleanup');
if(!html.includes("'jpg','jpeg','png','webp','gif'")||!html.includes('imageFileToCanvas(file)')||!html.includes('recognizeImageCanvas(canvas,report)'))throw new Error('Common scanned-image formats must reach the OCR extraction path');

if(!html.includes("flow:'paginated'")||html.includes("flow:'scrolled-doc'"))throw new Error('EPUB reader must use fixed paginated flow, not endless scrolling');
if(!html.includes("spread:'none'"))throw new Error('EPUB must display one page at a time without facing-page spreads');
if(!html.includes("rendition.themes.fontSize(fontSize+'px')"))throw new Error('EPUB font-size controls must apply to the active rendition');
if(!html.includes("rendition.resize("))throw new Error('EPUB rendition must resize with its fixed reader viewport');
if(!html.includes(".epubbox{height:min(72vh,1050px)")||!html.includes("@media(max-width:600px){.page{"))throw new Error('EPUB and text reader must use bounded responsive viewports');
if(!html.includes("rendition.themes.default({'body':{background:bg+' !important',color:ink+' !important'"))throw new Error('EPUB theme changes must be propagated to the rendered book');
if(!html.includes("if(!rendition&&readerFullText&&textViewer.style.display!=='none')paginateReaderText(readerFullText)"))throw new Error('EPUB font changes must not trigger hidden text-reader pagination');
if(!html.includes('const openToken=requestId;try{setProgress')||!html.includes('if(openToken!==requestId)return;')||!html.includes('openEpub(file,openToken)')||!html.includes('openText(file,ext,openToken)'))throw new Error('A stale asynchronous file open must not replace a newer book');
if(!html.includes('openScanImage(file,ext,openToken)')||!html.includes('openPdfScanPreview(file,ext,openToken)'))throw new Error('Image and PDF file opening must honor the active open request');

if(!html.includes('aspect-ratio:210/297')||!html.includes('overflow:hidden;background:var(--paper)'))throw new Error('Reader page must keep a bounded book-page frame');
if(!html.includes('overflow-wrap:anywhere'))throw new Error('Long unbroken words must wrap inside the fixed book-page frame');
if(!html.includes('function paginateReaderText(')||!html.includes('function moveReaderPage(')||!html.includes("e.key==='ArrowRight'"))throw new Error('Text reader pagination and keyboard navigation are missing');
if(!html.includes("readerPages=[];readerPageOffsets=[];readerPageIndex=0;renderReaderPage();"))throw new Error('Empty reader content must reset page state and refresh the visible empty state');
if(!html.includes("if(!readerPages.length){textViewer.textContent='';$('paging').style.display='none';$('pageStatus').textContent='Нет страниц';$('prevBtn').disabled=true;$('nextBtn').disabled=true;"))throw new Error('Empty reader state must clear stale page text and disable page navigation');
if(!html.includes("target.closest('input,textarea,select,button,a,[contenteditable=\"true\"],[role=\"textbox\"]')"))throw new Error('Keyboard page turns must not steal arrow keys from interactive controls');
if(!html.includes("if(selection&&!selection.isCollapsed)return;"))throw new Error('Keyboard page turns must not interrupt text selection');
if(!html.includes("readerFullText='';readerPages=[];readerPageOffsets=[];readerPageIndex=0;textViewer.textContent=''"))throw new Error('Closing or switching books must clear stale page offsets');
if(!html.includes('Math.abs(dx)>55')||!html.includes('moveReaderPage(dx<0?1:-1)'))throw new Error('Touch swipe page turning is missing');
if(!html.includes("addEventListener('touchcancel'")||!html.includes('e.touches.length!==1')||!html.includes('selection&&!selection.isCollapsed'))throw new Error('Reader swipe handling must ignore multi-touch, cancelled gestures and text selection');
if(!html.includes("window.addEventListener('resize'")||!html.includes('const previousOffset=readerPageOffsets[readerPageIndex]??0')||!html.includes('findPageIndexForOffset(readerPageOffsets,previousOffset)'))throw new Error('Reader pagination must adapt to screen rotation/resize while retaining the same text position');
if(!html.includes('readerPageOffsets=[]')||!html.includes('readerPageOffsets=result.offsets')||!html.includes('window.ReaderPagination.paginateByHeight'))throw new Error('Measured text-reader pagination must track page offsets and reset safely');
if(!html.includes("$('demoBtn').onclick")||!html.includes('paginateReaderText(sample)'))throw new Error('The demo book must use the same fixed-page pagination as uploaded reading files');
if(!html.includes("epubPageState.page<=1")||!html.includes("epubPageState.page>=epubPageState.total"))throw new Error('EPUB navigation buttons must reflect first and last page');
if(!html.includes('epubNavigationBusy')||!html.includes('updateEpubNavigationButtons()')||!html.includes("Не удалось перелистнуть EPUB"))throw new Error('EPUB navigation must serialize rapid page turns and recover button state after failures');
if(!html.includes('epubPageState={page:p,total:t}')||!html.includes('epubNavigationBusy||!epubPageState.total'))throw new Error('EPUB relocated state must drive the disabled state of navigation controls');
if(!html.includes("$('epubTocSelect').disabled=epubNavigationBusy")||!html.includes('!href||!rendition||epubNavigationBusy'))throw new Error('EPUB TOC navigation must be serialized with page turns');
if(!html.includes('async function moveReaderPage(delta)')||!html.includes('await (delta<0?activeRendition.prev():activeRendition.next())')||!html.includes("Не удалось перелистнуть EPUB")||!html.includes('if(activeToken===requestId&&rendition===activeRendition){epubNavigationBusy=false;updateEpubNavigationButtons();}'))throw new Error('EPUB page turns must catch failures and restore controls only for the still-active reader session');
if(!html.includes('rendition.getContents()')||!html.includes('doc.__readerSwipeBound'))throw new Error('EPUB iframe touch gestures must be bound inside its document');
const epubGestureStart=html.indexOf('function bindEpubPageGestures()');
const epubGestureEnd=html.indexOf('bindReaderPageGestures();',epubGestureStart);
if(epubGestureStart<0||epubGestureEnd<0)throw new Error('EPUB gesture binding function missing');
const epubGestureSource=html.slice(epubGestureStart,epubGestureEnd);
if(!epubGestureSource.includes("doc.addEventListener('touchstart'")||!epubGestureSource.includes("doc.addEventListener('touchend'"))throw new Error('EPUB iframe must listen for both swipe start and end');
if(!epubGestureSource.includes("doc.addEventListener('touchcancel'")||!epubGestureSource.includes('event.touches.length!==1')||!epubGestureSource.includes('selection&&!selection.isCollapsed'))throw new Error('EPUB swipe handling must ignore multi-touch, cancelled gestures and text selection');
if(!epubGestureSource.includes('Math.abs(dx)>55')||!epubGestureSource.includes('Math.abs(dx)>Math.abs(dy)*1.25'))throw new Error('EPUB swipe must require a deliberate horizontal gesture and ignore vertical scrolling');
if(!epubGestureSource.includes("moveReaderPage(dx<0?1:-1)"))throw new Error('EPUB swipe direction must map to next and previous pages');
if(!html.includes("rendition.on('rendered',()=>{if(openToken!==requestId||book!==openedBook||rendition!==openedRendition)return;syncEpubBookText();bindEpubPageGestures();})"))throw new Error('EPUB iframe gestures must be rebound only for the current book when a new page document is rendered');
const epubSyncStart=html.indexOf('function syncEpubBookText()');
const epubSyncEnd=html.indexOf('\n}',epubSyncStart);
if(epubSyncStart<0||epubSyncEnd<0)throw new Error('EPUB text synchronization function missing');
const epubSyncSource=html.slice(epubSyncStart,epubSyncEnd);
if(!epubSyncSource.includes('rendition.getContents()')||!epubSyncSource.includes('item.document.body'))throw new Error('EPUB translation source must be read from active EPUB.js content documents');
if(!epubSyncSource.includes('body.innerText||body.textContent'))throw new Error('EPUB text sync must support rendered innerText and textContent fallback');
if(!epubSyncSource.includes("setBookSource(value,'epub')"))throw new Error('Active EPUB section text must populate the book translation workbench');
if(epubSyncSource.includes("document.querySelector('#epubViewer iframe')"))throw new Error('EPUB text sync must not depend on the first iframe in the viewer DOM');


if(!html.includes('readerPageIndex=0;textViewer.style.display=\'block\';paginateReaderText(normalized)'))throw new Error('Text documents are not rendered as discrete reader pages');

const rectificationStart=html.indexOf('function solvePageHomography('),rectificationEnd=html.indexOf('function detectPageQuadFromEdges',rectificationStart);
if(rectificationStart<0||rectificationEnd<0)throw new Error('Perspective rectification helpers not found');
const rectification=vm.runInNewContext(html.slice(rectificationStart,rectificationEnd)+'; ({solvePageHomography,mapPageHomography,createPageRectificationPlan,mapRectifiedOcrBox,mapRectifiedOcrDataToSource})');
const sourceQuad=[{x:120,y:90},{x:870,y:180},{x:790,y:900},{x:80,y:760}];
const plan=rectification.createPageRectificationPlan(sourceQuad,16000000,4096);
if(!plan.accepted||!plan.previewOnly||plan.pixelCount>16000000||plan.width>4096||plan.height>4096)throw new Error('Perspective rectification plan did not respect preview and pixel limits');
const outputCorners=[{x:0,y:0},{x:plan.width-1,y:0},{x:plan.width-1,y:plan.height-1},{x:0,y:plan.height-1}];
for(let i=0;i<4;i++){const mapped=rectification.mapPageHomography(plan.outputToSource,outputCorners[i]);if(!mapped||Math.hypot(mapped.x-sourceQuad[i].x,mapped.y-sourceQuad[i].y)>.01)throw new Error('Inverse perspective mapping missed a source corner');}
const mappedCenter=rectification.mapPageHomography(plan.sourceToOutput,{x:(sourceQuad[0].x+sourceQuad[2].x)/2,y:(sourceQuad[0].y+sourceQuad[2].y)/2});
if(!mappedCenter||!Number.isFinite(mappedCenter.x)||!Number.isFinite(mappedCenter.y))throw new Error('Source-to-output coordinate mapping failed');
const mappedBox=rectification.mapRectifiedOcrBox({x0:200,y0:200,x1:400,y1:300},plan.sourceToOutput);
if(!mappedBox||!(mappedBox.x1>mappedBox.x0)||!(mappedBox.y1>mappedBox.y0))throw new Error('OCR box was not remapped using all four perspective-transformed corners');
if(!Array.isArray(mappedBox.polygon)||mappedBox.polygon.length!==4||mappedBox.polygon.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)))throw new Error('Perspective-mapped OCR box must retain its four-corner polygon, not only its axis-aligned bounds');
const identityPlan=rectification.createPageRectificationPlan([{x:0,y:0},{x:1000,y:0},{x:1000,y:1400},{x:0,y:1400}]);
if(!identityPlan.accepted)throw new Error('A rectangular source page should produce a valid rectification plan');
const identityBack=rectification.mapRectifiedOcrBox({x0:200,y0:300,x1:400,y1:500},identityPlan.outputToSource);
if(!identityBack||Math.abs(identityBack.x0-200)>2||Math.abs(identityBack.y0-300)>2||Math.abs(identityBack.x1-400)>2||Math.abs(identityBack.y1-500)>2)throw new Error('OCR box mapping must return to the original page coordinate space accurately');
const mappedBack=rectification.mapRectifiedOcrBox({x0:260,y0:260,x1:360,y1:330},plan.outputToSource);
if(!mappedBack||!(mappedBack.x1>mappedBack.x0)||!(mappedBack.y1>mappedBack.y0))throw new Error('Rectified OCR coordinates could not be mapped back to the source page');
if(!Array.isArray(mappedBack.polygon)||mappedBack.polygon.length!==4)throw new Error('Mapped OCR coordinates must preserve the source polygon for clipped restoration');
const restoredData=rectification.mapRectifiedOcrDataToSource({lines:[{text:'sample',confidence:92,bbox:{x0:260,y0:260,x1:360,y1:330}},{text:'bad',confidence:10,bbox:{x0:NaN,y0:0,x1:1,y1:1}}]},plan.outputToSource);
if(restoredData.lines.length!==1||restoredData.lines[0].text!=='sample'||restoredData.lines[0].confidence!==92||restoredData.unmappedBoxCount!==1)throw new Error('OCR line mapping must preserve valid line data and reject invalid boxes');
const permutedPlan=rectification.createPageRectificationPlan([sourceQuad[2],sourceQuad[0],sourceQuad[3],sourceQuad[1]]);
if(!permutedPlan.accepted||permutedPlan.width!==plan.width||permutedPlan.height!==plan.height)throw new Error('Perspective rectification must normalize unordered detected corners');
const boundedPlan=rectification.createPageRectificationPlan([{x:0,y:0},{x:10000,y:0},{x:10000,y:8000},{x:0,y:8000}],1000000,1200);
if(!boundedPlan.accepted||boundedPlan.pixelCount>1000000||Math.max(boundedPlan.width,boundedPlan.height)>1200)throw new Error('Rectification output did not obey pixel and side limits');
if(rectification.createPageRectificationPlan([{x:1,y:1},{x:1,y:1},{x:1,y:1},{x:1,y:1}]).accepted)throw new Error('Degenerate page corners must be rejected');

const detectorStart=html.indexOf('function detectPageQuadFromEdges('),detectorEnd=html.indexOf('\nfunction detectPageQuadFromCanvas',detectorStart);
if(detectorStart<0||detectorEnd<0)throw new Error('Page boundary detector helper not found');
const detectPage=vm.runInNewContext(html.slice(detectorStart,detectorEnd)+'; detectPageQuadFromEdges',{validatePageQuad:validateQuad});
const syntheticEdges=[];
for(let x=120;x<=880;x+=2){syntheticEdges.push({x,y:100},{x,y:900});}
for(let y=100;y<=900;y+=2){syntheticEdges.push({x:120,y},{x:880,y});}
// Internal text-like strokes should not displace the large page boundary.
for(let y=180;y<820;y+=55)for(let x=190;x<790;x+=3)syntheticEdges.push({x,y});
const detected=detectPage(syntheticEdges,1000,1000);
if(!detected.accepted||detected.confidence<62||!detected.points||detected.points.length!==4)throw new Error('A high-contrast page boundary was not detected reliably: '+JSON.stringify(detected));

const skewPolygon=[[220,110],[850,210],[760,890],[120,760]],skewEdges=[];
for(let side=0;side<4;side++){const a=skewPolygon[side],b=skewPolygon[(side+1)%4],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));for(let i=0;i<=steps;i++){const t=i/steps;skewEdges.push({x:Math.round(a[0]+(b[0]-a[0])*t),y:Math.round(a[1]+(b[1]-a[1])*t)});}}
for(let y=200;y<800;y+=45)for(let x=250;x<740;x+=4)skewEdges.push({x,y});
const skewDetected=detectPage(skewEdges,1000,1000);
if(!skewDetected.accepted||skewDetected.confidence<62)throw new Error('A perspective-skewed page boundary was not detected reliably: '+JSON.stringify(skewDetected));

const noPage=detectPage(Array.from({length:200},(_,i)=>({x:200+(i%20)*5,y:200+Math.floor(i/20)*5})),1000,1000);
if(noPage.accepted)throw new Error('A compact text-like cluster must not be accepted as a page boundary');
if(!html.includes('previewOnly:true')||!html.includes("reason:'no-reliable-page-boundary'"))throw new Error('Page detection must remain preview-only and reject uncertain candidates');


if(!html.includes('async function openPdfScanPreview(file,ext,openToken)')||!html.includes('page.getTextContent()')||!html.includes('Math.min(3,pdf.numPages)'))throw new Error('PDF scan preview must distinguish scanned PDFs from PDFs with a text layer');
if(!html.includes("const page=await pdf.getPage(n);try{if(openToken!==requestId){try{await task.destroy()}catch(e){}return false;}const content=await page.getTextContent();if(openToken!==requestId){try{await task.destroy()}catch(e){}return false;}"))throw new Error('PDF scan classification must cancel promptly when a newer file is opened');
if(!html.includes("const pages=[];let pdf=null;try{pdf=await loading.promise;"))throw new Error('PDF extraction must enter cleanup protection before awaiting the PDF document');
if(!html.includes("async function extractDocumentText(file,progressId,openToken){const isCurrent=()=>openToken===undefined||openToken===requestId;"))throw new Error('Document extraction must accept a request token for cancellation');
if(!html.includes("extractDocumentText(file,'readerProgress',openToken)"))throw new Error('Reader text extraction must pass its active request token');
if(!html.includes("const pdfBuffer=await readFileBuffer(file);ensureCurrent();"))throw new Error('PDF extraction must cancel after reading the file buffer and before creating a PDF task');
if(!html.includes("const data=await page.getTextContent();ensureCurrent();"))throw new Error('PDF extraction must stop after asynchronous text-layer reads when a newer book is opened');
if(!html.includes("page.render({canvasContext:context,viewport,background:'#ffffff'}).promise;ensureCurrent();"))throw new Error('PDF OCR rendering must stop when its reader request becomes stale');
if(!html.includes("recognized=await recognizeImageCanvas(canvas," )||!html.includes(";ensureCurrent();\n     pages.push"))throw new Error('PDF OCR must not append results after its reader request is cancelled');
if(!html.includes("async function recognizeImageCanvas(canvas,report,language='eng+rus',sharedWorker=null,isCurrent=()=>true)")||!html.includes("recognized=await recognizeImageCanvas(canvas," )||!html.includes("null,isCurrent);ensureCurrent();"))throw new Error('PDF OCR must check cancellation between recognition passes');
if(!html.includes("try{checkCurrent();boundedInput=createBoundedOcrCanvas(canvas);")||!html.includes("catch(error){if(!isCurrent())throw error;}finally{if(rotated){rotated.width=rotated.height=0;}}"))throw new Error('OCR must propagate cancellation even through deskew fallback and release its worker');
if(!html.includes("if(progressId&&isCurrent())setProgress(progressId,p,label,detail)"))throw new Error('Stale document extraction must not overwrite the active reader progress');
if(!html.includes("if(pdf)try{await pdf.cleanup();}catch(e){}try{await loading.destroy();}catch(e){}"))throw new Error('Failed PDF document loading must still destroy the PDF loading task');
if(!html.includes("const task=pdfjs.getDocument({data});let pdf=null;try{pdf=await task.promise;"))throw new Error('Scanned PDF preview must protect loading-task cleanup if PDF parsing fails');
if(!html.includes('async function loadPdfScanPage(pageNo)')||!html.includes('createSafePdfViewport(page,1.4)')||!html.includes('state.pageCount'))throw new Error('Scanned PDF preview must render one bounded page at a time and track page count');
if(!html.includes('scanPreview?.pdfDocument')||!html.includes('loadPdfScanPage(next)'))throw new Error('Scanned PDF previous/next navigation is not connected to the page viewer');
if(!html.includes('state.page.cleanup()')||!html.includes("safelyReleasePdfResource(preview.pdfLoadingTask,'destroy')")||!html.includes('function safelyReleasePdfResource(resource,method)')||!html.includes("releaseScanPreview();$('scanPreviewBox').style.display='none'"))throw new Error('PDF preview must release page/canvas/document resources when changing or closing files');
if(!html.includes("$('scanViewport').addEventListener('touchstart'")||!html.includes("$('scanViewport').addEventListener('touchend'"))throw new Error('Scanned PDF viewer must support horizontal swipe navigation');
if(!html.includes('if(!source||!source.width||!source.height||!display)return'))throw new Error('Scan preview must safely handle page transitions while a PDF canvas is being replaced');
if(!html.includes('function mapRectifiedOcrDataToSource(data,outputToSource)'))throw new Error('OCR data must have an explicit rectified-to-source coordinate mapper');
if(!html.includes('let ocrInput=canvas,rectification=null')||!html.includes('ocrInput=rectifiedCanvas'))throw new Error('PDF OCR must use the rectified scan only when a safe rectification succeeds');
if(!html.includes('mapRectifiedOcrDataToSource(ocr,rectification.outputToSource)'))throw new Error('Rectified OCR boxes must be mapped back to original PDF render coordinates before replacement');
if(!html.includes('rectifiedCanvas.width=rectifiedCanvas.height=0'))throw new Error('Temporary rectified OCR canvases must be released after each PDF page');
if(!html.includes('OCR выполнен по выправленному предпросмотру'))throw new Error('PDF translation must report when perspective correction was used for OCR');

const classifyStart=html.indexOf('function classifyPdfPageContent('),classifyEnd=html.indexOf('function createSafePdfViewport(',classifyStart);
if(classifyStart<0||classifyEnd<0)throw new Error('PDF page content classifier not found');
const classifyPdfPageContent=vm.runInNewContext(html.slice(classifyStart,classifyEnd)+';classifyPdfPageContent');
const mockOps={paintImageXObject:1,constructPath:2,stroke:3};
const textPage=classifyPdfPageContent({items:[{str:'Selectable PDF text'}]},{fnArray:[2,3]},mockOps);
if(textPage.kind!=='text'||!textPage.hasText||textPage.chars!==19)throw new Error('Native text PDF page was not classified correctly');
const scanPage=classifyPdfPageContent({items:[]},{fnArray:[1]},mockOps);
if(scanPage.kind!=='scan'||!scanPage.hasImages)throw new Error('Image-only scanned PDF page was not classified correctly');
const mixedPage=classifyPdfPageContent({items:[{str:'Caption'}]},{fnArray:[1,2]},mockOps);
if(mixedPage.kind!=='mixed'||mixedPage.imageOps!==1)throw new Error('Mixed text-and-image PDF page was not classified correctly');
const emptyPage=classifyPdfPageContent({items:[]},{fnArray:[]},mockOps);
if(emptyPage.kind!=='graphic-or-empty')throw new Error('Graphic or empty PDF page classification failed');
if(!html.includes('исходная PDF-страница сохранена без растеризации'))throw new Error('Native PDF pages must report that their original content is preserved');
if(!html.includes('текст не переведён, чтобы не повредить шрифты, графику и текстовый слой'))throw new Error('Preserved native PDF pages must disclose untranslated content');
if(!html.includes('для предотвращения потери содержимого применена растровая реконструкция'))throw new Error('PDF fallback must disclose when safe page copying is unavailable');

const preserveStart=html.indexOf('function shouldPreserveOriginalPdfPage('),preserveEnd=html.indexOf('function createSafePdfViewport(',preserveStart);
if(preserveStart<0||preserveEnd<0)throw new Error('PDF original-page preservation decision helper not found');
const shouldPreserveOriginalPdfPage=vm.runInNewContext(html.slice(preserveStart,preserveEnd)+';shouldPreserveOriginalPdfPage');
if(!shouldPreserveOriginalPdfPage({kind:'text'})||!shouldPreserveOriginalPdfPage({kind:'graphic-or-empty'}))throw new Error('Native text and graphic-only PDF pages must be preserved instead of rasterized when safe copying is available');
if(shouldPreserveOriginalPdfPage({kind:'scan'})||shouldPreserveOriginalPdfPage({kind:'mixed'}))throw new Error('Image-only scans and mixed image-text pages must continue through OCR reconstruction');
if(!html.includes("if(pageKind.kind==='mixed')pageWarnings.push('Страница '+pageNo+': обнаружены одновременно изображения и текстовый слой; страница направлена на OCR-перевод."))throw new Error('Mixed PDF pages must disclose rasterization and loss of the original text/vector layer');
if(!html.includes('outPdf.copyPages(sourcePdfForCopy,[pageNo-1])'))throw new Error('Original PDF pages must be copied into the output without rasterization');
if(!html.includes('if(!ocrWorker){')||!html.includes('const Tesseract=await ensureTesseract()'))throw new Error('OCR engine must be initialized lazily only when a page requires OCR');
if(!html.includes('текст не переведён, чтобы не повредить шрифты'))throw new Error('Preserved original PDF pages must disclose that their text remains untranslated');

const safeFillStart=html.indexOf('function estimateSafeBackgroundFill('),safeFillEnd=html.indexOf('function translationLayoutTokens(',safeFillStart);
if(safeFillStart<0||safeFillEnd<0)throw new Error('Conservative background restoration helper not found');
const safeFill=vm.runInNewContext(html.slice(safeFillStart,safeFillEnd)+';estimateSafeBackgroundFill');
function mockBackgroundContext(lineY=null){
 const canvas={width:60,height:60};
 return{canvas,getImageData(left,top,width,height){const data=new Uint8ClampedArray(width*height*4);for(let py=0;py<height;py++)for(let px=0;px<width;px++){const gx=left+px,gy=top+py,k=(py*width+px)*4,line=lineY!==null&&gy===lineY;data[k]=data[k+1]=data[k+2]=line?25:245;data[k+3]=255;}return{data};}};
}
const uniformFill=safeFill(mockBackgroundContext(),10,10,25,20,4);
if(!uniformFill.safe||uniformFill.color!=='rgb(245,245,245)')throw new Error('Uniform page background should be safe to restore');
const tableLineFill=safeFill(mockBackgroundContext(9),10,10,25,20,4);
if(tableLineFill.safe)throw new Error('A table/rule line beside the OCR box must prevent destructive solid fill');
const invalidFill=safeFill(mockBackgroundContext(),10,10,0,20,4);
if(invalidFill.safe)throw new Error('Invalid OCR boxes must never be cleared with a solid background');
if(!html.includes('исходная область оставлена без перезаписи'))throw new Error('Unsafe background regions must be preserved and reported');

const longWordFit=draw(mockContext,'supercalifragilisticexpialidocious',0,0,45,42,'en');
if(!longWordFit||longWordFit.lineCount<2)throw new Error('Long words must wrap by grapheme instead of being horizontally squeezed');
if(longWordFit.overflow!==false)throw new Error('A long word that can wrap vertically should fit without horizontal compression');
const tooNarrow=draw(mockContext,'AB',0,0,2,5,'en');
if(!tooNarrow||tooNarrow.overflow!==true||tooNarrow.fits!==false)throw new Error('Text that cannot fit even at minimum size must be reported, not silently distorted');
const cjkFit=draw(mockContext,'日本語の文章を翻訳します',0,0,30,90,'ja');
if(!cjkFit||cjkFit.lineCount<2)throw new Error('CJK translations must wrap at grapheme boundaries in narrow boxes');

const groupStart=html.indexOf('function groupOcrParagraphs('),groupEnd=html.indexOf('function ocrLinesForReplacement(',groupStart);
if(groupStart<0||groupEnd<0)throw new Error('OCR paragraph grouping helper not found');
const groupParagraphs=vm.runInNewContext(html.slice(groupStart,groupEnd)+';groupOcrParagraphs');
const paragraphLines=[
 {text:'This is the first',box:{x0:10,y0:10,x1:120,y1:22}},
 {text:'continuation of the same paragraph',box:{x0:11,y0:25,x1:180,y1:37}},
 {text:'and its final sentence.',box:{x0:12,y0:40,x1:150,y1:52}},
 {text:'A separate paragraph starts here.',box:{x0:10,y0:85,x1:180,y1:97}}
];
const groupedParagraphs=groupParagraphs(paragraphLines);
if(groupedParagraphs.length!==2||groupedParagraphs[0].lines.length!==3||groupedParagraphs[0].text!=='This is the first continuation of the same paragraph and its final sentence.')throw new Error('Adjacent OCR lines were not combined into a context-aware paragraph');
if(groupedParagraphs[0].box.y0!==10||groupedParagraphs[0].box.y1!==52)throw new Error('Paragraph bounds do not cover all original OCR lines');
const protectedTableLines=groupParagraphs(paragraphLines,{preserveLines:true});
if(protectedTableLines.length!==4||protectedTableLines.some(group=>group.lines.length!==1))throw new Error('Table-like layouts must preserve individual OCR lines');
const columns=groupParagraphs([
 {text:'Left one',box:{x0:10,y0:10,x1:70,y1:22}},
 {text:'Right one',box:{x0:220,y0:10,x1:280,y1:22}},
 {text:'Left two',box:{x0:11,y0:25,x1:72,y1:37}},
 {text:'Right two',box:{x0:221,y0:25,x1:282,y1:37}}
]);
if(columns.some(group=>group.lines.length>1))throw new Error('Separate columns must not be merged into one OCR paragraph');

const positionStart=html.indexOf('function epubPositionKey(');
const positionEnd=html.indexOf('function updateEpubNavigationButtons()',positionStart);
if(positionStart<0||positionEnd<0)throw new Error('EPUB position persistence helpers not found');
const positionStorage=new Map();
const positionHelpers=vm.runInNewContext(html.slice(positionStart,positionEnd)+';({epubPositionKey,readEpubPosition,saveEpubPosition})',{
 window:{localStorage:{getItem:key=>positionStorage.get(key)||null,setItem:(key,value)=>positionStorage.set(key,value)}},
 console:{warn(){}},Date
});
const epubFile={name:'sample.epub',size:12345,lastModified:1700000000000};
const positionKey=positionHelpers.epubPositionKey(epubFile);
if(positionKey!==positionHelpers.epubPositionKey({...epubFile}))throw new Error('The same EPUB file must resolve to a stable reading-position key');
if(positionKey===positionHelpers.epubPositionKey({...epubFile,size:54321}))throw new Error('Different EPUB files must not share a saved reading position');
if(positionHelpers.readEpubPosition(positionKey)!=='')throw new Error('Missing EPUB position must safely fall back to the start');
if(!positionHelpers.saveEpubPosition(positionKey,{start:{cfi:'epubcfi(/6/4[chapter]!/4/2/1:0)'}}))throw new Error('A valid EPUB CFI position should be saved');
if(positionHelpers.readEpubPosition(positionKey)!=='epubcfi(/6/4[chapter]!/4/2/1:0)')throw new Error('Saved EPUB CFI position was not restored');
positionStorage.set(positionKey,'{"cfi":"javascript:alert(1)"}');
if(positionHelpers.readEpubPosition(positionKey)!=='')throw new Error('Invalid stored EPUB positions must be rejected');
if(!html.includes('saveEpubPosition(epubPositionStorageKey,loc)')||!html.includes('await openedRendition.display(savedPosition)'))throw new Error('EPUB relocation must persist its CFI and opening must restore it');
if(!html.includes("catch(error){if(openToken!==requestId)return;console.warn('Сохранённая позиция EPUB недоступна, открываем начало книги',error);await openedRendition.display();}"))throw new Error('Invalid or stale EPUB positions must fall back to the beginning');

const epubTocStart=html.indexOf('function flattenEpubToc(');
const epubTocEnd=html.indexOf('function updateEpubNavigationButtons()',epubTocStart);
if(epubTocStart<0||epubTocEnd<0)throw new Error('EPUB table-of-contents helpers missing');
const flattenToc=vm.runInNewContext(html.slice(epubTocStart,epubTocEnd)+';flattenEpubToc');
const tocEntries=flattenToc([
 {label:'Chapter 1',href:'chapter1.xhtml',subitems:[{label:'Section 1.1',href:'chapter1.xhtml#section1'}]},
 {label:'Chapter 2',href:'chapter2.xhtml'},
 {label:'Empty item',href:''}
]);
if(tocEntries.length!==3||tocEntries[0].depth!==0||tocEntries[1].depth!==1||tocEntries[2].href!=='chapter2.xhtml')throw new Error('EPUB nested table-of-contents entries must flatten in reading order');
if(!html.includes('id="epubTocSelect"')||!html.includes('sourceBook.loaded.navigation')||!html.includes("await activeRendition.display(href)"))throw new Error('EPUB table of contents must be loaded and navigate to selected chapter hrefs');
if(!html.includes('populateEpubToc(openedBook,openToken);setProgress'))throw new Error('EPUB table of contents must populate after initial display');
if(!html.includes('const activeRendition=rendition,activeToken=requestId;')||!html.includes('activeToken===requestId&&rendition===activeRendition'))throw new Error('EPUB navigation must not let stale page or TOC operations unlock or report errors for a newer book');
if(!html.includes('await (delta<0?activeRendition.prev():activeRendition.next())'))throw new Error('EPUB page turns must use the rendition captured for the active reader session');
if(!html.includes('const sourceBook=expectedBook||book;')||!html.includes('book!==sourceBook||(openToken!==undefined&&openToken!==requestId)')||!html.includes('populateEpubToc(openedBook,openToken)')||!html.includes('book!==openedBook||rendition!==openedRendition'))throw new Error('Late EPUB loading must not overwrite the table of contents or UI after another book is opened');
if(!html.includes('if(state!==scanPreview){try{page.cleanup();}catch(e){}return;}')||!html.includes('if(state!==scanPreview){try{page.cleanup();}catch(e){}canvas.width=canvas.height=0;return;}'))throw new Error('Stale PDF page renders must release resources without updating the active reader');
if(!html.includes("rendition.on('selected',(cfi,contents)=>{if(openToken!==requestId||book!==openedBook||rendition!==openedRendition)return;")||!html.includes("rendition.on('rendered',()=>{if(openToken!==requestId||book!==openedBook||rendition!==openedRendition)return;")||!html.includes("rendition.on('relocated',loc=>{if(openToken!==requestId||book!==openedBook||rendition!==openedRendition)return;"))throw new Error('Stale EPUB rendition events must not mutate the active book UI or saved position');
if(!html.includes("function closeExisting(){const tocControl=$('epubTocSelect')")||!html.includes("tocControl.hidden=true;tocControl.disabled=false")||!html.includes("epubPositionStorageKey='';epubNavigationBusy=false;epubPageState={page:0,total:0}"))throw new Error('Switching away from EPUB must clear its table of contents, saved-position key, and navigation state');
if(!html.includes("rendition.resize()"))throw new Error('EPUB viewer must recalculate page layout after viewport resizing');
if(!html.includes("saveEpubPosition(epubPositionStorageKey,loc)"))throw new Error('EPUB position must be persisted after relocation, including layout changes');

const paginationStart=html.indexOf('function paginateReaderText(value){');
const paginationEnd=html.indexOf('\nfunction renderReaderPage()',paginationStart);
if(paginationStart<0||paginationEnd<0)throw new Error('Reader page measurement helper not found');
const paginationSource=html.slice(paginationStart,paginationEnd);
if(!paginationSource.includes('Math.max(1,textViewer.clientWidth||'))throw new Error('Reader page width must use the actual narrow viewport instead of forcing a 240px minimum');
if(!paginationSource.includes('Math.max(1,textViewer.clientHeight||'))throw new Error('Reader page height must use the actual short viewport instead of forcing a 320px minimum');
if(paginationSource.includes('Math.max(240,textViewer.clientWidth')||paginationSource.includes('Math.max(320,textViewer.clientHeight'))throw new Error('Reader pagination must not measure against dimensions larger than the visible page on small screens');

const spreadsheetExtractorStart=html.indexOf('async function extractSpreadsheetText(file,report,isCurrent=()=>true){');
const spreadsheetExtractorEnd=html.indexOf('let tesseractLoadingPromise=',spreadsheetExtractorStart);
if(spreadsheetExtractorStart<0||spreadsheetExtractorEnd<0)throw new Error('Cancellable spreadsheet extraction helper missing');
const spreadsheetExtractor=html.slice(spreadsheetExtractorStart,spreadsheetExtractorEnd);
for(const guard of ['await ensureXlsxLibrary();ensureCurrent()','await readFileBuffer(file);ensureCurrent()', "XLSX.read(buffer,{type:'array',cellDates:true});ensureCurrent()", 'for(let i=0;i<workbook.SheetNames.length;i++){\n  ensureCurrent();'])if(!spreadsheetExtractor.includes(guard))throw new Error('XLSX cancellation boundary missing: '+guard);
if(!html.includes('extractSpreadsheetText(file,report,isCurrent)'))throw new Error('XLSX extraction must receive the active reader cancellation guard');
const odtExtractorStart=html.indexOf('async function extractOdtText(file,isCurrent=()=>true){');
const odtExtractorEnd=html.indexOf('\n\nlet readerFullText=',odtExtractorStart);
if(odtExtractorStart<0||odtExtractorEnd<0)throw new Error('Cancellable ODT extraction helper missing');
const odtExtractor=html.slice(odtExtractorStart,odtExtractorEnd);
for(const guard of ['await ensureZipLibrary();ensureCurrent()','await readFileBuffer(file);ensureCurrent()','await JSZip.loadAsync(buffer);ensureCurrent()', "await entry.async('text');ensureCurrent()", 'ensureCurrent();return blocks'])if(!odtExtractor.includes(guard))throw new Error('ODT cancellation boundary missing: '+guard);
if(!html.includes('extractOdtText(file,isCurrent)'))throw new Error('ODT extraction must receive the active reader cancellation guard');
const pptxExtractorStart=html.indexOf("if(name.endsWith('.pptx')||type.includes('presentationml')){");
const pptxExtractorEnd=html.indexOf("if(name.endsWith('.docx')",pptxExtractorStart);
if(pptxExtractorStart<0||pptxExtractorEnd<0)throw new Error('PPTX extraction branch missing');
const pptxExtractor=html.slice(pptxExtractorStart,pptxExtractorEnd);
for(const guard of ['await ensureZipLibrary();ensureCurrent()','await readFileBuffer(file);ensureCurrent()','await JSZip.loadAsync(buffer);ensureCurrent()','for(let i=0;i<slides.length;i++){ensureCurrent();', "await entry.async('text');ensureCurrent()", 'ensureCurrent();return out.join'])if(!pptxExtractor.includes(guard))throw new Error('PPTX cancellation boundary missing: '+guard);
