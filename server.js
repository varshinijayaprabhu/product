const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const port = process.env.PORT || 3000;
const host = '0.0.0.0';
const rootDir = __dirname;
const csvPath = path.join(rootDir, 'Product.csv');
const docsPath = path.join(rootDir, 'index.html');
const stylePath = path.join(rootDir, 'styles.css');
const scriptPath = path.join(rootDir, 'app.js');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        cell += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === ',' && !insideQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      }

      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeProduct(record) {
  const price = Number.parseFloat(record.UnitPrice);
  return {
    productId: record.ProductID.trim(),
    productName: record.ProductName.trim(),
    category: (record.Category || '').trim(),
    brand: (record.Brand || '').trim() || 'Unknown',
    subCategory: (record.SubCategory || '').trim() || 'Unspecified',
    unitPrice: Number.isFinite(price) && price >= 0 ? price : null,
    manufacturingCountry: (record.ManufacturingCountry || '').trim() || 'Unknown',
  };
}

function loadProducts() {
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csvText);
  const headers = rows.shift();
  const mapped = rows
    .filter((row) => row.length > 1)
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? '';
      });
      return normalizeProduct(record);
    });

  const unique = [];
  const seen = new Set();
  for (const product of mapped) {
    const key = product.productId;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(product);
  }

  return unique;
}

function sendHeaders(res, statusCode, contentType, contentLength) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': contentLength,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
}

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  sendHeaders(res, statusCode, 'application/json; charset=utf-8', body.length);
  res.end(body);
}

function sendHtml(res, statusCode, body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  sendHeaders(res, statusCode, 'text/html; charset=utf-8', buffer.length);
  res.end(buffer);
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }

  if (filePath.endsWith('.js')) {
    return 'application/javascript; charset=utf-8';
  }

  return 'text/html; charset=utf-8';
}

function sendNotFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function filterProducts(search, category) {
  return products.filter((product) => {
    const matchesSearch = !search || [
      product.productId,
      product.productName,
      product.category,
      product.brand,
      product.subCategory,
      product.manufacturingCountry,
    ].some((value) => value.toLowerCase().includes(search));

    const matchesCategory = !category || product.category.toLowerCase().includes(category);

    return matchesSearch && matchesCategory;
  });
}

function buildPayload(filtered) {
  return {
    count: filtered.length,
    total: products.length,
    products: filtered,
  };
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      sendNotFound(res);
      return;
    }

    sendHeaders(res, 200, contentType, buffer.length);
    res.end(buffer);
  });
}

const products = loadProducts();

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    sendHeaders(res, 204, 'text/plain; charset=utf-8', 0);
    res.end();
    return;
  }

  const requestUrl = url.parse(req.url, true);

  if (requestUrl.pathname === '/') {
    serveFile(res, docsPath, 'text/html; charset=utf-8');
    return;
  }

  if (requestUrl.pathname === '/index.html') {
    serveFile(res, docsPath, 'text/html; charset=utf-8');
    return;
  }

  if (requestUrl.pathname === '/styles.css') {
    serveFile(res, stylePath, contentTypeFor(stylePath));
    return;
  }

  if (requestUrl.pathname === '/app.js') {
    serveFile(res, scriptPath, contentTypeFor(scriptPath));
    return;
  }

  if (requestUrl.pathname === '/api/products') {
    const search = (requestUrl.query.search || '').toString().trim().toLowerCase();
    const category = (requestUrl.query.category || '').toString().trim().toLowerCase();

    sendJson(res, 200, buildPayload(filterProducts(search, category)));
    return;
  }

  if (requestUrl.pathname === '/api/categories') {
    const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort();
    sendJson(res, 200, { categories });
    return;
  }

  if (requestUrl.pathname === '/docs') {
    serveFile(res, docsPath, 'text/html; charset=utf-8');
    return;
  }

  sendNotFound(res);
});

server.listen(port, host, () => {
  console.log(`Public API running at http://${host}:${port}`);
});