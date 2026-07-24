# EventOS — White-Label Event Discovery & Merchant Platform

## 1. Project Overview

EventOS is a multi-tenant, white-label event platform for event organizers, merchants, sponsors, and visitors.

The platform allows event organizers to launch a branded digital event experience without building their own website or application from scratch.

EventOS is designed for:

- Food festivals
- Night markets
- Trade exhibitions
- Career fairs
- University fairs
- Property expos
- Wedding expos
- Shopping mall campaigns
- Comic conventions
- Community markets
- Tourism campaigns

The business owner of EventOS is a software provider, not an event organizer.

The platform generates revenue through:

- Event setup fees
- Subscription plans
- White-label fees
- Premium merchant placement
- Sponsored listings
- Voucher and campaign fees
- Analytics add-ons
- SMS, email, and push-notification usage fees
- Transaction fees where applicable

---

## 2. Product Vision

Build the operating system for physical events.

EventOS should replace the organizer's dependency on:

- Spreadsheets
- WhatsApp groups
- Static event websites
- Printed directories
- Manually managed booth lists
- Manual voucher tracking
- Manual exhibitor onboarding
- Disconnected registration forms
- Manual sponsor reporting

The platform should support the full event lifecycle:

1. Event creation
2. Merchant onboarding
3. Booth allocation
4. Event publishing
5. Visitor discovery
6. Campaign and voucher activation
7. QR interactions
8. Engagement tracking
9. Reporting and analytics
10. Event archiving and duplication

---

## 3. Core Product Principles

1. Multi-tenant by default  
   Every organizer must have isolated data, users, branding, events, merchants, and reports.

2. Mobile-first  
   Visitor-facing pages must be optimized for mobile browsers.

3. Web app first  
   Build as a responsive Progressive Web App before considering native mobile applications.

4. White-label ready  
   Each organizer can configure its own logo, colors, domain, copy, and event branding.

5. Configuration over customization  
   Avoid hardcoding one event type. Most event behavior should be controlled through settings.

6. Modular architecture  
   Ticketing, vouchers, loyalty, maps, reviews, merchant tools, and analytics should be separate modules.

7. Fast event setup  
   An organizer should be able to launch a basic event in less than one day.

8. Privacy by design  
   Visitor data must not be shared with merchants or sponsors without explicit consent.

9. Monetization built into the platform  
   Plans, quotas, premium placement, campaigns, and billing must be considered from the beginning.

10. Auditability  
    Important admin actions must be logged.

---

## 4. User Roles

### 4.1 Platform Super Admin

The EventOS platform owner.

Permissions:

- View all tenants
- Create, suspend, and delete tenants
- Manage plans
- Manage platform pricing
- View all events
- View system usage
- View platform revenue
- Configure global settings
- Manage feature flags
- Impersonate tenant admins for support
- View audit logs
- Manage custom domains
- Manage payment settings
- Manage email templates
- Manage notification providers
- Manage platform-wide categories
- Access support tools

---

### 4.2 Organizer Admin

The customer paying for EventOS.

Permissions:

- Manage organizer profile
- Manage team members
- Create and manage events
- Configure event branding
- Manage event settings
- Add merchants
- Approve merchant applications
- Manage booths
- Upload event maps
- Create categories and zones
- Manage sponsors
- Create campaigns
- Create vouchers
- Send notifications
- View reports
- Export data
- Manage billing
- Configure custom domain
- Duplicate previous events

---

### 4.3 Organizer Staff

Operational users under an organizer.

Example roles:

- Event Manager
- Merchant Manager
- Marketing User
- Finance User
- Checker
- Support User
- Read-only Analyst

Permissions must be role-based and configurable.

---

### 4.4 Merchant Admin

A merchant or exhibitor joining an event.

Permissions:

- Manage merchant profile
- Manage participating event listing
- Upload logo and images
- Add products or menu items
- Configure promotions
- View vouchers
- Validate voucher redemptions
- View visitor engagement
- Respond to reviews
- Manage team members
- View billing where applicable

---

### 4.5 Merchant Staff

Limited merchant operational access.

Example permissions:

- Scan vouchers
- Validate redemptions
- Update stock availability
- Update queue status
- View assigned booth
- View sales summary

---

### 4.6 Visitor

Public or registered event attendee.

Capabilities:

- Browse events
- Search merchants
- View event map
- View booth details
- Save favourites
- Build itinerary
- Claim vouchers
- Scan QR codes
- Join digital passport challenges
- Submit ratings and reviews
- Receive notifications
- View event updates
- Share merchant listings
- Register interest

Guest browsing should be supported.

Registration is required only for personalized features.

---

## 5. Multi-Tenant Model

Each organizer is a tenant.

Recommended hierarchy:

```text
Platform
└── Tenant / Organizer
    ├── Team Members
    ├── Events
    │   ├── Merchants
    │   ├── Booths
    │   ├── Zones
    │   ├── Maps
    │   ├── Sponsors
    │   ├── Campaigns
    │   ├── Vouchers
    │   ├── Visitors
    │   └── Analytics
    ├── Billing
    ├── Branding
    └── Settings
```

Every tenant-scoped table must contain a `tenant_id`.

Never trust `tenant_id` received from the frontend.

Tenant access must be derived from the authenticated user's membership.

---

## 6. Recommended MVP

The first production version should focus on the smallest set of features that organizers will pay for.

### MVP Modules

1. Platform authentication
2. Multi-tenant organizer management
3. Event creation
4. Event branding
5. Merchant onboarding
6. Merchant directory
7. Product or menu management
8. Booth and zone management
9. Interactive event map
10. Public event website
11. Search and filtering
12. Featured merchant placement
13. Visitor favourites
14. QR code generation
15. Basic analytics
16. CSV import and export
17. Billing plan enforcement
18. Audit logs
19. Responsive PWA
20. Event duplication

