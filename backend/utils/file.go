package util

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// MSPPaths holds the paths for an MSP structure
type MSPPaths struct {
	Root       string
	Keystore   string
	SignCerts  string
	CACerts    string
	TLSCACerts string
}

// GetBaseDir reads the MSP base directory from the FABRIC_CA_BASE_DIR
// environment variable. If not set, it defaults to the current directory.
func GetBaseDir() string {
	baseDir := os.Getenv("FABRIC_CERT_BASE_DIR")
	if baseDir == "" {
		baseDir = "."
		log.Info("FABRIC_CERT_BASE_DIR not set, defaulting to current directory")
	}
	return baseDir
}

// GetMSPPath constructs the MSP path based on standard Fabric conventions.
// Supported identityType values: "peer", "orderer", "client", "user", "admin".
func GetMSPPath(baseDir, id, orgName, identityType string) (*MSPPaths, error) {
	if baseDir == "" {
		baseDir = GetBaseDir()
	}

	var mspDir string
	switch identityType {
	case "peer":
		// basedir/organizations/<orgName>/peers/<id>.<orgName>/msp
		mspDir = filepath.Join(baseDir, "organizations", orgName,
			"peers", fmt.Sprintf("%s.%s", id, orgName), "msp")
	case "orderer":
		// basedir/organizations/<orgName>/orderers/<id>.<orgName>/msp
		mspDir = filepath.Join(baseDir, "organizations", orgName,
			"orderers", fmt.Sprintf("%s.%s", id, orgName), "msp")
	case "client", "user":
		// basedir/organizations/<orgName>/users/<id>@<orgName>/msp
		mspDir = filepath.Join(baseDir, "organizations", orgName,
			"users", fmt.Sprintf("%s@%s", id, orgName), "msp")
	case "admin":
		// basedir/organizations/<orgName>/users/<id>@<orgName>/msp
		mspDir = filepath.Join(baseDir, "organizations", orgName,
			"users", fmt.Sprintf("%s@%s", id, orgName), "msp")
	default:
		return nil, fmt.Errorf("unsupported identity type: %s (supported: peer, orderer, client, user, admin)", identityType)
	}

	return &MSPPaths{
		Root:       mspDir,
		Keystore:   filepath.Join(mspDir, "keystore"),
		SignCerts:  filepath.Join(mspDir, "signcerts"),
		CACerts:    filepath.Join(mspDir, "cacerts"),
		TLSCACerts: filepath.Join(mspDir, "tlscacerts"),
	}, nil
}

// EnsureMSPDirs creates the MSP directories, optionally including TLS CA storage.
func (p *MSPPaths) EnsureMSPDirs(includeTLSCACerts bool) error {
	dirs := []string{p.Keystore, p.SignCerts, p.CACerts}
	if includeTLSCACerts {
		dirs = append(dirs, p.TLSCACerts)
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %v", d, err)
		}
	}
	return nil
}

// FetchExplicitTLSCACert returns the TLS CA certificate PEM read from the file
// pointed to by the FABRIC_TLSCA_ROOT_CERT environment variable. This is used
// when the TLS CA is a separate/dedicated fabric-ca instance from the
// signing/enrollment CA, and the admin has explicitly provided its root
// certificate out-of-band.
//
// Returns (nil, false, nil) if FABRIC_TLSCA_ROOT_CERT is not set — callers
// should fall back to fetching the CA chain live (e.g. via /cainfo) in that case.
func FetchExplicitTLSCACert() ([]byte, bool, error) {
	certPath := os.Getenv("FABRIC_TLSCA_ROOT_CERT")
	if certPath == "" {
		return nil, false, nil
	}

	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		return nil, true, fmt.Errorf("failed to read TLS CA cert from %s: %v", certPath, err)
	}

	return certPEM, true, nil
}

