// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser = null;
let currentJobId = null;
let currentJobPerspective = 'shipper';
let jobPollInterval = null;

const SIZE_LABELS = {
  envelope: 'Envelope / Document', small_box: 'Small Box',
  medium_box: 'Medium Box', large_box: 'Large Box', oversized: 'Oversized / Furniture'
};
const STATUS_LABELS = { open: 'Open', accepted: 'Driver Matched', in_transit: 'In Transit', completed: 'Completed' };
const TYPE_LABELS = { standard: '📦 General', marketplace: '🛋️ Marketplace', retail: '🚴 Retail', errand: '🛍️ Errand', business: '🏢 Business' };
const TYPE_HINTS = {
  standard: 'Standard delivery between two locations.',
  marketplace: 'Sold an item online? Get it delivered. Buyer or seller can post. Item photos required.',
  retail: 'Shop delivering to a customer, or customer needs a shop purchase brought to them.',
  errand: 'Need someone to pick something up for you from a store and bring it to you.',
  business: 'Business-to-business delivery along a regular route — products, documents, samples.'
};

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function showTab(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === (tab === 'login' ? 0 : 1)));
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').textContent = '';
  try {
    const res = await api('POST', '/api/auth/login', { email, password });
    currentUser = res; enterApp(res.name);
  } catch (e) { document.getElementById('login-error').textContent = e.message; }
}

async function register() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;
  const vehicle_type = document.getElementById('reg-vehicle').value;
  document.getElementById('reg-error').textContent = '';
  if (!name || !email || !password) { document.getElementById('reg-error').textContent = 'Name, email, and password required'; return; }
  if (password.length < 8) { document.getElementById('reg-error').textContent = 'Password must be at least 8 characters'; return; }
  try {
    const res = await api('POST', '/api/auth/register', { name, email, phone, password, vehicle_type });
    currentUser = res; enterApp(res.name);
  } catch (e) { document.getElementById('reg-error').textContent = e.message; }
}

async function logout() {
  await api('POST', '/api/auth/logout');
  currentUser = null;
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
}

function enterApp(name) {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  document.getElementById('header-name').textContent = name;
  document.getElementById('home-name').textContent = name.split(' ')[0];
  // Set default departure time to now + 1 hour
  const soon = new Date(Date.now() + 3600000);
  const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const depField = document.getElementById('route-depart');
  if (depField) depField.value = local;
  loadMyJobs();
}

// ─── VIEWS ────────────────────────────────────────────────────────────────────
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  if (viewId === 'view-home') loadMyJobs();
}

function setNavActive(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}

