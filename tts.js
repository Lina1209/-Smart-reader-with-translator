/* Read & Translate — системное озвучивание текста (Web Speech API).
   Использует голоса, установленные в браузере/операционной системе; движок отдельно не встраивается. */
(()=>{'use strict';
 const supported=('speechSynthesis'in window)&&('SpeechSynthesisUtterance'in window);
 let voices=[],select=null,rateInput=null,status=null,activeUtterance=null,queue=[],index=0,paused=false;
 const say=(message)=>{if(status)status.textContent=message};
 function refreshVoices(){if(!supported||!select)return;voices=window.speechSynthesis.getVoices()||[];const previous=select.value;select.innerHTML='';const auto=document.createElement('option');auto.value='';auto.textContent='Автоматический голос';select.appendChild(auto);
  voices.forEach((voice,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=voice.name+' · '+voice.lang+(voice.default?' · основной':'');select.appendChild(option)});
  if(previous&&voices[Number(previous)])select.value=previous;
  if(!voices.length)say('Список голосов пока пуст. Проверьте системную службу TTS и установленные голосовые пакеты.');
 }
 function init(options){select=options.voiceSelect;rateInput=options.rateInput;status=options.status;window.speechSynthesis.onvoiceschanged=refreshVoices;refreshVoices();setTimeout(refreshVoices,500);setTimeout(refreshVoices,1500);}
 function chosenVoice(){if(select&&select.value!=='')return voices[Number(select.value)]||null;return voices.find(v=>/^ru(-|$)/i.test(v.lang))||voices.find(v=>v.default)||null}
 function speak(text){if(!supported){say('Этот браузер не поддерживает системное озвучивание.');return;}stop();const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean){say('Нет текста для чтения.');return;}
  queue=clean.match(/[^.!?。！？]+[.!?。！？]*/g)||[clean];queue=queue.map(x=>x.trim()).filter(Boolean);index=0;paused=false;say('Подготовка голоса…');playNext();}
 function playNext(){if(paused||index>=queue.length){if(index>=queue.length)say('Чтение завершено.');return;}const part=queue[index++];activeUtterance=new SpeechSynthesisUtterance(part);const voice=chosenVoice();if(voice){activeUtterance.voice=voice;activeUtterance.lang=voice.lang;}else activeUtterance.lang='ru-RU';activeUtterance.rate=rateInput?Number(rateInput.value):1;activeUtterance.onstart=()=>say('Читаю · фрагмент '+index+' из '+queue.length);activeUtterance.onend=()=>{if(!paused)playNext()};activeUtterance.onerror=(event)=>{if(event.error!=='canceled'&&event.error!=='interrupted')say('Не удалось воспроизвести голос. Проверьте настройки TTS устройства.');};window.speechSynthesis.speak(activeUtterance);}
 function pause(){if(!supported)return;if(window.speechSynthesis.speaking&&!window.speechSynthesis.paused){window.speechSynthesis.pause();paused=true;say('Чтение приостановлено. Нажмите «Читать», чтобы продолжить.');}else if(window.speechSynthesis.paused){window.speechSynthesis.resume();paused=false;say('Продолжаю чтение.');}}
 function stop(){if(supported)window.speechSynthesis.cancel();queue=[];index=0;paused=false;activeUtterance=null;say('Озвучивание остановлено.');}
 window.ReadAloud={init,speak,pause,stop,refreshVoices};
})();