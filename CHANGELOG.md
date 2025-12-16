# Changelog

## 0.1.4 - Released
- Repo and documentation tidy-up ahead of Homebridge verification: moved contributing to .github, clarified release checklist (GitHub Release required), tightened CI Node matrix (18.x/20.x), and cleaned packaging docs/ignore rules.

## 0.1.3 - Released
- Homebridge v2-ready dynamic platform for Shelly RGBW2 (white mode), one Lightbulb per channel.
- Shelly HTTP client with timeout/retry/parsing; per-channel queue + debounced brightness + lastNonZeroBrightness; combined on+brightness support.
- Polling with backoff and change-only characteristic updates; stable UUID seeds to avoid duplicate cached accessories.
- Vitest unit + contract tests; Homebridge 2.0 beta peer/engine ranges; install via local `.tgz` pack.

## 0.1.0 - 0.1.2
- Initial scaffold, client, accessories, polling, and hardening leading up to the 0.1.3 feature set.
