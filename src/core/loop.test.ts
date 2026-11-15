import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOP, loopSeconds, positionAt, stepSeconds, stepsPerLoop } from './loop';

describe('ループの刻み', () => {
  it('124 BPM の8分音符は約0.242秒、4小節は32刻みで約7.74秒', () => {
    expect(stepSeconds(DEFAULT_LOOP)).toBeCloseTo(0.2419, 4);
    expect(stepsPerLoop(DEFAULT_LOOP)).toBe(32);
    expect(loopSeconds(DEFAULT_LOOP)).toBeCloseTo(7.742, 3);
  });

  it('経過秒を、何周目の何刻み目かに直す', () => {
    const s = { bpm: 120, bars: 4 }; // 8分音符 = 0.25秒、1周 = 8秒
    expect(positionAt(s, 0)).toEqual({ loop: 0, step: 0 });
    expect(positionAt(s, 0.25)).toEqual({ loop: 0, step: 1 });
    expect(positionAt(s, 7.99)).toEqual({ loop: 0, step: 31 });
    expect(positionAt(s, 8)).toEqual({ loop: 1, step: 0 });
    expect(positionAt(s, 8.5)).toEqual({ loop: 1, step: 2 });
  });

  it('始まる前（負の経過秒）は頭として扱う', () => {
    expect(positionAt(DEFAULT_LOOP, -0.1)).toEqual({ loop: 0, step: 0 });
  });
});
