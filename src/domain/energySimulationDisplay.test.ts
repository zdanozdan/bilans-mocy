import { describe, expect, it } from 'vitest'
import { defaultDevices, defaultProject } from './defaults'
import {
  buildEnergySimulationLlmReviewBlock,
  buildLlmEnergySimulationReviewPoint,
} from './energySimulationDisplay'
import { buildLlmReviewPrompt } from './projectAssumptionsDisplay'

describe('energySimulationDisplay', () => {
  it('builds LLM block with scenario peaks when heat pumps exist', () => {
    const block = buildEnergySimulationLlmReviewBlock(defaultProject, defaultDevices)

    expect(block).toContain('SYMULACJA ZUŻYCIA ENERGII')
    expect(block).toContain('Zima')
    expect(block).toContain('kW')
  })

  it('returns null review point without HVAC devices', () => {
    const devices = defaultDevices.filter(
      (d) => d.categoryId !== 'heatPumps' && d.categoryId !== 'cooling',
    )

    expect(buildLlmEnergySimulationReviewPoint(defaultProject, devices)).toBeNull()
  })
})

describe('buildLlmReviewPrompt with simulation', () => {
  it('includes energy simulation verification section', () => {
    const prompt = buildLlmReviewPrompt(defaultProject, defaultDevices)

    expect(prompt).toContain('WERYFIKACJA SYMULACJI ZUŻYCIA ENERGII')
    expect(prompt).toContain('profil dobowy')
    expect(prompt).toContain('τ=')
  })
})
