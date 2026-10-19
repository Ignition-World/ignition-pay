import { createHash } from 'crypto';
import StellarSdk, { StrKey } from '@stellar/stellar-sdk';
import { WalletNetwork } from './dto/create-wallet.dto';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function sha256(value: Buffer): Buffer {
  return createHash('sha256').update(value).digest();
}

function decodeBase58(value: string): Buffer | null {
  let number = 0n;
  for (const character of value) {
    const index = BASE58_ALPHABET.indexOf(character);
    if (index < 0) return null;
    number = number * 58n + BigInt(index);
  }

  const bytes: number[] = [];
  while (number > 0n) {
    bytes.unshift(Number(number & 255n));
    number >>= 8n;
  }

  const leadingZeroes = value.match(/^1*/)?.[0].length ?? 0;
  return Buffer.concat([Buffer.alloc(leadingZeroes), Buffer.from(bytes)]);
}

function isValidBitcoinBase58Address(address: string): boolean {
  const decoded = decodeBase58(address);
  if (!decoded || decoded.length !== 25) return false;

  const payload = decoded.subarray(0, 21);
  return sha256(sha256(payload)).subarray(0, 4).equals(decoded.subarray(21));
}

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    generators.forEach((generator, index) => {
      if ((top >>> index) & 1) checksum ^= generator;
    });
  }
  return checksum >>> 0;
}

function isValidBitcoinBech32Address(address: string): boolean {
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return false;

  const normalized = address.toLowerCase();
  const separator = normalized.lastIndexOf('1');
  if (separator < 1 || separator + 7 > normalized.length) return false;

  const hrp = normalized.slice(0, separator);
  if (hrp !== 'bc' && hrp !== 'tb') return false;

  const data = normalized.slice(separator + 1).split('').map((character) => BECH32_CHARSET.indexOf(character));
  if (data.some((value) => value < 0)) return false;

  const prefix = [
    ...hrp.split('').map((character) => character.charCodeAt(0) >> 5),
    0,
    ...hrp.split('').map((character) => character.charCodeAt(0) & 31),
  ];
  const checksum = bech32Polymod([...prefix, ...data]);
  return checksum === 1 || checksum === 0x2bc830a3;
}

export function isValidNetworkAddress(address: string, network: WalletNetwork): boolean {
  if (!address) return false;

  switch (network) {
    case WalletNetwork.STELLAR:
      return StrKey.isValidEd25519PublicKey(address);
    case WalletNetwork.ETHEREUM:
      return /^0x[0-9a-fA-F]{40}$/.test(address);
    case WalletNetwork.BITCOIN:
      return isValidBitcoinBase58Address(address) || isValidBitcoinBech32Address(address);
    default:
      return false;
  }
}

export function isValidNetworkIssuer(issuer: string, network: WalletNetwork): boolean {
  return isValidNetworkAddress(issuer, network);
}

export function generateNetworkAddress(network: WalletNetwork): string {
  if (network === WalletNetwork.STELLAR) return StellarSdk.Keypair.random().publicKey();
  throw new Error(`A deposit address is required for ${network} wallets`);
}