# react-address-input

A drop-in React component for Stellar address input with real-time validation, type detection (G/M/C), automatic memo field toggling, BigInt-safe muxed ID decoding, and C-address warning display. Powered by stellar-address-kit.

## Features

- Real-time address validation (G, M, C type detection)
- Debounced input processing
- Muxed address decoding, including BigInt-safe ID extraction
- Automatic memo field toggling based on address type
- Visual type badges and inline warning tooltips
- Comprehensive demo suite covering all edge cases

## Use Cases

- Integrating a seamless address entry field into wallet applications
- Exchange withdrawal/deposit interfaces that prevent user errors
- Decentralized app (DApp) interfaces needing robust contract address validation

## Install

```bash
npm install react-address-input stellar-address-kit
```

## Basic Usage

```tsx
import { AddressInput } from 'react-address-input';

function App() {
  return (
    <AddressInput onResult={(result) => console.log(result)} />
  );
}
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `onResult` | `(result: AddressResult) => void` | Required | Callback fired when validation result changes |
| `showMemoField` | `boolean` | `true` | Toggle automatic memo field display |
| `placeholder` | `string` | `""` | Input placeholder text |
| `className` | `string` | `""` | Additional CSS classes for styling |

## What It Detects

- **G-addresses**: Validates standard ed25519 public keys and prompts for memo.
- **M-addresses**: Safely decodes muxed IDs (including BigInt boundaries) and hides memo field since routing is embedded.
- **C-addresses**: Validates contract addresses and warns about potential routing ambiguity without memo.

## Links

- Main [stellar-address-kit repository](https://github.com/Boxkit-Labs/stellar-address-kit)
