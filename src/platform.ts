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
  public readonly accessories: PlatformAccessory[] = [];

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
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private discoverDevices(): void {
    for (const device of this.config.devices ?? []) {
      if (!device?.host) {
        this.log.warn('Skipping device without host:', device?.id ?? '<missing id>');
        continue;
      }

      const safeChannels = this.normaliseChannels(device);
      if (safeChannels.length === 0) {
        this.log.warn(`Device ${device.id ?? device.host} has no valid channels (expected 0-3).`);
        continue;
      }

      for (const channel of safeChannels) {
        const channelId = `${device.id ?? device.host}-${channel.channel}`;
        const uuid = this.api.hap.uuid.generate(channelId);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
        const accessoryName = channel.name ?? `${device.id ?? device.host} CH${channel.channel}`;

        if (existingAccessory) {
          existingAccessory.displayName = accessoryName;
          existingAccessory.context.device = device;
          existingAccessory.context.channel = channel;
          this.log.info('Restoring cached accessory', accessoryName);
          new ShellyWhiteChannelAccessory(this, existingAccessory, device, channel);
        } else {
          this.log.info('Registering new accessory', accessoryName);
          const accessory = new this.api.platformAccessory(accessoryName, uuid);
          accessory.context.device = device;
          accessory.context.channel = channel;
          new ShellyWhiteChannelAccessory(this, accessory, device, channel);
          this.accessories.push(accessory);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }

    const configuredUuids = new Set(
      (this.config.devices ?? []).flatMap(device =>
        this.normaliseChannels(device).map(ch => this.api.hap.uuid.generate(`${device.id ?? device.host}-${ch.channel}`))),
    );

    for (const accessory of this.accessories) {
      if (!configuredUuids.has(accessory.UUID)) {
        this.log.info('Removing stale accessory', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
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
}
