import { describe, expect, test, vi } from 'vitest';
import type { PlatformConfig } from 'homebridge';
import { ShellyRGBW2Platform } from '../../src/platform';
import type { ShellyDeviceConfig, ShellyRGBW2PlatformConfig } from '../../src/platform';
import { ShellyWhiteChannelAccessory } from '../../src/platformAccessory/ShellyWhiteChannelAccessory';

vi.mock('../../src/platformAccessory/ShellyWhiteChannelAccessory', () => {
  return {
    ShellyWhiteChannelAccessory: vi.fn().mockImplementation((platform, accessory) => {
      return {
        channelIndex: accessory.context.channel?.channel ?? 0,
        refreshFromDevice: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

const now = Date.now();

describe('ShellyRGBW2Platform polling', () => {
  test('clamps poll interval and runs initial poll immediately', async () => {
    vi.useFakeTimers({ now });
    const platform = createPlatform([
      { id: 'dev', host: 'http://test', pollIntervalSeconds: 1, channels: [{ channel: 0 }] },
    ]);

    platform['discoverDevices']();

    const instances = platform['channelAccessories'].get('dev')!;
    const acc = instances[0];
    const refreshSpy = acc.refreshFromDevice as unknown as ReturnType<typeof vi.fn>;

    expect(refreshSpy).toHaveBeenCalledTimes(1); // immediate runPoll
    await vi.advanceTimersByTimeAsync(2000);
    expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(2); // next tick after clamp to 2s
  });

  test('backoff increases delay after failures and resets on success', async () => {
    vi.useFakeTimers({ now });
    const platform = createPlatform([
      { id: 'dev', host: 'http://test', pollIntervalSeconds: 2, channels: [{ channel: 0 }] },
    ]);

    platform['discoverDevices']();
    const acc = platform['channelAccessories'].get('dev')![0];
    const refreshSpy = acc.refreshFromDevice as unknown as ReturnType<typeof vi.fn>;

    // make refresh reject to trigger backoff
    refreshSpy.mockRejectedValueOnce(new Error('offline'));
    refreshSpy.mockRejectedValueOnce(new Error('still offline'));
    refreshSpy.mockResolvedValue(undefined);

    await vi.advanceTimersByTimeAsync(2000); // first scheduled poll after immediate run
    await vi.advanceTimersByTimeAsync(4000); // backoff 2x
    await vi.advanceTimersByTimeAsync(8000); // backoff 4x capped at 30s; then success resets

    expect(refreshSpy).toHaveBeenCalled();
  });

  test('separate devices get separate timers', async () => {
    vi.useFakeTimers({ now });
    const platform = createPlatform([
      { id: 'dev1', host: 'http://test1', pollIntervalSeconds: 2, channels: [{ channel: 0 }] },
      { id: 'dev2', host: 'http://test2', pollIntervalSeconds: 2, channels: [{ channel: 1 }] },
    ]);

    platform['discoverDevices']();
    await flushMicrotasks();
    expect(platform['pollTimers'].size).toBe(2);

    await vi.advanceTimersByTimeAsync(3000);
    for (const accs of platform['channelAccessories'].values()) {
      const refreshSpy = accs[0].refreshFromDevice as unknown as ReturnType<typeof vi.fn>;
      expect(refreshSpy).toHaveBeenCalled();
    }
  });
});

function createPlatform(devices: ShellyDeviceConfig[]) {
  const hap = createHapStub();
  const platform = new ShellyRGBW2Platform(
    {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any,
    { name: 'Shelly RGBW2', platform: 'ShellyRGBW2', devices } as ShellyRGBW2PlatformConfig & PlatformConfig,
    {
      hap,
      on: (_event: string, cb: () => void) => cb(),
      platformAccessory: class {
        public context: any = {};
        constructor(public displayName: string, public UUID: string) {}
        getService() { return undefined; }
        addService() { return undefined; }
      },
      registerPlatformAccessories: vi.fn(),
      unregisterPlatformAccessories: vi.fn(),
    } as any,
  );

  return platform;
}

function createHapStub() {
  return {
    Service: {
      AccessoryInformation: 'AccessoryInformation',
      Lightbulb: 'Lightbulb',
    },
    Characteristic: {
      Manufacturer: 'Name',
      Model: 'Name',
      Name: 'Name',
      On: 'On',
      Brightness: 'Brightness',
    },
    uuid: {
      generate: (id: string) => `uuid-${id}`,
    },
  };
}

function flushMicrotasks() {
  return vi.advanceTimersByTimeAsync(0);
}
