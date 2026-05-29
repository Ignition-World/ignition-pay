# Conformance Test Vectors

A language-agnostic test suite that verifies stellar-address-kit produces identical results across TypeScript, Go, Dart, and Rust for every address type, edge case, and warning condition.

## Features

- Extensive JSON test vectors covering 50+ diverse address scenarios
- Comprehensive tests across G-addresses, M-addresses, and C-addresses including boundaries
- Evaluates valid scenarios alongside invalid/malformed inputs
- Language-agnostic JSON schema validation
- Native runner scripts for TypeScript, Go, and Dart

## Use Cases

- Verifying 100% interoperability of `stellar-address-kit` ports across different programming languages
- Identifying implementation regressions in address parsing and routing logic
- Acting as a centralized ground-truth source for Stellar address decoding behavior

## Running

### TypeScript
```bash
npx tsx ts/run.ts
```

### Go
```bash
cd go && go test -v ./...
```

### Dart
```bash
cd dart && dart run bin/run.dart
```

## Adding Vectors

To add a new vector, edit the `vectors.json` file. Each vector should conform to the schema defined in `schema.json`, providing a unique ID, a description, the input string, and the expected result object. By extending the vectors list, you automatically run tests against all target languages.

## Links

- Main [stellar-address-kit repository](https://github.com/Boxkit-Labs/stellar-address-kit)
