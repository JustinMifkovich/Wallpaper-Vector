FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server .

# distroless/static:nonroot includes CA certs (needed for TLS to the k8s API)
# and runs as non-root by default
FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/server /server
EXPOSE 8000
ENTRYPOINT ["/server"]
