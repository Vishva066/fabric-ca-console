package api

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	util "ca/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/hyperledger/fabric-lib-go/bccsp"
)

// Handler holds dependencies for API handlers
type Handler struct {
	BCCSP           bccsp.BCCSP
	FabricCAURL     string
	AdminCertPath   string
	AdminKeyPath    string
	TLSCABundlePath string
	HTTPClient      *http.Client
}

// NewHandler creates a new Handler instance
func NewHandler(csp bccsp.BCCSP) *Handler {
	caURL := os.Getenv("FABRIC_CA_SERVER_URL")
	if caURL == "" {
		caURL = "https://localhost:7054"
	}

	certPath := os.Getenv("FABRIC_REGISTRAR_CERT_PATH")
	if certPath == "" {
		certPath = "./crypto/cert.pem"
	}

	keyPath := os.Getenv("FABRIC_REGISTRAR_KEY_PATH")
	if keyPath == "" {
		keyPath = "./crypto/key.pem"
	}

	tlsRootCertPath := os.Getenv("FABRIC_CA_CONNECT_TLS_CERT")
	if tlsRootCertPath == "" {
		tlsRootCertPath = "./crypto/tls-cert.pem"
	}

	// Load CA Root Certificate
	caCert, err := os.ReadFile(tlsRootCertPath)
	if err != nil {
		log.Fatalf("Failed to read CA root certificate from %s: %v", tlsRootCertPath, err)
	}

	caCertPool := x509.NewCertPool()
	if ok := caCertPool.AppendCertsFromPEM(caCert); !ok {
		log.Fatalf("Failed to append CA root certificate from %s", tlsRootCertPath)
	}

	// Configure TLS to trust the CA root cert
	tlsConfig := &tls.Config{
		RootCAs: caCertPool,
	}
	tr := &http.Transport{
		TLSClientConfig: tlsConfig,
	}
	client := &http.Client{Transport: tr}

	return &Handler{
		BCCSP:           csp,
		FabricCAURL:     caURL,
		AdminCertPath:   certPath,
		AdminKeyPath:    keyPath,
		TLSCABundlePath: tlsRootCertPath,
		HTTPClient:      client,
	}
}

// fetchCAChainFromCAInfo fetches the live CA signing chain from the Fabric CA's
// /api/v1/cainfo endpoint over the already-trusted h.HTTPClient connection (its
// RootCAs pool is already seeded from FABRIC_CA_CONNECT_TLS_CERT in NewHandler,
// so this requires no insecure/skip-verify bootstrap). result.CAChain is a
// base64 PEM-encoded certificate chain, returned as a direct field of "result".
func (h *Handler) fetchCAChainFromCAInfo() ([]byte, error) {
	targetURL := fmt.Sprintf("%s/api/v1/cainfo", h.FabricCAURL)

	resp, err := h.HTTPClient.Get(targetURL)
	if err != nil {
		return nil, fmt.Errorf("failed to contact Fabric CA /cainfo: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read /cainfo response: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("/cainfo returned status %d: %s", resp.StatusCode, string(body))
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse /cainfo response: %v", err)
	}

	resultData, ok := parsed["result"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid /cainfo response structure")
	}

	chainB64, ok := resultData["CAChain"].(string)
	if !ok || chainB64 == "" {
		return nil, fmt.Errorf("/cainfo response missing CAChain")
	}

	chainPEM, err := util.B64Decode(chainB64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode CAChain: %v", err)
	}

	return chainPEM, nil
}

// ResolveTLSCACert resolves the TLS CA certificate to write into an identity's
// tlscacerts MSP folder, using a 2-tier lookup:
//  1. FABRIC_TLSCA_ROOT_CERT env var — explicit, out-of-band cert for a
//     dedicated/separate TLS CA.
//  2. Live /cainfo CAChain — covers the common case where the enrollment CA
//     itself also issues TLS certs (combined signing+TLS capability).
//
// Never blocks the caller — logs a warning and returns nil if unavailable, in
// which case StoreMSP simply skips writing tlscacerts for that identity.
func (h *Handler) ResolveTLSCACert() []byte {
	if certPEM, isSet, err := util.FetchExplicitTLSCACert(); isSet {
		if err != nil {
			log.Printf("Warning: FABRIC_TLSCA_ROOT_CERT is set but failed to read cert: %v", err)
			return nil
		}
		return certPEM
	}

	certPEM, err := h.fetchCAChainFromCAInfo()
	if err != nil {
		log.Printf("Warning: failed to fetch TLS CA chain from /cainfo: %v", err)
		return nil
	}
	return certPEM
}

// GetCAInfo proxies the request to Fabric CA /api/v1/cainfo
func (h *Handler) GetCAInfo(c *fiber.Ctx) error {
	targetURL := fmt.Sprintf("%s/api/v1/cainfo", h.FabricCAURL)

	resp, err := h.HTTPClient.Get(targetURL)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to contact Fabric CA: %v", err),
		})
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to read response from Fabric CA: %v", err),
		})
	}

	// Forward the status code and body
	c.Status(resp.StatusCode)
	c.Set("Content-Type", "application/json")
	return c.Send(body)
}

