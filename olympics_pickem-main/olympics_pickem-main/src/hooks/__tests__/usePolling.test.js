import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePolling } from '../usePolling.js';

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts polling when enabled', () => {
    const fetchFn = vi.fn();
    renderHook(() => usePolling(fetchFn, 1000, true));

    expect(fetchFn).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not poll when disabled', () => {
    const fetchFn = vi.fn();
    renderHook(() => usePolling(fetchFn, 1000, false));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stops polling on unmount', () => {
    const fetchFn = vi.fn();
    const { unmount } = renderHook(() => usePolling(fetchFn, 1000, true));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns startPolling and stopPolling functions', () => {
    const fetchFn = vi.fn();
    const { result } = renderHook(() => usePolling(fetchFn, 1000, false));

    expect(result.current.startPolling).toBeInstanceOf(Function);
    expect(result.current.stopPolling).toBeInstanceOf(Function);
  });

  it('manually starts and stops polling', () => {
    const fetchFn = vi.fn();
    const { result } = renderHook(() => usePolling(fetchFn, 1000, false));

    // Initially disabled, shouldn't poll
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchFn).not.toHaveBeenCalled();

    // Manually start polling
    act(() => {
      result.current.startPolling();
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Manually stop polling
    act(() => {
      result.current.stopPolling();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('uses specified interval', () => {
    const fetchFn = vi.fn();
    renderHook(() => usePolling(fetchFn, 5000, true));

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(fetchFn).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('updates callback when fetchFn changes', () => {
    const fetchFn1 = vi.fn();
    const fetchFn2 = vi.fn();

    const { rerender } = renderHook(
      ({ fn }) => usePolling(fn, 1000, true),
      { initialProps: { fn: fetchFn1 } }
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchFn1).toHaveBeenCalledTimes(1);
    expect(fetchFn2).not.toHaveBeenCalled();

    rerender({ fn: fetchFn2 });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchFn1).toHaveBeenCalledTimes(1);
    expect(fetchFn2).toHaveBeenCalledTimes(1);
  });

  it('toggles polling when enabled changes', () => {
    const fetchFn = vi.fn();

    const { rerender } = renderHook(
      ({ enabled }) => usePolling(fetchFn, 1000, enabled),
      { initialProps: { enabled: true } }
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Disable polling
    rerender({ enabled: false });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Re-enable polling
    rerender({ enabled: true });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
