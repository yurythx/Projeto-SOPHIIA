// Package config carrega e valida a configuração do Projeto SOPHIIA a partir
// de variáveis de ambiente. Configuração obrigatória ausente faz Load
// retornar um erro imediatamente (fail fast) em vez de deixar a aplicação
// subir num estado parcialmente configurado — é preferível o processo nem
// iniciar a iniciar e falhar de forma imprevisível no primeiro request que
// tocar a configuração faltante.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// AppConfig guarda as configurações gerais de identidade da aplicação.
type AppConfig struct {
	Env       string // development | staging | production
	Name      string
	LogLevel  string
	LogFormat string // json | text
}

// HTTPConfig guarda as configurações de bind do servidor HTTP.
type HTTPConfig struct {
	Host string
	Port int
}

func (c HTTPConfig) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// DatabaseConfig guarda as configurações de conexão e pool do PostgreSQL.
type DatabaseConfig struct {
	Host            string
	Port            int
	Name            string
	User            string
	Password        string
	SSLMode         string
	MaxConns        int32
	MinConns        int32
	MaxConnLifetime time.Duration
	MaxConnIdleTime time.Duration
	ConnectTimeout  time.Duration
}

// DSN retorna uma connection string no estilo libpq, pronta para o pgxpool.
func (c DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%d dbname=%s user=%s password=%s sslmode=%s connect_timeout=%d",
		c.Host, c.Port, c.Name, c.User, c.Password, c.SSLMode, int(c.ConnectTimeout.Seconds()),
	)
}

// RabbitMQConfig guarda as configurações de conexão e de retry/prefetch do
// RabbitMQ.
type RabbitMQConfig struct {
	URL           string
	MaxRetries    int
	PrefetchCount int
}

// KeycloakConfig guarda as configurações OIDC do Keycloak gerenciado
// externamente — este projeto nunca cria/administra o Keycloak em si,
// apenas consome um realm/client já existentes (§29).
type KeycloakConfig struct {
	IssuerURL    string
	Realm        string
	ClientID     string
	ClientSecret string
	Audience     string
}

// LocalAuthConfig guarda as configurações do login local por
// usuário/senha (§ Sistema de Login Local) — um caminho de autenticação
// PARALELO ao Keycloak (útil para dev/teste e como conta de emergência),
// nunca um substituto: nada aqui desliga ou substitui a verificação via
// Keycloak, que continua obrigatória e configurada como sempre foi. Os
// tokens locais são assinados com RSA (RS256) usando um par de chaves
// PRÓPRIO deste subsistema — nunca a mesma chave/segredo usado por
// qualquer coisa relacionada ao Keycloak/SSO, para que os dois caminhos
// de autenticação permaneçam criptograficamente independentes (ver
// internal/platform/auth/local.go e docs/adr/003-local-auth-rsa-hardening.md).
type LocalAuthConfig struct {
	Enabled bool
	// PrivateKeyPEM é o conteúdo PEM (PKCS1 ou PKCS8) da chave privada RSA
	// usada para assinar e verificar tokens locais — a chave pública é
	// derivada dela em tempo de execução (auth.NewLocalSigner), nunca
	// configurada separadamente. Suporta o padrão "<KEY>_FILE" via
	// loader.secret (LOCAL_AUTH_PRIVATE_KEY_FILE), o jeito recomendado de
	// fornecer este valor: PEM é multi-linha e não cabe bem numa variável
	// de ambiente comum.
	PrivateKeyPEM string
	TokenTTL      time.Duration
}

// JobsConfig guarda as configurações de processamento assíncrono de jobs.
type JobsConfig struct {
	// StaleAfter: há quanto tempo sem atividade um job "processing" (ver
	// jobs.Status) precisa estar pro sweeper (jobs.SweepStale) considerar
	// ele órfão — um worker que morreu no meio do trabalho (crash, OOM,
	// `docker compose restart`/`--force-recreate` no meio de um job, o
	// host reiniciando) nunca chama MarkCompleted/MarkFailed, e como a
	// mensagem do RabbitMQ que disparou o processamento já foi
	// confirmada (ack) muito antes de o worker morrer, nenhuma
	// redelivery chega nunca — sem um sweeper, esse job fica preso em
	// "processing" pra sempre (ex.: uma transcodificação de videoaula
	// presa indefinidamente após crash do worker).
	// O default de 45min é conservador e cobre jobs de longa duração
	// como a transcodificação HLS de um vídeo longo.
	StaleAfter time.Duration
}

