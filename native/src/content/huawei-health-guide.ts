// Huawei's published iPhone route. These instructions are not connection proof.
// No Huawei interest flag, permission response or Apple-only reading can prove
// that a Huawei watch exported any of these metrics.
export const HUAWEI_HEALTH_GUIDE = {
  title: 'Huawei Health',
  route: 'Huawei watch → Huawei Health → Apple Health → Helfi',
  introduction: 'Use Huawei Health on your iPhone to share activity with Apple Health. Helfi can read Huawei Health’s exported steps, distance and active calories separately from other sources.',
  steps: [
    {
      title: 'Sync your watch first',
      detail: 'Open Huawei Health on your iPhone. Under Devices, check that your watch says Connected and let it finish syncing. If it says Not connected, keep the powered-on watch nearby and follow the app’s Reconnect prompt. Confirm the activity for your chosen day is showing.',
    },
    {
      title: 'Check sharing with Apple Health',
      detail: 'In Huawei Health, open Me, Third-party services, then HealthKit. Review Steps, Move and Walking/Running distance. In Apple Health, open your profile, Apps and Huawei Health to review writing Steps, Walking + Running Distance and Active Energy. You choose what to share.',
    },
    {
      title: 'Check where the readings came from',
      detail: 'In Apple Health, open each activity reading, then Data Sources & Access and Show All Data. Look for Huawei Health records for the same day. In Helfi, choose Huawei Health to read those exported values. You do not need to change Apple’s source order.',
    },
    {
      title: 'Import the day in Helfi',
      detail: 'On the Helfi Dashboard, use Apple Health to review read access. Choose Huawei Health above, then use Import today, or choose an earlier Food date and tap its import button. Automatic updates use the same choice when Helfi opens.',
    },
  ],
  calories: 'Compare Active Energy, not total calories. If Huawei has no Active Energy records for that day in Apple Health, its calorie syncing is not verified. Helfi never estimates missing exercise calories from steps.',
  totals: 'Huawei Health can combine phone and watch activity before sharing it. A Huawei source confirms its app’s exported values, not necessarily watch-only values. Compare the same date and units. A past walk needs a separate dated import.',
  unsupported: 'This route needs Huawei Health on an iPhone. Direct Huawei account syncing on Android is not available in Helfi yet.',
  privacy: 'Opening these instructions does not read your activity, change sharing or connect your watch.',
  sources: [
    { title: 'Huawei Health for iPhone', url: 'https://apps.apple.com/au/app/huawei-health/id1325481372' },
    { title: 'Apple Health data sources', url: 'https://support.apple.com/en-ie/108779' },
  ],
} as const
