.PHONY: dev up down logs build test lint format smoke load \
	dev-up migrate-up migrate-down migrate-status seed-admin gen-local-key \
	backend-shell frontend-shell rabbitmq-status clean \
	backend-build backend-test backend-lint backend-format \
	frontend-build frontend-test frontend-lint frontend-format

ifneq (,$(wildcard .env))
include .env
export
endif

# Revisão do git carimbada nas imagens (label OCI + APP_REVISION) por todos
# os alvos que fazem `docker compose ... build`. "unknown" fora de um
# working tree git ou com árvore suja marcada com "-dirty".
GIT_REVISION ?= $(shell git describe --always --dirty --match 'v[0-9]*' 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo unknown)
export GIT_REVISION

COMPOSE      := docker compose -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD := docker compose -f docker-compose.yml
GOOSE_DIR    := backend/migrations
DB_USER      ?= sophiia
DB_PASSWORD  ?= sophiia_pass
DB_NAME      ?= sophiia
HOST_DB_PORT ?= 5433
DB_DSN       ?= postgres://$(DB_USER):$(DB_PASSWORD)@localhost:$(HOST_DB_PORT)/$(DB_NAME)?sslmode=disable

## --- Orquestração local ---

dev: ## Sobe todos os serviços em modo desenvolvimento (com overrides de dev, em primeiro plano)
	$(COMPOSE) up --build

dev-up: ## Igual ao 'dev' porém desanexado (portas de dev expostas: pg 5433, mailpit 8025, ...)
	$(COMPOSE) up --build -d

up: ## Sobe todos os serviços em modo produção
	$(COMPOSE_PROD) up --build -d

down: ## Para e remove todos os serviços
	$(COMPOSE) down

logs: ## Acompanha os logs de todos os serviços
	$(COMPOSE) logs -f

clean: ## Para os serviços e remove os volumes (DESTRÓI os dados locais)
	$(COMPOSE) down -v

## --- Build ---

build: backend-build frontend-build ## Compila os binários/artefatos do backend e do frontend

backend-build:
	cd backend && go build ./...

frontend-build:
	cd frontend && npm run build

## --- Testes ---

test: backend-test frontend-test ## Roda as suítes de teste do backend e do frontend

backend-test:
	cd backend && go test ./... -p 1

frontend-test:
	cd frontend && npm test

## --- Lint / format ---

lint: backend-lint frontend-lint ## Roda lint no backend e no frontend

backend-lint:
	cd backend && go vet ./...

frontend-lint:
	cd frontend && npm run lint

format: backend-format frontend-format ## Formata o backend e o frontend

backend-format:
	cd backend && go fmt ./...

frontend-format:
	cd frontend && npm run format

## --- Migrations (Goose) ---

migrate-up: ## Aplica todas as migrations pendentes
	cd $(GOOSE_DIR) && goose postgres "$(DB_DSN)" up

migrate-down: ## Reverte a última migration
	cd $(GOOSE_DIR) && goose postgres "$(DB_DSN)" down

migrate-status: ## Mostra o status das migrations
	cd $(GOOSE_DIR) && goose postgres "$(DB_DSN)" status

seed-admin: ## Cria/reseta o usuário admin local com senha ALEATÓRIA
	cd backend && DB_HOST=localhost DB_PORT=$(HOST_DB_PORT) DB_NAME=$(DB_NAME) DB_USER=$(DB_USER) DB_PASSWORD=$(DB_PASSWORD) \
		go run ./cmd/seedadmin

gen-local-key: ## Gera a chave RSA de DEV do login local em secrets/ (não versionar; uma por ambiente)
	@mkdir -p secrets
	@if [ -f secrets/local_auth_private_key.pem ]; then \
		echo "secrets/local_auth_private_key.pem já existe — remova antes de regenerar"; \
	else \
		openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out secrets/local_auth_private_key.pem && \
		chmod 600 secrets/local_auth_private_key.pem && \
		echo "chave de DEV gerada em secrets/local_auth_private_key.pem (gitignored) — NUNCA versionar; use um secret manager em produção"; \
	fi

smoke: ## Smoke ponta a ponta do módulo SOPHIIA (exige o stack no ar + SOPHIIA_ADMIN_PASS)
	./scripts/smoke-sophiia.sh

load: ## Teste de carga baseline k6 (exige k6 no PATH, stack no ar e K6_PASSWORD) — ver load/README.md
	k6 run load/k6/baseline.js

## --- Shells ---

backend-shell: ## Abre um shell no container backend-api em execução
	$(COMPOSE) exec backend-api sh

frontend-shell: ## Abre um shell no container frontend em execução
	$(COMPOSE) exec frontend sh

## --- RabbitMQ ---

rabbitmq-status: ## Mostra o status do nó/filas do RabbitMQ
	$(COMPOSE) exec rabbitmq rabbitmqctl status
