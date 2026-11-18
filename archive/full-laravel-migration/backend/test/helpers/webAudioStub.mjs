// ---------------------------------------------------------------------
// A minimal Web Audio + window stub, installed on import.
//
// IMPORT THIS BEFORE alertSound.js. ESM evaluates side-effect imports in
// source order, and alertSound reads `window` at module scope.
//
// This stubs a BROWSER BOUNDARY, not our own code: the surface below is the
// whole of what alertSound touches (an AudioContext, three node factories, a
// couple of AudioParams). Nothing about the alert state machine is faked, so
// a test still exercises the real seen-set, the real timer and the real
// acknowledgement logic. jsdom would give the same answer with a 40 MB
// dependency attached, and a real AudioContext does not exist in Node at all.
//
// Sound is observed by counting oscillators: every note the module plays
// creates them, so "did it ring" is "did the count move", and "did it ring
// once" is "did the count move by exactly one burst". Tests never hardcode
// how many nodes a burst is -- they measure one and compare.
// ---------------------------------------------------------------------

let oscillators = 0;
let state = 'running';

class Param {
  constructor(value) {
    this.value = value;
  }
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class Node {
  connect() {}
  disconnect() {}
}

class GainNode extends Node {
  constructor() {
    super();
    this.gain = new Param(1);
  }
}

class OscillatorNode extends Node {
  constructor() {
    super();
    this.type = 'sine';
    this.frequency = new Param(440);
  }
  start() {}
  stop() {}
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = new Node();
    Object.defineProperty(this, 'state', { get: () => state });
  }
  createDynamicsCompressor() {
    const node = new Node();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new Param(0);
    return node;
  }
  createGain() {
    return new GainNode();
  }
  createOscillator() {
    oscillators += 1;
    return new OscillatorNode();
  }
  resume() {
    state = 'running';
    return Promise.resolve();
  }
}

globalThis.window = {
  AudioContext: FakeAudioContext,
  addEventListener() {},
  removeEventListener() {},
};

// How many oscillators have been created since the last mark. A test marks,
// acts, then reads.
let mark = 0;
export function markAudio() {
  mark = oscillators;
}
export function audioSince() {
  return oscillators - mark;
}

// Simulate the autoplay policy: the context starts suspended until a gesture.
export function suspendAudio() {
  state = 'suspended';
}
export function resumeAudio() {
  state = 'running';
}
