export const moveItemByOffset = <T>(items: T[], index: number, offset: -1 | 1): T[] => {
  const targetIndex = index + offset

  if (index < 0 || index >= items.length || targetIndex < 0 || targetIndex >= items.length) {
    return items
  }

  const next = [...items]
  const [moved] = next.splice(index, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

export const moveItemById = <T extends { id: string }>(
  items: T[],
  id: string,
  direction: 'up' | 'down',
): T[] => {
  const index = items.findIndex((item) => item.id === id)

  if (index < 0) {
    return items
  }

  return moveItemByOffset(items, index, direction === 'up' ? -1 : 1)
}
