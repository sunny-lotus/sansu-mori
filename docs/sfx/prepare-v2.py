"""Create a compact, attributed Kenney SFX set for Sansu no Mori."""
import pathlib,zipfile,subprocess,sys,json,hashlib,wave
import numpy as np
folder=pathlib.Path(__file__).resolve().parent;root=folder.parents[1]
sys.path.insert(0,str(root/'audio-research/python-tools'))
import imageio_ffmpeg
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();sr=22050
out=folder.parent/'common/audio';out.mkdir(parents=True,exist_ok=True)
choices=[('back','rpg','bookFlip1',.085,'紙をめくる音で、戻る動きを柔らかく表す'),
 ('lion','impact','impactWood_light_001',.09,'触れた手応えを小さな木の音で表す'),
 ('stage','interface','confirmation_001',.12,'通常操作と区別できる、短いステージ決定音')]
manifest=[];preview=np.zeros(sr*6)
for index,(kind,pack,name,target,reason) in enumerate(choices):
 archive=folder/'raw'/(pack+'.zip')
 with zipfile.ZipFile(archive) as z:
  raw=z.read('Audio/'+name+'.ogg')
  (folder/('LICENSE-'+pack+'.txt')).write_bytes(z.read('License.txt'))
 result=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i','pipe:0','-ar',str(sr),'-ac','1','-f','f32le','-'],input=raw,stdout=subprocess.PIPE,check=True)
 x=np.frombuffer(result.stdout,dtype='<f4').astype(float);peak=max(abs(x))
 active=np.flatnonzero(abs(x)>peak*.005);x=x[max(0,active[0]-int(.006*sr)):min(len(x),active[-1]+int(.035*sr))]
 x=x[:sr*2]
 # Use small fades and match useful average loudness without flattening the transient.
 n=len(x);x*=np.minimum(1,np.arange(n)/(sr*.003))*np.minimum(1,(n-1-np.arange(n))/(sr*.025))
 x*=min(target/max(np.sqrt(np.mean(x*x)),1e-8),.55/max(abs(x)))
 if kind=='build':
  y=np.zeros(len(x)+int(.2*sr))
  for delay,gain in [(0,1),(.09,.65),(.20,.4)]:
   at=round(delay*sr);y[at:at+len(x)]+=x*gain
  x=y
 if max(abs(x))>.60:x*=.60/max(abs(x))
 file=out/('forest-se-'+kind+'-v2.wav')
 with wave.open(str(file),'wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes((np.clip(x,-.99,.99)*32767).astype('<i2').tobytes())
 at=round((index*1.65+.2)*sr);preview[at:at+len(x)]+=x*.8
 item=dict(kind=kind,file='common/audio/'+file.name,pack=pack,source='Audio/'+name+'.ogg',sourcePage='https://kenney.nl/assets/'+{'interface':'interface-sounds','impact':'impact-sounds','rpg':'rpg-audio'}[pack],license='CC0-1.0',author='Kenney',reason=reason,seconds=len(x)/sr,bytes=file.stat().st_size,peak=float(max(abs(x))),rms=float(np.sqrt(np.mean(x*x))),sourceSha256=hashlib.sha256(raw).hexdigest(),sha256=hashlib.sha256(file.read_bytes()).hexdigest())
 assert item['seconds']<=2.2 and item['peak']<=.601
 manifest.append(item)
(folder/'manifest-v2.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with wave.open(str(folder/'preview-v2.wav'),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes((preview*32767).astype('<i2').tobytes())
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(folder/'preview-v2.wav'),'-codec:a','libmp3lame','-b:a','80k',str(folder/'forest-se-preview-v2.mp3')],check=True)
print(json.dumps([dict(kind=x['kind'],seconds=round(x['seconds'],3),bytes=x['bytes']) for x in manifest]));print('Total bytes',sum(x['bytes'] for x in manifest))
