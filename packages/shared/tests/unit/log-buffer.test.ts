/**
 * Tests for LogBuffer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogBuffer, FLUSH_INTERVAL_MS, type FlushCallback } from '../../src/logging/log-buffer.js';
import type { LogEntry } from '../../src/logging/logger.js';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'test',
    ...overrides,
  };
}

describe('LogBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports the default flush interval', () => {
    expect(FLUSH_INTERVAL_MS).toBe(5_000);
  });

  describe('add / size', () => {
    it('adds entries to the internal buffer', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush });
      buffer.add(makeEntry());
      buffer.add(makeEntry());
      expect(buffer.size).toBe(2);
      buffer.destroy();
    });

    it('drops entries after destroy', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush });
      buffer.destroy();
      buffer.add(makeEntry());
      expect(buffer.size).toBe(0);
    });
  });

  describe('flush', () => {
    it('calls onFlush with accumulated entries and clears the buffer', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush });

      const e1 = makeEntry({ message: 'a' });
      const e2 = makeEntry({ message: 'b' });
      buffer.add(e1);
      buffer.add(e2);

      buffer.flush();

      expect(onFlush).toHaveBeenCalledOnce();
      expect(onFlush).toHaveBeenCalledWith([e1, e2]);
      expect(buffer.size).toBe(0);
      buffer.destroy();
    });

    it('is a no-op when the buffer is empty', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush });
      buffer.flush();
      expect(onFlush).not.toHaveBeenCalled();
      buffer.destroy();
    });

    it('does not throw when onFlush throws', () => {
      const onFlush = vi.fn(() => { throw new Error('boom'); });
      const buffer = new LogBuffer({ onFlush });
      buffer.add(makeEntry());
      expect(() => buffer.flush()).not.toThrow();
      buffer.destroy();
    });
  });

  describe('timer flush', () => {
    it('automatically flushes after the configured interval', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush, flushIntervalMs: 100 });
      buffer.add(makeEntry());

      vi.advanceTimersByTime(100);
      expect(onFlush).toHaveBeenCalledOnce();
      expect(buffer.size).toBe(0);
      buffer.destroy();
    });

    it('uses default interval when not specified', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush });
      buffer.add(makeEntry());

      vi.advanceTimersByTime(FLUSH_INTERVAL_MS - 1);
      expect(onFlush).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onFlush).toHaveBeenCalledOnce();
      buffer.destroy();
    });
  });

  describe('fatal force flush', () => {
    it('immediately flushes when a fatal entry is added', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush });
      buffer.add(makeEntry({ message: 'regular' }));
      expect(onFlush).not.toHaveBeenCalled();

      buffer.add(makeEntry({ level: 'fatal', message: 'boom' }));
      expect(onFlush).toHaveBeenCalledOnce();
      expect(onFlush.mock.calls[0]![0]).toHaveLength(2);
      buffer.destroy();
    });
  });

  describe('destroy', () => {
    it('flushes remaining entries on destroy', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush });
      buffer.add(makeEntry());
      buffer.add(makeEntry());

      buffer.destroy();
      expect(onFlush).toHaveBeenCalledOnce();
      expect(onFlush.mock.calls[0]![0]).toHaveLength(2);
    });

    it('is idempotent', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush });
      buffer.add(makeEntry());
      buffer.destroy();
      buffer.destroy();
      expect(onFlush).toHaveBeenCalledOnce();
    });

    it('stops the timer so no further flushes occur', () => {
      const onFlush = vi.fn();
      const buffer = new LogBuffer({ onFlush, flushIntervalMs: 100 });
      buffer.destroy();

      vi.advanceTimersByTime(500);
      // onFlush called once by destroy (empty => no call), so should be 0
      expect(onFlush).not.toHaveBeenCalled();
    });
  });
});
