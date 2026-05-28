import { scenarios as defaultScenarios } from './defaults'
import { buildLlmEnergySimulationReviewPoint } from './energySimulationDisplay'
import {
  getDeviceScenarioInclusionState,
  type DeviceScenarioInclusionState,
} from './hvacDisplay'
import { ENEA_INDUCTIVE_TAN_PHI_LIMIT } from './reactivePower'
import { getZoneDisplayName } from './zones'
import type { Device, ProjectBalance, ProjectConfig, Scenario, ScenarioId } from './types'

const scenarioShortLabel: Record<ScenarioId, string> = {
  normal: 'Norm.',
  winter: 'Zima',
  summer: 'Lato',
  backup: 'Rez.',
}

const storageModeLabel: Record<ProjectConfig['energyStorage']['mode'], string> = {
  neutral: 'Neutralny',
  charging: 'Ładowanie',
  discharging: 'Rozładowanie',
  peakShaving: 'Redukcja szczytu (peak shaving)',
}

export const getBindingScenario = (balance: ProjectBalance) =>
  balance.scenarios.reduce((best, current) =>
    current.netPowerKw > best.netPowerKw ? current : best,
  )

export const buildHeatPumpSoftStartAssumptionRow = (
  devices: Device[],
): [string, string] | null => {
  const heatPumps = devices.filter((device) => device.categoryId === 'heatPumps')

  if (heatPumps.length === 0) {
    return null
  }

  return [
    'Pompy ciepła (PC) — rozruch',
    'Planowany mechanizm soft start (ograniczenie prądu i mocy rozruchowej kompresorów). W bilansie przyjęto Pinst/Pobl bez osobnego współczynnika rozruchu — szczegóły urządzeń i parametry soft start do uzupełnienia we wniosku do Enea Operator.',
  ]
}

export const buildProjectAssumptionRows = (
  project: ProjectConfig,
  balance: ProjectBalance,
  devices: Device[] = [],
): Array<[string, string]> => {
  const binding = getBindingScenario(balance)
  const normalDeratingPercent = Math.round((project.normalHvacDeratingFactor ?? 0.65) * 100)
  const rows: Array<[string, string]> = [
    ['Charakter obiektu', 'Handlowy (magazynowo-handlowy z biurem)'],
    ['Godziny pracy', '8:00–16:00'],
    [
      'Temperatury projektowe — magazyn',
      `${project.minWarehouseTempC} / ${project.maxWarehouseTempC} °C`,
    ],
    [
      'Temperatury projektowe — biuro',
      `${project.minOfficeTempC} / ${project.maxOfficeTempC} °C`,
    ],
    [
      'Ogrzewanie / klimatyzacja alternatywnie',
      project.useAlternativeHeatingCooling !== false ? 'Tak' : 'Nie',
    ],
    [
      'Moc bierna (Q) i współczynnik mocy',
      `Szacunek z Pobl i cos φ odbiorników; podział Q_ind (indukcyjna) i Q_poj (pojemnościowa) wg kategorii (LED, komputery/UPS → pojemnościowa; silniki, HVAC → indukcyjna). S i tan φ ze składowych wektorowych. Warunek Enea Operator: tan φ pobieranej mocy biernej indukcyjnej ≤ ${ENEA_INDUCTIVE_TAN_PHI_LIMIT.toFixed(2)} (Q_ind/P).`,
    ],
    [
      'Praca normalna — HVAC',
      `Na podstawie szczytów z wariantów Zima (ogrzewanie) i Lato (klimatyzacja): średnia obu kategorii lub ${normalDeratingPercent}% szczytu sezonowego, gdy aktywna tylko jedna — niezależnie od checkboxów „Praca normalna” przy pompach i klimatyzacji`,
    ],
  ]

  const softStartRow = buildHeatPumpSoftStartAssumptionRow(devices)
  if (softStartRow) {
    rows.push(softStartRow)
  }

  rows.push(
    [
      'Scenariusz wiążący przyłącze (max. moc netto)',
      `${binding.scenario.name} (${binding.netPowerKw.toFixed(2)} kW netto po magazynie)`,
    ],
    ['Instalacja PV', 'Nie uwzględniono w bilansie'],
  )

  if (project.energyStorage.enabled) {
    const storage = project.energyStorage
    rows.push(
      ['Magazyn energii — tryb', storageModeLabel[storage.mode]],
      ['Magazyn energii — pojemność', `${storage.capacityKwh} kWh`],
      [
        'Magazyn energii — moc ładow./rozł.',
        `${storage.chargePowerKw} / ${storage.dischargePowerKw} kW`,
      ],
      ['Magazyn energii — sprawność', `${storage.roundTripEfficiencyPercent}%`],
    )
  } else {
    rows.push(['Magazyn energii (BESS)', 'Nie uwzględniono w bilansie'])
  }

  return rows
}

