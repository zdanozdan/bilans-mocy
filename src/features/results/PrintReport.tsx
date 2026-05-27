import { usesCopThermalConversion } from '../../domain/calculations'
import {
  defaultHeatPumpCopMinus20C,
  defaultHeatPumpCopNormal,
  deviceCategories,
} from '../../domain/defaults'
import type {
  Device,
  GroupedBalanceRow,
  HvacAlternativeBalance,
  ProjectBalance,
  ProjectConfig,
  ScenarioBalance,
} from '../../domain/types'
import {
  buildHvacCategoryTableNote,
  buildHvacScenarioSummaryLine,
  getHvacPoblCellSuffix,
  isHvacRowExcludedFromScenarioSum,
} from '../../domain/hvacDisplay'
import { buildHeatDemandRows } from '../../domain/heatDemandDisplay'
import {
  buildCoolingDemandRows,
  buildDeviceNotesRows,
  buildDeviceScenarioMatrix,
  buildLlmReviewPrompt,
  buildProjectAssumptionRows,
  buildScenarioDescriptionRows,
} from '../../domain/projectAssumptionsDisplay'
import { scenarios as defaultScenarios } from '../../domain/defaults'
import { getZoneDisplayName } from '../../domain/zones'

/** Stały opis celu raportu (przyłącze Enea, Mikran Wysogotowo). */
const REPORT_PURPOSE = `Niniejszy bilans mocy został sporządzony w celu ustalenia wymaganej mocy przyłącza energetycznego do obiektu handlowego firmy Mikran, ul. Zbożowa, Wysogotowo (godziny pracy obiektu: 8:00–16:00), na potrzeby postępowania w sprawie przyłączenia do sieci dystrybucyjnej Enea (operator sieci dystrybucyjnej).

Dokument zestawia szacunkowe moce zainstalowane (Pinst) i obliczeniowe (Pobl) odbiorników według stref i kategorii, w wariantach scenariuszowych (praca normalna, zima, lato, tryb rezerwowy), z uwzględnieniem rezerwy mocy oraz — jeśli skonfigurowano — wpływu magazynu energii. Na tej podstawie wyznaczana jest szacunkowa moc netto potrzebna do doboru mocy umownej przyłącza.

Wyniki mają charakter szacunkowy i opierają się na założeniach wskazanych w tabelach poniżej; ostateczną moc przyłącza określa operator sieci po weryfikacji dokumentacji i warunków przyłączenia.`

