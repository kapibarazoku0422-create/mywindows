'use strict';
const $ = id => document.getElementById(id);
const login = $('login'), remote = $('remote'), badge = $('badge'), connectBtn = $('connect');
const video = $('screen'), wrap = $('screenWrap'), hint = $('hint'), keyboardInput = $('keyboardInput'), remoteCursor=$('remoteCursor');
let ws, pc, dc, online = false, connecting = false, connectTimer = null, lastMove = 0, touchGesture = null;
let inputMode=matchMedia('(pointer:coarse)').matches?'trackpad':'direct';
const activeTouches=new Map();
let cursorState=null,cursorSizeIndex=1;
const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

function syncViewport(){
  const viewport=window.visualViewport;
  document.documentElement.style.setProperty('--app-height',`${Math.floor(viewport?.height||window.innerHeight)}px`);
  if(cursorState)placeRemoteCursor(cursorState.x,cursorState.y);
}
syncViewport();
window.addEventListener('resize',syncViewport);
window.addEventListener('orientationchange',()=>setTimeout(syncViewport,150));
window.visualViewport?.addEventListener('resize',syncViewport);
window.visualViewport?.addEventListener('scroll',syncViewport);
document.addEventListener('fullscreenchange',syncViewport);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncViewport()});
document.addEventListener('selectstart',e=>{if(!remote.hidden)e.preventDefault()});
document.addEventListener('dragstart',e=>{if(!remote.hidden)e.preventDefault()});

