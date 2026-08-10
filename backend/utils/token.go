package util

import (
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"

	"github.com/hyperledger/fabric-lib-go/bccsp"
	"github.com/hyperledger/fabric-lib-go/common/flogging"
	"github.com/pkg/errors"
)

var log = flogging.MustGetLogger("token")

func CreateToken(csp bccsp.BCCSP, cert []byte, key bccsp.Key, method, uri string, body []byte) (string, error) {
	x509Cert, err := GetX509CertificateFromPEM(cert)
	if err != nil {
		return "", err
	}
	publicKey := x509Cert.PublicKey

	var token string

	//The RSA Key Gen is commented right now as there is bccsp does
	switch publicKey.(type) {
	/*
		case *rsa.PublicKey:
			token, err = GenRSAToken(csp, cert, key, body)
			if err != nil {
				return "", err
			}
	*/
	case *ecdsa.PublicKey:
		token, err = GenECDSAToken(csp, cert, key, method, uri, body)
		if err != nil {
			return "", err
		}
	}
	return token, nil
}

func GenECDSAToken(csp bccsp.BCCSP, cert []byte, key bccsp.Key, method, uri string, body []byte) (string, error) {
	b64body := B64Encode(body)
	b64cert := B64Encode(cert)
	b64uri := B64Encode([]byte(uri))
	payload := method + "." + b64uri + "." + b64body + "." + b64cert

	return genECDSAToken(csp, key, b64cert, payload)
}

func genECDSAToken(csp bccsp.BCCSP, key bccsp.Key, b64cert, payload string) (string, error) {
	digest, digestError := csp.Hash([]byte(payload), &bccsp.SHAOpts{})
	if digestError != nil {
		return "", errors.WithMessage(digestError, fmt.Sprintf("Hash failed on '%s'", payload))
	}

	ecSignature, err := csp.Sign(key, digest, nil)
	if err != nil {
		return "", errors.WithMessage(err, "BCCSP signature generation failure")
	}
	if len(ecSignature) == 0 {
		return "", errors.New("BCCSP signature creation failed. Signature must be different than nil")
	}

	b64sig := B64Encode(ecSignature)
	token := b64cert + "." + b64sig

	return token, nil
}

// B64Encode encodes bytes to base64 string
func B64Encode(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

// GetX509CertificateFromPEM converts PEM bytes to X509 certificate
func GetX509CertificateFromPEM(certPEM []byte) (*x509.Certificate, error) {
	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, errors.New("failed to decode PEM block containing certificate")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, errors.Wrap(err, "failed to parse certificate")
	}

	return cert, nil
}

func VerifyToken(csp bccsp.BCCSP, token string, method, uri string, body []byte, compMode1_3 bool) (*x509.Certificate, error) {
	if csp == nil {
		return nil, errors.New("BCCSP instance is not present")
	}
	x509Cert, b64Cert, b64Sig, err := decodeToken(token)
	if err != nil {
		return nil, err
	}
	sig, err := B64Decode(b64Sig)
	if err != nil {
		return nil, errors.WithMessage(err, "Invalid base64 encoded signature in token")
	}
	b64Body := B64Encode(body)
	b64uri := B64Encode([]byte(uri))
	sigString := method + "." + b64uri + "." + b64Body + "." + b64Cert

	pk2, err := csp.KeyImport(x509Cert, &bccsp.X509PublicKeyImportOpts{Temporary: true})
	if err != nil {
		return nil, errors.WithMessage(err, "Public Key import into BCCSP failed with error")
	}
	if pk2 == nil {
		return nil, errors.New("Public Key Cannot be imported into BCCSP")
	}

	//bccsp.X509PublicKeyImportOpts
	//Using default hash algo
	digest, digestError := csp.Hash([]byte(sigString), &bccsp.SHAOpts{})
	if digestError != nil {
		return nil, errors.WithMessage(digestError, "Message digest failed")
	}

	valid, validErr := csp.Verify(pk2, sig, digest, nil)

	if compMode1_3 && !valid {
		log.Debugf("Failed to verify token based on new authentication header requirements (initial validation error: %s), attempting with COMPATIBILITY_MODE_V1_3 verification", validErr)
		sigString := b64Body + "." + b64Cert
		digest, digestError := csp.Hash([]byte(sigString), &bccsp.SHAOpts{})
		if digestError != nil {
			return nil, errors.WithMessage(digestError, "Message digest failed")
		}
		valid, validErr = csp.Verify(pk2, sig, digest, nil)
	}

	if validErr != nil {
		return nil, errors.WithMessage(validErr, "Token signature validation failure")
	}
	if !valid {
		return nil, errors.New("Token signature validation failed")
	}

	return x509Cert, nil
}

// decodeToken extracts an X509 certificate and base64 encoded signature from a token
func decodeToken(token string) (*x509.Certificate, string, string, error) {
	if token == "" {
		return nil, "", "", errors.New("Invalid token; it is empty")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, "", "", errors.New("Invalid token format; expecting 2 parts separated by '.'")
	}
	b64cert := parts[0]
	certDecoded, err := B64Decode(b64cert)
	if err != nil {
		return nil, "", "", errors.WithMessage(err, "Failed to decode base64 encoded x509 cert")
	}
	x509Cert, err := GetX509CertificateFromPEM(certDecoded)
	if err != nil {
		return nil, "", "", errors.WithMessage(err, "Error in parsing x509 certificate given block bytes")
	}
	return x509Cert, b64cert, parts[1], nil
}

func B64Decode(str string) (buf []byte, err error) {
	return base64.StdEncoding.DecodeString(str)
}

// ImportPrivateKey imports a PEM-encoded private key into BCCSP
func ImportPrivateKey(csp bccsp.BCCSP, keyPEM []byte) (bccsp.Key, error) {
	block, _ := pem.Decode(keyPEM)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block containing private key")
	}

	keyBytes := block.Bytes
	if block.Type == "PRIVATE KEY" {
		privateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse PKCS#8 private key: %v", err)
		}

		ecPrivateKey, ok := privateKey.(*ecdsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("PKCS#8 private key is not an ECDSA key")
		}
		keyBytes, err = x509.MarshalECPrivateKey(ecPrivateKey)
		if err != nil {
			return nil, fmt.Errorf("failed to encode EC private key: %v", err)
		}
	}

	// Import the key to BCCSP
	key, err := csp.KeyImport(keyBytes, &bccsp.ECDSAPrivateKeyImportOpts{Temporary: true})
	if err != nil {
		return nil, fmt.Errorf("failed to import private key: %v", err)
	}

	return key, nil
}
