import { useCallback, useMemo, useState } from 'react'
import type { TargetDescriptor, TargetKey } from './cdp-api.ts'

export interface TargetStore {
  targets: TargetDescriptor[]
  selectedKey?: TargetKey
  selected?: TargetDescriptor
  replace(targets: TargetDescriptor[]): void
  remove(key: TargetKey): void
  select(key: TargetKey): void
}

export function useTargetStore(initialKey?: TargetKey): TargetStore {
  const [targets, setTargets] = useState<TargetDescriptor[]>([])
  const [selectedKey, setSelectedKey] = useState<TargetKey | undefined>(initialKey)

  const replace = useCallback((next: TargetDescriptor[]) => {
    const live = next.filter(target => target.lifecycle !== 'closed')
    setTargets(live)
    setSelectedKey(current => current && live.some(target => target.key === current) ? current : live[0]?.key)
  }, [])
  const remove = useCallback((key: TargetKey) => {
    setTargets(current => current.filter(target => target.key !== key))
    setSelectedKey(current => current === key ? undefined : current)
  }, [])
  const select = useCallback((key: TargetKey) => setSelectedKey(key), [])
  const selected = useMemo(() => targets.find(target => target.key === selectedKey), [targets, selectedKey])

  return { targets, selectedKey, selected, replace, remove, select }
}
