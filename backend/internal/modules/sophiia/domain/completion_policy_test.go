package domain_test

import (
	"testing"

	"github.com/yurythx/projeto-sophiia/internal/modules/sophiia/domain"
)

func TestTrainingCompletionPolicy(t *testing.T) {
	policy := domain.NewTrainingCompletionPolicy()

	t.Run("conclusão com 100% atinge approval", func(t *testing.T) {
		pct, ok, err := policy.CalculateProgress(10, 10)
		if err != nil {
			t.Fatalf("erro inesperado: %v", err)
		}
		if pct != 100.0 || !ok {
			t.Errorf("esperado 100%% e concluído=true, obteve %.1f%% e %v", pct, ok)
		}
	})

	t.Run("conclusão com 90% atinge approval", func(t *testing.T) {
		pct, ok, err := policy.CalculateProgress(9, 10)
		if err != nil {
			t.Fatalf("erro inesperado: %v", err)
		}
		if pct != 90.0 || !ok {
			t.Errorf("esperado 90%% e concluído=true, obteve %.1f%% e %v", pct, ok)
		}
	})

	t.Run("conclusão com 80% NÃO atinge approval", func(t *testing.T) {
		pct, ok, err := policy.CalculateProgress(8, 10)
		if err != nil {
			t.Fatalf("erro inesperado: %v", err)
		}
		if pct != 80.0 || ok {
			t.Errorf("esperado 80%% e concluído=false, obteve %.1f%% e %v", pct, ok)
		}
	})

	t.Run("total igual a zero retorna erro", func(t *testing.T) {
		_, _, err := policy.CalculateProgress(0, 0)
		if err == nil {
			t.Errorf("esperava erro para total <= 0, mas obteve nil")
		}
	})
}
