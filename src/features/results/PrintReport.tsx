import { deviceCategories } from '../../domain/defaults'
import type { GroupedBalanceRow, ProjectBalance, ScenarioBalance } from '../../domain/types'

const formatPower = (value: number) => `${value.toFixed(2)} kW`
const formatKva = (value: number) => `${value.toFixed(2)} kVA`

function PrintTable({
  className = '',
  headers,
  rows,
  compact = false,
}: {
  className?: string
  headers: string[]
  rows: Array<Array<string | number>>
  compact?: boolean
}) {
  return (
    <table className={`print-table ${compact ? 'print-table-compact' : ''} ${className}`.trim()}>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => {
              const isNumeric = cellIndex > 0 && (headers.length <= 4 || cellIndex >= 3)

              return (
                <td className={isNumeric ? 'numeric' : undefined} key={cellIndex}>
                  {cell}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PrintGroupTable({ title, rows }: { title: string; rows: GroupedBalanceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="print-block">
        <h4>{title}</h4>
        <p className="print-muted">Brak danych.</p>
      </div>
    )
  }

  return (
    <div className="print-block">
      <h4>{title}</h4>
      <PrintTable
        compact
        headers={['Pozycja', 'Pinst', 'Pobl', 'S']}
        rows={rows.map((row) => [
          row.label,
          row.installedPowerKw.toFixed(2),
          row.calculatedPowerKw.toFixed(2),
          row.apparentPowerKva.toFixed(2),
        ])}
      />
    </div>
  )
}

function PrintScenarioSection({
  scenarioBalance,
  zoneNameById,
  isFirst,
}: {
  scenarioBalance: ScenarioBalance
  zoneNameById: Map<string, string>
  isFirst: boolean
}) {
  const { scenario, hvacAlternative } = scenarioBalance

  const excludedLabel =
    hvacAlternative.excludedCategoryId === 'heatPumps' ? 'ogrzewanie' : 'klimatyzacja'

  const deviceRows = scenarioBalance.devices.map((calculation) => {
    const device = calculation.device
    const category =
      deviceCategories.find((item) => item.id === device.categoryId)?.name ?? device.categoryId

    return [
      device.name,
      category,
      zoneNameById.get(device.zoneId) ?? device.zoneId,
      calculation.resolvedQuantity.toFixed(0),
      calculation.installedPowerKw.toFixed(2),
      calculation.calculatedPowerKw.toFixed(2),
      calculation.installedThermalPowerKw?.toFixed(2) ?? '—',
      calculation.calculatedThermalPowerKw?.toFixed(2) ?? '—',
      calculation.apparentPowerKva.toFixed(2),
    ]
  })

  return (
    <section className={`print-scenario ${isFirst ? 'print-scenario-first' : ''}`}>
      <header className="print-scenario-head">
        <h3>{scenario.name}</h3>
        <p className="print-scenario-meta">
          Pinst {formatPower(scenarioBalance.installedPowerKw)} · Pobl{' '}
          {formatPower(scenarioBalance.calculatedPowerKw)} · Rezerwa{' '}
          {formatPower(scenarioBalance.reservePowerKw)} · Netto bez magazynu{' '}
          {formatPower(scenarioBalance.totalWithReserveKw)} ·{' '}
          <strong>Netto po magazynie {formatPower(scenarioBalance.netPowerKw)}</strong>
          {' · '}
          Różnica{' '}
          {formatPower(scenarioBalance.netPowerKw - scenarioBalance.totalWithReserveKw)}
          {' · '}
          S {formatKva(scenarioBalance.apparentPowerKva)}
          {hvacAlternative.applied
            ? ` · HVAC: pominięto ${excludedLabel} ${formatPower(hvacAlternative.excludedCalculatedPowerKw)}`
            : ''}
        </p>
      </header>

      <div className="print-split">
        <PrintGroupTable rows={scenarioBalance.byCategory} title="Kategorie" />
        <PrintGroupTable rows={scenarioBalance.byZone} title="Strefy" />
      </div>

      {deviceRows.length > 0 ? (
        <div className="print-block print-devices-block">
          <h4>Odbiorniki ({deviceRows.length})</h4>
          <PrintTable
            className="print-table-devices"
            compact
            headers={[
              'Nazwa',
              'Kategoria',
              'Strefa',
              'Ilość',
              'Pinst',
              'Pobl',
              'Pciel i',
              'Pciel o',
              'S',
            ]}
            rows={deviceRows}
          />
        </div>
      ) : (
        <p className="print-muted">Brak aktywnych odbiorników.</p>
      )}
    </section>
  )
}

export function PrintReport({ balance }: { balance: ProjectBalance }) {
  const { project, metrics } = balance
  const printedAt = new Date().toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const maxNetPower = Math.max(...balance.scenarios.map((item) => item.netPowerKw))
  const zoneNameById = new Map(project.zones.map((zone) => [zone.id, zone.name]))

  const buildingRows = [
    ['Pow. magazynu', `${project.warehouseAreaM2.toFixed(0)} m²`],
    ['Wys. magazynu', `${project.warehouseHeightM.toFixed(1)} m`],
    ['Pow. biura', `${project.officeAreaM2.toFixed(0)} m²`],
    ['Pow. łączna', `${metrics.totalAreaM2.toFixed(0)} m²`],
    ['Kubatura mag.', `${metrics.warehouseVolumeM3.toFixed(0)} m³`],
    ['Osoby / komp.', `${metrics.peopleCount} / ${metrics.computerCount}`],
    ['Rezerwa', `${project.reservePercent}%`],
    ['HVAC alt.', project.useAlternativeHeatingCooling !== false ? 'Tak' : 'Nie'],
    ['Moc netto max.', formatPower(maxNetPower)],
  ]

  const zoneRows = project.zones.map((zone) => [
    zone.name,
    zone.type,
    zone.areaM2.toFixed(0),
    (zone.heightM ?? 0).toFixed(1),
    zone.minTempC != null && zone.maxTempC != null
      ? `${zone.minTempC}/${zone.maxTempC}`
      : '—',
  ])

  const storageRows = project.energyStorage.enabled
    ? [
        ['Tryb', project.energyStorage.mode],
        ['Pojemność', `${project.energyStorage.capacityKwh} kWh`],
        ['Ładowanie', `${project.energyStorage.chargePowerKw} kW`],
        ['Rozładowanie', `${project.energyStorage.dischargePowerKw} kW`],
        ['Sprawność', `${project.energyStorage.roundTripEfficiencyPercent}%`],
      ]
    : []

  return (
    <div className="print-report print-only">
      <header className="print-report-header">
        <div>
          <p className="print-eyebrow">Bilans energii</p>
          <h1>{project.name}</h1>
          <p className="print-header-sub">
            {project.buildingType}
            {project.exportFileName ? ` · ${project.exportFileName}` : ''} · {printedAt}
          </p>
        </div>
      </header>

      <section className="print-intro">
        <div className="print-split">
          <div className="print-block">
            <h2>Parametry budynku</h2>
            <PrintTable compact headers={['Parametr', 'Wartość']} rows={buildingRows} />
          </div>
          <div className="print-block">
            <h2>Strefy</h2>
            {zoneRows.length > 0 ? (
              <PrintTable
                compact
                headers={['Nazwa', 'Typ', 'm²', 'h', '°C']}
                rows={zoneRows}
              />
            ) : (
              <p className="print-muted">Brak stref.</p>
            )}
            {storageRows.length > 0 ? (
              <>
                <h2 className="print-subheading">Magazyn energii</h2>
                <PrintTable compact headers={['Parametr', 'Wartość']} rows={storageRows} />
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className="print-scenarios-wrap">
        <h2 className="print-scenarios-title">Scenariusze</h2>
        {balance.scenarios.map((scenarioBalance, index) => (
          <PrintScenarioSection
            isFirst={index === 0}
            key={scenarioBalance.scenario.id}
            scenarioBalance={scenarioBalance}
            zoneNameById={zoneNameById}
          />
        ))}
      </section>
    </div>
  )
}