async function api(url, options={}) { const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}); if(!r.ok) throw new Error((await r.json().catch(()=>({}))).error||'通信エラー'); return r.json(); }
async function openApp(){
  try { await api('/api/status'); login.hidden=true; remote.hidden=false; openSocket(); }
  catch { login.hidden=false; remote.hidden=true; }
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('password').value})});$('password').value='';openApp()}catch(err){$('loginError').textContent=err.message}});
function openSocket(){
  ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
  ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.type==='status'){online=m.online;badge.textContent=online?'PCオンライン':'PCオフライン';badge.classList.toggle('online',online);connectBtn.disabled=!online||connecting||pc?.connectionState==='connected';hint.hidden=online}else if(m.type==='answer'&&pc){await pc.setRemoteDescription(m.sdp)}else if(m.type==='ice'&&pc&&m.candidate){await pc.addIceCandidate(m.candidate).catch(()=>{})}else if(m.type==='disconnect'){disconnect()}};
  ws.onclose=()=>setTimeout(()=>{if(!remote.hidden)openSocket()},1500);
}
async function enterLandscape(){
  if(!document.fullscreenElement&&document.documentElement.requestFullscreen){
    try { await document.documentElement.requestFullscreen({navigationUI:'hide'}); }
    catch { try { await document.documentElement.requestFullscreen(); } catch {} }
  }
  try { await screen.orientation?.lock?.('landscape'); } catch {}
  syncViewport();
}
async function connect(){
  if(connecting||pc?.connectionState==='connected'||pc?.connectionState==='connecting')return;
  disconnect(false);
  connecting=true;connectBtn.disabled=true;connectBtn.textContent='接続中…';
  await enterLandscape();
  const iceConfig=await api('/api/ice').catch(()=>({iceServers}));
  pc=new RTCPeerConnection({iceServers:iceConfig.iceServers});
  pc.addTransceiver('video',{direction:'recvonly'});
  pc.ontrack=e=>{video.srcObject=e.streams[0];hint.hidden=true};
  pc.onicecandidate=e=>{if(e.candidate)sendSignal({type:'ice',candidate:e.candidate})};
  pc.onconnectionstatechange=()=>{
    const state=pc.connectionState;badge.textContent=state==='connected'?'操作中':`PC ${state}`;
    if(state==='connected'){clearTimeout(connectTimer);connecting=false;connectBtn.textContent='接続済み';connectBtn.disabled=true}
    if(['failed','closed','disconnected'].includes(state)){clearTimeout(connectTimer);connecting=false;connectBtn.textContent='再接続';connectBtn.disabled=!online;hint.hidden=false}
  };
  dc=pc.createDataChannel('control',{ordered:true});dc.onopen=()=>{hint.hidden=true};dc.onclose=()=>{hint.hidden=false};dc.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='cursor')placeRemoteCursor(m.x,m.y)}catch{}};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);sendSignal({type:'offer',sdp:pc.localDescription});
  connectTimer=setTimeout(()=>{if(pc&&pc.connectionState!=='connected'){pc.close();connecting=false;connectBtn.textContent='再接続';connectBtn.disabled=!online;badge.textContent='接続タイムアウト';hint.textContent='回線を確認して、もう一度「再接続」を押してください';hint.hidden=false}},15000);
}
function sendSignal(m){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m))}
function control(m){if(dc?.readyState==='open')dc.send(JSON.stringify(m))}
function disconnect(signal=true){clearTimeout(connectTimer);if(signal)sendSignal({type:'disconnect'});dc?.close();pc?.close();dc=null;pc=null;connecting=false;connectBtn.textContent='接続';connectBtn.disabled=!online;video.srcObject=null;remoteCursor.classList.remove('visible')}
connectBtn.onclick=()=>connect().catch(err=>{console.error(err);connecting=false;connectBtn.textContent='再接続';connectBtn.disabled=!online;badge.textContent='接続失敗'});
function point(e){const r=video.getBoundingClientRect(),vw=video.videoWidth||16,vh=video.videoHeight||9,videoRatio=vw/vh,boxRatio=r.width/r.height;let w,h,x0,y0;if(boxRatio>videoRatio){h=r.height;w=h*videoRatio;x0=r.left+(r.width-w)/2;y0=r.top}else{w=r.width;h=w/videoRatio;x0=r.left;y0=r.top+(r.height-h)/2}return{x:Math.max(0,Math.min(1,(e.clientX-x0)/w)),y:Math.max(0,Math.min(1,(e.clientY-y0)/h))}}
function placeRemoteCursor(x,y){
  cursorState={x,y};const r=video.getBoundingClientRect(),wr=wrap.getBoundingClientRect(),vw=video.videoWidth||16,vh=video.videoHeight||9,vr=vw/vh,br=r.width/r.height;
  let w,h,x0,y0;if(br>vr){h=r.height;w=h*vr;x0=r.left+(r.width-w)/2;y0=r.top}else{w=r.width;h=w/vr;x0=r.left;y0=r.top+(r.height-h)/2}
  remoteCursor.style.left=`${x0-wr.left+x*w}px`;remoteCursor.style.top=`${y0-wr.top+y*h}px`;remoteCursor.classList.add('visible');
}
wrap.addEventListener('contextmenu',e=>e.preventDefault());
function touchPointer(action,state,button=0){
  const message={type:'pointer',action,button};
  if(inputMode==='direct'&&state?.point)Object.assign(message,state.point);
  control(message);
}
function showModeHint(text){const el=$('modeHint');el.textContent=text;el.classList.add('show');clearTimeout(showModeHint.timer);showModeHint.timer=setTimeout(()=>el.classList.remove('show'),2600)}
function updateMode(){
  $('mode').textContent=inputMode==='trackpad'?'🖱 タッチパッド':'☝️ ダイレクト';
  showModeHint(inputMode==='trackpad'?'指でカーソル移動・タップでクリック・2本指でスクロール':'触れた場所を直接操作・長押しでドラッグ');
}
wrap.addEventListener('pointerdown',e=>{
  e.preventDefault();wrap.setPointerCapture(e.pointerId);
  if(e.pointerType==='touch'){
    activeTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(activeTouches.size===1){
      touchGesture={id:e.pointerId,startX:e.clientX,startY:e.clientY,prevX:e.clientX,prevY:e.clientY,moved:false,held:false,twoFinger:false,point:point(e)};
      touchGesture.timer=setTimeout(()=>{if(!touchGesture||touchGesture.id!==e.pointerId||touchGesture.moved||touchGesture.twoFinger)return;touchGesture.held=true;touchPointer('down',touchGesture);navigator.vibrate?.(12)},520);
    }else if(touchGesture){
      clearTimeout(touchGesture.timer);touchGesture.twoFinger=true;touchGesture.moved=true;
      if(touchGesture.held){touchPointer('up',touchGesture);touchGesture.held=false}
      touchGesture.scrollY=[...activeTouches.values()].reduce((sum,p)=>sum+p.y,0)/activeTouches.size;
    }
    return;
  }
  control({type:'pointer',action:'down',button:e.button,...point(e)});
});
wrap.addEventListener('pointermove',e=>{
  e.preventDefault();if(e.pointerType==='touch')activeTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(Date.now()-lastMove<16)return;lastMove=Date.now();const p=point(e);
  if(e.pointerType==='touch'&&touchGesture&&(activeTouches.size>=2||touchGesture.twoFinger)){
    const values=[...activeTouches.values()];const y=values.reduce((sum,v)=>sum+v.y,0)/values.length;
    if(Number.isFinite(touchGesture.scrollY))control({type:'wheel',dx:0,dy:(y-touchGesture.scrollY)*9});
    touchGesture.scrollY=y;return;
  }
  if(e.pointerType==='touch'&&touchGesture?.id===e.pointerId){
    touchGesture.point=p;
    const dx=e.clientX-touchGesture.prevX,dy=e.clientY-touchGesture.prevY;
    touchGesture.prevX=e.clientX;touchGesture.prevY=e.clientY;
    if(Math.hypot(e.clientX-touchGesture.startX,e.clientY-touchGesture.startY)>8){touchGesture.moved=true;if(!touchGesture.held)clearTimeout(touchGesture.timer)}
    if(inputMode==='trackpad')control({type:'pointer',action:'move-relative',dx:dx*1.65,dy:dy*1.65});
    else control({type:'pointer',action:'move',...p});
    return;
  }
  control({type:'pointer',action:'move',...p});
});
wrap.addEventListener('pointerup',e=>{
  e.preventDefault();
  if(e.pointerType==='touch'&&touchGesture?.id===e.pointerId){
    clearTimeout(touchGesture.timer);touchGesture.point=point(e);activeTouches.delete(e.pointerId);
    if(touchGesture.held)touchPointer('up',touchGesture);
    else if(!touchGesture.moved&&!touchGesture.twoFinger){touchPointer('down',touchGesture);setTimeout(()=>touchPointer('up',touchGesture),45);navigator.vibrate?.(8)}
    if(activeTouches.size===0)touchGesture=null;return;
  }
  if(e.pointerType==='touch'){activeTouches.delete(e.pointerId);if(activeTouches.size===0)touchGesture=null;return}
  control({type:'pointer',action:'up',button:e.button,...point(e)});
});
wrap.addEventListener('pointercancel',e=>{activeTouches.delete(e.pointerId);if(touchGesture?.id===e.pointerId){clearTimeout(touchGesture.timer);if(touchGesture.held)touchPointer('up',touchGesture);touchGesture=null}});
wrap.addEventListener('wheel',e=>{e.preventDefault();control({type:'wheel',dx:e.deltaX,dy:e.deltaY})},{passive:false});
document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>control({type:'key',action:'press',key:b.dataset.key}));
document.querySelectorAll('[data-combo]').forEach(b=>b.onclick=()=>control({type:'combo',keys:b.dataset.combo.split('-')}));
$('keyboard').onclick=()=>keyboardInput.focus();
$('mode').onclick=()=>{inputMode=inputMode==='trackpad'?'direct':'trackpad';updateMode()};
function toolbarClick(button){control({type:'pointer',action:'down',button});setTimeout(()=>control({type:'pointer',action:'up',button}),55);navigator.vibrate?.(8)}
$('leftClick').onclick=()=>toolbarClick(0);$('rightClick').onclick=()=>toolbarClick(2);updateMode();
const fitLevels=[100,94,90];let fitIndex=matchMedia('(pointer:coarse)').matches?1:0;
function applyFit(){const size=`${fitLevels[fitIndex]}%`;video.style.width=size;video.style.height=size;$('fit').textContent=`表示 ${fitLevels[fitIndex]}%`}
$('fit').onclick=()=>{fitIndex=(fitIndex+1)%fitLevels.length;applyFit()};applyFit();
const cursorSizes=[28,40,52];function applyCursorSize(){const size=cursorSizes[cursorSizeIndex];remoteCursor.style.setProperty('--cursor-size',`${size}px`);$('cursorSize').textContent=`カーソル ${['小','大','特大'][cursorSizeIndex]}`}
$('cursorSize').onclick=()=>{cursorSizeIndex=(cursorSizeIndex+1)%cursorSizes.length;applyCursorSize()};applyCursorSize();
keyboardInput.addEventListener('beforeinput',e=>{if(e.data)control({type:'text',text:e.data});if(e.inputType==='deleteContentBackward')control({type:'key',action:'press',key:'Backspace'});keyboardInput.value=''});
document.addEventListener('keydown',e=>{if(remote.hidden)return;if(!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();control({type:'key',action:'down',key:e.key,code:e.code})}});
document.addEventListener('keyup',e=>{if(remote.hidden)return;if(!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();control({type:'key',action:'up',key:e.key,code:e.code})}});
$('fullscreen').onclick=enterLandscape;
$('logout').onclick=async()=>{disconnect();await api('/api/logout',{method:'POST'});remote.hidden=true;login.hidden=false;ws?.close()};
window.addEventListener('pagehide',()=>sendSignal({type:'disconnect'}));
openApp();
