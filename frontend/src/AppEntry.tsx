import LegacyApp from './App'
import { StarDustApp } from './stardust'
import { sunstoneStarDustExtensions } from './sunstoneStarDustExtensions'

export default function AppEntry() {
  const useStarDust = import.meta.env.VITE_USE_STARDUST_UI === '1'
  return useStarDust ? (
    <StarDustApp
      branding={{
        title: 'SunStone',
        subtitle: 'built from StarDust',
      }}
      materialEditor={{
        showExtraJson: false,
      }}
      extensions={sunstoneStarDustExtensions}
    />
  ) : (
    <LegacyApp />
  )
}
