/* ═══════════════════════════════════════════
   EBEVON — LISTINGS PAGE JS
═══════════════════════════════════════════ */

const ALL_CARS = [
  { id:1,  brand:'BMW',          name:'M5 Competition',      year:2024, price:45000000, condition:'Foreign Used', health:88, img:'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=600&q=80', fuel:'Petrol',   mileage:'12,000 km', location:'Lagos',   seller:'Lagos Motor Hub', verified:true },
  { id:2,  brand:'Mercedes-Benz',name:'GLE 450 AMG',         year:2025, price:68000000, condition:'Brand New',    health:100,img:'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?w=600&q=80', fuel:'Petrol',   mileage:'0 km',       location:'Abuja',   seller:'Abuja AutoMart',  verified:true },
  { id:3,  brand:'Toyota',       name:'Land Cruiser GXR',    year:2023, price:52000000, condition:'Foreign Used', health:91, img:'https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=600&q=80', fuel:'Petrol',   mileage:'8,500 km',   location:'Lagos',   seller:'Bayo Autos',      verified:true },
  { id:4,  brand:'Lexus',        name:'LX 600 Sport',        year:2025, price:78000000, condition:'Brand New',    health:100,img:'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=600&q=80', fuel:'Hybrid',   mileage:'0 km',       location:'Rivers',  seller:'PH Motors',       verified:true },
  { id:5,  brand:'Tesla',        name:'Model S Plaid',       year:2024, price:55000000, condition:'Foreign Used', health:94, img:'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=600&q=80', fuel:'Electric', mileage:'5,200 km',   location:'Lagos',   seller:'EV Nigeria',      verified:true },
  { id:6,  brand:'Porsche',      name:'Cayenne GTS',         year:2023, price:62000000, condition:'Foreign Used', health:82, img:'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=600&q=80', fuel:'Petrol',   mileage:'18,000 km',  location:'Oyo',     seller:'Ibadan Premium',  verified:false },
  { id:7,  brand:'Honda',        name:'Accord Sport 2.0T',   year:2022, price:12000000, condition:'Nigerian Used',health:72, img:'https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?w=600&q=80', fuel:'Petrol',   mileage:'55,000 km',  location:'Lagos',   seller:'Segun Cars',      verified:true },
  { id:8,  brand:'Toyota',       name:'Camry XSE V6',        year:2023, price:14500000, condition:'Foreign Used', health:86, img:'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=600&q=80', fuel:'Petrol',   mileage:'14,000 km',  location:'Kano',    seller:'Kano Autos',      verified:true },
  { id:9,  brand:'Range Rover',  name:'Sport HSE Dynamic',   year:2024, price:85000000, condition:'Brand New',    health:100,img:'https://images.unsplash.com/photo-1571987502227-9231b837d92a?w=600&q=80', fuel:'Petrol',   mileage:'0 km',       location:'Lagos',   seller:'Range World NG',  verified:true },
  { id:10, brand:'Audi',         name:'Q7 S-Line',           year:2022, price:38000000, condition:'Foreign Used', health:79, img:'https://images.unsplash.com/photo-1489824904134-891ab64532f1?w=600&q=80', fuel:'Diesel',   mileage:'28,000 km',  location:'Abuja',   seller:'Capital Autos',   verified:false },
  { id:11, brand:'Ford',         name:'Mustang GT Premium',  year:2023, price:29000000, condition:'Foreign Used', health:88, img:'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=600&q=80', fuel:'Petrol',   mileage:'9,000 km',   location:'Lagos',   seller:'American Motors',  verified:true },
  { id:12, brand:'Hyundai',      name:'Tucson N-Line',       year:2024, price:16000000, condition:'Brand New',    health:100,img:'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=600&q=80', fuel:'Hybrid',   mileage:'0 km',       location:'Delta',   seller:'Warri Auto',      verified:true },
];

const PER_PAGE = 9;
let currentPage = 1;
let currentView = 'grid';
let filtered = [...ALL_CARS];

