import LegacyApp from './App'
import { StarDustApp } from './stardust'

export default function AppEntry() {
  const useStarDust = import.meta.env.VITE_USE_STARDUST_UI === '1'
  return useStarDust ? <StarDustApp /> : <LegacyApp />
}
