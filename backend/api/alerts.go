package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	util "ca/utils"

	"github.com/gofiber/fiber/v2"
)

type AlertSettings struct {
	Enabled           bool     `json:"enabled"`
	SMTPHost          string   `json:"smtp_host"`
	SMTPPort          int      `json:"smtp_port"`
	SMTPUsername      string   `json:"smtp_username"`
	SMTPPassword      string   `json:"-"`
	From              string   `json:"from"`
	Recipients        []string `json:"recipients"`
	ExpiryDays        int      `json:"expiry_days"`
	CheckIntervalHour int      `json:"check_interval_hours"`
}

type alertSettingsResponse struct {
	AlertSettings
	PasswordConfigured bool `json:"password_configured"`
}

type alertSettingsRequest struct {
	Enabled           *bool    `json:"enabled"`
	SMTPHost          *string  `json:"smtp_host"`
	SMTPPort          *int     `json:"smtp_port"`
	SMTPUsername      *string  `json:"smtp_username"`
	SMTPPassword      *string  `json:"smtp_password"`
	From              *string  `json:"from"`
	Recipients        []string `json:"recipients"`
	ExpiryDays        *int     `json:"expiry_days"`
	CheckIntervalHour *int     `json:"check_interval_hours"`
}

type AlertManager struct {
	mu        sync.RWMutex
	settings  AlertSettings
	sentToday map[string]string
}

func NewAlertManager() *AlertManager {
	return &AlertManager{
		settings: AlertSettings{
			Enabled:           envBool("SMTP_ALERT_ENABLED", false),
			SMTPHost:          os.Getenv("SMTP_HOST"),
			SMTPPort:          envInt("SMTP_PORT", 587),
			SMTPUsername:      os.Getenv("SMTP_USERNAME"),
			SMTPPassword:      os.Getenv("SMTP_PASSWORD"),
			From:              os.Getenv("SMTP_FROM"),
			Recipients:        envList("SMTP_RECIPIENTS"),
			ExpiryDays:        envInt("CERT_EXPIRY_ALERT_DAYS", 15),
			CheckIntervalHour: envInt("CERT_EXPIRY_ALERT_INTERVAL_HOURS", 24),
		},
		sentToday: make(map[string]string),
	}
}

func envBool(name string, fallback bool) bool {
	value, err := strconv.ParseBool(os.Getenv(name))
	if err != nil {
		return fallback
	}
	return value
}

func envInt(name string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(name))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func envList(name string) []string {
	values := make([]string, 0)
	for _, value := range strings.Split(os.Getenv(name), ",") {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			values = append(values, trimmed)
		}
	}
	return values
}

func (m *AlertManager) publicSettings() alertSettingsResponse {
	m.mu.RLock()
	defer m.mu.RUnlock()
	settings := m.settings
	settings.SMTPPassword = ""
	if settings.Recipients == nil {
		settings.Recipients = make([]string, 0)
	}
	return alertSettingsResponse{
		AlertSettings:      settings,
		PasswordConfigured: m.settings.SMTPPassword != "",
	}
}

func (h *Handler) GetAlertSettings(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"result": h.Alerts.publicSettings()})
}

func (h *Handler) UpdateAlertSettings(c *fiber.Ctx) error {
	var request alertSettingsRequest
	if err := c.BodyParser(&request); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON"})
	}

	h.Alerts.mu.Lock()
	settings := &h.Alerts.settings
	if request.Enabled != nil {
		settings.Enabled = *request.Enabled
	}
	if request.SMTPHost != nil {
		settings.SMTPHost = strings.TrimSpace(*request.SMTPHost)
	}
	if request.SMTPPort != nil {
		if *request.SMTPPort < 1 || *request.SMTPPort > 65535 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "SMTP port must be between 1 and 65535"})
		}
		settings.SMTPPort = *request.SMTPPort
	}
	if request.SMTPUsername != nil {
		settings.SMTPUsername = strings.TrimSpace(*request.SMTPUsername)
	}
	if request.SMTPPassword != nil && *request.SMTPPassword != "" {
		settings.SMTPPassword = *request.SMTPPassword
	}
	if request.From != nil {
		settings.From = strings.TrimSpace(*request.From)
	}
	if request.Recipients != nil {
		settings.Recipients = cleanList(request.Recipients)
	}
	if request.ExpiryDays != nil {
		if *request.ExpiryDays < 1 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Expiry alert days must be at least 1"})
		}
		settings.ExpiryDays = *request.ExpiryDays
	}
	if request.CheckIntervalHour != nil {
		if *request.CheckIntervalHour < 1 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Check interval must be at least 1 hour"})
		}
		settings.CheckIntervalHour = *request.CheckIntervalHour
	}
	h.Alerts.mu.Unlock()

	return c.JSON(fiber.Map{"result": h.Alerts.publicSettings()})
}

func cleanList(values []string) []string {
	cleaned := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	return cleaned
}

