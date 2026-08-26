# Olympics Pick'em - Setup & Testing Guide

This guide walks you through getting Supabase credentials, setting up the database, and testing the app locally.

---

## Part 1: Getting Supabase Credentials

### Step 1: Create a Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click **Start your project** or **Sign Up**
3. Sign up with GitHub, or use email/password

### Step 2: Create a New Project

1. Once logged in, click **New Project**
2. Fill in the details:
   - **Project name**: `olympics-pickem` (or any name you prefer)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose the closest to your users
3. Click **Create new project**
4. Wait 1-2 minutes for the project to be provisioned

### Step 3: Get Your API Credentials

1. In your Supabase dashboard, go to **Project Settings** (gear icon in sidebar)
2. Click **API** in the left menu
3. You'll see two important values:

| Setting | Where to Find |
|---------|---------------|
| **Project URL** | Under "Project URL" - looks like `https://abcdefg.supabase.co` |
| **anon/public key** | Under "Project API keys" → `anon` `public` - a long JWT string |

4. Copy both values - you'll need them for the `.env` file

### Step 4: Create Your .env File

1. In the project root, copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your credentials:
   ```env
   # Frontend (exposed to browser)
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here

   # Backend (Netlify Functions)
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

---

## Part 2: Setting Up the Database

### Step 1: Open SQL Editor

1. In Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**

### Step 2: Run the Schema

1. Open `config/supabase-schema.sql` from this project
2. Copy the entire contents
3. Paste into the SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. You should see "Success. No rows returned" - this is normal

### Step 3: Verify Tables Were Created

1. Click **Table Editor** in the left sidebar
2. You should see these tables:
   - `profiles`
   - `invites`
   - `picks`
   - `games_cache`

### Step 4: Create Your First Admin User

Since registration requires an invite code, you need to bootstrap the first admin:

**Option A: Create invite via SQL (recommended)**

1. Go to SQL Editor and run:
   ```sql
   INSERT INTO invites (email, invite_code, used)
   VALUES ('your-email@example.com', 'ADMIN123', FALSE);
   ```
2. Use invite code `ADMIN123` when registering

**Option B: Disable invite requirement temporarily**

1. In the app, temporarily modify `src/pages/RegisterPage.jsx` to skip invite validation
2. Register your account
3. Revert the change

### Step 5: Make Yourself Admin

After registering, run this SQL to grant admin rights:

```sql
UPDATE profiles
SET is_admin = TRUE
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'your-email@example.com'
);
```

---

## Part 3: Running the App Locally

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Start Development Server

```bash
npm run dev
```

This starts:
- Vite dev server on `http://localhost:5173`
- Netlify Functions on `http://localhost:8888`

### Step 3: Access the App

Open `http://localhost:5173` in your browser.

---

## Part 4: Testing the App

### 4.1 Manual Testing Walkthrough

#### Test 1: Registration Flow

1. Go to `/register`
2. Enter:
   - Name: `Test Player`
   - Email: `test@example.com`
   - Password: `testpass123`
   - Invite Code: (use the one you created in SQL)
3. Click Register
4. **Expected**: Redirected to home page, logged in

#### Test 2: Login/Logout

1. Click Logout in header
2. Go to `/login`
3. Enter your credentials
4. **Expected**: Successfully logged in

#### Test 3: View Games

1. Go to `/games`
2. **Expected**: See list of games (mock data if before tournament)
3. Try the filters (date, status, round)
4. **Expected**: Games filter correctly

#### Test 4: Submit Picks

1. Go to `/my-picks`
2. Find a game that hasn't started
3. Enter scores for both teams
4. Click Submit
5. **Expected**: Pick saved, shown in your picks list

#### Test 5: View Leaderboard

1. Go to `/leaderboard`
2. **Expected**: See player rankings
3. Tournament progress bar should show current state

#### Test 6: Admin Functions (if admin)

1. Go to `/admin`
2. Create a new invite:
   - Enter an email
   - Click "Create Invite"
3. **Expected**: New invite code generated and shown

#### Test 7: Pick Visibility

1. Log in as User A, submit picks for a game
2. Log out, register as User B (need another invite)
3. Go to that game's details
4. **Expected**: User A's picks hidden if game hasn't started

### 4.2 Automated Tests

Run the test suite:

```bash
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run with coverage report
npm run test:coverage
```

#### Test Files Location

| Area | Location |
|------|----------|
| Components | `src/components/*/__tests__/` |
| Services | `src/services/__tests__/` |
| Hooks | `src/hooks/__tests__/` |
| Functions | `netlify/functions/__tests__/` |

### 4.3 API Testing with curl

Test the Netlify Functions directly:

```bash
# Get games
curl http://localhost:8888/.netlify/functions/games

# Get leaderboard
curl http://localhost:8888/.netlify/functions/leaderboard

# Get standings
curl http://localhost:8888/.netlify/functions/standings
```

For authenticated endpoints, you'll need to pass a JWT token:

```bash
curl http://localhost:8888/.netlify/functions/picks \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN"
```

---

## Part 5: Testing Without Supabase (Mock Mode)

If you want to test without setting up Supabase:

1. Edit `.env`:
   ```env
   USE_MOCK_DATA=true
   USE_CSV_FALLBACK=true
   ```

2. The app will use:
   - Mock ESPN data from `data/mock-espn-schedule.json`
   - Sample picks from `data/sample-picks-*.csv`

**Note**: Auth features won't work in mock mode - this is for UI testing only.

---

## Part 6: Common Issues & Troubleshooting

### "Invalid invite code"
- Check the invite exists: SQL Editor → `SELECT * FROM invites;`
- Ensure `used = FALSE` and `expires_at > NOW()`

### "Failed to fetch games"
- Check Supabase URL is correct in `.env`
- Verify Netlify Functions are running (check terminal)
- Try `USE_MOCK_DATA=true` to test with mock data

### "Unauthorized" errors
- Clear browser localStorage: `localStorage.clear()`
- Log out and log back in
- Check that anon key is correct in `.env`

### RLS Policy errors
- Ensure you ran the full schema SQL
- Check `profiles` table has your user ID
- Verify `is_admin = TRUE` if accessing admin routes

### "Cannot find module" errors
```bash
rm -rf node_modules
npm install
```

---

## Part 7: Deploying to Netlify

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### Step 2: Connect to Netlify

1. Go to [netlify.com](https://netlify.com)
2. Click **Add new site** → **Import an existing project**
3. Connect your GitHub repo
4. Build settings should auto-detect from `netlify.toml`

### Step 3: Add Environment Variables

In Netlify dashboard → Site settings → Environment variables:

Add these:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### Step 4: Deploy

Click **Deploy site**. Netlify will build and deploy automatically.

---

## Quick Reference

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Run dev server | `npm run dev` |
| Run tests | `npm run test` |
| Run tests once | `npm run test:run` |
| Build for prod | `npm run build` |
| Preview build | `npm run preview` |

| URL | Purpose |
|-----|---------|
| `http://localhost:5173` | Frontend |
| `http://localhost:8888/.netlify/functions/*` | API |
| `https://supabase.com/dashboard` | Database admin |
