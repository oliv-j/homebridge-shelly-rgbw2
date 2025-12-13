import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ShellyRGBW2Client } from '../../src/shelly/ShellyRGBW2Client';

const requests: string[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  requests.length = 0;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.restoreAllMocks();
});

describe('ShellyRGBW2Client', () => {
  test('gets white status and parses state', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const method = (init?.method ?? 'GET').toString().toUpperCase();
      requests.push(`${method} ${url.pathname}`);
      return new Response(JSON.stringify({ ison: true, brightness: 42, power: 5 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = new ShellyRGBW2Client({ host: 'http://shelly.test', timeoutMs: 500 });
    const status = await client.getWhiteStatus(0);

    expect(status).toEqual({ isOn: true, brightness: 42 });
    expect(requests[0]).toBe('GET /white/0');
  });

  test('sets brightness with clamping and parses response', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const method = (init?.method ?? 'GET').toString().toUpperCase();
      requests.push(`${method} ${url.pathname}?${url.searchParams.toString()}`);

      expect(url.searchParams.get('brightness')).toBe('100');

      return new Response(JSON.stringify({ ison: true, brightness: 100 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = new ShellyRGBW2Client({ host: 'http://shelly.test', timeoutMs: 500 });
    const status = await client.setWhiteBrightness(1, 120);

    expect(status).toEqual({ isOn: true, brightness: 100 });
    expect(requests[0]).toBe('GET /white/1?brightness=100');
  });

  test('sets on with brightness using combined request', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      requests.push(`${init?.method ?? 'GET'} ${url.pathname}?${url.searchParams.toString()}`);
      expect(url.searchParams.get('turn')).toBe('on');
      expect(url.searchParams.get('brightness')).toBe('25');

      return new Response(JSON.stringify({ ison: true, brightness: 25 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const client = new ShellyRGBW2Client({ host: 'http://shelly.test', timeoutMs: 500 });
    const status = await client.setWhiteOnWithBrightness(2, 25);

    expect(status).toEqual({ isOn: true, brightness: 25 });
    expect(requests[0]).toBe('GET /white/2?turn=on&brightness=25');
  });

  test('retries once after timeout', async () => {
    fetchMock
      .mockImplementationOnce(async (_input, init) => {
        const signal = init?.signal;
        requests.push('GET /white/0');
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      })
      .mockImplementationOnce(async () => {
        requests.push('GET /white/0');
        return new Response(JSON.stringify({ ison: true, brightness: 10 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

    const client = new ShellyRGBW2Client({ host: 'http://shelly.test', timeoutMs: 30, retries: 1 });
    const status = await client.getWhiteStatus(0);

    expect(status).toEqual({ isOn: true, brightness: 10 });
    expect(requests.length).toBe(2);
  });
});
