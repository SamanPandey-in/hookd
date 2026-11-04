package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"whook/internal/store"
)

// freeUID is any user id with no store record — userPlan() treats it as free.
const freeUID int64 = 7

func createEndpointAs(t *testing.T, a *API, uid int64, name string) store.Endpoint {
	t.Helper()
	rec := serveAs(a, uid, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": name}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create endpoint: %d %s", rec.Code, rec.Body.String())
	}
	var ep store.Endpoint
	_ = json.Unmarshal(rec.Body.Bytes(), &ep)
	return ep
}

func TestFreeEndpointCap(t *testing.T) {
	a, _ := newAPI(t)
	// Free users may create up to 2 endpoints.
	createEndpointAs(t, a, freeUID, "one")
	createEndpointAs(t, a, freeUID, "two")
	rec := serveAs(a, freeUID, jsonReq(http.MethodPost, "/api/endpoints", map[string]any{"name": "three"}))
	if rec.Code != http.StatusPaymentRequired {
		t.Fatalf("3rd endpoint for free user must be 402, got %d %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"upgrade":true`)) {
		t.Fatalf("402 must carry upgrade:true, got %s", rec.Body.String())
	}
}

func TestProEndpointCapHigher(t *testing.T) {
	a, st := newAPI(t)
	pu := proUser(t, st)
	for i := 0; i < 3; i++ {
		createEndpointAs(t, a, pu, "ep")
	}
	// Pro allows well beyond the free cap of 2.
	rec := serveAs(a, pu, jsonReq(http.MethodGet, "/api/endpoints", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list: %d", rec.Code)
	}
}

// seedEvent injects an event (with a verify "why") under uid's endpoint.
func seedEvent(t *testing.T, a *API, st *store.Fake, uid int64) (store.Endpoint, string) {
	t.Helper()
	ep := createEndpointAs(t, a, uid, "e")
	ev := &store.Event{
		EndpointID:    ep.ID,
		Method:        "POST",
		RawBody:       []byte(`{"amount":100}`),
		VerifyStatus:  "fail",
		VerifyCause:   "signature_mismatch",
		VerifySummary: "computed v1 != header v1",
		VerifyDetails: map[string]string{"computed": "abc"},
	}
	_ = st.CreateEvent(context.Background(), ev)
	return ep, ev.ID
}

func TestFreeGated402s(t *testing.T) {
	a, st := newAPI(t)
	ep, evID := seedEvent(t, a, st, freeUID)

	cases := []struct {
		name string
		req  *http.Request
	}{
		{"replay", jsonReq(http.MethodPost, "/api/events/"+evID+"/replay", map[string]any{"target_url": "https://example.com"})},
		{"share", jsonReq(http.MethodPost, "/api/events/"+evID+"/share", nil)},
		{"response", jsonReq(http.MethodPut, "/api/endpoints/"+ep.ID+"/response", map[string]any{"status": 500, "body": "x"})},
		{"search", jsonReq(http.MethodGet, "/api/endpoints/"+ep.ID+"/events?q=amount", nil)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := serveAs(a, freeUID, c.req)
			if rec.Code != http.StatusPaymentRequired {
				t.Fatalf("%s for free user must be 402, got %d %s", c.name, rec.Code, rec.Body.String())
			}
			if !bytes.Contains(rec.Body.Bytes(), []byte(`"upgrade":true`)) {
				t.Fatalf("%s 402 must carry upgrade:true", c.name)
			}
		})
	}

	// A basic list (no ?q) stays free.
	rec := serveAs(a, freeUID, jsonReq(http.MethodGet, "/api/endpoints/"+ep.ID+"/events", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("basic list must be free, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestProGatedAllowed(t *testing.T) {
	a, st := newAPI(t)
	pu := proUser(t, st)
	ep, evID := seedEvent(t, a, st, pu)

	// Response rule (Pro) allowed.
	if rec := serveAs(a, pu, jsonReq(http.MethodPut, "/api/endpoints/"+ep.ID+"/response", map[string]any{"status": 500, "body": "x"})); rec.Code != http.StatusOK {
		t.Fatalf("pro response rule: %d %s", rec.Code, rec.Body.String())
	}
	// Share (Pro) allowed.
	if rec := serveAs(a, pu, jsonReq(http.MethodPost, "/api/events/"+evID+"/share", nil)); rec.Code != http.StatusCreated {
		t.Fatalf("pro share: %d %s", rec.Code, rec.Body.String())
	}
	// Text search (Pro) allowed.
	if rec := serveAs(a, pu, jsonReq(http.MethodGet, "/api/endpoints/"+ep.ID+"/events?q=amount", nil)); rec.Code != http.StatusOK {
		t.Fatalf("pro search: %d %s", rec.Code, rec.Body.String())
	}
}

func TestVerifyWhyOmittedForFree(t *testing.T) {
	a, st := newAPI(t)
	freeEP, freeEv := seedEvent(t, a, st, freeUID)
	pu := proUser(t, st)
	proEP, proEv := seedEvent(t, a, st, pu)

	// Free: detail omits cause/summary/details, keeps status.
	rec := serveAs(a, freeUID, jsonReq(http.MethodGet, "/api/events/"+freeEv, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("free detail: %d %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.Bytes()
	if !bytes.Contains(body, []byte(`"verify_status":"fail"`)) {
		t.Fatalf("free detail must keep verify_status, got %s", body)
	}
	if bytes.Contains(body, []byte("verify_cause")) || bytes.Contains(body, []byte("verify_summary")) || bytes.Contains(body, []byte("signature_mismatch")) {
		t.Fatalf("free detail must omit the verify 'why', got %s", body)
	}

	// Free: list also omits the why.
	rec = serveAs(a, freeUID, jsonReq(http.MethodGet, "/api/endpoints/"+freeEP.ID+"/events", nil))
	if bytes.Contains(rec.Body.Bytes(), []byte("verify_cause")) {
		t.Fatalf("free list must omit verify_cause, got %s", rec.Body.String())
	}

	// Pro: detail includes the full why.
	rec = serveAs(a, pu, jsonReq(http.MethodGet, "/api/events/"+proEv, nil))
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"verify_cause":"signature_mismatch"`)) {
		t.Fatalf("pro detail must include verify_cause, got %s", rec.Body.String())
	}

	// Pro: list includes the why.
	rec = serveAs(a, pu, jsonReq(http.MethodGet, "/api/endpoints/"+proEP.ID+"/events", nil))
	if !bytes.Contains(rec.Body.Bytes(), []byte("verify_cause")) {
		t.Fatalf("pro list must include verify_cause, got %s", rec.Body.String())
	}
}