### Defer From MVP

- Full ticketing
- Complex POS integration
- Native mobile apps
- AI recommendations
- Real-time queue management
- Loyalty points
- Advanced CRM
- Automated ad bidding
- Marketplace payouts
- Complex commission settlement
- Full sponsor attribution
- WhatsApp automation
- Advanced digital passport rewards

---

## 7. MVP User Journeys

### 7.1 Organizer Creates an Event

1. Organizer signs in
2. Creates an event
3. Adds event name, description, venue, dates, and opening hours
4. Uploads logo and banner
5. Selects theme colors
6. Creates zones
7. Adds booths
8. Imports merchant list through CSV
9. Sends merchant invitations
10. Reviews merchant submissions
11. Publishes event
12. Shares event URL and QR code

---

### 7.2 Merchant Completes Listing

1. Merchant receives invitation
2. Merchant creates account
3. Merchant selects event
4. Merchant enters business details
5. Merchant uploads logo and images
6. Merchant adds products or menu items
7. Merchant confirms booth information
8. Merchant submits for organizer approval
9. Organizer approves or requests changes
10. Listing becomes public

---

### 7.3 Visitor Discovers Merchants

1. Visitor opens the event URL
2. Browses featured merchants
3. Searches by keyword
4. Filters by category, zone, dietary option, or price
5. Opens merchant profile
6. Views booth location
7. Saves merchant as favourite
8. Opens map directions
9. Shares listing
10. Scans merchant QR code onsite

---

## 8. Functional Requirements

# 8.1 Authentication

Support:

- Email and password
- Magic link
- Google login
- Password reset
- Email verification
- Session management
- Optional multi-factor authentication for admins

Recommended implementation:

- Better Auth, Auth.js, Clerk, Supabase Auth, or custom JWT authentication
- Prefer secure server-side sessions
- Use HTTP-only cookies
- Implement refresh token rotation if JWTs are used

---

# 8.2 Organizer Management

Organizer fields:

- Name
- Legal entity name
- Registration number
- Contact person
- Contact email
- Contact phone
- Billing address
- Country
- Timezone
- Currency
- Logo
- Default branding
- Subscription plan
- Subscription status
- Custom domain
- Tax settings
- Created date
- Suspended date

Organizer settings:

- Default event visibility
- Default approval workflow
- Visitor registration mode
- Review moderation mode
- Merchant self-registration setting
- Notification settings
- Data retention period
- Branding settings
- Domain settings

---

# 8.3 Event Management

Event fields:

- Event name
- Slug
- Short description
- Full description
- Event type
- Venue name
- Venue address
- Latitude
- Longitude
- Start date
- End date
- Daily opening hours
- Timezone
- Cover image
- Logo
- Theme
- Status
- Visibility
- Registration mode
- Published date
- Archived date

Event statuses:

- Draft
- Setup
- Merchant onboarding
- Ready for review
- Published
- Live
- Ended
- Archived
- Cancelled

Event settings:

- Require visitor login
- Enable favourites
- Enable reviews
- Enable vouchers
- Enable sponsors
- Enable passport
- Enable maps
- Enable merchant self-registration
- Enable guest browsing
- Show merchant prices
- Show booth number
- Show operating hours
- Show social links

---

# 8.4 Merchant Management

Merchant fields:

- Merchant name
- Slug
- Business registration number
- Description
- Category
- Tags
- Contact name
- Contact email
- Contact phone
- Website
- Social links
- Logo
- Cover image
- Gallery
- Halal status
- Dietary tags
- Price range
- Operating hours
- Listing status
- Verification status
- Featured status
- Sponsor status
- Merchant plan
- Created date
- Approved date

Merchant event participation fields:

- Event
- Merchant
- Booth
- Zone
- Listing title
- Event-specific description
- Event-specific products
- Event-specific promotion
- Approval status
- Participation status
- Featured rank
- Listing priority
- Internal notes

Merchant statuses:

- Invited
- Draft
- Submitted
- Changes requested
- Approved
- Rejected
- Suspended
- Withdrawn

---

# 8.5 Product or Menu Management

Product fields:

- Merchant
- Event
- Product name
- Description
- Category
- Price
- Promotional price
- Currency
- Image
- Availability
- Sold-out status
- Dietary tags
- Spicy level
- Halal status
- Featured status
- Display order

Products may be:

- Food items
- Services
- Exhibitor offerings
- Property packages
- Career opportunities
- Workshop sessions
- Promotional packages

Use generic naming internally where possible.

Recommended entity name:

`ListingItem`

Frontend labels can change based on event type.

---

# 8.6 Booth, Zone, and Map Management

Zone fields:

- Event
- Name
- Description
- Color
- Display order

Booth fields:

- Event
- Zone
- Booth number
- Booth name
- X coordinate
- Y coordinate
- Width
- Height
- Rotation
- Status
- Merchant assignment

Booth statuses:

- Available
- Reserved
- Assigned
- Confirmed
- Blocked
- Cancelled

Map features:

- Upload static floor map
- Plot booth coordinates
- Zoom and pan
- Clickable booths
- Search booth
- Highlight selected booth
- Filter by category
- Show visitor's approximate current location where permission is granted
- Support multiple floors
- Support multiple map images per event

For MVP, use an image-based interactive map rather than a complex GIS system.

---

# 8.7 Featured Listings

Organizers can mark merchants as featured.

Fields:

- Event
- Merchant
- Placement type
- Start date
- End date
- Ranking priority
- Payment status
- Notes

Placement types:

