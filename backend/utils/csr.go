package util

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"net"
	"net/url"
)

// GeneratePrivateKey generates a new ECDSA P256 private key and returns it along with its PEM encoding
func GeneratePrivateKey() (*ecdsa.PrivateKey, []byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}

	x509Encoded, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, nil, err
	}

	pemBlock := &pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: x509Encoded,
	}
	pemBytes := pem.EncodeToMemory(pemBlock)

	return key, pemBytes, nil
}

// GenerateCSR creates a PEM-encoded CSR for the given private key.
// Hosts are included as SAN entries (DNS/IP). If subjectOverride is nil,
// commonName is used as the CSR Subject CN.
func GenerateCSR(key *ecdsa.PrivateKey, commonName string, hosts []string, subjectOverride *pkix.Name) ([]byte, error) {
	subj := pkix.Name{CommonName: commonName}
	if subjectOverride != nil {
		subj = *subjectOverride
		if subj.CommonName == "" {
			subj.CommonName = commonName
		}
	}

	dnsNames := make([]string, 0)
	ipAddresses := make([]net.IP, 0)
	for _, host := range hosts {
		if ip := net.ParseIP(host); ip != nil {
			ipAddresses = append(ipAddresses, ip)
		} else if host != "" {
			dnsNames = append(dnsNames, host)
		}
	}

	return generateCSR(key, subj, dnsNames, ipAddresses, nil, nil)
}

// GenerateCSRFromCertificate creates a CSR retaining the certificate subject and all SAN types.
func GenerateCSRFromCertificate(key *ecdsa.PrivateKey, certPEM []byte) ([]byte, error) {
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, fmt.Errorf("certificate PEM not found")
	}

	certificate, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, err
	}

	return generateCSR(
		key,
		certificate.Subject,
		certificate.DNSNames,
		certificate.IPAddresses,
		certificate.EmailAddresses,
		certificate.URIs,
	)
}

func generateCSR(
	key *ecdsa.PrivateKey,
	subject pkix.Name,
	dnsNames []string,
	ipAddresses []net.IP,
	emailAddresses []string,
	uris []*url.URL,
) ([]byte, error) {
	template := x509.CertificateRequest{
		Subject:            subject,
		DNSNames:           dnsNames,
		IPAddresses:        ipAddresses,
		EmailAddresses:     emailAddresses,
		URIs:               uris,
		SignatureAlgorithm: x509.ECDSAWithSHA256,
	}

	csrBytes, err := x509.CreateCertificateRequest(rand.Reader, &template, key)
	if err != nil {
		return nil, err
	}

	pemBlock := &pem.Block{
		Type:  "CERTIFICATE REQUEST",
		Bytes: csrBytes,
	}
	pemBytes := pem.EncodeToMemory(pemBlock)

	return pemBytes, nil
}
