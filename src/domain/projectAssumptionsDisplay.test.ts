import { describe, expect, it } from 'vitest'
import { defaultProject } from './defaults'
import { buildLlmReviewPrompt } from './projectAssumptionsDisplay'

describe('buildLlmReviewPrompt', () => {
  it('asks about BESS sense when storage is disabled', () => {
    const prompt = buildLlmReviewPrompt({
      ...defaultProject,
      energyStorage: { ...defaultProject.energyStorage, enabled: false },
    })

    expect(prompt).toContain('CZY MAGAZYN ENERGII MA SENS')
    expect(prompt).not.toContain('ANALIZA SKONFIGUROWANEGO MAGAZYNU')
    expect(prompt).not.toContain('PEAK SHAVING')
  })

  it('includes peak shaving analysis when storage is enabled', () => {
    const prompt = buildLlmReviewPrompt(defaultProject)

    expect(prompt).toContain('ANALIZA SKONFIGUROWANEGO MAGAZYNU')
    expect(prompt).toContain('CZY MAGAZYN ENERGII MA SENS')
  })
})
