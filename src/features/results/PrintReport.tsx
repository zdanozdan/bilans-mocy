import { deviceCategories } from '../../domain/defaults'
import type { GroupedBalanceRow, ProjectBalance, ScenarioBalance } from '../../domain/types'

/** Stały opis celu raportu (przyłącze Enea, Mikran Wysogotowo). */
const REPORT_PURPOSE = `Niniejszy bilans mocy został sporządzony w celu ustalenia wymaganej mocy przyłącza energetycznego do obiektu firmy Mikran, ul. Zbożowa, Wysogotowo, na potrzeby postępowania w sprawie przyłączenia do sieci dystrybucyjnej Enea (operator sieci dystrybucyjnej).

Dokument zestawia szacunkowe moce zainstalowane (Pinst) i obliczeniowe (Pobl) odbiorników według stref i kategorii, w wariantach scenariuszowych (praca normalna, zima, lato, tryb rezerwowy), z uwzględnieniem rezerwy mocy oraz — jeśli skonfigurowano — wpływu magazynu energii. Na tej podstawie wyznaczana jest szacunkowa moc netto potrzebna do doboru mocy umownej przyłącza.

Wyniki mają charakter szacunkowy i opierają się na założeniach wskazanych w tabelach poniżej; ostateczną moc przyłącza określa operator sieci po weryfikacji dokumentacji i warunków przyłączenia.`

/** Prompt do wklejenia lub przekazania modelowi LLM wraz z tym PDF. */
const LLM_REVIEW_PROMPT = `Jesteś doświadczonym inżynierem elektrykiem i specjalistą od przyłączeń do sieci dystrybucyjnej w Polsce. Przeanalizuj załączony raport bilansu mocy (PDF) dla obiektu firmy Mikran, ul. Zbożowa, Wysogotowo — dokument przygotowywany pod ustalenie mocy przyłącza od operatora Enea.

Oceń:
1. Czy wyznaczona moc netto i proponowana wielkość przyłącza są realistyczne dla tego typu obiektu (magazyn z częścią biurową, serwerownia, technologia produkcyjna)?
2. Czy w obliczeniach i założeniach (współczynniki jednoczesności i wykorzystania, rezerwa, scenariusze sezonowe, COP pomp ciepła / klimatyzacji / CWU, magazyn energii, rozróżnienie mocy cieplnej i elektrycznej) nie ma błędów logicznych lub rażących nieścisłości?
3. Czego brakuje w bilansie lub dokumentacji, aby złożyć wiarygodne zgłoszenie do operatora (np. współczynnik mocy, moc bierna, rozdzielenie faz, prądy rozruchowe, UPS i zasilanie rezerwowe, normy PN-EN, tabele jednoczesności branżowych)?
4. Jakie korekty lub dodatkowe dane rekomendujesz przed złożeniem do Enea?

Odpowiedz strukturalnie po polsku, wskazując konkretne tabele, scenariusze i pozycje z PDF, gdzie to możliwe. Rozróżniaj usterki krytyczne od sugestii ulepszeń.`

const GLOSSARY_ITEMS: Array<{ term: string; description: string }> = [
  {
    term: 'Pinst — moc zainstalowana [kW]',
    description:
      'Suma mocy elektrycznych urządzeń „na papierze”, jakby wszystkie pracowały jednocześnie na pełnej mocy znamionowej. Przy zwykłych odbiornikach: ilość × moc jednostkowa [kW] albo powierzchnia × gęstość mocy [W/m²]. Przy pompach ciepła, klimatyzacji i CWU (gdy liczone z powierzchni lub osób): najpierw wyznacza się moc termiczną, potem dzieli przez COP — stąd w tabeli odbiorników osobne kolumny Pciel/Pchł/PcWU.',
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
    term: 'COP',
    description:
      'Współczynnik wydajności urządzenia grzewczego lub chłodniczego: ile kW ciepła (lub chłodu) daje 1 kW energii elektrycznej. Im wyższy COP, tym mniejsza moc elektryczna przy tej samej mocy termicznej. Przykład: 40 kW ciepła ÷ COP 3,5 ≈ 11,4 kW el. w Pinst.',
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
]

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

      <section className="print-llm-prompt">
        <h2>Prompt do analizy przez model językowy (LLM)</h2>
        <p className="print-muted print-llm-hint">
          Skopiuj poniższy tekst razem z wyeksportowanym PDF i wklej do czatu z modelem (np. ChatGPT,
          Claude, Gemini) jako instrukcję systemową lub pierwszą wiadomość użytkownika.
        </p>
        <pre className="print-llm-prompt-text">{LLM_REVIEW_PROMPT}</pre>
      </section>
    </div>
  )
}
