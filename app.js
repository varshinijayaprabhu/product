const grid = document.getElementById('grid');
const statusText = document.getElementById('statusText');
const totalCount = document.getElementById('totalCount');
const visibleCount = document.getElementById('visibleCount');
const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const resetButton = document.getElementById('resetButton');
const cardTemplate = document.getElementById('cardTemplate');

let latestPayload = null;

function formatPrice(value) {
  if (value === null || Number.isNaN(value)) {
    return 'Price unavailable';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function renderProducts(products) {
  grid.innerHTML = '';

  if (!products.length) {
    grid.innerHTML = '<div class="emptyState">No matching products found.</div>';
    visibleCount.textContent = '0';
    return;
  }

  const fragment = document.createDocumentFragment();

  products.forEach((product) => {
    const node = cardTemplate.content.cloneNode(true);
    node.querySelector('.productId').textContent = product.productId;
    node.querySelector('.productName').textContent = product.productName;
    node.querySelector('.price').textContent = formatPrice(product.unitPrice);
    node.querySelector('.category').textContent = product.category || 'Unknown';
    node.querySelector('.brand').textContent = product.brand || 'Unknown';
    node.querySelector('.subCategory').textContent = product.subCategory || 'Unspecified';
    node.querySelector('.country').textContent = product.manufacturingCountry || 'Unknown';
    fragment.appendChild(node);
  });

  grid.appendChild(fragment);
  visibleCount.textContent = String(products.length);
}

async function loadCategories() {
  const response = await fetch('/api/categories');
  const payload = await response.json();

  payload.categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (categorySelect.value) params.set('category', categorySelect.value);

  statusText.textContent = 'Loading products...';
  const response = await fetch(`/api/products?${params.toString()}`);
  latestPayload = await response.json();

  totalCount.textContent = String(latestPayload.total);
  renderProducts(latestPayload.products);
  statusText.textContent = `Showing ${latestPayload.count} of ${latestPayload.total} products`;
}

let searchTimer = null;
function scheduleReload() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    loadProducts().catch((error) => {
      statusText.textContent = `Failed to load products: ${error.message}`;
    });
  }, 180);
}

searchInput.addEventListener('input', scheduleReload);
categorySelect.addEventListener('change', () => {
  loadProducts().catch((error) => {
    statusText.textContent = `Failed to load products: ${error.message}`;
  });
});
resetButton.addEventListener('click', () => {
  searchInput.value = '';
  categorySelect.value = '';
  loadProducts().catch((error) => {
    statusText.textContent = `Failed to load products: ${error.message}`;
  });
});

Promise.all([loadCategories(), loadProducts()]).catch((error) => {
  statusText.textContent = `Failed to initialize page: ${error.message}`;
});