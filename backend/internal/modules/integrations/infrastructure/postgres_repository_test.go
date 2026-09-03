package infrastructure

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/yurythx/projeto-sophiia/internal/modules/integrations/domain"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping live integrations repository test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("pgxpool.New: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// Estes testes dependem da linha "example-service" semeada pela migration
// 000041 (que também removeu a antiga "diario-oficial").

func TestPostgresRepository_List_IncludesSeeded(t *testing.T) {
	pool := testPool(t)
	repo := NewPostgresRepository(pool)

	list, err := repo.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}

	found := false
	for _, i := range list {
		if i.Key == "example-service" {
			found = true
		}
	}
	if !found {
		t.Error("expected the seeded example-service integration to be present")
	}
}

func TestPostgresRepository_UpdateStatusTx_ReportsChange(t *testing.T) {
	pool := testPool(t)
	repo := NewPostgresRepository(pool)
	ctx := context.Background()

	// Reseta para uma base conhecida, para que o teste independa da ordem.
	_, err := pool.Exec(ctx, `UPDATE integrations SET status = 'unknown', last_error = NULL WHERE key = 'example-service'`)
	if err != nil {
		t.Fatalf("reset baseline: %v", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	// Sem isto, um t.Fatalf com a tx ainda aberta trava o pool.Close() do
	// Cleanup até o timeout de 10 min do binário de teste. `tx` é
	// reatribuída ao longo do teste; o defer fecha a que estiver aberta no
	// momento da saída (Rollback após Commit/Rollback é no-op).
	defer func() {
		if tx != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	updated, changed, err := repo.UpdateStatusTx(ctx, tx, "example-service", true, nil)
	if err != nil {
		t.Fatalf("UpdateStatusTx: %v", err)
	}
	if !changed {
		t.Error("expected status to change from unknown to online")
	}
	if updated.Status != domain.StatusOnline {
		t.Errorf("Status = %s, want online", updated.Status)
	}
	if updated.LastSuccessAt == nil {
		t.Error("expected LastSuccessAt to be set on success")
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("Commit: %v", err)
	}

	// Mesmo resultado de novo: o status NÃO deve ser reportado como mudado.
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	_, changedAgain, err := repo.UpdateStatusTx(ctx, tx, "example-service", true, nil)
	if err != nil {
		t.Fatalf("UpdateStatusTx (2nd): %v", err)
	}
	if changedAgain {
		t.Error("expected no status change when the outcome repeats")
	}
	_ = tx.Rollback(ctx)

	// Uma falha transiciona online -> offline com um erro registrado.
	tx, err = pool.Begin(ctx)
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	errMsg := "connection timeout"
	updated, changed, err = repo.UpdateStatusTx(ctx, tx, "example-service", false, &errMsg)
	if err != nil {
		t.Fatalf("UpdateStatusTx (failure): %v", err)
	}
	if !changed {
		t.Error("expected status to change from online to offline")
	}
	if updated.Status != domain.StatusOffline {
		t.Errorf("Status = %s, want offline", updated.Status)
	}
	if updated.LastError == nil || *updated.LastError != errMsg {
		t.Errorf("LastError = %v, want %q", updated.LastError, errMsg)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("Commit: %v", err)
	}
}
