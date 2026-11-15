# Kish perfume store

## Run locally

Install Node.js 20 or newer, open this folder in PowerShell, and run:

```powershell
node server.js
```

Open [http://localhost:3000](http://localhost:3000). Set the `PORT` environment variable to use a different port.

## Publish a free static demo on GitHub Pages

GitHub Pages hosts the storefront without running the Node.js backend. The product catalog and bag work as a demo, but orders and newsletter signups are not saved and checkout does not take payment.

1. In the GitHub repository, open **Settings** → **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and `/(root)` folder, then click **Save**.
4. Wait for the Pages deployment, then open the URL shown on the Pages settings screen. It will look like `https://YOUR-USERNAME.github.io/kish-perfume-store/`.

## Publish on Render

This project includes a Render Blueprint in `render.yaml`.

1. Create a GitHub repository and upload this project. Keep `data/store.json` out of Git; `.gitignore` already excludes it.
2. In Render, choose **New +** → **Blueprint** and connect that GitHub repository.
3. Confirm the `kish-perfume-store` web service and choose **Apply**.
4. Once the deploy finishes, open the public `onrender.com` URL shown on the service page.

The free service is suitable for trying out the website. Its local filesystem is not persistent, so orders and newsletter subscriptions saved in `data/store.json` may be lost when the service restarts or redeploys. Set up persistent storage or a production database before relying on saved customer data. Checkout does not process payments.

## API

- `GET /api/products` — return the product catalog.
- `POST /api/newsletter` — save an email address. JSON body: `{"email":"you@example.com"}`.
- `POST /api/orders` — save a pending order. JSON body: `{"items":[{"productId":"golden-hour","quantity":1}]}`.

Orders and newsletter subscriptions are stored in `data/store.json`, which is excluded from Git. Product prices and order totals are validated and calculated on the server.

Checkout currently saves orders as `awaiting_payment`; it does not collect shipping details or process a payment. Connect a payment provider and production database before accepting real orders.
