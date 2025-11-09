# 🎯 YOUR ACTION PLAN - Fix These Issues Now

Based on your screenshots, here are the **exact steps** you need to take to fix your website.

---

## 📸 **ISSUES IDENTIFIED FROM YOUR SCREENSHOTS**

### **Screenshot 1: veraawell.com - ERR_CONNECTION_TIMED_OUT**
❌ Domain not accessible
❌ Shows "This site can't be reached"
❌ "veraawell.com took too long to respond"

### **Screenshot 2: Google OAuth Redirect Issue**
⚠️ OAuth redirects to `veraawell-backend.onrender.com` instead of frontend
⚠️ Shows "Choose an account" for backend URL (wrong!)

### **Screenshot 3: Google OAuth Error**
❌ "Aw, Snap! Something went wrong" (Error code: 11)
❌ OAuth callback failing

---

## 🚨 **ROOT CAUSES**

1. **Domain Issue:** veraawell.com points to wrong IP address
2. **OAuth Redirect:** Backend redirecting to wrong URL
3. **Backend Cold Start:** 30-60 second delays causing timeouts

---

## ✅ **YOUR ACTION PLAN (3 TASKS)**

---

## **TASK 1: FIX DOMAIN (CRITICAL - DO THIS FIRST)**

### **Time Required:** 10 minutes + 1-48 hours DNS propagation

### **Step-by-Step Instructions:**

#### **A. Login to GoDaddy**

1. Go to https://godaddy.com
2. Click "Sign In" (top right)
3. Enter your credentials
4. Click "My Products"

#### **B. Access DNS Management**

1. Find "veraawell.com" in your domains list
2. Click the three dots (...) next to it
3. Click "Manage DNS" or "DNS"

#### **C. Remove Wrong A Record**

**Current (WRONG) DNS Record:**
```
Type: A
Name: @
Value: 76.198.78.71  ← DELETE THIS!
TTL: 600
```

**Steps:**
1. Look for A record with value `76.198.78.71`
2. Click the **trash/delete icon** next to it
3. Confirm deletion
4. **DO NOT add a new A record!**

#### **D. Add Correct CNAME Records**

**Add Record #1 (Root Domain):**
```
Type: CNAME
Name: @
Value: cname.vercel-dns.com
TTL: 600 (or leave default)
```

**Steps:**
1. Click "Add" or "Add Record" button
2. Select "CNAME" from Type dropdown
3. In "Name" field: Type `@` (this means root domain)
4. In "Points to" or "Value" field: Type `cname.vercel-dns.com`
5. Click "Save"

