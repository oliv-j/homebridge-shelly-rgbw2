import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';
import type { ShellyChannelConfig, ShellyDeviceConfig, ShellyRGBW2Platform } from '../platform';

interface CachedChannelState {
  isOn: boolean;
  brightness: number;
}

export class ShellyWhiteChannelAccessory {
  private readonly service: Service;
  private readonly state: CachedChannelState;

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

    this.state = this.accessory.context.state ?? { isOn: false, brightness: 0 };
    this.accessory.context.state = this.state;

    this.service.getCharacteristic(Characteristic.On)
      .onGet(this.handleGetOn.bind(this))
      .onSet(this.handleSetOn.bind(this));

    this.service.getCharacteristic(Characteristic.Brightness)
      .onGet(this.handleGetBrightness.bind(this))
      .onSet(this.handleSetBrightness.bind(this));
  }

  private handleGetOn(): CharacteristicValue {
    return this.state.isOn;
  }

  private handleGetBrightness(): CharacteristicValue {
    return this.state.brightness;
  }

  private async handleSetOn(value: CharacteristicValue): Promise<void> {
    const target = Boolean(value);
    this.state.isOn = target;
    if (!target) {
      this.state.brightness = 0;
    } else if (this.state.brightness === 0) {
      this.state.brightness = 100;
    }

    this.platform.log.info(
      `[placeholder] Set On=${target} for ${this.accessory.displayName} (channel ${this.channel.channel})`,
    );
  }

  private async handleSetBrightness(value: CharacteristicValue): Promise<void> {
    const brightness = this.clampBrightness(Number(value));
    this.state.brightness = brightness;
    this.state.isOn = brightness > 0;

    this.platform.log.info(
      `[placeholder] Set Brightness=${brightness} for ${this.accessory.displayName} (channel ${this.channel.channel})`,
    );
  }

  private clampBrightness(value: number): number {
    if (Number.isNaN(value)) {
      return 0;
    }

    return Math.min(100, Math.max(0, Math.round(value)));
  }
}
