export interface RealtimePoint {
  x: number // elapsed seconds
  y: number // value (online count or GMV)
}

export interface RealtimeSeriesInput {
  points: RealtimePoint[]
  elapsedSeconds: number
  value: number
  maxPoints?: number
}

/**
 * Append a new data point with real elapsed-time X coordinate.
 * X = actual seconds since simulation start, so Chart.js renders
 * the time axis natively instead of using abstract array indices.
 */
export function appendRealtimePoint(input: RealtimeSeriesInput) {
  const maxPoints = input.maxPoints ?? 60
  const points = [...input.points, { x: input.elapsedSeconds, y: input.value }].slice(-maxPoints)

  return { points }
}

export function secondsSince(startTimeMs: number, nowMs = Date.now()) {
  return Math.max(0, Math.floor((nowMs - startTimeMs) / 1000))
}

/**
 * Parse MM:SS label back to elapsed seconds (for snapshot restores).
 */
export function parseElapsedSeconds(label: string): number {
  const parts = label.split(':')
  const minutes = Number(parts[0]) || 0
  const seconds = Number(parts[1]) || 0
  return minutes * 60 + seconds
}

/**
 * Format elapsed seconds as MM:SS (for chart tick callback).
 */
export function formatElapsed(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60)
  const s = Math.floor(Math.max(0, seconds) % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
