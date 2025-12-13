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