export const buildScenarioDescriptionRows = (
  scenarioList: Scenario[] = defaultScenarios,
): Array<[string, string]> =>
  scenarioList.map((scenario) => [scenario.name, scenario.description])

export const buildCoolingDemandRows = (
  project: ProjectConfig,
  devices: Device[],
): Array<[string, string]> => {
  const coolingDevices = devices.filter(
    (device) =>
      device.categoryId === 'cooling' &&
      device.powerInputMode === 'area' &&
      (device.powerDensityWm2 ?? 0) > 0,
  )

  if (coolingDevices.length === 0) {
    return []
  }

  return coolingDevices.map((device) => [
    device.name,
    `${device.powerDensityWm2} W/m² · ${getZoneDisplayName(project, device.zoneId)}`,
  ])
}

export type DeviceScenarioMatrixRow = {
  name: string
  /** Stan włączenia w każdym scenariuszu (kolejność jak w scenarioList). */
  inclusionByScenario: DeviceScenarioInclusionState[]
}

export const buildDeviceScenarioMatrix = (
  devices: Device[],
  project: ProjectConfig,
  scenarioList: Scenario[] = defaultScenarios,
): { headers: string[]; rows: DeviceScenarioMatrixRow[] } => {
  const headers = ['Odbiornik', ...scenarioList.map((s) => scenarioShortLabel[s.id])]

  const rows = devices.map((device) => ({
    name: device.name,
    inclusionByScenario: scenarioList.map((scenario) =>
      getDeviceScenarioInclusionState(device, scenario.id, project),
    ),
  }))

  return { headers, rows }
}

export const buildDeviceNotesRows = (devices: Device[]): Array<[string, string]> =>
  devices
    .filter((device) => device.notes?.trim())
    .map((device) => [device.name, device.notes!.trim()])

