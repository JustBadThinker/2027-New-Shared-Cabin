# CabinGen - Unified Cruise Booking & Itinerary Planner

CabinGen is a unified full-stack solution designed to streamline manual WhatsApp cruise inquiries, deck layouts, and availability records into structured, high-conversion client itineraries.

---

## 🚀 1. Local Development Setup

To run this application on your local machine, follow these steps:

### Prerequisites
- **Node.js** (v18.0.0 or higher recommended)
- **npm** (v9.0.0 or higher)

### Steps

1. **Clone the project & Navigate to the workspace:**
   ```bash
   cd cabingen
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` in your text editor and specify your values:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `APP_URL`: Your local address `http://localhost:3000`.

4. **Verify / Setup Firebase configuration:**
   The development environment comes pre-configured with client-side credential bindings. If you are using your own Firebase project locally:
   - Create a Web Application in your Firebase Console.
   - Put your own custom Firebase client settings in `/src/lib/firebase.ts` (or matching JSON bindings).

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   The application will boot up at **`http://localhost:3000`**!

---

## 🌐 2. Hosting in Production & Configuring Custom Domains

To launch CabinGen to your clients on a custom domain, select one of the hosting routes below:

### Option A: Firebase Hosting (Recommended for Firebase Projects)
Since the app uses Firestore to persist custom wired media links, Firebase Hosting is the most native route.

1. **Install the Firebase CLI:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login and initialize:**
   ```bash
   firebase login
   firebase init hosting
   ```
   - Select your existing Firebase project.
   - For your public folder directory, specify **`dist`**.
   - Configure as a single-page app: **`Yes`**.
   - Overwrite index.html: **`No`**.

3. **Build and deploy:**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

4. **Connect Custom Domain in Firebase Console:**
   - Go to **Hosting** inside the Firebase Sidebar.
   - Click **Add Custom Domain**.
   - Enter your domain (e.g., `itinerary.kic-cruises.com`).
   - Firebase will generate standard **TXT** and **A** records.
   - Paste these CNAME / A records into your Domain Registrar (e.g., Namecheap, GoDaddy, Cloudflare) DNS configurations:
     - **Type**: `A` | **Host**: `itinerary` | **Value**: `IP provided by Firebase`

---

### Option B: Vercel (Fastest Setup)
Vercel is extremely popular for Vite and React setups, offering near-instant deployment from GitHub.

1. **Install Vercel CLI or Connect GitHub:**
   - Sign up at [vercel.com](https://vercel.com).
   - Go to the Dashboard, click **Add New Project**, and import this repository.

2. **Configuration Settings:**
   - **Framework Preset:** `Vite` OR `Other`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

3. **Environment Variables:**
   - Add `GEMINI_API_KEY` and `APP_URL` in Vercel’s environment variables panel.

4. **Setup Custom Domain:**
   - Go to your Vercel Project -> **Settings** -> **Domains**.
   - Type your domain (e.g., `itinerary.kic-cruises.com`) and click **Add**.
   - Configure DNS on your Domain Registrar with the Vercel Nameservers or CNAME targets:
     - **Type**: `CNAME` | **Host**: `@` / sub | **Value**: `cname.vercel-dns.com`

---

### Option C: Netlify
Another excellent platform for publishing client-side Vite projects.

1. Create an account at [netlify.com](https://netlify.com) and click **Import from Git**.
2. Configure build specs:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
3. Add custom redirects under `public/_redirects` if routing starts falling:
   ```text
   /*   /index.html   200
   ```
4. Register your domain under **Domain Management** in Netlify and set the CNAME to Netlify's DNS alias address.

---

## 🛠️ DNS Cheat Sheet for Domain Registrars

Whether you use Cloudflare, GoDaddy, Namecheap, or Hostinger, follow this template to map your custom subdomain safely:

| Type | Host | Points To / Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **CNAME** | `itinerary` | `your-app.web.app` (Firebase) or `cname.vercel-dns.com` (Vercel) | `Auto` | Point Subdomain to Host |
| **TXT** | `@` / sub | `firebase-verification-key-hash` | `Auto` | Host SSL Certification |
| **A** | `@` | `Server IP address` (if setting up naked domain apex) | `Auto` | Direct Server Binding |
