import { describe, it, expect } from 'vitest';
import {
  buildClipboardText,
  parseClipboard,
  extractSourceDir,
  isZipPath,
  splitZipPath,
  CLIPBOARD_COPY_PREFIX,
  CLIPBOARD_CUT_PREFIX,
} from './fileops';

describe('buildClipboardText', () => {
  it('builds copy clipboard text with stark-copy: prefix', () => {
    const result = buildClipboardText('copy', '/home/desktop', ['file1.txt', 'folder1']);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('stark-copy:/home/desktop/file1.txt');
    expect(lines[1]).toBe('stark-copy:/home/desktop/folder1');
  });

  it('builds cut clipboard text with stark-cut: prefix', () => {
    const result = buildClipboardText('cut', '/home', ['doc.pdf']);
    expect(result).toBe('stark-cut:/home/doc.pdf');
  });

  it('normalizes paths', () => {
    const result = buildClipboardText('copy', '/home//desktop/', ['file.txt']);
    expect(result).toBe('stark-copy:/home/desktop/file.txt');
  });
});

describe('parseClipboard', () => {
  it('parses copy clipboard text', () => {
    const text = 'stark-copy:/home/desktop/a.txt\nstark-copy:/home/desktop/b.txt';
    const parsed = parseClipboard(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.mode).toBe('copy');
    expect(parsed!.paths).toEqual(['/home/desktop/a.txt', '/home/desktop/b.txt']);
  });

  it('parses cut clipboard text', () => {
    const text = 'stark-cut:/home/file.txt';
    const parsed = parseClipboard(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.mode).toBe('cut');
    expect(parsed!.paths).toEqual(['/home/file.txt']);
  });

  it('returns null for non-stark clipboard text', () => {
    expect(parseClipboard('hello world')).toBeNull();
    expect(parseClipboard('')).toBeNull();
  });

  it('ignores lines with different prefix', () => {
    const text = 'stark-copy:/a.txt\nstark-cut:/b.txt';
    const parsed = parseClipboard(text);
    expect(parsed!.mode).toBe('copy');
    expect(parsed!.paths).toEqual(['/a.txt']);
  });
});

describe('extractSourceDir', () => {
  it('extracts source directory and names from paths', () => {
    const paths = ['/home/desktop/file1.txt', '/home/desktop/folder1'];
    const { srcDir, names } = extractSourceDir(paths);
    expect(srcDir).toBe('/home/desktop');
    expect(names).toEqual(['file1.txt', 'folder1']);
  });

  it('handles root-level paths', () => {
    const paths = ['/trash'];
    const { srcDir, names } = extractSourceDir(paths);
    expect(srcDir).toBe('/');
    expect(names).toEqual(['trash']);
  });

  it('handles deeply nested paths', () => {
    const paths = ['/home/desktop/projects/src/main.ts'];
    const { srcDir, names } = extractSourceDir(paths);
    expect(srcDir).toBe('/home/desktop/projects/src');
    expect(names).toEqual(['main.ts']);
  });
});

describe('isZipPath', () => {
  it('returns true when path traverses into a zip', () => {
    expect(isZipPath('/home/archive.zip/folder')).toBe(true);
    expect(isZipPath('/home/docs/data.zip/sub/file.txt')).toBe(true);
    expect(isZipPath('/archive.ZIP/readme.md')).toBe(true);
  });

  it('returns false when path points AT a zip (not inside)', () => {
    expect(isZipPath('/home/archive.zip')).toBe(false);
    expect(isZipPath('/home/docs/data.zip')).toBe(false);
  });

  it('returns false for non-zip paths', () => {
    expect(isZipPath('/home/desktop')).toBe(false);
    expect(isZipPath('/home/file.txt')).toBe(false);
    expect(isZipPath('/')).toBe(false);
  });
});

describe('splitZipPath', () => {
  it('splits a zip-traversing path correctly', () => {
    const result = splitZipPath('/home/docs/archive.zip/sub/file.txt');
    expect(result).not.toBeNull();
    expect(result!.opfsDir).toBe('/home/docs');
    expect(result!.zipName).toBe('archive.zip');
    expect(result!.innerPath).toBe('sub/file.txt');
  });

  it('splits a path at zip root level', () => {
    const result = splitZipPath('/home/archive.zip/readme.md');
    expect(result).not.toBeNull();
    expect(result!.opfsDir).toBe('/home');
    expect(result!.zipName).toBe('archive.zip');
    expect(result!.innerPath).toBe('readme.md');
  });

  it('handles zip at root of OPFS', () => {
    const result = splitZipPath('/archive.zip/file.txt');
    expect(result).not.toBeNull();
    expect(result!.opfsDir).toBe('/');
    expect(result!.zipName).toBe('archive.zip');
    expect(result!.innerPath).toBe('file.txt');
  });

  it('returns null for path pointing at zip file (not inside)', () => {
    expect(splitZipPath('/home/archive.zip')).toBeNull();
  });

  it('returns null for non-zip paths', () => {
    expect(splitZipPath('/home/desktop/folder')).toBeNull();
    expect(splitZipPath('/home/file.txt')).toBeNull();
  });
});
