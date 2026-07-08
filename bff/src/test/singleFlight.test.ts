import { withSingleFlight } from '../utils/singleFlight';

describe('withSingleFlight', () => {
  it('coalesces concurrent calls with the same key into one fn() invocation', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      return `result-${calls}`;
    });

    const [a, b] = await Promise.all([
      withSingleFlight('k', fn),
      withSingleFlight('k', fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toBe('result-1');
    expect(b).toBe('result-1'); // same in-flight promise, same resolved value
  });

  it('does not coalesce calls with different keys', async () => {
    const fn = jest.fn(async () => 'value');

    await Promise.all([
      withSingleFlight('k1', fn),
      withSingleFlight('k2', fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('calls fn() again for a new call after the previous one settled (no permanent caching)', async () => {
    const fn = jest.fn(async () => 'value');

    await withSingleFlight('k', fn);
    await withSingleFlight('k', fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight entry even when fn() rejects, so the next call retries', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');

    await expect(withSingleFlight('k', fn)).rejects.toThrow('boom');
    const result = await withSingleFlight('k', fn);

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('a rejected in-flight call propagates the same rejection to all concurrent callers', async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error('boom'));

    const results = await Promise.allSettled([
      withSingleFlight('k', fn),
      withSingleFlight('k', fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });
});
