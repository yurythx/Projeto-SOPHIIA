// Package app conecta entre si toda dependência de plataforma e de módulo
// (banco de dados, mensageria, autenticação, hub de WebSocket, serviços de
// módulo) e expõe o router HTTP já montado usado pelo cmd/api e o runner
// de worker já montado usado pelo cmd/worker. É o único lugar autorizado a
// conhecer todo módulo de uma vez — nenhum módulo importa outro
// diretamente, só internal/app os conecta.
package app

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/yurythx/projeto-sophiia/internal/domain/events"
	"github.com/yurythx/projeto-sophiia/internal/platform/auth"
	"github.com/yurythx/projeto-sophiia/internal/platform/config"
	"github.com/yurythx/projeto-sophiia/internal/platform/configflags"
	"github.com/yurythx/projeto-sophiia/internal/platform/database"
	"github.com/yurythx/projeto-sophiia/internal/platform/httpserver"
	"github.com/yurythx/projeto-sophiia/internal/platform/idempotency"
	"github.com/yurythx/projeto-sophiia/internal/platform/logging"
	"github.com/yurythx/projeto-sophiia/internal/platform/messaging"
	"github.com/yurythx/projeto-sophiia/internal/platform/metrics"
	"github.com/yurythx/projeto-sophiia/internal/platform/outbox"
	"github.com/yurythx/projeto-sophiia/internal/platform/ratelimit"
	"github.com/yurythx/projeto-sophiia/internal/platform/storage"
	"github.com/yurythx/projeto-sophiia/internal/platform/telemetry"
	"github.com/yurythx/projeto-sophiia/internal/platform/ws"
)

// RateLimiters guarda todo rate limiter distribuído (baseado em Postgres —
// rate limiting distribuído) que a API usa. Construído uma única vez por
// processo e compartilhado por toda requisição, para que cada réplica da
// API leia/escreva as mesmas linhas de rate_limit_buckets em vez de cada
// uma manter sua própria contagem independente em memória (e portanto
// N×-generosa demais).
type RateLimiters struct {
	WSTicket   httpserver.Limiter // POST /api/v1/ws/ticket
	LocalLogin httpserver.Limiter // POST /api/v1/auth/login — chave por IP, não por usuário (§ Sistema de Login Local), já que quem chama ainda não está autenticado
	// Mutations cobre as escritas autenticadas de baixa frequência humana:
	// generoso o bastante para um operador clicando, apertado o bastante
	// para barrar abuso scriptado por um token comprometido.
	Mutations httpserver.Limiter
	// PublicCert protege GET /api/v1/public/certificates/validate/{token}
	// — rota SEM autenticação, chave por IP. O token é opaco (128 bits),
	// mas o rate limit barra varredura automatizada da base.
	PublicCert httpserver.Limiter
}

// OutboxSource identifica este backend como o Source carimbado em todo
// envelope de evento gravado no outbox.
const OutboxSource = "projeto-sophiia.platform"

// Dependencies guarda todo recurso de plataforma compartilhado.
// Dependências específicas de módulo (repositórios, casos de uso) são
// adicionadas a esta struct conforme cada módulo é conectado; nada aqui
// deve carregar regra de negócio.
type Dependencies struct {
	Config       *config.Config
	Logger       *slog.Logger
	DB           *pgxpool.Pool
	Verifier     *auth.Verifier
	LocalSigner  *auth.LocalSigner
	Messaging    *messaging.Connection
	Publisher    events.EventPublisher
	Outbox       *outbox.Writer
	Storage      storage.Provider
	Redis        *redis.Client
	Hub          *ws.Hub
	Tickets      *ws.TicketStore
	Modules      *Modules
	RateLimiters *RateLimiters
	Idempotency  idempotency.Store
	Flags        configflags.Store

	telemetryShutdown telemetry.Shutdown
}

