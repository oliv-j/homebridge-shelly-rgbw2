import { describe, expect, test } from 'vitest';
import { parseWhiteStatus } from '../../src/shelly/ShellyRGBW2Client';

describe('parseWhiteStatus', () => {
  test('parses valid response and clamps brightness', () => {
    expect(parseWhiteStatus({ ison: true, brightness: 120 })).toEqual({ isOn: true, brightness: 100 });
    expect(parseWhiteStatus({ ison: false, brightness: -5 })).toEqual({ isOn: false, brightness: 0 });
  });

  test('throws on invalid payload', () => {
    expect(() => parseWhiteStatus(null as unknown as object)).toThrow();
    expect(() => parseWhiteStatus({})).toThrow();
  });
});
