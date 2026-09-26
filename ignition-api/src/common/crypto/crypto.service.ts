import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import * as nacl from 'tweetnacl';

@Injectable()
export class CryptoService {
  // ─── Secure RNG ──────────────────────────────────────────────────────────────

  /** Returns cryptographically secure random bytes. */
  randomBytes(length: number): Buffer {
    return randomBytes(length);
  }

  /** Returns a hex-encoded secure random nonce (16 bytes by default). */
  randomHex(bytes = 16): string {
    return randomBytes(bytes).toString('hex');
  }

  // ─── Key Management ──────────────────────────────────────────────────────────

  /** Generate a new Stellar Ed25519 keypair. */
  generateKeypair(): { publicKey: string; secretKey: string } {
    const kp = Keypair.random();
    return { publicKey: kp.publicKey(), secretKey: kp.secret() };
  }

  /** Validate a Stellar Ed25519 public key. */
  isValidPublicKey(publicKey: string): boolean {
    return StrKey.isValidEd25519PublicKey(publicKey);
  }

  // ─── Signing (Ed25519 via Stellar SDK) ───────────────────────────────────────

  /**
   * Sign a message with a Stellar secret key.
   * Returns the Base64-encoded signature.
   */
  sign(message: string, secretKey: string): string {
    const kp = Keypair.fromSecret(secretKey);
    const sig = kp.sign(Buffer.from(message, 'utf8'));
    return sig.toString('base64');
  }

  /**
   * Verify a Base64-encoded Ed25519 signature against a message.
   */
  verify(message: string, signatureB64: string, publicKey: string): boolean {
    const kp = Keypair.fromPublicKey(publicKey);
    return kp.verify(
      Buffer.from(message, 'utf8'),
      Buffer.from(signatureB64, 'base64'),
    );
  }

  // ─── Symmetric Encryption (TweetNaCl secretbox / XSalsa20-Poly1305) ─────────

  /**
   * Encrypt plaintext with a 32-byte symmetric key.
   * Returns `{ nonce, ciphertext }` as Base64 strings.
   */
  encrypt(
    plaintext: string,
    key: Uint8Array,
  ): { nonce: string; ciphertext: string } {
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const box = nacl.secretbox(Buffer.from(plaintext, 'utf8'), nonce, key);
    return {
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(box).toString('base64'),
    };
  }

  /**
   * Decrypt a secretbox ciphertext.
   * Throws if authentication fails (tampered data / wrong key).
   */
  decrypt(ciphertextB64: string, nonceB64: string, key: Uint8Array): string {
    const box = Buffer.from(ciphertextB64, 'base64');
    const nonce = Buffer.from(nonceB64, 'base64');
    const plaintext = nacl.secretbox.open(box, nonce, key);
    if (!plaintext) throw new Error('Decryption failed: authentication error');
    return Buffer.from(plaintext).toString('utf8');
  }

  /** Derive a 32-byte symmetric key from a raw secret (e.g. env var). */
  deriveKey(secret: string): Uint8Array {
    // SHA-256 gives us exactly the 32 bytes nacl.secretbox expects
    return new Uint8Array(createHash('sha256').update(secret).digest());
  }
}
