import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { extensionFromContentType, generateFilename, saveFile } from './file-saver.js';

describe('file-saver extensionFromContentType', () => {
  it('maps image/png to png', () => {
    assert.equal(extensionFromContentType('image/png'), 'png');
  });

  it('maps video/mp4 to mp4', () => {
    assert.equal(extensionFromContentType('video/mp4'), 'mp4');
  });

  it('maps audio/mpeg to mp3', () => {
    assert.equal(extensionFromContentType('audio/mpeg'), 'mp3');
  });

  it('maps application/json to json', () => {
    assert.equal(extensionFromContentType('application/json'), 'json');
  });

  it('returns bin for null', () => {
    assert.equal(extensionFromContentType(null), 'bin');
  });

  it('returns bin for unknown content-type', () => {
    assert.equal(extensionFromContentType('application/octet-stream'), 'bin');
  });

  it('maps image/webp to webp', () => {
    assert.equal(extensionFromContentType('image/webp'), 'webp');
  });

  it('maps image/gif to gif', () => {
    assert.equal(extensionFromContentType('image/gif'), 'gif');
  });

  it('maps image/jpeg to jpg', () => {
    assert.equal(extensionFromContentType('image/jpeg'), 'jpg');
  });

  it('maps video/webm to webm', () => {
    assert.equal(extensionFromContentType('video/webm'), 'webm');
  });

  it('maps audio/wav to wav', () => {
    assert.equal(extensionFromContentType('audio/wav'), 'wav');
  });

  it('maps audio/ogg to ogg', () => {
    assert.equal(extensionFromContentType('audio/ogg'), 'ogg');
  });

  it('handles content-type with charset', () => {
    assert.equal(extensionFromContentType('image/jpeg; charset=utf-8'), 'jpg');
  });

  it('returns bin for undefined', () => {
    assert.equal(extensionFromContentType(undefined), 'bin');
  });
});

describe('file-saver generateFilename', () => {
  const fixedDate = new Date(2026, 0, 15, 9, 5, 3); // 2026-01-15 09:05:03

  it('generates correct format without suffix', () => {
    const name = generateFilename('fal-ai/flux/schnell', 'png', { now: fixedDate });
    assert.equal(name, '2026-01-15_090503_flux-schnell.png');
  });

  it('generates correct format with suffix', () => {
    const name = generateFilename('fal-ai/flux/schnell', 'png', { suffix: '_001', now: fixedDate });
    assert.equal(name, '2026-01-15_090503_flux-schnell_001.png');
  });

  it('uses modelSlug correctly for nested model IDs', () => {
    const name = generateFilename('fal-ai/flux/dev', 'jpg', { now: fixedDate });
    assert.ok(name.includes('flux-dev'));
  });

  it('generates sequential suffixes for multi-file output', () => {
    const name1 = generateFilename('fal-ai/flux/schnell', 'png', { suffix: '_001', now: fixedDate });
    const name2 = generateFilename('fal-ai/flux/schnell', 'png', { suffix: '_002', now: fixedDate });
    assert.equal(name1, '2026-01-15_090503_flux-schnell_001.png');
    assert.equal(name2, '2026-01-15_090503_flux-schnell_002.png');
  });

  it('defaults to current date when no now option', () => {
    const name = generateFilename('fal-ai/flux/schnell', 'png');
    assert.match(name, /^\d{4}-\d{2}-\d{2}_\d{6}_flux-schnell\.png$/);
  });
});

