import { describe, it, expect } from 'vitest';
import {
  extractVolumeMounts,
  VOLUME_LABEL_PREFIX,
  type PackEntry,
} from './packs';

describe('VOLUME_LABEL_PREFIX', () => {
  it('equals "volume:"', () => {
    expect(VOLUME_LABEL_PREFIX).toBe('volume:');
  });
});

describe('extractVolumeMounts', () => {
  function makePack(labels?: string[]): PackEntry {
    return {
      name: 'test-pack',
      runtimeTag: 'browser',
      metadata: labels ? { labels } : undefined,
    };
  }

  it('extracts a single volume mount', () => {
    const pack = makePack(['volume:counter-data:/app/data']);
    expect(extractVolumeMounts(pack)).toEqual([
      { name: 'counter-data', mountPath: '/app/data' },
    ]);
  });

  it('extracts multiple volume mounts', () => {
    const pack = makePack([
      'volume:vol-a:/mnt/a',
      'volume:vol-b:/mnt/b',
    ]);
    expect(extractVolumeMounts(pack)).toEqual([
      { name: 'vol-a', mountPath: '/mnt/a' },
      { name: 'vol-b', mountPath: '/mnt/b' },
    ]);
  });

  it('ignores non-volume labels', () => {
    const pack = makePack(['start:Utilities', 'service', 'volume:data:/app/data']);
    const mounts = extractVolumeMounts(pack);
    expect(mounts).toHaveLength(1);
    expect(mounts[0]).toEqual({ name: 'data', mountPath: '/app/data' });
  });

  it('returns empty array when no labels', () => {
    expect(extractVolumeMounts(makePack())).toEqual([]);
    expect(extractVolumeMounts(makePack([]))).toEqual([]);
  });

  it('returns empty array when no volume labels', () => {
    const pack = makePack(['start:Games', 'service']);
    expect(extractVolumeMounts(pack)).toEqual([]);
  });

  it('skips labels with missing volume name', () => {
    const pack = makePack(['volume::/app/data']);
    expect(extractVolumeMounts(pack)).toEqual([]);
  });

  it('skips labels with missing mount path', () => {
    const pack = makePack(['volume:mydata:']);
    expect(extractVolumeMounts(pack)).toEqual([]);
  });

  it('skips labels with only the prefix', () => {
    const pack = makePack(['volume:']);
    expect(extractVolumeMounts(pack)).toEqual([]);
  });

  it('handles mount path with multiple colons', () => {
    // only first colon after volume name is the separator
    const pack = makePack(['volume:vol:/path/with:colon']);
    expect(extractVolumeMounts(pack)).toEqual([
      { name: 'vol', mountPath: '/path/with:colon' },
    ]);
  });

  it('handles pack with no metadata', () => {
    const pack: PackEntry = { name: 'bare', runtimeTag: 'node' };
    expect(extractVolumeMounts(pack)).toEqual([]);
  });
});