// ─── JOB TYPE SELECTION ───────────────────────────────────────────────────────
function selectJobType(type, el) {
  document.querySelectorAll('.type-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('job-type').value = type;
  document.getElementById('type-hint').textContent = TYPE_HINTS[type] || '';
  document.getElementById('marketplace-fields').style.display = type === 'marketplace' ? 'block' : 'none';
  document.getElementById('errand-fields').style.display = type === 'errand' ? 'block' : 'none';
  document.getElementById('disassembly-row').style.display = (type === 'marketplace' || type === 'oversized') ? 'flex' : 'none';
}

function previewListingPhotos(input) {
  const row = document.getElementById('listing-photo-row');
  Array.from(input.files).forEach(f => {
    const img = document.createElement('img');
    img.className = 'photo-thumb';
    img.src = URL.createObjectURL(f);
    row.insertBefore(img, row.lastElementChild);
  });
}

// ─── DRIVE MODE ───────────────────────────────────────────────────────────────
function switchDriveMode(mode) {
  document.getElementById('drive-post-panel').style.display = mode === 'post' ? 'block' : 'none';
  document.getElementById('drive-browse-panel').style.display = mode === 'browse' ? 'block' : 'none';
  document.getElementById('dmb-post').classList.toggle('active', mode === 'post');
  document.getElementById('dmb-browse').classList.toggle('active', mode === 'browse');
  if (mode === 'post') { loadMyRoutes(); checkAndShowConnectPrompt(); }
}

// ─── DRIVER ROUTES ────────────────────────────────────────────────────────────
async function postDriverRoute() {
  const origin = document.getElementById('route-origin').value.trim();
  const dest = document.getElementById('route-dest').value.trim();
  const depart = document.getElementById('route-depart').value;
  const detour = document.getElementById('route-detour').value;
  const vehicle = document.getElementById('route-vehicle').value.trim();
  const haul_types = Array.from(document.querySelectorAll('.haul-tag input:checked')).map(i => i.value);

  if (!origin || !dest || !depart) { toast('Please fill in origin, destination, and departure time'); return; }
  if (!haul_types.length) { toast('Select at least one item type you can haul'); return; }

  try {
    await api('POST', '/api/jobs/driver-routes', {
      origin_city: origin, destination_city: dest,
      departure_time: depart, max_detour_minutes: parseInt(detour),
      vehicle_description: vehicle, haul_types
    });
    toast('Route posted! Shippers heading your way will see you.');
    loadMyRoutes();
  } catch (e) { toast(e.message || 'Could not post route'); }
}

async function loadMyRoutes() {
  const list = document.getElementById('my-routes-list');
  try {
    const routes = await api('GET', '/api/jobs/driver-routes/my');
    if (!routes.length) { list.innerHTML = '<div class="empty-state">No active routes. Post a drive above.</div>'; return; }
    list.innerHTML = routes.map(r => routeCard(r)).join('');
  } catch (e) { list.innerHTML = '<div class="empty-state">Could not load routes</div>'; }
}

function routeCard(r) {
  const depart = new Date(r.departure_time).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const hauls = JSON.parse(typeof r.haul_types === 'string' ? r.haul_types : JSON.stringify(r.haul_types || []));
  return `<div class="job-card">
    <div class="job-card-header">
      <div class="job-card-title">${escHtml(r.origin_city)} → ${escHtml(r.destination_city)}</div>
      <button class="btn-ghost" style="color:var(--red); font-size:12px;" onclick="cancelRoute('${r.id}')">Cancel</button>
    </div>
    <div class="job-meta" style="margin-bottom:6px;">
      <span>🕐 ${depart}</span>
      <span>↗ max ${r.max_detour_minutes} min detour</span>
    </div>
    ${r.vehicle_description ? `<div class="job-meta"><span>🚗 ${escHtml(r.vehicle_description)}</span></div>` : ''}
    <div class="tags-row" style="margin-top:8px;">${hauls.map(h => `<span class="size-tag">${SIZE_LABELS[h] || h}</span>`).join('')}</div>
  </div>`;
}

async function cancelRoute(id) {
  try {
    await api('DELETE', `/api/jobs/driver-routes/${id}`);
    toast('Route cancelled');
    loadMyRoutes();
  } catch (e) { toast('Could not cancel route'); }
}

// ─── BROWSE ───────────────────────────────────────────────────────────────────
async function browseAll() {
  const dest = document.getElementById('browse-destination').value.trim();
  await Promise.all([browseDrivers(dest), browseJobs(dest)]);
}

async function browseDrivers(dest) {
  const container = document.getElementById('available-drivers');
  container.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const url = dest ? `/api/jobs/driver-routes?destination=${encodeURIComponent(dest)}` : '/api/jobs/driver-routes';
    const routes = await api('GET', url);
    if (!routes.length) { container.innerHTML = `<div class="empty-state">No drivers heading ${dest ? 'to ' + dest : 'anywhere'} right now.</div>`; return; }
    container.innerHTML = routes.map(r => driverCard(r)).join('');
  } catch (e) { container.innerHTML = '<div class="empty-state">Could not load drivers</div>'; }
}

