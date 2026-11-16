// 音を鳴らす（音の読み込みと再生機能）。Tone.js を読むのはこの層だけ（実装方針2章）。
// Transport・Loop・Sequence は使わず、受け取った音の時計の時刻にそのまま予約する（技術選定 3.2）。
import * as Tone from 'tone';
import type { Instrument } from '../core/keys';
import type { AccompanimentHit, Note } from '../music/notes';
import type { DrumKind } from '../music/settings';
import { BASS_FILES, DRUM_FILES, PERC_FILES } from './samples';
import { DEFAULT_AUDIO, type AudioSettings } from './settings';

/** 読み込みの結果（失敗は1つでも読めなかったとき。内部の詳細は返さない） */
export type LoadResult = { ok: true } | { ok: false };

type BufferMap = Map<string, Tone.ToneAudioBuffer>;
type Buffers = { drums: BufferMap; perc: BufferMap; bass: BufferMap };

/** 人1人の通り道（楽器 → パン → 音量） */
interface Seat {
  panner: Tone.Panner;
  gain: Tone.Gain;
  voices: Map<Instrument, Voice>;
}

/** 楽器1つの鳴らし方 */
interface Voice {
  play(note: Note, time: number, seconds: number): void;
}

let loading: Promise<LoadResult> | null = null;
let buffers: Buffers | null = null;

const url = (file: string): string => `${import.meta.env.BASE_URL}sounds/${file}`;

async function loadAll(files: Readonly<Record<string, string>>): Promise<BufferMap> {
  const entries = await Promise.all(Object.entries(files).map(async ([k, f]): Promise<[string, Tone.ToneAudioBuffer]> => [k, await Tone.ToneAudioBuffer.fromUrl(url(f))]));
  return new Map(entries);
}

/** 読み込んだ音を名前で取り出す（無ければ読み込みの誤り） */
function pick(map: BufferMap, key: string): Tone.ToneAudioBuffer {
  const b = map.get(key);
  if (!b) throw new Error(`楽器の音が見つからない: ${key}`);
  return b;
}

const DRUM_KINDS: readonly DrumKind[] = ['kick', 'snare', 'hihatClosed', 'hihatHalf', 'crash'];

/**
 * 楽器の音をすべて読み込む。1ページで1回だけ読み込み、2回目からは同じ結果を返す（設計判断 No.4）。
 * 音の機能はまだ始めない（ブラウザは利用者の操作まで音を鳴らさない）
 */
export function loadSounds(): Promise<LoadResult> {
  loading ??= (async (): Promise<LoadResult> => {
    try {
      const [drums, perc, bass] = await Promise.all([loadAll(DRUM_FILES), loadAll(PERC_FILES), loadAll(BASS_FILES)]);
      buffers = { drums, perc, bass };
      return { ok: true };
    } catch {
      return { ok: false };
    }
  })();
  return loading;
}

/** 音を鳴らす。読み込みが済んでから作る */
export class SoundEngine {
  private readonly settings: AudioSettings;
  private readonly master: Tone.Gain;
  private readonly drums: Map<DrumKind, Tone.Player>;
  private readonly drumBass: Tone.MonoSynth;
  private readonly seats: Seat[] = [];

