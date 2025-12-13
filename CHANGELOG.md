# Changelog

## 0.1.3 - Unreleased
- Homebridge v2-ready dynamic platform for Shelly RGBW2 (white mode), one Lightbulb per channel.
- Shelly HTTP client with timeout/retry/parsing; per-channel queue + debounced brightness + lastNonZeroBrightness; combined on+brightness support.
- Polling with backoff and change-only characteristic updates; stable UUID seeds to avoid duplicate cached accessories.
- Vitest unit + contract tests; Homebridge 2.0 beta peer/engine ranges; install via local `.tgz` pack.

## 0.1.0 - 0.1.2
- Initial scaffold, client, accessories, polling, and hardening leading up to the 0.1.3 feature set.