function driverCard(r) {
  const depart = new Date(r.departure_time).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const rating = r.avg_rating ? `⭐ ${r.avg_rating}` : 'New driver';
  const hauls = (typeof r.haul_types === 'string' ? JSON.parse(r.haul_types) : r.haul_types) || [];
  return `<div class="job-card driver-route-card" onclick="requestDriver('${r.id}', '${escHtml(r.driver_name)}', '${escHtml(r.destination_city)}')">
    <div class="job-card-header">
      <div>
        <div class="job-card-title">🚗 ${escHtml(r.driver_name)}</div>
        <div class="job-meta">${rating} · ${escHtml(r.origin_city)} → ${escHtml(r.destination_city)}</div>
      </div>
      <div style="text-align:right; font-size:12px; color:var(--orange);">Leaving<br>${depart}</div>
    </div>
    <div class="job-meta" style="margin-top:6px;">
      <span>↗ Up to ${r.max_detour_minutes} min detour</span>
      ${r.vehicle_type ? `<span>🚙 ${r.vehicle_type}</span>` : ''}
      ${r.vehicle_description ? `<span>${escHtml(r.vehicle_description)}</span>` : ''}
    </div>
    <div class="tags-row" style="margin-top:8px;">${hauls.map(h => `<span class="size-tag">${SIZE_LABELS[h] || h}</span>`).join('')}</div>
    <div style="font-size:12px; color:var(--orange); margin-top:10px; font-weight:500;">Tap to post a job for this driver →</div>
  </div>`;
}

function requestDriver(routeId, driverName, destCity) {
  // Pre-fill the post form for this specific driver
  showView('view-post');
  document.getElementById('job-dropoff-city').value = destCity;
  document.getElementById('job-notes').value = `Requested for driver: ${driverName}`;
  // Store route ID to attach on submit
  window._requestedDriverRouteId = routeId;
  toast(`Posting a job for ${driverName}'s drive to ${destCity}`);
}

async function browseJobs(dest) {
  const results = document.getElementById('browse-results');
  results.innerHTML = '<div class="empty-state">Searching...</div>';
  try {
    const url = dest ? `/api/jobs?destination=${encodeURIComponent(dest)}` : '/api/jobs';
    const jobs = await api('GET', url);
    if (!jobs.length) { results.innerHTML = `<div class="empty-state">No open deliveries${dest ? ' to ' + dest : ''}.</div>`; return; }
    results.innerHTML = jobs.map(j => jobCard(j, true)).join('');
  } catch (e) { results.innerHTML = '<div class="empty-state">Search failed</div>'; }
}

// ─── MY JOBS ──────────────────────────────────────────────────────────────────
async function loadMyJobs() {
  const list = document.getElementById('my-jobs-list');
  list.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const data = await api('GET', '/api/jobs/my/all');
    const all = [...(data.as_shipper || []), ...(data.as_driver || [])];
    const active = all.filter(j => j.status !== 'completed');
    if (!active.length) { list.innerHTML = '<div class="empty-state">No active jobs yet.<br>Post a delivery or find a drive!</div>'; return; }
    list.innerHTML = active.map(j => jobCard(j)).join('');
  } catch (e) { list.innerHTML = '<div class="empty-state">Could not load jobs</div>'; }
}

// ─── JOB CARDS ────────────────────────────────────────────────────────────────
function jobCard(job, isDriverBrowse = false) {
  const typeLabel = TYPE_LABELS[job.job_type] || '📦 General';
  const payout = job.driver_payout ? parseFloat(job.driver_payout).toFixed(2) : (parseFloat(job.offered_price) * 0.75).toFixed(2);
  return `<div class="job-card" onclick="openJob('${job.id}', '${isDriverBrowse ? 'driver' : 'shipper'}')">
    <div class="job-card-header">
      <div class="job-card-title">${escHtml(job.title)}</div>
      <div class="job-price">$${parseFloat(job.offered_price).toFixed(2)}</div>
    </div>
    <div class="job-route">
      <div class="route-dot start"></div>
      <div class="route-city">${escHtml(job.pickup_city)}</div>
      <div class="route-line"></div>
      <div class="route-city">${escHtml(job.dropoff_city)}</div>
      <div class="route-dot end"></div>
    </div>
    <div class="job-meta">
      <span class="status-badge status-${job.status}">${STATUS_LABELS[job.status] || job.status}</span>
      <span>${typeLabel}</span>
      <span>${SIZE_LABELS[job.item_size] || job.item_size}</span>
      ${job.fragile ? '<span>⚠️ Fragile</span>' : ''}
      ${job.needs_disassembly ? '<span>🔧 Disassembly</span>' : ''}
      ${isDriverBrowse ? `<span style="color:var(--green); font-weight:600;">Earn $${payout}</span>` : ''}
    </div>
  </div>`;
}

