import { handleRootRedirect, handleWhatsappRedirect } from '../controllers/whatsappRedirectController.mjs'

export default () => {
  return [
    {
      method: 'GET',
      url: '/',
      handler: handleRootRedirect
    },
    {
      method: 'GET',
      url: '/get',
      handler: handleWhatsappRedirect
    },
    {
      method: 'GET',
      url: '/:key*',
      handler: handleWhatsappRedirect
    }
  ]
}
