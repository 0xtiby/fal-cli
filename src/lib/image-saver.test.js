import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { extensionFromContentType, generateFilename, saveImage } from './image-saver.js';

describe('extensionFromContentType', () => {
  it('maps image/png to png', () => {
    assert.equal(extensionFromContentType('image/png'), 'png');
  });

  it('maps image/jpeg to jpg', () => {
    assert.equal(extensionFromContentType('image/jpeg'), 'jpg');
  });

  it('maps image/webp to webp', () => {
    assert.equal(extensionFromContentType('image/webp'), 'webp');
  });

  it('returns png for null', () => {
    assert.equal(extensionFromContentType(null), 'png');
  });

  it('returns png for undefined', () => {
    assert.equal(extensionFromContentType(undefined), 'png');
  });

  it('returns png for application/octet-stream', () => {
    assert.equal(extensionFromContentType('application/octet-stream'), 'png');
  });

  it('handles content-type with charset', () => {
    assert.equal(extensionFromContentType('image/jpeg; charset=utf-8'), 'jpg');
  });
});

describe('generateFilename', () => {
  it('generates correct format for fal-ai/flux/schnell', () => {
    const name = generateFilename('fal-ai/flux/schnell', 'png');
    assert.match(name, /^\d{4}-\d{2}-\d{2}_\d{6}_flux-schnell\.png$/);
  });

  it('generates correct format for fal-ai/flux/dev', () => {
    const name = generateFilename('fal-ai/flux/dev', 'jpg');
    assert.ok(name.endsWith('_flux-dev.jpg'));
  });

  it('uses provided date', () => {
    const date = new Date(2026, 0, 15, 9, 5, 3); // 2026-01-15 09:05:03
    const name = generateFilename('fal-ai/flux/schnell', 'png', date);
    assert.equal(name, '2026-01-15_090503_flux-schnell.png');
  });
});

describe('saveImage', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-saver-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes correct bytes to expected path', async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
    const mockFetch = async () => ({
      ok: true,
      headers: new Map([['content-type', 'image/png']]),
      arrayBuffer: async () => imageBytes.buffer,
    });
    // Make headers.get work like a real Headers object
    const realMockFetch = async (url) => {
      const headers = { get: (key) => key === 'content-type' ? 'image/png' : null };
      return { ok: true, headers, arrayBuffer: async () => imageBytes.buffer };
    };

    const outputDir = path.join(tmpDir, 'output');
    const filePath = await saveImage('https://cdn.example.com/img.png', outputDir, 'fal-ai/flux/schnell', { _fetch: realMockFetch });

    assert.ok(filePath.endsWith('.png'));
    assert.ok(filePath.includes('flux-schnell'));
    const written = await fs.readFile(filePath);
    assert.deepEqual(new Uint8Array(written), imageBytes);
  });

  it('retries once: first fetch fails, second succeeds', async () => {
    let calls = 0;
    const imageBytes = new Uint8Array([0xFF, 0xD8]);
    const mockFetch = async () => {
      calls++;
      if (calls === 1) throw new Error('network error');
      return {
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => imageBytes.buffer,
      };
    };

    const outputDir = path.join(tmpDir, 'retry-ok');
    const filePath = await saveImage('https://cdn.example.com/img.jpg', outputDir, 'fal-ai/flux/dev', { _fetch: mockFetch });

    assert.equal(calls, 2);
    assert.ok(filePath.endsWith('.jpg'));
    const written = await fs.readFile(filePath);
    assert.deepEqual(new Uint8Array(written), imageBytes);
  });

  it('throws with CDN URL when both attempts fail', async () => {
    const cdnUrl = 'https://cdn.example.com/img.png';
    const mockFetch = async () => { throw new Error('timeout'); };

    const outputDir = path.join(tmpDir, 'retry-fail');
    await assert.rejects(
      () => saveImage(cdnUrl, outputDir, 'fal-ai/flux/schnell', { _fetch: mockFetch }),
      (err) => {
        assert.ok(err.message.includes(cdnUrl));
        return true;
      }
    );
  });

  it('throws with CDN URL when HTTP errors on both attempts', async () => {
    const cdnUrl = 'https://cdn.example.com/img.png';
    const mockFetch = async () => ({ ok: false, status: 500 });

    const outputDir = path.join(tmpDir, 'http-fail');
    await assert.rejects(
      () => saveImage(cdnUrl, outputDir, 'fal-ai/flux/schnell', { _fetch: mockFetch }),
      (err) => {
        assert.ok(err.message.includes(cdnUrl));
        return true;
      }
    );
  });
});
