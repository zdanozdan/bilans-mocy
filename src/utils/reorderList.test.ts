import { describe, expect, it } from 'vitest'
import { moveItemById, moveItemByOffset } from './reorderList'

describe('moveItemByOffset', () => {
  const items = ['a', 'b', 'c']

  it('moves item one position', () => {
    expect(moveItemByOffset(items, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveItemByOffset(items, 2, -1)).toEqual(['a', 'c', 'b'])
  })

  it('returns same list at boundaries', () => {
    expect(moveItemByOffset(items, 0, -1)).toBe(items)
    expect(moveItemByOffset(items, 2, 1)).toBe(items)
    expect(moveItemByOffset(items, -1, 1)).toBe(items)
  })
})

describe('moveItemById', () => {
  const items = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ]

  it('moves item up or down by one', () => {
    expect(moveItemById(items, 'b', 'up').map((item) => item.id)).toEqual(['b', 'a', 'c'])
    expect(moveItemById(items, 'b', 'down').map((item) => item.id)).toEqual(['a', 'c', 'b'])
  })

  it('returns same list for unknown id', () => {
    expect(moveItemById(items, 'missing', 'up')).toBe(items)
  })
})
