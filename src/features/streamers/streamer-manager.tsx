import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  addStreamer,
  disableAllStreamers,
  importFollows,
  listStreamers,
  setStreamerCategory,
  setStreamerEnabled,
} from './functions'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Switch } from '#/components/ui/switch'

export function StreamerManager() {
  const qc = useQueryClient()
  const [login, setLogin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [enabledOnly, setEnabledOnly] = useState(false)

  const streamers = useQuery({ queryKey: ['streamers'], queryFn: () => listStreamers() })
  // The feed depends on which streamers are enabled, so refresh it too.
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['streamers'] })
    void qc.invalidateQueries({ queryKey: ['vods'] })
  }
  const showError = (err: Error) => setMessage(err.message)

  const importMut = useMutation({
    mutationFn: () => importFollows(),
    onSuccess: (r) => {
      setMessage(`Imported ${r.imported} followed channels.`)
      refresh()
    },
    onError: showError,
  })
  const addMut = useMutation({
    mutationFn: (value: string) => addStreamer({ data: value }),
    onSuccess: (r) => {
      setMessage(`Added ${r.added}.`)
      setLogin('')
      refresh()
    },
    onError: showError,
  })
  const enableMut = useMutation({
    mutationFn: (input: { streamerId: number; enabled: boolean }) =>
      setStreamerEnabled({ data: input }),
    onSuccess: refresh,
  })
  const disableAllMut = useMutation({
    mutationFn: () => disableAllStreamers(),
    onSuccess: refresh,
  })
  const categoryMut = useMutation({
    mutationFn: (input: { streamerId: number; category: string | null }) =>
      setStreamerCategory({ data: input }),
    onSuccess: refresh,
  })

  const all = streamers.data ?? []
  const enabledCount = all.filter((s) => s.enabled).length
  const categories = [
    ...new Set(all.flatMap((s) => (s.category ? [s.category] : []))),
  ].sort()
  const query = search.trim().toLowerCase()
  const visible = all.filter(
    (s) =>
      (!enabledOnly || s.enabled) &&
      (!query || s.displayName.toLowerCase().includes(query)),
  )

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Streamers</h2>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>
          {importMut.isPending ? 'Importing…' : 'Import my follows'}
        </Button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (login.trim()) addMut.mutate(login)
          }}
        >
          <Input
            placeholder="Add by Twitch login, e.g. xqc"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={addMut.isPending}>
            Add
          </Button>
        </form>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search streamers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant={enabledOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setEnabledOnly((v) => !v)}
        >
          Enabled only
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => disableAllMut.mutate()}
          disabled={disableAllMut.isPending || enabledCount === 0}
        >
          Disable all
        </Button>
        <span className="ml-auto font-mono text-xs text-primary">
          {enabledCount} / {all.length}{' '}
          <span className="text-muted-foreground">in feed</span>
        </span>
      </div>

      <datalist id="streamer-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="space-y-2">
        {streamers.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {all.length === 0
              ? 'No streamers yet. Import your follows to get started.'
              : 'No matches.'}
          </p>
        ) : (
          visible.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {s.profileImageUrl ? (
                  <img
                    src={s.profileImageUrl}
                    alt=""
                    className="size-8 shrink-0 rounded-full"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.broadcasterType || 'standard'}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s.enabled ? (
                  <Input
                    // Remount when the saved value changes so the field resets.
                    key={s.category ?? ''}
                    list="streamer-categories"
                    defaultValue={s.category ?? ''}
                    placeholder="Category"
                    className="h-8 w-28"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                    onBlur={(e) => {
                      const value = e.target.value.trim()
                      if (value !== (s.category ?? '')) {
                        categoryMut.mutate({ streamerId: s.id, category: value || null })
                      }
                    }}
                  />
                ) : null}
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(enabled) =>
                    enableMut.mutate({ streamerId: s.id, enabled })
                  }
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