// ─── JOB DETAIL ───────────────────────────────────────────────────────────────
async function openJob(jobId, perspective = 'shipper') {
  currentJobId = jobId;
  currentJobPerspective = perspective;
  const backView = perspective === 'driver' ? 'view-drive' : 'view-home';
  document.getElementById('job-back-btn').onclick = () => { showView(backView); clearInterval(jobPollInterval); };
  showView('view-job');
  await loadJobDetail();
  clearInterval(jobPollInterval);
  jobPollInterval = setInterval(() => loadJobDetail(true), 5000);
}

async function loadJobDetail(silent = false) {
  const container = document.getElementById('job-detail-content');
  if (!silent) container.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const { job, messages } = await api('GET', `/api/jobs/${currentJobId}`);
    container.innerHTML = renderJobDetail(job, messages);
  } catch (e) { if (!silent) container.innerHTML = '<div class="empty-state">Could not load job</div>'; }
}

function renderJobDetail(job, messages) {
  const isShipper = job.shipper_id === currentUser?.userId;
  const isDriver = job.driver_id === currentUser?.userId;
  const extra = job.extra_data || {};
  const driverPayout = parseFloat(job.driver_payout || job.offered_price * 0.75).toFixed(2);

  let html = `
    <div class="job-detail-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div>
          <div style="font-size:12px; color:var(--orange); margin-bottom:4px;">${TYPE_LABELS[job.job_type] || '📦 General'}</div>
          <div style="font-family:'Syne',sans-serif; font-size:18px; font-weight:700; margin-bottom:6px;">${escHtml(job.title)}</div>
          <span class="status-badge status-${job.status}">${STATUS_LABELS[job.status]}</span>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Syne',sans-serif; font-size:26px; font-weight:800; color:var(--orange);">$${parseFloat(job.offered_price).toFixed(2)}</div>
          ${isDriver ? `<div style="font-size:12px; color:var(--green);">You earn $${driverPayout}</div>` : ''}
        </div>
      </div>
      ${job.description ? `<p style="font-size:14px; color:rgba(255,255,255,0.6); margin-bottom:12px;">${escHtml(job.description)}</p>` : ''}
      <div class="detail-grid">
        <div><div class="detail-label">Size</div><div class="detail-val">${SIZE_LABELS[job.item_size] || job.item_size}</div></div>
        <div><div class="detail-label">Weight</div><div class="detail-val">${job.item_weight ? job.item_weight + ' lbs' : '—'}</div></div>
      </div>
      ${job.fragile ? '<div class="alert-box danger">⚠️ Fragile — handle with care</div>' : ''}
      ${job.needs_disassembly ? '<div class="alert-box warn">🔧 Requires disassembly / reassembly</div>' : ''}
    </div>`;

  // Listing photos (marketplace)
  if (job.listing_photos?.length) {
    html += `<div class="job-detail-card">
      <div class="detail-label" style="margin-bottom:10px;">Item Photos</div>
      <div class="photo-upload-row">${job.listing_photos.map(p => `<img class="photo-thumb" src="${p}">`).join('')}</div>
    </div>`;
  }

  // Marketplace parties
  if (job.job_type === 'marketplace' && (extra.seller_name || extra.buyer_name)) {
    html += `<div class="job-detail-card">
      <div class="detail-label" style="margin-bottom:10px;">Marketplace Parties</div>
      ${extra.seller_name ? `<div class="detail-grid"><div><div class="detail-label">Seller</div><div class="detail-val">${escHtml(extra.seller_name)}</div></div>${extra.seller_phone ? `<div><div class="detail-label">Seller phone</div><div class="detail-val">${escHtml(extra.seller_phone)}</div></div>` : ''}</div>` : ''}
      ${extra.buyer_name ? `<div class="detail-grid" style="margin-top:10px;"><div><div class="detail-label">Buyer</div><div class="detail-val">${escHtml(extra.buyer_name)}</div></div>${extra.buyer_phone ? `<div><div class="detail-label">Buyer phone</div><div class="detail-val">${escHtml(extra.buyer_phone)}</div></div>` : ''}</div>` : ''}
    </div>`;
  }

  // Errand details
  if (job.job_type === 'errand' && (extra.store_name || extra.item_to_pickup)) {
    html += `<div class="job-detail-card">
      <div class="detail-label" style="margin-bottom:10px;">Errand Details</div>
      ${extra.store_name ? `<div><div class="detail-label">Store</div><div class="detail-val">${escHtml(extra.store_name)}</div></div>` : ''}
      ${extra.item_to_pickup ? `<div style="margin-top:8px;"><div class="detail-label">Item to pick up</div><div class="detail-val" style="font-size:13px;">${escHtml(extra.item_to_pickup)}</div></div>` : ''}
    </div>`;
  }

  // Route
  html += `<div class="job-detail-card">
    <div class="detail-label" style="margin-bottom:10px;">Route</div>
    <div class="job-route" style="margin-bottom:12px;">
      <div class="route-dot start"></div><div class="route-city">${escHtml(job.pickup_city)}</div>
      <div class="route-line"></div>
      <div class="route-city">${escHtml(job.dropoff_city)}</div><div class="route-dot end"></div>
    </div>
    <div class="detail-grid">
      <div><div class="detail-label">Pickup</div><div class="detail-val" style="font-size:13px;">${escHtml(job.pickup_address)}</div></div>
      <div><div class="detail-label">Dropoff</div><div class="detail-val" style="font-size:13px;">${escHtml(job.dropoff_address)}</div></div>
    </div>
    ${job.notes ? `<div style="margin-top:10px;"><div class="detail-label">Notes</div><div class="detail-val" style="font-size:13px;">${escHtml(job.notes)}</div></div>` : ''}
    ${(isDriver || currentJobPerspective === 'driver') ? mapsButtons(job) : ''}
  </div>`;

  // Accept (open job, driver browsing)
  if (job.status === 'open' && currentJobPerspective === 'driver' && !isShipper) {
    html += `<button class="btn-primary btn-large" onclick="acceptJob('${job.id}')">Accept This Delivery — Earn $${driverPayout} →</button>`;
  }

  // Messages
  if (job.status !== 'open' && (isShipper || isDriver)) {
    html += `<div class="job-detail-card">
      <div class="detail-label" style="margin-bottom:12px;">Messages with ${isShipper ? (job.driver_name || 'Driver') : (job.shipper_name || 'Shipper')}</div>
      <div class="messages-thread" id="msg-thread">
        ${messages.length ? messages.map(m => `
          <div><div class="msg-name">${escHtml(m.sender_name)}</div>
          <div class="msg-bubble ${m.sender_id === currentUser?.userId ? 'msg-out' : 'msg-in'}">${escHtml(m.content)}</div></div>`).join('')
          : '<div style="color:var(--gray);font-size:13px;text-align:center;padding:12px;">No messages yet</div>'}
      </div>
      <div class="msg-input-row">
        <input type="text" id="msg-input" placeholder="Send a message..." onkeydown="if(event.key==='Enter') sendMsg('${job.id}')">
        <button class="msg-send-btn" onclick="sendMsg('${job.id}')">↑</button>
      </div>
    </div>`;
    // Scroll messages
    setTimeout(() => { const t = document.getElementById('msg-thread'); if (t) t.scrollTop = t.scrollHeight; }, 100);
  }

  // Pickup photos
  if ((job.status === 'accepted' || job.status === 'in_transit') && (isShipper || isDriver)) {
    const photos = job.pickup_photos || [];
    html += `<div class="job-detail-card">
      <div class="detail-label" style="margin-bottom:12px;">📸 Pickup Photos & Agreement</div>
      <div class="photo-upload-row" id="pickup-photos">
        ${photos.map(p => `<img class="photo-thumb" src="${p}">`).join('')}
        ${job.status === 'accepted' ? `<div class="photo-add-btn" onclick="document.getElementById('pickup-file').click()">+</div>
        <input type="file" id="pickup-file" class="photo-input" accept="image/*" multiple onchange="uploadPhotos('${job.id}', 'pickup', this)">` : ''}
      </div>
      ${job.pickup_signed_at ? `<div style="font-size:12px; color:var(--green); margin-top:6px;">✓ Condition agreed ${new Date(job.pickup_signed_at).toLocaleString()}</div>` : ''}
      ${job.status === 'accepted' && photos.length >= 1 ? `<button class="btn-primary" onclick="confirmPickup('${job.id}')">✓ Confirm Pickup & Sign Agreement</button>` : ''}
      ${job.status === 'accepted' && !photos.length ? `<div style="font-size:12px; color:var(--gray); margin-top:8px;">Add at least 1 photo before confirming pickup</div>` : ''}
    </div>`;
  }

  // Confirm delivery
  if (job.status === 'in_transit' && isShipper) {
    html += `<div class="job-detail-card">
      <div class="detail-label" style="margin-bottom:8px;">✅ Confirm Delivery</div>
      <p style="font-size:13px; color:rgba(255,255,255,0.6); margin-bottom:12px;">Confirm delivery to release $${driverPayout} to the driver.</p>
      <div class="photo-upload-row" id="dropoff-photos">
        <div class="photo-add-btn" onclick="document.getElementById('dropoff-file').click()">+</div>
        <input type="file" id="dropoff-file" class="photo-input" accept="image/*" multiple onchange="uploadPhotos('${job.id}', 'dropoff', this)">
      </div>
      <button class="btn-primary" onclick="confirmDelivery('${job.id}')">Confirm Delivery & Release Payment 🎉</button>
    </div>`;
  }

  // Rating
  if (job.status === 'completed' && (isShipper || isDriver)) {
    html += `<div class="job-detail-card">
      <div class="detail-label" style="margin-bottom:8px;">Rate your experience</div>
      <div class="star-row" id="star-row">${[1,2,3,4,5].map(i => `<span class="star" onclick="setRating(${i})">★</span>`).join('')}</div>
      <input type="text" id="rating-comment" placeholder="Any feedback? (optional)" style="margin-top:8px;">
      <button class="btn-secondary" style="margin-top:8px;" onclick="submitRating('${job.id}')">Submit Rating</button>
    </div>`;
  }

  return html;
}