  constructor(settings: AudioSettings = DEFAULT_AUDIO) {
    if (!buffers) throw new Error('楽器の音を読み込む前に SoundEngine を作った');
    this.settings = settings;
    this.master = new Tone.Gain(Tone.dbToGain(settings.masterDb)).toDestination();
    const drumBus = new Tone.Gain(Tone.dbToGain(settings.drumsDb)).connect(this.master);
    const b = buffers;
    this.drums = new Map(DRUM_KINDS.map((k) => [k, new Tone.Player(pick(b.drums, k)).connect(drumBus)]));
    this.drumBass = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { type: 'lowpass', frequency: 500 } }).connect(drumBus);
  }

  /** 描画のたびに、今からこの秒数先までの拍を予約する */
  get aheadSeconds(): number {
    return this.settings.scheduleAheadSeconds;
  }

  /** 音の機能を始める（「はじめる」「再生する」を押したとき） */
  static async start(): Promise<void> {
    await Tone.start();
  }

  /** 音の時計の今（秒） */
  static now(): number {
    return Tone.getContext().currentTime;
  }

  /** 一時停止（音の時計を止める。設計判断 No.9） */
  static async pause(): Promise<void> {
    const raw = Tone.getContext().rawContext;
    // 画面に出す AudioContext だけが止められる（outputLatency を持つのは AudioContext だけ）
    if ('outputLatency' in raw) await raw.suspend();
  }

  /** 再開 */
  static async resume(): Promise<void> {
    await Tone.getContext().resume();
  }

  /** 機器の出力の遅れ（秒。N2 を測るため。分からなければ 0） */
  static outputLatency(): number {
    const raw = Tone.getContext().rawContext;
    return 'outputLatency' in raw && typeof raw.outputLatency === 'number' ? raw.outputLatency : 0;
  }

  /** 音1つを、音の時計の time に鳴らす。過ぎた時刻なら鳴らさない（設計判断 No.6） */
  playNote(note: Note, time: number): void {
    if (time < SoundEngine.now()) return;
    const seat = this.seat(note.person);
    const db = this.settings.instrumentDb[note.instrument] ?? 0;
    seat.gain.gain.setValueAtTime(Tone.dbToGain(db), time);
    seat.panner.pan.setValueAtTime(note.pan, time);
    this.voice(seat, note.instrument).play(note, time, this.settings.noteSeconds);
  }

  /** 伴奏の打つもの1つを鳴らす */
  playAccompaniment(hit: AccompanimentHit, time: number): void {
    if (time < SoundEngine.now()) return;
    if (hit.kind === 'bass') {
      this.drumBass.triggerAttackRelease(Tone.Frequency(hit.midi, 'midi').toFrequency(), this.settings.noteSeconds * 1.6, time);
      return;
    }
    const player = this.drums.get(hit.kind);
    player?.start(time);
  }

  /** 予約した音を止める（見終わったとき・画面を離れるとき） */
  stopAll(): void {
    for (const p of this.drums.values()) p.stop();
    for (const seat of this.seats) seat.gain.gain.cancelScheduledValues(0);
  }

  private seat(person: number): Seat {
    let seat = this.seats[person];
    if (!seat) {
      const gain = new Tone.Gain(0).connect(this.master);
      const panner = new Tone.Panner(0).connect(gain);
      seat = { panner, gain, voices: new Map() };
      this.seats[person] = seat;
    }
    return seat;
  }

  private voice(seat: Seat, instrument: Instrument): Voice {
    let v = seat.voices.get(instrument);
    if (!v) {
      v = makeVoice(instrument, seat.panner);
      seat.voices.set(instrument, v);
    }
    return v;
  }
}

/** 楽器ごとの音色（音の設計方針 3章、設計判断 No.3） */
function makeVoice(instrument: Instrument, out: Tone.ToneAudioNode): Voice {
  const b = buffers;
  if (!b) throw new Error('楽器の音を読み込む前に鳴らした');
  const freqs = (note: Note): number[] => note.midis.map((m) => Tone.Frequency(m, 'midi').toFrequency());
  switch (instrument) {
    case 0: {
      // 旋律: のこぎり波3本を少しずらして重ね、コーラスをかける
      const chorus = new Tone.Chorus({ frequency: 3, delayTime: 3, depth: 0.5, wet: 0.4 }).connect(out).start();
      const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 24 }, envelope: { attack: 0.005, decay: 0.15, sustain: 0.35, release: 0.25 } }).connect(chorus);
      return { play: (n, t, s) => synth.triggerAttackRelease(freqs(n), s, t) };
    }
    case 1: {
      // ベース: 録音したエレキベース
      const sampler = new Tone.Sampler({ urls: Object.fromEntries(b.bass), release: 0.3 }).connect(out);
      return { play: (n, t, s) => sampler.triggerAttackRelease(freqs(n), s * 1.5, t) };
    }
    case 2: {
      // 和音: のこぎり波をひずませ、高い音を少し削る
      const filter = new Tone.Filter(2400, 'lowpass').connect(out);
      const dist = new Tone.Distortion(0.6).connect(filter);
      const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.25, sustain: 0.4, release: 0.2 } }).connect(dist);
      return { play: (n, t, s) => synth.triggerAttackRelease(freqs(n), s, t) };
    }
    case 3: {
      // 高い旋律: 矩形波を短くはじき、付点8分のディレイ
      const delay = new Tone.FeedbackDelay({ delayTime: (60 / 124) * 0.75, feedback: 0.3, wet: 0.3 }).connect(out);
      const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.14, sustain: 0, release: 0.08 } }).connect(delay);
      return { play: (n, t) => synth.triggerAttackRelease(freqs(n), 0.12, t) };
    }
    case 4: {
      // 打楽器: 手拍子は合成（雑音を帯域で絞って短く3回）、タンバリン・トライアングルは録音
      const clapFilter = new Tone.Filter(1200, 'bandpass').connect(out);
      const lightFilter = new Tone.Filter(2200, 'bandpass').connect(out);
      const clap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).connect(clapFilter);
      const light = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.06, sustain: 0 } }).connect(lightFilter);
      const tamb = new Tone.Player(pick(b.perc, 'tambourine')).connect(out);
      const tri = new Tone.Player(pick(b.perc, 'triangle')).connect(out);
      return {
        play: (n, t) => {
          if (n.perc === 'tambourine') tamb.start(t);
          else if (n.perc === 'triangle') tri.start(t);
          else {
            const synth = n.perc === 'lightClap' ? light : clap;
            for (const d of [0, 0.012, 0.024]) synth.triggerAttackRelease(0.03, t + d);
          }
        },
      };
    }
  }
}
