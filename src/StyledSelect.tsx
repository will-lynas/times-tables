import { Select } from '@radix-ui/themes'
import { useRef, useState } from 'react'

export interface StyledOption {
  value: string
  label: string
  preset?: boolean
}

interface StyledSelectProps {
  label: string
  value: string | number
  options: readonly StyledOption[]
  onChange: (value: string) => void
  showLabel?: boolean
  sizes?: boolean
  disabled?: boolean
}

export function StyledSelect({ label, value, options, onChange, showLabel = false, sizes = false, disabled = false }: StyledSelectProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const tabDirection = useRef(0)
  const presets = options.filter(option => option.preset)
  const other = options.filter(option => !option.preset)
  const item = (option: StyledOption) => <Select.Item key={option.value} value={option.value} textValue={option.label} data-value={option.value}>
    {option.label}
  </Select.Item>

  return <div className="grid-size styled-select">
    {showLabel && <span aria-hidden="true">{label}</span>}
    <Select.Root value={String(value)} onValueChange={onChange} disabled={disabled} open={open} onOpenChange={setOpen}>
      <Select.Trigger ref={trigger} className="size-picker-trigger filter-trigger" aria-label={label} data-value={value} />
      <Select.Content className={`filter-panel${sizes ? ' filter-panel-sizes' : ''}`} position="popper" align="start" sideOffset={6} aria-label={`${label} options`}
        onKeyDown={event => {
          // Radix handles option navigation; let Tab leave the composite too.
          if (event.key === 'Tab') {
            event.preventDefault()
            tabDirection.current = event.shiftKey ? -1 : 1
            setOpen(false)
          }
        }} onCloseAutoFocus={event => {
          if (!tabDirection.current || !trigger.current) return
          event.preventDefault()
          const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'))
            .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0 && !element.closest('[role="listbox"]'))
          const index = controls.indexOf(trigger.current)
          controls[(index + tabDirection.current + controls.length) % controls.length]?.focus()
          tabDirection.current = 0
        }}>
        {other.filter(option => option.value === 'all').map(item)}
        {presets.length > 0 && <Select.Group className="filter-presets">{presets.map(item)}</Select.Group>}
        {other.some(option => option.value !== 'all') && <Select.Group className="filter-list">{other.filter(option => option.value !== 'all').map(item)}</Select.Group>}
      </Select.Content>
    </Select.Root>
  </div>
}