const GLOSSARY_ITEMS: Array<{ term: string; description: string }> = [
  {
    term: 'Pinst — moc zainstalowana [kW]',
    description:
      'Suma mocy elektrycznych urządzeń „na papierze”, jakby wszystkie pracowały jednocześnie na pełnej mocy znamionowej. Przy zwykłych odbiornikach: ilość × moc jednostkowa [kW] albo powierzchnia × gęstość mocy [W/m²]. Przy pompach ciepła, klimatyzacji i CWU: moc termiczna ÷ COP(-20°C) — stąd kolumny Pciel/Pchł/PcWU.',
  },
  {
    term: 'Pobl — moc obliczeniowa [kW]',
    description:
      'Moc faktycznie brana do bilansu przyłącza — mniejsza niż Pinst, bo nie wszystkie urządzenia pracują naraz i rzadko na 100% mocy. Wzór dla każdego odbiornika: Pobl = Pinst × współczynnik jednoczesności × współczynnik wykorzystania. Sumy w scenariuszach to zsumowane Pobl aktywnych urządzeń w danym wariancie (zima, lato itd.).',
  },
  {
    term: 'Współczynnik jednoczesności (kd)',
    description:
      'Określa, jaka część zainstalowanych urządzeń może pracować w tym samym momencie w szczycie. Np. 0,50 oznacza, że statystycznie połowa mocy może być włączona naraz (wiele stanowisk, ale nie wszystkie jednocześnie). Wartość zawsze między 0 a 1.',
  },
  {
    term: 'Współczynnik wykorzystania (kw)',
    description:
      'Określa, jak intensywnie urządzenie pracuje w czasie, gdy jest włączone — czy cały czas na pełnej mocy, czy częściowo (obciążenie 70%, przerwy, praca sezonowa). Także między 0 a 1. Razem z kd obniża Pinst do realistycznej Pobl.',
  },
  {
    term: 'Pciel / Pchł / PcWU — moc termiczna [kW]',
    description:
      'Dla ogrzewania (Pciel), chłodzenia (Pchł) i ciepłej wody użytkowej (PcWU): moc cieplna lub chłodnicza przed przeliczeniem na prąd. Kolumny „Pciel i” / „Pciel o” to odpowiednio moc termiczna zainstalowana i obliczeniowa (po kd i kw). Przy braku COP (zwykły odbiornik) kolumny termiczne mają „—”.',
  },
  {
    term: 'COP (-20°C)',
    description:
      'Współczynnik wydajności przy ok. -20°C — do bilansu przyłącza. Im niższy COP (mróz), tym wyższa moc elektryczna przy tej samej mocy termicznej. Przykład: 40 kW ciepła ÷ COP 1,75 ≈ 22,9 kW el. w Pinst.',
  },
  {
    term: 'COP (normalny)',
    description:
      'COP w warunkach katalogowych (np. +7°C) — informacyjnie, nie zmienia sum Pinst/Pobl w tym raporcie. Służy do porównania z kartą katalogową producenta.',
  },
  {
    term: 'S — moc pozorna [kVA]',
    description:
      'Moc widziana przez sieć przy danym cos φ (współczynnik mocy): S = P / cos φ. Operator przyłącza interesuje też obciążenie transformatora i przewodów w kVA, nie tylko moc czynna w kW.',
  },
  {
    term: 'Rezerwa [%]',
    description:
      'Dodatkowy zapas projektowy liczony od sumy Pobl w scenariuszu (np. 15%): uwzględnia niepewność danych, przyszłą rozbudowę i margines bezpieczeństwa. „Netto bez magazynu” = Pobl + rezerwa.',
  },
  {
    term: 'Netto po magazynie / różnica',
    description:
      'Jeśli skonfigurowano magazyn energii, końcowa moc netto jest skorygowana o ładowanie, rozładowanie lub redukcję szczytu (zależnie od trybu). Różnica między „po magazynie” a „bez magazynu” pokazuje, o ile magazyn zmienia wymaganą moc przyłącza w danym scenariuszu.',
  },
  {
    term: 'HVAC alternatywnie (ogrzewanie / klimatyzacja)',
    description:
      'Zima/Lato: do sumy wliczany jest większy szczyt sezonowy (mniejsza kategoria „poza sumą”). Praca normalna: średnia z ogrzewania i klimatyzacji gdy obie aktywne, albo obniżony udział szczytu gdy aktywna jest tylko jedna — aby nie utożsamiać pracy typowej ze skrajnym mrozem. Suma wierszy tabeli kategorii nie musi równać się mocy obliczeniowej scenariusza.',
  },
]

const formatPower = (value: number) => `${value.toFixed(2)} kW`
const formatKva = (value: number) => `${value.toFixed(2)} kVA`
const formatPowerDelta = (deltaKw: number) => {
  if (Math.abs(deltaKw) < 0.005) {
    return '0,00 kW'
  }

  return `${deltaKw > 0 ? '+' : ''}${deltaKw.toFixed(2)} kW`
}

