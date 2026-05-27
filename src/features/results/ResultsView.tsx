import { useMemo, useState } from 'react'
import type { GroupedBalanceRow, ProjectBalance } from '../../domain/types'

interface ResultsViewProps {
  balance: ProjectBalance
}

const formatPower = (value: number) => `${value.toFixed(2)} kW`
const formatKva = (value: number) => `${value.toFixed(2)} kVA`

function ContextHelp({ text }: { text: string }) {
  return (
    <details className="context-help">
      <summary aria-label="Pokaż wyjaśnienie">?</summary>
      <p>{text}</p>
    </details>
  )
}

function SummaryCard({
  label,
  value,
  help,
  highlight = false,
}: {
  label: string
  value: string
  help: string
  highlight?: boolean
}) {
  return (
    <article className={`summary-card ${highlight ? 'highlight' : ''}`}>
      <div className="summary-label">
        <span>{label}</span>
        <ContextHelp text={help} />
      </div>
      <strong>{value}</strong>
    </article>
  )
}

function GroupTable({ rows }: { rows: GroupedBalanceRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">Brak aktywnych odbiorników w tym scenariuszu.</p>
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pozycja</th>
            <th>Pinst [kW]</th>
            <th>Pobl [kW]</th>
            <th>S [kVA]</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.label}</td>
              <td className="numeric">{row.installedPowerKw.toFixed(2)}</td>
              <td className="numeric strong">{row.calculatedPowerKw.toFixed(2)}</td>
              <td className="numeric">{row.apparentPowerKva.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ResultsView({ balance }: ResultsViewProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    balance.scenarios[0]?.scenario.id ?? 'normal',
  )
  const selectedScenario = useMemo(
    () =>
      balance.scenarios.find((scenario) => scenario.scenario.id === selectedScenarioId) ??
      balance.scenarios[0],
    [balance.scenarios, selectedScenarioId],
  )

  if (!selectedScenario) {
    return null
  }

  const excludedHvacLabel =
    selectedScenario.hvacAlternative.excludedCategoryId === 'heatPumps'
      ? 'ogrzewanie'
      : 'klimatyzacja'

  return (
    <section className="panel results-panel" aria-labelledby="results-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Wyniki</p>
          <h2 id="results-heading">Bilans mocy</h2>
        </div>
        <div className="action-row">
          <button className="secondary" type="button" onClick={() => window.print()}>
            Drukuj / PDF
          </button>
        </div>
      </div>

      <div className="scenario-tabs" role="tablist" aria-label="Scenariusze obliczeniowe">
        {balance.scenarios.map((scenarioBalance) => (
          <button
            aria-selected={scenarioBalance.scenario.id === selectedScenario.scenario.id}
            className={scenarioBalance.scenario.id === selectedScenario.scenario.id ? 'active' : ''}
            key={scenarioBalance.scenario.id}
            role="tab"
            type="button"
            onClick={() => setSelectedScenarioId(scenarioBalance.scenario.id)}
          >
            {scenarioBalance.scenario.name}
          </button>
        ))}
      </div>

      <div className="summary-grid">
        <SummaryCard
          help="Suma mocy znamionowych aktywnych urządzeń w wybranym scenariuszu. Dla urządzeń liczonych z powierzchni jest to powierzchnia strefy razy W/m2, a dla ręcznych: ilość razy moc jednostkowa."
          label="Moc zainstalowana"
          value={formatPower(selectedScenario.installedPowerKw)}
        />
        <SummaryCard
          help="Moc używana do bilansu po uwzględnieniu współczynnika jednoczesności i współczynnika wykorzystania. Jeśli w konfiguracji włączono tryb alternatywny, ogrzewanie i klimatyzacja nie są sumowane - do bilansu trafia większa z tych wartości."
          label="Moc obliczeniowa"
          value={formatPower(selectedScenario.calculatedPowerKw)}
        />
        <SummaryCard
          help={`Dodatkowy zapas projektowy liczony jako ${balance.project.reservePercent}% mocy obliczeniowej. Rezerwa pomaga uwzględnić przyszłą rozbudowę, niepewność danych i margines bezpieczeństwa.`}
          label="Rezerwa"
          value={formatPower(selectedScenario.reservePowerKw)}
        />
        <SummaryCard
          help="Końcowa moc po dodaniu rezerwy i korekcie magazynu energii. Ładowanie magazynu zwiększa zapotrzebowanie, a rozładowanie lub redukcja szczytu je zmniejsza."
          highlight
          label="Moc netto po magazynie"
          value={formatPower(selectedScenario.netPowerKw)}
        />
      </div>

      {selectedScenario.hvacAlternative.applied ? (
        <p className="info-note">
          Ogrzewanie i klimatyzacja są liczone alternatywnie. Do bilansu przyjęto większą
          wartość, a pominięto {excludedHvacLabel}:{' '}
          {formatPower(selectedScenario.hvacAlternative.excludedCalculatedPowerKw)}.
        </p>
      ) : null}

      <div className="details-grid">
        <div>
          <h3>Podział wg kategorii</h3>
          <GroupTable rows={selectedScenario.byCategory} />
        </div>
        <div>
          <h3>Podział wg stref</h3>
          <GroupTable rows={selectedScenario.byZone} />
        </div>
      </div>

      <div className="subsection">
        <h3>Podsumowanie scenariusza</h3>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <th>Moc pozorna</th>
                <td>{formatKva(selectedScenario.apparentPowerKva)}</td>
              </tr>
              <tr>
                <th>Powierzchnia łączna</th>
                <td>{balance.metrics.totalAreaM2.toFixed(0)} m2</td>
              </tr>
              <tr>
                <th>Kubatura magazynu</th>
                <td>{balance.metrics.warehouseVolumeM3.toFixed(0)} m3</td>
              </tr>
              <tr>
                <th>Liczba osób / komputerów</th>
                <td>
                  {balance.metrics.peopleCount} / {balance.metrics.computerCount}
                </td>
              </tr>
              <tr>
                <th>Suma z rezerwą</th>
                <td>{formatPower(selectedScenario.totalWithReserveKw)}</td>
              </tr>
              <tr>
                <th>Ogrzewanie / klimatyzacja alternatywnie</th>
                <td>
                  {selectedScenario.hvacAlternative.enabled
                    ? selectedScenario.hvacAlternative.applied
                      ? `Tak, pominięto ${formatPower(selectedScenario.hvacAlternative.excludedCalculatedPowerKw)}`
                      : 'Włączone, ale w tym scenariuszu nie ma jednocześnie ogrzewania i klimatyzacji'
                    : 'Wyłączone'}
                </td>
              </tr>
              <tr>
                <th>Korekta magazynu energii</th>
                <td>{formatPower(selectedScenario.energyStorageAdjustmentKw)}</td>
              </tr>
              <tr>
                <th>Liczba aktywnych odbiorników</th>
                <td>{selectedScenario.devices.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