// RegisterIdentity proxies the request to Fabric CA /api/v1/register
func (h *Handler) RegisterIdentity(c *fiber.Ctx) error {
	// 1. Parse request body
	var reqBody map[string]interface{}
	if err := c.BodyParser(&reqBody); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}
	// We need the raw body bytes for token generation and forwarding
	bodyBytes := c.Body()

	// 2. Read Admin Cert and Key
	certPEM, err := os.ReadFile(h.AdminCertPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to read admin cert: %v", err),
		})
	}

	keyPEM, err := os.ReadFile(h.AdminKeyPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to read admin key: %v", err),
		})
	}

	// 3. Import Admin Private Key
	adminKey, err := util.ImportPrivateKey(h.BCCSP, keyPEM)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to import admin key: %v", err),
		})
	}

	// 4. Generate Auth Token
	method := "POST"
	uri := "/api/v1/register"
	token, err := util.CreateToken(h.BCCSP, certPEM, adminKey, method, uri, bodyBytes)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create auth token: %v", err),
		})
	}

	// 5. Proxy Request to Fabric CA
	targetURL := fmt.Sprintf("%s%s", h.FabricCAURL, uri)
	req, err := http.NewRequest(method, targetURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create request: %v", err),
		})
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", token)

	resp, err := h.HTTPClient.Do(req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to contact Fabric CA: %v", err),
		})
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to read response from Fabric CA: %v", err),
		})
	}

	// 6. Parse response and return a clean success message
	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		var caResp map[string]interface{}
		if err := json.Unmarshal(respBody, &caResp); err == nil {
			// Extract the identity ID from our request body for the message
			idVal, _ := reqBody["id"].(string)
			return c.Status(fiber.StatusCreated).JSON(fiber.Map{
				"success": true,
				"message": fmt.Sprintf("Identity '%s' registered successfully", idVal),
			})
		}
	}

	// Return error response as-is from Fabric CA
	c.Status(resp.StatusCode)
	c.Set("Content-Type", "application/json")
	return c.Send(respBody)
}

