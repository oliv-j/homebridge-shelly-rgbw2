import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PlatformConfig } from 'homebridge';
import { ShellyWhiteChannelAccessory } from '../../src/platformAccessory/ShellyWhiteChannelAccessory';
import type { ShellyChannelConfig, ShellyDeviceConfig, ShellyRGBW2PlatformConfig } from '../../src/platform';
import { __mockClients, __setClientBehavior } from '../../src/shelly/ShellyRGBW2Client';

vi.mock('../../src/shelly/ShellyRGBW2Client', async () => {
  const actual = await vi.importActual<typeof import('../../src/shelly/ShellyRGBW2Client')>(
    '../../src/shelly/ShellyRGBW2Client',
  );

  type Behaviours = {
    getWhiteStatus: (channel: number) => Promise<{ isOn: boolean; brightness: number }>;
    setWhiteOn: (channel: number, on: boolean, transitionMs?: number) => Promise<{ isOn: boolean; brightness: number }>;
    setWhiteOnWithBrightness: (
      channel: number,
      brightness: number,
      transitionMs?: number,
    ) => Promise<{ isOn: boolean; brightness: number }>;
    setWhiteBrightness: (
      channel: number,
      brightness: number,
      transitionMs?: number,
    ) => Promise<{ isOn: boolean; brightness: number }>;
  };

  const mockClients: MockClient[] = [];

  class MockClient {
    public behaviour: Behaviours = {
      getWhiteStatus: async () => ({ isOn: false, brightness: 0 }),
      setWhiteOn: async (_ch, on) => ({ isOn: on, brightness: on ? 100 : 0 }),
      setWhiteOnWithBrightness: async (_ch, brightness) => ({ isOn: true, brightness }),
      setWhiteBrightness: async (_ch, brightness) => ({ isOn: brightness > 0, brightness }),
    };

    public calls = {
      getWhiteStatus: [] as unknown[],
      setWhiteOn: [] as unknown[],
      setWhiteOnWithBrightness: [] as unknown[],
      setWhiteBrightness: [] as unknown[],
    };

    constructor(public readonly options: Record<string, unknown>) {
      mockClients.push(this);
    }

    async getWhiteStatus(channel: number) {
      this.calls.getWhiteStatus.push(channel);
      return this.behaviour.getWhiteStatus(channel);
    }

    async setWhiteOn(channel: number, on: boolean, transitionMs?: number) {
      this.calls.setWhiteOn.push({ channel, on, transitionMs });
      return this.behaviour.setWhiteOn(channel, on, transitionMs);
    }

    async setWhiteOnWithBrightness(channel: number, brightness: number, transitionMs?: number) {
      this.calls.setWhiteOnWithBrightness.push({ channel, brightness, transitionMs });
      return this.behaviour.setWhiteOnWithBrightness(channel, brightness, transitionMs);
    }

    async setWhiteBrightness(channel: number, brightness: number, transitionMs?: number) {
      this.calls.setWhiteBrightness.push({ channel, brightness, transitionMs });
      return this.behaviour.setWhiteBrightness(channel, brightness, transitionMs);
    }
  }

  const setClientBehaviour = (client: MockClient, behaviour: Partial<Behaviours>) => {
    client.behaviour = { ...client.behaviour, ...behaviour };
  };

  return {
    ...actual,
    ShellyRGBW2Client: MockClient,
    __mockClients: mockClients,
    __setClientBehavior: setClientBehaviour,
  };
});

