import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Avoid the optimizing compiler's CPU cost during the three-case cold run.
setFlagsFromString('--no-incremental-marking --no-turbofan');

type FileValue = string | number | boolean | null;
type OutputTree = Record<string, FileValue>;
const { run } = (await import('./solve.js')) as { run: (input: unknown) => OutputTree };

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Unicode mode sees a valid surrogate pair as one code point outside the range.
const NEEDS_ESCAPE = /["\\\x00-\x1f\ud800-\udfff]/u;
const MIN_CHUNK_BYTES = 64 * 1024;

function scalarToken(value: number | boolean | null): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return 'null';
}

function serialize(tree: OutputTree): Buffer {
  const keys = Object.keys(tree);
  let estimate = 2 + keys.length * 6;
  for (const key of keys) {
    const value = tree[key];
    estimate += key.length + (typeof value === 'string' ? value.length : 24);
  }

  let buffer = Buffer.allocUnsafe(estimate + Math.ceil(estimate / 8));
  let offset = 0;
  const chunks: Buffer[] = [];
  let sealedBytes = 0;

  function reserve(bytes: number) {
    if (offset + bytes <= buffer.length) return;
    chunks.push(buffer.subarray(0, offset));
    sealedBytes += offset;
    buffer = Buffer.allocUnsafe(Math.max(bytes, MIN_CHUNK_BYTES));
    offset = 0;
  }

  function writeString(text: string) {
    const raw = !NEEDS_ESCAPE.test(text);
    const token = raw ? text : JSON.stringify(text);
    // Keep room for quotes on the bulk-copy path and punctuation after the token.
    // Count exact UTF-8 bytes only when the upper bound may not fit this chunk.
    const punctuation = raw ? 6 : 4;
    if (offset + token.length * 3 + punctuation > buffer.length) {
      reserve(Buffer.byteLength(token) + punctuation);
    }
    if (raw) buffer[offset++] = 34; // "
    offset += buffer.write(token, offset);
    if (raw) buffer[offset++] = 34; // "
  }

  buffer[offset++] = 123; // {
  for (let j = 0; j < keys.length; j++) {
    const key = keys[j];
    if (j !== 0) buffer[offset++] = 44; // ,
    writeString(key);
    buffer[offset++] = 58; // :
    const value = tree[key];
    if (typeof value === 'string') {
      writeString(value);
    } else {
      const token = scalarToken(value);
      reserve(token.length + 4);
      offset += buffer.write(token, offset, token.length, 'ascii');
    }
  }
  buffer[offset++] = 125; // }

  const last = buffer.subarray(0, offset);
  if (chunks.length === 0) return last;
  chunks.push(last);
  return Buffer.concat(chunks, sealedBytes + offset);
}

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json')).toString('utf8')) as { input: unknown }[];
const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w');
try {
  writeFileSync(fd, '[');
  for (let i = 0; i < cases.length; i++) {
    if (i !== 0) writeFileSync(fd, ',');
    const tree = run(cases[i].input);
    cases[i].input = null;
    writeFileSync(fd, serialize(tree));
  }
  writeFileSync(fd, ']');
} finally {
  closeSync(fd);
}
