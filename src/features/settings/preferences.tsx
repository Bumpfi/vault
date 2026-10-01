import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSettings, saveSettings } from './functions'
import { listStreamers } from '#/features/streamers/functions'
import { SettingRow } from '#/components/setting-row'
import { Switch } from '#/components/ui/switch'
import { THEMES, applyTheme, isTheme } from '#/lib/theme'

type SettingsPatch = Parameters<typeof saveSettings>[0]['data']

const selectClass = 'h-9 rounded-md border bg-background px-2 text-sm'

export function Preferences() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => getSettings() })
  const streamers = useQuery({ queryKey: ['streamers'], queryFn: () => listStreamers() })
  const save = useMutation({
    mutationFn: (patch: SettingsPatch) => saveSettings({ data: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const categories = [
    ...new Set(streamers.data?.flatMap((s) => (s.category ? [s.category] : []))),
  ].sort()

  if (!settings.data) return null
  const { defaultCategory, unwatchedDefault, theme } = settings.data

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Preferences</h2>

      <SettingRow
        title="Default category"
        description="Category filter selected when the dashboard opens."
      >
        <select
          value={defaultCategory ?? ''}
          onChange={(e) => save.mutate({ defaultCategory: e.target.value || null })}
          className={selectClass}
        >
          <option value="">All</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow
        title="Show unwatched by default"
        description="Start the dashboard with the Unwatched filter on."
      >
        <Switch
          checked={unwatchedDefault}
          onCheckedChange={(checked) => save.mutate({ unwatchedDefault: checked })}
        />
      </SettingRow>

      <SettingRow title="Theme" description="Color theme for your account.">
        <select
          value={theme}
          onChange={(e) => {
            const next = e.target.value
            if (!isTheme(next)) return
            applyTheme(next)
            save.mutate({ theme: next })
          }}
          className={selectClass}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </SettingRow>
    </section>
  )
}
