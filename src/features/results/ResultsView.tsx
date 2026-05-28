import { useMemo, useState } from 'react'
import { ContextHelp } from '../../components/ContextHelp'
import {
  buildHvacCategoryTableNote,
  buildHvacScenarioSummaryLine,
  getHvacPoblCellSuffix,
  isHvacRowExcludedFromScenarioSum,
} from '../../domain/hvacDisplay'
import { EnergySimulationPanel } from '../simulation/EnergySimulationPanel'
import type {
  Device,
  EnergySimulationConfig,
  EnergyStorageConfig,
  GroupedBalanceRow,
  HvacAlternativeBalance,
  ProjectBalance,
  ProjectConfig,
  ScenarioBalance,
} from '../../domain/types'
import { buildBalanceTsv, copyTextToClipboard } from '../../utils/exportBalanceTsv'

interface ResultsViewProps {
  balance: ProjectBalance
  project: ProjectConfig
  devices: Device[]
  onSimulationConfigChange: (config: EnergySimulationConfig) => void
}

const formatPower = (value: number) => `${value.toFixed(2)} kW`
const formatKva = (value: number) => `${value.toFixed(2)} kVA`

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

const formatDelta = (deltaKw: number) => {
  if (Math.abs(deltaKw) < 0.005) {
    return '0.00 kW'
  }

  return `${deltaKw > 0 ? '+' : ''}${deltaKw.toFixed(2)} kW`
}

function NetPowerComparison({
  scenario,
  storage,
}: {
  scenario: ScenarioBalance
  storage: EnergyStorageConfig
}) {
  const netWithoutStorage = scenario.totalWithReserveKw
  const netWithStorage = scenario.netPowerKw
  const differenceKw = netWithStorage - netWithoutStorage
  const storageActive =
    storage.enabled && storage.mode !== 'neutral' && Math.abs(scenario.energyStorageAdjustmentKw) > 0.005

  return (
    <div className="net-power-comparison" aria-label="Porównanie mocy netto">
      <div className="net-power-comparison-heading">
        <h3>Moc netto scenariusza</h3>
        <ContextHelp text="Bez magazynu: moc obliczeniowa + rezerwa projektowa. Po magazynie: ta sama suma skorygowana o ładowanie, rozładowanie lub redukcję szczytu (zależnie od trybu magazynu). Różnica pokazuje wpływ magazynu na końcowe zapotrzebowanie." />
      </div>
      <div className="net-power-comparison-grid">
        <article className="net-power-card">
          <span>Bez magazynu</span>
          <strong>{formatPower(netWithoutStorage)}</strong>
          <p className="net-power-card-hint">Pobl + rezerwa</p>
        </article>
        <div className="net-power-delta" aria-label="Różnica">
          <span>Różnica</span>
          <strong className={differenceKw < 0 ? 'is-lower' : differenceKw > 0 ? 'is-higher' : ''}>
            {formatDelta(differenceKw)}
          </strong>
          {storageActive ? (
            <p className="net-power-card-hint">
              Korekta: {formatPower(scenario.energyStorageAdjustmentKw)}
            </p>
          ) : (
            <p className="net-power-card-hint">Brak korekty magazynu</p>
          )}
        </div>
        <article className="net-power-card net-power-card-highlight">
          <span>Po magazynie</span>
          <strong>{formatPower(netWithStorage)}</strong>
          <p className="net-power-card-hint">Suma z rezerwą ± magazyn</p>
        </article>
      </div>
    </div>
  )
}