// StoreMSP creates the MSP folder structure and writes the key, cert, CA chain, and optional TLS CA cert files.
// privateKeyPEM can be nil/empty (e.g. during reenroll) — in that case the keystore write is skipped.
// tlsCACertPEM can be nil/empty — in that case no TLS CA directory or certificate is created.
func StoreMSP(baseDir, orgName, id, identityType string, privateKeyPEM, signCertPEM, caChainPEM, tlsCACertPEM []byte) (string, error) {
	paths, err := GetMSPPath(baseDir, id, orgName, identityType)
	if err != nil {
		return "", fmt.Errorf("failed to resolve MSP path: %v", err)
	}

	if err := paths.EnsureMSPDirs(len(tlsCACertPEM) > 0); err != nil {
		return "", fmt.Errorf("failed to create MSP directories: %v", err)
	}

	// Write Private Key → keystore/priv_sk
	if len(privateKeyPEM) > 0 {
		keyPath := filepath.Join(paths.Keystore, "priv_sk")
		if err := os.WriteFile(keyPath, privateKeyPEM, 0600); err != nil {
			return "", fmt.Errorf("failed to write private key: %v", err)
		}
	}

	// Write Signing Certificate → signcerts/cert.pem
	if len(signCertPEM) > 0 {
		certPath := filepath.Join(paths.SignCerts, "cert.pem")
		if err := os.WriteFile(certPath, signCertPEM, 0644); err != nil {
			return "", fmt.Errorf("failed to write signing certificate: %v", err)
		}
	}

	// Write CA Chain → cacerts/ca.pem
	if len(caChainPEM) > 0 {
		caPath := filepath.Join(paths.CACerts, "ca.pem")
		if err := os.WriteFile(caPath, caChainPEM, 0644); err != nil {
			return "", fmt.Errorf("failed to write CA chain certificate: %v", err)
		}
	}

	// Write TLS CA Cert → tlscacerts/tlsca.pem
	if len(tlsCACertPEM) > 0 {
		tlsCAPath := filepath.Join(paths.TLSCACerts, "tlsca.pem")
		if err := os.WriteFile(tlsCAPath, tlsCACertPEM, 0644); err != nil {
			return "", fmt.Errorf("failed to write TLS CA certificate: %v", err)
		}
	}

	configYAML, err := GenerateNodeOUConfig(nodeOUCACertFilename)
	if err != nil {
		return "", fmt.Errorf("failed to generate NodeOU configuration: %v", err)
	}
	configPath := filepath.Join(paths.Root, "config.yaml")
	fmt.Println(configPath, "path")
	if err := os.WriteFile(configPath, configYAML, 0644); err != nil {
		return "", fmt.Errorf("failed to write NodeOU configuration: %v", err)
	}

	log.Infof("MSP folder created at: %s", paths.Root)
	return paths.Root, nil
}

// StoreCRL writes a CRL PEM file into a crls/ directory at the same level as the identity's msp/ folder.
// Folder structure: .../peers/<id>.<orgName>/crls/crl.pem  (sibling of msp/)
func StoreCRL(baseDir, orgName, id, identityType string, crlPEM []byte) (string, error) {
	if len(crlPEM) == 0 {
		return "", nil
	}

	paths, err := GetMSPPath(baseDir, id, orgName, identityType)
	if err != nil {
		return "", fmt.Errorf("failed to resolve MSP path for CRL: %v", err)
	}

	// crls/ sits next to msp/ → go one level up from msp root
	crlDir := filepath.Join(filepath.Dir(paths.Root), "crls")
	if err := os.MkdirAll(crlDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create crls directory %s: %v", crlDir, err)
	}

	crlPath := filepath.Join(crlDir, "crl.pem")
	if err := os.WriteFile(crlPath, crlPEM, 0644); err != nil {
		return "", fmt.Errorf("failed to write CRL file: %v", err)
	}

	log.Infof("CRL written to: %s", crlPath)
	return crlPath, nil
}

// ListCRLIdentities scans the base directory for generated CRL files and
// returns the identity IDs for which a CRL exists. CRLs are expected at
// .../organizations/<orgName>/peers/<id>.<orgName>/crls/crl.pem
// .../organizations/<orgName>/orderers/<id>.<orgName>/crls/crl.pem
// .../organizations/<orgName>/users/<id>@<orgName>/crls/crl.pem
func ListCRLIdentities(baseDir string) ([]string, error) {
	if baseDir == "" {
		baseDir = GetBaseDir()
	}

	orgsDir := filepath.Join(baseDir, "organizations")
	ids := make(map[string]struct{})

	err := filepath.WalkDir(orgsDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // keep walking
		}

		if d.IsDir() || filepath.Base(path) != "crl.pem" {
			return nil
		}

		// Expected path: .../organizations/<orgName>/{peers,orderers,users}/<dirName>/crls/crl.pem
		parts := strings.Split(filepath.Clean(path), string(filepath.Separator))
		if len(parts) < 6 {
			return nil
		}

		orgName := parts[len(parts)-5]
		entityType := parts[len(parts)-4]
		dirName := parts[len(parts)-3]

		var id string
		switch entityType {
		case "peers", "orderers":
			id = strings.TrimSuffix(dirName, "."+orgName)
		case "users":
			id = strings.TrimSuffix(dirName, "@"+orgName)
		default:
			return nil
		}

		if id != "" {
			ids[id] = struct{}{}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	result := make([]string, 0, len(ids))
	for id := range ids {
		result = append(result, id)
	}
	return result, nil
}

// WriteFile writes data to a file with restricted permissions.
func WriteFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0600)
}

// B64DecodeAndWrite decodes a base64 string and writes it to a file.
func B64DecodeAndWrite(path, b64Data string) error {
	data, err := base64.StdEncoding.DecodeString(b64Data)
	if err != nil {
		return err
	}
	return WriteFile(path, data)
}
