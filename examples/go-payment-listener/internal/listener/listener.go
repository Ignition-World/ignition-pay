package listener

import (
	"context"
	"time"

	"github.com/Boxkit-Labs/stellar-address-kit/examples/go-payment-listener/internal/metrics"
	"github.com/rs/zerolog"
	"github.com/stellar/go/clients/horizonclient"
	"github.com/stellar/go/protocols/horizon/operations"
)

type PaymentListener struct {
	client        *horizonclient.Client
	targetAccount string
	cursor        string
	maxAttempts   int
	baseDelay     time.Duration
	maxDelay      time.Duration
	log           zerolog.Logger
}

func NewPaymentListener(
	client *horizonclient.Client,
	account, cursor string,
	maxAttempts int,
	baseDelay, maxDelay time.Duration,
	log zerolog.Logger,
) *PaymentListener {
	return &PaymentListener{
		client:        client,
		targetAccount: account,
		cursor:        cursor,
		maxAttempts:   maxAttempts,
		baseDelay:     baseDelay,
		maxDelay:      maxDelay,
		log:           log,
	}
}

func (l *PaymentListener) Start(ctx context.Context) error {
	l.log.Info().
		Str("account", l.targetAccount).
		Str("cursor", l.cursor).
		Int("max_attempts", l.maxAttempts).
		Dur("base_delay", l.baseDelay).
		Dur("max_delay", l.maxDelay).
		Msg("starting horizon payment stream")

	var attempt int
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			streamStart := time.Now()
			err := l.stream(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}

				metrics.StreamErrorsTotal.Inc()

				// If the stream was active for a reasonable duration (e.g. 15 seconds),
				// reset the attempt counter since it was a successful connection session.
				if time.Since(streamStart) > 15*time.Second {
					attempt = 0
				}

				attempt++
				if l.maxAttempts > 0 && attempt > l.maxAttempts {
					l.log.Error().
						Err(err).
						Int("attempts", attempt-1).
						Msg("stream error, max retry attempts reached")
					return err
				}

				// Calculate exponential backoff delay: baseDelay * 2^(attempt-1)
				delay := l.baseDelay * time.Duration(1<<(attempt-1))
				if delay > l.maxDelay {
					delay = l.maxDelay
				}

				l.log.Error().
					Err(err).
					Int("attempt", attempt).
					Int("max_attempts", l.maxAttempts).
					Dur("retry_delay", delay).
					Msg("stream error, retrying...")

				timer := time.NewTimer(delay)
				select {
				case <-ctx.Done():
					timer.Stop()
					return ctx.Err()
				case <-timer.C:
				}
			} else {
				// Reset attempts if the stream returns with no error
				attempt = 0
			}
		}
	}
}

func (l *PaymentListener) stream(ctx context.Context) error {
	request := horizonclient.OperationRequest{
		ForAccount:     l.targetAccount,
		Cursor:         l.cursor,
		IncludeFailed:  false,
		Join:           "transactions",
	}

	return l.client.StreamOperations(ctx, request, func(op operations.Operation) {
		payment, ok := op.(operations.Payment)
		if !ok || payment.To != l.targetAccount {
			return
		}

		l.handlePayment(payment)
		l.cursor = payment.PagingToken()
	})
}

func (l *PaymentListener) handlePayment(payment operations.Payment) {
	defer func() {
		if r := recover(); r != nil {
			l.log.Error().
				Interface("recover", r).
				Str("tx_hash", payment.TransactionHash).
				Msg("panic recovered while handling payment")
		}
	}()

	result := ExtractRouting(payment)
	severity := MapResultToSeverity(result)

	event := l.log.With().
		Str("tx_hash", payment.TransactionHash).
		Str("amount", payment.Amount).
		Str("severity", string(severity)).
		Str("source", string(result.RoutingSource)).
		Interface("warnings", result.Warnings).
		Logger()

	// Update Prometheus metrics
	metrics.PaymentsTotal.WithLabelValues(string(severity)).Inc()
	metrics.RoutingSourceTotal.WithLabelValues(string(result.RoutingSource)).Inc()

	switch severity {
	case SeverityError:
		event.Error().
			Bool("alert", true).
			Interface("error", result.DestinationError).
			Msg("unroutable payment detected")
	case SeverityWarn:
		event.Warn().Msg("payment routed with compliance warnings")
	default:
		event.Info().
			Str("routing_id", result.RoutingID.String()).
			Msg("payment successfully routed")
	}
}
