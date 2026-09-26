import { Test, TestingModule } from '@nestjs/testing';
import { CryptoService } from './crypto.service';
import { StrKey } from '@stellar/stellar-sdk';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoService],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('randomBytes & randomHex', () => {
    it('should generate random bytes of correct length', () => {
      const length = 16;
      const bytes = service.randomBytes(length);
      expect(bytes).toBeInstanceOf(Buffer);
      expect(bytes.length).toBe(length);
    });

    it('should generate random hex string of correct length', () => {
      const bytes = 16;
      const hex = service.randomHex(bytes);
      expect(typeof hex).toBe('string');
      // Hex string is 2 chars per byte
      expect(hex.length).toBe(bytes * 2);
    });
  });

  describe('Keypair Operations', () => {
    it('should generate valid Stellar keypairs', () => {
      const kp = service.generateKeypair();
      expect(kp.publicKey).toBeDefined();
      expect(kp.secretKey).toBeDefined();
      expect(StrKey.isValidEd25519PublicKey(kp.publicKey)).toBe(true);
      expect(StrKey.isValidEd25519SecretSeed(kp.secretKey)).toBe(true);
    });

    it('should validate Ed25519 public keys', () => {
      const kp = service.generateKeypair();
      expect(service.isValidPublicKey(kp.publicKey)).toBe(true);
      expect(service.isValidPublicKey('invalid-key')).toBe(false);
      expect(service.isValidPublicKey('')).toBe(false);
    });
  });

  describe('Signing & Verification', () => {
    it('should sign and verify messages correctly', () => {
      const kp = service.generateKeypair();
      const message = 'Hello Stellar';
      const sig = service.sign(message, kp.secretKey);
      expect(typeof sig).toBe('string');

      const isVerified = service.verify(message, sig, kp.publicKey);
      expect(isVerified).toBe(true);
    });

    it('should fail verification if signature or message is modified', () => {
      const kp = service.generateKeypair();
      const message = 'Hello Stellar';
      const sig = service.sign(message, kp.secretKey);

      expect(service.verify('different message', sig, kp.publicKey)).toBe(
        false,
      );
      expect(service.verify(message, 'modifiedsig', kp.publicKey)).toBe(false);
    });
  });

  describe('Symmetric Encryption', () => {
    it('should encrypt and decrypt plaintext correctly', () => {
      const key = service.deriveKey('super-secret-key-phrase');
      const plaintext = 'Symmetric Encryption works!';

      const { nonce, ciphertext } = service.encrypt(plaintext, key);
      expect(nonce).toBeDefined();
      expect(ciphertext).toBeDefined();

      const decrypted = service.decrypt(ciphertext, nonce, key);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error if decrypting with wrong key', () => {
      const key1 = service.deriveKey('key-one');
      const key2 = service.deriveKey('key-two');
      const plaintext = 'Secret message';

      const { nonce, ciphertext } = service.encrypt(plaintext, key1);

      expect(() => {
        service.decrypt(ciphertext, nonce, key2);
      }).toThrow('Decryption failed: authentication error');
    });

    it('should derive key consistently', () => {
      const secret = 'consistent-secret';
      const key1 = service.deriveKey(secret);
      const key2 = service.deriveKey(secret);

      expect(key1).toEqual(key2);
      expect(key1.length).toBe(32);
    });
  });
});