function formatPrice(n) {
  if (n >= 1000000) return '₦' + (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return '₦' + n.toLocaleString();
}

function badgeClass(c) {
  if (c === 'Brand New')    return 'badge-new';
  if (c === 'Foreign Used') return 'badge-foreign';
  return 'badge-used';
}

function renderCars() {
  const grid = document.getElementById('carsGrid');
  const start = (currentPage - 1) * PER_PAGE;
  const page  = filtered.slice(start, start + PER_PAGE);

  if (!page.length) {
    grid.innerHTML = `<div class="no-results"><i class="fas fa-car-burst"></i><p>No cars match your filters. Try adjusting them.</p></div>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  grid.innerHTML = page.map(car => `
    <a href="car-detail.html?id=${car.id}" class="car-card" style="display:block">
      <div class="car-card-img">
        <img src="${car.img}" alt="${car.name}" loading="lazy" />
        <span class="car-badge ${badgeClass(car.condition)}">${car.condition}</span>
        ${car.verified ? '<span style="position:absolute;top:12px;right:12px;background:rgba(34,197,94,0.9);color:#fff;font-size:0.68rem;font-weight:700;padding:3px 8px;border-radius:50px"><i class="fas fa-shield-check"></i> Verified</span>' : ''}
      </div>
      <div class="car-card-body">
        <div class="car-card-brand">${car.brand}</div>
        <div class="car-card-name">${car.year} ${car.name}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px">
          <i class="fas fa-user" style="color:var(--border)"></i> ${car.seller}
          ${car.verified ? '<span class="seller-badge"><i class="fas fa-shield-check"></i> Verified Seller</span>' : ''}
        </div>
        <div class="car-card-price">${formatPrice(car.price)}</div>
        <div class="car-card-meta">
          <span><i class="fas fa-gas-pump"></i> ${car.fuel}</span>
          <span><i class="fas fa-road"></i> ${car.mileage}</span>
          <span><i class="fas fa-map-marker-alt"></i> ${car.location}</span>
        </div>
        <div class="health-mini">
          <div class="health-mini-label">
            <span>Health</span>
            <span style="color:${getHealthColor(car.health)}">${getHealthLabel(car.health)} (${car.health}%)</span>
          </div>
          <div class="health-mini-bar">
            <div class="health-mini-fill" style="width:${car.health}%;background:${getHealthColor(car.health)}"></div>
          </div>
        </div>
      </div>
    </a>
  `).join('');

  document.getElementById('shownCount').textContent = Math.min(start + PER_PAGE, filtered.length);
  document.getElementById('totalCount').textContent  = filtered.length;
  renderPagination();
}

function renderPagination() {
  const total = Math.ceil(filtered.length / PER_PAGE);
  const pg = document.getElementById('pagination');
  if (total <= 1) { pg.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= total; i++) {
    html += `<button class="page-btn${i === currentPage ? ' active' : ''}" onclick="changePage(${i})">${i}</button>`;
  }
  pg.innerHTML = html;
}

function changePage(n) {
  currentPage = n;
  renderCars();
  window.scrollTo({ top: 300, behavior: 'smooth' });
}

function applyFilters() {
  const brand    = document.getElementById('filterBrand').value;
  const year     = document.getElementById('filterYear').value;
  const maxPrice = parseInt(document.getElementById('priceRange').value);
  const minHealth= parseInt(document.getElementById('healthRange').value);
  const sortBy   = document.getElementById('sortSelect').value;
  const location = document.getElementById('filterLocation').value;

  const conditions = [...document.querySelectorAll('.cond-check:checked')].map(c => c.value);
  const fuels      = [...document.querySelectorAll('.fuel-check:checked')].map(c => c.value);

  filtered = ALL_CARS.filter(car => {
    if (brand    && car.brand !== brand)          return false;
    if (year     && !String(car.year).includes(year.replace(' & older', ''))) return false;
    if (location && car.location !== location)    return false;
    if (car.price > maxPrice)                     return false;
    if (car.health < minHealth)                   return false;
    if (!conditions.includes(car.condition))      return false;
    if (!fuels.includes(car.fuel))                return false;
    return true;
  });

  if (sortBy === 'price_asc')  filtered.sort((a,b) => a.price - b.price);
  if (sortBy === 'price_desc') filtered.sort((a,b) => b.price - a.price);
  if (sortBy === 'health')     filtered.sort((a,b) => b.health - a.health);

  currentPage = 1;
  renderCars();
}

function updatePrice(el) {
  const v = parseInt(el.value);
  document.getElementById('priceLabel').textContent = v >= 200000000 ? '₦200M+' : '₦' + (v/1000000).toFixed(0) + 'M';
  applyFilters();
}

function updateHealth(el) {
  document.getElementById('healthLabel').textContent = el.value + '%+';
  applyFilters();
}

function resetFilters() {
  document.getElementById('filterBrand').value    = '';
  document.getElementById('filterYear').value     = '';
  document.getElementById('filterLocation').value = '';
  document.getElementById('priceRange').value     = 200000000;
  document.getElementById('healthRange').value    = 0;
  document.getElementById('priceLabel').textContent  = '₦200M+';
  document.getElementById('healthLabel').textContent  = '0%+';
  document.querySelectorAll('.cond-check, .fuel-check').forEach(c => c.checked = true);
  filtered = [...ALL_CARS];
  currentPage = 1;
  renderCars();
}

function setView(v) {
  currentView = v;
  const grid = document.getElementById('carsGrid');
  grid.classList.toggle('list-view', v === 'list');
  document.getElementById('gridViewBtn').classList.toggle('active', v === 'grid');
  document.getElementById('listViewBtn').classList.toggle('active', v === 'list');
}

// Apply URL params on load
(function() {
  const p = new URLSearchParams(location.search);
  if (p.get('brand')) { document.getElementById('filterBrand').value = p.get('brand'); }
  if (p.get('condition')) {
    document.querySelectorAll('.cond-check').forEach(c => { c.checked = c.value === p.get('condition'); });
  }
  applyFilters();
})();
