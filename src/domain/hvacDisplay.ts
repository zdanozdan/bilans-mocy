import type { GroupedBalanceRow, HvacAlternativeBalance } from './types'

export type HvacCategoryId = 'heatPumps' | 'cooling'

export const isHvacCategoryId = (id: string): id is HvacCategoryId =>
  id === 'heatPumps' || id === 'cooling'

export const getHvacExcludedCategoryLabel = (
  excludedCategoryId?: HvacCategoryId,
): 'ogrzewanie' | 'klimatyzacja' =>
  excludedCategoryId === 'heatPumps' ? 'ogrzewanie' : 'klimatyzacja'

export const isHvacRowExcludedFromScenarioSum = (
  hvac: HvacAlternativeBalance,
  categoryId: string,
): boolean =>
  hvac.applied &&
  hvac.mode === 'seasonalPeak' &&
  isHvacCategoryId(categoryId) &&
  hvac.excludedCategoryId === categoryId

export const getHvacPoblCellSuffix = (
  hvac: HvacAlternativeBalance,
  categoryId: string,
): string | null => {
  if (!hvac.applied || !isHvacCategoryId(categoryId)) {
    return null
  }

  if (hvac.mode === 'normalAverage') {
    return 'w bilansie: średnia HVAC (praca normalna)'
  }

  if (hvac.mode === 'normalDerated' && hvac.excludedCategoryId === categoryId) {
    return 'w bilansie: część mocy (praca normalna)'
  }

  if (isHvacRowExcludedFromScenarioSum(hvac, categoryId)) {
    return 'poza sumą scenariusza'
  }

  if (hvac.mode === 'seasonalPeak') {
    return 'wliczone do sumy scenariusza'
  }

  return null
}

export const sumGroupedTablePobl = (rows: GroupedBalanceRow[]): number =>
  rows.reduce((acc, row) => acc + row.calculatedPowerKw, 0)

/** Wyjaśnienie różnicy między sumą tabeli kategorii a mocą obliczeniową scenariusza. */
export const buildHvacCategoryTableNote = (
  hvac: HvacAlternativeBalance,
  categoryRows: GroupedBalanceRow[],
  scenarioCalculatedPowerKw: number,
): string | null => {
  if (!hvac.applied) {
    return null
  }

  const tableSumKw = sumGroupedTablePobl(categoryRows)

  if (hvac.mode === 'normalAverage') {
    return (
      `Suma Pobl w tabeli kategorii: ${tableSumKw.toFixed(2)} kW — moc obliczeniowa scenariusza: ${scenarioCalculatedPowerKw.toFixed(2)} kW. ` +
      `W „Pracy normalnej” do bilansu wliczono średnią z ogrzewania (${hvac.heatingCalculatedPowerKw.toFixed(2)} kW) i klimatyzacji (${hvac.coolingCalculatedPowerKw.toFixed(2)} kW) = ${(hvac.hvacContributionKw ?? 0).toFixed(2)} kW, ` +
      `a nie szczyt zimowy ani letni.`
    )
  }

  if (hvac.mode === 'normalDerated') {
    const label = getHvacExcludedCategoryLabel(hvac.excludedCategoryId)

    return (
      `Suma Pobl w tabeli kategorii: ${tableSumKw.toFixed(2)} kW — moc obliczeniowa scenariusza: ${scenarioCalculatedPowerKw.toFixed(2)} kW. ` +
      `W „Pracy normalnej” do bilansu wliczono ${(hvac.hvacContributionKw ?? 0).toFixed(2)} kW z kategorii ${label} (obniżony udział szczytu sezonowego), ` +
      `pominięto ${hvac.excludedCalculatedPowerKw.toFixed(2)} kW.`
    )
  }

  const excludedLabel = getHvacExcludedCategoryLabel(hvac.excludedCategoryId)

  return (
    `Suma Pobl w tabeli kategorii: ${tableSumKw.toFixed(2)} kW — to nie jest moc obliczeniowa scenariusza (${scenarioCalculatedPowerKw.toFixed(2)} kW). ` +
    `Ogrzewanie i klimatyzacja nie pracują jednocześnie na pełnej mocy: do bilansu wliczono większą wartość, ` +
    `pominięto ${excludedLabel} (−${hvac.excludedCalculatedPowerKw.toFixed(2)} kW).`
  )
}

export const buildHvacScenarioSummaryLine = (hvac: HvacAlternativeBalance): string | null => {
  if (!hvac.applied) {
    return null
  }

  if (hvac.mode === 'normalAverage') {
    return (
      `HVAC — praca normalna: średnia z ogrzewania (${hvac.heatingCalculatedPowerKw.toFixed(2)} kW) i klimatyzacji (${hvac.coolingCalculatedPowerKw.toFixed(2)} kW) = ${(hvac.hvacContributionKw ?? 0).toFixed(2)} kW w bilansie (nie szczyt zimowy).`
    )
  }

  if (hvac.mode === 'normalDerated') {
    const label = getHvacExcludedCategoryLabel(hvac.excludedCategoryId)

    return (
      `HVAC — praca normalna: w bilansie ${(hvac.hvacContributionKw ?? 0).toFixed(2)} kW z kategorii ${label} (obniżony udział szczytu sezonowego), pominięto ${hvac.excludedCalculatedPowerKw.toFixed(2)} kW pełnego szczytu.`
    )
  }

  const excludedLabel = getHvacExcludedCategoryLabel(hvac.excludedCategoryId)

  return (
    `HVAC — szczyt sezonowy: ogrzewanie ${hvac.heatingCalculatedPowerKw.toFixed(2)} kW, klimatyzacja ${hvac.coolingCalculatedPowerKw.toFixed(2)} kW — do sumy wliczono większą, pominięto ${excludedLabel} (${hvac.excludedCalculatedPowerKw.toFixed(2)} kW).`
  )
}
