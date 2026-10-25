/** The response surface consumed by the SDK, independent of DOM declarations. */
export interface FetchResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

/** The request fields sent by the SDK to a Fetch-compatible transport. */
export interface FetchRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Runtime-owned AbortSignal; its platform type need not depend on lib.dom. */
  signal?: any;
}

export type FetchLike = (input: string, init?: FetchRequestInit) => Promise<FetchResponse>;
