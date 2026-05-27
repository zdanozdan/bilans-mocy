import { describe, expect, it } from 'vitest'
import {
  calculatePowerFactorSummary,
  calculateReactivePowerFromActivePower,
  ENEA_INDUCTIVE_TAN_PHI_LIMIT,
  getDefaultReactivePowerKind,
  meetsEneaInductiveTanPhiLimit,
} from './reactivePower'

describe('reactivePower', () => {
  it('assigns capacitive default to LED lighting and sockets', () => {
    expect(getDefaultReactivePowerKind('lighting')).toBe('capacitive')
    expect(getDefaultReactivePowerKind('sockets')).toBe('capacitive')
    expect(getDefaultReactivePowerKind('heatPumps')).toBe('inductive')
  })

  it('calculates Q from P and cosφ separately for inductive and capacitive', () => {
    const inductive = calculateReactivePowerFromActivePower(64.28, 0.91, 'inductive')
    const capacitive = calculateReactivePowerFromActivePower(10, 0.95, 'capacitive')

    expect(inductive.inductiveKvar).toBeGreaterThan(25)
    expect(inductive.capacitiveKvar).toBe(0)
    expect(capacitive.capacitiveKvar).toBeGreaterThan(2)
    expect(capacitive.inductiveKvar).toBe(0)
  })

  it('derives S and tanφ from P and net reactive power', () => {
    const inductive = calculateReactivePowerFromActivePower(64.28, 0.91, 'inductive')
    const summary = calculatePowerFactorSummary(64.28, inductive)

    expect(summary.apparentPowerKva).toBeCloseTo(64.28 / 0.91, 1)
    expect(summary.inductiveTanPhi).toBeGreaterThan(ENEA_INDUCTIVE_TAN_PHI_LIMIT)
    expect(meetsEneaInductiveTanPhiLimit(summary.inductiveTanPhi)).toBe(false)
    expect(meetsEneaInductiveTanPhiLimit(ENEA_INDUCTIVE_TAN_PHI_LIMIT)).toBe(true)
  })
})
