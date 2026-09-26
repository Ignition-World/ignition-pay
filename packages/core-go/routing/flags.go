package routing

// RoutingFlags controls optional routing behaviour on a per-call basis.
// All flags default to false (the stable production path).
type RoutingFlags struct {
	// ExperimentalRouting enables the experimental multi-chain routing path.
	// When false (the default) the stable memo-based routing logic is used.
	// When true the experimental path is invoked instead.
	ExperimentalRouting bool `json:"experimentalRouting,omitempty"`
}

// DefaultRoutingFlags returns a RoutingFlags value with all flags set to
// their default (stable) values.
func DefaultRoutingFlags() RoutingFlags {
	return RoutingFlags{
		ExperimentalRouting: false,
	}
}

// ResolveFlags merges the caller-supplied flags with the defaults.
// A nil pointer is treated as "no overrides" — defaults are returned as-is.
func ResolveFlags(f *RoutingFlags) RoutingFlags {
	if f == nil {
		return DefaultRoutingFlags()
	}
	return *f
}
