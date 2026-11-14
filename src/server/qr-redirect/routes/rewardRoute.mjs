import {
  cleanupRewards,
  createRewardQr,
  getRewardCustomer,
  getRewardOptions,
  getRewardStatus,
  verifyRewardQr
} from '../controllers/rewardController.mjs'

export default () => {
  return [
    {
      method: 'GET',
      url: '/reward/create',
      handler: createRewardQr
    },
    {
      method: 'GET',
      url: '/reward/verify',
      handler: verifyRewardQr
    },
    {
      method: 'GET',
      url: '/reward/status',
      handler: getRewardStatus
    },
    {
      method: 'GET',
      url: '/reward/customer',
      handler: getRewardCustomer
    },
    {
      method: 'GET',
      url: '/reward/options',
      handler: getRewardOptions
    },
    {
      method: 'GET',
      url: '/reward/cleanup',
      handler: cleanupRewards
    }
  ]
}