func (h *Handler) SendTestAlert(c *fiber.Ctx) error {
	if err := h.Alerts.send("Fabric CA Console SMTP test", "This is a test alert from Fabric CA Console."); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true, "message": "Test alert sent"})
}

func (h *Handler) StartAlertScheduler(defaultInterval time.Duration) {
	if defaultInterval <= 0 {
		defaultInterval = 24 * time.Hour
	}
	for {
		interval := defaultInterval
		h.Alerts.mu.RLock()
		if h.Alerts.settings.CheckIntervalHour > 0 {
			interval = time.Duration(h.Alerts.settings.CheckIntervalHour) * time.Hour
		}
		h.Alerts.mu.RUnlock()
		timer := time.NewTimer(interval)
		<-timer.C
		if err := h.CheckExpiryAlerts(); err != nil {
			log.Printf("certificate expiry alert check failed: %v", err)
		}
	}
}

func (h *Handler) CheckExpiryAlerts() error {
	h.Alerts.mu.RLock()
	settings := h.Alerts.settings
	h.Alerts.mu.RUnlock()
	if !settings.Enabled || settings.SMTPHost == "" || settings.From == "" || len(settings.Recipients) == 0 {
		return nil
	}

	certificates, err := h.fetchAlertCertificates()
	if err != nil {
		return err
	}
	deadline := time.Now().Add(time.Duration(settings.ExpiryDays) * 24 * time.Hour)
	var expiring []string
	for _, certificate := range certificates {
		if certificate.Revoked || certificate.NotAfter.After(deadline) {
			continue
		}
		status := "expires in " + time.Until(certificate.NotAfter).Round(time.Hour).String()
		if certificate.NotAfter.Before(time.Now()) {
			status = "expired"
		}
		expiring = append(expiring, fmt.Sprintf("- %s (%s): %s", certificate.SubjectCN, certificate.Serial, status))
	}
	if len(expiring) == 0 {
		return nil
	}

	today := time.Now().Format("2006-01-02")
	key := strings.Join(expiring, "\n")
	h.Alerts.mu.Lock()
	if h.Alerts.sentToday[today] == key {
		h.Alerts.mu.Unlock()
		return nil
	}
	h.Alerts.sentToday[today] = key
	h.Alerts.mu.Unlock()

	return h.Alerts.send("Fabric CA certificate expiry alert", "The following certificates are expired or expire within the configured alert window:\n\n"+key)
}

type alertCertificate struct {
	SubjectCN string
	Serial    string
	NotAfter  time.Time
	Revoked   bool
}

func (h *Handler) fetchAlertCertificates() ([]alertCertificate, error) {
	certPEM, err := os.ReadFile(h.AdminCertPath)
	if err != nil {
		return nil, err
	}
	keyPEM, err := os.ReadFile(h.AdminKeyPath)
	if err != nil {
		return nil, err
	}
	adminKey, err := util.ImportPrivateKey(h.BCCSP, keyPEM)
	if err != nil {
		return nil, err
	}
	token, err := util.CreateToken(h.BCCSP, certPEM, adminKey, "GET", "/api/v1/certificates", nil)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequest("GET", h.FabricCAURL+"/api/v1/certificates", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", token)
	response, err := h.HTTPClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, fmt.Errorf("certificate query returned status %d", response.StatusCode)
	}
	var payload struct {
		Result struct {
			Certs []struct {
				PEM     string `json:"PEM"`
				Revoked string `json:"revoked_at"`
				Serial  string `json:"serial_number"`
			} `json:"certs"`
		} `json:"result"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, err
	}
	certificates := make([]alertCertificate, 0, len(payload.Result.Certs))
	for _, raw := range payload.Result.Certs {
		certificate, err := util.GetX509CertificateFromPEM([]byte(raw.PEM))
		if err != nil {
			continue
		}
		serial := raw.Serial
		if serial == "" {
			serial = certificate.SerialNumber.String()
		}
		certificates = append(certificates, alertCertificate{
			SubjectCN: certificate.Subject.CommonName,
			Serial:    serial,
			NotAfter:  certificate.NotAfter,
			Revoked:   raw.Revoked != "",
		})
	}
	return certificates, nil
}

func (m *AlertManager) send(subject, body string) error {
	m.mu.RLock()
	settings := m.settings
	m.mu.RUnlock()
	if settings.SMTPHost == "" || settings.SMTPPort < 1 || settings.From == "" || len(settings.Recipients) == 0 {
		return fmt.Errorf("SMTP host, sender, and at least one recipient are required")
	}
	address := fmt.Sprintf("%s:%d", settings.SMTPHost, settings.SMTPPort)
	headers := "From: " + settings.From + "\r\n" +
		"To: " + strings.Join(settings.Recipients, ", ") + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n"
	message := []byte(headers + body)
	var auth smtp.Auth
	if settings.SMTPUsername != "" {
		auth = smtp.PlainAuth("", settings.SMTPUsername, settings.SMTPPassword, settings.SMTPHost)
	}
	return smtp.SendMail(address, auth, settings.From, settings.Recipients, message)
}