// EnrollIdentity handles identity enrollment
func (h *Handler) EnrollIdentity(c *fiber.Ctx) error {
	type CSRNames struct {
		Country            string `json:"country,omitempty"`
		State              string `json:"state,omitempty"`
		Organization       string `json:"organization,omitempty"`
		OrganizationalUnit string `json:"organizational_unit,omitempty"`
	}

	type EnrollRequest struct {
		ID            string    `json:"id"`
		Secret        string    `json:"secret"`
		OrgName       string    `json:"org_name"`
		IdentityType  string    `json:"identity_type"` // peer, orderer, client, user, admin
		CSRHosts      []string  `json:"csr_hosts,omitempty"`
		CSRNames      *CSRNames `json:"csr_names,omitempty"`
		MSPDir        string    `json:"msp_dir,omitempty"`          // optional: override FABRIC_CERT_BASE_DIR for MSP storage
		SkipTLSCACert bool      `json:"skip_tls_ca_cert,omitempty"` // optional: skip writing tlscacerts entirely
	}

	var req EnrollRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.ID == "" || req.Secret == "" || req.OrgName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Enrollment ID, Secret, and OrgName are required",
		})
	}

	// Default identity type to "client" if not provided
	if req.IdentityType == "" {
		req.IdentityType = "client"
	}

	// Build default CSR subject names.
	csrSubject := pkix.Name{
		CommonName:         req.ID,
		Country:            []string{"US"},
		Province:           []string{"North Carolina"},
		Organization:       []string{"Hyperledger"},
		OrganizationalUnit: []string{"Fabric"},
	}
	if req.CSRNames != nil {
		if req.CSRNames.Country != "" {
			csrSubject.Country = []string{req.CSRNames.Country}
		}
		if req.CSRNames.State != "" {
			csrSubject.Province = []string{req.CSRNames.State}
		}
		if req.CSRNames.Organization != "" {
			csrSubject.Organization = []string{req.CSRNames.Organization}
		}
		if req.CSRNames.OrganizationalUnit != "" {
			csrSubject.OrganizationalUnit = []string{req.CSRNames.OrganizationalUnit}
		}
	}

	// 1. Generate Private Key
	key, keyPEM, err := util.GeneratePrivateKey()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to generate private key: %v", err),
		})
	}

	// 2. Generate CSR
	csrPEM, err := util.GenerateCSR(key, req.ID, req.CSRHosts, &csrSubject)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to generate CSR: %v", err),
		})
	}

	// 3. Prepare Request to Fabric CA
	// Enroll endpoint expects Basic Auth and a JSON body with "certificate_request"
	caReqBody := map[string]string{
		"certificate_request": string(csrPEM),
	}
	caReqJSON, _ := json.Marshal(caReqBody)

	targetURL := fmt.Sprintf("%s/api/v1/enroll", h.FabricCAURL)
	caReq, err := http.NewRequest("POST", targetURL, bytes.NewBuffer(caReqJSON))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create request: %v", err),
		})
	}

	caReq.SetBasicAuth(req.ID, req.Secret)
	caReq.Header.Set("Content-Type", "application/json")

	// 4. Send Request
	resp, err := h.HTTPClient.Do(caReq)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to contact Fabric CA: %v", err),
		})
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to read response from Fabric CA: %v", err),
		})
	}

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return c.Status(resp.StatusCode).Send(respBody)
	}

	// 5. Parse Response and Generate MSP Folder
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to parse CA response",
		})
	}

	resultData, ok := result["result"].(map[string]interface{})
	if !ok {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Invalid CA response structure"})
	}

	// Extract Cert
	certB64, _ := resultData["Cert"].(string)
	certPEM, err := util.B64Decode(certB64)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to decode cert"})
	}

	// Extract CA Chain
	var caChainPEM []byte
	if serverInfo, ok := resultData["ServerInfo"].(map[string]interface{}); ok {
		if chainB64, ok := serverInfo["CAChain"].(string); ok {
			caChainPEM, _ = util.B64Decode(chainB64)
		}
	}

	// 6. Store MSP folder structure
	// Use the caller-supplied msp_dir if provided; otherwise fall back to FABRIC_CERT_BASE_DIR
	baseDir := req.MSPDir
	if baseDir == "" {
		baseDir = util.GetBaseDir()
	}
	var tlsCACertPEM []byte
	if !req.SkipTLSCACert {
		tlsCACertPEM = h.ResolveTLSCACert()
	}
	mspPath, err := util.StoreMSP(baseDir, req.OrgName, req.ID, req.IdentityType, keyPEM, certPEM, caChainPEM, tlsCACertPEM)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to generate MSP folder: %v", err),
		})
	}

	// Inject additional info into the result response
	resultData["PrivateKey"] = string(keyPEM)
	resultData["MSPPath"] = mspPath
	resultData["CSRHosts"] = req.CSRHosts
	resultData["CSRSubject"] = fiber.Map{
		"country":             csrSubject.Country,
		"state":               csrSubject.Province,
		"organization":        csrSubject.Organization,
		"organizational_unit": csrSubject.OrganizationalUnit,
	}

	return c.Status(http.StatusCreated).JSON(result)
}