- Homepage featured
- Category featured
- Search boost
- Map highlight
- Sponsored merchant
- Recommended merchant

The platform must track:

- Impressions
- Listing views
- Clicks
- Favourite actions
- Map opens
- QR scans
- Voucher claims

---

# 8.8 Visitor Features

Visitor profile:

- Display name
- Email
- Phone
- Preferred language
- Country
- Marketing consent
- Event update consent
- Favourite categories
- Dietary preferences
- Created date
- Last active date

Visitor features:

- Guest browsing
- Account registration
- Favourite merchants
- Favourite items
- Personal itinerary
- Recently viewed listings
- Saved vouchers
- QR scan history
- Review history
- Notification preferences
- Data export
- Account deletion

---

# 8.9 Search and Filtering

Search across:

- Merchant name
- Product name
- Description
- Tags
- Booth number
- Category
- Zone

Filters:

- Category
- Zone
- Price range
- Halal
- Vegetarian
- Vegan
- Gluten-free
- Featured
- Sponsor
- Open now
- Promotion available
- Rating
- Event-specific custom attributes

Recommended implementation:

- PostgreSQL full-text search for MVP
- Consider Typesense, Meilisearch, or Elasticsearch later

---

# 8.10 QR Codes

Generate QR codes for:

- Event homepage
- Merchant listing
- Booth
- Product
- Voucher
- Passport checkpoint
- Staff verification
- Visitor registration

Each QR code should resolve through a redirect endpoint.

Example:

```text
https://app.eventos.my/q/{shortCode}
```

Benefits:

- QR destination can be changed
- Scans can be tracked
- Expired codes can be disabled
- Attribution can be recorded

QR scan fields:

- Short code
- Target type
- Target ID
- Event
- Tenant
- Scan timestamp
- Device type
- Browser
- Approximate location
- Referrer
- Anonymous visitor ID
- Registered visitor ID

Avoid storing precise location unless explicitly required and consented.

---

# 8.11 Reviews and Ratings

Optional module.

Review fields:

- Event
- Merchant
- Visitor
- Rating
- Review text
- Images
- Status
- Moderation reason
- Created date
- Published date

Review statuses:

- Pending
- Approved
- Rejected
- Flagged
- Hidden

Controls:

- One review per visitor per merchant per event
- Organizer moderation
- Merchant response
- Abuse reporting
- Rate limiting
- Spam filtering

---

# 8.12 Notifications

Channels:

- Email
- Web push
- In-app notifications
- SMS as optional paid add-on
- WhatsApp as future integration

Notification use cases:

- Merchant invitation
- Merchant submission received
- Merchant approved
- Merchant changes requested
- Event published
- Event starting soon
- Event announcement
- Voucher claimed
- Voucher expiring
- Event ending
- Password reset
- Billing reminder

Notification fields:

- Tenant
- Event
- Audience
- Channel
- Subject
- Content
- Status
- Scheduled time
- Sent time
- Delivery count
- Failure count

---

# 8.13 Analytics

MVP organizer dashboard:

- Total visitors
- Unique visitors
- Merchant listing views
- Search count
- Top search keywords
- Top merchants
- Top categories
- Favourite actions
- Map opens
- QR scans
- Device breakdown
- Traffic source
- Daily active users
- Merchant completion rate
- Merchant approval rate

Merchant dashboard:

- Listing views
- Product views
- Favourites
- QR scans
- Voucher claims
- Voucher redemptions
- Map opens
- Search appearances

Platform dashboard:

- Total organizers
- Active organizers
- Total events
- Published events
- Active subscriptions
- Monthly recurring revenue
- Event setup revenue
- Add-on revenue
- Storage usage
- Email usage
- SMS usage
- Notification usage

---

# 8.14 CSV Import and Export

CSV imports:

- Merchants
- Products
- Booths
- Zones
- Sponsors
- Voucher codes

Import requirements:

- Downloadable template
- Column mapping
- Preview before import
- Row validation
- Duplicate handling
- Error report
- Partial success support
- Idempotency key
- Import history

CSV exports:

- Merchant list
- Booth list
- Visitor list
- Voucher report
- Engagement report
- QR scans
- Event analytics

---

## 9. Monetization Model

# 9.1 Suggested Pricing

### Starter

RM999 per event

Includes:

- 1 event
- Up to 50 merchants
- Public event website
- Merchant directory
- Basic event map
- Basic analytics
- CSV import
- Event QR code
- EventOS branding

### Growth

RM2,999 per event

Includes:

- Up to 200 merchants
- Custom branding
- Featured listings
- Vouchers
- Advanced analytics
- Merchant self-service
- Notification campaigns
- Custom domain
- Data exports

### Professional

RM7,999 per event

Includes:

- Up to 1,000 merchants
- White-label branding
- Dedicated onboarding
- Sponsor module
- Digital passport
- Advanced reporting
- Priority support
- Multiple maps
- Role-based access
- API access

### Enterprise

Custom pricing

Includes:

- Multiple events
- Annual contract
- Dedicated environment
- SSO
- SLA
- Advanced security
- Custom integrations
- Data warehouse export
- Custom reporting
- Private cloud option

---

# 9.2 Add-On Revenue

Possible add-ons:

- Custom domain setup
- Event microsite design
- Merchant onboarding service
- Data migration
- Premium analytics
- Voucher module
- SMS credits
- Email credits
- Web push campaigns
- Sponsored listing manager
- Digital passport
- Advanced map setup
- Custom reports
- API access
- SSO
- Additional team seats
- Extra storage
- Extra merchant quota

---

# 9.3 Platform Commission Options

Optional transaction revenue:

- Ticketing fee
- Voucher sales fee
- Paid merchant application fee
- Booth booking fee
- Marketplace transaction fee
- Premium listing fee
- Sponsor activation fee

Do not depend on transaction revenue for MVP.

Start with software fees and add-ons.

---

## 10. Recommended Technology Stack

# 10.1 Application

Recommended:

- Next.js 15+
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Query
- TanStack Table

Reasons:

- Good Claude Code support
- Full-stack capability
- Strong ecosystem
- Easy Vercel deployment
- Good for dashboards and public pages
- Supports SSR, SEO, and PWA

---

# 10.2 Backend

Recommended MVP approach:

- Next.js server actions and route handlers
- PostgreSQL
- Drizzle ORM or Prisma
- Redis for caching and queues
- Background job worker
- Object storage for uploads

Preferred:

- PostgreSQL
- Drizzle ORM
- Neon, Supabase, AWS RDS, or Railway
- Upstash Redis
- Trigger.dev, Inngest, BullMQ, or Cloud Tasks

For clean separation, business logic must not be embedded directly inside UI components.

Use:

```text
src/
├── app/
├── components/
├── features/
├── server/
│   ├── auth/
│   ├── db/
│   ├── services/
│   ├── repositories/
│   ├── policies/
│   ├── jobs/
│   └── integrations/
├── lib/
└── types/
```

---

# 10.3 Storage

Use S3-compatible object storage.

Options:

- AWS S3
- Cloudflare R2
- Supabase Storage
- DigitalOcean Spaces

Store:

- Event logos
- Event banners
- Merchant logos
- Merchant galleries
- Product images
- Map images
- Sponsor logos
- Review images
- CSV imports
- Generated QR codes

Use signed upload URLs.

Validate file type and size.

---

# 10.4 Email

Options:

- AWS SES
- Resend
- Postmark
- SendGrid

Recommended for MVP:

- Resend for development speed
- AWS SES for lower cost at scale

Use a provider abstraction.

---

# 10.5 Push Notifications

Use:

- Web Push for PWA
- Firebase Cloud Messaging for future native app support

---

# 10.6 Payments

Use a payment abstraction layer.

Potential providers:

- Stripe
- Billplz
- senangPay
- ToyyibPay
- iPay88
- Curlec
- HitPay

For Malaysia-first MVP, consider Billplz or Curlec.

For international expansion, use Stripe.

---

# 10.7 Analytics and Monitoring

Product analytics:

- PostHog
- Mixpanel

Error monitoring:

- Sentry

Infrastructure monitoring:

- Vercel Analytics
- Better Stack
- Grafana
- OpenTelemetry

Audit logs must be stored in the application's database.

---

## 11. System Architecture

```text
                     ┌────────────────────────┐
                     │       Visitors         │
                     │ Mobile Web / PWA       │
                     └───────────┬────────────┘
                                 │
                     ┌───────────▼────────────┐
                     │      Next.js App       │
                     │ Public + Dashboards    │
                     └───────────┬────────────┘
                                 │
             ┌───────────────────┼───────────────────┐
             │                   │                   │
┌────────────▼───────────┐ ┌─────▼────────┐ ┌────────▼─────────┐
│ Authentication        │ │ Application  │ │ Background Jobs  │
│ Sessions / RBAC       │ │ Services     │ │ Notifications    │
└────────────┬───────────┘ └─────┬────────┘ └────────┬─────────┘
             │                   │                   │
             └───────────────────┼───────────────────┘
                                 │
                     ┌───────────▼────────────┐
                     │      PostgreSQL        │
                     │ Tenant-Isolated Data   │
                     └───────────┬────────────┘
                                 │
                 ┌───────────────┼────────────────┐
                 │               │                │
       ┌─────────▼──────┐ ┌──────▼──────┐ ┌──────▼───────┐
       │ Object Storage│ │ Redis / Cache│ │ Integrations │
       │ Images / Maps │ │ Rate Limits  │ │ Email/Pay   │
       └────────────────┘ └─────────────┘ └──────────────┘
```

---

## 12. Suggested Database Schema

Use UUID primary keys.

Use timestamps:

- `created_at`
- `updated_at`
- `deleted_at` where soft deletion is required

Core tables:

```text
users
sessions
accounts
tenants
tenant_members
roles
permissions
role_permissions
tenant_member_roles

plans
subscriptions
subscription_items
invoices
payments
usage_records

events
event_settings
event_branding
event_operating_hours
event_team_members

merchant_accounts
merchants
merchant_members
merchant_event_participations
merchant_categories
merchant_tags

listing_items
listing_item_categories
listing_item_tags

zones
maps
map_floors
booths
booth_assignments

sponsors
sponsor_placements

featured_placements

visitors
visitor_event_profiles
visitor_favourites
visitor_itineraries
visitor_recent_views

qr_codes
qr_scan_events

reviews
review_responses
review_reports

campaigns
campaign_audiences
campaign_messages
notification_deliveries

vouchers
voucher_codes
voucher_claims
voucher_redemptions

analytics_events
daily_event_metrics
daily_merchant_metrics

imports
import_rows
exports

files
audit_logs
feature_flags
webhooks
api_keys
```

---

## 13. Key Table Definitions

### tenants

```text
id
name
slug
legal_name
registration_number
contact_name
contact_email
contact_phone
country
timezone
currency
status
plan_id
custom_domain
logo_file_id
created_at
updated_at
```

### tenant_members

```text
id
tenant_id
user_id
status
invited_by
invited_at
joined_at
created_at
updated_at
```

### events

```text
id
tenant_id
name
slug
event_type
short_description
description
venue_name
venue_address
latitude
longitude
timezone
start_at
end_at
status
visibility
published_at
archived_at
created_by
created_at
updated_at
```

