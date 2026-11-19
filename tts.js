/* Read & Translate — Android/iOS/desktop Web Speech API */
(()=>{'use strict';
 const supported=('speechSynthesis'in window)&&('SpeechSynthesisUtterance'in window);
 let voices=[],select=null,rateInput=null,rateValue=null,status=null,queue=[],index=0,paused=false,started=false;
 const say=(message)=>{if(status)status.textContent=message};
 function refreshVoices(){
  if(!supported){say('Озвучивание не поддерживается этим браузером. Откройте сайт в актуальном Chrome и проверьте системный движок TTS.');return;}
  const found=window.speechSynthesis.getVoices()||[];
  if(found.length)voices=found;
  if(select){
   const previous=select.value;select.innerHTML='';
   const auto=document.createElement('option');auto.value='';auto.textContent='Автоматический голос';select.appendChild(auto);
   voices.forEach((voice,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=voice.name+' · '+voice.lang+(voice.default?' · основной':'');select.appendChild(option)});
   if(previous&&voices[Number(previous)])select.value=previous;
  }
  if(!voices.length)say('Голоса не найдены. На Android включите движок «Преобразование текста в речь» и установите русский голос.');
  else if(!started)say('Голоса загружены: '+voices.length+'. Можно слушать книгу.');
 }
 function init(options){
  select=options.voiceSelect;rateInput=options.rateInput;rateValue=options.rateValue;status=options.status;
  if(!supported){say('Озвучивание не поддерживается этим браузером. Откройте сайт в Chrome.');return;}
  if(window.speechSynthesis.addEventListener)window.speechSynthesis.addEventListener('voiceschanged',refreshVoices);
  else window.speechSynthesis.onvoiceschanged=refreshVoices;
  refreshVoices();[250,800,1600,3000].forEach(ms=>setTimeout(refreshVoices,ms));
  if(rateInput&&rateValue){const update=()=>rateValue.textContent=Number(rateInput.value).toFixed(1).replace('.0','')+'×';update();rateInput.addEventListener('input',update);}
 }
 function chosenVoice(){if(select&&select.value!=='')return voices[Number(select.value)]||null;return voices.find(v=>/^ru(-|_|$)/i.test(v.lang))||voices.find(v=>v.default)||null}
 function makeQueue(text){
  const sentences=String(text||'').replace(/\s+/g,' ').trim().match(/[^.!?。！？]+[.!?。！？]*/g)||[String(text||'').trim()],parts=[];
  sentences.forEach(sentence=>{let rest=sentence.trim();while(rest.length>180){let cut=rest.lastIndexOf(' ',180);if(cut<60)cut=180;parts.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();}if(rest)parts.push(rest)});
  return parts;
 }
 function speak(text){
  if(!supported){say('Этот браузер не поддерживает системное озвучивание. Откройте сайт в Chrome.');return;}
  const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean){say('Нет текста для чтения.');return;}
  window.speechSynthesis.cancel();queue=makeQueue(clean);index=0;paused=false;started=false;
  say(voices.length?'Запускаю озвучивание…':'Запрашиваю системный голос…');setTimeout(playNext,120);
 }
 function playNext(){
  if(paused)return;if(index>=queue.length){started=false;say('Чтение завершено.');return;}
  const utterance=new SpeechSynthesisUtterance(queue[index++]),voice=chosenVoice();
  utterance.lang=voice?voice.lang:'ru-RU';if(voice)utterance.voice=voice;utterance.rate=rateInput?Number(rateInput.value):1;
  utterance.onstart=()=>{started=true;say('Читаю · фрагмент '+index+' из '+queue.length)};
  utterance.onend=()=>{if(!paused)setTimeout(playNext,80)};
  utterance.onerror=(event)=>{
   if(event.error==='canceled'||event.error==='interrupted')return;started=false;
   const detail=event.error==='not-allowed'?'Браузер запретил звук. Нажмите «Читать» ещё раз и проверьте разрешения.':event.error==='language-unavailable'?'Русский голос не установлен в Android. Установите голос в настройках преобразования текста в речь.':'Не удалось запустить системный голос ('+(event.error||'ошибка')+'). Проверьте движок TTS Android.';
   say(detail);
  };
  try{
   window.speechSynthesis.speak(utterance);
   setTimeout(()=>{try{window.speechSynthesis.resume()}catch(e){}},250);
   setTimeout(()=>{try{if(window.speechSynthesis.paused)window.speechSynthesis.resume()}catch(e){}},800);
  }catch(error){say('Системная озвучка недоступна. Проверьте службу TTS на устройстве.')}
 }
 function pause(){
  if(!supported)return;
  if(window.speechSynthesis.speaking&&!window.speechSynthesis.paused){window.speechSynthesis.pause();paused=true;say('Чтение приостановлено. Нажмите «Продолжить».')}
  else if(window.speechSynthesis.paused){paused=false;window.speechSynthesis.resume();say('Продолжаю чтение.')}
 }
 function stop(){if(supported)window.speechSynthesis.cancel();queue=[];index=0;paused=false;started=false;say('Озвучивание остановлено.')}
 window.ReadAloud={init,speak,pause,stop,refreshVoices,supported};
})();