// ReenrollIdentity proxies the request to Fabric CA /api/v1/reenroll
// CSR is optional — if not provided, a new key+CSR is auto-generated.
// The identity's existing MSP cert+key are used to generate the auth token.
func (h *Handler) ReenrollIdentity(c *fiber.Ctx) error {
	type ReenrollRequest struct {
		ID            string `json:"id"`
		OrgName       string `json:"org_name"`
		IdentityType  string `json:"identity_type"` // peer, orderer, client, user, admin
		CSR           string `json:"certificate_request,omitempty"`
		MSPDir        string `json:"msp_dir,omitempty"`
		SkipTLSCACert bool   `json:"skip_tls_ca_cert,omitempty"` // optional: skip writing tlscacerts entirely
	}

	var req ReenrollRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON"})
	}

	if req.ID == "" || req.OrgName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id and org_name are required",
		})
	}

	if req.IdentityType == "" {
		req.IdentityType = "client"
	}

	// 1. Resolve the identity's existing MSP path to read cert+key for auth token
	// Use caller-supplied msp_dir if provided; otherwise fall back to FABRIC_CERT_BASE_DIR
	baseDir := req.MSPDir
	if baseDir == "" {
		baseDir = util.GetBaseDir()
	}
	mspPaths, err := util.GetMSPPath(baseDir, req.ID, req.OrgName, req.IdentityType)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to resolve MSP path: %v", err),
		})
	}

	// Read the identity's existing signing cert and private key
	existingCertPath := mspPaths.SignCerts + "/cert.pem"
	existingKeyPath := mspPaths.Keystore + "/priv_sk"

	identityCertPEM, err := os.ReadFile(existingCertPath)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("Identity cert not found at %s. The identity must be enrolled first.", existingCertPath),
		})
	}

	identityKeyPEM, err := os.ReadFile(existingKeyPath)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fmt.Sprintf("Identity key not found at %s. The identity must be enrolled first.", existingKeyPath),
		})
	}

	// 2. Handle CSR: auto-generate if not provided
	var csrPEM string
	var newKeyPEM []byte
	if req.CSR != "" {
		// Use the CSR provided by the caller
		csrPEM = req.CSR
	} else {
		// Auto-generate a new key + CSR
		newKey, newKeyBytes, err := util.GeneratePrivateKey()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": fmt.Sprintf("Failed to generate private key: %v", err),
			})
		}
		newKeyPEM = newKeyBytes

		csrBytes, err := util.GenerateCSR(newKey, req.ID, nil, nil)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": fmt.Sprintf("Failed to generate CSR: %v", err),
			})
		}
		csrPEM = string(csrBytes)
	}

	// 3. Build the Fabric CA payload
	caPayload := map[string]string{
		"certificate_request": csrPEM,
	}
	caBodyBytes, _ := json.Marshal(caPayload)

	// 4. Generate auth token using the identity's EXISTING cert+key
	identityKey, err := util.ImportPrivateKey(h.BCCSP, identityKeyPEM)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to import identity key: %v", err),
		})
	}

	method := "POST"
	uri := "/api/v1/reenroll"
	token, err := util.CreateToken(h.BCCSP, identityCertPEM, identityKey, method, uri, caBodyBytes)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create auth token: %v", err),
		})
	}

	// 5. Send reenroll request to Fabric CA
	targetURL := fmt.Sprintf("%s/api/v1/reenroll", h.FabricCAURL)
	proxyReq, err := http.NewRequest(method, targetURL, bytes.NewBuffer(caBodyBytes))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to create request: %v", err),
		})
	}

	proxyReq.Header.Set("Content-Type", "application/json")
	proxyReq.Header.Set("Authorization", token)

	resp, err := h.HTTPClient.Do(proxyReq)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to contact Fabric CA: %v", err),
		})
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to read response from Fabric CA: %v", err),
		})
	}

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return c.Status(resp.StatusCode).Send(respBody)
	}

	// 6. Parse response and update MSP
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return c.Status(fiber.StatusOK).Send(respBody)
	}

	resultData, ok := result["result"].(map[string]interface{})
	if !ok {
		return c.Status(fiber.StatusOK).Send(respBody)
	}

	// Extract new cert
	certB64, _ := resultData["Cert"].(string)
	newCertPEM, err := util.B64Decode(certB64)
	if err != nil {
		log.Printf("Warning: failed to decode reenroll cert: %v", err)
		return c.Status(fiber.StatusOK).Send(respBody)
	}

	// Extract CA Chain
	var caChainPEM []byte
	if serverInfo, ok := resultData["ServerInfo"].(map[string]interface{}); ok {
		if chainB64, ok := serverInfo["CAChain"].(string); ok {
			caChainPEM, _ = util.B64Decode(chainB64)
		}
	}

	// If we auto-generated a new key, store it; otherwise only update certs
	var tlsCACertPEM []byte
	if !req.SkipTLSCACert {
		tlsCACertPEM = h.ResolveTLSCACert()
	}
	mspPath, err := util.StoreMSP(baseDir, req.OrgName, req.ID, req.IdentityType, newKeyPEM, newCertPEM, caChainPEM, tlsCACertPEM)
	if err != nil {
		log.Printf("Warning: failed to update MSP folder: %v", err)
	} else {
		resultData["MSPPath"] = mspPath
	}

	return c.Status(resp.StatusCode).JSON(result)
}

