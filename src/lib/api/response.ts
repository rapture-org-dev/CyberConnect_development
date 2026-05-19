import { NextResponse } from 'next/server'

export function apiJson<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Internal server error'
}
