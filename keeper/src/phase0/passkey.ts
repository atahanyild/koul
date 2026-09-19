// Ported from Kumbara spikes/lib/passkey.ts (github.com/keyboord01/kumbara, MIT, Sembol 2026).
// Software WebAuthn authenticator so phase-0 scripts can drive a real OpenZeppelin smart account from Node.
/**
 * A software WebAuthn authenticator for Node.
 *
 * It implements the two functions smart-account-kit accepts via its `webAuthn`
 * config option (the @simplewebauthn/browser `startRegistration` /
 * `startAuthentication` shapes) using a P-256 key held in memory, so the
 * spikes and demo scripts can drive a real OpenZeppelin smart account without
 * a browser. Production Kumbara never uses this: real users sign with their
 * device passkey; this exists so the flows can be rehearsed and tested.
 *
 * What the on-chain WebAuthn verifier checks (OpenZeppelin
 * stellar-accounts/verifiers/webauthn.rs) and what we therefore produce:
 * - clientDataJSON.type == "webauthn.get"
 * - clientDataJSON.challenge == base64url(auth digest) exactly as given
 * - authenticatorData flags: UP (0x01) and UV (0x04) set, BE/BS consistent
 * - secp256r1 signature over sha256(authenticatorData || sha256(clientDataJSON))
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as cryptoSign, type KeyObject } from "node:crypto";

type Json = Record<string, unknown>;

export interface AuthenticatorState {
  credentialId: string;
  privateKeyPem: string;
  publicKeyHex: string;
  counter: number;
}

function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

// --- minimal CBOR encoder (enough for an attestation object) -----------------
function cborUint(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 0x100) return Buffer.from([(major << 5) | 24, value]);
  if (value < 0x10000) {
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(value, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(value, 1);
  return b;
}

type CborValue = number | string | Buffer | Map<number | string, CborValue>;

function cborEncode(value: CborValue): Buffer {
  if (typeof value === "number") {
    return value >= 0 ? cborUint(0, value) : cborUint(1, -1 - value);
  }
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([cborUint(3, bytes.length), bytes]);
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([cborUint(2, value.length), value]);
  }
  const parts: Buffer[] = [cborUint(5, value.size)];
  for (const [k, v] of value) {
    parts.push(cborEncode(k), cborEncode(v));
  }
  return Buffer.concat(parts);
}

export class SoftwareAuthenticator {
  private readonly privateKey: KeyObject;
  readonly publicKeyRaw: Buffer;
  readonly credentialId: string;
  private counter: number;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
    state?: AuthenticatorState,
  ) {
    if (state) {
      this.privateKey = createPrivateKey(state.privateKeyPem);
      this.credentialId = state.credentialId;
      this.counter = state.counter;
    } else {
      const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      this.privateKey = privateKey;
      this.credentialId = b64url(randomBytes(32));
      this.counter = 0;
    }
    const jwk = createPublicKey(this.privateKey).export({ format: "jwk" });
    const x = Buffer.from(String(jwk.x), "base64url");
    const y = Buffer.from(String(jwk.y), "base64url");
    this.publicKeyRaw = Buffer.concat([Buffer.from([0x04]), x, y]);
  }

  toState(): AuthenticatorState {
    return {
      credentialId: this.credentialId,
      privateKeyPem: this.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      publicKeyHex: this.publicKeyRaw.toString("hex"),
      counter: this.counter,
    };
  }

  private rpIdHash(): Buffer {
    return sha256(Buffer.from(this.rpId, "utf8"));
  }

  private coseKey(): Buffer {
    const map = new Map<number, CborValue>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, this.publicKeyRaw.subarray(1, 33)],
      [-3, this.publicKeyRaw.subarray(33, 65)],
    ]);
    return cborEncode(map);
  }

  /** @simplewebauthn/browser `startRegistration` shape. */
  async startRegistration(input: { optionsJSON: Json }): Promise<Json> {
    const challenge = String(input.optionsJSON.challenge);
    const clientData = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge, origin: this.origin, crossOrigin: false }),
    );
    const credIdBytes = Buffer.from(this.credentialId, "base64url");
    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(credIdBytes.length);
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([
      this.rpIdHash(),
      Buffer.from([0x45]), // UP | UV | AT
      counter,
      Buffer.alloc(16), // aaguid
      credIdLen,
      credIdBytes,
      this.coseKey(),
    ]);
    const attestationObject = cborEncode(
      new Map<string, CborValue>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]),
    );
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(clientData),
        attestationObject: b64url(attestationObject),
        authenticatorData: b64url(authData),
        transports: ["internal"],
        publicKeyAlgorithm: -7,
        publicKey: b64url(this.publicKeyRaw),
      },
    };
  }

  /** @simplewebauthn/browser `startAuthentication` shape. */
  async startAuthentication(input: { optionsJSON: Json }): Promise<Json> {
    const challenge = String(input.optionsJSON.challenge);
    const allow = input.optionsJSON.allowCredentials as Array<{ id: string }> | undefined;
    if (allow && allow.length > 0 && !allow.some((c) => c.id === this.credentialId)) {
      throw new Error("SoftwareAuthenticator: requested credential is not this authenticator's credential");
    }
    const clientData = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge, origin: this.origin, crossOrigin: false }),
    );
    this.counter += 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([this.rpIdHash(), Buffer.from([0x05]), counter]); // UP | UV
    const message = Buffer.concat([authData, sha256(clientData)]);
    const signature = cryptoSign("sha256", message, { key: this.privateKey, dsaEncoding: "der" });
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(clientData),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
        userHandle: null,
      },
    };
  }
}