// RevokeIdentity revokes an identity or certificate and stores the CRL alongside the identity's MSP folder.
// Request body must include org_name and identity_type so the CRL can be stored in the correct location.
// gencrl is automatically set to true.
func (h *Handler) RevokeIdentity(c *fiber.Ctx) error {
	// 1. Parse the request to extract our custom fields + revocation params
	var reqMap map[string]interface{}
	if err := c.BodyParser(&reqMap); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON"})
	}

	// Extract identity location fields (for CRL storage)
	revokeID, _ := reqMap["id"].(string)
	orgName, _ := reqMap["org_name"].(string)
	identityType, _ := reqMap["identity_type"].(string)

	if orgName == "" || identityType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "org_name and identity_type are required to store the CRL",
		})
	}

	if revokeID == "" {
		// If no id, serial+aki must be present — we still need an id for the CRL path
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id is required (the identity whose CRL folder will be used)",
		})
	}

	// 2. Build clean Fabric CA payload (strip our custom fields, force gencrl)
	caPayload := map[string]interface{}{}
	if v, ok := reqMap["id"]; ok {
		caPayload["id"] = v
	}
	if v, ok := reqMap["serial"]; ok {
		caPayload["serial"] = v
	}
	if v, ok := reqMap["aki"]; ok {
		caPayload["aki"] = v
	}
	if v, ok := reqMap["reason"]; ok {
		caPayload["reason"] = v
	}
	if v, ok := reqMap["caname"]; ok {
		caPayload["caname"] = v
	}
	// Always generate CRL
	caPayload["gencrl"] = true

	bodyBytes, _ := json.Marshal(caPayload)

	// 3. Read/Import Admin credentials
	certPEM, err := os.ReadFile(h.AdminCertPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read admin cert"})
	}
	keyPEM, err := os.ReadFile(h.AdminKeyPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read admin key"})
	}
	adminKey, err := util.ImportPrivateKey(h.BCCSP, keyPEM)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to import admin key"})
	}

	// 4. Generate Auth Token
	method := "POST"
	uri := "/api/v1/revoke"
	token, err := util.CreateToken(h.BCCSP, certPEM, adminKey, method, uri, bodyBytes)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Failed to create token: %v", err)})
	}

	// 5. Send revocation request
	targetURL := fmt.Sprintf("%s/api/v1/revoke", h.FabricCAURL)
	proxyReq, err := http.NewRequest(method, targetURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create request"})
	}

	proxyReq.Header.Set("Content-Type", "application/json")
	proxyReq.Header.Set("Authorization", token)

	resp, err := h.HTTPClient.Do(proxyReq)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Backend connection failed: %v", err)})
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read response"})
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		c.Status(resp.StatusCode)
		c.Set("Content-Type", "application/json")
		return c.Send(respBody)
	}

	// 6. Parse response and extract CRL
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		c.Status(resp.StatusCode)
		c.Set("Content-Type", "application/json")
		return c.Send(respBody)
	}

	resultData, _ := result["result"].(map[string]interface{})
	if resultData != nil {
		crlB64, _ := resultData["CRL"].(string)
		if crlB64 != "" {
			crlPEM, err := util.B64Decode(crlB64)
			if err != nil {
				log.Printf("Warning: failed to decode CRL: %v", err)
			} else {
				baseDir := util.GetBaseDir()
				crlPath, err := util.StoreCRL(baseDir, orgName, revokeID, identityType, crlPEM)
				if err != nil {
					log.Printf("Warning: failed to store CRL: %v", err)
				} else {
					resultData["CRLPath"] = crlPath
				}
			}
		}
	}

	return c.Status(resp.StatusCode).JSON(result)
}