// ─── ACTIONS ──────────────────────────────────────────────────────────────────
async function postJob(e) {
  e.preventDefault();
  document.getElementById('post-error').textContent = '';
  const jobType = document.getElementById('job-type').value;

  // Collect listing photos if marketplace
  const listingInput = document.getElementById('listing-photos-input');
  const formData = new FormData();
  if (jobType === 'marketplace' && listingInput?.files?.length) {
    Array.from(listingInput.files).forEach(f => formData.append('listing_photos', f));
  }

  const fields = {
    job_type: jobType,
    title: document.getElementById('job-title').value.trim(),
    description: document.getElementById('job-desc').value.trim(),
    item_size: document.getElementById('job-size').value,
    item_weight: document.getElementById('job-weight').value,
    fragile: document.getElementById('job-fragile').checked ? '1' : '',
    needs_disassembly: document.getElementById('job-disassembly').checked ? '1' : '',
    pickup_address: document.getElementById('job-pickup-addr').value.trim(),
    pickup_city: document.getElementById('job-pickup-city').value.trim(),
    dropoff_address: document.getElementById('job-dropoff-addr').value.trim(),
    dropoff_city: document.getElementById('job-dropoff-city').value.trim(),
    offered_price: document.getElementById('job-price').value,
    notes: document.getElementById('job-notes').value.trim(),
    seller_name: document.getElementById('seller-name')?.value.trim() || '',
    seller_phone: document.getElementById('seller-phone')?.value.trim() || '',
    buyer_name: document.getElementById('buyer-name')?.value.trim() || '',
    buyer_phone: document.getElementById('buyer-phone')?.value.trim() || '',
    store_name: document.getElementById('store-name')?.value.trim() || '',
    item_to_pickup: document.getElementById('item-to-pickup')?.value.trim() || '',
  };

  if (window._requestedDriverRouteId) {
    fields.requested_driver_route_id = window._requestedDriverRouteId;
    window._requestedDriverRouteId = null;
  }

  Object.entries(fields).forEach(([k, v]) => { if (v) formData.append(k, v); });

  try {
    const res = await fetch('/api/jobs', { method: 'POST', body: formData, credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toast('Delivery posted! Looking for a driver match.');
    document.getElementById('post-form').reset();
    document.getElementById('price-breakdown').style.display = 'none';
    document.getElementById('marketplace-fields').style.display = 'none';
    document.getElementById('errand-fields').style.display = 'none';
    document.querySelectorAll('.type-opt').forEach(o => o.classList.remove('active'));
    document.querySelector('[data-type="standard"]').classList.add('active');
    document.getElementById('job-type').value = 'standard';
    showView('view-home');
  } catch (e) { document.getElementById('post-error').textContent = e.message; }
}

async function acceptJob(jobId) {
  try {
    await api('POST', `/api/jobs/${jobId}/accept`);
    toast('Job accepted! Check messages to coordinate pickup.');
    await loadJobDetail();
  } catch (e) { toast(e.message || 'Could not accept job'); }
}

async function sendMsg(jobId) {
  const input = document.getElementById('msg-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = '';
  try {
    const msg = await api('POST', `/api/jobs/${jobId}/messages`, { content });
    const thread = document.getElementById('msg-thread');
    if (thread) {
      const div = document.createElement('div');
      div.innerHTML = `<div class="msg-name">${escHtml(msg.sender_name)}</div>
        <div class="msg-bubble msg-out">${escHtml(msg.content)}</div>`;
      thread.appendChild(div);
      thread.scrollTop = thread.scrollHeight;
    }
  } catch (e) { toast('Could not send message'); }
}

async function uploadPhotos(jobId, type, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const container = document.getElementById(`${type}-photos`);
  files.forEach(f => {
    const img = document.createElement('img');
    img.className = 'photo-thumb';
    img.src = URL.createObjectURL(f);
    if (container) container.insertBefore(img, container.querySelector('.photo-add-btn') || null);
  });
  const formData = new FormData();
  files.forEach(f => formData.append('photos', f));
  try {
    const res = await fetch(`/api/jobs/${jobId}/${type}`, { method: 'POST', body: formData, credentials: 'include' });
    if (!res.ok) throw new Error('Upload failed');
    toast('Photos uploaded ✓');
    await loadJobDetail(true);
  } catch (e) { toast('Photo upload failed'); }
}

async function confirmPickup(jobId) {
  try {
    const formData = new FormData();
    const res = await fetch(`/api/jobs/${jobId}/pickup`, { method: 'POST', body: formData, credentials: 'include' });
    if (!res.ok) throw new Error('Failed');
    toast('Pickup confirmed! Item is now in transit.');
    await loadJobDetail();
  } catch (e) { toast(e.message || 'Could not confirm pickup'); }
}

async function confirmDelivery(jobId) {
  if (!confirm('Confirm delivery complete and release payment to driver?')) return;
  const formData = new FormData();
  try {
    const res = await fetch(`/api/jobs/${jobId}/confirm`, { method: 'POST', body: formData, credentials: 'include' });
    if (!res.ok) throw new Error('Failed');
    toast('Delivery confirmed! Payment released. 🎉');
    clearInterval(jobPollInterval);
    await loadJobDetail();
  } catch (e) { toast(e.message || 'Could not confirm delivery'); }
}

let selectedRating = 0;
function setRating(score) {
  selectedRating = score;
  document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('active', i < score));
}

async function submitRating(jobId) {
  if (!selectedRating) { toast('Please select a star rating'); return; }
  const comment = document.getElementById('rating-comment')?.value.trim() || '';
  try {
    await api('POST', `/api/jobs/${jobId}/rate`, { score: selectedRating, comment });
    toast('Rating submitted. Thanks!');
    await loadJobDetail();
  } catch (e) { toast(e.message || 'Could not submit rating'); }
}

// ─── PRICING ──────────────────────────────────────────────────────────────────
function updatePriceBreakdown() {
  const price = parseFloat(document.getElementById('job-price').value);
  const breakdown = document.getElementById('price-breakdown');
  if (isNaN(price) || price < 5) { breakdown.style.display = 'none'; return; }
  document.getElementById('pb-driver').textContent = `$${(price * 0.75).toFixed(2)}`;
  document.getElementById('pb-fee').textContent = `$${(price * 0.25).toFixed(2)}`;
  document.getElementById('pb-total').textContent = `$${price.toFixed(2)}`;
  breakdown.style.display = 'block';
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const user = await api('GET', '/api/auth/me');
    currentUser = user;
    enterApp(user.name);
  } catch (e) { /* not logged in */ }
})();

