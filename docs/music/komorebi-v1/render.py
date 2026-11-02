"""Render the score using recorded CC0 instruments, retaining loop tails."""
import json,pathlib,sys,wave,subprocess,hashlib,urllib.request
import numpy as np
folder=pathlib.Path(__file__).resolve().parent
root=folder.parents[2]
sys.path.insert(0,str(root/'audio-research/python-tools'))
import imageio_ffmpeg
sr=22050
def read(path):
 with wave.open(str(path)) as w:
  b=w.readframes(w.getnframes());bits=w.getsampwidth();channels=w.getnchannels();rate=w.getframerate()
 if bits==2:x=np.frombuffer(b,dtype='<i2').astype(float)/32768
 elif bits==3:
  p=np.frombuffer(b,dtype=np.uint8).reshape(-1,3).astype(np.int32);v=p[:,0]+(p[:,1]<<8)+(p[:,2]<<16);x=((v^(1<<23))-(1<<23))/8388608
 else:raise ValueError('Unsupported PCM')
 return x.reshape(-1,channels).mean(axis=1),rate
manifest=json.loads((folder/'sources.json').read_text(encoding='utf-8'))
cache=folder/'sources-cache';cache.mkdir(exist_ok=True)
def source(name):
 item=next(x for x in manifest if x['id']==name);path=cache/(name+'.wav')
 if not path.exists():urllib.request.urlretrieve(item['url'],path)
 if hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Source hash mismatch: '+name)
 return path
raw=source('flute')
flute,rate=read(raw);first=np.flatnonzero(abs(flute)>abs(flute).max()*.01)[0];first=max(0,first-int(rate*.025));flute=flute[first:first+rate*4];flute*=.68/max(abs(flute))
samples={'flute':(flute,rate,72)}
for name,pitch in [('marimba',72),('cello',50),('bells',84)]:
 samples[name]=(*read(source(name)),pitch)
score=json.loads((folder/'score.json').read_text(encoding='utf-8'));period=score['loopSeconds'];unit=score['eighthSeconds'];n=round(period*sr)
mix=np.zeros((n*3+sr*4,2))
for cycle in range(3):
 for e in score['events']:
  x,rate,pitch=samples[e['instrument']];speed=2**((e['midi']-pitch)/12)
  release=.22 if e['instrument']=='flute' else .3
  hold=e['length']*unit;duration=min(len(x)/rate/speed-.003,hold+release)
  count=round(duration*sr);time=np.arange(count)/sr
  y=np.interp(time*rate*speed,np.arange(len(x)),x)
  attack=.07 if e['instrument']=='flute' else .008
  env=np.minimum(1,time/attack)*np.minimum(1,(duration-time)/release);y*=np.clip(env,0,1)*e['gain']
  stereo=np.array([np.sqrt((1-e['pan'])/2),np.sqrt((1+e['pan'])/2)])
  at=round((cycle*period+e['eighth']*unit)*sr);mix[at:at+count]+=y[:,None]*stereo
# Short, subdued room reflections; deliberately no conspicuous echo.
dry=mix.copy()
for delay,level in [(.071,.10),(.149,.065),(.263,.035)]:
 d=round(delay*sr);mix[d:]+=dry[:-d,::-1]*level
mix=mix[n:2*n];rms=np.sqrt(np.mean(mix**2));mix*=min(.055/max(rms,1e-9),.48/max(abs(mix).max(),1e-9))
path=folder/'komorebi-v1.wav'
with wave.open(str(path),'wb') as w:
 w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((np.clip(mix,-.99,.99)*32767).astype('<i2').tobytes())
mp3=folder/'forest-komorebi-v1.mp3';ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(path),'-codec:a','libmp3lame','-b:a','96k',str(mp3)],check=True)
# Validate the delivered compressed file after decoding, rather than only its WAV master.
decoded=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i',str(mp3),'-f','f32le','-acodec','pcm_f32le','-'],check=True,stdout=subprocess.PIPE).stdout
pcm=np.frombuffer(decoded,dtype='<f4').reshape(-1,2)
metrics=dict(seconds=len(pcm)/sr,sampleRate=sr,channels=2,bytes=mp3.stat().st_size,notes=len(score['events']),peak=float(abs(pcm).max()),rms=float(np.sqrt(np.mean(pcm**2))),loopBoundaryJump=float(abs(pcm[-1]-pcm[0]).max()),sha256=hashlib.sha256(mp3.read_bytes()).hexdigest(),sourceSha256=hashlib.sha256(raw.read_bytes()).hexdigest())
assert abs(metrics['seconds']-32)<.01 and metrics['peak']<.5 and metrics['bytes']<500000
assert metrics['loopBoundaryJump']<.02
quarter=[float(np.sqrt(np.mean(pcm[i:i+sr//4]**2))) for i in range(0,len(pcm),sr//4)]
metrics['quietestQuarterSecondRms']=min(quarter);metrics['loudestQuarterSecondRms']=max(quarter)
(folder/'verification.json').write_text(json.dumps(metrics,indent=2)+'\n',encoding='utf-8');print(json.dumps(metrics))
