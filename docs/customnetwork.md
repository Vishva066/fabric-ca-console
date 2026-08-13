# Connect to a Private Fabric Network

Use this guide when the console should manage an existing Fabric CA instead of the bundled `test-network`.

## Prerequisites

- A reachable Fabric CA URL and its TLS root certificate.
- A registrar enrollment certificate and its matching private key. The registrar must have the privileges needed to register, revoke, and inspect identities.
- A Docker network that can reach the Fabric CA when the backend runs in Docker.

## Prepare Console Credentials

Create local directories for the registrar material and generated MSP files:

```bash
mkdir -p backend/crypto backend/certs
```

Place these files in `backend/crypto/`

```text
backend/crypto/cert.pem      # registrar enrollment certificate
backend/crypto/key.pem       # matching registrar private key
backend/crypto/tls-cert.pem  # TLS cert that verifies the Fabric CA server
```

For a deployment that uses a dedicated TLS CA, also provide its root certificate and configure `FABRIC_TLSCA_ROOT_CERT`.

## Configure Docker Compose

The supplied [`../docker-compose.yml`](../docker-compose.yml) targets the bundled CA at `ca_org1:7054` on the `fabric_test` Docker network. Create a deployment-specific Compose override or edit a private copy with these changes:

1. Set `FABRIC_CA_SERVER_URL` to the CA address reachable from the backend container, for example `https://ca.example.internal:7054`.
2. Keep `FABRIC_REGISTRAR_CERT_PATH`, `FABRIC_REGISTRAR_KEY_PATH`, and `FABRIC_CA_CONNECT_TLS_CERT` pointed at the mounted `/app/crypto` files.
3. Set `CORS_ALLOW_ORIGINS` to the browser origin that will serve the console.
4. Set `FABRIC_CA_API_URL` to the backend service address visible from the frontend container, usually `http://backend:3000`.
5. Replace `fabric_test` with the Docker network that can route to your CA, or attach the backend to an additional external network.

Create an external Docker network only when the CA is also attached to it:

```bash
docker network create fabric_private
```

Then update the Compose network definition:

```yaml
networks:
  fabric_private:
    external: true
```

Attach the backend service to `fabric_private`. The frontend needs access only to the backend unless it must reach other services.

## Start the Console

After adapting the Compose configuration, start the services from the repository root:

```bash
LOCAL_UID=$(id -u) LOCAL_GID=$(id -g) docker compose up -d --build
```

Confirm that the backend can connect to the CA by opening the console and loading CA information, or by requesting `GET /api/v1/cainfo` through the backend.

## Standalone Backend

For a non-Docker backend, copy [`../backend/.env.example`](../backend/.env.example) to `backend/.env`, set the CA URL and local credential paths, then run:

```bash
cd backend
go run .
```

Start the frontend separately with `FABRIC_CA_API_URL` pointing to the reachable backend URL. See [SPECIFICATIONS.MD](SPECIFICATIONS.MD) for the complete variable reference and local development commands.

## Network Checklist

- The backend container resolves and reaches the configured Fabric CA hostname and port.
- The TLS certificate chain presented by the CA is trusted by `FABRIC_CA_CONNECT_TLS_CERT`.
- The registrar certificate and private key match and are readable by the backend.
- The configured Docker network provides a route from backend to CA.
- Generated MSP files are stored in a persistent, access-controlled volume.