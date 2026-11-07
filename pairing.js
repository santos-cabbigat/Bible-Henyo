'use strict';

let room = null;
const roomService = 'https://bible-henyo-game-rooms.cabbigatsantos07.chatgpt.site';
async function roomRequest(path, payload, keepalive=false) {
  const response = await fetch(roomService+path, {
    method:'POST', body:JSON.stringify(payload), cache:'no-store', credentials:'omit',
    signal:AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined, keepalive
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Connection unavailable.'),{status:response.status});
  return data;
}

function cleanupRemote() {
  const old = room;
  room = null;
  state.remoteConnected = false;
  if (old) {
    clearTimeout(old.timer);
    if (old.registered) roomRequest('/rooms/'+old.code+'/leave',{token:old.token},true).catch(()=>{});
  }
  const url = new URL(location.href);
  if (url.searchParams.has('host')) {
    url.searchParams.delete('host');
    history.replaceState(null,'',url);
  }
}

function lobby(isPlayer) {
  show('pairing');
  $('pair-title').textContent = isPlayer ? 'Player phone' : 'Join as remote';
  $('create-panel').classList.toggle('hidden', !isPlayer);
  $('join-panel').classList.toggle('hidden', isPlayer);
  $('pair-start').classList.add('hidden');
  $('share-game').disabled = true;
  $('connect-remote').disabled = false;
}

function notice(message) {
  $('pair-status').textContent = message;
  $('remote-status').textContent = message;
}

function createRoom() {
  cleanupRemote();
  state.control = 'remote';
  lobby(true);
  $('room-id').textContent = '…';
  connectRoom('', true);
}

function joinForm(code = '') {
  cleanupRemote();
  lobby(false);
  $('join-id').value = code;
  notice('Enter the six-character game ID.');
  if (code) connectRoom(code, false);
}

async function connectRoom(code, player) {
  if (room) cleanupRemote();
  const session = {code,player,token:crypto.randomUUID(),round:0,snapshot:null,ack:null,pending:null,lastOK:Date.now()};
  room = session;
  notice('Connecting…');
  $('connect-remote').disabled = true;
  try {
    const response=await roomRequest(player ? '/rooms' : '/rooms/'+code+'/join',{token:session.token});
    session.code=response.code;
    session.registered=true;
    if (room !== session) {
      roomRequest('/rooms/'+session.code+'/leave',{token:session.token},true).catch(()=>{});
      return;
    }
    if (player) {
      $('room-id').textContent = session.code.slice(0,3)+' '+session.code.slice(3);
      $('share-game').disabled = false;
      notice('Waiting for the remote phone…');
    } else {
      show('remote');
      notice('Getting game state…');
      remoteControls(null);
    }
    synchronize(session);
  } catch(error) {
    failRoom(session,error.message);
  }
}

function failRoom(session,message) {
  if (room !== session) return;
  cleanupRemote();
  if (session.player) {
    show('setup');
    $('pair-home-status').textContent = message;
  } else {
    lobby(false);
    $('join-id').value = session.code;
  }
  notice(message);
}

function gameSnapshot(session) {
  const playing = state.phase==='game', lobby = state.phase==='pairing';
  return {phase:state.phase,round:session.round,card:state.used.length,
    word:playing ? state.word.word : '',level:playing ? levelName(state.word.level) : '',
    timer:playing ? formatTime(state.paused ? state.remaining : Math.max(0,state.deadline-Date.now())) : '—',
    correct:lobby ? 0 : state.correct,passed:lobby ? 0 : state.passed,paused:state.paused};
}

function applyCommand(session, command) {
  if (command.round !== session.round) return;
  if (command.action==='start') return startPairedRound();
  if (state.phase!=='game' || command.card!==state.used.length || command.paused!==state.paused) return;
  if (command.action==='pause') return pause();
  if (['correct','pass'].includes(command.action)) transition(command.action,'remote');
}

function applySnapshot(session,data) {
  session.snapshot=data;
  $('remote-word').textContent = data.phase==='game' ? data.word : data.phase==='results' ? 'Round complete' : 'Ready to play';
  $('remote-level').textContent = data.level;
  $('remote-timer').textContent = data.timer;
  $('remote-score').textContent = 'Correct '+data.correct+' · Passed '+data.passed;
  notice(data.phase==='game' ? (data.paused?'Paused':'Connected to player') : 'Game ID '+session.code);
  remoteControls(data);
}

async function synchronize(session) {
  if (room!==session || !session.registered || session.busy) return;
  clearTimeout(session.timer);
  session.busy=true;
  session.again=false;
  const payload={token:session.token};
  if (session.player) Object.assign(payload,{snapshot:gameSnapshot(session),ack:session.ack});
  else if (session.pending) Object.assign(payload,session.pending);
  try {
    const data=await roomRequest('/rooms/'+session.code+(session.player?'/player':'/remote'),payload);
    if (room!==session) return;
    const wasConnected=state.remoteConnected;
    state.remoteConnected=data.connected;
    session.lastOK=Date.now();
    if (session.player) {
      $('pair-start').classList.toggle('hidden',!data.connected);
      notice(data.connected?'Remote connected. Either phone can start the round.':'Waiting for the remote phone…');
      if (wasConnected && !data.connected && state.phase==='game' && !state.paused) pause();
      if (data.command && data.id!==session.ack) {
        session.ack=data.id;
        applyCommand(session,data.command);
        session.again=true;
      }
    } else {
      if(session.pending && data.ack===session.pending.id) session.pending=null;
      if(data.snapshot && data.connected) applySnapshot(session,data.snapshot);
      if(!data.connected) { remoteControls(null);notice('Waiting for the player to reconnect…'); }
    }
  } catch(error) {
    if (room!==session) return;
    if ([403,404,409].includes(error.status)) return failRoom(session,error.message);
    if (Date.now()-session.lastOK>10000) {
      state.remoteConnected=false;
      if(session.player && state.phase==='game' && !state.paused) pause();
      if(!session.player) remoteControls(null);
      notice('Connection interrupted. Reconnecting…');
    }
  } finally {
    session.busy=false;
    if(room===session) session.timer=setTimeout(()=>synchronize(session),session.again?0:session.player||session.pending?400:650);
  }
}
function wakeRoom(session) {
  if (session.busy) session.again=true;
  else synchronize(session);
}
function startPairedRound() {
  if (!room?.player || !state.remoteConnected) return;
  if (!['pairing','results'].includes(state.phase)) return;
  room.round++;
  state.mode = $('timer-mode').value;
  state.duration = Number($('duration').value);
  state.control = 'remote';
  setWords();
  beginGame();
}

function broadcastState() {
  if(room?.player && room.registered) wakeRoom(room);
}

function remoteControls(data) {
  const playing = data?.phase === 'game';
  for (const action of ['correct','pass']) $('remote-'+action).disabled = !playing || data.paused || Boolean(room?.pending);
  $('remote-start').classList.toggle('hidden', !data || playing);
  $('remote-start').textContent = data?.phase === 'results' ? 'Play again' : 'Start round';
  $('remote-pause').classList.toggle('hidden', !playing);
  $('remote-pause').textContent = data?.paused ? 'Resume' : 'Pause';
}

function remoteCommand(action) {
  const snapshot = room?.snapshot;
  if (!snapshot || !state.remoteConnected || room.pending) return;
  room.pending={id:crypto.randomUUID(),command:{action,round:snapshot.round,card:snapshot.card,paused:snapshot.paused}};
  remoteControls(snapshot);
  wakeRoom(room);
}

$('create-game').onclick = () => { $('pair-home-status').textContent=''; createRoom(); };
$('join-game').onclick = () => joinForm();
$('join-panel').onsubmit = event => {
  event.preventDefault();
  const code = $('join-id').value.replace(/\s/g,'').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return notice('Enter a six-character game ID.');
  connectRoom(code,false);
};
$('pair-start').onclick = startPairedRound;
$('pair-exit').onclick = $('remote-exit').onclick = exit;
for (const action of ['correct','pass','start','pause']) $('remote-'+action).onclick = () => remoteCommand(action);
$('share-game').onclick = async () => {
  if (!room) return;
  const url = new URL(location.href);
  url.searchParams.set('host',room.code);
  try {
    if (navigator.share) await navigator.share({title:'Bible Henyo remote',url:url.href});
    else { await navigator.clipboard.writeText(url.href); notice('Game link copied. Open it on the remote phone.'); }
  } catch (err) {
    if (err.name !== 'AbortError') notice('On the remote phone, tap Join as remote and enter ' + room.code + '.');
  }
};
const invited = new URL(location.href).searchParams.get('host');
if (invited && /^[A-Z0-9]{6}$/i.test(invited)) joinForm(invited.toUpperCase());
