# stellar-address-kit (Go)

The Go implementation of the Stellar Address Kit for high-performance deposit routing and address interop.

```bash
go get github.com/Boxkit-Labs/stellar-address-kit/packages/core-go
```

Part of a multi-language suite also available in **[TypeScript](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-ts)** and **[Dart](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/packages/core-dart)**.

---

### 📖 Documentation & Guides
- [Go: Deposit Routing Service Integration](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/go-deposit-routing.mdx)
- [Go: Running the Spec Validator](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/go-spec-validator.mdx)
- [General: Compatibility Reference](https://github.com/Boxkit-Labs/stellar-address-kit/blob/main/docs/guides/compatibility-reference.md)

---

## Quick Start

```go
package main

import (
	"fmt"
	addresskit "github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/address"
	"github.com/Boxkit-Labs/stellar-address-kit/packages/core-go/routing"
)

func main() {
	// Validate and detect address types
	addr := "GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU"
	if addresskit.IsValid(addr) {
		kind := addresskit.Detect(addr)
		fmt.Printf("Address kind: %s\n", kind)
	}

	// Extract routing information from an incoming payment
	result := routing.ExtractRouting(routing.RoutingInput{
		Destination: "MA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU...",
		MemoType:    "none",
	})
	
	fmt.Printf("Routing ID: %s\n", result.RoutingID)
}
```

## Examples

### Complete Payment Listener
For a production-ready example of a background worker that listens for payments on the Stellar network and routes them using this kit, see the [go-payment-listener](../../examples/go-payment-listener) in the root repository.

## Documentation

For integration guides and detailed Go examples, see the [Go Guides](https://github.com/Boxkit-Labs/stellar-address-kit/tree/main/docs/guides).

## License

MIT