const buildScenarioSummaryRows = (
  scenarioBalance: ScenarioBalance,
  project: ProjectConfig,
): Array<[string, string]> => {
  const { hvacAlternative, energyStorageAdjustmentKw } = scenarioBalance
  const storageDeltaKw = scenarioBalance.netPowerKw - scenarioBalance.totalWithReserveKw

  const rows: Array<[string, string]> = [
    ['Pinst — moc zainstalowana', formatPower(scenarioBalance.installedPowerKw)],
    ['Pobl — moc obliczeniowa (do bilansu)', formatPower(scenarioBalance.calculatedPowerKw)],
    ['S — moc pozorna', formatKva(scenarioBalance.apparentPowerKva)],
    [
      `Rezerwa projektowa (${project.reservePercent}%)`,
      formatPower(scenarioBalance.reservePowerKw),
    ],
    ['Netto bez magazynu (Pobl + rezerwa)', formatPower(scenarioBalance.totalWithReserveKw)],
  ]

  if (project.energyStorage.enabled) {
    rows.push(['Korekta magazynu energii', formatPower(energyStorageAdjustmentKw)])
    rows.push(['Netto po magazynie', formatPower(scenarioBalance.netPowerKw)])
    rows.push(['Różnica magazynu (po − bez)', formatPowerDelta(storageDeltaKw)])
  } else {
    rows.push(['Moc netto (bez magazynu w projekcie)', formatPower(scenarioBalance.netPowerKw)])
  }

  if (hvacAlternative.applied) {
    rows.push(
      ['HVAC — ogrzewanie (Pobl w tabeli kategorii)', formatPower(hvacAlternative.heatingCalculatedPowerKw)],
      ['HVAC — klimatyzacja (Pobl w tabeli kategorii)', formatPower(hvacAlternative.coolingCalculatedPowerKw)],
      [
        'HVAC — nie wliczono do sumy Pobl',
        `${hvacAlternative.excludedCategoryId === 'cooling' ? 'klimatyzacja' : 'ogrzewanie'} (${formatPower(hvacAlternative.excludedCalculatedPowerKw)})`,
      ],
    )
  }

  rows.push(['Liczba aktywnych odbiorników', String(scenarioBalance.devices.length)])

  return rows
}

const buildScenarioSummaryText = (scenarioBalance: ScenarioBalance): string | null => {
  const parts: string[] = []
  const hvacLine = buildHvacScenarioSummaryLine(scenarioBalance.hvacAlternative)

  if (hvacLine) {
    parts.push(hvacLine)
  }

  const storageDeltaKw = scenarioBalance.netPowerKw - scenarioBalance.totalWithReserveKw

  if (Math.abs(storageDeltaKw) > 0.005) {
    parts.push(
      `Magazyn energii: moc netto ${formatPower(scenarioBalance.netPowerKw)} (korekta ${formatPowerDelta(storageDeltaKw)} względem sumy z rezerwą ${formatPower(scenarioBalance.totalWithReserveKw)}).`,
    )
  }

  if (parts.length === 0) {
    return `Scenariusz „${scenarioBalance.scenario.name}”: moc obliczeniowa ${formatPower(scenarioBalance.calculatedPowerKw)} + rezerwa → netto ${formatPower(scenarioBalance.netPowerKw)}.`
  }

  return parts.join(' ')
}

function PrintScenarioPowerSummary({
  scenarioBalance,
  project,
}: {
  scenarioBalance: ScenarioBalance
  project: ProjectConfig
}) {
  return (
    <div className="print-block print-scenario-summary">
      <h4>Podsumowanie mocy</h4>
      <PrintTable
        compact
        headers={['Parametr', 'Wartość']}
        rows={buildScenarioSummaryRows(scenarioBalance, project)}
      />
    </div>
  )
}

