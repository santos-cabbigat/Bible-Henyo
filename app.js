'use strict';
const $=id=>document.getElementById(id);const screens=['setup','game','tutorial','results','remote','orientation'];
const settings={get:(k,d)=>{try{return localStorage.getItem('bh_'+k)||d}catch{return d}},set:(k,v)=>{try{localStorage.setItem('bh_'+k,v)}catch{}}};
let state={phase:'setup',trial:false,trialStep:0,trialTarget:'correct',word:null,queue:[],seen:[],used:[],correct:0,passed:0,paused:false,deadline:0,remaining:0,duration:120,mode:'round',control:'tilt',lastAction:0,neutral:null,angle:null,armed:false,gestureSince:0,gestureDir:null,sensorOK:false,subscribed:false,remote:null,remoteCode:null,remoteRole:null,channel:null,remoteConnected:false,tick:null};
const HISTORY_KEY='bh_wordhistory';
function show(name){for(const s of screens)$(s).classList.toggle('hidden',s!==name);state.phase=name;}
function msg(s){$('motion-status').textContent=s;}
function audio(f=660){try{const a=new (window.AudioContext||window.webkitAudioContext)();const o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.1,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.12);o.start();o.stop(a.currentTime+.13);o.onended=()=>a.close()}catch{}}
function buzz(){try{navigator.vibrate?.(45)}catch{}}
function setWords(){const levels=$('difficulty').value;const candidates=TERMS.filter(t=>levels==='mixed'||t.level===levels);let history=[];try{history=JSON.parse(settings.get('wordhistory','[]'))}catch{}const previous=new Set(history);let available=candidates.filter(w=>!previous.has(w.word));if(!available.length){available=[...candidates];history=[]}shuffle(available);state.queue=available;state.seen=history;state.pool=candidates;}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a;}
function nextWord(){if(!state.queue.length){state.queue=shuffle([...state.pool]);state.seen=[]}const word=state.queue.pop();if(!word){finish();return}state.word=word;state.used.push({word:word.word,result:'pending'});state.seen.push(word.word);settings.set('wordhistory',JSON.stringify(state.seen.slice(-TERMS.length)));$('game-word').textContent=word.word;fitWord();state.armed=false;state.gestureDir=null;msg(state.control==='tilt'?'RETURN TO NEUTRAL':state.control==='touch'?'TOUCH TO ANSWER':'HOST CONTROLS');if(state.mode==='word')state.deadline=Date.now()+state.duration*1000;broadcastState()}
function fitWord(){const el=$('game-word');el.style.fontSize='';requestAnimationFrame(()=>{let f=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.parentElement.clientWidth-32&&f>24){f-=3;el.style.fontSize=f+'px'}})}
function transition(kind,source='touch'){if(state.phase!=='game'||state.paused||!state.word)return;const now=Date.now();if(now-state.lastAction<650)return;state.lastAction=now;state.used[state.used.length-1].result=kind;if(kind==='correct'){state.correct++;audio(790);$('game-feedback').textContent='✓ CORRECT'}else{state.passed++;audio(290);$('game-feedback').textContent='↷ PASS'}buzz();$('correct-score').textContent=state.correct;$('pass-score').textContent=state.passed;nextWord();if(source!=='remote')broadcastState();}
async function motionPermission(){if(!window.isSecureContext){return 'Motion requires HTTPS'};if(typeof DeviceOrientationEvent==='undefined')return 'Orientation sensors unavailable';try{if(typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')return 'Motion permission denied'}window.addEventListener('deviceorientation',onOrientation,{passive:true});return 'Listening for motion'}catch(e){return 'Motion permission unavailable: '+e.message}}
function orientationAngle(event) {
  if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return null;
  const radians = Math.PI / 180;
  const beta = event.beta * radians;
  const gamma = event.gamma * radians;
  const rotation = ((screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
  const vertical = rotation === 90 || rotation === 270
    ? Math.cos(beta) * Math.sin(gamma) * (rotation === 90 ? 1 : -1)
    : Math.sin(beta) * (rotation === 180 ? -1 : 1);
  return Math.atan2(Math.cos(beta) * Math.cos(gamma), vertical) / radians;
}
function onOrientation(e){const v=orientationAngle(e);if(v===null)return;state.angle=v;state.sensorOK=true;if(state.phase==='game'&&state.neutral===null)state.neutral=v;if(state.phase==='tutorial')onTutorialMotion(v);else if(state.phase==='game'&&state.control==='tilt'&&!state.paused)onGameMotion(v);}
function delta(){if(state.angle===null||state.neutral===null)return null;let d=state.angle-state.neutral;while(d>180)d-=360;while(d< -180)d+=360;return d;}
function gestureOf(deltaAngle, reverse = $('reverse-tilt').checked) {
  const threshold = Number($('threshold').value);
  const upward = reverse ? deltaAngle : -deltaAngle;
  if (upward >= threshold) return 'correct';
  if (upward <= -threshold) return 'pass';
  return null;
}

function onGameMotion(){const d=delta();if(d===null)return;const gesture=gestureOf(d);if(Math.abs(d)<11){state.armed=true;state.gestureDir=null;msg('READY · TILT TO ANSWER');return}if(!state.armed){msg('RETURN TO NEUTRAL');return}if(!gesture){state.gestureDir=null;return}if(gesture!==state.gestureDir){state.gestureDir=gesture;state.gestureSince=Date.now();return}if(Date.now()-state.gestureSince>=220){state.armed=false;transition(gesture,'tilt')}}
let practiceReverse = null;

function onTutorialMotion() {
  const step = state.trialStep;
  if (step === 0) {
    $('trial-sensor').textContent = 'Sensor active · angle ' + Math.round(state.angle) + '°';
    return;
  }
  const angle = delta();
  if (angle === null || step > 2) return;
  const status = $('trial-sensor');
  if (Math.abs(angle) < 11) {
    state.armed = true;
    state.gestureDir = null;
    status.textContent = 'Neutral detected — ready';
    return;
  }
  if (!state.armed) {
    status.textContent = 'Return to your calibrated position';
    return;
  }
  // In the first exercise, the player demonstrates what UP means on this phone.
  const reverse = step === 1 ? angle > 0 : practiceReverse ?? $('reverse-tilt').checked;
  const gesture = gestureOf(angle, reverse);
  if (gesture !== state.trialTarget) {
    state.gestureDir = null;
    status.textContent = gesture ? 'Try the other direction' : 'Move farther to tilt';
    return;
  }
  const direction = Math.sign(angle);
  if (direction !== state.gestureDir) {
    state.gestureDir = direction;
    state.gestureSince = Date.now();
    return;
  }
  if (Date.now() - state.gestureSince < 250) return;
  if (step === 1) {
    practiceReverse = reverse;
  } else if (practiceReverse !== null) {
    $('reverse-tilt').checked = practiceReverse;
    settings.set('reverse-v2', String(practiceReverse));
  }
  trialAction(gesture);
}
async function calibrate(){const result=await motionPermission();$('trial-sensor').textContent=result; if(state.sensorOK&&state.angle!==null){state.neutral=state.angle;trialStep(1)}else{$('trial-sensor').textContent=result+' · If no angle is detected, use practice buttons.';setTimeout(()=>{if(state.phase==='tutorial'&&state.trialStep===0&&state.angle!==null){state.neutral=state.angle;trialStep(1)}},500)}}
function trialStep(step){state.trialStep=step;state.armed=false;state.gestureDir=null;$('trial-manual').classList.toggle('hidden',step===0);$('trial-main').classList.toggle('hidden',step!==0);$('trial-fallback').classList.toggle('hidden',step!==0);const rows=[['STEP 1 OF 3 · CALIBRATE','Hold your phone steady','Hold the phone in landscape at your forehead. Tap Calibrate.','READY?'],['STEP 2 OF 3 · CORRECT','Practice Correct','Tilt the phone UP, then return to neutral.','MOSES'],['STEP 3 OF 3 · PASS','Practice Pass','Tilt the phone DOWN, then return to neutral.','JERICHO'],['READY TO PLAY','You did it!','Both movements are understood. Start your Bible Henyo round!','✓ READY']];const [label,title,desc,word]=rows[step];$('trial-step').textContent=label;$('trial-title').textContent=title;$('trial-desc').textContent=desc;$('trial-word').textContent=word;$('trial-sensor').textContent=step===0?'Motion sensor: not yet enabled':step===3?'Two-word tutorial completed':'Wait for neutral, then tilt';state.trialTarget=step===1?'correct':'pass';if(step===3){$('trial-manual').classList.add('hidden');$('trial-main').classList.remove('hidden');$('trial-main').textContent='Start real game';$('trial-main').onclick=()=>beginGame();settings.set('tutorial_done','true')}}
function trialAction(kind){if(state.trialStep===1&&kind==='correct'){audio();trialStep(2)}else if(state.trialStep===2&&kind==='pass'){audio(440);trialStep(3)}}
function beginTrial(){practiceReverse=null;state.neutral=null;state.mode=$('timer-mode').value;state.duration=Number($('duration').value);state.control=$('control-mode').value;setWords();state.trial=true;show('tutorial');trialStep(0);$('trial-main').textContent='Enable motion & calibrate';$('trial-main').onclick=calibrate;tryFullscreenAndLandscape();}
function startRequested(){state.mode=$('timer-mode').value;state.duration=Number($('duration').value);state.control=$('control-mode').value;setWords();if($('trial-toggle').checked&&settings.get('tutorial_done','false')!=='true')beginTrial();else beginGame()}
async function tryFullscreenAndLandscape(){try{if(document.documentElement.requestFullscreen&& !document.fullscreenElement)await document.documentElement.requestFullscreen()}catch{}try{if(screen.orientation?.lock)await screen.orientation.lock('landscape')}catch{} }
function beginGame(){if(!state.trial||state.neutral===null||!state.sensorOK)state.neutral=state.angle;state.trial=false;state.correct=0;state.passed=0;state.used=[];state.lastAction=0;state.paused=false;state.armed=false;state.remaining=state.duration*1000;state.deadline=Date.now()+state.remaining;$('correct-score').textContent='0';$('pass-score').textContent='0';$('game-feedback').textContent='';$('pause-mask').classList.add('hidden');$('game').classList.toggle('touch-mode',state.control==='touch');$('game').classList.toggle('remote-mode',state.control==='remote');$('game-subtitle').textContent=state.control==='remote'?'HOST CONNECTED GAME':'BIBLE WORD';show('game');nextWord();tryFullscreenAndLandscape();if(state.control==='tilt'&&!state.sensorOK){
  msg('HOLD STEADY TO CALIBRATE');
  motionPermission();
  setTimeout(()=>{
    if(state.phase==='game'&&state.control==='tilt'&&!state.sensorOK){
      state.control='touch';
      $('game').classList.add('touch-mode');
      msg('USE TOUCH BUTTONS');
    }
  },1800);
}if(state.control==='remote')setupRemoteGame();clearInterval(state.tick);state.tick=setInterval(tick,100);tick()}
function tick(){if(state.phase!=='game'||state.paused)return;const time=Math.max(0,state.deadline-Date.now());$('game-timer').textContent=formatTime(time);if(time<=0){if(state.mode==='round')finish();else{if(state.word){state.used[state.used.length-1].result='pass';state.passed++;$('pass-score').textContent=state.passed;nextWord()}}}else if(Math.floor(time/1000)!==state.lastShownSecond){state.lastShownSecond=Math.floor(time/1000);if(state.remoteConnected)broadcastState()}}
function formatTime(ms){const secs=Math.ceil(ms/1000);return String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0')}
function pause(){if(state.phase!=='game')return;state.paused=!state.paused;if(state.paused){state.remaining=Math.max(0,state.deadline-Date.now())}else state.deadline=Date.now()+state.remaining;$('pause-mask').classList.toggle('hidden',!state.paused);broadcastState()}
function finish(){clearInterval(state.tick);state.paused=true;if(state.used.length&&state.used[state.used.length-1].result==='pending')state.used.pop();$('result-correct').textContent=state.correct;$('result-pass').textContent=state.passed;$('result-words').innerHTML='<div class="result-list">'+state.used.slice(-25).map(t=>(t.result==='correct'?'✓ ':'↷ ')+escapeHTML(t.word)).join(' · ')+'</div>';broadcastState(true);cleanupRemote();show('results');try{if(document.fullscreenElement)document.exitFullscreen()}catch{}}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function exit(){clearInterval(state.tick);cleanupRemote();show('setup');try{if(document.fullscreenElement)document.exitFullscreen()}catch{}}
// Optional real-time room using Supabase Realtime broadcast. Personal public project URL and client publishable key needed.
let realtimeLoader;
function loadRealtime(){if(window.supabase?.createClient)return Promise.resolve();if(realtimeLoader)return realtimeLoader;realtimeLoader=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Could not load remote library'));document.head.appendChild(s)});return realtimeLoader}
function getRemoteCreds(){return{url:settings.get('sb-url',''),key:settings.get('sb-key','')}}
let supabaseClient=null;async function client(){const{url,key}=getRemoteCreds();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key||/service.role|secret/i.test(key))throw Error('Enter a personal Supabase project URL and public publishable or anon key in Settings');await loadRealtime();if(!supabaseClient)supabaseClient=window.supabase.createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});return supabaseClient}
function send(event,payload){if(!state.channel||!state.remoteConnected)return;state.channel.send({type:'broadcast',event,payload}).catch(()=>{})}
function broadcastState(done=false){if(state.remoteRole!=='player')return;send('state',{word:state.word?.word||'',timer:formatTime(Math.max(0,state.deadline-Date.now())),correct:state.correct,passed:state.passed,paused:state.paused,done});}
function roomCode(){return Array.from(crypto.getRandomValues(new Uint8Array(4)),n=>n.toString(36).padStart(2,'0')).join('').slice(0,6).toUpperCase()}
async function joinRoom(code,role){try{const c=await client();state.remoteRole=role;state.remoteCode=code;state.channel=c.channel('bible-henyo-'+code,{config:{broadcast:{ack:true,self:false}}});state.channel.on('broadcast',{event:'command'},({payload})=>{if(state.remoteRole==='player'){if(payload?.action==='correct'||payload?.action==='pass')transition(payload.action,'remote');else if(payload?.action==='sync')broadcastState()}});state.channel.on('broadcast',{event:'state'},({payload})=>{if(state.remoteRole==='host'){ $('remote-word').textContent=payload.done?'Round complete':payload.word;$('remote-timer').textContent=payload.timer;$('remote-score').textContent='Correct '+payload.correct+' · Passed '+payload.passed;$('remote-status').textContent=payload.done?'Game finished':'Connected to player'}});state.channel.subscribe(status=>{state.remoteConnected=status==='SUBSCRIBED';if(state.remoteConnected){if(role==='host'){send('command',{action:'sync'});$('remote-status').textContent='Connected; requesting game state…'}else broadcastState()}else if(status==='CHANNEL_ERROR'){$('remote-status').textContent='Connection error — check project settings'}})}catch(e){if(role==='host')$('remote-status').textContent=e.message;else alert('Remote connection unavailable: '+e.message+'\nTouch controls remain available.')}}
async function setupRemoteGame(){let code=state.remoteCode;if(!code){code=roomCode();state.remoteCode=code}const url=new URL(location.href);url.searchParams.set('host',code);$('game-subtitle').textContent='HOST ROOM '+code+' · Share code or link';$('game-feedback').textContent='Host link: '+url.href;await joinRoom(code,'player')}
function cleanupRemote(){if(state.channel){try{state.channel.unsubscribe()}catch{}state.channel=null}state.remoteConnected=false;state.remoteRole=null;state.remoteCode=null;supabaseClient=null}
function init(){ $('bank-count').textContent=TERMS.length.toLocaleString()+' starter words';$('library-stat').textContent=TERMS.length.toLocaleString()+' distinct one-word entries bundled (starter collection; 10,000 is the expansion target).';$('start-btn').onclick=startRequested;$('trial-btn').onclick=beginTrial;$('skip-trial').onclick=()=>{settings.set('tutorial_done','true');if(state.trial)beginGame();else exit()};$('trial-fallback').onclick=()=>{state.neutral=null;state.sensorOK=false;trialStep(1)};$('trial-correct').onclick=()=>trialAction('correct');$('trial-pass').onclick=()=>trialAction('pass');$('game-exit').onclick=exit;$('game-pause').onclick=pause;$('resume-btn').onclick=pause;$('touch-correct').onclick=()=>transition('correct');$('touch-pass').onclick=()=>transition('pass');$('play-again').onclick=()=>{setWords();beginGame()};$('back-home').onclick=exit;$('threshold').value=settings.get('threshold','28');$('threshold-label').textContent=$('threshold').value;$('threshold').oninput=e=>{$('threshold-label').textContent=e.target.value;settings.set('threshold',e.target.value)};$('reverse-tilt').checked=settings.get('reverse-v2','false')==='true';$('reverse-tilt').onchange=e=>settings.set('reverse-v2',String(e.target.checked));$('timer-mode').onchange=()=>{$('duration').value=$('timer-mode').value==='word'?'30':'120'};$('reset-history').onclick=()=>{settings.set('wordhistory','[]');alert('Replay history cleared')};$('sb-url').value=settings.get('sb-url','');$('sb-key').value=settings.get('sb-key','');$('save-remote').onclick=()=>{let k=$('sb-key').value.trim();if(/service.role|secret/i.test(k)){alert('Never enter a secret or service-role key');return}settings.set('sb-url',$('sb-url').value.trim());settings.set('sb-key',k);supabaseClient=null;alert('Public realtime settings saved on this device')};$('remote-exit').onclick=exit;$('remote-correct').onclick=()=>send('command',{action:'correct'});$('remote-pass').onclick=()=>send('command',{action:'pass'});$('orientation-continue').onclick=()=>$('orientation').classList.add('hidden');window.addEventListener('resize',()=>{if(state.phase==='game')fitWord()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.phase==='game'&&!state.paused)pause()});const host=new URL(location.href).searchParams.get('host');if(host&&/^[A-Z0-9]{6}$/i.test(host)){show('remote');joinRoom(host.toUpperCase(),'host')}if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});}
init();