describe('file-saver saveFile', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-saver-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('saves image/png and returns localPath and contentType', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const mockFetch = async () => ({
      ok: true,
      headers: { get: (key) => key === 'content-type' ? 'image/png' : null },
      arrayBuffer: async () => bytes.buffer,
    });

    const outputDir = path.join(tmpDir, 'output');
    const result = await saveFile('https://cdn.example.com/img.png', outputDir, 'fal-ai/flux/schnell', { _fetch: mockFetch });

    assert.ok(result.localPath.endsWith('.png'));
    assert.equal(result.contentType, 'image/png');
    const written = await fs.readFile(result.localPath);
    assert.deepEqual(new Uint8Array(written), bytes);
  });

  it('saves video/mp4 with correct extension', async () => {
    const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x1C]);
    const mockFetch = async () => ({
      ok: true,
      headers: { get: () => 'video/mp4' },
      arrayBuffer: async () => bytes.buffer,
    });

    const outputDir = path.join(tmpDir, 'video');
    const result = await saveFile('https://cdn.example.com/vid.mp4', outputDir, 'fal-ai/kling/v1', { _fetch: mockFetch });

    assert.ok(result.localPath.endsWith('.mp4'));
    assert.equal(result.contentType, 'video/mp4');
  });

  it('falls back to bin for unknown content-type', async () => {
    const bytes = new Uint8Array([0x01, 0x02]);
    const mockFetch = async () => ({
      ok: true,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => bytes.buffer,
    });

    const outputDir = path.join(tmpDir, 'unknown');
    const result = await saveFile('https://cdn.example.com/file', outputDir, 'fal-ai/some/model', { _fetch: mockFetch });

    assert.ok(result.localPath.endsWith('.bin'));
  });

  it('retries once: first fetch fails, second succeeds', async () => {
    let calls = 0;
    const bytes = new Uint8Array([0xFF, 0xD8]);
    const mockFetch = async () => {
      calls++;
      if (calls === 1) throw new Error('network error');
      return {
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => bytes.buffer,
      };
    };

    const outputDir = path.join(tmpDir, 'retry-ok');
    const result = await saveFile('https://cdn.example.com/img.jpg', outputDir, 'fal-ai/flux/dev', { _fetch: mockFetch });

    assert.equal(calls, 2);
    assert.ok(result.localPath.endsWith('.jpg'));
  });

  it('throws when both attempts fail', async () => {
    const cdnUrl = 'https://cdn.example.com/file.mp4';
    const mockFetch = async () => { throw new Error('timeout'); };

    const outputDir = path.join(tmpDir, 'fail');
    await assert.rejects(
      () => saveFile(cdnUrl, outputDir, 'fal-ai/flux/schnell', { _fetch: mockFetch }),
      (err) => {
        assert.ok(err.message.includes(cdnUrl));
        return true;
      }
    );
  });

  it('generates filename with suffix for multi-file output', async () => {
    const bytes = new Uint8Array([0x01]);
    const mockFetch = async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => bytes.buffer,
    });

    const outputDir = path.join(tmpDir, 'multi');
    const r1 = await saveFile('https://cdn.example.com/img1.png', outputDir, 'fal-ai/flux/schnell', { suffix: '_001', _fetch: mockFetch });
    const r2 = await saveFile('https://cdn.example.com/img2.png', outputDir, 'fal-ai/flux/schnell', { suffix: '_002', _fetch: mockFetch });

    assert.ok(r1.localPath.includes('_001.png'));
    assert.ok(r2.localPath.includes('_002.png'));
  });

  it('creates nested output directories recursively', async () => {
    const bytes = new Uint8Array([0x01]);
    const mockFetch = async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => bytes.buffer,
    });

    const nestedDir = path.join(tmpDir, 'deep', 'nested', 'dir');
    const result = await saveFile('https://cdn.example.com/img.png', nestedDir, 'fal-ai/flux/schnell', { _fetch: mockFetch });

    assert.ok(result.localPath.startsWith(nestedDir));
    const written = await fs.readFile(result.localPath);
    assert.deepEqual(new Uint8Array(written), bytes);
  });

  it('retries once on HTTP error status, then succeeds', async () => {
    let calls = 0;
    const bytes = new Uint8Array([0x89, 0x50]);
    const mockFetch = async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503, headers: { get: () => null } };
      return {
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => bytes.buffer,
      };
    };

    const outputDir = path.join(tmpDir, 'retry-http');
    const result = await saveFile('https://cdn.example.com/img.png', outputDir, 'fal-ai/flux/schnell', { _fetch: mockFetch });

    assert.equal(calls, 2);
    assert.ok(result.localPath.endsWith('.png'));
  });

  it('throws with CDN URL on double HTTP error', async () => {
    const cdnUrl = 'https://cdn.example.com/file.png';
    const mockFetch = async () => ({ ok: false, status: 500, headers: { get: () => null } });

    await assert.rejects(
      () => saveFile(cdnUrl, path.join(tmpDir, 'fail'), 'fal-ai/flux/schnell', { _fetch: mockFetch }),
      (err) => {
        assert.ok(err.message.includes(cdnUrl));
        assert.ok(err.message.includes('500'));
        return true;
      }
    );
  });
});