function PrintProjectAssumptionsSection({
  balance,
  devices,
  project,
}: {
  balance: ProjectBalance
  devices: Device[]
  project: ProjectConfig
}) {
  const assumptionRows = buildProjectAssumptionRows(project, balance)
  const scenarioRows = buildScenarioDescriptionRows(defaultScenarios)
  const coolingRows = buildCoolingDemandRows(project, devices)
  const deviceMatrix = buildDeviceScenarioMatrix(devices, defaultScenarios)
  const noteRows = buildDeviceNotesRows(devices)

  return (
    <section className="print-project-assumptions">
      <h2>Założenia projektowe</h2>
      <p className="print-assumptions-lead">
        Metodologia i dane wejściowe bilansu — uzupełnienie tabel wynikowych scenariuszy.
      </p>

      <div className="print-block">
        <h3 className="print-assumptions-h3">Ogólne</h3>
        <PrintTable compact headers={['Założenie', 'Wartość']} rows={assumptionRows} />
      </div>

      <div className="print-block">
        <h3 className="print-assumptions-h3">Znaczenie scenariuszy</h3>
        <PrintTable compact headers={['Scenariusz', 'Opis']} rows={scenarioRows} />
      </div>

      {coolingRows.length > 0 ? (
        <div className="print-block">
          <h3 className="print-assumptions-h3">Zapotrzebowanie na chłód (przyjęte)</h3>
          <PrintTable
            compact
            headers={['Odbiornik', 'Gęstość / strefa']}
            rows={coolingRows}
          />
        </div>
      ) : null}

      <div className="print-block">
        <h3 className="print-assumptions-h3">
          Które odbiorniki wliczamy do bilansu w danym scenariuszu
        </h3>
        <PrintDeviceScenarioMatrixTable
          headers={deviceMatrix.headers}
          rows={deviceMatrix.rows}
        />
        <p className="print-scenario-matrix-legend">
          <PrintScenarioInclusionMark active />
          {' '}
          — odbiornik wliczony: jego Pinst i Pobl wchodzą do sum w tabelach tego scenariusza.{' '}
          <PrintScenarioInclusionMark active={false} />
          {' '}
          — pominięty w tym wariancie (nie liczy się do mocy). Przypisanie ustawiasz w tabeli
          urządzeń projektu (checkboxy przy scenariuszach).
        </p>
      </div>

      {noteRows.length > 0 ? (
        <div className="print-block">
          <h3 className="print-assumptions-h3">Uwagi do odbiorników</h3>
          <PrintTable compact headers={['Odbiornik', 'Uwaga']} rows={noteRows} />
        </div>
      ) : null}
    </section>
  )
}

function PrintCopAssumptionsSection({
  devices,
  project,
}: {
  devices: Device[]
  project: ProjectConfig
}) {
  const copDevices = devices.filter((device) => usesCopThermalConversion(device.categoryId))

  const copRows = copDevices.map((device) => {
    const category =
      deviceCategories.find((item) => item.id === device.categoryId)?.name ?? device.categoryId
    const copMinus20C = device.copMinus20C ?? device.cop ?? defaultHeatPumpCopMinus20C
    const copNormal = device.copNormal ?? defaultHeatPumpCopNormal

    return [
      device.name,
      category,
      getZoneDisplayName(project, device.zoneId),
      copMinus20C.toFixed(2),
      copNormal.toFixed(2),
    ]
  })

  return (
    <section className="print-cop-assumptions">
      <h2>Przyjęte współczynniki COP</h2>
      <p className="print-cop-lead">
        Dla pomp ciepła, klimatyzacji i CWU (liczone z mocy termicznej). Do bilansu mocy
        przyłącza stosowany jest <strong>COP (-20°C)</strong>; COP (normalny) podany
        informacyjnie (np. katalog producenta przy +7°C).
      </p>
      {copRows.length > 0 ? (
        <PrintTable
          className="print-table-cop"
          compact
          headers={['Odbiornik', 'Kategoria', 'Strefa', 'COP (-20°C)', 'COP (normalny)']}
          rows={copRows}
        />
      ) : (
        <p className="print-muted">Brak urządzeń z przeliczeniem termicznym / COP w projekcie.</p>
      )}
      <p className="print-muted print-cop-defaults">
        Domyślne wartości przy nowym urządzeniu: COP (-20°C) ={' '}
        {defaultHeatPumpCopMinus20C.toFixed(2)}, COP (normalny) ={' '}
        {defaultHeatPumpCopNormal.toFixed(2)}.
      </p>
    </section>
  )
}

function PrintScenariosOverviewTable({ scenarios }: { scenarios: ScenarioBalance[] }) {
  if (scenarios.length === 0) {
    return null
  }

  return (
    <div className="print-block print-scenarios-overview">
      <h3>Porównanie scenariuszy — podsumowanie mocy</h3>
      <PrintTable
        className="print-table-scenarios-overview"
        compact
        headers={[
          'Scenariusz',
          'Pinst',
          'Pobl',
          'Rezerwa',
          'Netto bez mag.',
          'Netto po mag.',
          'S',
        ]}
        rows={scenarios.map((item) => [
          item.scenario.name,
          item.installedPowerKw.toFixed(2),
          item.calculatedPowerKw.toFixed(2),
          item.reservePowerKw.toFixed(2),
          item.totalWithReserveKw.toFixed(2),
          item.netPowerKw.toFixed(2),
          item.apparentPowerKva.toFixed(2),
        ])}
      />
      <p className="print-muted print-overview-hint">
        Wartości w kW (S w kVA). „Netto po mag.” uwzględnia korektę magazynu energii w danym
        scenariuszu. Szczegóły HVAC i podziały — w sekcjach poniżej.
      </p>
    </div>
  )
}