### merchants

```text
id
tenant_id
name
slug
registration_number
description
contact_name
contact_email
contact_phone
website
logo_file_id
cover_file_id
status
created_at
updated_at
```

### merchant_event_participations

```text
id
tenant_id
event_id
merchant_id
booth_id
zone_id
listing_title
listing_description
approval_status
participation_status
featured_rank
submitted_at
approved_at
created_at
updated_at
```

### booths

```text
id
tenant_id
event_id
zone_id
map_floor_id
booth_number
name
x
y
width
height
rotation
status
created_at
updated_at
```

### analytics_events

```text
id
tenant_id
event_id
merchant_id
visitor_id
anonymous_id
event_name
properties_json
occurred_at
received_at
```

---

## 14. Authorization Model

Use Role-Based Access Control.

Permission examples:

```text
tenant.view
tenant.update
tenant.manage_billing
tenant.manage_members

event.create
event.view
event.update
event.publish
event.archive
event.delete

merchant.create
merchant.view
merchant.update
merchant.approve
merchant.reject
merchant.delete

booth.manage
map.manage
sponsor.manage
voucher.manage
campaign.manage

analytics.view
analytics.export
audit.view
settings.manage
```

Authorization flow:

1. Authenticate user
2. Resolve tenant membership
3. Resolve roles
4. Resolve permissions
5. Check resource tenant ownership
6. Check event-level restrictions
7. Perform action
8. Write audit log

Never rely only on hiding buttons in the frontend.

---

## 15. API Design

Use REST or typed server actions for MVP.

Recommended API groups:

```text
/api/auth/*
/api/platform/*
/api/tenants/*
/api/events/*
/api/merchants/*
/api/booths/*
/api/maps/*
/api/visitors/*
/api/qr/*
/api/reviews/*
/api/vouchers/*
/api/campaigns/*
/api/analytics/*
/api/billing/*
/api/imports/*
/api/exports/*
/api/webhooks/*
```

Example endpoints:

```text
POST   /api/events
GET    /api/events/:eventId
PATCH  /api/events/:eventId
POST   /api/events/:eventId/publish
POST   /api/events/:eventId/duplicate

POST   /api/events/:eventId/merchants
GET    /api/events/:eventId/merchants
PATCH  /api/events/:eventId/merchants/:merchantId
POST   /api/events/:eventId/merchants/:merchantId/approve

POST   /api/events/:eventId/booths
PATCH  /api/events/:eventId/booths/:boothId
POST   /api/events/:eventId/booths/:boothId/assign

GET    /api/public/events/:eventSlug
GET    /api/public/events/:eventSlug/merchants
GET    /api/public/events/:eventSlug/merchants/:merchantSlug

POST   /api/public/qr/:shortCode/scan
POST   /api/public/events/:eventId/favourites
```

Use:

- Zod request validation
- Consistent API response format
- Structured error codes
- Pagination
- Filtering
- Sorting
- Idempotency for sensitive mutations
- Rate limiting
- Request correlation IDs

---

## 16. API Response Standard

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req_123"
  }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "EVENT_NOT_FOUND",
    "message": "The requested event was not found.",
    "details": {}
  },
  "meta": {
    "requestId": "req_123"
  }
}
```

---

## 17. Public URL Structure

Default tenant URL:

```text
https://app.eventos.my/{tenantSlug}/{eventSlug}
```

Custom domain:

```text
https://festival.organizer.com
```

Public routes:

```text
/
 /explore
 /merchants
 /merchants/{merchantSlug}
 /map
 /favourites
 /vouchers
 /passport
 /updates
 /about
 /privacy
 /terms