// GetCRLList returns the list of identity IDs for which a CRL has been generated.
func (h *Handler) GetCRLList(c *fiber.Ctx) error {
	baseDir := util.GetBaseDir()
	crlIDs, err := util.ListCRLIdentities(baseDir)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to list CRLs: %v", err),
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"success": true,
		"result":  fiber.Map{"crl_ids": crlIDs},
	})
}

// GetCertificates retrieves certificates from Fabric CA with optional filters.
// Supports query params: id, aki, serial, notexpired, notrevoked, expired_start, expired_end, revoked_start, revoked_end
// The response is enriched with parsed expiry information for each certificate.
func (h *Handler) GetCertificates(c *fiber.Ctx) error {
	// Build the URI with all query params forwarded
	queryParams := c.Request().URI().QueryString()
	uri := "/api/v1/certificates"
	if len(queryParams) > 0 {
		uri += "?" + string(queryParams)
	}

	// Admin credentials for auth token
	certPEM, err := os.ReadFile(h.AdminCertPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read admin cert"})
	}
	keyPEM, err := os.ReadFile(h.AdminKeyPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read admin key"})
	}
	adminKey, err := util.ImportPrivateKey(h.BCCSP, keyPEM)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to import admin key"})
	}

	// Generate auth token (GET request, empty body)
	var bodyBytes []byte
	token, err := util.CreateToken(h.BCCSP, certPEM, adminKey, "GET", uri, bodyBytes)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Failed to create token: %v", err)})
	}

	targetURL := fmt.Sprintf("%s%s", h.FabricCAURL, uri)
	proxyReq, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create request"})
	}

	proxyReq.Header.Set("Authorization", token)

	resp, err := h.HTTPClient.Do(proxyReq)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Backend connection failed: %v", err)})
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read response"})
	}

	if resp.StatusCode != http.StatusOK {
		c.Status(resp.StatusCode)
		c.Set("Content-Type", "application/json")
		return c.Send(respBody)
	}

	// Parse the response and enrich with expiry details
	var caResp map[string]interface{}
	if err := json.Unmarshal(respBody, &caResp); err != nil {
		c.Status(resp.StatusCode)
		c.Set("Content-Type", "application/json")
		return c.Send(respBody)
	}

	resultData, ok := caResp["result"].(map[string]interface{})
	if !ok {
		c.Status(resp.StatusCode)
		c.Set("Content-Type", "application/json")
		return c.Send(respBody)
	}

	// The certs field contains PEM certificates; parse each to extract expiry
	certsRaw, ok := resultData["certs"].([]interface{})
	if ok {
		var enrichedCerts []map[string]interface{}
		for _, certRaw := range certsRaw {
			certMap, ok := certRaw.(map[string]interface{})
			if !ok {
				continue
			}

			// Try to parse the PEM field to extract expiry
			if pemStr, ok := certMap["PEM"].(string); ok && pemStr != "" {
				x509Cert, err := util.GetX509CertificateFromPEM([]byte(pemStr))
				if err == nil {
					certMap["not_before"] = x509Cert.NotBefore.Format("2006-01-02T15:04:05Z")
					certMap["not_after"] = x509Cert.NotAfter.Format("2006-01-02T15:04:05Z")
					certMap["subject_cn"] = x509Cert.Subject.CommonName
					certMap["issuer_cn"] = x509Cert.Issuer.CommonName
					certMap["serial_number"] = x509Cert.SerialNumber.String()

					dnsSANs := make([]string, 0, len(x509Cert.DNSNames))
					dnsSANs = append(dnsSANs, x509Cert.DNSNames...)
					certMap["dns_sans"] = dnsSANs

					ipSANs := make([]string, 0, len(x509Cert.IPAddresses))
					for _, ip := range x509Cert.IPAddresses {
						ipSANs = append(ipSANs, ip.String())
					}
					certMap["ip_sans"] = ipSANs

					emailSANs := make([]string, 0, len(x509Cert.EmailAddresses))
					emailSANs = append(emailSANs, x509Cert.EmailAddresses...)
					certMap["email_sans"] = emailSANs

					uriSANs := make([]string, 0, len(x509Cert.URIs))
					for _, uri := range x509Cert.URIs {
						uriSANs = append(uriSANs, uri.String())
					}
					certMap["uri_sans"] = uriSANs

					// Calculate remaining validity
					now := time.Now()
					if now.After(x509Cert.NotAfter) {
						certMap["expired"] = true
						certMap["expires_in"] = "EXPIRED"
					} else {
						certMap["expired"] = false
						remaining := x509Cert.NotAfter.Sub(now)
						days := int(remaining.Hours() / 24)
						hours := int(remaining.Hours()) % 24
						certMap["expires_in"] = fmt.Sprintf("%dd %dh", days, hours)
					}
				}
			}

			enrichedCerts = append(enrichedCerts, certMap)
		}
		resultData["certs"] = enrichedCerts
	}

	return c.Status(fiber.StatusOK).JSON(caResp)
}

