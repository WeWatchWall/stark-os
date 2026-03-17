import { describe, it, expect } from 'vitest';
import {
  extractVolumeMounts,
  validateNamespace,
  VOLUME_LABEL_PREFIX,
  type PackEntry,
  type UserInfo,
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

describe('validateNamespace', () => {
  const adminUser: UserInfo = {
    email: 'admin@example.com',
    userId: 'admin-1',
    username: 'admin',
    roles: ['admin'],
    isAdmin: true,
    defaultNamespace: 'default',
  };

  const regularUser: UserInfo = {
    email: 'alice@example.com',
    userId: 'user-1',
    username: 'alice',
    roles: ['user'],
    isAdmin: false,
    defaultNamespace: 'alice',
  };

  it('allows admin to use any namespace', () => {
    expect(validateNamespace('default', adminUser)).toBe('');
    expect(validateNamespace('alice', adminUser)).toBe('');
    expect(validateNamespace('bob/project', adminUser)).toBe('');
    expect(validateNamespace('stark-system', adminUser)).toBe('');
  });

  it('allows regular user to use their own namespace', () => {
    expect(validateNamespace('alice', regularUser)).toBe('');
  });

  it('allows regular user to use sub-namespaces', () => {
    expect(validateNamespace('alice/my-project', regularUser)).toBe('');
    expect(validateNamespace('alice/deep/path', regularUser)).toBe('');
  });

  it('rejects regular user using another namespace', () => {
    const error = validateNamespace('bob', regularUser);
    expect(error).toBeTruthy();
    expect(error).toContain('alice');
  });

  it('rejects regular user using default namespace', () => {
    const error = validateNamespace('default', regularUser);
    expect(error).toBeTruthy();
  });

  it('returns empty string for empty namespace', () => {
    expect(validateNamespace('', regularUser)).toBe('');
    expect(validateNamespace('  ', regularUser)).toBe('');
  });

  it('returns empty when user has no username', () => {
    const noUsername: UserInfo = {
      email: 'anon@example.com',
      userId: 'user-2',
      isAdmin: false,
      defaultNamespace: 'default',
    };
    expect(validateNamespace('anything', noUsername)).toBe('');
  });
});