```

Organizer dashboard:

```text
/dashboard
/dashboard/events
/dashboard/events/{eventId}
/dashboard/events/{eventId}/merchants
/dashboard/events/{eventId}/booths
/dashboard/events/{eventId}/map
/dashboard/events/{eventId}/campaigns
/dashboard/events/{eventId}/analytics
/dashboard/settings
/dashboard/billing
```

Merchant portal:

```text
/merchant
/merchant/events
/merchant/events/{eventId}
/merchant/events/{eventId}/listing
/merchant/events/{eventId}/products
/merchant/events/{eventId}/analytics
```

Platform admin:

```text
/platform
/platform/tenants
/platform/events
/platform/plans
/platform/billing
/platform/usage
/platform/audit
```

---

## 18. UI and UX Requirements

### General

- Mobile-first
- Fast loading
- Accessible
- Simple navigation
- Large tap targets
- Clear status indicators
- Skeleton loading states
- Empty states
- Error recovery
- Confirmation for destructive actions
- Unsaved changes warning

### Organizer Dashboard

- Sidebar navigation
- Event switcher
- Status overview
- Setup progress checklist
- Event launch readiness score
- Merchant onboarding progress
- Recent activity
- Key metrics
- Action-required cards

### Merchant Portal

- Simple guided setup
- Completion percentage
- Clear submission status
- Mobile-friendly image upload
- Preview public listing
- Validation messages
- Changes-requested notes

### Visitor Experience

- Search visible near top
- Featured merchants
- Category chips
- Map shortcut
- Favourites shortcut
- Fast merchant cards
- Share buttons
- Clear booth number
- Clear operating status
- Installable PWA prompt

---

## 19. Event Setup Checklist

The organizer dashboard should show:

```text
[ ] Event details completed
[ ] Branding uploaded
[ ] Event dates configured
[ ] Venue configured
[ ] Zones created
[ ] Map uploaded
[ ] Booths added
[ ] Merchants imported
[ ] Merchant invitations sent
[ ] Merchant listings approved
[ ] Privacy policy configured
[ ] Public pages reviewed
[ ] Event published
```

---

## 20. Security Requirements

Implement:

- Secure authentication
- Password hashing
- HTTP-only cookies
- CSRF protection
- Rate limiting
- Input validation
- Output encoding
- SQL injection protection through ORM
- File upload validation
- Malware scanning where possible
- Tenant isolation
- RBAC
- Audit logging
- Session revocation
- Secret rotation
- Environment variable validation
- Security headers
- Content Security Policy
- Backup and restore
- Encryption in transit
- Encryption at rest
- Data export controls
- Account deletion workflow
- Custom domain verification
- Webhook signature validation

Sensitive admin actions should require recent authentication.

Examples:

- Billing changes
- API key creation
- Domain changes
- Data export
- Tenant deletion
- User impersonation

---

## 21. Privacy and Consent

Visitor consent must be separated into:

- Terms acceptance
- Privacy policy acceptance
- Event updates
- Marketing messages
- Sponsor messages
- Location access
- Analytics cookies

Do not sell personal visitor data.

Allow organizers to access only data collected for their tenant and event.

Allow merchants to access only aggregated engagement data unless the visitor explicitly opts in.

Support:

- Consent timestamp
- Consent source
- Consent version
- Consent withdrawal
- Data export
- Account deletion
- Data retention rules

Malaysia-first legal considerations:

- Personal Data Protection Act 2010
- Clear privacy notice
- Purpose limitation
- Data minimization
- Reasonable security measures
- Retention control
- Access and correction rights

Legal review is still required before production launch.

---

## 22. Billing and Usage Control

Track usage by tenant:

- Number of active events
- Number of merchants
- Number of team members
- Storage usage
- Email sends
- SMS sends
- Push notifications
- QR scans
- API calls
- Voucher claims
- Voucher redemptions
- Analytics retention period

Plan enforcement:

- Soft warning at 80%
- Warning at 100%
- Grace period where appropriate
- Hard limit for expensive usage
- Upgrade prompt
- Super admin override

---

## 23. Audit Log Requirements

Log:

- User login
- User logout
- Failed login
- Member invitation
- Role change
- Event creation
- Event update
- Event publication
- Merchant approval
- Merchant rejection
- Booth reassignment
- Voucher creation
- Voucher redemption override
- Campaign send
- Billing change
- Export creation
- API key creation
- Custom domain change
- Tenant suspension
- User impersonation

Audit fields:

```text
actor_user_id
tenant_id
event_id
action
resource_type
resource_id
before_json
after_json
ip_address
user_agent
created_at
```

---

## 24. Background Jobs

Use jobs for:

- Email sending
- Notification campaigns
- CSV imports
- CSV exports
- Image processing
- QR generation
- Analytics aggregation
- Event status transitions
- Voucher expiry
- Scheduled campaign sends
- Report generation
- Data cleanup
- Subscription usage calculation

Jobs must be:

- Idempotent
- Retryable
- Observable
- Logged
- Dead-letter capable

---

## 25. Analytics Event Taxonomy

Recommended events:

```text
page_viewed
event_viewed
merchant_list_viewed
merchant_viewed
merchant_searched
search_performed
filter_applied
map_opened
booth_selected
merchant_favourited
merchant_unfavourited
item_viewed
qr_scanned
voucher_viewed
voucher_claimed
voucher_redeemed
review_submitted
share_clicked
visitor_registered
pwa_installed
notification_opened
```

Event properties:

```text
tenant_id
event_id
merchant_id
item_id
booth_id
zone_id
visitor_id
anonymous_id
source
campaign_id
device_type
browser
referrer
timestamp
```

---

## 26. SEO Requirements

Public event pages must support:

- Server-side rendering
- Unique title
- Meta description
- Open Graph tags
- Twitter card tags
- Canonical URL
- Sitemap
- Robots.txt
- Structured data
- Event schema
- Organization schema
- Local business schema where relevant
- Fast image loading
- Slug customization
- Redirect management

---

## 27. PWA Requirements

The visitor site should be installable.

Support:

- Web app manifest
- Service worker
- Offline event shell
- Cached merchant directory
- Cached event map
- Add to home screen
- Web push
- Update notification
- Fallback page when offline

Do not cache sensitive authenticated admin pages.

---

## 28. Development Environments

Use:

- Local
- Development
- Staging
- Production

Each environment must have:

- Separate database
- Separate storage
- Separate secrets
- Separate email settings
- Separate payment keys
- Separate domains

Suggested domains:

```text
localhost:3000
dev.eventos.my
staging.eventos.my
app.eventos.my
```

---

## 29. Testing Strategy

### Unit Tests

Test:

- Pricing rules
- Plan limits
- RBAC
- Event status transitions
- Merchant approval logic
- Voucher validation
- QR redirect logic
- Search filters
- Tenant isolation

### Integration Tests

Test:

- Database operations
- API endpoints
- File uploads
- Email provider
- Payment webhooks
- Background jobs
- CSV imports

### End-to-End Tests

Use Playwright.

Critical flows:

1. Platform admin creates tenant
2. Organizer creates event
3. Organizer imports merchants
4. Merchant completes listing
5. Organizer approves merchant
6. Organizer publishes event
7. Visitor opens event
8. Visitor searches merchant
9. Visitor favourites merchant
10. Visitor scans QR code
11. Organizer views analytics

---

## 30. Observability

Implement:

- Structured logs
- Request IDs
- Job IDs
- Error reporting
- Performance monitoring
- Slow query monitoring
- Health checks
- Uptime monitoring
- Webhook logs
- Email delivery logs

Health endpoints:

```text
/api/health
/api/health/database
/api/health/storage
/api/health/queue
```

---

## 31. Deployment

Recommended MVP deployment:

- Vercel for Next.js
- Neon or Supabase for PostgreSQL
- Cloudflare R2 for storage
- Upstash Redis
- Resend or AWS SES
- Sentry
- PostHog
- GitHub Actions

Alternative production stack:

- AWS ECS or AWS App Runner
- AWS RDS PostgreSQL
- AWS S3
- AWS ElastiCache
- AWS SES
- AWS CloudFront
- AWS WAF

Start simple and migrate when scale justifies it.

---

## 32. Suggested Repository Structure

```text
eventos/
├── .github/
│   └── workflows/
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── permissions.md
│   ├── api.md
│   └── deployment.md
├── public/
├── scripts/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (platform)/
│   │   ├── (dashboard)/
│   │   ├── (merchant)/
│   │   ├── (public)/
│   │   └── api/
│   ├── components/
│   │   ├── ui/
│   │   ├── forms/
│   │   ├── tables/
│   │   ├── maps/
│   │   └── analytics/
│   ├── features/
│   │   ├── auth/
│   │   ├── tenants/
│   │   ├── events/
│   │   ├── merchants/
│   │   ├── booths/
│   │   ├── maps/
│   │   ├── visitors/
│   │   ├── qr/
│   │   ├── analytics/
│   │   ├── billing/
│   │   └── notifications/
│   ├── server/
│   │   ├── auth/
│   │   ├── db/
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── policies/
│   │   ├── jobs/
│   │   ├── integrations/
│   │   └── telemetry/
│   ├── lib/
│   ├── hooks/
│   ├── types/
│   └── config/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── drizzle/
├── .env.example
├── CLAUDE.md
├── README.md
├── package.json
└── tsconfig.json
```

---

## 33. Claude Code Working Instructions

Claude Code must follow these rules.

### 33.1 Start With Questions

Before implementing a major module, use the AskUserQuestion approach.

Ask only questions that materially affect:

- Architecture
- Data model
- User experience
- Security
- Pricing
- Integration choice
- Scope

Do not ask for confirmation on trivial implementation details.

When reasonable, provide:

- Recommended option
- Alternative options
- Trade-offs
- Default decision

---

### 33.2 Implementation Rules

1. Do not build the entire platform in one pass.
2. Work module by module.
3. Create a plan before coding.
4. Keep commits small.
5. Run tests after each module.
6. Do not silently change the schema.
7. Update documentation when architecture changes.
8. Avoid duplicated business logic.
9. Keep tenant authorization centralized.
10. Do not expose internal IDs unnecessarily.
11. Validate every external input.
12. Add loading, empty, error, and success states.
13. Use feature flags for incomplete modules.
14. Prefer reusable components.
15. Avoid premature microservices.
16. Do not add a dependency without justification.
17. Use environment validation.
18. Never hardcode secrets.
19. Create migrations for database changes.
20. Use seed data for development.

---

### 33.3 Claude Code Must Produce

For each module:

1. Scope summary
2. Assumptions
3. Questions
4. Technical approach
5. Files to create
6. Database changes
7. API changes
8. UI changes
9. Security checks
10. Tests
11. Documentation updates
12. Completion checklist

---

## 34. Recommended Build Phases

# Phase 0 — Foundation

Deliverables:

- Repository setup
- Next.js
- TypeScript
- Tailwind
- shadcn/ui
- PostgreSQL
- Drizzle ORM
- Authentication
- Environment validation
- Error handling
- Logging
- CI
- Testing setup
- Basic landing page

Exit criteria:

- Application deploys
- User can register and sign in
- Database migrations work
- Tests run in CI

---

# Phase 1 — Multi-Tenant Platform

Deliverables:

- Tenant model
- Tenant membership
- Roles and permissions
- Platform admin
- Organizer dashboard shell
- Audit logs
- Tenant switcher
- Tenant isolation tests

Exit criteria:

- Platform admin can create tenant
- Organizer can access only its tenant
- Permission tests pass
- Audit logs are created

---

# Phase 2 — Event Management

Deliverables:

- Create event
- Edit event
- Event statuses
- Event branding
- Event settings
- Event operating hours
- Event duplication
- Event publishing

Exit criteria:

- Organizer can create and publish an event
- Public event page is generated
- Draft events are not publicly accessible

---

# Phase 3 — Merchant Onboarding

Deliverables:

- Merchant model
- Merchant invitations
- Merchant portal
- Merchant listing form
- Product management
- Approval workflow
- CSV merchant import
- Listing preview

Exit criteria:

- Organizer can invite merchant
- Merchant can submit listing
- Organizer can approve listing
- Approved listing appears publicly

---

# Phase 4 — Booths and Maps

Deliverables:

- Zone management
- Booth management
- Map upload
- Booth coordinate editor
- Merchant assignment
- Public interactive map

Exit criteria:

- Organizer can create booths
- Merchant can be assigned
- Visitor can click booth on map

---

# Phase 5 — Visitor Experience

Deliverables:

- Public directory
- Search
- Filters
- Merchant details
- Favourites
- Recently viewed
- Share functionality
- PWA setup

Exit criteria:

- Visitor can browse quickly on mobile
- Search and filters work
- Favourites work for guest and registered users

---

# Phase 6 — Monetization

Deliverables:

- Plans
- Subscription model
- Usage limits
- Featured listings
- Billing dashboard
- Payment integration
- Invoice records
- Upgrade flow

Exit criteria:

- Plan limits are enforced
- Organizer can upgrade
- Featured listing is tracked
- Billing events are audited

---

# Phase 7 — Analytics

Deliverables:

- Analytics event tracking
- Organizer dashboard
- Merchant dashboard
- QR tracking
- Search analytics
- Daily aggregation jobs
- CSV exports

Exit criteria:

- Organizer can see event engagement
- Merchant can see listing engagement
- Metrics match raw event logs

---

# Phase 8 — Vouchers and Campaigns

Deliverables:

- Voucher creation
- Voucher claims
- Voucher redemption
- Merchant validation
- Email campaigns
- Web push campaigns
- Campaign reporting

Exit criteria:

- Visitor can claim voucher
- Merchant can redeem voucher
- Organizer can see campaign performance

---

## 35. MVP Acceptance Criteria

The MVP is ready when:

1. Platform admin can create an organizer account.
2. Organizer can create and brand an event.
3. Organizer can upload a map.
4. Organizer can create zones and booths.
5. Organizer can import merchants.
6. Merchant can manage its listing.
7. Organizer can approve merchant submissions.
8. Organizer can publish the event.
9. Visitor can browse the event without login.
10. Visitor can search and filter merchants.
11. Visitor can open a merchant profile.
12. Visitor can locate a merchant on the map.
13. Visitor can save favourites.
14. QR scans are tracked.
15. Organizer can view basic analytics.
16. Tenant data isolation is tested.
17. Platform plan limits are enforceable.
18. Core actions generate audit logs.
19. Public pages are mobile responsive.
20. Production monitoring is active.

---

## 36. Initial Claude Code Prompt

Use the following prompt after creating the repository:

```text
You are the lead software architect and senior full-stack engineer for EventOS.