describe('ShellyWhiteChannelAccessory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __mockClients.length = 0;
  });

  test('refresh skips during cooldown after a set', async () => {
    const { channelAccessory, client } = createAccessory();

    client.calls.getWhiteStatus.length = 0;
    channelAccessory['lastSetAt'] = Date.now();
    await channelAccessory.refreshFromDevice();
    expect(client.calls.getWhiteStatus.length).toBe(0);

    vi.advanceTimersByTime(600);
    await channelAccessory.refreshFromDevice();
    expect(client.calls.getWhiteStatus.length).toBe(1);
  });

  test('debounces brightness and uses combined on+brightness when off', async () => {
    const { accessory, service, client } = createAccessory();

    __setClientBehavior(client, {
      setWhiteOnWithBrightness: async (_ch, brightness) => ({ isOn: true, brightness }),
    });

    const brightnessChar = service.getCharacteristic('Brightness');

    const set1 = brightnessChar.triggerSet(10);
    const set2 = brightnessChar.triggerSet(20);

    vi.advanceTimersByTime(250);
    await set1;
    await set2;
    await vi.runAllTimersAsync();

    expect(client.calls.setWhiteOnWithBrightness).toHaveLength(1);
    expect(client.calls.setWhiteOnWithBrightness[0]).toMatchObject({ brightness: 20 });
    expect(service.updated).toContainEqual({ name: 'On', value: true });
    expect(service.updated).toContainEqual({ name: 'Brightness', value: 20 });
  });

  test('brightness 0 turns off and preserves lastNonZeroBrightness', async () => {
    const { accessory, service, client } = createAccessory();
    accessory.context.state.isOn = true;
    accessory.context.state.brightness = 50;
    accessory.context.state.lastNonZeroBrightness = 50;

    __setClientBehavior(client, {
      setWhiteOn: async () => ({ isOn: false, brightness: 0 }),
    });

    const brightnessChar = service.getCharacteristic('Brightness');
    const promise = brightnessChar.triggerSet(0);

    vi.advanceTimersByTime(250);
    await promise;
    await vi.runAllTimersAsync();

    expect(client.calls.setWhiteOn).toHaveLength(1);
    expect(client.calls.setWhiteOn[0]).toMatchObject({ on: false });
    expect(accessory.context.state.lastNonZeroBrightness).toBe(50);
    expect(service.updated).toContainEqual({ name: 'On', value: false });
    expect(service.updated).toContainEqual({ name: 'Brightness', value: 0 });
  });

  test('set On=true from off uses combined brightness with lastNonZero fallback', async () => {
    const { accessory, service, client } = createAccessory();

    __setClientBehavior(client, {
      setWhiteOnWithBrightness: async (_ch, brightness) => ({ isOn: true, brightness }),
    });

    const onChar = service.getCharacteristic('On');
    await onChar.triggerSet(true);
    await vi.runAllTimersAsync();

    expect(client.calls.setWhiteOnWithBrightness).toHaveLength(1);
    expect(client.calls.setWhiteOnWithBrightness[0]).toMatchObject({ brightness: 100 });
    expect(accessory.context.state.lastNonZeroBrightness).toBe(100);
    expect(service.updated).toContainEqual({ name: 'On', value: true });
    expect(service.updated).toContainEqual({ name: 'Brightness', value: 100 });
  });

  test('set On=false turns off without clearing lastNonZeroBrightness', async () => {
    const { accessory, service, client } = createAccessory();
    accessory.context.state.isOn = true;
    accessory.context.state.brightness = 30;
    accessory.context.state.lastNonZeroBrightness = 30;

    __setClientBehavior(client, {
      setWhiteOn: async () => ({ isOn: false, brightness: 0 }),
    });

    const onChar = service.getCharacteristic('On');
    await onChar.triggerSet(false);
    await vi.runAllTimersAsync();

    expect(client.calls.setWhiteOn).toHaveLength(1);
    expect(client.calls.setWhiteOn[0]).toMatchObject({ on: false });
    expect(accessory.context.state.lastNonZeroBrightness).toBe(30);
    expect(service.updated).toContainEqual({ name: 'On', value: false });
    expect(service.updated).toContainEqual({ name: 'Brightness', value: 0 });
  });

  test('transitions are passed through on set paths', async () => {
    const { client, accessory } = createAccessory({ transitionOnMs: 200, transitionOffMs: 400 });
    accessory.context.state.isOn = true;
    accessory.context.state.brightness = 10;
    accessory.context.state.lastNonZeroBrightness = 10;

    await accessory.getService('Lightbulb')!.getCharacteristic('On').triggerSet(false);
    expect(client.calls.setWhiteOn[0]).toMatchObject({ transitionMs: 400 });

    await accessory.getService('Lightbulb')!.getCharacteristic('On').triggerSet(true);
    expect(client.calls.setWhiteOnWithBrightness[0]).toMatchObject({ transitionMs: 200 });
  });
});