// ListIdentities lists all identities
func (h *Handler) ListIdentities(c *fiber.Ctx) error {
	// Retrieve query parameters (e.g., ca, affiliation)
	queryParams := c.Request().URI().QueryString()
	uri := "/api/v1/identities"
	if len(queryParams) > 0 {
		uri += "?" + string(queryParams)
	}

	// 1. Admin Creds
	certPEM, err := os.ReadFile(h.AdminCertPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read admin cert"})
	}
	keyPEM, err := os.ReadFile(h.AdminKeyPath)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read admin key"})
	}
	adminKey, err := util.ImportPrivateKey(h.BCCSP, keyPEM)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to import admin key"})
	}

	// 2. Token
	// Body is nil/empty for GET
	var bodyBytes []byte
	token, err := util.CreateToken(h.BCCSP, certPEM, adminKey, "GET", uri, bodyBytes)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Failed to create token: %v", err)})
	}

	targetURL := fmt.Sprintf("%s%s", h.FabricCAURL, uri)
	proxyReq, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create request"})
	}

	proxyReq.Header.Set("Authorization", token)

	resp, err := h.HTTPClient.Do(proxyReq)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Backend connection failed: %v", err)})
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read response"})
	}

	c.Status(resp.StatusCode)
	c.Set("Content-Type", "application/json")
	return c.Send(respBody)
}
