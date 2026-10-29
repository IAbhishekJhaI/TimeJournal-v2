import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_TIMEOUT_MS, api, authHeaders, setTokenGetter } from "./api";

afterEach(() => {
  setTokenGetter(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("authHeaders", () => {
  it("is empty before Clerk installs a getter", async () => {
    expect(await authHeaders()).toEqual({});
  });

  it("sends the fresh token as a bearer header", async () => {
    setTokenGetter(async () => "tok_123");
    expect(await authHeaders()).toEqual({ authorization: "Bearer tok_123" });
  });

  it("falls back to the cookie when signed out or getToken throws", async () => {
    setTokenGetter(async () => null);
    expect(await authHeaders()).toEqual({});
    setTokenGetter(() => Promise.reject(new Error("clerk offline")));
    expect(await authHeaders()).toEqual({});
  });

  it("gives up on a hung getToken after the timeout", async () => {
    vi.useFakeTimers();
    setTokenGetter(() => new Promise<string>(() => {}));
    const headers = authHeaders();
    await vi.advanceTimersByTimeAsync(TOKEN_TIMEOUT_MS);
    expect(await headers).toEqual({});
  });
});

describe("putEntries", () => {
  it("attaches the bearer token to the PUT", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ conflicts: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setTokenGetter(async () => "tok_put");

    await api.putEntries([{ day: "2030-01-01", slot: 0, categoryId: null }]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/entries");
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer tok_put",
    });
  });
});
