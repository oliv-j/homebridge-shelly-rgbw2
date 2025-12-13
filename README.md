# homebridge-shelly-rgbw2

I built this plugin to solve the buggy experience I was having with Shelly RGBW2 devices in white mode. I would experience delays, timeouts, poor transition times and the home app couldn't poll the devices to find their current brightness setting. 

This is built for Homebridge v2 and is a dynamic platform plugin for the Shelly RGBW2 (Gen1) in **white mode**. Each white channel (0–3) is exposed as a HomeKit Lightbulb with On and Brightness characteristics.

Repo folder name (if cloned locally): `homebridge-shelly-rgbw2`.

## Status / Dev Progress
Phases 1–6 complete: dynamic platform, Shelly HTTP client with timeouts/retries/parsing, per-channel accessories (queue + debounce + lastNonZeroBrightness + combined on+brightness), polling with backoff and change-only updates, and stable UUID seeds for cached accessory re-registration. Currently in field testing and hardening before wider rollout.

> **Early development**: this plugin is just out of early testing. Expect to find some bugs and breaking changes; it might be wise to backup your homebridge config before installing.

## Homebridge 2.0 beta note
Peer/engine ranges include `^2.0.0-beta.0`, so install works on Homebridge 2.0 betas without `--legacy-peer-deps`.

## Repo structure (key files)
Key files/folders only (excluding generated/hidden items); update if layout changes.

```
.
├─ .github/workflows/
│  └─ ci.yml
├─ src/
│  ├─ index.ts
│  ├─ platform.ts
│  ├─ settings.ts
│  ├─ shelly/
│  └─ platformAccessory/
├─ test/
│  ├─ contract/
│  └─ unit/
├─ CHANGELOG.md
├─ CONTRIBUTING.md
├─ config.schema.json
├─ package.json
└─ homebridge-shelly-rgbw2-0.1.3-beta.1.tgz
```

## Local install (no npm publish)
Build and pack:
```bash
npm run build
NPM_CONFIG_CACHE=./.npm-cache npm pack
```

On your Homebridge box (hb-service):
```bash
sudo hb-service stop
sudo /opt/homebridge/bin/npm install -g /path/to/homebridge-shelly-rgbw2-0.1.3-beta.1.tgz --no-audit --no-fund
sudo hb-service start
```

## Troubleshooting “already bridged” / duplicate accessories
- Make sure each device has a stable `id` in config.
- The plugin now de-dupes cached accessories and uses a stable UUID seed: `ShellyRGBW2:<device-id-or-host>:ch<channel>`.
- If duplicates persist, clear cached accessories for this plugin and restart Homebridge; then restart a couple of times to confirm UUID counts stay at 1.

## Local validation (Shelly endpoints)
Before installing the plugin, confirm the Shelly behaves as expected (replace IP/channel as needed):

```bash
curl -s "http://<device-ip>/white/0" | python3 -m json.tool
curl -s "http://<device-ip>/white/0?turn=on&brightness=20" | python3 -m json.tool
curl -s "http://<device-ip>/white/0?turn=off" | python3 -m json.tool
```

## Installation

### Option A: Install using homebridge-shelly-rgbw2-0.1.3-beta.1.tgz
Copy the tgz to your homebridge box and then run:

```bash
sudo hb-service stop
cd /var/lib/homebridge
#uninstall any previously installed version version first (optional)
sudo -u homebridge env PATH=/opt/homebridge/bin:$PATH /opt/homebridge/bin/npm uninstall homebridge-shelly-rgbw2 --no-audit --no-fund
sudo -u homebridge env PATH=/opt/homebridge/bin:$PATH /opt/homebridge/bin/npm install --no-audit --no-fund /home/<USER>/homebridge-shelly-rgbw2-0.1.3-beta.1.tgz
sudo hb-service start
```

### Option B: (Easiest) Install from a local `.tgz` (recommended during development)
This is the safest way to iterate without publishing to npm.

On the Homebridge box:

1) Build and pack:
```bash
cd .../homebridge-shelly-rgbw2
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
sudo hb-service stop
cd /var/lib/homebridge
sudo -u homebridge env PATH=/opt/homebridge/bin:$PATH /opt/homebridge/bin/npm uninstall homebridge-shelly-rgbw2 --no-audit --no-fund
sudo -u homebridge env PATH=/opt/homebridge/bin:$PATH /opt/homebridge/bin/npm install --no-audit --no-fund /home/USER/homebridge-shelly-rgbw2-0.1.3-beta.1.tgz
sudo hb-service start
```

4) Start Homebridge:
```bash
sudo hb-service start
```

### Option C: `npm link` a working copy (fast iteration)
Useful for rapid dev, but easier to break if paths change.

```bash
sudo hb-service stop
sudo /opt/homebridge/bin/npm link /path/to/homebridge-shelly-rgbw2
sudo hb-service start
```

### Option D: Install from npm (once published)
If/when published to npm, install globally:

```bash
npm install -g homebridge-shelly-rgbw2@beta
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
      "id": "ceiling-rgbw2-shelly-1",
      "host": "<device-ip>",
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


## Troubleshooting

### The plugin installs, but Homebridge does not load it
1) Confirm you installed using the hb-service Node/npm, not the system npm:
```bash
/opt/homebridge/bin/node -v
/opt/homebridge/bin/npm -v
```

2) Confirm the plugin is installed globally (hb-service environment):
```bash
sudo /opt/homebridge/bin/npm ls -g --depth=0 | grep -i shelly
```

3) Restart Homebridge and check logs:
```bash
sudo hb-service restart
```
Then open Homebridge UI → Logs and look for `homebridge-shelly-rgbw2`.

### Plugin appears in UI, but no accessories show up
- Check the platform name matches exactly:
  - config uses `"platform": "ShellyRGBW2"`
- Confirm the Shelly host is reachable from the Homebridge box:
```bash
curl -s "http://<device-ip>/white/0" | python3 -m json.tool
```
- If you configured channels that are not 0–3, they will be ignored/errored by design.

### “Not Responding” or incorrect state in the Home app
- Verify Shelly responds quickly and consistently:
```bash
for i in $(seq 1 10); do
curl -s -o /dev/null -w "total=%{time_total}s\n" "http://<device-ip>/white/0"
done
```
- Temporarily increase logging (if supported by the plugin build) and check for timeouts/retries.
- Ensure your network is stable (Wi‑Fi dropouts can show up as state drift).

## Contributing
See `CONTRIBUTING.md` for the development workflow (lint → build → test) and guidelines.

## License
GPL-3.0-only. See `LICENSE` for details.

### I used `npm link` and now things are weird
- `npm link` is convenient but can leave stale links if you move folders.
- Remove the link and reinstall via `.tgz`:
```bash
sudo hb-service stop
sudo /opt/homebridge/bin/npm uninstall -g homebridge-shelly-rgbw2 --no-audit --no-fund
sudo /opt/homebridge/bin/npm install -g /path/to/homebridge-shelly-rgbw2-0.1.3-beta.1.tgz --no-audit --no-fund
sudo hb-service start
```

### Permissions / EACCES errors during install
- If you see `EACCES` or permission errors, double-check you are using:
  - `/opt/homebridge/bin/npm`
  - `sudo` for global installs
- Also ensure you are not mixing installs between system node and hb-service node.
