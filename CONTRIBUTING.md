# Contributing

Thanks for taking the time to look at JS-View.

## Getting started

```bash
git clone https://github.com/muxover/js-view
cd js-view
npm install
npx playwright install chromium
cp .env.example .env
npm run dev
```

## Running tests

```bash
npm test
```

The browser tests use Playwright's Chromium, or Chrome or Edge if one is installed, and skip when none is found (they fail in CI). The CLI tests run against `dist/`, so run `npm run build` first. The queue test runs when `REDIS_URL` points at a Redis server.

## Code style

TypeScript is formatted with Prettier and checked with ESLint:

```bash
npm run format
npm run lint
```

## Submitting changes

Open an issue before starting anything substantial so we can agree on the approach. Branch from `main`, keep one change per pull request, and make sure `npm run lint`, `npm run build`, and `npm test` all pass before opening it.

## Reporting bugs

Include the JS-View version, your OS, the URL or request that broke, and the error output.
