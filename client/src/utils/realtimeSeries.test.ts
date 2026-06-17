import assert from 'node:assert/strict'
import { appendRealtimePoint, secondsSince, parseElapsedSeconds, formatElapsed } from './realtimeSeries'

// Test: appendRealtimePoint with real elapsed seconds
const initial = appendRealtimePoint({
  points: [],
  elapsedSeconds: 0,
  value: 1200,
  maxPoints: 60,
})
assert.deepEqual(initial.points, [{ x: 0, y: 1200 }])

const updated = appendRealtimePoint({
  points: initial.points,
  elapsedSeconds: 6,
  value: 1438,
  maxPoints: 60,
})
assert.deepEqual(updated.points, [
  { x: 0, y: 1200 },
  { x: 6, y: 1438 },
])
assert.notEqual(updated.points, initial.points, 'should return a new array reference for Vue reactivity')

// Test: trimming to maxPoints
const many = Array.from({ length: 60 }, (_, i) => ({ x: i * 6, y: i * 10 }))
const trimmed = appendRealtimePoint({
  points: many,
  elapsedSeconds: 360,
  value: 999,
  maxPoints: 60,
})
assert.equal(trimmed.points.length, 60)
assert.equal(trimmed.points[0].x, 6) // first old point dropped
assert.equal(trimmed.points[59].x, 360) // newest point
assert.equal(trimmed.points[59].y, 999)

// Test: parseElapsedSeconds
assert.equal(parseElapsedSeconds('00:00'), 0)
assert.equal(parseElapsedSeconds('01:30'), 90)
assert.equal(parseElapsedSeconds('10:05'), 605)
assert.equal(parseElapsedSeconds('invalid'), 0)

// Test: formatElapsed
assert.equal(formatElapsed(0), '00:00')
assert.equal(formatElapsed(90), '01:30')
assert.equal(formatElapsed(605), '10:05')
assert.equal(formatElapsed(3661), '61:01')

// Test: secondsSince
assert.equal(secondsSince(new Date('2026-06-14T10:00:00Z').getTime(), new Date('2026-06-14T10:00:05Z').getTime()), 5)

console.log('realtime series tests passed')