**Add Record #2 (WWW Subdomain):**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: 600
```

**Steps:**
1. Click "Add" again
2. Select "CNAME"
3. In "Name" field: Type `www`
4. In "Points to" field: Type `cname.vercel-dns.com`
5. Click "Save"

#### **E. Verify GoDaddy DNS Settings**

Your DNS should now look like this:

```
Type    Name    Value                   TTL
CNAME   @       cname.vercel-dns.com    600
CNAME   www     cname.vercel-dns.com    600
```

**Screenshot this for your records!**

#### **F. Configure Vercel**

1. Go to https://vercel.com/dashboard
2. Login with your account
3. Click on your "Veraawell" project
4. Click "Settings" (top menu)
5. Click "Domains" (left sidebar)

**Add Domain #1:**
1. Click "Add Domain" button
2. Type: `veraawell.com`
3. Click "Add"
4. Vercel will check DNS (may take a minute)
5. Should show "Valid Configuration" or "Pending"

**Add Domain #2:**
1. Click "Add Domain" again
2. Type: `www.veraawell.com`
3. Click "Add"

#### **G. Wait for DNS Propagation**

**Time Required:** 1-48 hours (usually 1-4 hours)

**Check Status:**
- Go to https://dnschecker.org
- Enter: `veraawell.com`
- Should show: `cname.vercel-dns.com` (when ready)

**Test Your Domain:**
```bash
# Run this command every hour to check
nslookup veraawell.com
```

When it shows `cname.vercel-dns.com`, your domain is ready!

---

## **TASK 2: FIX OAUTH REDIRECT URL (CRITICAL)**

### **Time Required:** 5 minutes

### **Problem:** 
OAuth redirects to backend URL instead of frontend (see your screenshot 2)

### **Solution:**

#### **Option A: Set Environment Variable in Render**

1. Go to https://dashboard.render.com
2. Login to your account
3. Click on your backend service (veraawell-backend)
4. Click "Environment" (left sidebar)
5. Click "Add Environment Variable"
6. Add this variable:
   ```
   Key: FRONTEND_URL
   Value: https://veraawell.com
   ```
7. Click "Save Changes"
8. Service will redeploy automatically (wait 2-3 minutes)

#### **Option B: Verify .env File (Backup)**

If Option A doesn't work, check your local `.env` file:

1. Open `server/.env` in your code editor
2. Add or update this line:
   ```
   FRONTEND_URL=https://veraawell.com
   ```
3. Save file
4. Commit and push:
   ```bash
   git add server/.env
   git commit -m "fix: update FRONTEND_URL"
   git push
   ```

**Important:** Make sure Render has this environment variable set!

---

## **TASK 3: SETUP UPTIMEROBOT (HIGH PRIORITY)**

### **Time Required:** 5 minutes

### **Problem:** 
Backend sleeps after 15 minutes, causing 30-60 second delays

### **Solution: UptimeRobot (FREE)**

#### **A. Create Account**

1. Go to https://uptimerobot.com
2. Click "Sign Up Free" (top right)
3. Enter your email
4. Create password
5. Verify email (check inbox)

#### **B. Add Monitor**

1. Click "Add New Monitor" (big green button)
2. Fill in these details:
   ```
   Monitor Type: HTTP(s)
   Friendly Name: Veraawell Backend
   URL (or IP): https://veraawell-backend.onrender.com/api/health
   Monitoring Interval: 5 minutes
   ```
3. Click "Create Monitor"

#### **C. Verify It's Working**

1. You should see monitor status: "Up"
2. Last check time should update every 5 minutes
3. Backend will now stay awake 24/7!

#### **D. Add Email Alerts (Optional)**

1. Click on your monitor
2. Click "Alert Contacts"
3. Add your email
4. You'll get notified if backend goes down

---

## 📋 **VERIFICATION CHECKLIST**

After completing all tasks, verify everything works:

### **✅ Domain Check (After DNS Propagation)**

```bash
# Test 1: Check DNS
nslookup veraawell.com
# Should show: cname.vercel-dns.com

# Test 2: Check website
curl -I https://veraawell.com
# Should return: HTTP/2 200

# Test 3: Open in browser
# Go to: https://veraawell.com
# Should load your website!
```

### **✅ OAuth Check**

1. Go to https://veraawell.com
2. Click "Sign in with Google"
3. Select account
4. Should redirect back to veraawell.com (NOT backend URL)
5. Should login successfully
6. No "Aw, Snap!" error

### **✅ Backend Check**

```bash
# Test response time
time curl https://veraawell-backend.onrender.com/api/health
# Should respond in <1 second (not 30-60 seconds)
```

---

## 🎯 **PRIORITY ORDER**

Do these in this exact order:

1. **FIRST:** Task 1 - Fix Domain (GoDaddy + Vercel)
   - Most critical
   - Takes longest (DNS propagation)
   - Start this NOW

2. **SECOND:** Task 2 - Fix OAuth Redirect
   - Quick fix (5 minutes)
   - Fixes OAuth errors
   - Do while waiting for DNS

3. **THIRD:** Task 3 - Setup UptimeRobot
   - Quick fix (5 minutes)
   - Keeps backend awake
   - Do while waiting for DNS

---

## ⏱️ **TIMELINE**

| Task | Your Time | Waiting Time | Total |
|------|-----------|--------------|-------|
| Task 1 (Domain) | 10 min | 1-48 hours | ~1-48 hours |
| Task 2 (OAuth) | 5 min | 2-3 min | ~8 min |
| Task 3 (UptimeRobot) | 5 min | 0 min | 5 min |
| **Total** | **20 min** | **1-48 hours** | **~1-48 hours** |

**Your active work:** Only 20 minutes!
**Waiting:** DNS propagation (happens automatically)

---

## 🆘 **TROUBLESHOOTING**

### **Issue 1: Can't find DNS settings in GoDaddy**

**Solution:**
1. Login to GoDaddy
2. Click your profile icon (top right)
3. Click "My Products"
4. Find "Domains"
5. Click "DNS" next to veraawell.com

### **Issue 2: Vercel says "Invalid Configuration"**

**Solution:**
1. Wait 10-15 minutes after changing DNS
2. Click "Refresh" in Vercel
3. If still invalid, check GoDaddy DNS is correct
4. Make sure you added CNAME, not A record

### **Issue 3: OAuth still redirects to backend**

**Solution:**
1. Check Render environment variables
2. Make sure `FRONTEND_URL=https://veraawell.com`
3. Redeploy backend service
4. Clear browser cookies
5. Try OAuth again