// ─── MAPS DEEP LINK ───────────────────────────────────────────────────────────
function openMaps(address, city) {
  const query = encodeURIComponent(`${address}, ${city}`);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const url = isIOS ? `maps://?q=${query}` : `https://www.google.com/maps/search/?api=1&query=${query}`;
  window.open(url, '_blank');
}

function mapsButtons(job) {
  return `<div style="display:flex; gap:8px; margin-top:12px;">
    <button class="btn-secondary" style="flex:1; margin:0; padding:10px; font-size:13px;"
      onclick="openMaps('${job.pickup_address.replace(/'/g,"\\'")}', '${job.pickup_city.replace(/'/g,"\\'")}')">
      📍 Pickup Directions
    </button>
    <button class="btn-secondary" style="flex:1; margin:0; padding:10px; font-size:13px;"
      onclick="openMaps('${job.dropoff_address.replace(/'/g,"\\'")}', '${job.dropoff_city.replace(/'/g,"\\'")}')">
      🏁 Dropoff Directions
    </button>
  </div>`;
}

// ─── STRIPE CONNECT ───────────────────────────────────────────────────────────
async function startConnectOnboarding() {
  try {
    const res = await api('POST', '/api/stripe/connect/onboard');
    if (res.already_onboarded) { toast('Payout account already set up ✓'); return; }
    if (res.url) window.location.href = res.url;
  } catch (e) { toast(e.message || 'Could not start payout setup'); }
}

