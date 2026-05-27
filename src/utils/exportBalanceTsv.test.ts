import { describe, expect, it } from 'vitest'
import { calculateProjectBalance } from '../domain/calculations'
import { defaultDevices, defaultProject } from '../domain/defaults'
import { buildBalanceTsv } from './exportBalanceTsv'

describe('buildBalanceTsv', () => {
  it('uses tab separators and includes project and scenario sections', () => {
    const balance = calculateProjectBalance(defaultProject, defaultDevices)
    const tsv = buildBalanceTsv(balance)
    const lines = tsv.split('\n')

    expect(lines[0]).toContain('\t')
    expect(tsv).toContain('Bilans energii')
    expect(tsv).toContain('Scenariusz:')
    expect(tsv).toContain('Podział wg kategorii')
    expect(tsv).toContain('Aktywne odbiorniki')
    expect(tsv).toContain('Pinst [kW]')
  })
})
