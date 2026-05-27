import type { Device, DeviceCalculation, DeviceCategoryId, GroupedBalanceRow } from './types'

export type ReactivePowerKind = 'inductive' | 'capacitive'

/** Domyślny charakter mocy biernej wg kategorii (szacunek do bilansu przyłącza). */
export const getDefaultReactivePowerKind = (categoryId: DeviceCategoryId): ReactivePowerKind => {
  switch (categoryId) {
    case 'lighting':
    case 'serverRoom':
    case 'sockets':
      return 'capacitive'
    default:
      return 'inductive'
  }
}

export const resolveReactivePowerKind = (device: Device): ReactivePowerKind =>
  device.reactivePowerKind ?? getDefaultReactivePowerKind(device.categoryId)

export const calculateReactivePowerFromActivePower = (
  activePowerKw: number,
  cosPhi: number,
  kind: ReactivePowerKind,
): { inductiveKvar: number; capacitiveKvar: number } => {
  if (activePowerKw <= 0) {
    return { inductiveKvar: 0, capacitiveKvar: 0 }
  }

  const cos = Math.min(Math.max(cosPhi, 0.01), 1)
  const reactiveKvar = activePowerKw * Math.tan(Math.acos(cos))

  if (kind === 'capacitive') {
    return { inductiveKvar: 0, capacitiveKvar: reactiveKvar }
  }

  return { inductiveKvar: reactiveKvar, capacitiveKvar: 0 }
}

export const calculateDeviceReactivePower = (
  device: Device,
  activePowerKw: number,
): { inductiveKvar: number; capacitiveKvar: number } =>
  calculateReactivePowerFromActivePower(
    activePowerKw,
    device.cosPhi,
    resolveReactivePowerKind(device),
  )

export interface ReactivePowerTotals {
  inductiveKvar: number
  capacitiveKvar: number
}

export interface PowerFactorSummary {
  apparentPowerKva: number
  powerFactorCos: number
  powerFactorTan: number
  /** Q_ind / P — warunek Enea Operator (pobór indukcyjny). */
  inductiveTanPhi: number
}

export const sumReactivePowerTotals = (
  items: Array<{ inductiveKvar: number; capacitiveKvar: number }>,
): ReactivePowerTotals =>
  items.reduce(
    (acc, item) => ({
      inductiveKvar: acc.inductiveKvar + item.inductiveKvar,
      capacitiveKvar: acc.capacitiveKvar + item.capacitiveKvar,
    }),
    { inductiveKvar: 0, capacitiveKvar: 0 },
  )

export const calculatePowerFactorSummary = (
  activePowerKw: number,
  reactive: ReactivePowerTotals,
): PowerFactorSummary => {
  if (activePowerKw <= 0) {
    return {
      apparentPowerKva: 0,
      powerFactorCos: 1,
      powerFactorTan: 0,
      inductiveTanPhi: 0,
    }
  }

  const netReactiveKvar = reactive.inductiveKvar - reactive.capacitiveKvar
  const apparentPowerKva = Math.sqrt(activePowerKw ** 2 + netReactiveKvar ** 2)

  return {
    apparentPowerKva,
    powerFactorCos: activePowerKw / apparentPowerKva,
    powerFactorTan: netReactiveKvar / activePowerKw,
    inductiveTanPhi: reactive.inductiveKvar / activePowerKw,
  }
}

/** Limit tan φ dla pobieranej mocy biernej indukcyjnej (Enea Operator — typowy warunek przyłączenia). */
export const ENEA_INDUCTIVE_TAN_PHI_LIMIT = 0.4

export const meetsEneaInductiveTanPhiLimit = (inductiveTanPhi: number) =>
  inductiveTanPhi <= ENEA_INDUCTIVE_TAN_PHI_LIMIT + 1e-6

export const buildReactivePowerByCategoryRows = (
  devices: DeviceCalculation[],
  getCategoryLabel: (categoryId: DeviceCategoryId) => string,
): GroupedBalanceRow[] => {
  const groups = new Map<DeviceCategoryId, DeviceCalculation[]>()

  for (const calculation of devices) {
    const categoryId = calculation.device.categoryId
    groups.set(categoryId, [...(groups.get(categoryId) ?? []), calculation])
  }

  return [...groups.entries()]
    .map(([categoryId, groupedDevices]) => {
      const calculatedPowerKw = groupedDevices.reduce(
        (sum, item) => sum + item.calculatedPowerKw,
        0,
      )
      const reactive = sumReactivePowerTotals(
        groupedDevices.map((item) => ({
          inductiveKvar: item.inductiveKvar,
          capacitiveKvar: item.capacitiveKvar,
        })),
      )
      const powerFactor = calculatePowerFactorSummary(calculatedPowerKw, reactive)

      return {
        id: categoryId,
        label: getCategoryLabel(categoryId),
        installedPowerKw: groupedDevices.reduce((sum, item) => sum + item.installedPowerKw, 0),
        calculatedPowerKw,
        apparentPowerKva: powerFactor.apparentPowerKva,
        inductiveKvar: reactive.inductiveKvar,
        capacitiveKvar: reactive.capacitiveKvar,
      }
    })
    .sort((a, b) => b.calculatedPowerKw - a.calculatedPowerKw)
}
