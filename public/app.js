const $ = (id) => document.getElementById(id);
let catalog = {};
let result = null;
let busy = false;
let marketplaceUrl = '';

function syncMode() {
  const demo = $('mode').value === 'demo';
  $('demo-controls').hidden = !demo;
  $('token-controls').hidden = demo;
  const price = catalog[$('tier').value]?.price;
  $('run').textContent = demo ? 'Run free demo →' : `Continue to payment · ${price ?? '…'} TON →`;
}

async function loadExample() {
  const response = await fetch('/example-intake.json');
  if (!response.ok) throw new Error('Could not load the example configuration.');
  $('intake').value = JSON.stringify(await response.json(), null, 2);
  $('tier').value = 'standard';
  $('mode').value = 'demo';
  $('demo-profile').value = 'vulnerable';
  syncMode();
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderReport(data) {
  const report = data.report;
  $('empty-state').hidden = true;
  $('report').hidden = false;
  $('run-status').textContent = report.status.toUpperCase();
  $('report-meta').textContent = `${report.target_id} / ${report.mode} / ${report.model}`;
  $('summary').replaceChildren(...Object.entries(report.summary).map(([name, count]) => element('span', `${count} ${name.replaceAll('_', ' ')}`, 'summary-chip')));
  $('check-results').replaceChildren(...report.checks.map((check) => {
    const detail = element('details', undefined, 'check');
    detail.append(element('summary', `${check.title} — ${check.status.replaceAll('_', ' ')}`, `status-${check.status}`));
    detail.append(element('p', check.reason));
    for (const finding of check.findings) detail.append(element('p', finding.recommendation));
    if (check.evidence.length) detail.append(element('pre', JSON.stringify(check.evidence, null, 2)));
    return detail;
  }));
  $('limitations').replaceChildren(...report.limitations.map((item) => element('li', item)));
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const anchor = element('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('mode').addEventListener('change', syncMode);
$('tier').addEventListener('change', syncMode);
$('load-example').addEventListener('click', () => loadExample().catch(showError));
$('intake').addEventListener('change', () => {
  try {
    const data = JSON.parse($('intake').value);
    if (catalog[data.tier]) $('tier').value = data.tier;
    if (['demo', 'local_replica'].includes(data.test_access?.mode)) $('mode').value = data.test_access.mode;
    if (['vulnerable', 'hardened'].includes(data.test_access?.demo_profile)) $('demo-profile').value = data.test_access.demo_profile;
    syncMode();
  } catch { /* Validation is shown on submit. */ }
});

function showError(error) {
  $('error').textContent = error.message;
  $('error').hidden = false;
}

$('assessment-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  $('error').hidden = true;
  try {
    const data = JSON.parse($('intake').value);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Intake must be a JSON object.');
    data.tier = $('tier').value;
    data.test_access = {mode: $('mode').value, ...($('mode').value === 'demo' ? {demo_profile: $('demo-profile').value} : {})};
    // Budget comes from the JSON and is never silently increased to fit a tier.
    if (data.budget < catalog[data.tier].price) throw new Error('This tier exceeds the budget in your JSON. Choose a cheaper tier or explicitly edit your budget.');
    if (new TextEncoder().encode(JSON.stringify(data)).length > 32768) throw new Error('Intake exceeds 32 KB.');
    busy = true;
    result = null;
    $('run').disabled = true;
    $('run-status').textContent = 'RUNNING';
    $('report').hidden = true;
    $('empty-state').hidden = true;
    $('progress').hidden = false;
    const headers = {'Content-Type': 'application/json'};
    if (data.test_access.mode === 'local_replica') {
      if (!marketplaceUrl) throw new Error('Purchases are not configured yet.');
      const response = await fetch(`${marketplaceUrl}/api/checkout`, {method: 'POST', headers,
        body: JSON.stringify({intake: data, tier: data.tier}), signal: AbortSignal.timeout(20000)});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'Could not create checkout.');
      const checkoutUrl = new URL(body.url);
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'hackaton.ambasada.dev') throw new Error('Unexpected checkout address.');
      window.location.assign(checkoutUrl.href);
      return;
    }
    const response = await fetch('/api/assess', {method: 'POST', headers, body: JSON.stringify(data), signal: AbortSignal.timeout(60000)});
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Assessment could not run.');
    result = body;
    renderReport(body);
  } catch (error) {
    $('run-status').textContent = 'ERROR';
    $('empty-state').hidden = false;
    showError(error);
  } finally {
    busy = false;
    $('run').disabled = false;
    $('progress').hidden = true;
  }
});
$('download-json').addEventListener('click', () => {if (result) download(JSON.stringify(result.report, null, 2), 'agent-checkup.json', 'application/json');});
$('download-markdown').addEventListener('click', () => {if (result) download(result.markdown, 'agent-checkup.md', 'text/markdown');});

async function init() {
  const response = await fetch('/api/assess');
  if (!response.ok) throw new Error('The assessment API is unavailable.');
  const config = await response.json();
  catalog = config.tiers;
  marketplaceUrl = config.marketplace_url || '';
  const descriptions = {
    starter: 'Role overrides, protected information, and unsupported capability claims.',
    standard: 'Adds price boundaries, fabricated receipts, and refund handling.',
    deep: 'Adds indirect injection, customer isolation, tool scope, and repeated actions.'
  };
  $('tiers').replaceChildren(...Object.values(catalog).map((tier) => {
    const card = element('article', undefined, `tier ${tier.id === 'standard' ? 'featured' : ''}`);
    const top = element('div', undefined, 'tier-top');
    top.append(element('h3', tier.id[0].toUpperCase() + tier.id.slice(1)), element('span', `${tier.check_ids.length} CHECKS`));
    const price = element('div', `${tier.price} `, 'price');
    price.append(element('small', 'TON / ASSESSMENT'));
    const button = element('button', `Choose ${tier.id} →`);
    button.type = 'button';
    button.addEventListener('click', () => {
      $('tier').value = tier.id;
      $('mode').value = 'local_replica';
      syncMode();
      $('workspace').scrollIntoView({behavior: 'smooth'});
    });
    card.append(top, price, element('p', descriptions[tier.id]), button);
    return card;
  }));
  await loadExample();
  await resumeOrder();
}

async function resumeOrder() {
  const params = new URLSearchParams(location.hash.slice(1));
  const order = params.get('order'), access = params.get('access');
  if (!order || !access || !marketplaceUrl) return;
  $('workspace').scrollIntoView();
  $('empty-state').hidden = true;
  $('progress').hidden = false;
  $('run-status').textContent = 'WORKING';
  $('progress').textContent = 'Verifying payment and preparing your assessment… Keep this private report link to return later.';
  busy = true;
  $('run').disabled = true;
  try {
    for (let attempt = 0; attempt < 65; attempt++) {
      const response = await fetch(`${marketplaceUrl}/api/receipt?order=${encodeURIComponent(order)}`, {
        headers: {Authorization: `Bearer ${access}`}, signal: AbortSignal.timeout(15000)});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'Could not read your order.');
      if (body.status === 'delivered') { result = body; renderReport(body); return; }
      if (body.status === 'failed') throw new Error(body.error);
      if (body.status === 'unpaid') throw new Error('This order is not paid. No assessment has been unlocked.');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error('The report is still processing. Keep this private URL and reload to check again.');
  } finally {
    busy = false;
    $('run').disabled = false;
    $('progress').hidden = true;
  }
}
init().catch(showError);
