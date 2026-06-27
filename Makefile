.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up down logs ps seed build test smoke load stress spike soak degradation fault-clear

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## Boot the full stack (build + detached)
	$(COMPOSE) up -d --build

down: ## Stop the stack and remove volumes
	$(COMPOSE) down -v

logs: ## Tail logs for all services
	$(COMPOSE) logs -f

ps: ## Show running services
	$(COMPOSE) ps

verify: ## End-to-end verify the running stack (health, scrape, k6 smoke)
	./scripts/verify-stack.sh

verify-up: ## Boot the stack, verify it end-to-end, leave it running
	./scripts/verify-stack.sh --up

seed: ## Regenerate the Postgres seed SQL
	node infra/postgres/generate-seed.mjs

build: ## Typecheck + build the API
	cd apps/api && npm install && npm run build

test: ## Run API unit tests
	cd apps/api && npm test

# RW = also stream live metrics to Prometheus so the "k6 Test Run" dashboard fills in.
RW := -o experimental-prometheus-rw

smoke: ## Run the k6 smoke profile (quality gate; no remote-write)
	$(COMPOSE) run --rm k6 run --summary-export /scripts/reports/smoke-summary.json /scripts/scenarios/smoke.js

load: ## Run the k6 load profile (streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) --summary-export /scripts/reports/load-summary.json /scripts/scenarios/load.js

stress: ## Run the k6 stress profile (diagnostic, streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) --summary-export /scripts/reports/stress-summary.json /scripts/scenarios/stress.js

spike: ## Run the k6 spike profile (diagnostic, streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) --summary-export /scripts/reports/spike-summary.json /scripts/scenarios/spike.js

soak: ## Run the k6 soak profile (diagnostic, long, streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) --summary-export /scripts/reports/soak-summary.json /scripts/scenarios/soak.js

degradation: ## Run the degradation drill (injects + clears a fault, streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) --summary-export /scripts/reports/degradation-summary.json /scripts/scenarios/degradation.js

fault-clear: ## Clear any active fault injection
	curl -fsS -X DELETE http://localhost:3000/admin/faults && echo
