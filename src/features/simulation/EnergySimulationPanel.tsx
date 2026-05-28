import { useMemo, useState } from 'react'
import { ContextHelp } from '../../components/ContextHelp'
import { scenarios as defaultScenarios } from '../../domain/defaults'
import {
  resolveEnergySimulationConfig,
  simulateProjectEnergy,
} from '../../domain/energySimulation'
import type { Device, EnergySimulationConfig, ProjectConfig, ScenarioId } from '../../domain/types'
import { HourlyEnergyChart } from './HourlyEnergyChart'

interface EnergySimulationPanelProps {
  project: ProjectConfig
  devices: Device[]
  onSimulationConfigChange: (config: EnergySimulationConfig) => void
}

const phaseLabels = {
  preheat: 'Noc (obniżka) + dogrzewanie',
  work: 'Godziny pracy',
  setback: 'Obniżenie po pracy',
} as const

const externalTempConfigKey: Record<
  'normal' | 'winter' | 'summer',
  keyof Pick<
    EnergySimulationConfig,
    'externalTempWinterC' | 'externalTempSummerC' | 'externalTempNormalC'
  >
> = {
  winter: 'externalTempWinterC',
  summer: 'externalTempSummerC',
  normal: 'externalTempNormalC',
}

export function EnergySimulationPanel({
  project,
  devices,
  onSimulationConfigChange,
}: EnergySimulationPanelProps) {
  const config = resolveEnergySimulationConfig(project)
  const [activeScenarioId, setActiveScenarioId] = useState<ScenarioId>('winter')

  const simulations = useMemo(
    () =>
      simulateProjectEnergy(
        project,
        devices,
        Object.fromEntries(defaultScenarios.map((scenario) => [scenario.id, scenario.name])) as Record<
          ScenarioId,
          string
        >,
      ),
    [project, devices],
  )

  const activeSimulation =
    simulations.find((item) => item.scenarioId === activeScenarioId) ?? simulations[0]

  const activeExternalTempKey = activeSimulation
    ? externalTempConfigKey[activeSimulation.scenarioId as keyof typeof externalTempConfigKey]
    : null

  const updateConfig = <K extends keyof EnergySimulationConfig>(
    key: K,
    value: EnergySimulationConfig[K],
  ) => {
    onSimulationConfigChange({ ...config, [key]: value })
  }

  return (
    <section className="panel energy-simulation-panel" aria-labelledby="energy-simulation-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Profil dobowy</p>
          <h2 id="energy-simulation-heading">Symulacja zużycia energii (godzinowo)</h2>
        </div>
        <p className="muted">
          Ogrzewanie: moc z W/m² i W/m³ (UA), model bezwładności budynku (τ ={' '}
          {config.buildingThermalTimeConstantH} h) — po osiągnięciu T_zadana tylko utrzymanie strat,
          po obniżce setpointu moc maleje, w dogrzewaniu rośnie.
        </p>
      </div>

      <div className="sim-config form-grid">
        <label>
          Początek pracy [godz.]
          <input
            max={23}
            min={0}
            type="number"
            value={config.workStartHour}
            onChange={(event) => updateConfig('workStartHour', event.target.valueAsNumber)}
          />
        </label>
        <label>
          Koniec pracy [godz.]
          <input
            max={24}
            min={1}
            type="number"
            value={config.workEndHour}
            onChange={(event) => updateConfig('workEndHour', event.target.valueAsNumber)}
          />
        </label>
        <label>
          <span className="label-with-help">
            Start dogrzewania [godz.]
            <ContextHelp text="Od tej godziny (zwykle wieczorem) symulacja zakłada fazę dogrzewania do temperatury komfortowej na początek pracy." />
          </span>
          <input
            max={23}
            min={0}
            type="number"
            value={config.preheatStartHour}
            onChange={(event) => updateConfig('preheatStartHour', event.target.valueAsNumber)}
          />
        </label>
        <label>
          <span className="label-with-help">
            Bezwładność cieplna τ [h]
            <ContextHelp text="Stała czasowa całego budynku (C = UA × τ). Większa τ — wolniejsze stygnięcie po obniżce i wolniejsze dogrzewanie rano." />
          </span>
          <input
            min={0.5}
            step={0.5}
            type="number"
            value={config.buildingThermalTimeConstantH}
            onChange={(event) =>
              updateConfig('buildingThermalTimeConstantH', event.target.valueAsNumber)
            }
          />
        </label>
      </div>

      <div className="scenario-tabs" role="tablist" aria-label="Scenariusze symulacji">
        {simulations.map((simulation) => (
          <button
            className={simulation.scenarioId === activeScenarioId ? 'active' : ''}
            key={simulation.scenarioId}
            role="tab"
            type="button"
            aria-selected={simulation.scenarioId === activeScenarioId}
            id={`sim-tab-${simulation.scenarioId}`}
            onClick={() => setActiveScenarioId(simulation.scenarioId)}
          >
            {simulation.scenarioName}
          </button>
        ))}
      </div>

      {activeSimulation && activeExternalTempKey ? (
        <>
          <div className="sim-scenario-config form-grid">
            <label>
              T_zew — {activeSimulation.scenarioName} [°C]
              <input
                type="number"
                value={config[activeExternalTempKey]}
                onChange={(event) =>
                  updateConfig(activeExternalTempKey, event.target.valueAsNumber)
                }
              />
            </label>
            {activeSimulation.scenarioId === 'winter' ? (
              <>
                <label>
                  T nocna (obniżka) — Zima [°C]
                  <input
                    type="number"
                    value={config.winterNightSetpointC}
                    onChange={(event) =>
                      updateConfig('winterNightSetpointC', event.target.valueAsNumber)
                    }
                  />
                </label>
                <label>
                  Start rampy dogrzewania [godz.]
                  <input
                    max={23}
                    min={0}
                    type="number"
                    value={config.preheatRampStartHour}
                    onChange={(event) =>
                      updateConfig('preheatRampStartHour', event.target.valueAsNumber)
                    }
                  />
                </label>
              </>
            ) : null}
          </div>

          <div
            className="sim-scenario-panel"
            key={activeSimulation.scenarioId}
            role="tabpanel"
            aria-labelledby={`sim-tab-${activeSimulation.scenarioId}`}
          >
            <div className="sim-summary-grid">
              <article>
                <span>T_zew scenariusza</span>
                <strong>{activeSimulation.externalTempC.toFixed(1)} °C</strong>
              </article>
              <article>
                <span>T komfort / nocna</span>
                <strong>
                  {activeSimulation.comfortSetpointC.toFixed(1)} /{' '}
                  {activeSimulation.nightSetpointC.toFixed(1)} °C
                </strong>
              </article>
              {activeSimulation.showHeating ? (
                <article>
                  <span>Szczyt mocy PC</span>
                  <strong>
                    {Math.max(...activeSimulation.hourly.map((p) => p.electricalHeatingKw), 0).toFixed(
                      2,
                    )}{' '}
                    kW
                  </strong>
                </article>
              ) : null}
              {activeSimulation.showCooling ? (
                <article>
                  <span>Szczyt mocy klim.</span>
                  <strong>
                    {Math.max(...activeSimulation.hourly.map((p) => p.electricalCoolingKw), 0).toFixed(
                      2,
                    )}{' '}
                    kW
                  </strong>
                </article>
              ) : null}
              <article>
                <span>Szczyt razem / energia dobowa</span>
                <strong>
                  {activeSimulation.peakPowerKw.toFixed(2)} kW ({activeSimulation.peakHour}:00) ·{' '}
                  {activeSimulation.dailyEnergyKwh.toFixed(1)} kWh
                </strong>
              </article>
            </div>

            <HourlyEnergyChart
              showCooling={activeSimulation.showCooling}
              showHeating={activeSimulation.showHeating}
              simulation={activeSimulation}
            />

            <div className="table-wrap">
              <table className="sim-hourly-table">
                <thead>
                  <tr>
                    <th>Godz.</th>
                    <th>Faza</th>
                    <th>T_zad [°C]</th>
                    {activeSimulation.showHeating ? <th>T_wewn [°C]</th> : null}
                    {activeSimulation.showHeating ? <th>Ogrz. PC [kW]</th> : null}
                    {activeSimulation.showCooling ? <th>Chł. [kW]</th> : null}
                    <th>Baza [kW]</th>
                    <th>Razem [kW]</th>
                    <th>[kWh]</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSimulation.hourly.map((point) => (
                    <tr key={point.hour} className={`sim-row-${point.phase}`}>
                      <td>{point.label}</td>
                      <td>{phaseLabels[point.phase]}</td>
                      <td className="numeric">{point.setpointC.toFixed(1)}</td>
                      {activeSimulation.showHeating ? (
                        <td className="numeric">{point.indoorTempC.toFixed(1)}</td>
                      ) : null}
                      {activeSimulation.showHeating ? (
                        <td className="numeric">{point.electricalHeatingKw.toFixed(2)}</td>
                      ) : null}
                      {activeSimulation.showCooling ? (
                        <td className="numeric">{point.electricalCoolingKw.toFixed(2)}</td>
                      ) : null}
                      <td className="numeric">{point.electricalBaseKw.toFixed(2)}</td>
                      <td className="numeric strong">{point.electricalTotalKw.toFixed(2)}</td>
                      <td className="numeric">{point.energyKwh.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
