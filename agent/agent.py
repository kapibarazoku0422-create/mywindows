import argparse, asyncio, json, os, time
import av, mss, numpy as np, websockets
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, VideoStreamTrack
from aiortc.sdp import candidate_from_sdp
from pynput.keyboard import Controller as Keyboard, Key
from pynput.mouse import Controller as Mouse, Button

keyboard, mouse = Keyboard(), Mouse()
KEYS = {'Escape':Key.esc,'Tab':Key.tab,'Enter':Key.enter,'Backspace':Key.backspace,'Delete':Key.delete,'ArrowUp':Key.up,'ArrowDown':Key.down,'ArrowLeft':Key.left,'ArrowRight':Key.right,'Control':Key.ctrl,'Alt':Key.alt,'Meta':Key.cmd,'Shift':Key.shift,'ctrl':Key.ctrl,'alt':Key.alt,'delete':Key.delete}
BUTTONS = {0:Button.left,1:Button.middle,2:Button.right}

class ScreenTrack(VideoStreamTrack):
    def __init__(self, fps=30): super().__init__(); self.sct=mss.mss(); self.monitor=self.sct.monitors[1]; self.fps=fps; self.last=0
    async def recv(self):
        pts,time_base=await self.next_timestamp(); delay=max(0,1/self.fps-(time.monotonic()-self.last)); await asyncio.sleep(delay); self.last=time.monotonic()
        img=np.asarray(self.sct.grab(self.monitor)); frame=av.VideoFrame.from_ndarray(img,format='bgra'); frame.pts=pts;frame.time_base=time_base;return frame

def handle_control(raw, monitor):
    try: m=json.loads(raw)
    except Exception:return
    t=m.get('type')
    if t=='pointer':
        action=m.get('action')
        if action=='move-relative': mouse.move(int(m.get('dx',0)),int(m.get('dy',0)))
        elif 'x' in m and 'y' in m: mouse.position=(monitor['left']+int(m['x']*monitor['width']),monitor['top']+int(m['y']*monitor['height']))
        if action=='down':mouse.press(BUTTONS.get(m.get('button'),Button.left))
        elif action=='up':mouse.release(BUTTONS.get(m.get('button'),Button.left))
    elif t=='wheel':
        dx,dy=float(m.get('dx',0)),float(m.get('dy',0))
        sx,sy=-int(dx/60),-int(dy/60)
        if dx and not sx:sx=-1 if dx>0 else 1
        if dy and not sy:sy=-1 if dy>0 else 1
        mouse.scroll(sx,sy)
    elif t=='text': keyboard.type(m.get('text',''))
    elif t=='key':
        key=KEYS.get(m.get('key'),m.get('key',''))
        try:
            if m.get('action')=='down':keyboard.press(key)
            elif m.get('action')=='up':keyboard.release(key)
            else:keyboard.press(key);keyboard.release(key)
        except (ValueError,TypeError):pass
    elif t=='combo':
        keys=[KEYS.get(k,k) for k in m.get('keys',[])];
        try:
            for k in keys:keyboard.press(k)
            for k in reversed(keys):keyboard.release(k)
        except (ValueError,TypeError):pass

async def run(cfg):
    pc=None
    async with websockets.connect(cfg['server'].rstrip('/')+'/ws',max_size=2**20,ping_interval=20) as ws:
        await ws.send(json.dumps({'type':'agent-auth','deviceId':cfg['deviceId'],'secret':cfg['secret']}))
        async for raw in ws:
            m=json.loads(raw)
            if m['type']=='offer':
                if pc: await pc.close()
                pc=RTCPeerConnection(); track=ScreenTrack(cfg.get('fps',30)); pc.addTrack(track)
                @pc.on('datachannel')
                def on_dc(channel): channel.on('message',lambda data:handle_control(data,track.monitor))
                @pc.on('icecandidate')
                async def on_ice(c):
                    if c: await ws.send(json.dumps({'type':'ice','candidate':{'candidate':'candidate:'+c.to_sdp(),'sdpMid':c.sdpMid,'sdpMLineIndex':c.sdpMLineIndex}}))
                await pc.setRemoteDescription(RTCSessionDescription(sdp=m['sdp']['sdp'],type=m['sdp']['type']))
                answer=await pc.createAnswer();await pc.setLocalDescription(answer)
                await ws.send(json.dumps({'type':'answer','sdp':{'sdp':pc.localDescription.sdp,'type':pc.localDescription.type}}))
            elif m['type']=='ice' and pc and m.get('candidate'):
                c=m['candidate']; cand=candidate_from_sdp(c['candidate'].removeprefix('candidate:'));cand.sdpMid=c.get('sdpMid');cand.sdpMLineIndex=c.get('sdpMLineIndex');await pc.addIceCandidate(cand)
            elif m['type']=='disconnect' and pc: await pc.close();pc=None

async def main():
    p=argparse.ArgumentParser();p.add_argument('--config',default='config.json');args=p.parse_args()
    with open(args.config,encoding='utf-8') as f:cfg=json.load(f)
    while True:
        try: await run(cfg)
        except Exception as e: print(f'接続エラー: {e}; 5秒後に再試行');await asyncio.sleep(5)
if __name__=='__main__':asyncio.run(main())
