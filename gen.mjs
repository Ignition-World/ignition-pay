import { Keypair, StrKey } from '@stellar/stellar-sdk';
import fs from 'fs';

const vectors = [];

function pushVector(id, desc, input, expected, opts = {}) {
  let inObj = typeof input === 'string' ? input : input.destination;
  let vec = {
    id,
    description: desc,
    input: inObj,
    expected: {
      type: expected.type || 'invalid',
      isValid: expected.isValid || false,
      routingSource: expected.routingSource || null,
      memoRequired: expected.memoRequired || false,
      warnings: expected.warnings || [],
      decodedMuxedId: expected.decodedMuxedId || null,
      decodedPublicKey: expected.decodedPublicKey || null,
    }
  };
  if (opts.memoType) vec.memoType = opts.memoType;
  if (opts.memoValue) vec.memoValue = opts.memoValue;
  if (opts.sourceAccount) vec.sourceAccount = opts.sourceAccount;
  vectors.push(vec);
}

const gKp = Keypair.random();
const gAddr = gKp.publicKey();

// G
pushVector('g-standard-01', 'Standard valid G-address', gAddr, { type: 'G', isValid: true, routingSource: 'none', decodedPublicKey: gAddr });
pushVector('g-standard-02', 'G-address with min bytes', StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 0)), { type: 'G', isValid: true, routingSource: 'none', decodedPublicKey: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 0)) });
pushVector('g-standard-03', 'G-address with max bytes', StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 255)), { type: 'G', isValid: true, routingSource: 'none', decodedPublicKey: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 255)) });
for(let i=4; i<=8; i++) {
  let a = Keypair.random().publicKey();
  pushVector('g-standard-0'+i, 'Random G-address '+i, a, { type: 'G', isValid: true, routingSource: 'none', decodedPublicKey: a });
}

const rawPub = gKp.rawPublicKey();

function encodeM(idStr) {
  const buf = Buffer.alloc(40);
  buf.writeBigUInt64BE(BigInt(idStr), 0);
  rawPub.copy(buf, 8);
  return StrKey.encodeMed25519PublicKey(buf);
}

// M
const m0 = encodeM('0');
pushVector('m-0', 'M-address with ID = 0', m0, { type: 'M', isValid: true, routingSource: 'muxed', decodedMuxedId: '0', decodedPublicKey: gAddr });
const m1 = encodeM('1');
pushVector('m-1', 'M-address with ID = 1', m1, { type: 'M', isValid: true, routingSource: 'muxed', decodedMuxedId: '1', decodedPublicKey: gAddr });
const m2_53_m1 = encodeM('9007199254740991');
pushVector('m-2-53-m1', 'M-address max safe js int', m2_53_m1, { type: 'M', isValid: true, routingSource: 'muxed', decodedMuxedId: '9007199254740991', decodedPublicKey: gAddr });
const m2_53 = encodeM('9007199254740992');
pushVector('m-2-53', 'M-address first unsafe js int', m2_53, { type: 'M', isValid: true, routingSource: 'muxed', decodedMuxedId: '9007199254740992', decodedPublicKey: gAddr });
const m2_53_p1 = encodeM('9007199254740993');
pushVector('m-2-53-p1', 'M-address ID > 2^53', m2_53_p1, { type: 'M', isValid: true, routingSource: 'muxed', decodedMuxedId: '9007199254740993', decodedPublicKey: gAddr });
const m2_64_m1 = encodeM('18446744073709551615');
pushVector('m-2-64-m1', 'M-address max uint64', m2_64_m1, { type: 'M', isValid: true, routingSource: 'muxed', decodedMuxedId: '18446744073709551615', decodedPublicKey: gAddr });
for(let i=7; i<=12; i++) {
  let id = (1000+i).toString();
  let m = encodeM(id);
  pushVector('m-mid-'+i, 'M-address mid range '+i, m, { type: 'M', isValid: true, routingSource: 'muxed', decodedMuxedId: id, decodedPublicKey: gAddr });
}

// C
const cAddr = StrKey.encodeContract(Buffer.alloc(32, 1));
pushVector('c-valid-01', 'Valid Contract address', cAddr, { type: 'C', isValid: true, routingSource: 'none' });
for(let i=2; i<=8; i++) {
  let c = StrKey.encodeContract(Buffer.alloc(32, i));
  pushVector('c-valid-0'+i, 'Valid Contract address '+i, c, { type: 'C', isValid: true, routingSource: 'none' });
}

// Invalid
pushVector('inv-01', 'Wrong checksum', gAddr.substring(0, 55) + 'A', { type: 'invalid', isValid: false });
pushVector('inv-02', 'Truncated G', gAddr.substring(0, 50), { type: 'invalid', isValid: false });
pushVector('inv-03', 'Too long G', gAddr + 'A', { type: 'invalid', isValid: false });
pushVector('inv-04', 'Wrong version byte (S)', gKp.secret(), { type: 'invalid', isValid: false });
pushVector('inv-05', 'Empty string', '', { type: 'invalid', isValid: false });
pushVector('inv-06', 'Whitespace only', '   ', { type: 'invalid', isValid: false });
pushVector('inv-07', 'Non-base32 chars', gAddr.substring(0, 50) + '1890OIl', { type: 'invalid', isValid: false });
pushVector('inv-08', 'Null byte injection', gAddr.substring(0, 20) + '\u0000' + gAddr.substring(20), { type: 'invalid', isValid: false });
pushVector('inv-09', 'Unicode characters', 'G💩' + gAddr.substring(2), { type: 'invalid', isValid: false });
pushVector('inv-10', 'Leading trailing spaces (trim valid)', '  ' + gAddr + ' ', { type: 'G', isValid: true, routingSource: 'none', decodedPublicKey: gAddr });
pushVector('inv-11', 'Wrong checksum M-address', m0.substring(0, 68) + 'A', { type: 'invalid', isValid: false });
pushVector('inv-12', 'Valid Base32 but wrong length for G', StrKey.encodeEd25519PublicKey(Buffer.alloc(32,0)) + 'A', { type: 'invalid', isValid: false });
pushVector('inv-13', 'Valid Base32 wrong length 2', 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', { type: 'invalid', isValid: false });

// Routing / Edge cases 
pushVector('edge-01', 'Muxed address with memo present (memo ignored)', m0, { type: 'M', isValid: true, routingSource: 'muxed', decodedMuxedId: '0', decodedPublicKey: gAddr, warnings: ['memo-ignored'] }, { memoType: 'id', memoValue: '999' });
pushVector('edge-02', 'Contract sender routing warning', gAddr, { type: 'G', isValid: true, routingSource: 'none', decodedPublicKey: gAddr, warnings: ['contract-sender'] }, { sourceAccount: cAddr });
pushVector('edge-03', 'Smart account ambiguous routing', cAddr, { type: 'C', isValid: true, routingSource: 'none', warnings: ['SMART_ACCOUNT_AMBIGUOUS_ROUTING'] }, { memoType: 'id', memoValue: '123' });
pushVector('edge-04', 'Muxed destination from contract', m0, { type: 'M', isValid: true, routingSource: 'muxed', decodedMuxedId: '0', decodedPublicKey: gAddr, warnings: ['MUXED_DESTINATION_FROM_CONTRACT'] }, { sourceAccount: cAddr });
pushVector('edge-05', 'G-address with memo routing', gAddr, { type: 'G', isValid: true, routingSource: 'memo', decodedPublicKey: gAddr, decodedMuxedId: '123' }, { memoType: 'id', memoValue: '123' });

fs.writeFileSync('examples/conformance-test-vectors/vectors.json', JSON.stringify(vectors, null, 2));