// WorkerConfig guarda as configurações do listener HTTP mínimo próprio do
// cmd/worker, usado só para /health e /metrics (healthcheck do Docker +
// scrape do Prometheus) — nunca para tráfego de negócio.
type WorkerConfig struct {
	MetricsHost string
	MetricsPort int
}

func (c WorkerConfig) MetricsAddr() string {
	return fmt.Sprintf("%s:%d", c.MetricsHost, c.MetricsPort)
}

// MinIOConfig guarda as credenciais do object storage (videoaulas brutas,
// segmentos HLS, PDFs de certificado, anexos).
type MinIOConfig struct {
	Endpoint  string // host:porta alcançável pelo backend (rede interna) — usado em Get/Put/Delete
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
	// PublicEndpoint / PublicUseSSL: host alcançável pelo NAVEGADOR — as
	// URLs pré-assinadas (upload/download direto do cliente) precisam ser
	// assinadas para ESTE host, senão o navegador tenta resolver o nome
	// interno do Docker ("minio:9000") e o upload falha. Default = Endpoint.
	PublicEndpoint string
	PublicUseSSL   bool
}

// RedisConfig guarda a conexão com o Redis, usado pelo módulo SOPHIIA como
// buffer write-behind de heartbeat do player (§ Write-Behind Buffer) e
// cache-aside de catálogo. URL segue o formato redis://[:senha@]host:porta/db.
type RedisConfig struct {
	URL string
}

// SMTPConfig guarda o servidor de e-mail institucional usado pelo worker
// de notificação do SOPHIIA. Sem Host/From configurados, o worker cai num
// remetente que apenas registra a mensagem em log (dev/teste).
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

// Configured reporta se há um servidor SMTP real definido.
func (c SMTPConfig) Configured() bool { return c.Host != "" && c.From != "" }

// Config é a configuração da aplicação já totalmente validada.
type Config struct {
	App       AppConfig
	HTTP      HTTPConfig
	Database  DatabaseConfig
	RabbitMQ  RabbitMQConfig
	Keycloak  KeycloakConfig
	LocalAuth LocalAuthConfig
	Jobs      JobsConfig
	Worker    WorkerConfig

	MinIO MinIOConfig
	Redis RedisConfig
	SMTP  SMTPConfig

	FrontendURL         string
	APIPublicURL        string
	WebSocketPublicURL  string
	OTELExporterOTLPURL string
	MaxPageSize         int
}

// loader acumula os erros de leitura para que Load reporte de uma vez toda
// variável faltante, em vez de forçar quem está operando a passar por um
// ciclo de "corrige uma, reinicia, corrige a próxima".
type loader struct {
	errs []string
}

func (l *loader) str(key string, required bool, def string) string {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		if required {
			l.errs = append(l.errs, key)
		}
		return def
	}
	return v
}

// secret funciona como str, mas primeiro verifica se existe uma variável
// "<KEY>_FILE" apontando para um arquivo — se sim, o CONTEÚDO do arquivo
// (sem espaços/quebras de linha nas pontas) é usado como valor, e a
// variável "<KEY>" direta é ignorada.
//
// Isto é o padrão universal para rotação/gestão de segredos sem precisar
// de código específico para cada backend: Docker Swarm secrets monta cada
// segredo como um arquivo em /run/secrets/<nome>; Kubernetes Secrets
// montados como volume funcionam do mesmo jeito; o Vault Agent Sidecar
// Injector escreve o segredo lido do Vault num arquivo local; AWS
// Secrets Manager com o CSI driver também. Nenhum desses precisa que a
// aplicação fale a API específica do provedor — só que ela saiba ler
// "<KEY>_FILE" em vez de "<KEY>" quando o arquivo existir. Usado para
// todo valor que é de fato um segredo (senha, client secret, chave de
// API) — nunca para configuração não sensível (host, nome de banco,
// etc.), que continua vindo direto de env var via str().
func (l *loader) secret(key string, required bool, def string) string {
	filePath, hasFileVar := os.LookupEnv(key + "_FILE")
	if hasFileVar && filePath != "" {
		content, err := os.ReadFile(filePath)
		if err != nil {
			l.errs = append(l.errs, fmt.Sprintf("%s_FILE (failed to read %q: %v)", key, filePath, err))
			return def
		}
		return strings.TrimSpace(string(content))
	}
	return l.str(key, required, def)
}

func (l *loader) intVal(key string, required bool, def int) int {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		if required {
			l.errs = append(l.errs, key)
		}
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		l.errs = append(l.errs, fmt.Sprintf("%s (invalid integer %q)", key, v))
		return def
	}
	return n
}

