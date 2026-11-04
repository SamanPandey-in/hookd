package api

import (
	"fmt"
	"net/http"
	"time"

	"whook/internal/httpx"
)

// Stream is an authed Server-Sent Events endpoint. It subscribes to the
// endpoint's live events and forwards each as an SSE message. A new webhook
// reaches a connected browser effectively instantly (<1s) because the ingest
// path publishes to the in-memory hub synchronously.
func (a *API) Stream(w http.ResponseWriter, r *http.Request) {
	ep, ok := a.ownedEndpoint(w, r)
	if !ok {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.Error(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable proxy buffering (nginx)
	w.WriteHeader(http.StatusOK)

	ch, unsub := a.Hub.Subscribe(ep.ID)
	defer unsub()

	// Initial comment so the client knows the stream is open.
	fmt.Fprintf(w, ": connected to %s\n\n", ep.ID)
	flusher.Flush()

	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepalive.C:
			// Comment line keeps intermediaries from closing an idle stream.
			fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		case msg, open := <-ch:
			if !open {
				return
			}
			if msg.Event != "" {
				fmt.Fprintf(w, "event: %s\n", msg.Event)
			}
			fmt.Fprintf(w, "data: %s\n\n", msg.Data)
			flusher.Flush()
		}
	}
}
