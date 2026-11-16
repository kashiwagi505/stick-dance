// はしごの名前の組み立て（SCR02 3.1 No.4）。描画（Canvas）ではなく、どの段にどの名前を出すかだけを確かめる。
import { describe, expect, it } from 'vitest';
import { PERC_NAMES, SCALE_NAMES, percKindOf } from '../music/settings';
import { groupLabels, scaleLabels } from './draw';

describe('音階のはしごの名前', () => {
  it('音の名前は1段に1つ、2列に互い違いに出す', () => {
    const labels = scaleLabels(SCALE_NAMES);
    expect(labels).toHaveLength(SCALE_NAMES.length);
    labels.forEach((l, i) => expect(l).toEqual({ text: SCALE_NAMES[i], from: i, to: i, at: i, column: i % 2 === 1 ? 1 : 0 }));
  });

  it('打楽器は同じ種類の続く段をまとめ、まとまりの真ん中の段に1列で出す', () => {
    const kinds = SCALE_NAMES.map((_, i) => PERC_NAMES[percKindOf(i)]);
    expect(groupLabels(kinds)).toEqual([
      { text: '手拍子', from: 0, to: 2, at: 1, column: 0 },
      { text: 'タンバリン', from: 3, to: 5, at: 4, column: 0 },
      { text: '軽い手拍子', from: 6, to: 8, at: 7, column: 0 },
      { text: 'トライアングル', from: 9, to: 10, at: 9, column: 0 },
    ]);
  });

  it('まとまりが1段だけでも、その段に出す', () => {
    expect(groupLabels(['a', 'b', 'b'])).toEqual([
      { text: 'a', from: 0, to: 0, at: 0, column: 0 },
      { text: 'b', from: 1, to: 2, at: 1, column: 0 },
    ]);
  });
});
