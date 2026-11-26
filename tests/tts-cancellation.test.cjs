'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function createHarness(){
 const timers=[];let resumeCalls=0,lastUtterance=null;
 const synthesis={
  speaking:false,paused:false,
  getVoices(){return [{voiceURI:'test-ru',name:'Test Russian',lang:'ru-RU',default:true}];},
  addEventListener(){},
  cancel(){this.speaking=false;this.paused=false;},
  speak(utterance){lastUtterance=utterance;this.speaking=true;this.paused=false;},
  pause(){this.paused=true;},
  resume(){resumeCalls++;this.paused=false;}
 };
 class Utterance{constructor(text){this.text=text;this.lang='';this.voice=null;this.rate=1;this.onstart=null;this.onend=null;this.onerror=null;}}
 const window={speechSynthesis:synthesis,SpeechSynthesisUtterance:Utterance};
 const context={window,SpeechSynthesisUtterance:Utterance,setTimeout(fn,delay){timers.push({fn,delay});return timers.length;},clearTimeout(){},console};
 vm.runInNewContext(fs.readFileSync(require.resolve('../tts.js'),'utf8'),context,{filename:'tts.js'});
 window.ReadAloud.init({voiceSelect:null,rateInput:null,rateValue:null,status:null});
 function runDelay(delay){const timer=timers.find(item=>item.delay===delay&&!item.ran);if(!timer)throw new Error('Timer '+delay+' not found');timer.ran=true;timer.fn();}
 return {window,synthesis,timers,runDelay,get resumeCalls(){return resumeCalls;},get lastUtterance(){return lastUtterance;}};
}

{
 const h=createHarness();
 h.window.ReadAloud.speak('Проверка озвучивания.');
 h.runDelay(120);
 assert.ok(h.lastUtterance,'speech should start after its initial delay');
 const playbackTimers=h.timers.slice(-2);
 h.window.ReadAloud.pause();
 assert.equal(h.synthesis.paused,true,'pause should suspend active speech');
 playbackTimers.forEach(timer=>timer.fn());
 assert.equal(h.resumeCalls,0,'delayed recovery timers must not resume speech after the user pauses');
 assert.equal(h.synthesis.paused,true,'speech must remain paused');
}

{
 const h=createHarness();
 h.window.ReadAloud.speak('Первая книга.');
 h.runDelay(120);
 const staleTimers=h.timers.slice(-2);
 h.window.ReadAloud.stop();
 h.window.ReadAloud.speak('Вторая книга.');
 h.runDelay(120);
 staleTimers.forEach(timer=>timer.fn());
 assert.equal(h.resumeCalls,0,'timers from a stopped session must not resume a newer session');
 assert.ok(h.lastUtterance&&h.lastUtterance.text.includes('Вторая книга'),'the newer session should remain active');
}

console.log('TTS pause and stale-session timer tests passed');
