'use strict';
const $ = id => document.getElementById(id);
const login = $('login'), remote = $('remote'), badge = $('badge'), connectBtn = $('connect');
const video = $('screen'), wrap = $('screenWrap'), hint = $('hint'), keyboardInput = $('keyboardInput');
let ws, pc, dc, online = false, lastMove = 0;
const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

async function api(url, options={}) { const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}); if(!r.ok) throw new Error((await r.json().catch(()=>({}))).error||'通信エラー'); return r.json(); }
async function openApp(){
  try { await api('/api/status'); login.hidden=true; remote.hidden=false; openSocket(); }
  catch { login.hidden=false; remote.hidden=true; }
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('password').value})});$('password').value='';openApp()}catch(err){$('loginError').textContent=err.message}});
function openSocket(){
  ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
  ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.type==='status'){online=m.online;badge.textContent=online?'PCオンライン':'PCオフライン';badge.classList.toggle('online',online);connectBtn.disabled=!online;hint.hidden=online}else if(m.type==='answer'&&pc){await pc.setRemoteDescription(m.sdp)}else if(m.type==='ice'&&pc&&m.candidate){await pc.addIceCandidate(m.candidate).catch(()=>{})}else if(m.type==='disconnect'){disconnect()}};
  ws.onclose=()=>setTimeout(()=>{if(!remote.hidden)openSocket()},1500);
}
async function enterLandscape(){
  try { if(!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}
}
async function connect(){
  await enterLandscape();
  disconnect(false); pc=new RTCPeerConnection({iceServers});
  pc.addTransceiver('video',{direction:'recvonly'});
  pc.ontrack=e=>{video.srcObject=e.streams[0];hint.hidden=true};
  pc.onicecandidate=e=>{if(e.candidate)sendSignal({type:'ice',candidate:e.candidate})};
  pc.onconnectionstatechange=()=>{badge.textContent=pc.connectionState==='connected'?'操作中':`PC ${pc.connectionState}`;if(['failed','closed','disconnected'].includes(pc.connectionState))hint.hidden=false};
  dc=pc.createDataChannel('control',{ordered:true});dc.onopen=()=>{hint.hidden=true};dc.onclose=()=>{hint.hidden=false};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);sendSignal({type:'offer',sdp:pc.localDescription});
}
function sendSignal(m){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m))}
function control(m){if(dc?.readyState==='open')dc.send(JSON.stringify(m))}
function disconnect(signal=true){if(signal)sendSignal({type:'disconnect'});dc?.close();pc?.close();dc=null;pc=null;video.srcObject=null}
connectBtn.onclick=connect;
function point(e){const r=video.getBoundingClientRect(),vw=video.videoWidth||16,vh=video.videoHeight||9,videoRatio=vw/vh,boxRatio=r.width/r.height;let w,h,x0,y0;if(boxRatio>videoRatio){h=r.height;w=h*videoRatio;x0=r.left+(r.width-w)/2;y0=r.top}else{w=r.width;h=w/videoRatio;x0=r.left;y0=r.top+(r.height-h)/2}return{x:Math.max(0,Math.min(1,(e.clientX-x0)/w)),y:Math.max(0,Math.min(1,(e.clientY-y0)/h))}}
wrap.addEventListener('pointerdown',e=>{wrap.setPointerCapture(e.pointerId);control({type:'pointer',action:'down',button:e.button,...point(e)})});
wrap.addEventListener('pointermove',e=>{if(Date.now()-lastMove<16)return;lastMove=Date.now();control({type:'pointer',action:'move',...point(e)})});
wrap.addEventListener('pointerup',e=>control({type:'pointer',action:'up',button:e.button,...point(e)}));
wrap.addEventListener('wheel',e=>{e.preventDefault();control({type:'wheel',dx:e.deltaX,dy:e.deltaY})},{passive:false});
document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>control({type:'key',action:'press',key:b.dataset.key}));
document.querySelectorAll('[data-combo]').forEach(b=>b.onclick=()=>control({type:'combo',keys:b.dataset.combo.split('-')}));
$('keyboard').onclick=()=>keyboardInput.focus();
keyboardInput.addEventListener('beforeinput',e=>{if(e.data)control({type:'text',text:e.data});if(e.inputType==='deleteContentBackward')control({type:'key',action:'press',key:'Backspace'});keyboardInput.value=''});
document.addEventListener('keydown',e=>{if(remote.hidden)return;if(!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();control({type:'key',action:'down',key:e.key,code:e.code})}});
document.addEventListener('keyup',e=>{if(remote.hidden)return;if(!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();control({type:'key',action:'up',key:e.key,code:e.code})}});
$('fullscreen').onclick=enterLandscape;
$('logout').onclick=async()=>{disconnect();await api('/api/logout',{method:'POST'});remote.hidden=true;login.hidden=false;ws?.close()};
openApp();
