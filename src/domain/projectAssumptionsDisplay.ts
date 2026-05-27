import { scenarios as defaultScenarios } from './defaults'
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

export const buildProjectAssumptionRows = (
  project: ProjectConfig,
  balance: ProjectBalance,
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
      'Praca normalna — HVAC',
      `Średnia z ogrzewania i klimatyzacji (gdy obie aktywne) lub ${normalDeratingPercent}% szczytu sezonowego (gdy aktywna tylko jedna kategoria)`,
    ],
    [
      'Scenariusz wiążący przyłącze (max. moc netto)',
      `${binding.scenario.name} (${binding.netPowerKw.toFixed(2)} kW netto po magazynie)`,
    ],
    ['Instalacja PV', 'Nie uwzględniono w bilansie'],
  ]

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
  /** true = odbiornik wliczany do bilansu w danym scenariuszu (kolejność jak w scenarioList). */
  activeInScenarios: boolean[]
}

export const buildDeviceScenarioMatrix = (
  devices: Device[],
  scenarioList: Scenario[] = defaultScenarios,
): { headers: string[]; rows: DeviceScenarioMatrixRow[] } => {
  const headers = ['Odbiornik', ...scenarioList.map((s) => scenarioShortLabel[s.id])]

  const rows = devices.map((device) => ({
    name: device.name,
    activeInScenarios: scenarioList.map((scenario) =>
      device.scenarios.includes(scenario.id),
    ),
  }))

  return { headers, rows }
}

export const buildDeviceNotesRows = (devices: Device[]): Array<[string, string]> =>
  devices
    .filter((device) => device.notes?.trim())
    .map((device) => [device.name, device.notes!.trim()])

export const buildLlmReviewPrompt = (project: ProjectConfig): string => {
  const storage = project.energyStorage
  const reservePercent = project.reservePercent

  const storageContext = storage.enabled
    ? `W bilansie uwzględniono magazyn energii: tryb „${storageModeLabel[storage.mode]}”, pojemność ${storage.capacityKwh} kWh, ładowanie ${storage.chargePowerKw} kW, rozładowanie ${storage.dischargePowerKw} kW, sprawność ${storage.roundTripEfficiencyPercent}%.`
    : 'W bilansie nie uwzględniono magazynu energii (BESS).'

  const point1 = storage.enabled
    ? `1. ANALIZA SKONFIGUROWANEGO MAGAZYNU ENERGII (PEAK SHAVING):
Oceń ryzyko awarii lub wyczerpania magazynu, czas trwania szczytowego poboru mocy przez pompy ciepła (COP przy mrozach) oraz adekwatność pojemności i mocy ładowania/rozładowania. Czy redukcja szczytu w bilansie jest formalnie i technicznie obronna wobec Enea Operator?

2. CZY MAGAZYN ENERGII MA SENS W TYM OBIEKCIE:
Oceń, czy dla obiektu handlowego (8:00–16:00, profil zimowy z pompami ciepła, technologia magazynowa) taka inwestycja w BESS jest uzasadniona — także w porównaniu z samym zwiększeniem mocy przyłącza.`
    : `1. CZY MAGAZYN ENERGII MA SENS W TYM OBIEKCIE:
W bilansie nie ma BESS. Oceń, czy dla obiektu handlowego (8:00–16:00, pompy ciepła, technologia) warto rozważyć magazyn energii (np. peak shaving) — jakie parametry byłyby sensowne i czy to realnie obniży wymaganą moc przyłącza wobec Enea.`

  const point2Num = storage.enabled ? '3' : '2'
  const point3Num = storage.enabled ? '4' : '3'
  const point4Num = storage.enabled ? '5' : '4'
  const point5Num = storage.enabled ? '6' : '5'

  return `Jesteś doświadczonym audytorem energetycznym, inżynierem elektrykiem i ekspertem ds. procedur przyłączeniowych do sieci dystrybucyjnej w Polsce (ze szczególnym uwzględnieniem standardów Enea Operator).

Przeanalizuj załączony raport bilansu mocy dla obiektu firmy Mikran w Wysogotowie (ul. Zbożowa). Dokument ma służyć jako podstawa do określenia optymalnej mocy przyłączeniowej we wniosku do Enei.

KONTEKST OBIEKTU (istotny dla oceny bilansu):
- Obiekt handlowy (magazynowo-handlowy z częścią biurową i zapleczem technicznym).
- Godziny pracy obiektu: 8:00–16:00 — poza tym przedziałem zakładaj ograniczoną aktywność odbiorników biurowych, socjalnych i technologicznych; uwzględnij to przy ocenie współczynników jednoczesności (kd), wykorzystania (kw) oraz scenariusza „Praca normalna”.
- ${storageContext}

Dokonaj krytycznej oceny inżynierskiej według następujących punktów:

${point1}

${point2Num}. POPRAWNOŚĆ ZAŁOŻEŃ I LOGIKI BILANSU:
Zweryfikuj poprawność dobranych współczynników jednoczesności (kd) i wykorzystania (kw) dla kluczowych stref (Biuro vs Magazyn). Czy przypisanie odbiorników do stref jest czyste i bezbłędne? Czy relacja między mocą termiczną a poborem mocy elektrycznej HVAC w skrajnych temperaturach zimowych została poprawnie skalkulowana? Czy rozróżnienie scenariuszy „Praca normalna” i „Zima” jest logiczne?

${point3Num}. BRAKI FORMALNE I TECHNICZNE POD WNIOSEK DO ENEA OPERATOR:
Czego brakuje w tym bilansie, co jest obligatoryjne lub wysoce pożądane we wniosku o warunki przyłączenia w grupie przyłączeniowej właściwej dla tej mocy? (Oceń: zapotrzebowanie na moc bierną indukowaną/pojemnościową, spodziewany współczynnik tg phi, prądy rozruchowe urządzeń HVAC i technologii, asymetrię obciążeń fazowych oraz wymagania dotyczące nieliniowości odbiorników/wyższych harmonicznych).

${point4Num}. REKOMENDACJA KOŃCOWA (MOC UMOWNA):
Wskaż jednoznaczną, bezpieczną inżyniersko wartość mocy przyłączeniowej (w kW), o jaką inwestor powinien wystąpić do Enei, uwzględniając ${reservePercent}% rezerwę projektową, profil pracy biura oraz technologię maszynową (frezarki/druk 3D).

${point5Num}. INTEGRACJA Z INSTALACJĄ FOTOWOLTAICZNĄ (PV):
Jak dodanie instalacji PV wpłynęłoby na bilans mocy przyłączeniowej w relacji z Eneą? Oceń, czy moc przyłącza powinna uwzględniać maksymalną moc generowaną przez falownik PV (w kontekście statusu prosumenta lub autokonsumpcji).

Odpowiedz strukturalnie po polsku. Każdą uwagę poprzyj konkretną liczbą, tabelą lub scenariuszem (Praca normalna, Zima, Lato, Tryb rezerwowy) z załączonego dokumentu. Kategorycznie rozdziel usterki krytyczne (błędy w sztuce, ryzyko awarii zasilania) od sugestii optymizacyjnych.
`
}
