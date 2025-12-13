import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings';
import { ShellyWhiteChannelAccessory } from './platformAccessory/ShellyWhiteChannelAccessory';

export interface ShellyChannelConfig {
  channel: number;
  name?: string;
}

export interface ShellyDeviceConfig {
  id: string;
  host: string;
  channels?: ShellyChannelConfig[];
  pollIntervalSeconds?: number;
  requestTimeoutMs?: number;
  transitionOnMs?: number;
  transitionOffMs?: number;
  username?: string;
  password?: string;
}

export interface ShellyRGBW2PlatformConfig extends PlatformConfig {
  name: string;
  devices?: ShellyDeviceConfig[];
}

export class ShellyRGBW2Platform implements DynamicPlatformPlugin {
  private readonly accessoriesByUuid = new Map<string, PlatformAccessory>();
  private readonly channelAccessories = new Map<string, ShellyWhiteChannelAccessory[]>();
  private readonly pollTimers = new Map<string, NodeJS.Timeout>();
  private readonly failureCounts = new Map<string, number>();
  private didRunDiscovery = false;

  constructor(
    public readonly log: Logger,
    public readonly config: ShellyRGBW2PlatformConfig,
    public readonly api: API,
  ) {
    if (!config) {
      this.log.warn('No configuration found for ShellyRGBW2 platform.');
      return;
    }

    this.api.on('didFinishLaunching', () => {
      if (!Array.isArray(this.config.devices) || this.config.devices.length === 0) {
        this.log.warn('No devices configured for ShellyRGBW2. Add a device to start exposing lights.');
        return;
      }

      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    if (this.accessoriesByUuid.has(accessory.UUID)) {
      this.log.debug?.(`Skipping duplicate cached accessory ${accessory.displayName} (${accessory.UUID})`);
      return;
    }

    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessoriesByUuid.set(accessory.UUID, accessory);
  }

  private discoverDevices(): void {
    if (this.didRunDiscovery) {
      this.log.debug?.('Discovery already executed, skipping.');
      return;
    }
    this.didRunDiscovery = true;

    const newAccessories: PlatformAccessory[] = [];
    const configuredUuids: string[] = [];

    for (const device of this.config.devices ?? []) {
      if (!device?.host) {
        this.log.warn('Skipping device without host:', device?.id ?? '<missing id>');
        continue;
      }
      if (!device?.id) {
        this.log.warn(`Device at ${device.host} missing id; set a stable id for consistent UUIDs.`);
      }

      const safeChannels = this.normaliseChannels(device);
      if (safeChannels.length === 0) {
        this.log.warn(`Device ${device.id ?? device.host} has no valid channels (expected 0-3).`);
        continue;
      }

      const deviceKey = this.deviceKey(device);
      const channelInstances: ShellyWhiteChannelAccessory[] = [];

      for (const channel of safeChannels) {
        const uuidSeed = this.uuidSeed(device, channel);
        const uuid = this.api.hap.uuid.generate(uuidSeed);
        configuredUuids.push(uuid);

        const existingAccessory = this.accessoriesByUuid.get(uuid);
        const accessoryName = channel.name ?? `${device.id ?? device.host} CH${channel.channel}`;

        this.log.debug?.(
          `Configured channel: seed=${uuidSeed} uuid=${uuid} ` +
          (existingAccessory ? '(cached)' : '(new)'),
        );

        if (existingAccessory) {
          existingAccessory.displayName = accessoryName;
          existingAccessory.context.device = device;
          existingAccessory.context.channel = channel;
          existingAccessory.context.plugin = PLUGIN_NAME;
          this.log.info('Restoring cached accessory', accessoryName);
          channelInstances.push(new ShellyWhiteChannelAccessory(this, existingAccessory, device, channel));
        } else {
          this.log.info('Registering new accessory', accessoryName);
          const accessory = new this.api.platformAccessory(accessoryName, uuid);
          accessory.context.device = device;
          accessory.context.channel = channel;
          accessory.context.plugin = PLUGIN_NAME;
          channelInstances.push(new ShellyWhiteChannelAccessory(this, accessory, device, channel));
          this.accessoriesByUuid.set(uuid, accessory);
          newAccessories.push(accessory);
        }
      }

      if (channelInstances.length > 0) {
        this.channelAccessories.set(deviceKey, channelInstances);
        this.startPolling(deviceKey, device);
      }
    }

    if (newAccessories.length > 0) {
      const names = newAccessories.map(acc => `${acc.displayName} (${acc.UUID})`).join(', ');
      this.log.info(`Registering ${newAccessories.length} new accessories: ${names}`);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, newAccessories);
    }

    const configuredSet = new Set(configuredUuids);
    for (const [uuid, accessory] of this.accessoriesByUuid.entries()) {
      if (!configuredSet.has(uuid)) {
        this.log.info('Removing stale accessory', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessoriesByUuid.delete(uuid);
      }
    }
  }

  private normaliseChannels(device: ShellyDeviceConfig): ShellyChannelConfig[] {
    const channels = device.channels?.length
      ? device.channels
      : [{ channel: 0 }];

    return channels.filter(ch => {
      const channelNumber = Number(ch.channel);
      const isValid = Number.isInteger(channelNumber) && channelNumber >= 0 && channelNumber <= 3;
      if (!isValid) {
        this.log.warn(
          `Invalid channel ${ch.channel} for device ${device.id ?? device.host}. Valid range is 0-3.`,
        );
      }

      return isValid;
    }).map(ch => ({
      channel: Number(ch.channel),
      name: ch.name,
    }));
  }

  public startPolling(deviceKey: string, device: ShellyDeviceConfig): void {
    const existing = this.pollTimers.get(deviceKey);
    if (existing) {
      clearTimeout(existing);
    }

    const runPoll = async () => {
      const accessories = this.channelAccessories.get(deviceKey) ?? [];
      const intervalMs = this.pollInterval(device);
      const failuresBefore = this.failureCounts.get(deviceKey) ?? 0;
      let failures = failuresBefore;

      for (const accessory of accessories) {
        try {
          await accessory.refreshFromDevice();
          failures = 0;
        } catch (error) {
          failures += 1;
          if (failures === 1 || failures % 3 === 0) {
            this.log.warn(`Polling failed for ${deviceKey} (channel ${accessory.channelIndex}): ${String(error)}`);
          }
        }
      }

      this.failureCounts.set(deviceKey, failures);
      const backoffMultiplier = failures > 0 ? Math.min(4, failures + 1) : 1;
      const delayMs = Math.min(intervalMs * backoffMultiplier, 30000);

      const timer = setTimeout(runPoll, delayMs);
      timer.unref?.();
      this.pollTimers.set(deviceKey, timer);
    };

    runPoll().catch(error => {
      this.log.error(`Initial polling failed for ${deviceKey}: ${String(error)}`);
    });
  }

  private pollInterval(device: ShellyDeviceConfig): number {
    const seconds = device.pollIntervalSeconds ?? 5;
    const bounded = Math.min(60, Math.max(2, seconds));
    return bounded * 1000;
  }

  private deviceKey(device: ShellyDeviceConfig): string {
    return device.id ?? device.host;
  }

  private uuidSeed(device: ShellyDeviceConfig, channel: ShellyChannelConfig): string {
    return `ShellyRGBW2:${device.id ?? device.host}:ch${channel.channel}`;
  }
}