// NewDependencies constrói e valida toda dependência de plataforma para um
// processo. component distingue "api" de "worker" em logs e traces (os
// dois compartilham este mesmo bootstrap). Retorna um erro imediatamente
// se qualquer dependência obrigatória (banco de dados, RabbitMQ, discovery
// OIDC) não puder ser alcançada, para que o processo falhe rápido em vez
// de servir tráfego num estado parcialmente inicializado.
func NewDependencies(ctx context.Context, component string) (*Dependencies, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("app: load config: %w", err)
	}

	serviceName := cfg.App.Name + "-" + component
	logger := logging.New(logging.Options{
		Level:       cfg.App.LogLevel,
		Format:      cfg.App.LogFormat,
		Service:     serviceName,
		Environment: cfg.App.Env,
	})

	telemetryShutdown, err := telemetry.Setup(ctx, serviceName, cfg.App.Env, cfg.OTELExporterOTLPURL, logger)
	if err != nil {
		return nil, fmt.Errorf("app: setup telemetry: %w", err)
	}

	pool, err := database.New(ctx, cfg.Database)
	if err != nil {
		return nil, fmt.Errorf("app: connect database: %w", err)
	}
	metrics.RegisterPostgresPoolMetrics(pool)

	localSigner, err := auth.NewLocalSigner(cfg.LocalAuth)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("app: initialize local auth signer: %w", err)
	}

	verifier, err := auth.NewVerifier(ctx, cfg.Keycloak, localSigner)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("app: initialize OIDC verifier: %w", err)
	}

	mqConn, err := messaging.Connect(ctx, cfg.RabbitMQ.URL, logger)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("app: connect to rabbitmq: %w", err)
	}

	// Declara a topologia (exchange, filas, DLQs, bindings) aqui no
	// bootstrap — tanto o cmd/api quanto o cmd/worker chamam
	// NewDependencies, então a topologia existe garantidamente antes de
	// qualquer um dos dois tentar publicar ou consumir, não importa qual
	// suba primeiro.
	topologyCh, err := mqConn.Channel()
	if err != nil {
		pool.Close()
		_ = mqConn.Close()
		return nil, fmt.Errorf("app: open channel to declare topology: %w", err)
	}
	if err := messaging.DeclareTopology(topologyCh, messaging.AllQueues()); err != nil {
		pool.Close()
		_ = mqConn.Close()
		return nil, fmt.Errorf("app: declare rabbitmq topology: %w", err)
	}
	_ = topologyCh.Close()

	publisher := messaging.NewPublisher(mqConn)

	minioProvider, err := storage.NewMinioProviderWithPresign(
		cfg.MinIO.Endpoint, cfg.MinIO.PublicEndpoint,
		cfg.MinIO.AccessKey, cfg.MinIO.SecretKey,
		cfg.MinIO.UseSSL, cfg.MinIO.PublicUseSSL)
	if err != nil {
		pool.Close()
		_ = mqConn.Close()
		return nil, fmt.Errorf("app: connect to minio: %w", err)
	}

	err = minioProvider.EnsureBucket(ctx, cfg.MinIO.Bucket)
	if err != nil {
		logger.Warn("não foi possível garantir a existência do bucket do minio na inicialização", slog.String("erro", err.Error()))
	}

	// Política de ciclo de vida (ILM) do MinIO: objetos sob raw-uploads/
	// (o MP4 original que o instrutor envia) são descartados 7 dias após
	// a transcodificação — o worker de vídeo já persistiu os segmentos
	// HLS permanentes em hls/, então o arquivo bruto não precisa mais
	// ocupar espaço (§ MINIO / raw-uploads Auto-delete).
	if err := minioProvider.EnsureRawUploadsLifecycle(ctx, cfg.MinIO.Bucket, 7); err != nil {
		logger.Warn("não foi possível aplicar a política de expiração de raw-uploads/ no minio", slog.String("erro", err.Error()))
	}
	// Segmentos HLS precisam de leitura anônima para o player no navegador.
	if err := minioProvider.EnsureHLSPublicRead(ctx, cfg.MinIO.Bucket); err != nil {
		logger.Warn("não foi possível liberar leitura pública do prefixo hls/ no minio", slog.String("erro", err.Error()))
	}

	// Redis: buffer write-behind do heartbeat do player SOPHIIA e
	// cache-aside de catálogo. Um Redis inalcançável no boot não impede
	// a subida (só o módulo SOPHIIA degrada) — mesmo tratamento do bucket
	// do MinIO acima. Um REDIS_URL malformado, porém, é erro de config e
	// aborta o boot.
	redisOpts, err := redis.ParseURL(cfg.Redis.URL)
	if err != nil {
		pool.Close()
		_ = mqConn.Close()
		return nil, fmt.Errorf("app: parse REDIS_URL: %w", err)
	}
	redisClient := redis.NewClient(redisOpts)
	pingCtx, cancelPing := context.WithTimeout(ctx, 3*time.Second)
	if err := redisClient.Ping(pingCtx).Err(); err != nil {
		logger.Warn("redis inalcançável na inicialização — o módulo SOPHIIA ficará degradado até o redis voltar", slog.String("erro", err.Error()))
	}
	cancelPing()

	deps := &Dependencies{
		Config:      cfg,
		Logger:      logger,
		DB:          pool,
		Verifier:    verifier,
		LocalSigner: localSigner,
		Messaging:   mqConn,
		Publisher:   publisher,
		Outbox:      outbox.NewWriter(OutboxSource),
		Storage:     minioProvider,
		Redis:       redisClient,
		Hub:         ws.NewHub(logger),
		Tickets:     ws.NewTicketStore(ws.TicketTTL),
		RateLimiters: &RateLimiters{
			// O último argumento (bucket) namespaceia cada limiter dentro
			// de rate_limit_buckets — ver o comentário de
			// ratelimit.PostgresLimiter: sem ele, dois limiters
			// diferentes recebendo o MESMO key (o subject do usuário
			// autenticado, comum entre rotas de módulos diferentes)
			// escreviam na mesma linha e se anulavam.
			//
			// Equivalente a 1 req/s, burst 5: até 5 requisições a cada 5s.
			WSTicket: ratelimit.NewPostgresLimiter(pool, 5, 5, "ws_ticket"),
			// Mais apertado de propósito — até 5 tentativas de login a
			// cada 60s por IP, para desacelerar força bruta de senha sem
			// travar um usuário legítimo que só errou a senha uma ou
			// duas vezes.
			LocalLogin: ratelimit.NewPostgresLimiter(pool, 60, 5, "local_login"),
			// Até 40 escritas a cada 60s por usuário — muito acima do ritmo
			// de um humano operando o Kanban / a fila de revisão.
			Mutations: ratelimit.NewPostgresLimiter(pool, 60, 40, "mutations"),
			// Até 20 validações públicas de certificado a cada 60s por IP:
			// folgado para um verificador humano abrindo alguns links,
			// apertado contra enumeração automatizada.
			PublicCert: ratelimit.NewPostgresLimiter(pool, 60, 20, "public_cert"),
		},
		Idempotency: idempotency.NewPostgresStore(pool),
		Flags:       configflags.NewPostgresStore(pool),

		telemetryShutdown: telemetryShutdown,
	}
	deps.Modules = buildModules(deps)

	return deps, nil
}

// Close libera todo recurso aberto por NewDependencies. Seguro de chamar
// uma vez durante o graceful shutdown.
func (d *Dependencies) Close() {
	if d.Tickets != nil {
		d.Tickets.Close()
	}
	if d.Redis != nil {
		_ = d.Redis.Close()
	}
	if d.Messaging != nil {
		_ = d.Messaging.Close()
	}
	if d.DB != nil {
		d.DB.Close()
	}
	if d.telemetryShutdown != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = d.telemetryShutdown(shutdownCtx)
	}
}