function GroupTable({
  rows,
  hvacAlternative,
  scenarioCalculatedPowerKw,
}: {
  rows: GroupedBalanceRow[]
  hvacAlternative?: HvacAlternativeBalance
  scenarioCalculatedPowerKw?: number
}) {
  if (rows.length === 0) {
    return <p className="empty-state">Brak aktywnych odbiorników w tym scenariuszu.</p>
  }

  const hvacNote =
    hvacAlternative && scenarioCalculatedPowerKw != null
      ? buildHvacCategoryTableNote(hvacAlternative, rows, scenarioCalculatedPowerKw)
      : null

  return (
    <div className="table-wrap">
      <table className={hvacNote ? 'group-table-hvac' : undefined}>
        <thead>
          <tr>
            <th>Pozycja</th>
            <th>Pinst [kW]</th>
            <th>Pobl [kW]</th>
            <th>S [kVA]</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const excluded =
              hvacAlternative != null &&
              isHvacRowExcludedFromScenarioSum(hvacAlternative, row.id)
            const poblSuffix =
              hvacAlternative != null ? getHvacPoblCellSuffix(hvacAlternative, row.id) : null

            return (
              <tr
                className={excluded ? 'hvac-row-excluded' : undefined}
                key={row.id}
              >
                <td>
                  {row.label}
                  {poblSuffix ? (
                    <span className="hvac-row-badge">{poblSuffix}</span>
                  ) : null}
                </td>
                <td className="numeric">{row.installedPowerKw.toFixed(2)}</td>
                <td className="numeric strong">
                  {row.calculatedPowerKw.toFixed(2)}
                </td>
                <td className="numeric">{row.apparentPowerKva.toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {hvacNote ? <p className="hvac-table-note">{hvacNote}</p> : null}
    </div>
  )
}

export function ResultsView({
  balance,
  project,
  devices,
  onSimulationConfigChange,
}: ResultsViewProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
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

  const hvacSummaryLine = buildHvacScenarioSummaryLine(selectedScenario.hvacAlternative)

  const handleCopyTsv = async () => {
    setCopyStatus(null)

    try {
      await copyTextToClipboard(buildBalanceTsv(balance))
      setCopyStatus('Skopiowano do schowka — wklej w Arkusze Google (Ctrl+V / Cmd+V).')
    } catch {
      setCopyStatus('Nie udało się skopiować. Sprawdź uprawnienia schowka w przeglądarce.')
    }
  }

  return (
    <section className="panel results-panel" aria-labelledby="results-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Wyniki</p>
          <h2 id="results-heading">Bilans mocy</h2>
        </div>
        <div className="action-row">
          <button className="secondary" type="button" onClick={() => void handleCopyTsv()}>
            Kopiuj TSV do schowka
          </button>
          <button className="secondary" type="button" onClick={() => window.print()}>
            Drukuj / PDF
          </button>
        </div>
      </div>

      {copyStatus ? <p className="info-text">{copyStatus}</p> : null}

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
          help="Suma mocy elektrycznych znamionowych (Pinst). Pompa ciepła, klimatyzacja i CWU (z powierzchni): moc termiczna / COP(-20°C) — do bilansu przyłącza. CWU domyślnie: liczba osób × W/os. Magazyn może być liczony z kubatury × W/m³. Pozostałe odbiorniki: powierzchnia × W/m² lub ilość × kW."
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
          help="Suma mocy obliczeniowej i rezerwy projektowej, przed uwzględnieniem magazynu energii (ładowanie / rozładowanie / redukcja szczytu)."
          label="Suma z rezerwą"
          value={formatPower(selectedScenario.totalWithReserveKw)}
        />
      </div>

      {hvacSummaryLine ? (
        <p className="info-note info-note-hvac" role="note">
          {hvacSummaryLine}
        </p>
      ) : null}

      <div className="details-grid">
        <div>
          <div className="subsection-heading-with-help">
            <h3>Podział wg kategorii</h3>
            {selectedScenario.hvacAlternative.applied ? (
              <ContextHelp text="Tabela pokazuje moc każdej kategorii osobno. Ogrzewanie i klimatyzacja nie sumują się do mocy obliczeniowej u góry — wliczana jest tylko większa z nich (oznaczenie „wliczone do sumy scenariusza” / „poza sumą scenariusza”)." />
            ) : null}
          </div>
          <GroupTable
            hvacAlternative={selectedScenario.hvacAlternative}
            rows={selectedScenario.byCategory}
            scenarioCalculatedPowerKw={selectedScenario.calculatedPowerKw}
          />
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
                <th>Q indukcyjna / pojemnościowa</th>
                <td>
                  {selectedScenario.reactivePowerInductiveKvar.toFixed(2)} /{' '}
                  {selectedScenario.reactivePowerCapacitiveKvar.toFixed(2)} kvar
                </td>
              </tr>
              <tr>
                <th>cos φ / tan φ_ind</th>
                <td>
                  {selectedScenario.powerFactorCos.toFixed(3)} /{' '}
                  {selectedScenario.inductiveTanPhi.toFixed(3)}
                  {selectedScenario.meetsEneaInductiveTanPhiLimit
                    ? ' (Enea OK)'
                    : ' (tan φ_ind > 0,40)'}
                </td>
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

      <NetPowerComparison scenario={selectedScenario} storage={balance.project.energyStorage} />

      <EnergySimulationPanel
        devices={devices}
        project={project}
        onSimulationConfigChange={onSimulationConfigChange}
      />
    </section>
  )
}
