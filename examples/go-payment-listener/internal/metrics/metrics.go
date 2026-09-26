package metrics

import (
	"fmt"
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	PaymentsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "stellar_payments_total",
			Help: "Total number of processed payments by severity.",
		},
		[]string{"severity"},
	)

	RoutingSourceTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "stellar_routing_source_total",
			Help: "Total number of payments by routing source.",
		},
		[]string{"source"},
	)

	StreamErrorsTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "stellar_stream_errors_total",
			Help: "Total number of connection or stream errors encountered.",
		},
	)
)

func Register() {
	prometheus.MustRegister(PaymentsTotal)
	prometheus.MustRegister(RoutingSourceTotal)
	prometheus.MustRegister(StreamErrorsTotal)
}

func Serve(port int) error {
	http.Handle("/metrics", promhttp.Handler())
	return http.ListenAndServe(fmt.Sprintf(":%d", port), nil)
}

