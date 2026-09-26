# Ignition Pay Frontend

The Next.js web application for the Ignition Pay Stellar wallet ecosystem.

## Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5.7
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Icons**: Lucide React
- **UI Primitives**: Base UI React

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
├── app/                    # App Router pages
│   ├── dashboard/          # Main wallet dashboard
│   ├── send/               # Send payment flow
│   ├── receive/            # Receive payment flow
│   ├── history/            # Transaction history
│   ├── anchors/            # Anchor integrations
│   ├── settings/           # User settings
│   └── globals.css         # Global styles and theme variables
├── components/             # Shared React components
│   ├── ui/                 # shadcn/ui primitives
│   └── ...                 # Feature components
├── hooks/                  # Custom React hooks
└── lib/                    # Utilities and constants
```

## Build and release workflow

For build commands, versioning details, and troubleshooting, see [docs/build-configuration.md](docs/build-configuration.md).

## Key Features

- ✨ Dark/light theme with system preference support
- 💼 Multi-asset wallet dashboard
- 💸 Send and receive Stellar assets
- 🏦 Anchor deposit/withdrawal integrations
- 📊 Transaction history
- 🔐 Biometric authentication support
