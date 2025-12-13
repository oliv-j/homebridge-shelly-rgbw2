/// <reference lib="dom" />
import { setTimeout as delay } from 'node:timers/promises';

export interface ShellyRGBW2ClientOptions {
  host: string;
  timeoutMs?: number;
  retries?: number;
  username?: string;
  password?: string;
}

export interface ShellyWhiteStatus {
  isOn: boolean;
  brightness: number;
}

interface RequestOptions {
  transitionMs?: number;
  includeBrightness?: number;
  turn?: 'on' | 'off';
}

const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_RETRIES = 1;

export class ShellyRGBW2Client {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly authHeader?: string;

  constructor(options: ShellyRGBW2ClientOptions) {
    this.baseUrl = new URL(options.host.startsWith('http') ? options.host : `http://${options.host}`);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);

    if (options.username && options.password) {
      const token = Buffer.from(`${options.username}:${options.password}`).toString('base64');
      this.authHeader = `Basic ${token}`;
    }
  }

  async getWhiteStatus(channel: number): Promise<ShellyWhiteStatus> {
    const url = this.buildChannelUrl(channel);
    const data = await this.performRequest(url);
    return parseWhiteStatus(data);
  }

  async setWhiteOn(channel: number, on: boolean, transitionMs?: number): Promise<ShellyWhiteStatus> {
    const data = await this.performStateChange(channel, {
      turn: on ? 'on' : 'off',
      transitionMs,
    });
    return parseWhiteStatus(data);
  }

  async setWhiteOnWithBrightness(channel: number, brightness: number, transitionMs?: number): Promise<ShellyWhiteStatus> {
    const data = await this.performStateChange(channel, {
      turn: 'on',
      includeBrightness: clampBrightness(brightness),
      transitionMs,
    });
    return parseWhiteStatus(data);
  }

  async setWhiteBrightness(channel: number, brightness: number, transitionMs?: number): Promise<ShellyWhiteStatus> {
    const data = await this.performStateChange(channel, {
      includeBrightness: clampBrightness(brightness),
      transitionMs,
    });
    return parseWhiteStatus(data);
  }

  private buildChannelUrl(channel: number): URL {
    const channelNumber = Number(channel);
    if (!Number.isInteger(channelNumber) || channelNumber < 0 || channelNumber > 3) {
      throw new Error(`Channel must be an integer between 0 and 3. Received: ${channel}`);
    }

    const url = new URL(`/white/${channelNumber}`, this.baseUrl);
    return url;
  }

  private async performRequest(url: URL): Promise<unknown> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.retries) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs).unref();
      try {
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: this.authHeader ? { Authorization: this.authHeader } : undefined,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return json;
      } catch (error) {
        lastError = error;
        if (attempt >= this.retries) {
          break;
        }

        const backoffMs = 100 * (attempt + 1);
        await delay(backoffMs);
      } finally {
        clearTimeout(timeout);
      }

      attempt += 1;
    }

    throw lastError instanceof Error ? lastError : new Error('Shelly request failed');
  }

  private async performStateChange(channel: number, options: RequestOptions): Promise<unknown> {
    const url = this.buildChannelUrl(channel);

    if (options.turn) {
      url.searchParams.set('turn', options.turn);
    }

    if (typeof options.includeBrightness === 'number') {
      url.searchParams.set('brightness', String(options.includeBrightness));
    }

    if (typeof options.transitionMs === 'number') {
      url.searchParams.set('transition', String(Math.max(0, Math.round(options.transitionMs))));
    }

    return this.performRequest(url);
  }
}

export function parseWhiteStatus(data: unknown): ShellyWhiteStatus {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid Shelly response: expected object');
  }

  const record = data as Record<string, unknown>;
  const isOn = Boolean(record.ison);
  const brightnessRaw = record.brightness;
  const brightness = clampBrightness(typeof brightnessRaw === 'number' ? brightnessRaw : Number(brightnessRaw));

  return { isOn, brightness };
}

function clampBrightness(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}
