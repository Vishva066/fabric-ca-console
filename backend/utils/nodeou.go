package util

import (
	"fmt"
	"path/filepath"
)

const nodeOUCACertFilename = "ca.pem"

// GenerateNodeOUConfig returns the organization-wide NodeOU configuration for an MSP.
func GenerateNodeOUConfig(caCertFilename string) ([]byte, error) {
	if caCertFilename == "" || filepath.Base(caCertFilename) != caCertFilename {
		return nil, fmt.Errorf("invalid CA certificate filename: %q", caCertFilename)
	}

	certificatePath := filepath.ToSlash(filepath.Join("cacerts", caCertFilename))
	return []byte(fmt.Sprintf(`NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: %s
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: %s
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: %s
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: %s
    OrganizationalUnitIdentifier: orderer
`, certificatePath, certificatePath, certificatePath, certificatePath)), nil
}
