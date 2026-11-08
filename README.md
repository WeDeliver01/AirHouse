# AirHouse - Creator-Developer Marketing Platform

A full-stack web application connecting property developers with content creators for performance-driven social media marketing campaigns.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open **http://localhost:5173**

---

## 🔧 Supabase Setup (Required for Auth)

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for it to finish setting up

### Step 2: Configure Authentication
1. Go to **Authentication > Providers > Email**
2. Make sure **"Enable Email provider"** is ON
3. **IMPORTANT**: Set **"Confirm email"** to OFF (for testing)

### Step 3: Configure URLs
1. Go to **Authentication > URL Configuration**
2. Set **Site URL**: `http://localhost:5173`
3. Add to **Redirect URLs**: `http://localhost:5173/auth/callback`

### Step 4: Run Database Setup
1. Go to **SQL Editor** in Supabase
2. Copy the contents of `supabase/quick_setup.sql`
3. Paste and click **"Run"**

### Step 5: Add Environment Variables
1. Go to **Settings > API** in Supabase
2. Copy your **Project URL** and **anon public key**
3. Create a `.env` file in your project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 6: Restart Dev Server
```bash
npm run dev
```

---

## 🔑 Test URLs

| URL | Dashboard |
|-----|-----------|
| http://localhost:5173/admin | Admin Panel |
| http://localhost:5173/developer | Developer Dashboard |
| http://localhost:5173/creator | Creator Dashboard |
| http://localhost:5173 | Public Homepage |

---

## ❌ Auth Not Working?

If signup isn't working, run this in Supabase SQL Editor:

```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- If not, run the quick_setup.sql again
```

Also verify:
1. ✅ Email provider is enabled
2. ✅ "Confirm email" is OFF
3. ✅ Site URL is set to http://localhost:5173
4. ✅ .env file has correct credentials
5. ✅ Dev server was restarted after adding .env

---

## 🚀 Features

### For Developers
- Create and manage marketing campaigns
- Browse and invite vetted creators
- Track leads and campaign performance
- ROI analysis and budget optimization
- Export leads to CSV

### For Creators
- Browse available campaigns
- Apply with pitch proposals
- Submit content deliverables
- Track earnings and payouts
- Build reliability scorecard

### Platform Features
- Role-based authentication (Creator/Developer/Admin)
- Real-time lead tracking with unique referral URLs
- Campaign lifecycle management
- Performance metrics and analytics
- Responsive, modern UI

## 🛠️ Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Backend/Auth/DB**: Supabase
- **Icons**: Lucide React
- **Charts**: Recharts
- **Routing**: React Router v6
- **Notifications**: React Hot Toast

## 📦 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- A Supabase account (free tier works!)

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd creator-developer-platform

# Install dependencies
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings > API** and copy your:
   - Project URL
   - Anon/Public key

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Add your Supabase credentials to `.env`:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Set Up Database

1. Go to **SQL Editor** in your Supabase dashboard
2. Copy the contents of `supabase/migrations/001_schema.sql`
3. Run the SQL to create all tables, policies, and triggers

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🏗️ Project Structure

```
src/
├── components/
│   ├── ui/           # Reusable UI components
│   ├── layout/       # Layout components (Navbar, Sidebar, etc.)
│   └── forms/        # Form components
├── pages/
│   ├── public/       # Public pages (Home, Login, etc.)
│   ├── creator/      # Creator dashboard pages
│   ├── developer/    # Developer dashboard pages
│   └── admin/        # Admin dashboard pages
├── context/          # React contexts
├── hooks/            # Custom hooks
├── lib/              # Utilities and configurations
└── styles/           # Global styles
```

## 🔐 Authentication Flow

1. Users register with email/password and select role (Creator/Developer)
2. Supabase Auth handles authentication
3. Database trigger creates profile with selected role
4. Protected routes redirect based on user role

## 📊 Database Schema

### Core Tables
- `profiles` - User profiles with role
- `creator_profiles` - Extended creator info
- `campaigns` - Marketing campaigns
- `campaign_applications` - Creator applications
- `campaign_assignments` - Approved creator-campaign matches
- `leads` - Captured property enquiries
- `payments` - Payment tracking
- `notifications` - User notifications

### Row Level Security
All tables have RLS policies ensuring:
- Users can only access their own data
- Developers can view creator profiles and manage their campaigns
- Creators can view open campaigns and their assignments
- Admins have full access

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy!

### Netlify

1. Push to GitHub
2. Import in Netlify
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add environment variables
6. Deploy!

## 🎨 Customization

### Colors
Edit `tailwind.config.js` to customize the color palette:

```js
colors: {
  primary: '#1e40af',
  accent: '#6366f1',
  // ...
}
```

### Components
All UI components are in `src/components/ui/` and can be customized as needed.

## 📝 Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - feel free to use this for your own projects!

## 🙏 Acknowledgments

- Design inspired by modern SaaS dashboards
- Built with React and Supabase
- Icons from Lucide React
