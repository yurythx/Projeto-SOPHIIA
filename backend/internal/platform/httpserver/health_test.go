package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealthHandler_AlwaysOK(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/health", nil)
	HealthHandler().ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestReadyHandler_AllChecksPass(t *testing.T) {
	checks := []Check{
		{Name: "postgres", Fn: func(ctx context.Context) error { return nil }},
		{Name: "rabbitmq", Fn: func(ctx context.Context) error { return nil }},
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ready", nil)
	ReadyHandler(checks, time.Second).ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestReadyHandler_OneCheckFails(t *testing.T) {
	checks := []Check{
		{Name: "postgres", Fn: func(ctx context.Context) error { return nil }},
		{Name: "rabbitmq", Fn: func(ctx context.Context) error { return errors.New("connection refused") }},
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ready", nil)
	ReadyHandler(checks, time.Second).ServeHTTP(rec, req)

	if rec.Code != 503 {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestReadyHandler_NoChecksIsReady(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ready", nil)
	ReadyHandler(nil, time.Second).ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

// monitoringBody decodifica o envelope { data: {...} } que WriteOK produz.
func monitoringBody(t *testing.T, body []byte) systemHealth {
	t.Helper()
	var env struct {
		Data systemHealth `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("resposta não é o envelope esperado: %v — corpo: %s", err, body)
	}
	return env.Data
}

func TestMonitoringHandler_HealthyReportsEveryServiceOK(t *testing.T) {
	checks := []Check{
		{Name: "postgres", Fn: func(ctx context.Context) error { return nil }},
		{Name: "rabbitmq", Fn: func(ctx context.Context) error { return nil }},
	}
	rec := httptest.NewRecorder()
	MonitoringHandler(checks, time.Second, "v1.2.3").ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/monitoring/health", nil))

	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200 (é relatório, nunca probe)", rec.Code)
	}
	got := monitoringBody(t, rec.Body.Bytes())
	if got.Status != "healthy" {
		t.Errorf("status = %q, want healthy", got.Status)
	}
	if got.Version != "v1.2.3" {
		t.Errorf("version = %q, want v1.2.3", got.Version)
	}
	if got.Timestamp == "" {
		t.Error("timestamp vazio")
	}
	for _, name := range []string{"postgres", "rabbitmq"} {
		if svc, ok := got.Services[name]; !ok || svc.Status != "ok" {
			t.Errorf("services[%q] = %+v, want status ok", name, svc)
		}
	}
}

func TestMonitoringHandler_DegradedButStill200(t *testing.T) {
	checks := []Check{
		{Name: "postgres", Fn: func(ctx context.Context) error { return nil }},
		{Name: "rabbitmq", Fn: func(ctx context.Context) error { return errors.New("connection refused") }},
	}
	rec := httptest.NewRecorder()
	MonitoringHandler(checks, time.Second, "").ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/monitoring/health", nil))

	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200 mesmo com dependência fora do ar", rec.Code)
	}
	got := monitoringBody(t, rec.Body.Bytes())
	if got.Status != "degraded" {
		t.Errorf("status = %q, want degraded", got.Status)
	}
	if got.Services["rabbitmq"].Status != "unavailable" {
		t.Errorf("services[rabbitmq].status = %q, want unavailable", got.Services["rabbitmq"].Status)
	}
	if got.Services["postgres"].Status != "ok" {
		t.Errorf("services[postgres].status = %q, want ok", got.Services["postgres"].Status)
	}
}
