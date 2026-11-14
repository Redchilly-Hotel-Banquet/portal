const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const money = config =>
  config?.discountType === 'price' ? `₹${Number(config.discountValue || 0).toLocaleString('en-IN')} off` : `${Number(config?.discountValue || 0)}% off`

/** What the customer sees after opening a reward QR: the reward, or a plain reason it cannot be used. */
export function renderRewardPage({ data, error, statusCode, staffOnly = false }) {
  let heading, lead, details = '', tone = 'ok'
  if (data) {
    const customer = data.customer || {}
    const visits = data.rewardConfig?.mode === 'visits'
    heading = visits && !customer.unlocked ? 'Visit counted!' : 'Your reward is ready'
    lead = customer.customerName ? `Thank you, ${escape(customer.customerName)}.` : 'Thank you for ordering with us.'
    const reward = customer.reward || data.reward
    const rows = []
    if (reward) rows.push(['Reward', reward])
    if (!visits && data.rewardConfig) rows.push(['Discount', money(data.rewardConfig)])
    if (visits) rows.push(['Visits', customer.unlocked ? 'Target reached' : `${customer.visitCount} of ${customer.visitTarget}`])
    rows.push(['Order', data.orderId])
    details = `
      ${reward ? `<p class="reward">${escape(reward)}</p>` : ''}
      <dl>${rows.map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl>
      <p class="note">${customer.unlocked || !visits ? 'Show this screen to our staff to claim it. This QR has now been used.' : 'Keep ordering to unlock your reward.'}</p>`
  } else if (staffOnly) {
    tone = 'ok'
    heading = 'Show this QR to our staff'
    lead = 'Your reward is ready. Our staff will scan this QR to give it to you.'
    details = '<p class="note">Nothing has been used yet. Please keep this QR safe until you are at the counter.</p>'
  } else {
    tone = 'bad'
    const expired = statusCode === 410
    const used = statusCode === 404 || statusCode === 409
    heading = expired ? 'This QR has expired' : used ? 'This QR cannot be used' : 'Something went wrong'
    lead = expired ? 'The time to use this reward has passed.' : used ? 'It may already have been used, or it was not found.' : escape(error || 'Please try again in a moment.')
    details = '<p class="note">If you think this is a mistake, please speak to our staff.</p>'
  }
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Red Chilly reward</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 20px; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #201511; background: linear-gradient(135deg, rgba(159,17,24,.08), transparent 35%), linear-gradient(180deg, #fffdf8 0%, #f7ead8 100%); }
      main { width: 100%; max-width: 420px; background: #fff9ef; border: 1px solid #efdcc6; border-radius: 20px; padding: 28px 24px; text-align: center; box-shadow: 0 18px 50px rgba(93,7,12,.12); }
      .brand { margin: 0; font-size: 14px; letter-spacing: .2em; text-transform: uppercase; color: #9f1118; font-weight: 700; }
      .badge { width: 64px; height: 64px; margin: 18px auto 6px; border-radius: 50%; display: grid; place-items: center; font-size: 32px; color: #fff; background: ${tone === 'ok' ? 'linear-gradient(145deg,#5d070c,#b61922)' : '#8a7a72'}; }
      h1 { margin: 8px 0 6px; font-size: 26px; line-height: 1.2; color: #5d070c; }
      .lead { margin: 0 0 16px; color: #745d54; }
      .reward { margin: 10px 0 16px; padding: 14px; border-radius: 14px; background: #fff; border: 1px dashed #b61922; font-size: 20px; font-weight: 700; color: #5d070c; }
      dl { margin: 0 0 14px; text-align: left; }
      dl div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 2px; border-bottom: 1px solid #efdcc6; }
      dt { color: #745d54; } dd { margin: 0; font-weight: 600; text-align: right; word-break: break-word; }
      .note { margin: 14px 0 0; font-size: 14px; color: #745d54; }
    </style>
  </head>
  <body>
    <main>
      <p class="brand">Red Chilly</p>
      <div class="badge" aria-hidden="true">${tone === 'ok' ? '✓' : '!'}</div>
      <h1>${escape(heading)}</h1>
      <p class="lead">${lead}</p>
      ${details}
    </main>
  </body>
</html>`
}
