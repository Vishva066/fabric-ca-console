// Types for Fabric CA UI

export interface Identity {
  id: string;
  type: string;
  affiliation: string;
  max_enrollments: number;
  attrs: IdentityAttribute[];
}

export interface IdentityAttribute {
  name: string;
  value: string;
  ecert?: boolean;
}

export interface IdentityRow {
  sno: number;
  id: string;
  type: string;
  affiliation: string;
  maxEnrollments: number;
}

export interface CertificateInfo {
  id: string;
  not_before: string;
  not_after: string;
  expired: boolean;
  expires_in: string;
  subject_cn: string;
  revoked_at?: string;
  serial_number?: string;
  PEM?: string;
  dns_sans?: string[];
  ip_sans?: string[];
  email_sans?: string[];
  uri_sans?: string[];
}

export interface RegisterRequest {
  id: string;
  type: string;
  secret: string;
  affiliation: string;
  max_enrollments: number;
  attrs: IdentityAttribute[];
}

export interface EnrollRequest {
  id: string;
  secret: string;
  org_name: string;
  identity_type: string;
  csr_hosts?: string[];
  csr_names?: {
    country?: string;
    state?: string;
    organization?: string;
    organizational_unit?: string;
  };
  msp_dir?: string;
  skip_tls_ca_cert?: boolean;
}

export interface ReenrollRequest {
  id: string;
  org_name: string;
  identity_type: string;
  msp_dir?: string;
  skip_tls_ca_cert?: boolean;
}

export interface RevokeRequest {
  id: string;
  org_name: string;
  identity_type: string;
  reason?: string;
}

export interface ApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  result?: T;
  errors?: Array<{ code: number; message: string }>;
}

export interface RevokeResponse {
  success?: boolean;
  result?: {
    CRL?: string;
    CRLPath?: string;
  };
}

// ---------- Certificate / CSR Decoder ----------

export interface DecodedName {
  commonName?: string;
  organization?: string;
  organizationalUnit?: string;
  locality?: string;
  stateOrProvince?: string;
  country?: string;
}

export interface DecodedSans {
  dns: string[];
  ip: string[];
  email: string[];
  uri: string[];
}

export interface DecodedCertificate {
  type: "certificate";
  subject: DecodedName;
  issuer: DecodedName;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  publicKeySize: number;
  sha1Fingerprint: string;
  sha256Fingerprint: string;
  sans: DecodedSans;
  pem: string;
}

export interface DecodedCSR {
  type: "csr";
  subject: DecodedName;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  publicKeySize: number;
  sans: DecodedSans;
  pem: string;
}

export type DecodeResult = DecodedCertificate | DecodedCSR;
