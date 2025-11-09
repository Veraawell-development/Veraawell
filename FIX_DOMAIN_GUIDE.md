# 🔧 FIX veraawell.com DOMAIN - STEP BY STEP GUIDE

## ❌ **CURRENT PROBLEM**
Your website shows `ERR_CONNECTION_TIMED_OUT` when accessing https://veraawell.com

**Root Cause:** Domain points to wrong IP address (76.198.78.71) which doesn't belong to Vercel.

---

## ✅ **SOLUTION: Configure Domain Properly**

### **STEP 1: Login to GoDaddy**

1. Go to https://godaddy.com
2. Login with your credentials
3. Click on your profile → "My Products"
4. Find "veraawell.com" and click "DNS"

---

### **STEP 2: Remove Wrong A Record**

**Current DNS Settings (WRONG):**
```
Type: A
Name: @
Value: 76.198.78.71  ← This is WRONG!
```

**What to do:**
1. Find the A record pointing to `76.198.78.71`
2. Click the trash/delete icon next to it
3. Confirm deletion
4. **DO NOT add a new A record!**

---

### **STEP 3: Add Correct CNAME Record**

**Add this CNAME record:**
```
Type: CNAME
Name: @
Value: cname.vercel-dns.com
TTL: 600 (or default)
```

**Steps:**
1. Click "Add" or "Add Record"
2. Select "CNAME" from dropdown
3. In "Name" field: Enter `@`
4. In "Value" field: Enter `cname.vercel-dns.com`
5. Click "Save"

**Also add www subdomain:**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: 600
```

---

### **STEP 4: Configure Vercel**

1. Go to https://vercel.com/dashboard
2. Select your project (Veraawell)
3. Go to "Settings" → "Domains"
4. Click "Add Domain"
5. Enter: `veraawell.com`
6. Click "Add"
7. Vercel will verify the domain
8. Also add: `www.veraawell.com`

**Expected Vercel Status:**
```
✅ veraawell.com - Valid Configuration
✅ www.veraawell.com - Valid Configuration
```

---

### **STEP 5: Wait for DNS Propagation**

**Time Required:** 24-48 hours (usually faster, 1-4 hours)

**Check propagation status:**
```bash
# Check if DNS updated
nslookup veraawell.com

# Should show:
# veraawell.com canonical name = cname.vercel-dns.com
```

**Online tools to check:**
- https://dnschecker.org
- https://www.whatsmydns.net

---

### **STEP 6: Test Your Website**

After DNS propagates, test:

```bash
# Test domain
curl -I https://veraawell.com

# Should return:
# HTTP/2 200
# server: Vercel
```

**Browser test:**
1. Open https://veraawell.com
2. Should load your website!
3. No more timeout errors!

---

## 🚀 **ALTERNATIVE: Use Vercel Nameservers (Faster)**

If you want instant control:

### **Option A: Change Nameservers**

**In GoDaddy:**
1. Go to Domain Settings
2. Find "Nameservers" section
3. Click "Change"
4. Select "Custom"
5. Add Vercel nameservers:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
6. Save

**In Vercel:**
1. Go to project settings
2. Domains → Add Domain
3. Vercel will manage all DNS

**Benefits:**
- Instant updates (no waiting)
- Better performance
- Easier management

---

## 📋 **FINAL DNS CONFIGURATION**

Your GoDaddy DNS should look like this:

```
Type    Name    Value                   TTL
CNAME   @       cname.vercel-dns.com    600
CNAME   www     cname.vercel-dns.com    600
```

**Remove these if present:**
```
❌ A      @       76.198.78.71
❌ A      @       Any other IP
```

---

## 🔍 **TROUBLESHOOTING**

### **Issue 1: Still timing out after 48 hours**

**Check:**
```bash
dig veraawell.com
```

**If still shows old IP:**
- Clear DNS cache: `sudo dscacheutil -flushcache` (Mac)
- Try different network (mobile data)
- Contact GoDaddy support

### **Issue 2: Vercel shows "Invalid Configuration"**

**Solutions:**
- Wait 10-15 minutes after DNS change
- Click "Refresh" in Vercel dashboard
- Remove and re-add domain in Vercel

### **Issue 3: Works on some networks, not others**

**Cause:** DNS propagation not complete
**Solution:** Wait 24 more hours

### **Issue 4: Certificate errors (HTTPS issues)**

**Vercel auto-generates SSL:**
- Wait 5-10 minutes after domain verification
- Vercel will issue Let's Encrypt certificate
- Should auto-renew every 90 days

---

## ✅ **VERIFICATION CHECKLIST**

- [ ] Removed A record pointing to 76.198.78.71
- [ ] Added CNAME record: @ → cname.vercel-dns.com
- [ ] Added CNAME record: www → cname.vercel-dns.com
- [ ] Added domain in Vercel dashboard
- [ ] Vercel shows "Valid Configuration"
- [ ] Waited for DNS propagation
- [ ] Tested https://veraawell.com (works!)
- [ ] Tested https://www.veraawell.com (works!)
- [ ] SSL certificate active (padlock icon)

---

## 📞 **NEED HELP?**

**GoDaddy Support:**
- Phone: 480-505-8877
- Chat: Available 24/7 on godaddy.com

**Vercel Support:**
- Email: support@vercel.com
- Docs: https://vercel.com/docs/custom-domains

**DNS Propagation Check:**
- https://dnschecker.org
- Enter: veraawell.com
- Should show: cname.vercel-dns.com

---

## 🎯 **EXPECTED TIMELINE**

| Step | Time |
|------|------|
| Remove A record | 2 minutes |
| Add CNAME records | 2 minutes |
| Configure Vercel | 5 minutes |
| DNS propagation | 1-48 hours |
| SSL certificate | 5-10 minutes |
| **Total** | **1-48 hours** |

**Most cases:** Domain works within 1-4 hours!

---

## 📝 **NOTES**

1. **Don't use A records for Vercel** - Always use CNAME
2. **@ means root domain** - veraawell.com (without www)
3. **www is subdomain** - www.veraawell.com
4. **Both should point to same CNAME** - cname.vercel-dns.com
5. **Vercel handles SSL automatically** - No action needed

---

**After completing these steps, your website will be accessible at:**
- ✅ https://veraawell.com
- ✅ https://www.veraawell.com
- ✅ https://veraawell.vercel.app (backup URL)

**Backend will remain at:**
- ✅ https://veraawell-backend.onrender.com

This is normal! Frontend and backend are separate services.