Read the complete project specification in PROJECT.md before making any changes.

Your objective is to build a production-ready, multi-tenant, white-label event discovery and merchant platform.

Important rules:

1. Do not start coding immediately.
2. First inspect the repository.
3. Summarize the intended architecture.
4. Identify missing decisions.
5. Use AskUserQuestion for decisions that materially affect architecture, scope, security, integrations, or user experience.
6. Recommend sensible defaults.
7. Build one phase at a time.
8. Start with Phase 0 only.
9. Create a detailed implementation plan.
10. Wait for answers only when the missing decision materially blocks implementation.
11. Keep business logic separate from UI.
12. Enforce tenant isolation at the service and database access layers.
13. Use TypeScript strict mode.
14. Use Zod for validation.
15. Add tests for all critical business logic.
16. Add migrations for all schema changes.
17. Update documentation after each phase.
18. Do not expose secrets.
19. Do not implement unfinished modules without feature flags.
20. Keep the application deployable after every phase.

For Phase 0, propose:

- Final technology choices
- Authentication approach
- Database provider
- ORM
- Hosting
- Storage
- Email provider
- Queue or background job solution
- Testing setup
- Repository structure
- Environment variables
- CI workflow

Then begin implementation after resolving only the decisions that truly matter.
```

---

## 37. Recommended `.env.example`

```bash
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=EventOS

