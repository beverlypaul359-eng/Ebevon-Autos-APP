/* ═══════════════════════════════════════════
   EBEVON — CAR DETAIL PAGE JS
═══════════════════════════════════════════ */

const CARS_DB = [
  { id:1, brand:'BMW', name:'M5 Competition', year:2024, price:45000000, condition:'Foreign Used', health:88,
    imgs:['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=900&q=80','https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?w=900&q=80','https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=900&q=80','https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=900&q=80','https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=900&q=80'],
    fuel:'Petrol', mileage:'12,000 km', transmission:'Automatic', engine:'4.4L V8 Twin-Turbo', power:'625 hp',
    color:'Alpine White', seats:5, location:'Lagos', seller:'Lagos Motor Hub', verified:true,
    desc:'This 2024 BMW M5 Competition is a beast on the road. Imported directly from Germany with all papers intact. Full service history available. The car is in excellent condition with no accident history. Comes with original BMW floor mats, boot liner, and spare tyre.',
    healthBreakdown: [{ label:'Engine', score:92 },{ label:'Transmission', score:88 },{ label:'Exterior', score:90 },{ label:'Interior', score:85 },{ label:'Brakes', score:88 },{ label:'Tyres', score:80 }]
  },
  { id:2, brand:'Mercedes-Benz', name:'GLE 450 AMG', year:2025, price:68000000, condition:'Brand New', health:100,
    imgs:['https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?w=900&q=80','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=900&q=80','https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=900&q=80','https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=900&q=80','https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=900&q=80'],
    fuel:'Petrol', mileage:'0 km', transmission:'9G-TRONIC Automatic', engine:'3.0L Inline-6 Turbo', power:'367 hp',
    color:'Obsidian Black', seats:7, location:'Abuja', seller:'Abuja AutoMart', verified:true,
    desc:'Brand new 2025 Mercedes-Benz GLE 450 AMG Line. Factory fresh, never registered. Full Mercedes Nigeria warranty applies. Loaded with every available option including Burmester sound system, panoramic sunroof, 4MATIC+ AWD and AMG body styling.',
    healthBreakdown: [{ label:'Engine', score:100 },{ label:'Transmission', score:100 },{ label:'Exterior', score:100 },{ label:'Interior', score:100 },{ label:'Brakes', score:100 },{ label:'Tyres', score:100 }]
  },
];

// Fallback car for unlisted IDs
const DEFAULT_CAR = CARS_DB[0];

function formatPrice(n) {
  if (n >= 1000000) return '₦' + (n/1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return '₦' + n.toLocaleString();
}

function loadCar() {
  const params = new URLSearchParams(location.search);
  const id = parseInt(params.get('id') || '1');
  const car = CARS_DB.find(c => c.id === id) || DEFAULT_CAR;

  // Breadcrumb + title
  document.getElementById('breadName').textContent = car.year + ' ' + car.brand + ' ' + car.name;
  document.getElementById('carTitle2').textContent = car.year + ' ' + car.brand + ' ' + car.name;
  document.title = car.year + ' ' + car.brand + ' ' + car.name + ' – EBEVON';

  // Main image
  document.getElementById('mainImg').src = car.imgs[0];
  document.getElementById('mainImg').alt = car.name;

  // Thumbnails
  const thumbsRow = document.getElementById('thumbsRow');
  thumbsRow.innerHTML = car.imgs.map((img, i) => `
    <div class="gallery-thumb ${i===0?'active':''}" onclick="setMainImg('${img}', this)">
      <img src="${img}" alt="View ${i+1}" loading="lazy" />
    </div>`).join('');

  // Price
  document.getElementById('sidePrice').textContent = formatPrice(car.price);

  // Seller
  document.getElementById('sellerName').textContent = car.seller;
  document.getElementById('sellerLocation').innerHTML = '<i class="fas fa-map-marker-alt"></i> ' + car.location;

  // Specs
  const specs = [
    { label:'Brand',        val: car.brand },
    { label:'Year',         val: car.year },
    { label:'Condition',    val: car.condition },
    { label:'Fuel',         val: car.fuel },
    { label:'Mileage',      val: car.mileage },
    { label:'Transmission', val: car.transmission },
    { label:'Engine',       val: car.engine },
    { label:'Power',        val: car.power },
    { label:'Colour',       val: car.color },
    { label:'Seats',        val: car.seats },
    { label:'Location',     val: car.location },
  ];
  document.getElementById('specList').innerHTML = specs.map(s => `
    <div class="spec-row"><span class="spec-label">${s.label}</span><span class="spec-val">${s.val}</span></div>`).join('');

  // Description
  document.getElementById('carDesc').textContent = car.desc;

  // Health bar
  setTimeout(() => {
    const fill  = document.getElementById('healthFill');
    const label = document.getElementById('healthLabel');
    const pct   = document.getElementById('healthPct');
    fill.style.width = car.health + '%';
    fill.style.background = getHealthColor(car.health);
    label.textContent = getHealthLabel(car.health);
    label.style.color = getHealthColor(car.health);
    pct.textContent  = car.health + '%';
    pct.style.color  = getHealthColor(car.health);
  }, 300);

  // Health breakdown tiles
  document.getElementById('healthBreakdown').innerHTML = car.healthBreakdown.map(b => `
    <div style="background:var(--dark-4);border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;text-transform:uppercase">${b.label}</div>
      <div style="font-size:1rem;font-weight:700;color:${getHealthColor(b.score)}">${b.score}%</div>
      <div style="height:4px;background:var(--dark-5);border-radius:99px;margin-top:6px;overflow:hidden">
        <div style="width:${b.score}%;height:100%;background:${getHealthColor(b.score)};border-radius:99px"></div>
      </div>
    </div>`).join('');
}

function setMainImg(src, thumb) {
  document.getElementById('mainImg').src = src;
  document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
}

function showVideo(panel, btn) {
  document.querySelectorAll('.video-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
  document.getElementById('video-' + panel).classList.add('active');
  btn.classList.add('active');
}

document.addEventListener('DOMContentLoaded', loadCar);
