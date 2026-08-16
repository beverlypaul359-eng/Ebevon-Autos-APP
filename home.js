/* ═══════════════════════════════════════════
   EBEVON — HOME PAGE JS (featured cars)
═══════════════════════════════════════════ */

const featuredCars = [
  { id:1, brand:'BMW', name:'M5 Competition', year:2024, price:'₦45,000,000', condition:'Foreign Used', health:88, img:'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=600&q=80', fuel:'Petrol', mileage:'12,000 km' },
  { id:2, brand:'Mercedes-Benz', name:'GLE 450 AMG', year:2025, price:'₦68,000,000', condition:'Brand New', health:100, img:'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?w=600&q=80', fuel:'Petrol', mileage:'0 km' },
  { id:3, brand:'Toyota', name:'Land Cruiser GXR', year:2023, price:'₦52,000,000', condition:'Foreign Used', health:91, img:'https://images.unsplash.com/photo-1580274455191-1c62238fa333?w=600&q=80', fuel:'Petrol', mileage:'8,500 km' },
  { id:4, brand:'Lexus', name:'LX 600 Sport', year:2025, price:'₦78,000,000', condition:'Brand New', health:100, img:'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=600&q=80', fuel:'Hybrid', mileage:'0 km' },
  { id:5, brand:'Tesla', name:'Model S Plaid', year:2024, price:'₦55,000,000', condition:'Foreign Used', health:94, img:'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=600&q=80', fuel:'Electric', mileage:'5,200 km' },
  { id:6, brand:'Porsche', name:'Cayenne GTS', year:2023, price:'₦62,000,000', condition:'Foreign Used', health:82, img:'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=600&q=80', fuel:'Petrol', mileage:'18,000 km' },
];

function badgeClass(condition) {
  if (condition === 'Brand New') return 'badge-new';
  if (condition === 'Foreign Used') return 'badge-foreign';
  return 'badge-used';
}

function renderFeaturedCars() {
  const grid = document.getElementById('featuredCars');
  if (!grid) return;
  grid.innerHTML = featuredCars.map(car => `
    <a href="pages/car-detail.html?id=${car.id}" class="car-card" style="display:block;">
      <div class="car-card-img">
        <img src="${car.img}" alt="${car.brand} ${car.name}" loading="lazy" />
        <span class="car-badge ${badgeClass(car.condition)}">${car.condition}</span>
      </div>
      <div class="car-card-body">
        <div class="car-card-brand">${car.brand}</div>
        <div class="car-card-name">${car.year} ${car.name}</div>
        <div class="car-card-price">${car.price}</div>
        <div class="car-card-meta">
          <span><i class="fas fa-gas-pump"></i> ${car.fuel}</span>
          <span><i class="fas fa-road"></i> ${car.mileage}</span>
        </div>
        <div class="health-mini">
          <div class="health-mini-label">
            <span>Vehicle Health</span>
            <span style="color:${getHealthColor(car.health)}">${getHealthLabel(car.health)}</span>
          </div>
          <div class="health-mini-bar">
            <div class="health-mini-fill" style="width:${car.health}%; background:${getHealthColor(car.health)};"></div>
          </div>
        </div>
      </div>
    </a>
  `).join('');
}

document.addEventListener('DOMContentLoaded', renderFeaturedCars);
