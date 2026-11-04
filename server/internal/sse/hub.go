// Package sse is an in-memory publish/subscribe hub for Server-Sent Events,
// keyed by endpoint id. Ingest publishes a captured event; connected browsers
// subscribed to that endpoint receive it immediately (<1s end-to-end is the
// demo centerpiece).
package sse

import (
	"sync"
)

// Message is a single SSE payload: an event name and a JSON data string.
type Message struct {
	Event string
	Data  string
}

// Hub fans out messages to subscribers grouped by endpoint id.
type Hub struct {
	mu   sync.RWMutex
	subs map[string]map[*subscriber]struct{}
}

type subscriber struct {
	ch chan Message
}

// NewHub returns an empty hub.
func NewHub() *Hub {
	return &Hub{subs: map[string]map[*subscriber]struct{}{}}
}

// Subscribe registers interest in endpointID and returns a receive channel plus
// an unsubscribe function the caller must defer. The channel is buffered so a
// momentarily-slow consumer doesn't block the publisher; if it overflows,
// messages for that subscriber are dropped rather than blocking ingest.
func (h *Hub) Subscribe(endpointID string) (<-chan Message, func()) {
	s := &subscriber{ch: make(chan Message, 32)}
	h.mu.Lock()
	if h.subs[endpointID] == nil {
		h.subs[endpointID] = map[*subscriber]struct{}{}
	}
	h.subs[endpointID][s] = struct{}{}
	h.mu.Unlock()

	var once sync.Once
	unsub := func() {
		once.Do(func() {
			h.mu.Lock()
			if set, ok := h.subs[endpointID]; ok {
				delete(set, s)
				if len(set) == 0 {
					delete(h.subs, endpointID)
				}
			}
			h.mu.Unlock()
			close(s.ch)
		})
	}
	return s.ch, unsub
}

// Publish delivers msg to every current subscriber of endpointID. It never
// blocks: a subscriber whose buffer is full misses this message (the browser
// can re-fetch history), which keeps a stalled client from backpressuring the
// public ingest path.
func (h *Hub) Publish(endpointID string, msg Message) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for s := range h.subs[endpointID] {
		select {
		case s.ch <- msg:
		default:
			// drop for this slow subscriber
		}
	}
}

// SubscriberCount reports how many subscribers an endpoint currently has (used
// by tests).
func (h *Hub) SubscriberCount(endpointID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs[endpointID])
}
