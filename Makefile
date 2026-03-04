.PHONY: help build up down restart logs status test lint clean deploy

APPS := matrix-hello

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build all app containers
	@for app in $(APPS); do \
		echo "==> Building $$app..."; \
		docker compose -f $$app/docker-compose.yml build; \
	done

up: ## Start all apps
	@for app in $(APPS); do \
		echo "==> Starting $$app..."; \
		docker compose -f $$app/docker-compose.yml up -d; \
	done

down: ## Stop all apps
	@for app in $(APPS); do \
		echo "==> Stopping $$app..."; \
		docker compose -f $$app/docker-compose.yml down; \
	done

restart: ## Restart all apps
	$(MAKE) down
	$(MAKE) up

logs: ## Tail logs for all apps
	@for app in $(APPS); do \
		echo "==> Logs for $$app:"; \
		docker compose -f $$app/docker-compose.yml logs --tail=20; \
	done

status: ## Show status of all app containers
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

test: ## Run tests for all apps
	@for app in $(APPS); do \
		echo "==> Testing $$app..."; \
		$(MAKE) test-$$app; \
	done

test-matrix-hello: ## Test matrix-hello is serving correctly
	@docker compose -f matrix-hello/docker-compose.yml up -d
	@sleep 2
	@curl -sf http://localhost:3001 > /dev/null && \
		echo "  PASS: matrix-hello responds on :3001" || \
		echo "  FAIL: matrix-hello not responding on :3001"

lint: ## Lint Dockerfiles and compose files
	@for app in $(APPS); do \
		echo "==> Linting $$app..."; \
		docker compose -f $$app/docker-compose.yml config -q && \
			echo "  compose: OK" || echo "  compose: FAIL"; \
	done

clean: ## Remove stopped containers and dangling images
	docker system prune -f

deploy: build up test ## Full deploy: build, start, test
	@echo "==> Deployment complete"

# Per-app targets
build-%:
	docker compose -f $*/docker-compose.yml build

up-%:
	docker compose -f $*/docker-compose.yml up -d

down-%:
	docker compose -f $*/docker-compose.yml down

logs-%:
	docker compose -f $*/docker-compose.yml logs -f

restart-%:
	docker compose -f $*/docker-compose.yml down
	docker compose -f $*/docker-compose.yml up -d
