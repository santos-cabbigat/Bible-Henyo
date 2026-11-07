'use strict';
const $=id=>document.getElementById(id);const screens=['setup','game','tutorial','results','remote','orientation','pairing','tilt-ready'];
const settings={get:(k,d)=>{try{return localStorage.getItem('bh_'+k)||d}catch{return d}},set:(k,v)=>{try{localStorage.setItem('bh_'+k,v)}catch{}}};
let state={phase:'setup',trial:false,trialStep:0,trialTarget:'correct',word:null,queue:[],seen:[],used:[],correct:0,passed:0,paused:false,deadline:0,remaining:0,duration:120,mode:'round',control:'tilt',lastAction:0,neutral:null,angle:null,armed:false,gestureSince:0,gestureDir:null,sensorOK:false,subscribed:false,remote:null,remoteCode:null,remoteRole:null,channel:null,remoteConnected:false,tick:null};
function levelName(level) { return level.charAt(0).toUpperCase() + level.slice(1); }
const HISTORY_KEY='bh_wordhistory';
function show(name){for(const s of screens)$(s).classList.toggle('hidden',s!==name);state.phase=name;}
function msg(s){$('motion-status').textContent=s;}
function audio(f=660){try{const a=new (window.AudioContext||window.webkitAudioContext)();const o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(a.destination);g.gain.setValueAtTime(.1,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.12);o.start();o.stop(a.currentTime+.13);o.onended=()=>a.close()}catch{}}
function buzz(){try{navigator.vibrate?.(45)}catch{}}
function setWords(){const levels=$('difficulty').value;const candidates=TERMS.filter(t=>levels==='mixed'||t.level===levels);let history=[];try{history=JSON.parse(settings.get('wordhistory','[]'))}catch{}const previous=new Set(history);let available=candidates.filter(w=>!previous.has(w.word));if(!available.length){available=[...candidates];history=[]}shuffle(available);state.queue=available;state.seen=history;state.pool=candidates;}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a;}
function nextWord(){if(!state.queue.length){state.queue=shuffle([...state.pool]);state.seen=[]}const word=state.queue.pop();if(!word){finish();return}state.word=word;$('game-subtitle').textContent=levelName(word.level);state.used.push({word:word.word,result:'pending'});state.seen.push(word.word);settings.set('wordhistory',JSON.stringify(state.seen.slice(-TERMS.length)));$('game-word').textContent=word.word;fitWord();state.armed=false;state.gestureDir=null;msg(state.control==='tilt'?'RETURN TO NEUTRAL':state.control==='touch'?'TOUCH TO ANSWER':'HOST CONTROLS');if(state.mode==='word')state.deadline=Date.now()+state.duration*1000;broadcastState()}
function fitWord(){const el=$('game-word');el.style.fontSize='';requestAnimationFrame(()=>{let f=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.parentElement.clientWidth-32&&f>24){f-=3;el.style.fontSize=f+'px'}})}
function transition(kind,source='touch'){if(state.phase!=='game'||state.paused||!state.word)return;const now=Date.now();if(source==='touch'&&now-state.lastAction<350)return;state.lastAction=now;state.used[state.used.length-1].result=kind;if(kind==='correct'){state.correct++;audio(790);$('game-feedback').textContent='✓ CORRECT'}else{state.passed++;audio(290);$('game-feedback').textContent='↷ PASS'}buzz();$('correct-score').textContent=state.correct;$('pass-score').textContent=state.passed;nextWord();}
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
function onOrientation(e){const v=orientationAngle(e);if(v===null)return;state.angle=v;state.lastReading=Date.now();state.sensorOK=true;if(state.phase==='game'&&state.neutral===null)state.neutral=v;if(state.phase==='tilt-ready' && waitingForNeutral) startAtNeutral();
else if(state.phase==='tutorial' && awaitingPractice && state.trialStep===0) { awaitingPractice=false; state.neutral=v;trialStep(1); }
else if(state.phase==='tutorial')onTutorialMotion(v);else if(state.phase==='game'&&state.control==='tilt'&&!state.paused)onGameMotion(v);}
function delta(){if(state.angle===null||state.neutral===null)return null;let d=state.angle-state.neutral;while(d>180)d-=360;while(d< -180)d+=360;return d;}
function withinNeutral(angle) {
  return Math.abs(angle) <= Math.max(8, Math.min(20, Number($('threshold').value) * 0.55));
}
function gestureOf(deltaAngle, reverse = $('reverse-tilt').checked) {
  const threshold = Number($('threshold').value);
  const upward = reverse ? deltaAngle : -deltaAngle;
  if (upward >= threshold) return 'correct';
  if (upward <= -threshold) return 'pass';
  return null;
}

