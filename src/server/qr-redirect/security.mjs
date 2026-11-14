export async function requireQrAdmin(request) {
  const { authorizeQrAdmin } = await import('../qr-admin')
  const response = await authorizeQrAdmin(request.clone())
  return response.ok ? null : response
}
