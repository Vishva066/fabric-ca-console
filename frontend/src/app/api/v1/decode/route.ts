import "reflect-metadata";
import { NextRequest } from "next/server";
import {
  X509Certificate,
  Pkcs10CertificateRequest,
  SubjectAlternativeNameExtension,
} from "@peculiar/x509";
import crypto from "crypto";

export const dynamic = "force-dynamic";

interface DecodedName {
  commonName?: string;
  organization?: string;
  organizationalUnit?: string;
  locality?: string;
  stateOrProvince?: string;
  country?: string;
}

interface DecodedSans {
  dns: string[];
  ip: string[];
  email: string[];
  uri: string[];
}

interface DecodedCertificate {
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

interface DecodedCSR {
  type: "csr";
  subject: DecodedName;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  publicKeySize: number;
  sans: DecodedSans;
  pem: string;
}

export type DecodeResult = DecodedCertificate | DecodedCSR;

type NameType = X509Certificate["subject"] | Pkcs10CertificateRequest["subject"];

function extractName(name: NameType): DecodedName {
  const getFieldValues = (nameObj: NameType, oid: string) => {
    // The subject object behaves like an array of RDNs in @peculiar/x509
    const values: string[] = [];
    (nameObj as unknown as Array<{ type: string; value: string }>).forEach((rdn) => {
      if (rdn.type === oid) {
         values.push(rdn.value);
      }
    });
    return values;
  };

  // Convert string representation like "C=US, ST=North Carolina" to structured object
  const nameStr = name.toString();
  const parsed: DecodedName = {};
  
  const parseStrPart = (key: string) => {
      // Very basic parser for RDN string format
      const match = new RegExp(`(?:^|, ?)${key}=([^,]+)`).exec(nameStr);
      return match ? match[1] : undefined;
  };
    
  return {
    commonName: parseStrPart("CN"),
    organization: parseStrPart("O"),
    organizationalUnit: parseStrPart("OU"),
    locality: parseStrPart("L"),
    stateOrProvince: parseStrPart("ST"),
    country: parseStrPart("C"),
  };
}

function getPublicKeyInfo(publicKey: any): { algorithm: string; size: number } {
  const algo = publicKey.algorithm as any;
  if (!algo) return { algorithm: "Unknown", size: 0 };

  if (algo.name === "RSA-PSS" || algo.name === "RSASSA-PKCS1-v1_5") {
    return {
      algorithm: "RSA",
      size: algo.modulusLength || 0,
    };
  }

  if (algo.name === "ECDSA" || algo.name === "ECDH") {
    const namedCurve = algo.namedCurve;
    const sizeMap: Record<string, number> = {
      "P-256": 256,
      "P-384": 384,
      "P-521": 521,
      "secp256k1": 256,
    };
    return {
      algorithm: `ECDSA (${namedCurve || "Unknown"})`,
      size: namedCurve ? (sizeMap[namedCurve] || 0) : 0,
    };
  }

  if (algo.name === "Ed25519") {
    return { algorithm: "Ed25519", size: 256 };
  }

  return { algorithm: algo.name || "Unknown", size: 0 };
}

function extractSans(extensions: Array<{ type: string; [key: string]: any }> | undefined): DecodedSans {
  const sans: DecodedSans = { dns: [], ip: [], email: [], uri: [] };
  if (!extensions) return sans;

  const sanExt = extensions.find(
    (ext) => ext.type === SubjectAlternativeNameExtension.NAME || ext.type === "2.5.29.17"
  ) as any;

  if (!sanExt) return sans;

  // @peculiar/x509 stores it in `names` or `items` depending on the version/object
  let items = undefined;
  if (Array.isArray(sanExt.names)) items = sanExt.names;
  else if (Array.isArray(sanExt.items)) items = sanExt.items;
  else if (sanExt.names?.items && Array.isArray(sanExt.names.items)) items = sanExt.names.items;
  else if (sanExt.items?.items && Array.isArray(sanExt.items.items)) items = sanExt.items.items;

  if (!Array.isArray(items)) return sans;

  for (const item of items) {
    const type = item.type;
    const value = String(item.value);
    
    if (type === "dns" || type === 2) {
      sans.dns.push(value);
    } else if (type === "ip" || type === 7) {
      sans.ip.push(value);
    } else if (type === "email" || type === 1) {
      sans.email.push(value);
    } else if (type === "url" || type === 6) {
      sans.uri.push(value);
    }
  }

  return sans;
}

function normalizePem(pem: string): string {
  return pem.replace(/\r\n/g, "\n").trim();
}

function detectPemType(pem: string): "certificate" | "csr" | "unknown" {
  if (pem.includes("-----BEGIN CERTIFICATE-----")) return "certificate";
  if (
    pem.includes("-----BEGIN CERTIFICATE REQUEST-----") ||
    pem.includes("-----BEGIN NEW CERTIFICATE REQUEST-----")
  )
    return "csr";
  return "unknown";
}

function formatFingerprintBuffer(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(":");
}

function computeFingerprintFallback(pem: string, alg: "sha1" | "sha256"): string {
    const b64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g,"");
    const buf = Buffer.from(b64, "base64");
    const hash = crypto.createHash(alg).update(buf).digest("hex").toUpperCase();
    return hash.replace(/(.{2})(?!$)/g, "$1:");
}


async function decodeCertificate(pem: string): Promise<DecodedCertificate> {
    // node-peculiar/x509 parses EC logic cleanly
    const cert = new X509Certificate(pem);
    
    return {
        type: "certificate",
        subject: extractName(cert.subject),
        issuer: extractName(cert.issuer),
        serialNumber: cert.serialNumber.toLowerCase() || "0",
        validFrom: cert.notBefore.toISOString(),
        validTo: cert.notAfter.toISOString(),
        signatureAlgorithm: cert.signatureAlgorithm.name || "Unknown",
        publicKeyAlgorithm: getPublicKeyInfo(cert.publicKey).algorithm,
        publicKeySize: getPublicKeyInfo(cert.publicKey).size,
        sha1Fingerprint: computeFingerprintFallback(pem, "sha1"),
        sha256Fingerprint: computeFingerprintFallback(pem, "sha256"),
        sans: extractSans(cert.extensions as any),
        pem,
    };
}

async function decodeCSR(pem: string): Promise<DecodedCSR> {
    const csr = new Pkcs10CertificateRequest(pem);

    return {
        type: "csr",
        subject: extractName(csr.subject),
        signatureAlgorithm: csr.signatureAlgorithm.name || "Unknown",
        publicKeyAlgorithm: getPublicKeyInfo(csr.publicKey).algorithm,
        publicKeySize: getPublicKeyInfo(csr.publicKey).size,
        sans: extractSans(csr.extensions as any),
        pem,
    };
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    // Requires node 19+ for WebCrypto natively
    if (!global.crypto.subtle && require('crypto').webcrypto) {
        (global as any).crypto = require('crypto').webcrypto;
    }
    
    const body = (await req.json()) as { pem?: string };
    const pem = normalizePem(body.pem || "");

    if (!pem) {
      return Response.json(
        { error: "Certificate/CSR content is required" },
        { status: 400 }
      );
    }

    const pemType = detectPemType(pem);
    if (pemType === "unknown") {
      return Response.json(
        {
          error:
            "Unable to detect PEM type. Provide a certificate or CSR in PEM format.",
        },
        { status: 400 }
      );
    }

    const result: DecodeResult =
      pemType === "certificate" ? await decodeCertificate(pem) : await decodeCSR(pem);

    return Response.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to decode certificate/CSR";
    return Response.json({ error: message }, { status: 400 });
  }
}
