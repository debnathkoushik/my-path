import { test, expect } from '@playwright/test';

test.describe('Places of Interest (POI) Discovery with Simulator', () => {
  test('makes fetch-pois API request as designed and renders ThrottledPoiMarkers', async ({ page }) => {
    const mockPois = [
      {
        id: 'node/100001',
        osmId: '100001',
        osmType: 'node',
        lat: 37.7751,
        lng: -122.4190,
        name: 'Simulated Coffee Spot',
        category: 'cafe',
        tags: { amenity: 'cafe', name: 'Simulated Coffee Spot' },
      },
      {
        id: 'way/200002',
        osmId: '200002',
        osmType: 'way',
        lat: 37.7745,
        lng: -122.4185,
        name: 'Simulated City Garden',
        category: 'park',
        tags: { leisure: 'park', name: 'Simulated City Garden' },
      },
    ];

    /** @type {any[]} */
    const capturedApiRequests = [];

    // 1. Intercept cache lookup to simulate a cache miss, ensuring Edge Function is invoked
    await page.route('**/rest/v1/poi_cache*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // 2. Intercept Edge Function API request to verify payload and return mocked POIs
    await page.route('**/functions/v1/fetch-pois', async (route) => {
      const request = route.request();
      const body = request.postDataJSON();

      capturedApiRequests.push({
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        body,
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pois: mockPois }),
      });
    });

    // 3. Open application
    await page.goto('/');

    // 4. Toggle GPS Simulator
    const simulatorButton = page.getByRole('button', { name: /Use Simulator/i });
    await expect(simulatorButton).toBeVisible();
    await simulatorButton.click();

    // Verify simulator is active
    await expect(page.getByRole('button', { name: /Simulating/i })).toBeVisible();
    await expect(page.getByText(/Sim Active/i)).toBeVisible();

    // 5. Start tracking session
    const startTrackingButton = page.getByRole('button', { name: /Start Tracking/i });
    await expect(startTrackingButton).toBeVisible();
    await startTrackingButton.click();

    // Confirm tracking has started
    await expect(page.getByRole('button', { name: /Stop & Save/i })).toBeVisible();

    // 6. Assert API request was made as designed
    await expect.poll(() => capturedApiRequests.length, {
      message: 'Expected at least one fetch-pois API call',
      timeout: 10000,
    }).toBeGreaterThanOrEqual(1);

    const firstRequest = capturedApiRequests[0];
    expect(firstRequest.method).toBe('POST');
    expect(firstRequest.body).toBeDefined();

    // Verify payload contract: coordinates match simulator start location, radius is 500m
    expect(firstRequest.body.lat).toBeCloseTo(37.7749, 3);
    expect(firstRequest.body.lng).toBeCloseTo(-122.4194, 3);
    expect(firstRequest.body.radiusMeters).toBe(500);
    expect(typeof firstRequest.body.geohash).toBe('string');
    expect(firstRequest.body.geohash.length).toBeGreaterThanOrEqual(6);

    // 7. Assert ThrottledPoiMarkers are rendered on Leaflet Map
    const poiMarkers = page.locator('.custom-leaflet-poi-marker');
    await expect(poiMarkers).toHaveCount(2, { timeout: 10000 });

    // Verify POI marker labels and category styling
    const cafeLabel = page.locator('.poi-marker-label', { hasText: 'Simulated Coffee Spot' });
    await expect(cafeLabel).toBeAttached();

    const parkLabel = page.locator('.poi-marker-label', { hasText: 'Simulated City Garden' });
    await expect(parkLabel).toBeAttached();

    // Verify category theme colors on the marker elements
    const cafeMarker = page.locator('.poi-marker[style*="--poi-color: #fb923c"]');
    await expect(cafeMarker).toBeAttached();

    const parkMarker = page.locator('.poi-marker[style*="--poi-color: #34d399"]');
    await expect(parkMarker).toBeAttached();
  });
});
