# Honore Cakes Website

Backend API for the Honore Cakes website.

## Requirements

- Node.js 20 or newer

## Development

```bash
npm run dev
```

The API starts on `http://localhost:3000` by default. Set `PORT` to run on a different port.

Set these environment variables before enabling admin product management:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

CORS defaults to `https://honorecake.netlify.app`. Set `CORS_ORIGIN` to override it.

## Scripts

- `npm start` - run the backend API
- `npm run dev` - run the backend API with Node watch mode
- `npm test` - run the API test suite

## API Endpoints

### `GET /api/health`

Returns service health information.

### `GET /api/cakes`

Returns all cake catalog items. Add `?featured=true` to return only featured cakes.

### `GET /api/cakes/:id`

Returns one cake catalog item by id.

### `POST /api/inquiries`

Accepts customer inquiry JSON. Required fields:

- `name`
- `email`
- `message`

Optional fields:

- `cakeId`

### `GET /api/products`

Returns all product items. Add `?featured=true` to return only featured products.

### `GET /api/products/:id`

Returns one product by id.

### `POST /api/admin/login`

Accepts admin login JSON with `email` and `password`. Credentials are checked against `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Returns a bearer token for product management requests.

### `POST /api/products`

Creates a product. Requires `Authorization: Bearer <token>`.

Required fields:

- `id`
- `name`
- `description`
- `category`
- `price`
- `image`
- `flavours`
- `size`
- `featured`

### `PUT /api/products/:id`

Updates a product. Requires `Authorization: Bearer <token>`.

### `DELETE /api/products/:id`

Deletes a product. Requires `Authorization: Bearer <token>`.
