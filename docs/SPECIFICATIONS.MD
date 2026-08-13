# Fabric CA Console Specifications

This document covers operational configuration, generated artifacts, API endpoints, local development, troubleshooting, and security guidance.

## Test Network Commands

The root quick start runs `make all`, which starts the Fabric test network, deploys sample chaincode, copies registrar credentials, and starts the console.

Run the steps separately when needed:

```bash
make network-up
make deploy-chaincode
make copy-crypto
make docker-up
```

To stop the console and bundled network:

```bash
make docker-down
make network-down
```

`make clean` also removes generated credentials, MSP files, and unused Docker resources.

## Environment Configuration

The Docker deployment is configured in [`../docker-compose.yml`](../docker-compose.yml). For a standalone backend, copy [`../backend/.env.example`](../backend/.env.example) to `backend/.env` and adjust the paths for your environment.

### Backend variables

| Variable | Required | Default | Role |
| --- | --- | --- | --- |
| `FABRIC_CA_SERVER_URL` | No | `https://localhost:7054` | Base URL of the Fabric CA server. |
| `FABRIC_REGISTRAR_CERT_PATH` | Yes in practice | `./crypto/cert.pem` | Registrar enrollment certificate used for administrative requests. |
| `FABRIC_REGISTRAR_KEY_PATH` | Yes in practice | `./crypto/key.pem` | Private key matching the registrar certificate. |
| `FABRIC_CA_CONNECT_TLS_CERT` | Yes for an HTTPS CA | `./crypto/tls-cert.pem` | PEM root certificate used to verify the backend-to-CA TLS connection. |
| `FABRIC_TLSCA_ROOT_CERT` | No | Unset | Optional separate TLS CA root written to enrolled MSPs. If unset, the backend uses the CA chain returned by `/api/v1/cainfo`. |
| `FABRIC_CERT_BASE_DIR` | No | `.` | Base directory for generated MSP and CRL folders. Docker uses `/app/certs`. |
| `CORS_ALLOW_ORIGINS` | No | `http://localhost:3001` | Allowed browser origins for the backend API. |

`FABRIC_CA_CONNECT_TLS_CERT` authenticates the connection from the backend to the CA. `FABRIC_TLSCA_ROOT_CERT` controls the TLS CA certificate written to an identity's MSP when a separate TLS CA is in use.

### Frontend and Compose variables

| Variable | Required | Default in Compose | Role |
| --- | --- | --- | --- |
| `FABRIC_CA_API_URL` | No | `http://backend:3000` | Backend URL used by the frontend container. |
| `LOCAL_UID` / `LOCAL_GID` | No | `1000` when omitted | User and group IDs used for generated files in the backend container. |

## Generated MSP Layout

For a user named `user1` in `org1.example.com`, the default output is:

```text
backend/certs/organizations/org1.example.com/users/user1@org1.example.com/
|-- msp/
|   |-- cacerts/ca.pem
|   |-- config.yaml
|   |-- keystore/priv_sk
|   |-- signcerts/cert.pem
|   `-- tlscacerts/tlsca.pem
`-- crls/crl.pem
```

Peers use `peers/<id>.<org_name>/msp/`; orderers use `orderers/<id>.<org_name>/msp/`. The `msp_dir` request field overrides `FABRIC_CERT_BASE_DIR` for a single enrollment or re-enrollment.

## API Overview

All backend routes are under `/api/v1`:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/cainfo` | Return Fabric CA name, version, and issuer information. |
| `POST` | `/register` | Register an identity through the configured registrar. |
| `POST` | `/enroll` | Enroll an identity and write its MSP. |
| `POST` | `/reenroll` | Renew an existing identity certificate and update its MSP. |
| `POST` | `/revoke` | Revoke an identity or certificate and persist the returned CRL. |
| `GET` | `/identities` | List identities known to the configured CA. |
| `GET` | `/certificates` | List and inspect certificates. |
| `GET` | `/crls` | List identities with generated CRLs. |

See [`../POSTMAN_GUIDE.md`](../POSTMAN_GUIDE.md) for request bodies and response examples.

## Local Development

Start the backend:

```bash
cd backend
cp .env.example .env
# Edit .env and place the referenced PEM files in backend/crypto/
go mod download
go run .
```

The API listens on `http://localhost:3000`.

In another terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev -- --port 3001
```

Validate frontend changes with:

```bash
npm run lint
npm run build
```

## Common Problems

**Backend exits while starting**: Check `FABRIC_CA_CONNECT_TLS_CERT`, its path, and that it contains a valid PEM CA certificate.

**Connection refused or TLS handshake errors**: Confirm `FABRIC_CA_SERVER_URL` is reachable from the backend. In Docker Compose, use the CA service or container address, not `localhost`.

**MSP files appear in an unexpected location**: Check `FABRIC_CERT_BASE_DIR` and the optional `msp_dir` request field.

**`tlscacerts/tlsca.pem` is absent**: Ensure TLS CA discovery succeeds, or set `FABRIC_TLSCA_ROOT_CERT` to a readable PEM file for a separate TLS CA.

**Generated files have the wrong owner**: Run `make docker-up`, which supplies `LOCAL_UID` and `LOCAL_GID`, or set these variables before running Compose.

## Security Notes

- Treat registrar certificates, private keys, and enrollment secrets as production secrets.
- Keep the backend on a private network and put authentication, authorization, and HTTPS in front of it before public exposure.
- Restrict `CORS_ALLOW_ORIGINS` to trusted application origins in production.
- Mount the registrar credential directory read-only.
- Back up generated MSP material securely; lost private keys cannot be recovered from Fabric CA.
- Never include real credentials or private keys in logs, screenshots, issues, or committed `.env` files.