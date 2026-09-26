package listener

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stellar/go/clients/horizonclient"
	"github.com/stretchr/testify/assert"
)

func TestPaymentListener_Retries(t *testing.T) {
	var mu sync.Mutex
	connections := 0

	// Set up a mock SSE server that returns an error immediately or drops the connection
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		connections++
		mu.Unlock()

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		// Just close or write some junk to force an error in StreamOperations
		_, _ = w.Write([]byte("invalid event stream payload"))
	}))
	defer server.Close()

	client := &horizonclient.Client{
		HorizonURL: server.URL,
	}

	logger := zerolog.Nop()
	// Let's create a listener with maxAttempts = 3, baseDelay = 1ms, maxDelay = 5ms
	l := NewPaymentListener(
		client,
		"GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU",
		"now",
		3,
		1*time.Millisecond,
		5*time.Millisecond,
		logger,
	)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := l.Start(ctx)
	assert.Error(t, err)

	mu.Lock()
	defer mu.Unlock()
	// Since maxAttempts is 3, it should connect once, then retry 3 times. Total connections = 4
	assert.Equal(t, 4, connections)
}

func TestPaymentListener_ContextCancel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		// block indefinitely
		select {
		case <-r.Context().Done():
		}
	}))
	defer server.Close()

	client := &horizonclient.Client{
		HorizonURL: server.URL,
	}

	logger := zerolog.Nop()
	l := NewPaymentListener(
		client,
		"GA7QYNF7SOWQ3GLR2B6RS22TBGZAOR6KLYH4PA5ZAM73A3H4K2HZZSQU",
		"now",
		3,
		1*time.Millisecond,
		5*time.Millisecond,
		logger,
	)

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	err := l.Start(ctx)
	assert.Equal(t, context.Canceled, err)
}
