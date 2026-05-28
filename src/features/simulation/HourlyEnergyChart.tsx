import type { ScenarioEnergySimulation } from '../../domain/types'

const phaseLabels = {
  preheat: 'Noc + dogrzewanie',
  work: 'Praca',
  setback: 'Obniżka',
} as const

const phaseColors = {
  preheat: '#dbeafe',
  work: '#dcfce7',
  setback: '#fef3c7',
} as const

export function HourlyEnergyChart({
  simulation,
  showHeating,
  showCooling,
  showIndoorTempLine = false,
  className = '',
}: {
  simulation: ScenarioEnergySimulation
  showHeating: boolean
  showCooling: boolean
  showIndoorTempLine?: boolean
  className?: string
}) {
  const chartWidth = 720
  const chartHeight = 260
  const margin = { top: 16, right: 48, bottom: 36, left: 44 }
  const plotWidth = chartWidth - margin.left - margin.right
  const plotHeight = chartHeight - margin.top - margin.bottom
  const barWidth = plotWidth / 24 - 2

  const maxPowerKw = Math.max(...simulation.hourly.map((point) => point.electricalTotalKw), 1)
  const tempSamples = simulation.hourly.flatMap((point) => [
    point.externalTempC,
    point.setpointC,
    ...(showIndoorTempLine ? [point.indoorTempC] : []),
  ])
  const tempMin = Math.min(simulation.externalTempC, ...tempSamples)
  const tempMax = Math.max(simulation.externalTempC, ...tempSamples)
  const tempSpan = Math.max(tempMax - tempMin, 1)

  const scaleTemp = (tempC: number) =>
    plotHeight - ((tempC - tempMin) / tempSpan) * plotHeight

  const linePath = (getTemp: (hour: (typeof simulation.hourly)[0]) => number) =>
    simulation.hourly
      .map((point, index) => {
        const x = margin.left + index * (plotWidth / 24) + barWidth / 2 + 1
        const y = margin.top + scaleTemp(getTemp(point))
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')

  const renderBarStack = (point: (typeof simulation.hourly)[0], index: number) => {
    const x = margin.left + index * (plotWidth / 24) + 1
    const floorY = margin.top + plotHeight
    const baseH = (point.electricalBaseKw / maxPowerKw) * plotHeight
    const heatH = showHeating ? (point.electricalHeatingKw / maxPowerKw) * plotHeight : 0
    const coolH = showCooling ? (point.electricalCoolingKw / maxPowerKw) * plotHeight : 0
    const baseY = floorY - baseH
    const heatY = floorY - baseH - heatH
    const coolY = floorY - baseH - heatH - coolH

    return (
      <g key={point.hour}>
        <rect className="sim-bar-base" height={baseH} width={barWidth} x={x} y={baseY} />
        {showHeating && point.electricalHeatingKw > 0.01 ? (
          <rect className="sim-bar-heat" height={heatH} width={barWidth} x={x} y={heatY} />
        ) : null}
        {showCooling && point.electricalCoolingKw > 0.01 ? (
          <rect className="sim-bar-cool" height={coolH} width={barWidth} x={x} y={coolY} />
        ) : null}
        <title>
          {[
            `${point.label} · ${phaseLabels[point.phase]}`,
            `P: ${point.electricalTotalKw.toFixed(2)} kW`,
            showHeating ? `ogrz. ${point.electricalHeatingKw.toFixed(2)} kW` : null,
            showCooling ? `chł. ${point.electricalCoolingKw.toFixed(2)} kW` : null,
            `baza ${point.electricalBaseKw.toFixed(2)} kW`,
            `T_zew ${point.externalTempC}°C, T_zad ${point.setpointC.toFixed(1)}°C, T_wewn ${point.indoorTempC.toFixed(1)}°C`,
          ]
            .filter(Boolean)
            .join('\n')}
        </title>
      </g>
    )
  }

  const firstWorkHour = simulation.hourly.find((item) => item.phase === 'work')?.hour ?? 8
  const workHourCount = simulation.hourly.filter((item) => item.phase === 'work').length

  return (
    <div className={`sim-chart-wrap ${className}`.trim()}>
      <svg
        aria-label={`Profil godzinowy mocy — ${simulation.scenarioName}`}
        className="sim-chart"
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <rect
          className="sim-plot-bg"
          height={plotHeight}
          width={plotWidth}
          x={margin.left}
          y={margin.top}
        />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const value = maxPowerKw * tick
          const y = margin.top + plotHeight - value * (plotHeight / maxPowerKw)

          return (
            <g key={tick}>
              <line
                className="sim-grid-line"
                x1={margin.left}
                x2={margin.left + plotWidth}
                y1={y}
                y2={y}
              />
              <text className="sim-axis-label" x={margin.left - 6} y={y + 3} textAnchor="end">
                {value.toFixed(0)}
              </text>
            </g>
          )
        })}
        {simulation.hourly.map((point, index) => {
          if (index % 2 !== 0 && index !== 8 && index !== 16) {
            return null
          }

          const x = margin.left + index * (plotWidth / 24) + barWidth / 2

          return (
            <text
              className="sim-axis-label"
              key={point.hour}
              textAnchor="middle"
              x={x}
              y={chartHeight - 10}
            >
              {point.label}
            </text>
          )
        })}
        <text
          className="sim-axis-title"
          x={14}
          y={margin.top + plotHeight / 2}
          transform={`rotate(-90 14 ${margin.top + plotHeight / 2})`}
        >
          Moc [kW]
        </text>
        <text
          className="sim-axis-title sim-axis-title-right"
          x={chartWidth - 10}
          y={margin.top + plotHeight / 2}
          transform={`rotate(90 ${chartWidth - 10} ${margin.top + plotHeight / 2})`}
        >
          T [°C]
        </text>
        {[0, 0.5, 1].map((tick) => {
          const temp = tempMin + tempSpan * tick
          const y = margin.top + scaleTemp(temp)

          return (
            <text
              className="sim-axis-label sim-axis-label-right"
              key={tick}
              textAnchor="start"
              x={margin.left + plotWidth + 6}
              y={y + 3}
            >
              {temp.toFixed(0)}
            </text>
          )
        })}
        {workHourCount > 0 ? (
          <rect
            className="sim-phase-band sim-phase-band-work"
            height={plotHeight}
            width={(workHourCount / 24) * plotWidth}
            x={margin.left + firstWorkHour * (plotWidth / 24)}
            y={margin.top}
          />
        ) : null}
        {simulation.hourly.map(renderBarStack)}
        <path className="sim-line-temp" d={linePath((p) => p.externalTempC)} />
        <path className="sim-line-setpoint" d={linePath((p) => p.setpointC)} />
        {showIndoorTempLine ? (
          <path className="sim-line-indoor" d={linePath((p) => p.indoorTempC)} />
        ) : null}
      </svg>
      <div className="sim-legend">
        <span>
          <i className="sim-swatch sim-swatch-base" /> Pozostałe odbiorniki
        </span>
        {showHeating ? (
          <span>
            <i className="sim-swatch sim-swatch-heat" /> Pompy ciepła (el.)
          </span>
        ) : null}
        {showCooling ? (
          <span>
            <i className="sim-swatch sim-swatch-cool" /> Klimatyzacja (el.)
          </span>
        ) : null}
        <span>
          <i className="sim-swatch sim-swatch-temp" /> T_zew
        </span>
        <span>
          <i className="sim-swatch sim-swatch-setpoint" /> T_zadana
        </span>
        {showIndoorTempLine ? (
          <span>
            <i className="sim-swatch sim-swatch-indoor" /> T_wewn (model)
          </span>
        ) : null}
        <span>
          <i className="sim-swatch sim-swatch-phase" style={{ background: phaseColors.preheat }} />{' '}
          {phaseLabels.preheat}
        </span>
        <span>
          <i className="sim-swatch sim-swatch-phase" style={{ background: phaseColors.work }} />{' '}
          {phaseLabels.work}
        </span>
        <span>
          <i className="sim-swatch sim-swatch-phase" style={{ background: phaseColors.setback }} />{' '}
          {phaseLabels.setback}
        </span>
      </div>
    </div>
  )
}