### **Issue 4: Backend still slow**

**Solution:**
1. Check UptimeRobot monitor is "Up"
2. Check last ping time (should be <5 min ago)
3. If monitor is down, check URL is correct
4. Try pinging manually: `curl https://veraawell-backend.onrender.com/api/health`

---

## 📞 **NEED HELP?**

### **GoDaddy Support:**
- Phone: 480-505-8877
- Chat: Available 24/7 on godaddy.com
- Say: "I need help changing DNS records for my domain"

### **Vercel Support:**
- Email: support@vercel.com
- Docs: https://vercel.com/docs/custom-domains
- Say: "I'm trying to add a custom domain from GoDaddy"

### **UptimeRobot Support:**
- Email: support@uptimerobot.com
- Docs: https://uptimerobot.com/help
- Say: "I need help setting up a monitor"

---

## ✅ **SUCCESS CRITERIA**

You'll know everything is fixed when:

1. ✅ https://veraawell.com loads your website (no timeout)
2. ✅ Google OAuth works without errors
3. ✅ OAuth redirects to veraawell.com (not backend)
4. ✅ Backend responds quickly (<1 second)
5. ✅ No "Aw, Snap!" errors
6. ✅ No 30-60 second loading delays

---

## 📝 **QUICK REFERENCE**

**URLs You Need:**
- GoDaddy: https://godaddy.com
- Vercel: https://vercel.com/dashboard
- Render: https://dashboard.render.com
- UptimeRobot: https://uptimerobot.com
- DNS Checker: https://dnschecker.org

**Values You Need:**
- CNAME Value: `cname.vercel-dns.com`
- Backend Health URL: `https://veraawell-backend.onrender.com/api/health`
- Frontend URL: `https://veraawell.com`

**Commands You Need:**
```bash
# Check DNS
nslookup veraawell.com

# Test domain
curl -I https://veraawell.com

# Test backend
curl https://veraawell-backend.onrender.com/api/health
```

---

## 🎉 **AFTER COMPLETION**

Once all tasks are done:

1. ✅ Your website will be accessible at veraawell.com
2. ✅ Google OAuth will work smoothly
3. ✅ Backend will stay awake 24/7
4. ✅ No more timeout errors
5. ✅ Professional, reliable website!

**Estimated total time:** 20 minutes of work + 1-48 hours DNS wait

**Start with Task 1 NOW! The sooner you change DNS, the sooner it propagates!**

---

## 📌 **REMEMBER**

- **Task 1 is CRITICAL** - Do this first!
- **DNS takes time** - Be patient (1-48 hours)
- **Do Task 2 & 3 while waiting** - Don't waste time
- **Test after each task** - Make sure it works
- **Keep this guide open** - Refer back as needed

**Good luck! You've got this! 🚀**
