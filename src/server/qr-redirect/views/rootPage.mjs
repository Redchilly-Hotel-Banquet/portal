export function renderRootPage({ zomatoUrl, swiggyUrl }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Red Chilly - Order & Rewards</title>
    <meta name="description" content="Order from Red Chilly on Zomato or Swiggy and unlock special QR rewards.">
    <style>
      * { box-sizing: border-box; }
      :root {
        --red: #9f1118;
        --red-dark: #5d070c;
        --orange: #f47a1f;
        --ink: #201511;
        --muted: #745d54;
        --paper: #fff9ef;
        --line: #efdcc6;
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          linear-gradient(135deg, rgba(159, 17, 24, 0.08), transparent 35%),
          linear-gradient(180deg, #fffdf8 0%, #f7ead8 100%);
      }
      a { color: inherit; text-decoration: none; }
      .shell {
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
        padding: 28px 0 42px;
      }
      .nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 32px;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 850;
        font-size: 20px;
      }
      .mark {
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        color: white;
        background: linear-gradient(145deg, var(--red), var(--orange));
        box-shadow: 0 12px 28px rgba(159, 17, 24, 0.2);
      }
      .nav-pill {
        padding: 10px 14px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--red-dark);
        background: rgba(255, 255, 255, 0.74);
        font-size: 14px;
        font-weight: 750;
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
        align-items: center;
        gap: 42px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: 1px solid rgba(159, 17, 24, 0.16);
        border-radius: 999px;
        color: var(--red-dark);
        background: rgba(255, 255, 255, 0.75);
        font-size: 13px;
        font-weight: 800;
      }
      h1 {
        margin: 18px 0 14px;
        max-width: 680px;
        font-size: clamp(40px, 7vw, 78px);
        line-height: 0.95;
        letter-spacing: 0;
      }
      .lead {
        max-width: 590px;
        margin: 0;
        color: var(--muted);
        font-size: clamp(17px, 2.4vw, 21px);
        line-height: 1.55;
      }
      .actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        max-width: 520px;
        margin-top: 28px;
      }
      .btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 58px;
        padding: 16px;
        border-radius: 8px;
        color: white;
        font-weight: 850;
        box-shadow: 0 16px 32px rgba(52, 20, 12, 0.14);
      }
      .btn.zomato { background: #e23744; }
      .btn.swiggy { background: #fc8019; }
      .steps {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 34px;
        max-width: 640px;
      }
      .step {
        min-height: 112px;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.7);
      }
      .step strong {
        display: block;
        margin-bottom: 6px;
        color: var(--red-dark);
        font-size: 14px;
      }
      .step span {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }
      .visual {
        display: grid;
        justify-items: center;
      }
      .phone {
        width: min(100%, 360px);
        min-height: 640px;
        padding: 18px;
        border: 10px solid #241611;
        border-radius: 34px;
        background: #fffdf8;
        box-shadow: 0 30px 80px rgba(60, 22, 12, 0.24);
      }
      .screen {
        display: grid;
        gap: 14px;
      }
      .food {
        height: 190px;
        border-radius: 24px;
        background:
          radial-gradient(circle at 34% 44%, #f7c75d 0 18px, transparent 19px),
          radial-gradient(circle at 62% 42%, #d7202b 0 14px, transparent 15px),
          radial-gradient(circle at 50% 56%, #f47a1f 0 46px, transparent 47px),
          linear-gradient(145deg, #5d070c, #b61922);
        position: relative;
        overflow: hidden;
      }
      .food:after {
        content: "";
        position: absolute;
        inset: 28px;
        border: 3px solid rgba(255, 249, 239, 0.78);
        border-radius: 999px;
      }
      .reward {
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--paper);
      }
      .reward h2 {
        margin: 0 0 8px;
        font-size: 22px;
        line-height: 1.2;
      }
      .reward p {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
      }
      .stamps {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 8px;
        margin-top: 16px;
      }
      .stamp {
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        border-radius: 50%;
        color: white;
        background: linear-gradient(145deg, var(--red), var(--orange));
        font-size: 17px;
        font-weight: 900;
      }
      .stamp.empty {
        color: #c9ac93;
        background: #f2e2d0;
      }
      .offer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px;
        border-radius: 8px;
        color: white;
        background: linear-gradient(145deg, var(--red-dark), var(--red));
      }
      .offer strong { display: block; font-size: 15px; }
      .offer span { display: block; margin-top: 2px; font-size: 12px; opacity: 0.82; }
      .offer b {
        min-width: 64px;
        text-align: center;
        padding: 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.16);
      }
      @media (max-width: 820px) {
        .shell { width: min(100% - 24px, 520px); padding-top: 18px; }
        .nav { margin-bottom: 22px; }
        .nav-pill { display: none; }
        .hero { grid-template-columns: 1fr; gap: 30px; }
        .actions { grid-template-columns: 1fr; }
        .steps { grid-template-columns: 1fr; }
        .phone { min-height: auto; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <nav class="nav" aria-label="Main">
        <div class="brand"><span class="mark">RC</span><span>Red Chilly</span></div>
        <span class="nav-pill">QR rewards live here</span>
      </nav>
      <main class="hero">
        <section>
          <span class="eyebrow">Order online. Scan. Unlock rewards.</span>
          <h1>Choose your delivery app and keep earning surprises.</h1>
          <p class="lead">Order your favorite Red Chilly meal, scan the QR after dining or delivery, and unlock special rewards made for regular customers.</p>
          <div class="actions" aria-label="Order options">
            <a class="btn zomato" href="${zomatoUrl}">Order on Zomato</a>
            <a class="btn swiggy" href="${swiggyUrl}">Order on Swiggy</a>
          </div>
          <div class="steps">
            <div class="step"><strong>1. Pick an app</strong><span>Open Zomato or Swiggy from this page.</span></div>
            <div class="step"><strong>2. Enjoy your meal</strong><span>Order from Red Chilly and keep your QR handy.</span></div>
            <div class="step"><strong>3. Claim reward</strong><span>Scan and send the WhatsApp message to unlock offers.</span></div>
          </div>
        </section>
        <section class="visual" aria-label="Reward preview">
          <div class="phone">
            <div class="screen">
              <div class="food" aria-hidden="true"></div>
              <div class="reward">
                <h2>Red Chilly Rewards</h2>
                <p>Collect visits and unlock special surprise gifts.</p>
                <div class="stamps" aria-label="Reward stamps">
                  <span class="stamp">1</span><span class="stamp">2</span><span class="stamp">3</span><span class="stamp empty">4</span><span class="stamp empty">5</span>
                </div>
              </div>
              <div class="offer">
                <span><strong>Special gift unlocked</strong><span>After your next QR scan</span></span>
                <b>LIVE</b>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </body>
</html>`
}
