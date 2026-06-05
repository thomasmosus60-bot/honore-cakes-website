# Honore Cakes Website

Backend API for the Honore Cakes website.

## Requirements

- Node.js 20 or newer

## Development

```bash
npm run dev
```

The API starts on `http://localhost:3000` by default. Set `PORT` to run on a different port.

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
