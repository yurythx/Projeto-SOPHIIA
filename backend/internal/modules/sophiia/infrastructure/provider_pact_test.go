//go:build pact

package infrastructure_test

import (
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/pact-foundation/pact-go/v2/provider"
	"github.com/pact-foundation/pact-go/v2/utils"
	"github.com/yurythx/projeto-sophiia/internal/app"
)

// Este teste só roda se a tag "pact" for passada: go test -tags=pact ./...
func TestProviderPact(t *testing.T) {
	// Inicia um servidor temporário mockando a API real
	port, _ := utils.GetFreePort()

	// Mock do container de dependências para rodar a API em memória
	// Aqui você pode injetar dependências falsas (banco de dados em memória)
	// para que o provedor responda aos estados do Pact.
	deps, err := app.NewDependencies(nil, "api-pact-test")
	if err != nil {
		t.Fatalf("falha ao iniciar dependências mockadas: %v", err)
	}
	defer deps.Close()

	router := app.NewRouter(deps)

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		t.Fatal(err)
	}

	go func() {
		_ = http.Serve(listener, router)
	}()

	// Garante que o servidor subiu
	time.Sleep(1 * time.Second)

	// Configura o verificador do Pact
	verifier := provider.NewVerifier()

	// Valida os contratos gerados pelo frontend
	err = verifier.VerifyProvider(t, provider.VerifyRequest{
		ProviderBaseURL:    fmt.Sprintf("http://127.0.0.1:%d", port),
		Provider:           "sophiia-backend",
		PactDirs:           []string{filepath.Join("..", "..", "..", "..", "..", "frontend", "pacts")},
		FailIfNoPactsFound: true,
	})

	if err != nil {
		t.Fatalf("pact verification failed: %v", err)
	}
}
