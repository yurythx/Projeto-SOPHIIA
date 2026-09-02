package app

import (
	exampleApp "github.com/yurythx/projeto-sophiia/internal/modules/example/application"
	exampleInfra "github.com/yurythx/projeto-sophiia/internal/modules/example/infrastructure"
	exampleTransport "github.com/yurythx/projeto-sophiia/internal/modules/example/transport"

	integrationsApp "github.com/yurythx/projeto-sophiia/internal/modules/integrations/application"
	integrationsInfra "github.com/yurythx/projeto-sophiia/internal/modules/integrations/infrastructure"
	integrationsTransport "github.com/yurythx/projeto-sophiia/internal/modules/integrations/transport"

	usersApp "github.com/yurythx/projeto-sophiia/internal/modules/users/application"
	usersInfra "github.com/yurythx/projeto-sophiia/internal/modules/users/infrastructure"
	usersTransport "github.com/yurythx/projeto-sophiia/internal/modules/users/transport"

	sophiiaApp "github.com/yurythx/projeto-sophiia/internal/modules/sophiia/application"
	sophiiaInfra "github.com/yurythx/projeto-sophiia/internal/modules/sophiia/infrastructure"
	sophiiaTransport "github.com/yurythx/projeto-sophiia/internal/modules/sophiia/transport"

	"github.com/yurythx/projeto-sophiia/internal/platform/audit"
	"github.com/yurythx/projeto-sophiia/internal/platform/configflags"
	"github.com/yurythx/projeto-sophiia/internal/platform/localauth"
)

// Modules guarda o serviço de aplicação e os handlers HTTP de todo módulo
// de negócio do Projeto SOPHIIA. Servindo como o "ponto de montagem" central
// que conecta domain/application/infrastructure/transport de cada módulo.
type Modules struct {
	Users struct {
		Handlers *usersTransport.Handlers
	}
	Integrations struct {
		Service  *integrationsApp.Service
		Handlers *integrationsTransport.Handlers
	}
	ConfigFlags struct {
		Handlers *configflags.Handlers
	}
	LocalAuth struct {
		Handlers *localauth.Handlers
	}
	Example struct {
		Service  *exampleApp.Service
		Handlers *exampleTransport.Handlers
	}
	Sophiia struct {
		Service      *sophiiaApp.Service
		Handlers     *sophiiaTransport.Handlers
		VideoWorker  *sophiiaApp.VideoWorker
		CertWorker   *sophiiaApp.CertWorker
		NotifyWorker *sophiiaApp.NotifyWorker
	}
}

// buildModules constrói cada módulo de negócio do Projeto SOPHIIA.
func buildModules(deps *Dependencies) *Modules {
	auditWriter := audit.NewWriter(deps.DB)

	m := &Modules{}

	// Módulo de Usuários
	usersRepo := usersInfra.NewPostgresRepository(deps.DB)
	usersSvc := usersApp.NewService(usersRepo, auditWriter)
	m.Users.Handlers = usersTransport.NewHandlers(usersSvc, deps.Logger, deps.Config.MaxPageSize)

	// Módulo de Integrações
	integrationsRepo := integrationsInfra.NewPostgresRepository(deps.DB)
	integrationsSvc := integrationsApp.NewService(integrationsRepo)
	m.Integrations.Service = integrationsSvc
	m.Integrations.Handlers = integrationsTransport.NewHandlers(integrationsSvc, deps.Logger)

	// Feature Flags e Autenticação Local
	m.ConfigFlags.Handlers = configflags.NewHandlers(deps.Flags, auditWriter, deps.Logger)

	localAuthStore := localauth.NewPostgresStore(deps.DB)
	m.LocalAuth.Handlers = localauth.NewHandlers(localAuthStore, deps.LocalSigner, auditWriter, deps.Logger)

	// Módulo Exemplo (Template genérico para novos módulos)
	exampleRepo := exampleInfra.NewPostgresRepository(deps.DB)
	exampleSvc := exampleApp.NewService(exampleRepo, deps.Outbox, auditWriter, deps.Logger)
	m.Example.Service = exampleSvc
	m.Example.Handlers = exampleTransport.NewHandlers(exampleSvc, deps.Logger)

	// Módulo SOPHIIA (Capacitação, Instrução e Certificação Operacional)
	redisBuffer := sophiiaInfra.NewRedisBuffer(deps.Redis)
	sophiiaRepo := sophiiaInfra.NewPostgresRepository(deps.DB, deps.Outbox)
	sophiiaSvc := sophiiaApp.NewService(
		sophiiaRepo, redisBuffer, deps.Storage, deps.Outbox, auditWriter, deps.Logger, deps.Config.MinIO.Bucket,
	)
	m.Sophiia.Service = sophiiaSvc
	m.Sophiia.Handlers = sophiiaTransport.NewHandlers(sophiiaSvc, deps.Logger)

	// Workers assíncronos do módulo (consumidos pelo cmd/worker).
	transcoder := sophiiaInfra.NewFFmpegTranscoder()
	pdfGen := sophiiaInfra.NewCertificatePDFGenerator(deps.Config.FrontendURL)

	var emailSender sophiiaInfra.EmailSender
	if deps.Config.SMTP.Configured() {
		emailSender = sophiiaInfra.NewSMTPSender(
			deps.Config.SMTP.Host, deps.Config.SMTP.Port,
			deps.Config.SMTP.Username, deps.Config.SMTP.Password, deps.Config.SMTP.From,
		)
	} else {
		emailSender = &sophiiaInfra.LogEmailSender{Logger: deps.Logger}
	}

	m.Sophiia.VideoWorker = sophiiaApp.NewVideoWorker(sophiiaRepo, deps.Storage, transcoder, deps.Logger)
	m.Sophiia.CertWorker = sophiiaApp.NewCertWorker(
		sophiiaRepo, deps.Storage, pdfGen, deps.Logger, deps.Config.MinIO.Bucket,
	)
	m.Sophiia.NotifyWorker = sophiiaApp.NewNotifyWorker(sophiiaRepo, emailSender, deps.Logger)

	return m
}
