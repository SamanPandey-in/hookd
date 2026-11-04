package sse

import (
	"testing"
	"time"
)

func TestPublishReachesSubscriber(t *testing.T) {
	h := NewHub()
	ch, unsub := h.Subscribe("ep1")
	defer unsub()

	start := time.Now()
	h.Publish("ep1", Message{Event: "event", Data: `{"id":"x"}`})

	select {
	case msg := <-ch:
		if msg.Data != `{"id":"x"}` {
			t.Fatalf("wrong data: %q", msg.Data)
		}
		if time.Since(start) > time.Second {
			t.Fatal("delivery took longer than 1s")
		}
	case <-time.After(time.Second):
		t.Fatal("subscriber did not receive published message within 1s")
	}
}

func TestPublishIsEndpointScoped(t *testing.T) {
	h := NewHub()
	ch1, unsub1 := h.Subscribe("ep1")
	defer unsub1()
	ch2, unsub2 := h.Subscribe("ep2")
	defer unsub2()

	h.Publish("ep1", Message{Data: "a"})

	select {
	case <-ch1:
	case <-time.After(time.Second):
		t.Fatal("ep1 subscriber missed its message")
	}
	select {
	case <-ch2:
		t.Fatal("ep2 subscriber should not receive ep1 messages")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestUnsubscribeStopsDelivery(t *testing.T) {
	h := NewHub()
	ch, unsub := h.Subscribe("ep1")
	if h.SubscriberCount("ep1") != 1 {
		t.Fatal("expected 1 subscriber")
	}
	unsub()
	if h.SubscriberCount("ep1") != 0 {
		t.Fatal("expected 0 subscribers after unsubscribe")
	}
	// Channel should be closed.
	if _, open := <-ch; open {
		t.Fatal("channel should be closed after unsubscribe")
	}
	// Publishing after unsubscribe must not panic.
	h.Publish("ep1", Message{Data: "x"})
}

func TestPublishDoesNotBlockOnSlowSubscriber(t *testing.T) {
	h := NewHub()
	_, unsub := h.Subscribe("ep1")
	defer unsub()
	// Overflow the buffer without draining; Publish must never block.
	done := make(chan struct{})
	go func() {
		for i := 0; i < 1000; i++ {
			h.Publish("ep1", Message{Data: "x"})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Publish blocked on a slow subscriber")
	}
}
