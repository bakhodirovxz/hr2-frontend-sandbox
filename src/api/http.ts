import type { AxiosRequestConfig } from 'axios'
import { apiClient } from './client'

/** Typed GET returning the response body. */
export async function apiGet<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.get<T>(url, { params, ...config })
  return data
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.post<T>(url, body, config)
  return data
}

export async function apiPatch<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.patch<T>(url, body, config)
  return data
}

export async function apiPut<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.put<T>(url, body, config)
  return data
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.delete<T>(url, config)
  return data
}