test('refreshFromDevice applies changes and updates characteristics once', async () => {
  const { accessory, service, client, channelAccessory } = createAccessory();
  client.behaviour = {
    ...client.behaviour,
    getWhiteStatus: async () => ({ isOn: true, brightness: 55 }),
  };

  service.updated.length = 0;
  const spy = vi.fn(async () => ({ isOn: true, brightness: 55 }));
  (channelAccessory as any).client.getWhiteStatus = spy;
  await channelAccessory.refreshFromDevice();
  expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
  expect(accessory.context.state.isOn).toBe(true);
  expect(accessory.context.state.brightness).toBe(55);
  expect(service.updated).toContainEqual({ name: 'On', value: true });
  expect(service.updated).toContainEqual({ name: 'Brightness', value: 55 });

  service.updated.length = 0;
  await channelAccessory.refreshFromDevice(); // no change
  expect(service.updated).toHaveLength(0);
});

function createAccessory(deviceOverrides: Partial<ShellyDeviceConfig> = {}) {
  const hap = createHapStub();
  const platform = createPlatform(hap);

  const device: ShellyDeviceConfig = {
    id: 'dev1',
    host: 'http://shelly.test',
    ...deviceOverrides,
  };
  const channel: ShellyChannelConfig = { channel: 0 };
  const accessory = new FakeAccessory('Test Light', hap);
  const channelAccessory = new ShellyWhiteChannelAccessory(platform as never, accessory as never, device, channel);
  const service = accessory.getService('Lightbulb')!;
  const client = __mockClients[0];
  if (!client) {
    throw new Error('Mock client not created');
  }

  return { accessory, service, client, hap, channelAccessory };
}

function createPlatform(hap: HapStub) {
  return {
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    config: { name: 'Shelly RGBW2' } as ShellyRGBW2PlatformConfig & PlatformConfig,
    api: { hap },
  };
}

type CharacteristicName = 'On' | 'Brightness' | 'Name';

class FakeCharacteristic {
  public setHandler?: (value: unknown) => unknown;
  public getHandler?: () => unknown;

  constructor(private readonly name: CharacteristicName) {}

  onGet(handler: () => unknown) {
    this.getHandler = handler;
    return this;
  }

  onSet(handler: (value: unknown) => unknown) {
    this.setHandler = handler;
    return this;
  }

  triggerSet(value: unknown) {
    const result = this.setHandler?.(value);
    return result instanceof Promise ? result : Promise.resolve(result);
  }
}

class FakeService {
  public readonly characteristics = new Map<CharacteristicName, FakeCharacteristic>();
  public readonly updated: Array<{ name: CharacteristicName; value: unknown }> = [];
  public name?: string;

  constructor(public readonly type: string, name?: string) {
    this.name = name;
  }

  getCharacteristic(name: CharacteristicName) {
    if (!this.characteristics.has(name)) {
      this.characteristics.set(name, new FakeCharacteristic(name));
    }
    return this.characteristics.get(name)!;
  }

  setCharacteristic(name: CharacteristicName, value: unknown) {
    this.updated.push({ name, value });
    return this;
  }

  updateCharacteristic(name: CharacteristicName, value: unknown) {
    this.updated.push({ name, value });
    return this;
  }
}

class FakeAccessory {
  public readonly services = new Map<string, FakeService>();
  public readonly context: Record<string, any> = {};

  constructor(public displayName: string, private readonly hap: HapStub) {}

  getService(type: string) {
    return this.services.get(type);
  }

  addService(type: string, name?: string) {
    const service = new FakeService(type, name);
    this.services.set(type, service);
    return service;
  }
}

type HapStub = {
  Service: {
    AccessoryInformation: string;
    Lightbulb: string;
  };
  Characteristic: {
    Manufacturer: CharacteristicName;
    Model: CharacteristicName;
    Name: CharacteristicName;
    On: CharacteristicName;
    Brightness: CharacteristicName;
  };
};

function createHapStub(): HapStub {
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
  };
}
