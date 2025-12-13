import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import type { ShellyChannelConfig, ShellyDeviceConfig, ShellyRGBW2Platform } from '../platform';
import { ShellyRGBW2Client, type ShellyWhiteStatus } from '../shelly/ShellyRGBW2Client';

interface CachedChannelState {
  isOn: boolean;
  brightness: number;
  lastNonZeroBrightness: number;
}

const BRIGHTNESS_DEBOUNCE_MS = 200;

export class ShellyWhiteChannelAccessory {
  private readonly service: Service;
  private readonly state: CachedChannelState;
  private readonly client: ShellyRGBW2Client;
  public readonly channelIndex: number;
  private commandChain: Promise<unknown> = Promise.resolve();
  private brightnessTimer?: NodeJS.Timeout;
  private brightnessPromise?: Promise<void>;
  private brightnessResolve?: () => void;
  private brightnessReject?: (err: unknown) => void;
  private pendingBrightness?: number;
  private pendingWasOn?: boolean;

  constructor(
    private readonly platform: ShellyRGBW2Platform,
    private readonly accessory: PlatformAccessory,
    private readonly device: ShellyDeviceConfig,
    private readonly channel: ShellyChannelConfig,
  ) {
    const { Service, Characteristic } = this.platform.api.hap;
    const accessoryInformation = this.accessory.getService(Service.AccessoryInformation)
      ?? this.accessory.addService(Service.AccessoryInformation);

    accessoryInformation
      .setCharacteristic(Characteristic.Manufacturer, 'Shelly')
      .setCharacteristic(Characteristic.Model, 'RGBW2 (White mode)');

    const displayName = this.channel.name ?? `${this.device.id ?? this.device.host} CH${this.channel.channel}`;
    this.service = this.accessory.getService(Service.Lightbulb)
      ?? this.accessory.addService(Service.Lightbulb, displayName);

    this.service.setCharacteristic(Characteristic.Name, displayName);

    this.state = this.accessory.context.state ?? { isOn: false, brightness: 0, lastNonZeroBrightness: 100 };
    this.accessory.context.state = this.state;

    this.channelIndex = this.channel.channel;

    this.service.getCharacteristic(Characteristic.On)
      .onGet(this.handleGetOn.bind(this))
      .onSet(this.handleSetOn.bind(this));

    this.service.getCharacteristic(Characteristic.Brightness)
      .onGet(this.handleGetBrightness.bind(this))
      .onSet(this.handleSetBrightness.bind(this));

    this.client = new ShellyRGBW2Client({
      host: this.device.host,
      timeoutMs: this.device.requestTimeoutMs,
      username: this.device.username,
      password: this.device.password,
      retries: 1,
    });

    this.refreshFromDevice().catch(error => {
      this.platform.log.warn(`Initial refresh failed for ${displayName}: ${String(error)}`);
    });
  }

  private handleGetOn(): CharacteristicValue {
    return this.state.isOn;
  }

  private handleGetBrightness(): CharacteristicValue {
    return this.state.brightness;
  }

  private async handleSetOn(value: CharacteristicValue): Promise<void> {
    const target = Boolean(value);
    return this.enqueueCommand(async () => {
      if (!target) {
        const status = await this.client.setWhiteOn(this.channel.channel, false, this.device.transitionOffMs);
        this.applyStatus(status, { force: true });
        return;
      }

      const brightnessToApply = this.state.brightness > 0
        ? this.state.brightness
        : this.state.lastNonZeroBrightness || 100;

      const status = await this.client.setWhiteOnWithBrightness(
        this.channel.channel,
        brightnessToApply,
        this.device.transitionOnMs,
      );
      this.applyStatus(status, { force: true });
    });
  }

  private async handleSetBrightness(value: CharacteristicValue): Promise<void> {
    const wasOn = this.state.isOn;
    const brightness = this.clampBrightness(Number(value));
    this.state.brightness = brightness;
    if (brightness > 0) {
      this.state.lastNonZeroBrightness = brightness;
    }
    this.state.isOn = brightness > 0;

    return this.scheduleBrightnessApply(brightness, wasOn);
  }

  private clampBrightness(value: number): number {
    if (Number.isNaN(value)) {
      return 0;
    }

    return Math.min(100, Math.max(0, Math.round(value)));
  }

  private scheduleBrightnessApply(brightness: number, wasOn: boolean): Promise<void> {
    this.pendingBrightness = brightness;
    if (this.pendingWasOn === undefined) {
      this.pendingWasOn = wasOn;
    }

    if (!this.brightnessPromise) {
      this.brightnessPromise = new Promise<void>((resolve, reject) => {
        this.brightnessResolve = resolve;
        this.brightnessReject = reject;
      });
    }

    if (this.brightnessTimer) {
      clearTimeout(this.brightnessTimer);
    }

    this.brightnessTimer = setTimeout(() => {
      const target = this.pendingBrightness ?? this.state.brightness;
      const wasOnAtSchedule = this.pendingWasOn ?? this.state.isOn;
      this.pendingBrightness = undefined;
      this.pendingWasOn = undefined;
      this.brightnessTimer = undefined;

      this.enqueueCommand(async () => {
        if (target === 0) {
          const status = await this.client.setWhiteOn(this.channel.channel, false, this.device.transitionOffMs);
          this.applyStatus(status, { force: true });
        } else if (wasOnAtSchedule) {
          const status = await this.client.setWhiteBrightness(
            this.channel.channel,
            target,
            this.device.transitionOnMs,
          );
          this.applyStatus(status, { force: true });
        } else {
          const status = await this.client.setWhiteOnWithBrightness(
            this.channel.channel,
            target,
            this.device.transitionOnMs,
          );
          this.applyStatus(status, { force: true });
        }
      }).then(() => {
        this.brightnessResolve?.();
      }).catch(error => {
        this.platform.log.error(`Failed to set brightness for ${this.accessory.displayName}: ${String(error)}`);
        this.brightnessReject?.(error);
      }).finally(() => {
        this.brightnessPromise = undefined;
        this.brightnessResolve = undefined;
        this.brightnessReject = undefined;
      });
    }, BRIGHTNESS_DEBOUNCE_MS);

    return this.brightnessPromise;
  }

  public async refreshFromDevice(): Promise<void> {
    return this.enqueueCommand(async () => {
      try {
        const status = await this.client.getWhiteStatus(this.channel.channel);
        this.applyStatus(status);
      } catch (error) {
        this.platform.log.warn(`Refresh failed for ${this.accessory.displayName}: ${String(error)}`);
        throw error;
      }
    });
  }

  private applyStatus(status: ShellyWhiteStatus, options?: { force?: boolean }): void {
    const changedOn = this.state.isOn !== status.isOn;
    const changedBrightness = this.state.brightness !== status.brightness;
    const force = options?.force === true;

    this.state.isOn = status.isOn;
    this.state.brightness = status.brightness;
    if (status.isOn && status.brightness > 0) {
      this.state.lastNonZeroBrightness = status.brightness;
    }
    this.accessory.context.state = this.state;

    const { Characteristic } = this.platform.api.hap;
    if (changedOn || force) {
      this.service.updateCharacteristic(Characteristic.On, this.state.isOn);
    }

    if (changedBrightness || force) {
      this.service.updateCharacteristic(Characteristic.Brightness, this.state.brightness);
    }
  }

  private enqueueCommand<T>(task: () => Promise<T>): Promise<T> {
    const run = this.commandChain.then(() => task());
    this.commandChain = run.catch(() => {});
    return run;
  }
}
