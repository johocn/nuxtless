import { describe, expect, it } from 'vitest';
import { PALETTE_PRESETS } from '../palette-presets';

describe('palette-presets', () => {
  it('内置 8 套预设', () => {
    expect(Object.keys(PALETTE_PRESETS).length).toBe(8);
  });
  it('默认启用 dawn-gold（晨曦金）', () => {
    expect(PALETTE_PRESETS['dawn-gold']).toBeDefined();
  });
  it('每套含可用的 primaryColor', () => {
    for (const p of Object.values(PALETTE_PRESETS)) {
      expect(p.tokens.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('每套 tokens 含 accentColor 与 radius', () => {
    for (const p of Object.values(PALETTE_PRESETS)) {
      expect(p.tokens.accentColor).toBeTypeOf('string');
      expect(typeof p.tokens.radius).toBe('number');
    }
  });
});