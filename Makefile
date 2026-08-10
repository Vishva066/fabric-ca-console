.PHONY: help network-up deploy-chaincode network-down copy-crypto docker-build docker-up docker-down all clean restart

# Default target
.DEFAULT_GOAL := help

help: ## Show available Makefile commands
	@echo "Fabric CA Console - Management Commands"
	@echo ""
	@echo "Usage:"
	@echo "  make <target>"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

network-up: ## Start the Hyperledger Fabric test network with Certificate Authority (CA)
	@echo "==> Starting Hyperledger Fabric network with CA..."
	cd test-network && ./network.sh up createChannel -ca

deploy-chaincode: ## Deploy the basic chaincode to the Fabric test network
	@echo "==> Deploying basic chaincode..."
	cd test-network && ./network.sh deployCC -ccn basic -ccp ./asset-transfer-basic/chaincode-go -ccl go

network-down: ## Stop and clean up the Hyperledger Fabric test network
	@echo "==> Stopping Hyperledger Fabric network..."
	cd test-network && ./network.sh down

copy-crypto: ## Copy registrar certificates & keys from test-network to backend/crypto
	@echo "==> Copying Fabric CA registrar crypto material to backend/crypto..."
	mkdir -p backend/crypto
	mkdir -p backend/certs
	cp test-network/organizations/peerOrganizations/org1.example.com/msp/signcerts/cert.pem backend/crypto/cert.pem
	cp test-network/organizations/peerOrganizations/org1.example.com/msp/keystore/*_sk backend/crypto/key.pem
	cp test-network/organizations/fabric-ca/org1/ca-cert.pem backend/crypto/tls-cert.pem
	@echo "==> Crypto material successfully copied to backend/crypto!"

docker-build: ## Build frontend and backend Docker images
	@echo "==> Building Docker Compose images..."
	docker compose up --build -d

docker-up: ## Build and start frontend and backend Docker containers
	@echo "==> Building and launching Docker Compose services..."
	LOCAL_UID=$$(id -u) LOCAL_GID=$$(id -g) docker compose up -d

docker-down: ## Stop and remove Docker containers
	@echo "==> Stopping Docker Compose services..."
	docker compose down --remove-orphans

all: network-up deploy-chaincode copy-crypto docker-up ## Run complete automated setup (network up -> chaincode deploy -> copy crypto -> docker compose up)
	@echo "==> All services are up and running!"
	@echo "    Frontend: http://localhost:3001"
	@echo "    Backend:  http://localhost:3000"

clean: docker-down network-down ## Clean up Docker containers, test network, and copied crypto material
	@echo "==> Cleaning up copied crypto and generated certificates..."
	docker run --rm -v "$(CURDIR)/backend:/backend" busybox sh -c 'rm -rf /backend/crypto /backend/certs'
	@echo "==> Pruning stopped containers, unused volumes, networks, and dangling images..."
	docker container prune -f
	docker volume prune -f
	docker network prune -f
	docker image prune -f
	@echo "==> Docker cleanup completed!"

restart: docker-down docker-up ## Restart Docker containers
