package configflags

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

var testLogger = slog.New(slog.NewTextHandler(io.Discard, nil))

type fakeStore struct {
	enabled bool
	err     error
	gotKey  string
	gotDef  bool
}

func (f *fakeStore) IsEnabled(_ context.Context, key string, def bool) (bool, error) {
	f.gotKey, f.gotDef = key, def
	if f.err != nil {
		return false, f.err
	}
	return f.enabled, nil
}
func (f *fakeStore) List(context.Context) ([]Flag, error) { return nil, nil }
func (f *fakeStore) Set(context.Context, string, bool, string) (Flag, error) {
	return Flag{}, nil
}

func doReq(t *testing.T, h http.Handler) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))
	return rec
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })
}

func TestRequireEnabled_PassesWhenFlagOn(t *testing.T) {
	store := &fakeStore{enabled: true}
	h := RequireEnabled(store, testLogger, "module_sophiia_enabled", true)(okHandler())
	if got := doReq(t, h).Code; got != http.StatusTeapot {
		t.Fatalf("esperava passar para o handler (418), obteve %d", got)
	}
	if store.gotKey != "module_sophiia_enabled" || store.gotDef != true {
		t.Fatalf("chave/def repassadas erradas: %q %v", store.gotKey, store.gotDef)
	}
}

func TestRequireEnabled_BlocksWhenFlagOff(t *testing.T) {
	h := RequireEnabled(&fakeStore{enabled: false}, testLogger, "module_sophiia_enabled", true)(okHandler())
	if got := doReq(t, h).Code; got != http.StatusServiceUnavailable {
		t.Fatalf("esperava 503 com a flag desligada, obteve %d", got)
	}
}

func TestRequireEnabled_StoreErrorIs500(t *testing.T) {
	h := RequireEnabled(&fakeStore{err: errors.New("boom")}, testLogger, "k", true)(okHandler())
	if got := doReq(t, h).Code; got != http.StatusInternalServerError {
		t.Fatalf("esperava 500 em erro de store, obteve %d", got)
	}
}

func TestRequireEnabled_NilStoreIsPassthrough(t *testing.T) {
	h := RequireEnabled(nil, testLogger, "k", false)(okHandler())
	if got := doReq(t, h).Code; got != http.StatusTeapot {
		t.Fatalf("store nil deveria liberar a rota, obteve %d", got)
	}
}
