package main

import (
	"log"
	"os"

	"ca/api"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/hyperledger/fabric-lib-go/bccsp"
	"github.com/hyperledger/fabric-lib-go/bccsp/factory"
)

func main() {
	// Initialize BCCSP (Blockchain Crypto Service Provider)
	csp, err := initBCCSP()
	if err != nil {
		log.Fatalf("Failed to initialize BCCSP: %v", err)
	}

	// Initialize API Handler
	handler := api.NewHandler(csp)

	// Initialize Fiber app
	app := fiber.New()

	// Middleware
	app.Use(logger.New())

	// Configure CORS
	allowedOrigins := os.Getenv("CORS_ALLOW_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:3001"
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins: allowedOrigins,
	}))

	apiGroup := app.Group("/api/v1")
	apiGroup.Get("/cainfo", handler.GetCAInfo)
	apiGroup.Post("/register", handler.RegisterIdentity)
	apiGroup.Post("/enroll", handler.EnrollIdentity)
	apiGroup.Post("/reenroll", handler.ReenrollIdentity)
	apiGroup.Post("/revoke", handler.RevokeIdentity)
	apiGroup.Get("/crls", handler.GetCRLList)
	apiGroup.Get("/identities", handler.ListIdentities)
	apiGroup.Get("/certificates", handler.GetCertificates)

	// Start server
	log.Fatal(app.Listen(":3000"))
}

// initBCCSP initializes the BCCSP with default configuration
func initBCCSP() (bccsp.BCCSP, error) {
	// Use SW (Software) based BCCSP with SHA256 and omitting FileKeystore opts
	// to prevent auto-generating an empty keystore folder
	opts := &factory.FactoryOpts{
		Default: "SW",
		SW: &factory.SwOpts{
			Hash:     "SHA2",
			Security: 256,
		},
	}

	return factory.GetBCCSPFromOpts(opts)
}
