import { deviceCategories } from '../domain/defaults'
import {
  buildHvacCategoryTableNote,
  buildHvacScenarioSummaryLine,
  getHvacPoblCellSuffix,
} from '../domain/hvacDisplay'
import { getZoneDisplayName } from '../domain/zones'
import type { GroupedBalanceRow, HvacAlternativeBalance, ProjectBalance } from '../domain/types'

const escapeTsvCell = (value: string | number): string => {
  const text = String(value)

  if (/[\t\n\r"]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

const tsvRow = (...cells: Array<string | number>) => cells.map(escapeTsvCell).join('\t')

const blankRow = () => ''

const appendGroupedTable = (
  lines: string[],
  title: string,
  rows: GroupedBalanceRow[],
  hvacAlternative?: HvacAlternativeBalance,
  scenarioCalculatedPowerKw?: number,
) => {
  lines.push(title)
  lines.push(tsvRow('Pozycja', 'Pinst [kW]', 'Pobl [kW]', 'S [kVA]'))

  for (const row of rows) {
    const suffix = hvacAlternative ? getHvacPoblCellSuffix(hvacAlternative, row.id) : null
    const label = suffix ? `${row.label} (${suffix})` : row.label

    lines.push(
      tsvRow(
        label,
        row.installedPowerKw.toFixed(2),
        row.calculatedPowerKw.toFixed(2),
        row.apparentPowerKva.toFixed(2),
      ),
    )
  }

  if (rows.length === 0) {
    lines.push(tsvRow('Brak danych', '', '', ''))
  }

  const hvacNote =
    hvacAlternative && scenarioCalculatedPowerKw != null
      ? buildHvacCategoryTableNote(hvacAlternative, rows, scenarioCalculatedPowerKw)
      : null

  if (hvacNote) {
    lines.push(tsvRow('Uwaga', hvacNote))
  }

  lines.push(blankRow())
}

export const buildBalanceTsv = (balance: ProjectBalance): string => {
  const { project, metrics } = balance
  const lines: string[] = []
  lines.push(tsvRow('Bilans energii', project.name))
  lines.push(tsvRow('Typ budynku', project.buildingType))
  lines.push(blankRow())

  lines.push('Parametry budynku')
  lines.push(tsvRow('Parametr', 'Wartość'))
  lines.push(tsvRow('Pow. magazynu [m2]', project.warehouseAreaM2.toFixed(0)))
  lines.push(tsvRow('Wysokość magazynu [m]', project.warehouseHeightM.toFixed(1)))
  lines.push(tsvRow('Pow. biura [m2]', project.officeAreaM2.toFixed(0)))
  lines.push(tsvRow('Powierzchnia łączna [m2]', metrics.totalAreaM2.toFixed(0)))
  lines.push(tsvRow('Kubatura magazynu [m3]', metrics.warehouseVolumeM3.toFixed(0)))
  lines.push(tsvRow('Liczba osób', metrics.peopleCount))
  lines.push(tsvRow('Liczba komputerów', metrics.computerCount))
  lines.push(tsvRow('Rezerwa projektowa [%]', project.reservePercent))
  lines.push(
    tsvRow(
      'Ogrzewanie / klimatyzacja alternatywnie',
      project.useAlternativeHeatingCooling !== false ? 'Tak' : 'Nie',
    ),
  )
  lines.push(blankRow())

  for (const scenarioBalance of balance.scenarios) {
    const { hvacAlternative } = scenarioBalance

    lines.push(`Scenariusz: ${scenarioBalance.scenario.name}`)
    lines.push(tsvRow('Parametr', 'Wartość'))
    lines.push(tsvRow('Moc zainstalowana [kW]', scenarioBalance.installedPowerKw.toFixed(2)))
    lines.push(tsvRow('Moc obliczeniowa [kW]', scenarioBalance.calculatedPowerKw.toFixed(2)))
    lines.push(tsvRow('Moc pozorna [kVA]', scenarioBalance.apparentPowerKva.toFixed(2)))
    lines.push(tsvRow('Rezerwa [kW]', scenarioBalance.reservePowerKw.toFixed(2)))
    lines.push(tsvRow('Suma z rezerwą [kW]', scenarioBalance.totalWithReserveKw.toFixed(2)))
    lines.push(tsvRow('Korekta magazynu energii [kW]', scenarioBalance.energyStorageAdjustmentKw.toFixed(2)))
    lines.push(tsvRow('Moc netto po magazynie [kW]', scenarioBalance.netPowerKw.toFixed(2)))
    const hvacSummary = buildHvacScenarioSummaryLine(hvacAlternative)
    lines.push(
      tsvRow(
        'HVAC alternatywnie',
        hvacSummary ??
          (hvacAlternative.enabled
            ? 'Włączone, bez jednoczesnego ogrzewania i klimatyzacji w tym scenariuszu'
            : 'Wyłączone'),
      ),
    )
    lines.push(tsvRow('Liczba aktywnych odbiorników', scenarioBalance.devices.length))
    lines.push(blankRow())

    appendGroupedTable(
      lines,
      'Podział wg kategorii',
      scenarioBalance.byCategory,
      hvacAlternative,
      scenarioBalance.calculatedPowerKw,
    )
    appendGroupedTable(lines, 'Podział wg stref', scenarioBalance.byZone)

    lines.push('Aktywne odbiorniki')
    lines.push(
      tsvRow(
        'Nazwa',
        'Kategoria',
        'Strefa',
        'Ilość',
        'Pinst [kW]',
        'Pobl [kW]',
        'Pciel inst [kW]',
        'Pciel obl [kW]',
        'S [kVA]',
      ),
    )

    for (const calculation of scenarioBalance.devices) {
      const device = calculation.device
      const category =
        deviceCategories.find((item) => item.id === device.categoryId)?.name ?? device.categoryId

      lines.push(
        tsvRow(
          device.name,
          category,
          getZoneDisplayName(project, device.zoneId),
          calculation.resolvedQuantity.toFixed(0),
          calculation.installedPowerKw.toFixed(2),
          calculation.calculatedPowerKw.toFixed(2),
          calculation.installedThermalPowerKw?.toFixed(2) ?? '',
          calculation.calculatedThermalPowerKw?.toFixed(2) ?? '',
          calculation.apparentPowerKva.toFixed(2),
        ),
      )
    }

    if (scenarioBalance.devices.length === 0) {
      lines.push(tsvRow('Brak aktywnych odbiorników', '', '', '', '', '', '', '', ''))
    }

    lines.push(blankRow())
  }

  return lines.join('\n').trimEnd()
}

export const copyTextToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}
