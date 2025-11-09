# 🔄 BACKEND KEEP-ALIVE SETUP GUIDE

## ❌ **CURRENT PROBLEM**
Backend on Render free tier sleeps after 15 minutes of inactivity, causing:
- 30-60 second delays on first request
- Poor user experience
- Failed OAuth logins
- Timeout errors

---

## ✅ **SOLUTION OPTIONS**

### **Option 1: UptimeRobot (FREE & RECOMMENDED)**

**Best for:** Production use, zero cost, reliable

#### **Setup Steps:**

1. **Create Account**
   - Go to https://uptimerobot.com
   - Click "Sign Up Free"
   - Verify email

2. **Add Monitor**
   - Click "Add New Monitor"
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** Veraawell Backend
   - **URL:** `https://veraawell-backend.onrender.com/api/health`
   - **Monitoring Interval:** 5 minutes (free tier)
   - Click "Create Monitor"

3. **Configure Alerts (Optional)**
   - Add email alerts for downtime
   - Get notified if backend goes down

4. **Done!**
   - UptimeRobot will ping every 5 minutes
   - Backend stays awake 24/7
   - Free forever!

**Benefits:**
- ✅ Completely free
- ✅ No coding required
- ✅ Email alerts included
- ✅ Status page available
- ✅ 5-minute intervals (enough to prevent sleep)

---

### **Option 2: Cron-Job.org (FREE)**

**Best for:** Alternative to UptimeRobot

#### **Setup Steps:**

1. **Create Account**
   - Go to https://cron-job.org
   - Sign up for free

2. **Create Cron Job**
   - Click "Create Cronjob"
   - **Title:** Keep Veraawell Backend Awake
   - **URL:** `https://veraawell-backend.onrender.com/api/health`
   - **Schedule:** Every 10 minutes
   - **Enabled:** Yes
   - Save

3. **Done!**
   - Pings every 10 minutes
   - Backend stays awake

---

### **Option 3: GitHub Actions (FREE)**

**Best for:** If you already use GitHub

#### **Setup Steps:**

1. **Create Workflow File**

Create `.github/workflows/keep-alive.yml`:

```yaml
name: Keep Backend Alive

on:
  schedule:
    # Runs every 10 minutes
    - cron: '*/10 * * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Backend
        run: |
          curl -f https://veraawell-backend.onrender.com/api/health || exit 1
      - name: Log Success
        run: echo "Backend is awake at $(date)"
```

2. **Commit and Push**
   ```bash
   git add .github/workflows/keep-alive.yml
   git commit -m "Add keep-alive workflow"
   git push
   ```

3. **Enable Workflow**
   - Go to GitHub repository
   - Click "Actions" tab
   - Enable workflows if disabled

**Benefits:**
- ✅ Free with GitHub
- ✅ Runs automatically
- ✅ Can see logs in Actions tab

---

### **Option 4: Local Keep-Alive Script**

**Best for:** Development/testing only

#### **Setup Steps:**

1. **Use Provided Script**
   - File already created: `server/keep-alive.js`

2. **Run Script**
   ```bash
   cd server
   node keep-alive.js
   ```

3. **Keep Terminal Open**
   - Script runs in foreground
   - Pings every 14 minutes

**Cons:**
- ❌ Requires your computer to be on
- ❌ Not suitable for production
- ❌ Stops when you close terminal

---

### **Option 5: Upgrade Render Plan (PAID)**

**Best for:** Professional production use

#### **Pricing:**
- **Starter Plan:** $7/month
- **Standard Plan:** $25/month

#### **Benefits:**
- ✅ No cold starts
- ✅ Always-on server
- ✅ Better performance
- ✅ More resources
- ✅ Priority support

#### **Setup:**
1. Go to Render dashboard
2. Select your service
3. Click "Upgrade"
4. Choose plan
5. Add payment method

---

## 🎯 **RECOMMENDED SOLUTION**

### **For Production: UptimeRobot**

**Why?**
- Completely free
- Reliable and proven
- No maintenance required
- Email alerts included
- Works 24/7

**Setup Time:** 5 minutes

**Steps:**
1. Sign up at https://uptimerobot.com
2. Add monitor for `https://veraawell-backend.onrender.com/api/health`
3. Set interval to 5 minutes
4. Done!

---

## 📊 **COMPARISON TABLE**

| Solution | Cost | Reliability | Setup Time | Maintenance |
|----------|------|-------------|------------|-------------|
| **UptimeRobot** | Free | ⭐⭐⭐⭐⭐ | 5 min | None |
| **Cron-Job.org** | Free | ⭐⭐⭐⭐ | 5 min | None |
| **GitHub Actions** | Free | ⭐⭐⭐⭐ | 10 min | None |
| **Local Script** | Free | ⭐⭐ | 2 min | High |
| **Render Paid** | $7/mo | ⭐⭐⭐⭐⭐ | 5 min | None |

---

## 🔍 **VERIFICATION**

After setup, verify it's working:

### **Check 1: Monitor Status**
- Login to UptimeRobot
- Check monitor is "Up"
- See last ping time

### **Check 2: Test Backend**
```bash
curl https://veraawell-backend.onrender.com/api/health
```

Should return immediately (no 30s delay)

### **Check 3: Frontend Test**
1. Open https://veraawell.vercel.app
2. Should load quickly
3. No long loading spinner

---

## ⚠️ **IMPORTANT NOTES**

### **Render Free Tier Limits:**
- 750 hours/month of runtime
- With keep-alive: Uses ~720 hours/month
- Still within free tier!

### **Ping Frequency:**
- **Too frequent** (< 5 min): Wastes resources
- **Too infrequent** (> 14 min): Server sleeps
- **Optimal:** 5-10 minutes

### **Health Endpoint:**
- Must return 200 OK
- Should be lightweight
- Current endpoint: `/api/health` ✅

---

## 🚀 **QUICK START (5 MINUTES)**

1. **Go to:** https://uptimerobot.com
2. **Sign up** (free)
3. **Add Monitor:**
   - Type: HTTP(s)
   - URL: `https://veraawell-backend.onrender.com/api/health`
   - Interval: 5 minutes
4. **Save**
5. **Done!** Backend will stay awake 24/7

---

## 📞 **SUPPORT**

**UptimeRobot:**
- Docs: https://uptimerobot.com/help
- Email: support@uptimerobot.com

**Render:**
- Docs: https://render.com/docs
- Support: https://render.com/support

---

## ✅ **SUCCESS CHECKLIST**

- [ ] Signed up for UptimeRobot (or alternative)
- [ ] Added monitor for backend health endpoint
- [ ] Set interval to 5-10 minutes
- [ ] Monitor shows "Up" status
- [ ] Tested backend responds quickly
- [ ] Frontend loads without delays
- [ ] OAuth login works smoothly

---

**After completing this setup, your backend will:**
- ✅ Stay awake 24/7
- ✅ Respond in <500ms
- ✅ Never show 30-60s delays
- ✅ Handle OAuth smoothly
- ✅ Provide better user experience

**Cost:** $0/month (with UptimeRobot)
