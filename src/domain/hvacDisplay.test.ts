import { describe, expect, it } from 'vitest'
import {
  buildHvacCategoryTableNote,
  isHvacRowExcludedFromScenarioSum,
} from './hvacDisplay'
import type { GroupedBalanceRow, HvacAlternativeBalance } from './types'

const hvacApplied: HvacAlternativeBalance = {
  enabled: true,
  applied: true,
  mode: 'seasonalPeak',
  heatingCalculatedPowerKw: 36.82,
  coolingCalculatedPowerKw: 5.76,
  hvacContributionKw: 36.82,
  excludedCategoryId: 'cooling',
  excludedCalculatedPowerKw: 5.76,
}

const categoryRows: GroupedBalanceRow[] = [
  {
    id: 'heatPumps',
    label: 'Pompy ciepła',
    installedPowerKw: 36.82,
    calculatedPowerKw: 36.82,
    apparentPowerKva: 40,
  },
  {
    id: 'cooling',
    label: 'Klimatyzacja',
    installedPowerKw: 5.76,
    calculatedPowerKw: 5.76,
    apparentPowerKva: 6.4,
  },
]

describe('hvacDisplay', () => {
  it('marks cooling as excluded when heating is larger', () => {
    expect(isHvacRowExcludedFromScenarioSum(hvacApplied, 'cooling')).toBe(true)
    expect(isHvacRowExcludedFromScenarioSum(hvacApplied, 'heatPumps')).toBe(false)
  })

  it('builds note explaining table sum vs scenario power', () => {
    const note = buildHvacCategoryTableNote(hvacApplied, categoryRows, 64.28)

    expect(note).toContain('42.58')
    expect(note).toContain('64.28')
    expect(note).toContain('klimatyzacja')
    expect(note).toContain('5.76')
  })
})
