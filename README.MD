<div align="center">

<img src="frontend/public/fabric-logo.svg" alt="Fabric CA Console Logo" width="100" height="100" />

# Fabric CA Console

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.23%2B-00ADD8?logo=go)](https://go.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-supported-2496ED?logo=docker)](https://docs.docker.com/compose/)

</div>

Fabric CA Console is an open-source web console and API gateway for managing identities and certificates issued by [Hyperledger Fabric CA](https://hyperledger-fabric-ca.readthedocs.io/).

It provides a browser-based workflow for registering identities, enrolling certificates, creating Fabric MSP directories, renewing credentials, revoking certificates, inspecting certificates, and tracking generated CRLs. The Go backend handles the cryptographic work and signs administrative requests to Fabric CA; the Next.js frontend provides the operational interface.

> This project is intended for development, test networks, and deployments where the operator can securely manage registrar credentials. Review the security guidance before exposing it outside a trusted network.

## Features

- CA status and issuer information through the dashboard and `/api/v1/cainfo`.
- Identity registration with type, affiliation, and Fabric CA attributes.
- Enrollment for `client`, `user`, `admin`, `peer`, and `orderer` identities.
- Automatic private-key, signing-certificate, CA-chain, TLS CA, and NodeOU MSP files.
- Custom CSR subject fields and DNS/IP SANs during enrollment.
- Re-enrollment using an existing identity, with optional CSR replacement.
- Identity and certificate revocation with CRL persistence.
- Certificate listing, filtering, decoding, expiry inspection, and revocation status.
- Docker Compose deployment for the frontend and backend.
- Postman examples for exercising the backend directly.

## Architecture

```text
Browser
  |
  v
Next.js frontend
  |
  v
Go/Fiber API  ---- TLS ---->  Hyperledger Fabric CA
  |
  +---- registrar certificate and private key
  +---- generated MSP and CRL files
```

The backend is a proxy rather than a replacement for Fabric CA. It authenticates administrative operations with a registrar certificate and ECDSA private key, performs enrollment and re-enrollment operations, and writes the returned artifacts into Fabric-compatible directories.

## Requirements

For the Docker workflow:

- Docker Engine 20.10 or newer
- Docker Compose v2
- GNU Make (optional)
- A running Hyperledger Fabric CA
- A Docker network that can reach the Fabric CA container

For local development:

- Go 1.23 or newer
- Node.js compatible with Next.js 16
- npm
- A reachable Fabric CA and its TLS root certificate

The bundled `test-network` is useful for development and demonstration. It is not required when connecting to an existing Fabric network.

## Quick Start With the Test Network

### 1. Start the Fabric test network

From the repository root:

```bash
make network-up
```

This runs the Fabric test network with a channel and certificate authorities. The Compose configuration expects the external Docker network `fabric_test`.

### 2. Copy the registrar material

```bash
make copy-crypto
```

This copies the Org1 registrar certificate, private key, and CA certificate into `backend/crypto/`, and creates `backend/certs/` for generated output.

The files in `backend/crypto/` are credentials. Do not commit them or publish them in an issue, log, container image, or release artifact.

### 3. Build and start the console

```bash
make docker-up
```

Open the frontend at [http://localhost:3001](http://localhost:3001). The backend API is available at [http://localhost:3000](http://localhost:3000).

The frontend container uses `FABRIC_CA_API_URL=http://backend:3000` to reach the backend over the Compose network. The browser normally calls the frontend-relative `/api/v1/...` routes.

To deploy the sample chaincode as well:

```bash
make deploy-chaincode
```

To stop everything:

```bash
make docker-down
make network-down
```

To perform a full cleanup (removes everything including containers, unused volumes, networks, and generated crypto/MSP material):

```bash
make clean
```

> **Note:** `make clean` will remove everything, including Docker containers, networks, volume storage, and generated certificates.

`make all` runs `network-up`, deploys the sample chaincode, copies crypto material, and starts the containers. Use it only when that complete test-network setup is what you want.

## Environment Configuration

The Docker deployment is configured in [`docker-compose.yml`](docker-compose.yml). For a standalone backend, copy [`backend/.env.example`](backend/.env.example) to `backend/.env` and adjust the paths for your environment.

### Backend variables

| Variable | Required | Default | Role |
| --- | --- | --- | --- |
| `FABRIC_CA_SERVER_URL` | No | `https://localhost:7054` | Base URL of the Fabric CA server. The backend appends Fabric CA API paths such as `/api/v1/register` and `/api/v1/enroll`. |
| `FABRIC_REGISTRAR_CERT_PATH` | Yes in practice | `./crypto/cert.pem` | PEM certificate for the registrar/admin identity used to sign administrative requests such as registration and revocation. |
| `FABRIC_REGISTRAR_KEY_PATH` | Yes in practice | `./crypto/key.pem` | PEM private key matching the registrar certificate. The backend imports it through Fabric BCCSP to create authorization tokens. |
| `FABRIC_CA_CONNECT_TLS_CERT` | Yes for an HTTPS CA | `./crypto/tls-cert.pem` | PEM root CA certificate used to verify the TLS connection to the Fabric CA. The backend fails during startup if this file cannot be read or parsed. |
| `FABRIC_TLSCA_ROOT_CERT` | No | Unset | Optional PEM root certificate for a separate TLS CA. When set, its contents are stored in each enrolled identity's `msp/tlscacerts/tlsca.pem`. When unset, the backend attempts to obtain the live `CAChain` from `/api/v1/cainfo`. |
| `FABRIC_CERT_BASE_DIR` | No | `.` | Base directory for generated MSP and CRL folders. In Docker this is `/app/certs`, persisted to the host at `./backend/certs`. |

`FABRIC_CA_CONNECT_TLS_CERT` and `FABRIC_TLSCA_ROOT_CERT` have different jobs:

- `FABRIC_CA_CONNECT_TLS_CERT` authenticates the **connection from the backend to the CA**.
- `FABRIC_TLSCA_ROOT_CERT` controls the TLS CA certificate **written into generated identity MSPs**. It is useful when the TLS CA is separate from the enrollment/signing CA.

### Frontend and Compose variables

| Variable | Required | Default in Compose | Role |
| --- | --- | --- | --- |
| `FABRIC_CA_API_URL` | No | `http://backend:3000` | URL the frontend container uses for backend API requests. Set this to the backend service address visible from the frontend container, not necessarily the browser address. |
| `BACKEND_PORT` | No | Not consumed by the current Compose file | Document your chosen host port when customizing the backend mapping. Keep the frontend's backend URL and browser access consistent. |
| `FRONTEND_PORT` | No | Not consumed by the current Compose file | Document your chosen host port when customizing the frontend mapping. The current Compose mapping is `3001:3000`. |
| `LOCAL_UID` / `LOCAL_GID` | No | `1000` when omitted | User and group IDs used by the backend container so generated files are writable by the local developer. `make docker-up` supplies the current user's IDs automatically. |

The Compose file also uses `fabric_test` as an external network. Create it, or start the bundled test network which creates it, before running `docker compose up`:

```bash
docker network inspect fabric_test >/dev/null 2>&1 || docker network create fabric_test
```

### Example standalone backend environment

```dotenv
FABRIC_CA_SERVER_URL=https://localhost:7054
FABRIC_REGISTRAR_CERT_PATH=./crypto/cert.pem
FABRIC_REGISTRAR_KEY_PATH=./crypto/key.pem
FABRIC_CA_CONNECT_TLS_CERT=./crypto/tls-cert.pem
# Set this only when a separate TLS CA is used.
# FABRIC_TLSCA_ROOT_CERT=./crypto/tlsca-cert.pem
FABRIC_CERT_BASE_DIR=./certs
```

Do not place private keys, enrollment secrets, or production credentials in a committed `.env` file. Use a secret manager or deployment-specific secret injection for shared environments.

## Generated MSP Layout

For an identity named `user1` in `org1.example.com`, the default output is:

```text
backend/certs/organizations/org1.example.com/users/user1@org1.example.com/
├── msp/
│   ├── cacerts/ca.pem
│   ├── config.yaml
│   ├── keystore/priv_sk
│   ├── signcerts/cert.pem
│   └── tlscacerts/tlsca.pem
└── crls/crl.pem                 # created when a CRL is returned
```

Peers use `peers/<id>.<org_name>/msp/`, and orderers use `orderers/<id>.<org_name>/msp/`. The `msp_dir` request field can override `FABRIC_CERT_BASE_DIR` for an individual enrollment or re-enrollment. Generated private keys are written with restricted permissions where supported by the host filesystem.

## API Overview

All backend routes are under `/api/v1`:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/cainfo` | Return Fabric CA name, version, and issuer information. |
| `POST` | `/register` | Register an identity through the configured registrar. |
| `POST` | `/enroll` | Enroll an identity, generate a key and CSR, and write an MSP. |
| `POST` | `/reenroll` | Renew an existing identity certificate and update its MSP. |
| `POST` | `/revoke` | Revoke an identity or certificate and persist the returned CRL. |
| `GET` | `/identities` | List identities known to the configured CA. |
| `GET` | `/certificates` | List and inspect certificates. |
| `GET` | `/crls` | List identities with generated CRLs. |

See [`POSTMAN_GUIDE.md`](POSTMAN_GUIDE.md) for request bodies, response examples, and a ready-to-follow API testing workflow.

## Local Development

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env and place the referenced PEM files in backend/crypto/
go mod download
go run .
```

The API listens on `http://localhost:3000`.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The development UI listens on `http://localhost:3000` by default. If the backend also uses port `3000`, start Next.js on another port:

```bash
npm run dev -- --port 3001
```

Useful frontend checks:

```bash
npm run lint
npm run build
```

## Common Problems

**Backend exits while starting**

Check `FABRIC_CA_CONNECT_TLS_CERT`, its mounted path, and that the file contains a valid PEM CA certificate. The backend intentionally refuses to start without a usable trust root for an HTTPS Fabric CA.

**Connection refused or TLS handshake errors**

Confirm that `FABRIC_CA_SERVER_URL` is reachable from the backend container. In Compose, use the Fabric CA service/container name and port, not `localhost`; inside a container, `localhost` means that same container.

**MSP files are created in an unexpected location**

Check `FABRIC_CERT_BASE_DIR` and the optional `msp_dir` request field. A request-level `msp_dir` takes precedence over the environment variable.

**`tlscacerts/tlsca.pem` is absent**

This file is skipped when TLS CA discovery fails or when an enrollment/re-enrollment request sets `skip_tls_ca_cert` to `true`. For a separate TLS CA, set `FABRIC_TLSCA_ROOT_CERT` to a readable PEM file.

**Generated files are owned by the wrong user**

Run Docker Compose through `make docker-up`, which passes `LOCAL_UID` and `LOCAL_GID`, or set those variables explicitly before starting the containers.

## Security Notes

- Treat registrar certificates and private keys as production secrets.
- Keep the backend on a private network and place authentication, authorization, and HTTPS in front of it before exposing it publicly.
- The backend currently enables permissive CORS middleware; restrict CORS at the deployment boundary for production use.
- Mount `backend/crypto` read-only, as the Compose configuration does by default.
- Back up generated MSP material securely. Private keys cannot be recovered from Fabric CA after they are lost.
- Never send real credentials or private keys in bug reports. Redact certificate contents and enrollment secrets from logs and screenshots.

## Contributing

Contributions are welcome! If you are open to contributing, there are open issues available.

Guidelines for contributing:
1. First, create an issue to explain the problem or feature request before starting work.
2. Once the issue is discussed, create a pull request with focused changes that preserve compatibility with existing API request fields.
3. Update documentation when behavior changes.

## License

Fabric CA Console is released under the [Apache License 2.0](LICENSE).
