# Build configuration

This document summarizes the available build commands for the frontend app, how they differ between local development and release builds, and how to troubleshoot the most common issues.

## Build commands

Run these commands from the frontend directory:

```bash
cd ignition-pay-frontend
```

### Local development

- `npm install` installs dependencies.
- `npm run dev` starts the Next.js development server on port 3000.
- `npm run lint` runs the linter across the app.

### Production and release builds

- `npm run build` runs the semantic version bump step and then creates a production build.
- `npm run version:patch` bumps the app version from `x.y.z` to `x.y.(z+1)`.
- `npm run version:minor` bumps the app version from `x.y.z` to `x.(y+1).0`.
- `npm run version:major` bumps the app version from `x.y.z` to `(x+1).0.0`.
- `npm run test:version` runs the version utility tests.

## Local development vs release build

### Local development

Use local development when you are actively editing UI, hooks, or styles. This mode prioritizes fast iteration, hot reloading, and a convenient local preview.

Typical flow:

```bash
npm install
npm run dev
```

### Release build

Use a release build when you want to verify the production bundle, validate versioning, or prepare for deployment.

Typical flow:

```bash
npm install
npm run build
npm run start
```

The build step also updates the application version in `package.json` before the production bundle is generated.

## Troubleshooting

### `next: not found`

This usually means dependencies have not been installed yet.

```bash
npm install
```

### Build fails after version bumping

If the version script throws an error, confirm the current version in `package.json` follows semantic versioning such as `1.2.3`.

### Port already in use

If port 3000 is already occupied, stop the conflicting process or start the dev server on another port:

```bash
npm run dev -- --port 3001
```

### Stale local state

If the app behaves unexpectedly after switching branches, remove local caches and reinstall dependencies:

```bash
rm -rf node_modules .next
npm install
```

## Versioning notes

The frontend uses semantic versioning in the form `major.minor.patch` and exposes the current version in the settings screen. The build process updates the version automatically before generating a production build.
