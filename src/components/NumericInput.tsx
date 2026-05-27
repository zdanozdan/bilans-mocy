import { useState } from 'react'

interface NumericInputProps {
  value: number
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  onValueChange: (value: number) => void
}

const isPartialNumber = (value: string) => value === '' || /^\d*([.,]\d*)?$/.test(value)

const parseNumber = (value: string, min = 0, max?: number) => {
  const normalized = value.replace(',', '.').trim()

  if (normalized === '' || normalized === '.' || normalized === ',') {
    return min
  }

  const parsed = Number.parseFloat(normalized)

  if (!Number.isFinite(parsed)) {
    return null
  }

  const clamped = Math.max(min, parsed)
  return max === undefined ? clamped : Math.min(max, clamped)
}

export function NumericInput({
  value,
  disabled = false,
  min = 0,
  max,
  step,
  onValueChange,
}: NumericInputProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const displayValue = draft ?? String(value)

  const commitDraft = (rawDraft: string) => {
    const parsed = parseNumber(rawDraft, min, max)

    if (parsed === null) {
      setDraft(String(value))
      return
    }

    onValueChange(parsed)
    setDraft(null)
  }

  return (
    <input
      disabled={disabled}
      inputMode="decimal"
      step={step}
      type="text"
      value={displayValue}
      onBlur={(event) => commitDraft(event.target.value)}
      onChange={(event) => {
        const nextDraft = event.target.value

        if (!isPartialNumber(nextDraft)) {
          return
        }

        setDraft(nextDraft)

        const parsed = parseNumber(nextDraft, min, max)

        if (parsed !== null && !nextDraft.endsWith('.') && !nextDraft.endsWith(',')) {
          onValueChange(parsed)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
      }}
    />
  )
}
