# Vercel Web Analytics Setup Guide

This guide documents the Vercel Web Analytics integration for MolieLM.

## Overview

Vercel Web Analytics is integrated into MolieLM to track user interactions, page views, and engagement metrics. This helps us understand how users are using the platform and where we can improve the experience.

## Prerequisites

- A Vercel account. If you don't have one, you can [sign up for free](https://vercel.com/signup).
- A Vercel project. If you don't have one, you can [create a new project](https://vercel.com/new).
- The Vercel CLI installed (optional but recommended):
  ```bash
  npm install -g vercel
  ```

## Implementation Details

### Package Installation

The `@vercel/analytics` package has been added to the project dependencies:

```bash
npm install @vercel/analytics
```

### Integration with React

MolieLM uses React with Vite. The Analytics component has been integrated into the main `App.tsx` component:

```tsx
import { Analytics } from '@vercel/analytics/react';

export default function App() {
  return (
    <div className="app-container">
      {/* Your app content */}
      <Analytics />
    </div>
  );
}
```

The `<Analytics />` component is placed at the end of the main App component's JSX, right before the closing div. This ensures it tracks all user interactions throughout the application.

## Enabling Web Analytics on Vercel

### Step 1: Enable in Dashboard

1. Go to the [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your MolieLM project
3. Navigate to the **Analytics** tab
4. Click **Enable** in the dialog

> **💡 Note:** Enabling Web Analytics will add new routes (scoped at `/_vercel/insights/*`) after your next deployment.

### Step 2: Deploy Your App

Deploy your application using any of these methods:

#### Via Vercel CLI:
```bash
vercel deploy
```

#### Via Git Integration:
We recommend [connecting your project's Git repository](https://vercel.com/docs/git) to Vercel. This enables automatic deployments of your latest commits to main without needing terminal commands.

#### Via Git Push:
Simply push to your main branch if your repository is connected to Vercel.

### Step 3: Verification

Once your app is deployed:

1. Visit your deployed application
2. Open your browser's Developer Tools (F12 or Cmd+Option+I)
3. Go to the **Network** tab
4. Look for a request to `/_vercel/insights/view`

If you see this request, the Analytics are properly configured and tracking data.

## Tracking Features

The Analytics component automatically tracks:

- **Page Views**: Each time a user navigates to a different page
- **Web Vitals**: Core Web Vitals metrics including:
  - Largest Contentful Paint (LCP)
  - First Input Delay (FID) / Interaction to Next Paint (INP)
  - Cumulative Layout Shift (CLS)
- **Interactions**: User interactions with your app

### Route Support

With React, route tracking is automatic when using:
- React Router
- Next.js Router
- Other routing libraries that the component detects

For MolieLM's current implementation, basic tracking is enabled out of the box.

## Viewing Analytics Data

### Initial Setup
After deployment, analytics data collection begins immediately. However:

- Initial data appears within a few minutes
- Most comprehensive data is available after 24-48 hours of traffic
- Detailed insights improve as more user data is collected

### Dashboard Access

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your MolieLM project
3. Click the **Analytics** tab

In the Analytics dashboard, you can view:

- **Real-time metrics**: Current visitors and page views
- **Page performance**: Which pages are most visited
- **Web Vitals**: Performance metrics over time
- **Geographic data**: Where your users are located
- **Traffic sources**: How users are finding your site

### Filtering and Segmentation

You can filter analytics data by:
- Time range (24 hours, 7 days, 30 days, custom)
- Geographic location
- Device type
- Page path

Learn more: [Filtering Analytics Data](https://vercel.com/docs/analytics/filtering)

## Custom Events (Pro and Enterprise Plans)

If you're on a Pro or Enterprise Vercel plan, you can track custom events such as:
- Button clicks
- Form submissions
- Purchase events
- User actions specific to your app

### Adding Custom Events

```tsx
import { trackEvent } from '@vercel/analytics/react';

// Track a custom event
trackEvent('purchase', {
  value: 99.99,
  currency: 'USD',
  product_id: 'prod_123'
});

// Simple event tracking
trackEvent('signup_clicked');
```

Learn more: [Custom Events Documentation](https://vercel.com/docs/analytics/custom-events)

## Environment Variables

No special environment variables are required for the basic Analytics setup. The component automatically detects the environment and sends data accordingly:

- In development (`dev` mode): Analytics still track but may be noisy
- In production (deployed to Vercel): Full analytics collection

## Privacy and Data Compliance

Vercel Web Analytics is designed with privacy in mind:

- **No cookies**: Analytics use cookie-free tracking
- **GDPR compliant**: Complies with GDPR and other privacy regulations
- **Privacy by design**: Minimal data collection focused on performance and usage

Learn more: [Privacy and Compliance](https://vercel.com/docs/analytics/privacy-policy)

## Troubleshooting

### Analytics Not Showing Up

**Problem**: You don't see the `/_vercel/insights/view` request in the Network tab

**Solutions**:
1. Verify that Web Analytics is enabled in the [Vercel Dashboard](https://vercel.com/dashboard)
2. Ensure you've deployed after enabling Analytics
3. Check that `@vercel/analytics` is installed in `package.json`
4. Verify that the `<Analytics />` component is in your `App.tsx`
5. Clear browser cache and reload the page
6. Try an incognito/private window

### No Data in Dashboard

**Problem**: Web Analytics is enabled and deployed, but no data appears in the dashboard

**Solutions**:
1. Wait 2-5 minutes for data to appear
2. Visit your deployed site to generate some traffic
3. Check that requests to `/_vercel/insights/*` are not being blocked
4. Verify your browser's ad blockers aren't preventing Analytics requests

### High Network Traffic from Analytics

**Problem**: Too many requests to `/_vercel/insights/` endpoints

**Solutions**:
- This is normal behavior and Analytics are optimized to minimize impact
- Requests are batched and sent efficiently
- Analytics should not significantly impact your app's performance

## Performance Impact

The Analytics component is designed to be lightweight:

- **Bundle size**: ~3KB gzipped
- **Network impact**: Minimal, with intelligent batching
- **Runtime overhead**: Negligible performance impact

## Reference Documentation

For more detailed information, see:

- [Vercel Analytics Documentation](https://vercel.com/docs/analytics)
- [@vercel/analytics Package Documentation](https://vercel.com/docs/analytics/package)
- [Pricing and Limits](https://vercel.com/docs/analytics/limits-and-pricing)
- [Core Web Vitals Guide](https://web.dev/vitals/)

## Configuration for Different Environments

### Local Development

During local development, the Analytics component won't send data to Vercel (as expected). You can still see it in your code and it won't cause any issues.

### Staging Environment

If you have a staging deployment on Vercel, Analytics will track staging traffic separately from production, allowing you to test without polluting production data.

### Production

Once deployed to production on Vercel, all analytics data is collected and available in your dashboard.

## Next Steps

After setting up Vercel Web Analytics:

1. **Monitor initial data**: Check your dashboard after 24-48 hours of traffic
2. **Set up custom events**: If on Pro/Enterprise, implement custom event tracking for your key metrics
3. **Analyze patterns**: Use the dashboard to understand user behavior
4. **Optimize**: Use insights to improve performance and user experience
5. **Configure alerts**: Set up dashboard alerts for key metrics

## Support and Issues

For issues with Vercel Web Analytics:

1. Check the [Troubleshooting guide](https://vercel.com/docs/analytics/troubleshooting)
2. Review [Vercel status page](https://www.vercel-status.com/)
3. Contact [Vercel Support](https://vercel.com/support)

For issues specific to MolieLM, please refer to our main project documentation or create an issue in the repository.
