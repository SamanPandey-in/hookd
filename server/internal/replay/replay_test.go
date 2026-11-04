package replay

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"whook/internal/store"
	"whook/internal/verify"
)

// loopbackEngine returns an engine whose guard permits loopback so we can hit a
// local httptest server (production never allows this).
func loopbackEngine() *Engine {
	e := NewEngine(5*time.Second, 64<<10)
	e.guard.allowPrivate = true
	return e
}

func sampleEvent() *store.Event {
	return &store.Event{
		ID:     "ev1",
		Method: http.MethodPost,
		Headers: []store.HeaderPair{
			{Name: "Content-Type", Value: "application/json"},
			{Name: "X-Original-Sig", Value: "orig-sig-value"},
			{Name: "Host", Value: "should-be-stripped.example"},
		},
		RawBody: []byte(`{"hello":"world"}`),
	}
}

func TestReplayForwardsOriginal(t *testing.T) {
	var gotBody []byte
	var gotSig, gotHost string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotBody, _ = io.ReadAll(r.Body)
		gotSig = r.Header.Get("X-Original-Sig")
		gotHost = r.Host
		w.WriteHeader(202)
		_, _ = io.WriteString(w, "accepted")
	}))
	defer srv.Close()

	e := loopbackEngine()
	attempt, err := e.Replay(context.Background(), Request{
		Event: sampleEvent(), TargetURL: srv.URL, Resign: false,
	})
	if err != nil {
		t.Fatalf("replay: %v", err)
	}
	if string(gotBody) != `{"hello":"world"}` {
		t.Errorf("body not forwarded byte-exact: %q", gotBody)
	}
	if gotSig != "orig-sig-value" {
		t.Errorf("original signature header not forwarded: %q", gotSig)
	}
	if gotHost == "should-be-stripped.example" {
		t.Error("captured Host header must not override the target host")
	}
	if attempt.ResponseStatus != 202 || attempt.ResponseBody != "accepted" {
		t.Errorf("response not recorded: status=%d body=%q", attempt.ResponseStatus, attempt.ResponseBody)
	}
	if attempt.Resigned {
		t.Error("attempt should not be marked resigned")
	}
}

// fakeSigner lets us test re-sign wiring without the concrete providers (which
// another agent fills in). It is registered against a test-only provider.
type fakeSigner struct{ provider verify.Provider }

func (f fakeSigner) Provider() verify.Provider { return f.provider }
func (f fakeSigner) Sign(in verify.SignInput) verify.SignResult {
	return verify.SignResult{Headers: map[string]string{
		"X-Original-Sig": "FRESH-" + string(in.Body),
		"X-Resign-Ts":    "1700000000",
	}}
}

func TestReplayReSignReplacesSignature(t *testing.T) {
	const testProvider verify.Provider = "test_resign_provider"
	verify.RegisterSigner(fakeSigner{provider: testProvider})

	var gotSig, gotTs string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSig = r.Header.Get("X-Original-Sig")
		gotTs = r.Header.Get("X-Resign-Ts")
		w.WriteHeader(200)
	}))
	defer srv.Close()

	e := loopbackEngine()
	attempt, err := e.Replay(context.Background(), Request{
		Event: sampleEvent(), TargetURL: srv.URL, Resign: true,
		Provider: testProvider, Secret: "whsec_x",
	})
	if err != nil {
		t.Fatalf("replay re-sign: %v", err)
	}
	if gotSig != "FRESH-"+`{"hello":"world"}` {
		t.Errorf("re-sign did not replace signature header: %q", gotSig)
	}
	if gotTs != "1700000000" {
		t.Errorf("re-sign did not add fresh timestamp header: %q", gotTs)
	}
	if !attempt.Resigned {
		t.Error("attempt should be marked resigned")
	}
}

func TestReplayReSignWithoutSecretErrors(t *testing.T) {
	e := loopbackEngine()
	_, err := e.Replay(context.Background(), Request{
		Event: sampleEvent(), TargetURL: "https://example.com", Resign: true, Provider: "stripe", Secret: "",
	})
	if err == nil {
		t.Fatal("re-sign without a secret should error")
	}
}

func TestReplayBlockedTargetRecordsError(t *testing.T) {
	e := NewEngine(2*time.Second, 1024) // real guard
	attempt, err := e.Replay(context.Background(), Request{
		Event: sampleEvent(), TargetURL: "http://169.254.169.254/latest/meta-data/", Resign: false,
	})
	if err == nil {
		t.Fatal("replay to metadata IP should be blocked")
	}
	if attempt == nil || attempt.Error == "" {
		t.Fatal("blocked attempt must carry an error for persistence")
	}
}
