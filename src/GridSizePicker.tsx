import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Popover } from '@radix-ui/themes'
import { FACTOR_OPTIONS, canonicalFactors, factorLabel } from './factors'

interface GridSizePickerProps {
  value: number
  disabled: boolean
  custom: boolean
  factors: number[]
  onChange: (size: number) => void
  onCustomChange: (factors: number[]) => void
}

export function GridSizePicker({ value, disabled, custom, factors, onChange, onCustomChange }: GridSizePickerProps) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(custom)
  const valueId = useId()
  const options = useRef<(HTMLButtonElement | null)[]>([])
  const toggles = useRef<(HTMLButtonElement | null)[]>([])
  const customButton = useRef<HTMLButtonElement>(null)

  // Move focus when changing panel views, not when a number is toggled.
  useLayoutEffect(() => {
    if (!open) return
    if (showCustom) toggles.current[(factors[0] ?? 1) - 1]?.focus()
    else options.current[value - 2]?.focus()
  }, [showCustom, open])

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number, columns: number, buttons: (HTMLButtonElement | null)[]) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = {
      ArrowLeft: index % columns > 0 ? index - 1 : index,
      ArrowRight: index % columns < columns - 1 ? Math.min(index + 1, count - 1) : index,
      ArrowUp: Math.max(index - columns, 0),
      ArrowDown: Math.min(index + columns, count - 1),
      Home: 0,
      End: count - 1,
    }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      buttons[target]?.focus()
    }
  }

  return <div className="size-picker">
    <span>Grid size</span>
    <Popover.Root open={open} onOpenChange={next => { if (next) setShowCustom(custom); setOpen(next) }}>
      <Popover.Trigger>
        <button type="button" className="size-picker-trigger" disabled={disabled} aria-label="Grid size" aria-describedby={valueId}>
          <span id={valueId}>{custom ? 'Custom' : `${value} × ${value}`}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Content className="size-picker-panel" aria-label="Grid size options" align="start" sideOffset={6}
        onOpenAutoFocus={event => {
          event.preventDefault()
          if (custom) (toggles.current[(factors[0] ?? 1) - 1] ?? customButton.current)?.focus()
          else options.current[value - 2]?.focus()
        }}>
        {!showCustom ? <div className="size-picker-options">
          {Array.from({ length: 11 }, (_, index) => index + 2).map((size, index) => <button
            key={size} type="button" className="size-picker-option" aria-pressed={!custom && size === value}
            ref={element => { options.current[index] = element }}
            onKeyDown={event => navigate(event, index, 12, 3, options.current)}
            onClick={() => { onChange(size); setOpen(false) }}>
            {size} × {size}
          </button>)}
          <button type="button" className="size-picker-option" aria-pressed={custom} ref={element => { options.current[11] = element }} onKeyDown={event => navigate(event, 11, 12, 3, options.current)} onClick={() => { onCustomChange(factors); setShowCustom(true) }}>Custom</button>
        </div> : <>
          <div className="factor-picker-heading">
            <button type="button" className="factor-picker-back" onClick={() => setShowCustom(false)}>Presets</button>
            <button ref={customButton} type="button" className="factor-picker-title" aria-pressed={custom} onClick={() => onCustomChange(factors)}>Custom</button>
          </div>
          <div className="factor-picker-options" role="group" aria-label="Factors">
            {FACTOR_OPTIONS.map((factor, index) => <button key={factor} type="button" className="size-picker-option"
              aria-pressed={factors.includes(factor)} ref={element => { toggles.current[index] = element }}
              onKeyDown={event => navigate(event, index, 20, 5, toggles.current)}
              onClick={() => onCustomChange(canonicalFactors(factors.includes(factor) ? factors.filter(value => value !== factor) : [...factors, factor], true))}>
              {factor}
            </button>)}
          </div>
          <button type="button" className="factor-picker-done" onClick={() => setOpen(false)}>Done</button>
        </>}
      </Popover.Content>
    </Popover.Root>
    {custom && <span className="selected-factors" aria-label="Selected factors">{factorLabel(factors)}</span>}
  </div>
}
