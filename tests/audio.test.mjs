import test from 'node:test';
import assert from 'node:assert/strict';
import { gameAudio, musicGroupFor, parseSoundPreferences, sceneMusicLevel } from '../src/audio.ts';

test('sound preferences migrate existing volumes and reject malformed values', () => {
  assert.deepEqual(parseSoundPreferences('{"music":25,"effects":0}'), { music: 25, effects: 0, muted: false, theme: 'ragtime' });
  assert.deepEqual(parseSoundPreferences('{"music":101,"effects":"80","muted":true,"theme":"holiday"}'), { music: 60, effects: 80, muted: true, theme: 'holiday' });
  for (const input of [null, 'bad', 'null', '42']) assert.deepEqual(parseSoundPreferences(input), { music: 60, effects: 80, muted: false, theme: 'ragtime' });
  assert.equal(parseSoundPreferences('{"music":24.6}').music, 25);
});

test('only two music groups cover every screen', () => {
  for (const scene of ['landing', 'waiting']) assert.equal(musicGroupFor(scene), 'lobby');
  for (const scene of ['drawing', 'judging', 'showcase', 'leaderboard', 'podium']) assert.equal(musicGroupFor(scene), 'match');
});

test('recordings survive screen transitions, crossfade groups, mute and resume after hiding', async () => {
  const contexts = [], recordings = [];
  class Param {
    value = 1;
    cancelAndHoldAtTime() {}
    setValueAtTime(value) { this.value = value; }
    setTargetAtTime(value) { this.value = value; }
    linearRampToValueAtTime(value) { this.value = value; }
    exponentialRampToValueAtTime(value) { this.value = value; }
  }
  class Node {
    gain = new Param(); frequency = new Param(); stopped = false;
    connect() { return this; }
    disconnect() {}
    start() {}
    stop(at) { if (at === undefined) this.stopped = true; }
  }
  class Recording {
    paused = true; currentTime = 0; plays = 0;
    constructor(src) { this.src = src; recordings.push(this); }
    async play() { this.paused = false; this.plays++; }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  }
  class Context {
    currentTime = 0; state = 'suspended'; destination = new Node(); gains = []; oscillators = [];
    constructor() { contexts.push(this); }
    createGain() { const node = new Node(); this.gains.push(node); return node; }
    createMediaElementSource() { return new Node(); }
    createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
  }
  const originals = new Map(['AudioContext', 'Audio', 'document', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = new Map();
  const globals = { AudioContext: Context, Audio: Recording, document: { hidden: false }, localStorage: { setItem: (key, value) => storage.set(key, value) } };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const cleanups = [];
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
  try {
    assert.equal(contexts.length, 0);
    assert.equal(recordings.length, 0);
    await gameAudio.unlock();
    const context = contexts[0];
    const lobby = recordings[0];
    lobby.currentTime = 12;
    cleanups.push(gameAudio.register('waiting', 1));
    await settle();
    assert.equal(recordings.length, 1);
    assert.equal(lobby.plays, 1);
    assert.equal(lobby.currentTime, 12);
    cleanups.push(gameAudio.register('drawing', 2));
    await settle();
    assert.equal(recordings.length, 2);
    assert.equal(context.gains[2].gain.value, 0);
    const match = recordings[1];
    match.currentTime = 42;
    for (const [index, scene] of ['judging', 'showcase', 'leaderboard', 'podium', 'drawing'].entries()) {
      cleanups.push(gameAudio.register(scene, index + 3));
      await settle();
      assert.equal(recordings.length, 2);
      assert.equal(match.plays, 1);
      assert.equal(match.currentTime, 42);
      assert.equal(context.gains[0].gain.value, 0.6 * sceneMusicLevel[scene]);
      assert.equal(context.gains[1].gain.value, 0.8, 'scene changes do not alter SFX volume');
    }
    assert(gameAudio.updatePreferences({ music: 25, effects: 40, muted: true }));
    assert.equal(context.gains[0].gain.value, 0);
    assert.equal(context.gains[1].gain.value, 0);
    gameAudio.play('press');
    assert.equal(context.oscillators.length, 0);
    gameAudio.updatePreferences({ muted: false });
    assert.equal(context.gains[0].gain.value, 0.1);
    assert.equal(context.gains[1].gain.value, 0.4);
    gameAudio.play('press');
    assert.equal(context.oscillators.length, 2);
    const signatures = new Set();
    for (const effect of ['press', 'close', 'open', 'switch-on', 'switch-off', 'select', 'increment', 'decrement']) {
      context.currentTime += 1;
      const start = context.oscillators.length;
      gameAudio.play(effect);
      const pitches = context.oscillators.slice(start).map(node => node.frequency.value);
      assert(pitches.length > 0, `${effect} produces feedback`);
      const signature = pitches.join(',');
      assert(!signatures.has(signature), `${effect} has a distinct sound`);
      signatures.add(signature);
      if (effect === 'close' || effect === 'switch-off') assert(pitches[0] > pitches[1]);
      if (effect === 'open' || effect === 'switch-on') assert(pitches[0] < pitches[1]);
      gameAudio.play(effect);
      assert.equal(context.oscillators.length, start + pitches.length, 'rapid duplicate effects are throttled');
    }
    const beforeSilent = context.oscillators.length;
    gameAudio.updatePreferences({ effects: 0 });
    context.currentTime += 1;
    gameAudio.play('switch-on');
    assert.equal(context.oscillators.length, beforeSilent, 'new effects respect zero SFX volume');
    gameAudio.updatePreferences({ effects: 40, muted: true });
    gameAudio.play('close');
    assert.equal(context.oscillators.length, beforeSilent, 'new effects respect mute');
    gameAudio.updatePreferences({ muted: false });
    gameAudio.play('champion');
    assert.equal(match.plays, 1, 'fanfare does not replace or restart the recording');
    document.hidden = true;
    gameAudio.visibility();
    assert.equal(context.state, 'suspended');
    assert(recordings.every(audio => audio.paused));
    assert(context.oscillators.every(node => node.stopped));
    document.hidden = false;
    await gameAudio.unlock();
    assert.equal(contexts.length, 1);
    assert.equal(context.state, 'running');
    assert.equal(match.currentTime, 42);
    assert.equal(match.paused, false);
    assert.equal(JSON.parse([...storage.values()][0]).muted, false);
    cleanups.push(gameAudio.register('podium', 100));
    await settle();
    assert.equal(context.gains[0].gain.value, 0);
    gameAudio.updatePreferences({ music: 100 });
    assert.equal(context.gains[0].gain.value, 0, 'music slider cannot restore BGM on podium');
    const beforeEntrance = context.oscillators.length;
    gameAudio.play('podium');
    assert.equal(context.oscillators.length, beforeEntrance + 6, 'dedicated entrance plays on the effects bus');
    const bgRecordings = [lobby, match];
    await new Promise(resolve => setTimeout(resolve, 850));
    assert(bgRecordings.every(audio => audio.paused));
    context.currentTime += 10;
    gameAudio.play('champion');
    const suspenseClip = recordings.find(item => item.src.includes('podium-suspense'));
    assert(suspenseClip?.paused, 'champion reveal stops podium suspense music');
    const plays = match.plays;
    await gameAudio.unlock();
    assert.equal(match.plays, plays, 'podium interactions cannot restart BGM');
    document.hidden = true;
    gameAudio.visibility();
    assert(recordings.every(audio => audio.paused), 'all music and sound clips pause in background');
    document.hidden = false;
    await gameAudio.unlock();
    assert.equal(match.plays, plays, 'returning to podium tab cannot restart BGM');
    cleanups.push(gameAudio.register('drawing', 101));
    await settle();
    assert.equal(match.paused, false);
    assert.equal(match.currentTime, 42);
    assert.equal(context.gains[0].gain.value, 0.4);
  } finally {
    cleanups.forEach(cleanup => cleanup());
    gameAudio.dispose();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
