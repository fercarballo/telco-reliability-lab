.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up down logs ps seed build test smoke load stress spike soak degradation smoke-breach compare-runs zap-smoke fault-clear

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

# RW = stream live metrics to Prometheus so the "k6 Test Run" dashboard fills in.
# HTML = export a static web-dashboard report; open tests/k6/reports/<profile>-report.html after the run.
RW   := -o experimental-prometheus-rw
HTML  = --out 'web-dashboard=export=/scripts/reports/$(1)-report.html'

smoke: ## Run the k6 smoke profile (quality gate; HTML report generated)
	$(COMPOSE) run --rm k6 run \
		$(call HTML,smoke) \
		--summary-export /scripts/reports/smoke-summary.json \
		/scripts/scenarios/smoke.js

load: ## Run the k6 load profile (HTML report + streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) \
		$(call HTML,load) \
		--summary-export /scripts/reports/load-summary.json \
		/scripts/scenarios/load.js

stress: ## Run the k6 stress profile (diagnostic; HTML report + streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) \
		$(call HTML,stress) \
		--summary-export /scripts/reports/stress-summary.json \
		/scripts/scenarios/stress.js

spike: ## Run the k6 spike profile (diagnostic; HTML report + streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) \
		$(call HTML,spike) \
		--summary-export /scripts/reports/spike-summary.json \
		/scripts/scenarios/spike.js

soak: ## Run the k6 soak profile (diagnostic, long; HTML report + streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) \
		$(call HTML,soak) \
		--summary-export /scripts/reports/soak-summary.json \
		/scripts/scenarios/soak.js

degradation: ## Run the degradation drill (fault inject + clears; HTML report + streams to Grafana)
	$(COMPOSE) run --rm k6 run $(RW) \
		$(call HTML,degradation) \
		--summary-export /scripts/reports/degradation-summary.json \
		/scripts/scenarios/degradation.js

smoke-breach: ## Demo pipeline failure: injects payment latency then runs smoke (SLOs will breach)
	@echo "--- Injecting 3s payment latency (100% rate) ---"
	curl -fsS -X POST http://localhost:3000/admin/faults \
		-H 'Content-Type: application/json' \
		-d '{"target":"payments","fault":"latency","rate":1.0,"latencyMs":3000,"durationSec":300}' | python3 -m json.tool
	@echo "--- Running smoke with active fault (expect SLO breach on payment p95) ---"
	$(COMPOSE) run --rm k6 run \
		$(call HTML,smoke-breach) \
		--summary-export /scripts/reports/smoke-breach-summary.json \
		/scripts/scenarios/smoke.js; \
	EXIT=$$?; \
	curl -fsS -X DELETE http://localhost:3000/admin/faults >/dev/null; \
	echo "--- Fault cleared ---"; \
	exit $$EXIT

compare-runs: ## Compare two k6 summary JSONs for regressions (BASELINE=path CURRENT=path)
	node scripts/compare-runs.js \
		$(or $(BASELINE),tests/k6/reports/smoke-summary.json) \
		$(or $(CURRENT),tests/k6/reports/load-summary.json)

zap-smoke: ## Run OWASP ZAP baseline scan against the local API (passive, non-blocking)
	TARGET=http://localhost:3000 ./scripts/zap-smoke.sh

fault-clear: ## Clear any active fault injection
	curl -fsS -X DELETE http://localhost:3000/admin/faults && echo
