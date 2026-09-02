# Build stage
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Install build dependencies required by some Hyperledger Fabric modules and apply security patches
RUN apk upgrade --no-cache && apk add --no-cache git build-base ca-certificates

# Copy dependency files first to leverage Docker cache
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o ca-backend .

# Final stage - using latest N-1 Alpine image
FROM alpine:3.23

WORKDIR /app

# Install CA certificates for TLS connections and apply security patches
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates

# Copy the compiled binary from the builder stage
COPY --from=builder /app/ca-backend /app/ca-backend

EXPOSE 3000

CMD ["/app/ca-backend"]