export const buildLlmReviewPrompt = (project: ProjectConfig, devices: Device[] = []): string => {
  const storage = project.energyStorage
  const reservePercent = project.reservePercent

  const storageContext = storage.enabled
    ? `W bilansie uwzględniono magazyn energii: tryb „${storageModeLabel[storage.mode]}”, pojemność ${storage.capacityKwh} kWh, ładowanie ${storage.chargePowerKw} kW, rozładowanie ${storage.dischargePowerKw} kW, sprawność ${storage.roundTripEfficiencyPercent}%.`
    : 'W bilansie nie uwzględniono magazynu energii (BESS).'

  const reviewPoints: Array<{ title: string; body: string }> = [
    {
      title: 'POPRAWNOŚĆ ZAŁOŻEŃ I LOGIKI BILANSU',
      body: 'Zweryfikuj poprawność dobranych współczynników jednoczesności (kd) i wykorzystania (kw) dla kluczowych stref (Biuro vs Magazyn). Czy przypisanie odbiorników do stref jest czyste i bezbłędne? Czy relacja między mocą termiczną a poborem mocy elektrycznej HVAC w skrajnych temperaturach zimowych została poprawnie skalkulowana? Czy rozróżnienie scenariuszy „Praca normalna” i „Zima” jest logiczne?',
    },
    {
      title: 'MOC BIERNA, tan φ ORAZ WARUNKI ENEA OPERATOR',
      body: `Oceń podany w raporcie podział Q_ind i Q_poj, wypadkowe cos φ i tan φ oraz zgodność z warunkiem tan φ indukcyjnego ≤ ${ENEA_INDUCTIVE_TAN_PHI_LIMIT.toFixed(2)}. Czy przy oświetleniu LED, komputerach i UPS-ach występuje ryzyko karam za moc bierną pojemnościową? Jakie kompensacje (bateria kondensatorów, filtry) zalecasz?`,
    },
    {
      title: 'BRAKI FORMALNE I TECHNICZNE POD WNIOSEK DO ENEA OPERATOR',
      body: 'Czego nadal brakuje w tym bilansie, co jest obligatoryjne lub wysoce pożądane we wniosku o warunki przyłączenia? (Prądy rozruchowe HVAC i technologii, asymetria faz, harmoniczne, dokumentacja urządzeń).',
    },
    {
      title: 'REKOMENDACJA KOŃCOWA (MOC UMOWNA)',
      body: `Wskaż jednoznaczną, bezpieczną inżyniersko wartość mocy przyłączeniowej (w kW), o jaką inwestor powinien wystąpić do Enei, uwzględniając ${reservePercent}% rezerwę projektową, profil pracy biura oraz technologię maszynową (frezarki/druk 3D).`,
    },
    {
      title: 'INTEGRACJA Z INSTALACJĄ FOTOWOLTAICZNĄ (PV)',
      body: 'Jak dodanie instalacji PV wpłynęłoby na bilans mocy przyłączeniowej w relacji z Eneą? Oceń, czy moc przyłącza powinna uwzględniać maksymalną moc generowaną przez falownik PV (w kontekście statusu prosumenta lub autokonsumpcji).',
    },
  ]

  if (storage.enabled) {
    reviewPoints.push(
      {
        title: 'ANALIZA SKONFIGUROWANEGO MAGAZYNU ENERGII (PEAK SHAVING)',
        body: 'Oceń ryzyko awarii lub wyczerpania magazynu, czas trwania szczytowego poboru mocy przez pompy ciepła (COP przy mrozach) oraz adekwatność pojemności i mocy ładowania/rozładowania. Czy redukcja szczytu w bilansie jest formalnie i technicznie obronna wobec Enea Operator?',
      },
      {
        title: 'CZY MAGAZYN ENERGII MA SENS W TYM OBIEKCIE',
        body: 'Oceń, czy dla obiektu handlowego (8:00–16:00, profil zimowy z pompami ciepła, technologia magazynowa) taka inwestycja w BESS jest uzasadniona — także w porównaniu z samym zwiększeniem mocy przyłącza i w relacji z ewentualnym PV.',
      },
    )
  } else {
    reviewPoints.push({
      title: 'CZY MAGAZYN ENERGII MA SENS W TYM OBIEKCIE',
      body: 'W bilansie nie ma BESS. Oceń, czy dla obiektu handlowego (8:00–16:00, pompy ciepła, technologia) warto rozważyć magazyn energii (np. peak shaving) — jakie parametry byłyby sensowne i czy to realnie obniży wymaganą moc przyłącza wobec Enea, także w zestawieniu z PV.',
    })
  }

  const simulationReview = buildLlmEnergySimulationReviewPoint(project, devices)
  if (simulationReview) {
    reviewPoints.push(simulationReview)
  }

  const numberedPoints = reviewPoints
    .map((point, index) => `${index + 1}. ${point.title}:\n${point.body}`)
    .join('\n\n')

  return `Jesteś doświadczonym audytorem energetycznym, inżynierem elektrykiem i ekspertem ds. procedur przyłączeniowych do sieci dystrybucyjnej w Polsce (ze szczególnym uwzględnieniem standardów Enea Operator).

Przeanalizuj załączony raport bilansu mocy dla obiektu firmy Mikran w Wysogotowie (ul. Zbożowa). Dokument ma służyć jako podstawa do określenia optymalnej mocy przyłączeniowej we wniosku do Enei.

KONTEKST OBIEKTU (istotny dla oceny bilansu):
- Obiekt handlowy (magazynowo-handlowy z częścią biurową i zapleczem technicznym).
- Godziny pracy obiektu: 8:00–16:00 — poza tym przedziałem zakładaj ograniczoną aktywność odbiorników biurowych, socjalnych i technologicznych; uwzględnij to przy ocenie współczynników jednoczesności (kd), wykorzystania (kw) oraz scenariusza „Praca normalna”.
- ${storageContext}

Dokonaj krytycznej oceny inżynierskiej według następujących punktów:

${numberedPoints}

Odpowiedz strukturalnie po polsku. Każdą uwagę poprzyj konkretną liczbą, tabelą lub scenariuszem (Praca normalna, Zima, Lato, Tryb rezerwowy) z załączonego dokumentu. W sekcji o symulacji zużycia odwołaj się do wykresów profilu dobowego i parametrów τ, T_zew, T_nocna. Kategorycznie rozdziel usterki krytyczne (błędy w sztuce, ryzyko awarii zasilania) od sugestii optymizacyjnych.
`
}
