import { test, expect } from '@playwright/test';

test.describe('Contact Automation Platform E2E Flows', () => {
  test('authenticates administrator and loads dashboard with real-time metrics', async ({ page }) => {
    await page.goto('/');

    // Check login page presence
    await expect(page.locator('text=Contact Automation Platform')).toBeVisible();

    // Click quick review administrator login
    await page.click('button:has-text("Enter as Platform Administrator")');

    // Verify dashboard navigation
    await expect(page.locator('text=Platform Overview')).toBeVisible();
    await expect(page.locator('text=Total Contacts')).toBeVisible();
    await expect(page.locator('text=Active Campaigns')).toBeVisible();
  });

  test('navigates between application pages seamlessly', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Enter as Platform Administrator")');

    // Navigate to Contacts
    await page.click('button:has-text("Contacts")');
    await expect(page.locator('text=Contact Directory')).toBeVisible();

    // Navigate to Import Contacts
    await page.click('button:has-text("Import Contacts")');
    await expect(page.locator('text=Upload Excel file or drag & drop here')).toBeVisible();

    // Navigate to Campaigns
    await page.click('button:has-text("Campaigns")');
    await expect(page.locator('text=Monthly Recurring Campaigns')).toBeVisible();

    // Navigate to Templates
    await page.click('button:has-text("Templates")');
    await expect(page.locator('text=Message Templates')).toBeVisible();

    // Navigate to Message Logs
    await page.click('button:has-text("Message Logs")');
    await expect(page.locator('text=Delivery & Audit Logs')).toBeVisible();

    // Navigate to Settings
    await page.click('button:has-text("Settings")');
    await expect(page.locator('text=Platform Settings')).toBeVisible();
  });
});
