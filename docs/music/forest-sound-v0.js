const forestSound = (() => {
  const key = "sansu-mori-sound-v1";
  const clampVolume = (n, fallback) => Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch (_) {}
  const prefs = {
    bgm: saved.bgm === true, se: saved.se === true,
    bgmVolume: clampVolume(saved.bgmVolume, 18), seVolume: clampVolume(saved.seVolume, 32),
  };
  let engine = null, timer = null, cursor = 0, nextTime = 0, lastSE = -Infinity;
  const revisions = { bgm: 0, se: 0 };
  const requested = { bgm: prefs.bgm, se: prefs.se };
  const active = { bgm: new Set(), se: new Set() };
  const melody = [
    [76,0,79,0,81,0,79,0,76,0,74,0,72,0,0,0],
    [72,0,76,0,79,0,76,0,74,0,0,0,72,0,0,0],
    [77,0,81,0,84,0,81,0,79,0,77,0,76,0,0,0],
    [74,0,79,0,83,0,81,0,79,0,0,0,74,0,0,0],
    [76,0,81,0,84,0,81,0,79,0,76,0,74,0,0,0],
    [77,0,81,0,79,0,77,0,76,0,74,0,72,0,0,0],
    [74,0,77,0,81,0,79,0,77,0,74,0,71,0,0,0],
    [74,0,79,0,76,0,74,0,72,0,0,0,0,0,0,0],
  ];
  const roots = [48,48,41,43,45,41,50,43];
  const chords = [[60,64,67],[60,64,67],[53,57,60],[55,59,62],[57,60,64],[53,57,60],[62,65,69],[55,59,62]];
  const stepTime = 60 / 104 / 4;
  const recordings = [
    { id: 'marimba-c2', instrument: 'marimba', root: 48 },
    { id: 'marimba-c4', instrument: 'marimba', root: 72 },
    { id: 'marimba-g4', instrument: 'marimba', root: 79 },
    { id: 'glock-c5', instrument: 'glock', root: 84 },
    { id: 'glock-c6', instrument: 'glock', root: 96 },
  ];
  let lastWhistle = -Infinity;
  const status = text => { document.getElementById("sound-status").textContent = text; };
  function save() { try { localStorage.setItem(key, JSON.stringify(prefs)); } catch (_) {} }
  function paint() {
    for (const kind of ["bgm", "se"]) {
      const button = document.getElementById("sound-" + kind);
      button.textContent = (kind === "bgm" ? "BGM" : "効果音") + (prefs[kind] ? " ON" : " OFF");
      button.setAttribute("aria-pressed", String(prefs[kind]));
      document.getElementById("volume-" + kind).value = prefs[kind + "Volume"];
      document.getElementById("value-" + kind).textContent = prefs[kind + "Volume"] + "%";
    }
  }
  function audio() {
    if (engine && engine.context.state !== "closed") return engine;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw Error("このブラウザでは 音を使えません。");
    const context = new Audio(), bgm = context.createGain(), se = context.createGain();
    const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 6000;
    bgm.connect(filter); filter.connect(context.destination); se.connect(context.destination);
    engine = { context, bgm, se, samples: new Map(), loads: new Map(), bgmPrepared: false };
    volume();
    context.onstatechange = () => {
      if (context.state !== "running") stopMusic();
      else if (!document.hidden && prefs.bgm) startMusic();
    };
    return engine;
  }
  function volume() {
    if (!engine) return;
    for (const kind of ["bgm", "se"]) engine[kind].gain.setTargetAtTime(prefs[kind + "Volume"] / 100 * .55, engine.context.currentTime, .025);
  }
  async function unlock() {
    const e = audio();
    if (e.context.state !== "running") await e.context.resume();
    if (e.context.state !== "running") throw Error("もう一度 音のボタンを おしてね。");
    return e;
  }
  async function loadRecordings(kind) {
    const e = engine;
    const needed = recordings.filter(item => kind === 'bgm' ? item.instrument !== 'whistle' : item.id === 'glock-c5' || item.instrument === 'whistle');
    const results = await Promise.allSettled(needed.map(item => {
      if (e.samples.has(item.id)) return Promise.resolve();
      if (!e.loads.has(item.id)) {
        const pending = (async () => {
          const response = await fetch('https://sunny-lotus.github.io/manabi-portal/common/audio/' + item.id + '.wav');
          if (!response.ok) throw Error('音源を読み込めませんでした');
          const buffer = await e.context.decodeAudioData(await response.arrayBuffer());
          if (!Number.isFinite(buffer.duration) || buffer.duration < .02) throw Error('音源が短すぎます');
          e.samples.set(item.id, { ...item, buffer });
        })().catch(error => { e.loads.delete(item.id); throw error; });
        e.loads.set(item.id, pending);
      }
      return e.loads.get(item.id);
    }));
    if (kind === 'bgm') e.bgmPrepared = true;
    return results.every(result => result.status === 'fulfilled');
  }
  function recordedNote(instrument, midi, start, duration, level, kind, part = '') {
    const e = engine, pool = [...e.samples.values()].filter(item => item.instrument === instrument);
    if (!pool.length) return false;
    const item = pool.reduce((best, candidate) => Math.abs(candidate.root - midi) < Math.abs(best.root - midi) ? candidate : best);
    const source = e.context.createBufferSource(), gain = e.context.createGain();
    const rate = instrument === 'whistle' ? 1 : 2 ** ((midi - item.root) / 12);
    source.buffer = item.buffer; source.playbackRate.value = rate;
    const length = Math.min(item.buffer.duration / rate - .003, instrument === 'whistle' ? 2 : Math.max(.25, duration + .22));
    if (length < .02) return false;
    const release = Math.min(.16, length / 3), strength = instrument === 'whistle' ? .26 : level * (part === 'bass' || midi < 60 ? 1.6 : 3.2);
    gain.gain.setValueAtTime(.0001, start); gain.gain.linearRampToValueAtTime(strength, start + .003);
    gain.gain.setValueAtTime(strength, start + length - release); gain.gain.exponentialRampToValueAtTime(.0001, start + length);
    source.connect(gain); gain.connect(e[kind]); active[kind].add(source);
    source.onended = () => { active[kind].delete(source); source.disconnect(); gain.disconnect(); };
    source.start(start); source.stop(start + length + .002); return true;
  }
  function note(midi, start, duration, level, type, kind, part = '') {
    const e = engine;
    if (!e || e.context.state !== "running" || document.hidden) return;
    const instrument = part === 'bass' ? 'marimba' : kind === 'se' ? 'glock' : type === 'square' || (midi < 60 && type === 'triangle') ? 'marimba' : type === 'triangle' && midi < 90 ? 'glock' : null;
    if (instrument && recordedNote(instrument, midi, start, duration, level, kind, part)) return;
    const oscillator = e.context.createOscillator(), gain = e.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(e[kind]); active[kind].add(oscillator);
    oscillator.onended = () => { active[kind].delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + .015);
  }
  function stopVoices(kind) {
    for (const source of active[kind]) { try { source.stop(); } catch (_) {} }
    active[kind].clear();
  }
  function schedule() {
    if (!engine || engine.context.state !== "running" || document.hidden || !prefs.bgm) { stopMusic(); return; }
    const now = engine.context.currentTime;
    if (nextTime < now - .1) nextTime = now + .03;
    while (nextTime < now + .22) {
      const bar = Math.floor(cursor / 16) % 8, step = cursor % 16, secondPass = cursor >= 128;
      const pitch = melody[bar][step];
      if (pitch) note(pitch, nextTime, stepTime * 1.8, .055, 'square', 'bgm');
      if (step === 0 || step === 8) note(roots[bar], nextTime, .36, .045, 'triangle', 'bgm', 'bass');
      if (step === 4 || step === 12) note(chords[bar][step === 4 ? 1 : 2] + 12, nextTime, .16, .018, 'triangle', 'bgm');
      nextTime += stepTime; cursor = (cursor + 1) % 256;
    }
  }
  function startMusic() {
    if (timer !== null || !prefs.bgm || !engine || !engine.bgmPrepared || engine.context.state !== "running" || document.hidden) return;
    cursor = 0; nextTime = engine.context.currentTime + .04;
    timer = window.setInterval(schedule, 80); schedule();
  }
  function stopMusic() {
    if (timer !== null) window.clearInterval(timer);
    timer = null; stopVoices("bgm");
  }
  function effect(kind = "move") {
    if (!prefs.se || !engine || engine.context.state !== "running" || document.hidden || (performance.now() - lastSE < 55 && kind !== "clear")) return;
    lastSE = performance.now();
    if (kind === 'clear') stopVoices('se');
    const notes = { move:[76], lion:[76,79], correct:[76,79,84], retry:[74,72], material:[79,84], build:[72,76,79,84], place:[79,76], back:[76,72], confirm:[79,84], clear:[72,76,79,84,88] }[kind] || [76];
    notes.forEach((pitch, i) => note(pitch, engine.context.currentTime + .01 + i * (kind === 'clear' ? .11 : .075), .15, kind === 'retry' ? .055 : .085, 'sine', 'se'));
  }

  async function enable(kind, wanted) {
    requested[kind] = wanted;
    const revision = ++revisions[kind];
    if (!wanted) {
      prefs[kind] = false; save(); paint();
      if (kind === "bgm") stopMusic(); else stopVoices("se");
      status((kind === "bgm" ? "BGM" : "効果音") + "を OFFにしたよ。"); return;
    }
    try {
      await unlock();
      const complete = await loadRecordings(kind);
      if (revision !== revisions[kind]) return;
      prefs[kind] = true; save(); paint();
      if (kind === "bgm") startMusic(); else effect("confirm");
      status(complete ? (kind === "bgm" ? "BGM" : "効果音") + "を ONにしたよ。" : "読み込めなかった音は 電子音で鳴らしているよ。");
    } catch (error) {
      if (revision !== revisions[kind]) return;
      prefs[kind] = false; save(); paint(); status(error.message || "音を ひらけませんでした。");
      requested[kind] = false;
    }
  }
  let waking = null;
  function wake() {
    if (document.hidden || (!prefs.bgm && !prefs.se) || waking) return;
    waking = unlock().then(async () => { await Promise.all([prefs.bgm ? loadRecordings('bgm') : null, prefs.se ? loadRecordings('se') : null]); startMusic(); }).catch(() => { status("音のボタンを おすと 再開できるよ。"); }).finally(() => { waking = null; });
  }
  for (const kind of ["bgm", "se"]) {
    document.getElementById("sound-" + kind).addEventListener("click", () => enable(kind, !requested[kind]));
    document.getElementById("volume-" + kind).addEventListener("input", event => {
      prefs[kind + "Volume"] = clampVolume(Number(event.target.value), 25); volume(); save(); paint();
    });
  }
  document.addEventListener('pointerdown', event => { if (event.isPrimary !== false && !(event.button > 0)) wake(); }, {passive:true});
  document.addEventListener('keydown', event => { if (!event.repeat) wake(); });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.target.closest('.sound-bar')) return;
    const target = event.target.closest('button'); if (!target || target.disabled) return;
    if (target.matches('.camp-lion')) effect('lion');
    else if (target.matches('.back')) effect('back');
    else if (target.matches('.spot,.camps button')) effect('move');
  });
  function pause() {
    stopMusic(); stopVoices("se");
    if (engine && engine.context.state === "running") engine.context.suspend().catch(() => {});
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); else wake(); });
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", () => { if (engine) wake(); });
  paint();
  if (prefs.bgm || prefs.se) status("画面を タップすると 音がはじまるよ。");
  return { enable, effect };
})();

// Sound hooks observe successful actions without changing scores or rewards.
const beforeSoundRender = render; let lastSoundAnswer = null;
render = function () {
  const answer = view === 'camp' && solved ? ci + ':' + qi : null;
  if (answer !== null && answer !== lastSoundAnswer) forestSound.effect('correct');
  lastSoundAnswer = answer; return beforeSoundRender();
};
const beforeSoundWrong = wrong;
wrong = function (...args) { forestSound.effect('retry'); return beforeSoundWrong(...args); };
const beforeSoundGain = gain;
gain = function (...args) { const result = beforeSoundGain(...args); forestSound.effect('material'); return result; };
const beforeSoundBuild = build;
build = function (key) { const level = lvOf(key), result = beforeSoundBuild(key); if (lvOf(key) > level) forestSound.effect('build'); return result; };