DATABASE_URL=
DIRECT_DATABASE_URL=

AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

REDIS_URL=

STORAGE_PROVIDER=s3
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=

EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM=

PAYMENT_PROVIDER=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

CRON_SECRET=
ENCRYPTION_KEY=
```

---

## 38. Seed Data

Create development seed data:

- 1 platform admin
- 2 organizer tenants
- 3 organizer users
- 2 events
- 20 merchants
- 50 products
- 3 zones per event
- 30 booths per event
- 5 featured merchants
- 10 visitors
- 50 analytics events

Example event:

```text
Kuala Lumpur Food Discovery Weekend
```

Example categories:

- Local Food
- Desserts
- Drinks
- Halal
- Vegetarian
- International
- Snacks
- Retail
- Services

---

## 39. Future Roadmap

After MVP:

- Digital passport
- Loyalty points
- Ticketing
- Paid workshops
- Queue management
- Live stock availability
- AI recommendations
- AI itinerary planner
- AI merchant copywriting
- AI image enhancement
- Sponsor attribution
- CRM
- WhatsApp integration
- Native mobile app
- POS integrations
- Visitor segmentation
- Cross-event visitor profile
- Event marketplace
- Booth booking
- Vendor marketplace
- Organizer mobile operations app
- Offline voucher validation
- Event staff check-in
- Lead capture for expos
- Exhibitor appointment booking
- White-label mobile apps

---

## 40. Product Positioning

Suggested positioning:

> Launch a complete digital event experience without building your own platform.

Alternative:

> The operating system for festivals, fairs, expos, and community events.

Value proposition:

- Faster event setup
- Better visitor experience
- Easier merchant onboarding
- Less manual coordination
- More sponsor inventory
- Better event data
- New revenue opportunities

---

## 41. Recommended First Commercial Version

Do not sell every module initially.

Sell:

```text
Event Microsite
+ Merchant Directory
+ Interactive Map
+ Merchant Onboarding
+ Featured Listings
+ Basic Analytics
```

This package is understandable, deliverable, and monetizable.

Target price:

```text
RM2,000 to RM5,000 per event
```

Offer paid setup service:

```text
RM500 to RM2,000
```

Offer custom branding:

```text
RM500 to RM1,500
```

Offer premium analytics:

```text
RM500 to RM2,000
```

This allows revenue before advanced modules are built.

---

## 42. Final Build Guidance

The platform should not begin as a consumer super app.

The first paying customer is the event organizer.

The first monetizable user is the merchant.

The visitor experience is the acquisition and engagement layer.

Priority order:

```text
Organizer value
→ Merchant onboarding
→ Visitor experience
→ Featured placement
→ Analytics
→ Vouchers
→ Campaigns
→ Advanced engagement
```

Avoid building complex consumer features until organizers are willing to pay for the core platform.
