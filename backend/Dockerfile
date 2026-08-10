# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install build dependencies required by some Hyperledger Fabric modules
RUN apk add --no-cache git build-base ca-certificates

# Copy dependency files first to leverage Docker cache
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o ca-backend .

# Final stage
FROM alpine:latest

WORKDIR /app

# Install CA certificates for TLS connections
RUN apk add --no-cache ca-certificates

# Copy the compiled binary from the builder stage
COPY --from=builder /app/ca-backend /app/ca-backend

EXPOSE 3000

CMD ["/app/ca-backend"]
