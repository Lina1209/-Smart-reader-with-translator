const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');

const helperStart=html.indexOf('function getPptxTranslatableContentPaths(');
const helperEnd=html.indexOf('\n}',helperStart);
if(helperStart<0||helperEnd<0)throw new Error('PPTX content-path selector was not found');
const getPaths=vm.runInNewContext(html.slice(helperStart,helperEnd+2)+'; getPptxTranslatableContentPaths');
const input=[
 'ppt/slides/slide10.xml','ppt/slides/slide2.xml','ppt/slides/slide1.xml',
 'ppt/notesSlides/notesSlide1.xml','ppt/charts/chart2.xml',
 'ppt/diagrams/drawing1.xml','ppt/diagrams/data1.xml',
 'ppt/slideLayouts/slideLayout1.xml','ppt/slideMasters/slideMaster1.xml',
 'ppt/media/image1.png','ppt/charts/chart2.xml.rels'
];
const paths=getPaths(input);
const expected=[
 'ppt/slides/slide1.xml','ppt/slides/slide2.xml','ppt/slides/slide10.xml',
 'ppt/charts/chart2.xml','ppt/diagrams/data1.xml','ppt/diagrams/drawing1.xml',
 'ppt/notesSlides/notesSlide1.xml'
];
if(JSON.stringify(paths)!==JSON.stringify(expected))throw new Error('PPTX text-bearing parts were omitted, duplicated or incorrectly ordered: '+JSON.stringify(paths));

const xlsxStart=html.indexOf("}else if(ext==='xlsx'||ext==='xlsm'){",html.indexOf('async function translatePreservingFile('));
const pptxStart=html.indexOf("}else if(ext==='pptx'){",xlsxStart);
if(xlsxStart<0||pptxStart<0)throw new Error('XLSX translation branch was not found');
const xlsx=html.slice(xlsxStart,pptxStart);
if(!xlsx.includes("if(doc.getElementsByTagName('parsererror').length)throw Error('Не удалось прочитать общие текстовые строки книги Excel (sharedStrings.xml).');"))throw new Error('Malformed sharedStrings.xml must be rejected before translation');
if(!xlsx.includes("if(doc.getElementsByTagName('parsererror').length)throw Error('Не удалось прочитать лист Excel '+path+'.');"))throw new Error('Malformed worksheet XML must be rejected before translation');
if(!xlsx.includes("p=>/^xl\\/charts\\/chart\\d+\\.xml$/i.test(p)"))throw new Error('Excel chart XML discovery is missing');
if(!xlsx.includes("await translateXmlParagraphs(doc,'p'"))throw new Error('Rich-text paragraphs in Excel charts must be translated');
for(const resource of ['xl/styles.xml','xl/theme/','xl/media/','xl/drawings/']){
 if(xlsx.includes("zip.file('"+resource))throw new Error('Translation must not overwrite preserved workbook resource '+resource);
}
if(!html.includes('кэшированные подписи диаграмм'))throw new Error('XLSX limitation notice must disclose cached chart labels');
const pptxBranch=html.slice(pptxStart,html.indexOf("if(ext==='odt')await prepareOdtArchiveMimetype",pptxStart));
if(!pptxBranch.includes('getPptxTranslatableContentPaths(Object.keys(zip.files))'))throw new Error('PPTX translator must use the tested content-part selector');
if(!html.includes('встроенные книги Excel'))throw new Error('PPTX limitation notice must disclose embedded Excel workbook text');
console.log('Office resource coverage checks passed.');