function PrintScenarioInclusionMark({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="print-scenario-mark print-scenario-yes" title="Wliczony do bilansu">
        ✓
      </span>
    )
  }

  return (
    <span className="print-scenario-mark print-scenario-no" title="Pominięty w tym scenariuszu">
      ✗
    </span>
  )
}

function PrintDeviceScenarioMatrixTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: Array<{ name: string; activeInScenarios: boolean[] }>
}) {
  const scenarioHeaderCount = Math.max(0, headers.length - 1)

  return (
    <table className="print-table print-table-compact print-table-scenario-matrix">
      <colgroup>
        <col className="print-scenario-matrix-col-name" />
        {Array.from({ length: scenarioHeaderCount }, (_, index) => (
          <col className="print-scenario-matrix-col-scenario" key={index} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {headers.map((header, index) => (
            <th
              className={index > 0 ? 'print-scenario-matrix-col-header' : undefined}
              key={header}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>{row.name}</td>
            {row.activeInScenarios.map((active, index) => (
              <td className="print-scenario-matrix-cell" key={`${row.name}-${index}`}>
                <PrintScenarioInclusionMark active={active} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

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

function PrintGroupTable({
  title,
  rows,
  hvacAlternative,
  scenarioCalculatedPowerKw,
}: {
  title: string
  rows: GroupedBalanceRow[]
  hvacAlternative?: HvacAlternativeBalance
  scenarioCalculatedPowerKw?: number
}) {
  if (rows.length === 0) {
    return (
      <div className="print-block">
        <h4>{title}</h4>
        <p className="print-muted">Brak danych.</p>
      </div>
    )
  }

  const hvacNote =
    hvacAlternative && scenarioCalculatedPowerKw != null
      ? buildHvacCategoryTableNote(hvacAlternative, rows, scenarioCalculatedPowerKw)
      : null

  return (
    <div className="print-block">
      <h4>{title}</h4>
      <PrintTable
        compact
        headers={['Pozycja', 'Pinst', 'Pobl', 'S']}
        rows={rows.map((row) => {
          const suffix =
            hvacAlternative != null ? getHvacPoblCellSuffix(hvacAlternative, row.id) : null
          const excluded =
            hvacAlternative != null &&
            isHvacRowExcludedFromScenarioSum(hvacAlternative, row.id)
          const label = suffix ? `${row.label} (${suffix})` : row.label
          const poblDisplay = excluded
            ? `${row.calculatedPowerKw.toFixed(2)}*`
            : row.calculatedPowerKw.toFixed(2)

          return [label, row.installedPowerKw.toFixed(2), poblDisplay, row.apparentPowerKva.toFixed(2)]
        })}
      />
      {hvacNote ? <p className="print-hvac-note">{hvacNote}</p> : null}
      {hvacNote ? (
        <p className="print-muted print-hvac-legend">* Pobl poza sumą scenariusza (HVAC alternatywnie)</p>
      ) : null}
    </div>
  )
}

function PrintScenarioSection({
  scenarioBalance,
  project,
  isFirst,
}: {
  scenarioBalance: ScenarioBalance
  project: ProjectConfig
  isFirst: boolean
}) {
  const { scenario, hvacAlternative } = scenarioBalance

  const summaryText = buildScenarioSummaryText(scenarioBalance)

  const deviceRows = scenarioBalance.devices.map((calculation) => {
    const device = calculation.device
    const category =
      deviceCategories.find((item) => item.id === device.categoryId)?.name ?? device.categoryId

    return [
      device.name,
      category,
      getZoneDisplayName(project, device.zoneId),
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
      </header>

      <PrintScenarioPowerSummary project={project} scenarioBalance={scenarioBalance} />

      {summaryText ? <p className="print-scenario-meta">{summaryText}</p> : null}

      <div className="print-split">
        <PrintGroupTable
          hvacAlternative={hvacAlternative}
          rows={scenarioBalance.byCategory}
          scenarioCalculatedPowerKw={scenarioBalance.calculatedPowerKw}
          title="Kategorie"
        />
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

export function PrintReport({
  balance,
  devices,
}: {
  balance: ProjectBalance
  devices: Device[]
}) {
  const { project, metrics } = balance
  const printedAt = new Date().toLocaleString('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const maxNetPower = Math.max(...balance.scenarios.map((item) => item.netPowerKw))
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

  const heatDemandRows = buildHeatDemandRows(project, devices)

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
          <p className="print-eyebrow">Bilans mocy — przyłącze do sieci</p>
          <h1>{project.name}</h1>
          <p className="print-header-sub">
            Mikran · ul. Zbożowa, Wysogotowo · {project.buildingType}
            {project.exportFileName ? ` · ${project.exportFileName}` : ''} · {printedAt}
          </p>
        </div>
      </header>

      <section className="print-purpose">
        <h2>Cel dokumentu</h2>
        {REPORT_PURPOSE.split('\n\n').map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}
      </section>

      <section className="print-glossary">
        <h2>Skróty i współczynniki — jak czytać tabele</h2>
        <p className="print-glossary-lead">
          Poniższe pojęcia powtarzają się w nagłówkach kolumn i podsumowaniach scenariuszy. Dla
          każdego odbiornika najpierw liczona jest moc zainstalowana (Pinst), potem — po uwzględnieniu
          współczynników — moc obliczeniowa (Pobl) wchodząca do sumy przyłącza.
        </p>
        <dl className="print-glossary-list">
          {GLOSSARY_ITEMS.map((item) => (
            <div className="print-glossary-item" key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.description}</dd>
            </div>
          ))}
        </dl>
        <p className="print-glossary-formula">
          <strong>Wzór podstawowy:</strong> Pobl = Pinst × kd × kw
        </p>
      </section>

      <section className="print-intro">
        <div className="print-split">
          <div className="print-block">
            <h2>Parametry budynku</h2>
            <PrintTable compact headers={['Parametr', 'Wartość']} rows={buildingRows} />
            {heatDemandRows.length > 0 ? (
              <>
                <h2 className="print-subheading">Zapotrzebowanie na ciepło (przyjęte)</h2>
                <PrintTable
                  compact
                  headers={['Strefa', 'Gęstość mocy cieplnej']}
                  rows={heatDemandRows}
                />
                <p className="print-muted print-heat-hint">
                  Wartości z pomp ciepła. Magazyn liczony z kubatury: W/m² = W/m³ × wysokość [m].
                  Moc elektryczna = ciepło ÷ COP(-20°C).
                </p>
              </>
            ) : null}
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

      <PrintCopAssumptionsSection devices={devices} project={project} />

      <PrintProjectAssumptionsSection balance={balance} devices={devices} project={project} />

      <section className="print-scenarios-wrap">
        <h2 className="print-scenarios-title">Scenariusze</h2>
        <PrintScenariosOverviewTable scenarios={balance.scenarios} />
        {balance.scenarios.map((scenarioBalance, index) => (
          <PrintScenarioSection
            isFirst={index === 0}
            key={scenarioBalance.scenario.id}
            scenarioBalance={scenarioBalance}
            project={project}
          />
        ))}
      </section>

      <section className="print-llm-prompt">
        <h2>Prompt do analizy przez model językowy (LLM)</h2>
        <p className="print-muted print-llm-hint">
          Skopiuj poniższy tekst razem z wyeksportowanym PDF i wklej do czatu z modelem (np. ChatGPT,
          Claude, Gemini) jako instrukcję systemową lub pierwszą wiadomość użytkownika.
        </p>
        <pre className="print-llm-prompt-text">{buildLlmReviewPrompt(project)}</pre>
      </section>
    </div>
  )
}
