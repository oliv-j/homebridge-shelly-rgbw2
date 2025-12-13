# homebridge-shelly-rgbw2

Homebridge v2-ready dynamic platform plugin for the Shelly RGBW2 (Gen1) in **white mode**. Each white channel (0–3) is exposed as a HomeKit Lightbulb with On and Brightness characteristics.

Repo folder name (if cloned locally): `shelly_rgbw2_homebridge`.

## Status
This is the initial scaffold following the project plan. Accessory wiring and Shelly HTTP calls are placeholders for now; upcoming phases will add the Shelly client, polling, and robust state handling.

## Local validation (Shelly endpoints)
Before installing the plugin, confirm the Shelly behaves as expected (replace IP/channel as needed):

```bash
curl -s "http://10.0.0.54/white/0" | python3 -m json.tool
curl -s "http://10.0.0.54/white/0?turn=on&brightness=20" | python3 -m json.tool
curl -s "http://10.0.0.54/white/0?turn=off" | python3 -m json.tool
```

## Installation

### Option A: Install from a local `.tgz` (recommended during development)
This is the safest way to iterate without publishing to npm.

On the Homebridge box:

1) Build and pack:
```bash
cd /path/to/shelly_rgbw2_homebridge
npm ci
npm run build
npm pack
```

2) Stop Homebridge:
```bash
sudo hb-service stop
```

3) Install using the **hb-service managed npm**:
```bash
sudo /opt/homebridge/bin/npm install -g ./homebridge-shelly-rgbw2-0.1.0.tgz --no-audit --no-fund
```

4) Start Homebridge:
```bash
sudo hb-service start
```

### Option B: `npm link` a working copy (fast iteration)
Useful for rapid dev, but easier to break if paths change.

```bash
sudo hb-service stop
sudo /opt/homebridge/bin/npm link /path/to/shelly_rgbw2_homebridge
sudo hb-service start
```

### Option C: Install from npm (once published)
If/when published to npm, install globally:

```bash
npm install -g homebridge-shelly-rgbw2
```

> Note: on hb-service installs, prefer using `/opt/homebridge/bin/npm` to avoid permission and path mismatches.

## Example config
Add the platform block to `config.json` (or via Homebridge UI → Config):

```json
{
  "platform": "ShellyRGBW2",
  "name": "Shelly RGBW2",
  "devices": [
    {
      "id": "ceiling-shelly",
      "host": "10.0.0.54",
      "channels": [
        { "channel": 0, "name": "Ceiling 1" },
        { "channel": 1, "name": "Ceiling 2" }
      ],
      "pollIntervalSeconds": 5,
      "requestTimeoutMs": 2500,
      "transitionOnMs": 300,
      "transitionOffMs": 600
    }
  ]
}
```

Restart Homebridge after saving config:
```bash
sudo hb-service restart
```

## Development
- `npm ci`
- `npm run lint`
- `npm run build`
- `npm test`

See `plan.md` for the full scope, test expectations, and HomeKit behaviour specification.
