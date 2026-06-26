# API Reference

This section provides detailed API documentation for all public classes and functions.

## Packages

### @stellar-address-kit/core-ts (TypeScript)
The primary TypeScript package for Stellar address routing extraction and SEP-0023 support.

### core-dart (Dart/Flutter)
Dart-native implementation of address parsing and routing for Flutter apps.

### core-go (Go)
Go implementation for backend services needing Stellar address processing.

## Core APIs

| API | Package | Description |
|-----|---------|-------------|
| extractRouting | core-ts, core-dart, core-go | Extract routing information from Stellar addresses |
| parse | core-ts, core-dart | Parse Stellar addresses into components |

## Quick Example

### TypeScript
```typescript
import { extractRouting } from '@stellar-address-kit/core-ts';
const result = extractRouting({ address: 'GA...' });
console.log(result.address, result.routingId);
```

### Dart
```dart
import 'package:stellar_address_kit/stellar_address_kit.dart';
final result = extractRouting(RoutingInput(address: 'GA...'));
print('${result.address} ${result.routingId}');
```

### Go
```go
import "github.com/Boxkit-Labs/stellar-address-kit/packages/core-go"
result := core.ExtractRouting(core.RoutingInput{Address: "GA..."})
fmt.Println(result.Address, result.RoutingId)
```