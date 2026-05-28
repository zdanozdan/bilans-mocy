import { scenarios as defaultScenarios } from './defaults'
import {
  getSimulationExternalTempC,
  resolveEnergySimulationConfig,
  simulateProjectEnergy,
} from './energySimulation'
import type {
  Device,
  ProjectConfig,
  ScenarioEnergySimulation,
  ScenarioId,
} from './types'

export const ENERGY_SIMULATION_METHODOLOGY_PARAGRAPHS: string[] = [
  `Symulacja godzinowa uzupełnia bilans mocy przyłącza (Pinst/Pobl): pokazuje, jak układa się pobór mocy elektrycznej w ciągu doby przy stałej temperaturze zewnętrznej charakterystycznej dla wariantu (Zima / Lato / Praca normalna), a nie tylko jeden szczyt sezonowy.`,
  `Moc cieplna budynku wynika z gęstości W/m² i W/m³ przyjętych przy pompach ciepła w tabeli urządzeń (moc zainstalowana termiczna). Współczynnik strat UA = P_term / (T_komfort − T_zew scenariusza). Stała czasowa bezwładności τ [h] określa pojemność cieplną całego obiektu: C = UA × τ.`,
  `W każdej godzinie: temperatura zadana T_zad z harmonogramu (praca 8–16, obniżka po pracy, nocna obniżka, rampa dogrzewania). Zapotrzebowanie P = UA·(T_zad − T_zew) + C·(T_zad − T_wewn) — pierwszy składnik to utrzymanie przy osiągniętej temperaturze, drugi do dogrzewania lub redukcja po obniżce setpointu, gdy w środku nadal jest ciepło. Moc grzewcza jest ograniczona do sumy mocy zainstalowanej pomp; P_el = P_grz / COP(T_zew).`,
  `Odbiorniki poza HVAC (oświetlenie, gniazda itd.) w godzinach pracy: udział Pobl rozłożony równomiernie; poza pracą — ok. 8% mocy bazowej. Profil liczony w dwóch przebiegach doby, aby ustabilizować T_wewn po cyklu.`,
]

export const buildEnergySimulationConfigRows = (
  project: ProjectConfig,
): Array<[string, string]> => {
  const config = resolveEnergySimulationConfig(project)

  return [
    ['Godziny pracy', `${config.workStartHour}:00 – ${config.workEndHour}:00`],
    ['Start okna dogrzewania', `${config.preheatStartHour}:00`],
    ['Start rampy T_zad (zima)', `${config.preheatRampStartHour}:00 → ${config.workStartHour}:00`],
    ['T_zew — Zima / Lato / Normalna', `${config.externalTempWinterC} / ${config.externalTempSummerC} / ${config.externalTempNormalC} °C`],
    ['T nocna (obniżka, zima)', `${config.winterNightSetpointC} °C`],
    ['Bezwładność cieplna τ', `${config.buildingThermalTimeConstantH} h (C = UA × τ)`],
    ['Chłodzenie — ΔT projektowe', `${config.coolingDesignDeltaK} K (profil uproszczony)`],
  ]
}

export const buildEnergySimulationScenarioSummaryRows = (
  simulation: ScenarioEnergySimulation,
): Array<[string, string]> => {
  const peakHeating = Math.max(...simulation.hourly.map((p) => p.electricalHeatingKw), 0)

  return [
    ['T_zew', `${simulation.externalTempC.toFixed(1)} °C`],
    ['T komfort / nocna (zadana)', `${simulation.comfortSetpointC.toFixed(1)} / ${simulation.nightSetpointC.toFixed(1)} °C`],
    ['Szczyt mocy razem', `${simulation.peakPowerKw.toFixed(2)} kW (godz. ${simulation.peakHour}:00)`],
    ['Szczyt ogrzewania PC (el.)', `${peakHeating.toFixed(2)} kW`],
    ['Energia dobowa (szac.)', `${simulation.dailyEnergyKwh.toFixed(1)} kWh`],
    ['Moc termiczna PC (zainst.)', `${simulation.maxHeatingThermalKw.toFixed(2)} kW`],
  ]
}

export const buildEnergySimulationLlmReviewBlock = (
  project: ProjectConfig,
  devices: Device[],
): string => {
  const config = resolveEnergySimulationConfig(project)
  const simulations = simulateProjectEnergy(
    project,
    devices,
    Object.fromEntries(defaultScenarios.map((s) => [s.id, s.name])) as Record<ScenarioId, string>,
  )

  if (simulations.length === 0) {
    return ''
  }

  const scenarioLines = simulations
    .map((sim) => {
      const peakHeat = Math.max(...sim.hourly.map((p) => p.electricalHeatingKw), 0)
      return (
        `• ${sim.scenarioName}: T_zew=${sim.externalTempC}°C, T_komfort/noc=${sim.comfortSetpointC.toFixed(1)}/${sim.nightSetpointC.toFixed(1)}°C, ` +
        `szczyt razem=${sim.peakPowerKw.toFixed(1)} kW (godz. ${sim.peakHour}:00), szczyt PC=${peakHeat.toFixed(1)} kW, doba≈${sim.dailyEnergyKwh.toFixed(0)} kWh`
      )
    })
    .join('\n')

  return `SYMULACJA ZUŻYCIA ENERGII (profil dobowy 24 h):
Parametry: praca ${config.workStartHour}:00–${config.workEndHour}:00, dogrzewanie od ${config.preheatStartHour}:00, rampa od ${config.preheatRampStartHour}:00, T_noc_zima=${config.winterNightSetpointC}°C, τ=${config.buildingThermalTimeConstantH} h.
Model: UA z W/m²/W/m³ pomp; P_grz=min(P_zainst, UA·ΔT+C·ΔT_wewn/h); P_el=P_grz/COP(T_zew); aktualizacja T_wewn (RC); 2 przebiegi doby.
Wyniki:
${scenarioLines}`
}

export const buildLlmEnergySimulationReviewPoint = (
  project: ProjectConfig,
  devices: Device[],
): { title: string; body: string } | null => {
  const hasHeatOrCool = devices.some(
    (d) => d.categoryId === 'heatPumps' || d.categoryId === 'cooling',
  )

  if (!hasHeatOrCool) {
    return null
  }

  const config = resolveEnergySimulationConfig(project)
  const block = buildEnergySimulationLlmReviewBlock(project, devices)

  return {
    title: 'WERYFIKACJA SYMULACJI ZUŻYCIA ENERGII (PROFIL DOBOWY)',
    body: `${block}

Oceń krytycznie, czy taki profil dobowy jest inżyniersko spójny z bilansem Pinst/Pobl i ze scenariuszami Zima/Lato/Praca normalna:
• Czy UA wynikające z W/m² i W/m³ oraz przyjęte T_zew dają realistyczne moce utrzymania i dogrzewania?
• Czy po obniżce setpointu (wieczór/noc) model RC słusznie obniża moc, gdy T_wewn > T_zadana, a w rampie dogrzewania zwiększa ją ponad samo utrzymanie?
• Czy szczyty godzinowe PC (przy COP przy ${getSimulationExternalTempC('winter', config)}°C) nie są zaniżone ani zawyżone względem szczytu sezonowego z tabel bilansu?
• Czy rozłożenie odbiorników bazowych (100% w pracy / ~8% poza) odpowiada profilowi obiektu 8:00–16:00?
• Czy stała τ=${config.buildingThermalTimeConstantH} h jest wiarygodna dla magazynu z częścią biurową — co zmieniłoby wynik przy τ=4 h vs 12 h?
Wskaż ewentualne błędy metody i rekomendacje korekty parametrów.`,
  }
}
