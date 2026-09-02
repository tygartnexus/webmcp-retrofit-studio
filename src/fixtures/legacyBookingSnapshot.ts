export const LEGACY_BOOKING_SNAPSHOT = Object.freeze({
  id: "synthetic-legacy-booking-v1",
  revision: "1.0.0",
  sourceKind: "bundled-synthetic-html",
  authorization: "owner-authorized",
  html: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Legacy booking fixture</title></head>
  <body>
    <main>
      <form id="booking-form">
        <label for="service-search">Search services</label>
        <input id="service-search" name="service-search" type="search" autocomplete="off">

        <label for="service-choice">Service</label>
        <select id="service-choice" name="service-choice">
          <option value="consultation">Consultation</option>
          <option value="installation">Installation</option>
          <option value="repair">Repair</option>
        </select>

        <label for="booking-date">Date</label>
        <input id="booking-date" name="booking-date" type="date">

        <label for="booking-time">Time</label>
        <input id="booking-time" name="booking-time" type="time">

        <button id="stage-booking" type="button">Review booking</button>
        <button id="confirm-booking" type="submit">Confirm booking</button>
      </form>
    </main>
  </body>
</html>`,
} as const);

export type LegacyBookingSnapshot = typeof LEGACY_BOOKING_SNAPSHOT;