async function openStripeDashboard() {
  try {
    const res = await api('POST', '/api/stripe/connect/dashboard');
    if (res.url) window.open(res.url, '_blank');
  } catch (e) { toast('Could not open dashboard'); }
}

async function checkAndShowConnectPrompt() {
  let status = { connected: false };
  try { status = await api('GET', '/api/stripe/connect/status'); } catch (e) { return; }

  const drivePanel = document.getElementById('drive-post-panel');
  if (!drivePanel) return;
  const existing = document.getElementById('connect-prompt');
  if (existing) existing.remove();

  const prompt = document.createElement('div');
  prompt.id = 'connect-prompt';
  prompt.className = 'job-detail-card';

  if (!status.connected || !status.charges_enabled) {
    prompt.style.cssText = 'border-color:rgba(255,92,0,0.4); margin-bottom:16px;';
    prompt.innerHTML = `
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <div style="font-size:24px;">💳</div>
        <div style="flex:1;">
          <div style="font-family:'Syne',sans-serif; font-size:15px; font-weight:700; margin-bottom:4px;">Set up payouts to earn</div>
          <div style="font-size:13px; color:rgba(255,255,255,0.6); margin-bottom:12px; line-height:1.5;">Connect your bank account so iHaul can pay you when you complete deliveries. Takes 2 minutes.</div>
          <button class="btn-primary" style="margin:0;" onclick="startConnectOnboarding()">Connect Bank Account →</button>
        </div>
      </div>`;
  } else {
    prompt.style.cssText = 'border-color:rgba(74,222,128,0.3); margin-bottom:16px;';
    prompt.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:13px; color:var(--green); font-weight:600;">✓ Payout account connected</div>
          <div style="font-size:12px; color:var(--gray);">Earnings deposited automatically after each delivery</div>
        </div>
        <button class="btn-ghost" onclick="openStripeDashboard()">View earnings →</button>
      </div>`;
  }
  drivePanel.insertBefore(prompt, drivePanel.firstChild);
}

// Handle return from Stripe onboarding
(function checkOnboardReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('onboard') === 'complete') {
    setTimeout(() => toast("Payout account connected! You're ready to earn. 🎉"), 800);
    window.history.replaceState({}, '', '/');
  } else if (params.get('onboard') === 'error') {
    setTimeout(() => toast('Something went wrong. Try connecting again.'), 800);
    window.history.replaceState({}, '', '/');
  }
})();