function onGameMotion(){const d=delta();if(d===null)return;const gesture=gestureOf(d);if(withinNeutral(d)){state.armed=true;state.gestureDir=null;msg('READY · TILT TO ANSWER');return}if(!state.armed){msg('RETURN TO NEUTRAL');return}if(!gesture){state.gestureDir=null;return}if(gesture!==state.gestureDir){state.gestureDir=gesture;state.gestureSince=Date.now();return}if(Date.now()-state.gestureSince>=220){state.armed=false;transition(gesture,'tilt')}}
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
  if (withinNeutral(angle)) {
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
let waitingForNeutral = false;
let awaitingPractice = false;

async function calibrate() {
  awaitingPractice = true;
  const result = await motionPermission();
  if (state.phase !== 'tutorial' || state.trialStep !== 0) return;
  if (state.sensorOK && state.angle !== null) {
    awaitingPractice = false;
    state.neutral = state.angle;
    trialStep(1);
  } else {
    $('trial-sensor').textContent = result + ' · Hold still, or use the practice buttons.';
  }
}

function readyForTilt() {
  waitingForNeutral = false;
  state.neutral = null;
  show('tilt-ready');
  $('ready-message').textContent = 'Hold the phone sideways at your forehead, then tap Start with tilt.';
  $('ready-tilt').disabled = false;
}
function startAtNeutral() {
  if (state.phase !== 'tilt-ready' || !waitingForNeutral || state.angle === null) return;
  waitingForNeutral = false;
  state.neutral = state.angle;
  beginGame();
}
async function armTilt() {
  if (!state.lastReading || Date.now()-state.lastReading > 1500) { state.angle=null;state.sensorOK=false; }
  waitingForNeutral = true;
  $('ready-tilt').disabled = true;
  $('ready-message').textContent = 'Waiting for a motion reading…';
  const result = await motionPermission();
  if (state.phase !== 'tilt-ready' || !waitingForNeutral) return;
  if (state.sensorOK && state.angle !== null) return startAtNeutral();
  $('ready-message').textContent = result + ' · Move the phone slightly, then hold it steady. You can also play with buttons.';
  $('ready-tilt').disabled = false;
}
function beginSelectedRound() {
  if (state.control === 'remote') return createRoom();
  if (state.control === 'tilt' && !(state.trial && state.sensorOK && state.neutral !== null)) return readyForTilt();
  beginGame();
}
function trialStep(step){clearInterval(state.practiceTick);if(step===1||step===2)state.practiceTick=setInterval(()=>{if(state.phase==='tutorial'&&state.gestureDir)onTutorialMotion()},80);state.trialStep=step;state.armed=false;state.gestureDir=null;$('trial-manual').classList.toggle('hidden',step===0);$('trial-main').classList.toggle('hidden',step!==0);$('trial-fallback').classList.toggle('hidden',step!==0);const rows=[['STEP 1 OF 3 · CALIBRATE','Hold your phone steady','Hold the phone in landscape at your forehead. Tap Calibrate.','READY?'],['STEP 2 OF 3 · CORRECT','Practice Correct','Tilt the phone UP, then return to neutral.','MOSES'],['STEP 3 OF 3 · PASS','Practice Pass','Tilt the phone DOWN, then return to neutral.','JERICHO'],['READY TO PLAY','You did it!','Both movements are understood. Start your Bible Henyo round!','✓ READY']];const [label,title,desc,word]=rows[step];$('trial-step').textContent=label;$('trial-title').textContent=title;$('trial-desc').textContent=desc;$('trial-word').textContent=word;$('trial-sensor').textContent=step===0?'Motion sensor: not yet enabled':step===3?'Two-word tutorial completed':'Wait for neutral, then tilt';state.trialTarget=step===1?'correct':'pass';if(step===3){$('trial-manual').classList.add('hidden');$('trial-main').classList.remove('hidden');$('trial-main').textContent='Start real game';$('trial-main').onclick=beginSelectedRound;settings.set('tutorial_done','true');$('trial-toggle').checked=false;settings.set('trial-toggle','false')}}
function trialAction(kind){if(state.trialStep===1&&kind==='correct'){audio();trialStep(2)}else if(state.trialStep===2&&kind==='pass'){audio(440);trialStep(3)}}
function beginTrial(){awaitingPractice=false;practiceReverse=null;state.neutral=null;state.mode=$('timer-mode').value;state.duration=Number($('duration').value);state.control=$('control-mode').value;setWords();state.trial=true;show('tutorial');trialStep(0);$('trial-main').textContent='Enable motion & calibrate';$('trial-main').onclick=calibrate;tryFullscreenAndLandscape();}
function startRequested(){state.mode=$('timer-mode').value;state.duration=Number($('duration').value);state.control=$('control-mode').value;setWords();if(state.control==='remote')return createRoom();if(state.control==='tilt'&&$('trial-toggle').checked)beginTrial();else beginSelectedRound()}
async function tryFullscreenAndLandscape(){try{if(document.documentElement.requestFullscreen&& !document.fullscreenElement)await document.documentElement.requestFullscreen()}catch{}try{if(screen.orientation?.lock)await screen.orientation.lock('landscape')}catch{} }
function beginGame(){$('recenter-tilt').classList.toggle('hidden',state.control!=='tilt');clearInterval(state.practiceTick);if(state.neutral===null)state.neutral=state.angle;state.trial=false;state.correct=0;state.passed=0;state.used=[];state.lastAction=0;state.paused=false;state.armed=false;state.remaining=state.duration*1000;state.deadline=Date.now()+state.remaining;$('correct-score').textContent='0';$('pass-score').textContent='0';$('game-feedback').textContent='';$('pause-mask').classList.add('hidden');$('game').classList.toggle('touch-mode',state.control==='touch');$('game').classList.toggle('remote-mode',state.control==='remote');$('game-subtitle').textContent=state.control==='remote'?'HOST CONNECTED GAME':'BIBLE WORD';show('game');nextWord();if(state.control==='tilt'&&delta()!==null&&withinNeutral(delta())){state.armed=true;msg('READY · TILT TO ANSWER')}tryFullscreenAndLandscape();clearInterval(state.tick);state.tick=setInterval(tick,100);tick()}
function tick(){if(state.phase!=='game'||state.paused)return;if(state.control==='tilt'&&state.gestureDir)onGameMotion();const time=Math.max(0,state.deadline-Date.now());$('game-timer').textContent=formatTime(time);if(time<=0){if(state.mode==='round')finish();else{if(state.word){state.used[state.used.length-1].result='pass';state.passed++;$('pass-score').textContent=state.passed;nextWord()}}}else if(Math.floor(time/1000)!==state.lastShownSecond){state.lastShownSecond=Math.floor(time/1000);if(state.remoteConnected)broadcastState()}}
function formatTime(ms){const secs=Math.ceil(ms/1000);return String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0')}
function pause(){if(state.phase!=='game')return;state.paused=!state.paused;if(state.paused){state.armed=false;state.gestureDir=null;state.remaining=Math.max(0,state.deadline-Date.now())}else state.deadline=Date.now()+state.remaining;$('pause-mask').classList.toggle('hidden',!state.paused);broadcastState()}
function finish(){clearInterval(state.tick);state.paused=true;if(state.used.length&&state.used[state.used.length-1].result==='pending')state.used.pop();$('result-correct').textContent=state.correct;$('result-pass').textContent=state.passed;$('result-words').innerHTML='<div class="result-list">'+state.used.slice(-25).map(t=>(t.result==='correct'?'✓ ':'↷ ')+escapeHTML(t.word)).join(' · ')+'</div>';show('results');broadcastState();try{if(document.fullscreenElement)document.exitFullscreen()}catch{}}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function exit(){clearInterval(state.practiceTick);clearInterval(state.tick);cleanupRemote();show('setup');try{if(document.fullscreenElement)document.exitFullscreen()}catch{}}
function initGameSettings() {
  for (const id of ['difficulty','control-mode','timer-mode']) {
    const select = $(id);
    const saved = settings.get(id,select.value);
    if ([...select.options].some(option => option.value === saved)) select.value = saved;
    select.onchange = () => settings.set(id,select.value);
  }
  const duration = $('duration');
  function restoreDuration() {
    const mode = $('timer-mode').value;
    const saved = settings.get('duration-'+mode, mode === 'word' ? '30' : '120');
    duration.value = [...duration.options].some(option => option.value === saved) ? saved : '30';
  }
  restoreDuration();
  duration.onchange = () => settings.set('duration-'+$('timer-mode').value, duration.value);
  $('timer-mode').onchange = () => { settings.set('timer-mode',$('timer-mode').value); restoreDuration(); };
  const practice = $('trial-toggle');
  practice.checked = settings.get('trial-toggle', settings.get('tutorial_done','false') === 'true' ? 'false' : 'true') === 'true';
  practice.onchange = () => settings.set('trial-toggle',String(practice.checked));
  $('ready-tilt').onclick = armTilt;
  $('ready-touch').onclick = () => { waitingForNeutral=false;state.control='touch'; beginGame(); };
  $('ready-exit').onclick = exit;
  $('recenter-tilt').onclick = () => {
    if (state.phase !== 'game' || !state.paused || state.angle === null) return;
    state.neutral=state.angle;state.gestureDir=null;state.armed=true;pause();msg('READY · TILT TO ANSWER');
  };
}
function init(){initGameSettings(); $('bank-count').textContent=TERMS.length.toLocaleString()+' starter words';$('library-stat').textContent=TERMS.length.toLocaleString()+' distinct one-word entries bundled (starter collection; 10,000 is the expansion target).';$('start-btn').onclick=startRequested;$('trial-btn').onclick=beginTrial;$('skip-trial').onclick=()=>{settings.set('tutorial_done','true');$('trial-toggle').checked=false;settings.set('trial-toggle','false');if(state.trial)beginSelectedRound();else exit()};$('trial-fallback').onclick=()=>{state.neutral=null;state.sensorOK=false;trialStep(1)};$('trial-correct').onclick=()=>trialAction('correct');$('trial-pass').onclick=()=>trialAction('pass');$('game-exit').onclick=exit;$('game-pause').onclick=pause;$('resume-btn').onclick=pause;$('touch-correct').onclick=()=>transition('correct');$('touch-pass').onclick=()=>transition('pass');$('play-again').onclick=()=>{if(state.control==='remote')return startPairedRound();setWords();beginSelectedRound()};$('back-home').onclick=exit;$('threshold').value=settings.get('threshold','28');$('threshold-label').textContent=$('threshold').value;$('threshold').oninput=e=>{$('threshold-label').textContent=e.target.value;settings.set('threshold',e.target.value)};$('reverse-tilt').checked=settings.get('reverse-v2','false')==='true';$('reverse-tilt').onchange=e=>settings.set('reverse-v2',String(e.target.checked));$('reset-history').onclick=()=>{settings.set('wordhistory','[]');alert('Replay history cleared')};$('orientation-continue').onclick=()=>$('orientation').classList.add('hidden');window.addEventListener('resize',()=>{if(state.phase==='game')fitWord()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.phase==='game'&&!state.paused)pause()});if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});}
init();
