# Contributing

Thanks for helping improve `homebridge-shelly-rgbw2`!

## Setup
- Use Node 18.19.x, 20.x, or 22.x (matches `engines`).
- Install dependencies: `npm ci`

## Development loop
- Lint: `npm run lint`
- Build: `npm run build`
- Tests: `npm test` (Vitest unit + contract)

## Guidelines
- Keep changes small and focused; update `plan.md` if behaviour or scope changes.
- Add/adjust tests for new logic (debounce/queue, brightness rules, polling/backoff).
- Avoid logging credentials; keep HTTP timeouts/retries bounded.
- For local install/testing, build and pack: `npm run build && NPM_CONFIG_CACHE=./.npm-cache npm pack`

## Releasing
Follow this checklist for each release (Homebridge verification requires a GitHub Release with notes):
- Bump version in `package.json` and create a tag `vX.Y.Z`.
- Clean/build/test: `npm ci`, `npm run lint`, `npm run build`, `npm test`.
- Verify package contents: `NPM_CONFIG_CACHE=./.npm-cache npm pack --dry-run`.
- Publish to npm with the intended tag (handle 2FA/OTP as needed): `NPM_CONFIG_CACHE=./.npm-cache npm publish --tag <tag>`.
- Push commits and tags: `git push origin main --follow-tags`.
- Create a GitHub Release for the version and paste release notes (required for Homebridge verification: https://github.com/homebridge/homebridge/wiki/verified-Plugins).
- Update README/CHANGELOG/install snippets if versions or tags changed.
