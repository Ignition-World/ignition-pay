# Development

This directory contains development guides for contributors to the Ignition Pay platform.

## Contents

- [Setup Guide](./setup-guide.md) — Local development environment setup
- [Coding Standards](./coding-standards.md) — Code style, linting, and conventions
- [Testing Guide](./testing-guide.md) — How to run and write tests
- [Contribution Workflow](./contribution-workflow.md) — PR流程 and review guidelines

## Quick Start

```bash
# Install dependencies
cd ignition-pay-frontend && npm install
cd ignition-api && npm install
cd ignition-mobile && flutter pub get

# Set up environment
cp .env.example .env

# Start development servers
cd ignition-pay-frontend && npm run dev
cd ignition-api && npm run start:dev
```
