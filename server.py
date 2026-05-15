from __future__ import annotations

import csv
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT_DIR = Path(__file__).resolve().parent
CSV_PATH = ROOT_DIR / 'Product.csv'
DOCS_PATH = ROOT_DIR / 'index.html'
STYLE_PATH = ROOT_DIR / 'styles.css'
SCRIPT_PATH = ROOT_DIR / 'app.js'
HOST = '0.0.0.0'
PORT = int(os.environ.get('PORT', '8000'))


def normalize_text(value: str | None, fallback: str = 'Unknown') -> str:
    text = (value or '').strip()
    return text if text else fallback


def load_products() -> list[dict[str, object]]:
    products: list[dict[str, object]] = []
    seen_ids: set[str] = set()

    with CSV_PATH.open('r', encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            product_id = normalize_text(row.get('ProductID'), '')
            if not product_id or product_id in seen_ids:
                continue

            raw_price = normalize_text(row.get('UnitPrice'), '')
            try:
                parsed_price = float(raw_price)
                unit_price = parsed_price if parsed_price >= 0 else None
            except ValueError:
                unit_price = None

            products.append(
                {
                    'productId': product_id,
                    'productName': normalize_text(row.get('ProductName'), ''),
                    'category': normalize_text(row.get('Category'), 'Unknown'),
                    'brand': normalize_text(row.get('Brand'), 'Unknown'),
                    'subCategory': normalize_text(row.get('SubCategory'), 'Unspecified'),
                    'unitPrice': unit_price,
                    'manufacturingCountry': normalize_text(row.get('ManufacturingCountry'), 'Unknown'),
                }
            )
            seen_ids.add(product_id)

    return products


PRODUCTS = load_products()
ALL_CATEGORIES = sorted({product['category'] for product in PRODUCTS if product['category']})


def filter_products(search: str, category: str) -> list[dict[str, object]]:
    def matches(product: dict[str, object]) -> bool:
        fields = [
            str(product['productId']),
            str(product['productName']),
            str(product['category']),
            str(product['brand']),
            str(product['subCategory']),
            str(product['manufacturingCountry']),
        ]

        matches_search = not search or any(search in field.lower() for field in fields)
        matches_category = not category or category in str(product['category']).lower()
        return matches_search and matches_category

    return [product for product in PRODUCTS if matches(product)]


def build_payload(filtered: list[dict[str, object]]) -> dict[str, object]:
    return {'count': len(filtered), 'total': len(PRODUCTS), 'products': filtered}


class CatalogHandler(BaseHTTPRequestHandler):
    def _content_type(self, path: Path) -> str:
        if path.suffix == '.css':
            return 'text/css; charset=utf-8'
        if path.suffix == '.js':
            return 'application/javascript; charset=utf-8'
        return 'text/html; charset=utf-8'

    def _send_headers(self, status: int, content_type: str, content_length: int) -> None:
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(content_length))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _write(self, status: int, content_type: str, body: bytes) -> None:
        self._send_headers(status, content_type, len(body))
        self.wfile.write(body)

    def _json(self, status: int, payload: dict[str, object]) -> None:
        self._write(status, 'application/json; charset=utf-8', json.dumps(payload).encode('utf-8'))

    def _html(self, status: int, body: bytes) -> None:
        self._write(status, 'text/html; charset=utf-8', body)

    def _not_found(self) -> None:
        self._json(404, {'error': 'Not found'})

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_headers(204, 'text/plain; charset=utf-8', 0)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        search = params.get('search', [''])[0].strip().lower()
        category = params.get('category', [''])[0].strip().lower()

        if parsed.path == '/':
            self._html(200, DOCS_PATH.read_bytes())
            return

        if parsed.path == '/index.html':
            self._html(200, DOCS_PATH.read_bytes())
            return

        if parsed.path == '/styles.css' and STYLE_PATH.exists():
            self._write(200, self._content_type(STYLE_PATH), STYLE_PATH.read_bytes())
            return

        if parsed.path == '/app.js' and SCRIPT_PATH.exists():
            self._write(200, self._content_type(SCRIPT_PATH), SCRIPT_PATH.read_bytes())
            return

        if parsed.path == '/api/products':
            self._json(200, build_payload(filter_products(search, category)))
            return

        if parsed.path == '/api/categories':
            self._json(200, {'categories': ALL_CATEGORIES})
            return

        if parsed.path == '/docs' and DOCS_PATH.exists():
            self._html(200, DOCS_PATH.read_bytes())
            return

        self._not_found()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        return


if __name__ == '__main__':
    server = ThreadingHTTPServer((HOST, PORT), CatalogHandler)
    print(f'Public API running at http://{HOST}:{PORT}')
    server.serve_forever()