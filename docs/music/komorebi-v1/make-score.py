"""Create the reproducible score for Komorebi no Komichi, version 1."""
import json, pathlib
out=pathlib.Path(__file__).parent
bars=[('G',43,[55,59,62]),('Em',40,[55,59,64]),('Cmaj7',48,[55,59,64]),('Dadd9',50,[57,62,64]),
      ('G',43,[55,59,62]),('Cmaj7',48,[55,59,64]),('Am7',45,[55,60,64]),('Dadd9',50,[57,62,64]),
      ('Em7',40,[55,59,62]),('Bm7',47,[57,62,66]),('Cmaj7',48,[55,59,64]),('G',43,[55,59,62]),
      ('Am7',45,[55,60,64]),('Dadd9',50,[57,62,64]),('D7',50,[57,60,66]),('Gadd9',43,[55,59,62])]
# (eighth-note position, MIDI pitch, length in eighth notes); rests are intentional.
melody=[[(0,67,2.4),(3,71,2)],[(0,74,2.5),(4,71,1.5)],[(0,69,3.5)],[(1,67,2),(4,69,1.5)],
        [(0,71,2.5),(3,74,2)],[(0,76,3)],[(1,74,2),(4,72,1.5)],[(0,69,3.5)],
        [(0,64,2.5),(3,67,2)],[(1,69,2),(4,71,1.5)],[(0,72,3.5)],[(1,71,2),(4,67,1.5)],
        [(0,69,2.5),(3,72,2)],[(0,71,2.5),(3,69,2)],[(1,66,3.5)],[(0,67,3.5)]]
events=[]
def note(instrument,midi,bar,step,length,gain,pan=0):
 events.append(dict(instrument=instrument,midi=midi,eighth=bar*6+step,length=length,gain=gain,pan=pan))
for bar,((chord,root,tones),phrase) in enumerate(zip(bars,melody)):
 for step,pitch,length in phrase:note('flute',pitch,bar,step,length,.23 if bar<8 else .21,-.04)
 # Wood-like accompaniment has a lighter second beat; no drum accent.
 for step,pitch,gain in [(0,tones[0],.10),(2,tones[1],.075),(4,tones[2],.065)]:
  note('marimba',pitch,bar,step,.9,gain,-.18 if step==2 else .12)
 note('cello',root,bar,0,2,.12,0)
 if bar in [3,7,11,15]:note('bells',[74,76,74,71][bar//4],bar,4,1,.022,.22)
score=dict(version=1,title='こもれびの小道',meter='6/8',dottedQuarterBpm=60,eighthSeconds=1/3,bars=16,loopSeconds=32,key='G major',chords=[b[0] for b in bars],events=events)
(out/'score.json').write_text(json.dumps(score,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Score written: {len(events)} notes, 16 bars, 32 seconds.')
