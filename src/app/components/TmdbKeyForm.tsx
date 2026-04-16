import { type ReactElement, type ReactNode } from 'react'

import { Input } from '@/components/ui/input'

interface TmdbKeyFormProps {
  description?: ReactNode
  id?: string
  label?: ReactNode
  onChange: (apiKey: string) => void
  placeholder?: string
  value: string
}

export function TmdbKeyForm({
  description,
  id,
  label,
  onChange,
  placeholder,
  value
}: TmdbKeyFormProps): ReactElement {
  return (
    <div className="grid gap-2">
      {label ? (
        <label
          className="text-sm font-medium"
          htmlFor={id}
        >
          {label}
        </label>
      ) : null}

      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}

      <Input
        autoComplete="off"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? 'TMDB API key'}
        spellCheck={false}
        type="text"
        value={value}
      />
    </div>
  )
}
