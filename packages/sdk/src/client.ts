import type { ApiResponse, PaginatedResponse } from '@veridion/shared';

export interface VeridionClientConfig {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
}

export class VeridionClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: VeridionClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {}),
      ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
    };
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString(), { headers: this.headers });
    return res.json() as Promise<ApiResponse<T>>;
  }

  async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json() as Promise<ApiResponse<T>>;
  }

  async put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json() as Promise<ApiResponse<T>>;
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    return res.json() as Promise<ApiResponse<T>>;
  }

  async getPaginated<T>(
    path: string,
    params?: Record<string, string>,
  ): Promise<ApiResponse<PaginatedResponse<T>>> {
    return this.get<PaginatedResponse<T>>(path, params);
  }
}
