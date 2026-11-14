import { handleWhatsappRedirectUpdate } from '../controllers/whatsappRedirectUpdateController.mjs'

export default () => {
  return [
    {
      method: 'GET',
      url: '/update',
      handler: handleWhatsappRedirectUpdate
    }
  ]
}