func (l *loader) durationVal(key string, required bool, def time.Duration) time.Duration {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		if required {
			l.errs = append(l.errs, key)
		}
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		l.errs = append(l.errs, fmt.Sprintf("%s (invalid duration %q)", key, v))
		return def
	}
	return d
}

func (l *loader) boolVal(key string, def bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		l.errs = append(l.errs, fmt.Sprintf("%s (invalid boolean %q)", key, v))
		return def
	}
	return b
}

// splitAndTrim divide uma lista separada por vírgula (ex.: "a,b,c") em
// entradas individuais, descartando espaço em volta e entradas vazias.
func splitAndTrim(csv string) []string {
	if csv == "" {
		return nil
	}
	parts := strings.Split(csv, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// Load lê a configuração a partir do ambiente do processo. Retorna um erro
// nomeando toda variável obrigatória ausente/inválida, caso a validação
// falhe.
func Load() (*Config, error) {
	l := &loader{}

	cfg := &Config{
		App: AppConfig{
			Env:       l.str("APP_ENV", true, ""),
			Name:      l.str("APP_NAME", false, "projeto-sophiia"),
			LogLevel:  l.str("APP_LOG_LEVEL", false, "info"),
			LogFormat: l.str("LOG_FORMAT", false, "json"),
		},
		HTTP: HTTPConfig{
			Host: l.str("HTTP_HOST", false, "0.0.0.0"),
			Port: l.intVal("HTTP_PORT", false, 8000),
		},
		Database: DatabaseConfig{
			Host:            l.str("DB_HOST", true, ""),
			Port:            l.intVal("DB_PORT", true, 0),
			Name:            l.str("DB_NAME", true, ""),
			User:            l.str("DB_USER", true, ""),
			Password:        l.secret("DB_PASSWORD", true, ""),
			SSLMode:         l.str("DB_SSLMODE", false, "disable"),
			MaxConns:        int32(l.intVal("DB_MAX_CONNS", false, 20)),
			MinConns:        int32(l.intVal("DB_MIN_CONNS", false, 2)),
			MaxConnLifetime: l.durationVal("DB_MAX_CONN_LIFETIME", false, time.Hour),
			MaxConnIdleTime: l.durationVal("DB_MAX_CONN_IDLE_TIME", false, 15*time.Minute),
			ConnectTimeout:  l.durationVal("DB_CONNECT_TIMEOUT", false, 5*time.Second),
		},
		RabbitMQ: RabbitMQConfig{
			URL:           l.secret("RABBITMQ_URL", true, ""),
			MaxRetries:    l.intVal("RABBITMQ_MAX_RETRIES", false, 3),
			PrefetchCount: l.intVal("RABBITMQ_PREFETCH_COUNT", false, 10),
		},
		Keycloak: KeycloakConfig{
			IssuerURL:    l.str("KEYCLOAK_ISSUER_URL", false, ""),
			Realm:        l.str("KEYCLOAK_REALM", false, ""),
			ClientID:     l.str("KEYCLOAK_CLIENT_ID", false, ""),
			ClientSecret: l.secret("KEYCLOAK_CLIENT_SECRET", false, ""),
			Audience:     l.str("KEYCLOAK_AUDIENCE", false, ""),
		},
		LocalAuth: LocalAuthConfig{
			Enabled:       l.boolVal("LOCAL_AUTH_ENABLED", false),
			PrivateKeyPEM: l.secret("LOCAL_AUTH_PRIVATE_KEY", false, ""),
			TokenTTL:      l.durationVal("LOCAL_AUTH_TOKEN_TTL", false, time.Hour),
		},
		Jobs: JobsConfig{
			StaleAfter: l.durationVal("JOB_STALE_AFTER", false, 45*time.Minute),
		},
		Worker: WorkerConfig{
			MetricsHost: l.str("WORKER_METRICS_HOST", false, "0.0.0.0"),
			MetricsPort: l.intVal("WORKER_METRICS_PORT", false, 9100),
		},
		MinIO: minioConfig(l),
		Redis: RedisConfig{
			URL: l.secret("REDIS_URL", false, "redis://redis:6379/0"),
		},
		SMTP: SMTPConfig{
			Host:     l.str("SMTP_HOST", false, ""),
			Port:     l.intVal("SMTP_PORT", false, 587),
			Username: l.str("SMTP_USERNAME", false, ""),
			Password: l.secret("SMTP_PASSWORD", false, ""),
			From:     l.str("SMTP_FROM", false, ""),
		},
		FrontendURL:         l.str("FRONTEND_URL", false, "http://localhost:3000"),
		APIPublicURL:        l.str("API_PUBLIC_URL", false, "http://localhost:8000"),
		WebSocketPublicURL:  l.str("WEBSOCKET_PUBLIC_URL", false, "ws://localhost:8000/ws"),
		OTELExporterOTLPURL: l.str("OTEL_EXPORTER_OTLP_ENDPOINT", false, ""),
		MaxPageSize:         l.intVal("MAX_PAGE_SIZE", false, 100),
	}

	if len(l.errs) > 0 {
		return nil, fmt.Errorf("config: missing or invalid required environment variables: %s", strings.Join(l.errs, ", "))
	}

	if cfg.App.Env != "development" && cfg.App.Env != "staging" && cfg.App.Env != "production" && cfg.App.Env != "test" {
		return nil, fmt.Errorf("config: APP_ENV must be one of development|staging|production|test, got %q", cfg.App.Env)
	}

	// LOCAL_AUTH_PRIVATE_KEY (ou _FILE) só é obrigatória quando o login
	// local está ligado — não faz sentido validá-la sempre (ela não é
	// usada em nenhum outro caminho), mas um deploy com
	// LOCAL_AUTH_ENABLED=true e sem chave configurada precisa falhar no
	// startup, não emitir tokens sem assinatura válida. A validação de que
	// o PEM de fato parseia como uma chave RSA válida (e do tamanho
	// mínimo) acontece em auth.NewLocalSigner, não aqui — este pacote só
	// confere presença, não a validade criptográfica do conteúdo.
	if cfg.LocalAuth.Enabled && cfg.LocalAuth.PrivateKeyPEM == "" {
		return nil, fmt.Errorf("config: LOCAL_AUTH_PRIVATE_KEY is required when LOCAL_AUTH_ENABLED=true")
	}

	// Endurecimento de produção (achado de auditoria): em APP_ENV=production
	// o startup FALHA se qualquer segredo ainda estiver num valor
	// conhecido de conveniência dev/test, se um segredo real for curto
	// demais, ou se o tráfego para o Postgres / object storage puder sair
	// em texto claro. Defesa contra deploy que esqueceu de sobrescrever a
	// env (ex.: subir o docker-compose.yml como está).
	if cfg.App.Env == "production" {
		if err := validateProductionHardening(cfg); err != nil {
			return nil, err
		}
	}

	return cfg, nil
}

// Defaults inseguros: só existem para o fluxo dev/test funcionar sem
// configuração. Ver a validação de produção em Load().
const (
	insecureMinioAccessKey = "admin"
	insecureMinioSecretKey = "password123"
)

// minSecretLen é o piso de comprimento para um segredo de produção
// (senha de banco, client secret). Não substitui uma política de rotação,
// mas barra placeholders óbvios como "secret" / "changeme".
const minSecretLen = 16

// weakSecretValues são valores literais que aparecem em .env.example /
// docker-compose e NUNCA podem chegar a produção.
var weakSecretValues = map[string]struct{}{
	"":                     {},
	"sophiia_pass":         {},
	"rabbit_pass":          {},
	"sophiia_secret":       {},
	"super_secret_jwt_key": {},
	"changeme":             {},
	"secret":               {},
	"password":             {},
	"postgres":             {},
	"admin":                {},
	"password123":          {},
}

func isWeakSecret(v string) bool {
	if _, ok := weakSecretValues[v]; ok {
		return true
	}
	return len(v) < minSecretLen
}

func validateProductionHardening(cfg *Config) error {
	var problems []string

	if cfg.MinIO.AccessKey == insecureMinioAccessKey {
		problems = append(problems, "MINIO_ACCESS_KEY (valor default inseguro)")
	}
	if cfg.MinIO.SecretKey == insecureMinioSecretKey {
		problems = append(problems, "MINIO_SECRET_KEY (valor default inseguro)")
	}
	if isWeakSecret(cfg.Database.Password) {
		problems = append(problems, fmt.Sprintf("DB_PASSWORD (default/fraco — mínimo %d caracteres)", minSecretLen))
	}
	// RABBITMQ_URL carrega a senha embutida; checa só os tokens de default
	// documentados, não comprimento (a URL toda tem outros componentes).
	if strings.Contains(cfg.RabbitMQ.URL, "rabbit_pass") || strings.Contains(cfg.RabbitMQ.URL, ":sophiia_pass@") {
		problems = append(problems, "RABBITMQ_URL (senha no valor default)")
	}
	// KEYCLOAK_CLIENT_SECRET não é validado aqui: o backend é resource
	// server (só verifica JWT via JWKS) e nunca usa um client secret. O
	// segredo do cliente confidencial é o KEYCLOAK_FRONTEND_CLIENT_SECRET,
	// checado no boot do frontend (src/instrumentation.ts).

	// TLS obrigatório para o Postgres — sem isto a connection string (que
	// carrega a senha) e todo o tráfego de dados saem em claro.
	switch cfg.Database.SSLMode {
	case "require", "verify-ca", "verify-full":
	default:
		problems = append(problems, fmt.Sprintf("DB_SSLMODE=%q (use require|verify-ca|verify-full em produção)", cfg.Database.SSLMode))
	}

	// URLs pré-assinadas de upload/download de videoaula e segmentos HLS
	// são assinadas para MINIO_PUBLIC_URL e abertas direto pelo navegador —
	// não podem sair por http:// em produção.
	if raw := strings.TrimSpace(os.Getenv("MINIO_PUBLIC_URL")); raw != "" && !strings.HasPrefix(strings.ToLower(raw), "https://") {
		problems = append(problems, "MINIO_PUBLIC_URL (deve ser https:// em produção)")
	}

	if len(problems) > 0 {
		return fmt.Errorf(
			"config: recusando iniciar em produção — corrija: %s",
			strings.Join(problems, "; "))
	}
	return nil
}

// minioConfig monta MinIOConfig, derivando o endpoint público (para URLs
// pré-assinadas — alcançável pelo navegador) de MINIO_PUBLIC_URL. Sem essa
// variável, usa o mesmo host interno (comportamento antigo).
func minioConfig(l *loader) MinIOConfig {
	c := MinIOConfig{
		Endpoint:  l.str("MINIO_ENDPOINT", false, "minio:9000"),
		AccessKey: l.str("MINIO_ACCESS_KEY", false, insecureMinioAccessKey),
		SecretKey: l.secret("MINIO_SECRET_KEY", false, insecureMinioSecretKey),
		Bucket:    l.str("MINIO_BUCKET", false, "demands"),
		UseSSL:    l.boolVal("MINIO_USE_SSL", false),
	}
	c.PublicEndpoint = c.Endpoint
	c.PublicUseSSL = c.UseSSL
	if raw := strings.TrimSpace(os.Getenv("MINIO_PUBLIC_URL")); raw != "" {
		if u, err := url.Parse(raw); err == nil && u.Host != "" {
			c.PublicEndpoint = u.Host
			c.PublicUseSSL = u.Scheme == "https"
		} else {
			l.errs = append(l.errs, fmt.Sprintf("MINIO_PUBLIC_URL (URL inválida: %q)", raw))
		}
	}
	return c
}

// LoadDatabase lê só as variáveis DB_* — usado por ferramentas standalone
// (ex.: cmd/seedadmin) que precisam de uma conexão Postgres mas não do
// resto da configuração da plataforma (Keycloak, RabbitMQ, ...), que
// Load() exigiria sem necessidade. Mesmo loader/mesmas variáveis/mesmos
// defaults que Load() usa pra popular Config.Database — as duas nunca
// podem divergir em como DB_* é lido, então isto não duplica a lógica de
// parsing, só o subconjunto de chamadas.
func LoadDatabase() (DatabaseConfig, error) {
	l := &loader{}
	db := DatabaseConfig{
		Host:            l.str("DB_HOST", true, ""),
		Port:            l.intVal("DB_PORT", true, 0),
		Name:            l.str("DB_NAME", true, ""),
		User:            l.str("DB_USER", true, ""),
		Password:        l.secret("DB_PASSWORD", true, ""),
		SSLMode:         l.str("DB_SSLMODE", false, "disable"),
		MaxConns:        int32(l.intVal("DB_MAX_CONNS", false, 20)),
		MinConns:        int32(l.intVal("DB_MIN_CONNS", false, 2)),
		MaxConnLifetime: l.durationVal("DB_MAX_CONN_LIFETIME", false, time.Hour),
		MaxConnIdleTime: l.durationVal("DB_MAX_CONN_IDLE_TIME", false, 15*time.Minute),
		ConnectTimeout:  l.durationVal("DB_CONNECT_TIMEOUT", false, 5*time.Second),
	}
	if len(l.errs) > 0 {
		return DatabaseConfig{}, fmt.Errorf("config: missing or invalid required environment variables: %s", strings.Join(l.errs, ", "))
	}
	return db, nil
}
