import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Popover } from '@radix-ui/themes'

interface GridSizePickerProps {
  value: number
  disabled: boolean
  onChange: (size: number) => void
}

export function GridSizePicker({ value, disabled, onChange }: GridSizePickerProps) {
  const [open, setOpen] = useState(false)
  const valueId = useId()
  const selected = useRef<HTMLButtonElement>(null)
  const options = useRef<(HTMLButtonElement | null)[]>([])

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = {
      ArrowLeft: index % 3 > 0 ? index - 1 : index,
      ArrowRight: index % 3 < 2 ? Math.min(index + 1, 10) : index,
      ArrowUp: Math.max(index - 3, 0),
      ArrowDown: Math.min(index + 3, 10),
      Home: 0,
      End: 10,
    }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      options.current[target]?.focus()
    }
  }

  return <div className="size-picker">
    <span>Grid size</span>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <button type="button" className="size-picker-trigger" disabled={disabled} aria-label="Grid size" aria-describedby={valueId}>
          <span id={valueId}>{value} × {value}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Content className="size-picker-panel" aria-label="Grid size options" align="start" sideOffset={6}
        onOpenAutoFocus={event => {
          event.preventDefault()
          selected.current?.focus()
        }}>
        <div className="size-picker-options">
          {Array.from({ length: 11 }, (_, index) => index + 2).map((size, index) => <button
            key={size} type="button" className="size-picker-option" aria-pressed={size === value}
            ref={element => {
              options.current[index] = element
              if (size === value) selected.current = element
            }}
            onKeyDown={event => navigate(event, index)}
            onClick={() => {
              onChange(size)
              setOpen(false)
            }}>
            {size} × {size}
          </button>)}
        </div>
      </Popover.Content>
    </Popover.Root>
  </div>
}
