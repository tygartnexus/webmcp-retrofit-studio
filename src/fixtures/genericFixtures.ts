/**
 * Bundled synthetic HTML fixtures for the generic scanner. Each one is
 * entrant-authored, contains no real person or account, and exercises a
 * different shape of legacy interface. They exist to prove the scanner
 * generalizes beyond the booking fixture; none is fetched from the network.
 */

export interface HtmlSnapshot {
  id: string;
  revision: string;
  sourceKind: "bundled-synthetic-html" | "owner-supplied-html";
  authorization: "owner-authorized";
  title: string;
  html: string;
}

export const CONTACT_FORM_FIXTURE: HtmlSnapshot = Object.freeze({
  id: "synthetic-contact-form-v1",
  revision: "1.0.0",
  sourceKind: "bundled-synthetic-html",
  authorization: "owner-authorized",
  title: "Contact form",
  html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Contact us</title></head>
<body>
  <header><nav><a href="/">Home</a><a href="/services">Services</a></nav></header>
  <main>
    <h1>Contact us</h1>
    <form id="contact-form" method="post" action="/contact">
      <label for="full-name">Full name</label>
      <input id="full-name" name="fullName" type="text" required maxlength="80" value="">
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" required placeholder="you@example.test">
      <label for="topic">Topic</label>
      <select id="topic" name="topic">
        <option value="sales">Sales</option>
        <option value="support">Support</option>
        <option value="other">Other</option>
      </select>
      <label for="message">Message</label>
      <textarea id="message" name="message" required maxlength="2000"></textarea>
      <label><input type="checkbox" name="newsletter"> Subscribe to updates</label>
      <fieldset>
        <legend>Priority</legend>
        <label><input name="priority" type="radio" value="low" required> Low</label>
        <label><input name="priority" type="radio" value="high"> High</label>
      </fieldset>
      <button type="submit">Send message</button>
    </form>
  </main>
</body></html>`,
});

export const SEARCH_FILTERS_FIXTURE: HtmlSnapshot = Object.freeze({
  id: "synthetic-search-filters-v1",
  revision: "1.0.0",
  sourceKind: "bundled-synthetic-html",
  authorization: "owner-authorized",
  title: "Catalog search with filters",
  html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Catalog</title>
<script>window.__legacy = true;</script></head>
<body>
  <main>
    <h1>Product catalog</h1>
    <form id="catalog-search" method="get" action="/catalog" role="search">
      <label for="q">Search products</label>
      <input id="q" name="q" type="search" placeholder="Keyword">
      <label for="category">Category</label>
      <select id="category" name="category">
        <option value="">Any</option>
        <option value="tools">Tools</option>
        <option value="parts">Parts</option>
        <option value="safety">Safety gear</option>
      </select>
      <label for="min-price">Minimum price</label>
      <input id="min-price" name="minPrice" type="number" min="0" max="5000" step="1">
      <label for="max-price">Maximum price</label>
      <input id="max-price" name="maxPrice" type="number" min="0" max="5000" step="1">
      <label><input type="checkbox" name="inStock"> In stock only</label>
      <button type="submit">Search</button>
    </form>
    <img src="/banner.png" alt="Seasonal banner">
  </main>
</body></html>`,
});

export const DATA_TABLE_FIXTURE: HtmlSnapshot = Object.freeze({
  id: "synthetic-data-table-v1",
  revision: "1.0.0",
  sourceKind: "bundled-synthetic-html",
  authorization: "owner-authorized",
  title: "Orders table with pagination",
  html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Orders</title></head>
<body>
  <main>
    <h1>Recent orders</h1>
    <table id="orders">
      <thead><tr><th>Order</th><th>Status</th><th>Total</th><th>Placed</th></tr></thead>
      <tbody>
        <tr><td>A-1001</td><td>Shipped</td><td>42.00</td><td>2026-09-01</td></tr>
        <tr><td>A-1002</td><td>Processing</td><td>18.50</td><td>2026-09-02</td></tr>
        <tr><td>A-1003</td><td>Delivered</td><td>99.99</td><td>2026-09-03</td></tr>
      </tbody>
    </table>
    <nav aria-label="Pagination">
      <a href="/orders?page=1" rel="prev">Previous</a>
      <span>Page 2 of 7</span>
      <a href="/orders?page=3" rel="next">Next</a>
    </nav>
  </main>
</body></html>`,
});

export const CHECKOUT_FIXTURE: HtmlSnapshot = Object.freeze({
  id: "synthetic-checkout-v1",
  revision: "1.0.0",
  sourceKind: "bundled-synthetic-html",
  authorization: "owner-authorized",
  title: "Checkout with coupon and final order",
  html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Checkout</title></head>
<body>
  <main>
    <h1>Checkout</h1>
    <form id="coupon-form" method="post" action="/cart/coupon">
      <label for="coupon">Coupon code</label>
      <input id="coupon" name="coupon" type="text" pattern="[A-Z0-9]{4,12}" maxlength="12">
      <button type="submit">Apply coupon</button>
    </form>
    <form id="order-form" method="post" action="/checkout/place">
      <h2>Shipping address</h2>
      <label for="street">Street</label>
      <input id="street" name="street" type="text" required>
      <label for="city">City</label>
      <input id="city" name="city" type="text" required>
      <label for="postal">Postal code</label>
      <input id="postal" name="postalCode" type="text" required pattern="[0-9]{5}">
      <label for="card">Card number</label>
      <input id="card" name="cardNumber" type="text" inputmode="numeric" autocomplete="cc-number" required>
      <input type="hidden" name="cartToken" value="hidden-token-should-not-be-retained">
      <button type="submit">Place order</button>
    </form>
  </main>
</body></html>`,
});

export const LOGIN_FIXTURE: HtmlSnapshot = Object.freeze({
  id: "synthetic-login-v1",
  revision: "1.0.0",
  sourceKind: "bundled-synthetic-html",
  authorization: "owner-authorized",
  title: "Login form",
  html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sign in</title></head>
<body>
  <main>
    <h1>Sign in</h1>
    <form id="login-form" method="post" action="/session">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" required autocomplete="username">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autocomplete="current-password">
      <button type="submit">Sign in</button>
    </form>
  </main>
</body></html>`,
});

export const GENERIC_FIXTURES: readonly HtmlSnapshot[] = Object.freeze([
  CONTACT_FORM_FIXTURE,
  SEARCH_FILTERS_FIXTURE,
  DATA_TABLE_FIXTURE,
  CHECKOUT_FIXTURE,
  LOGIN_FIXTURE,
]);
