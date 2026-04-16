import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useEffect, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  useSaveScanSchedule,
  useScanSchedule,
  type ScanSchedule
} from '../hooks/useSettings'
import { SettingsLayout } from './Settings'

dayjs.extend(relativeTime)

const scheduleLabels: Record<ScanSchedule, string> = {
  off: 'Off',
  '6h': 'Every 6 hours',
  '12h': 'Every 12 hours',
  '24h': 'Daily'
}

export function SettingsScanSchedulePage(): ReactElement {
  const { data, isLoading } = useScanSchedule()
  const save = useSaveScanSchedule()

  const [schedule, setSchedule] = useState<ScanSchedule>('off')
  const [initialized, setInitialized] = useState(false)

  useEffect(
    function hydrateFromServer() {
      if (!initialized && data) {
        setSchedule(data.schedule)
        setInitialized(true)
      }
    },
    [data, initialized]
  )

  async function handleSave() {
    try {
      await save.mutateAsync(schedule)
      toast.success('Scan schedule saved.')
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't save scan schedule."
      )
    }
  }

  if (isLoading) {
    return (
      <SettingsLayout>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout>
      <div>
        <h2 className="text-xl font-semibold">Scan schedule</h2>
        <p className="text-sm text-muted-foreground">
          How often Jukebox should automatically scan your libraries for new
          files.
        </p>
      </div>

      <div className="mt-6 grid max-w-md gap-4">
        <div className="grid gap-2">
          <Label htmlFor="scan-schedule">Frequency</Label>
          <Select
            onValueChange={(value) => setSchedule(value as ScanSchedule)}
            value={schedule}
          >
            <SelectTrigger
              className="w-full"
              id="scan-schedule"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(scheduleLabels) as ScanSchedule[]).map((value) => (
                <SelectItem
                  key={value}
                  value={value}
                >
                  {scheduleLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          {schedule === 'off'
            ? 'Automatic scans are off. Trigger scans manually from the Scan page.'
            : data?.nextRunAt
              ? `Next scheduled scan ${dayjs(data.nextRunAt).fromNow()}.`
              : 'Schedule will start on the next server boot.'}
        </p>

        <div>
          <Button
            disabled={save.isPending}
            onClick={() => void handleSave()}
            type="button"
          >
            {save.isPending ? 'Saving…' : 'Save schedule'}
          </Button>
        </div>
      </div>
    </SettingsLayout>
  )
}
