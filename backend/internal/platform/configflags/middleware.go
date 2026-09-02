package configflags

import (
	"log/slog"
	"net/http"

	apperrors "github.com/yurythx/projeto-sophiia/internal/domain/errors"
	"github.com/yurythx/projeto-sophiia/pkg/httputil"
)

// RequireEnabled é um middleware chi que barra o acesso a um grupo de
// rotas quando a feature flag `key` está desligada, respondendo
// 503/FEATURE_DISABLED (mesmo shape de apperrors.FeatureDisabled) — assim
// um módulo inteiro pode ser ligado/desligado em tempo de execução pelo
// painel administrativo, sem reiniciar cmd/api nem cmd/worker.
//
// defaultEnabled decide o comportamento quando a chave nunca foi semeada
// (nenhuma linha em feature_flags): passar true mantém o módulo acessível
// até que um administrador o desligue explicitamente, o mesmo espírito de
// "interruptor de emergência, não opt-in" das flags existentes.
//
// store nil desativa a checagem (rota sempre liberada) — mantém testes de
// transporte que não montam um Store funcionando sem semear flags.
func RequireEnabled(store Store, logger *slog.Logger, key string, defaultEnabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if store == nil {
				next.ServeHTTP(w, r)
				return
			}
			enabled, err := store.IsEnabled(r.Context(), key, defaultEnabled)
			if err != nil {
				httputil.WriteError(w, r, logger, apperrors.Internal(err))
				return
			}
			if !enabled {
				httputil.WriteError(w, r, logger, apperrors.FeatureDisabled("o módulo '"+key+"' está desativado"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
