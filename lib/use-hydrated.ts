import { useSyncExternalStore } from 'react'

// Whether React is running this page in the browser yet. False in the server's HTML and in the
// first render in the browser, which has to match it; true from then on, and straight away for a
// control added later. Until then a tap does nothing, and on a phone too old for the app's
// JavaScript that's for good, so every button that writes is disabled until this is true.
export function useHydrated(): boolean {
  return useSyncExternalStore(neverChanges, inTheBrowser, onTheServer)
}

const neverChanges = () => () => {}
const inTheBrowser = () => true
const onTheServer = () => false
