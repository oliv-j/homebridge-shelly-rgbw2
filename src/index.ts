import type { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { ShellyRGBW2Platform } from './platform';

export = (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, ShellyRGBW2Platform);
};
