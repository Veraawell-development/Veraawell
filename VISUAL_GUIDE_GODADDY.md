# 🎨 VISUAL GUIDE: Fix GoDaddy DNS (Step-by-Step with Screenshots)

## 🎯 **GOAL**
Change DNS settings in GoDaddy to make veraawell.com work

---

## 📸 **STEP 1: LOGIN TO GODADDY**

### **What to do:**
1. Open browser
2. Go to: https://godaddy.com
3. Click "Sign In" (top right corner)
4. Enter your email and password
5. Click "Sign In"

### **What you'll see:**
```
┌─────────────────────────────────────┐
│  GoDaddy                    Sign In │
│                                     │
│  [Email/Username field]             │
│  [Password field]                   │
│  [Sign In button]                   │
└─────────────────────────────────────┘
```

---

## 📸 **STEP 2: GO TO MY PRODUCTS**

### **What to do:**
1. After login, you'll see your dashboard
2. Click your profile icon (top right)
3. Click "My Products" from dropdown

### **What you'll see:**
```
┌─────────────────────────────────────┐
│  GoDaddy              [Profile Icon]│
│                         ↓            │
│                    ┌─────────────┐   │
│                    │ My Products │   │
│                    │ My Account  │   │
│                    │ Sign Out    │   │
│                    └─────────────┘   │
└─────────────────────────────────────┘
```

---

## 📸 **STEP 3: FIND YOUR DOMAIN**

### **What to do:**
1. Scroll down to "Domains" section
2. Find "veraawell.com"
3. Click the three dots (...) next to it
4. Click "Manage DNS" or "DNS"

### **What you'll see:**
```
┌─────────────────────────────────────┐
│  DOMAINS                            │
│                                     │
│  veraawell.com          [...]       │
│                          ↓          │
│                    ┌──────────────┐ │
│                    │ Manage DNS   │ │
│                    │ Edit Domain  │ │
│                    │ Renew        │ │
│                    └──────────────┘ │
└─────────────────────────────────────┘
```

---

## 📸 **STEP 4: VIEW DNS RECORDS**

### **What you'll see:**
Current DNS records page with records like this:

```
┌─────────────────────────────────────────────────────────┐
│  DNS Management for veraawell.com                       │
│                                                         │
│  Type    Name    Value              TTL      Actions   │
│  ────────────────────────────────────────────────────  │
│  A       @       76.198.78.71       600      [Edit][🗑]│  ← DELETE THIS!
│  CNAME   www     @                  600      [Edit][🗑]│
│                                                         │
│  [+ Add] button                                         │
└─────────────────────────────────────────────────────────┘
```

**IMPORTANT:** You need to DELETE the A record!

---

## 📸 **STEP 5: DELETE THE A RECORD**

### **What to do:**
1. Find the row with:
   - Type: **A**
   - Name: **@**
   - Value: **76.198.78.71**
2. Click the **trash icon (🗑)** on the right
3. Confirm deletion when asked

### **What you'll see:**
```
┌─────────────────────────────────────────────────────────┐
│  Are you sure you want to delete this record?           │
│                                                         │
│  Type: A                                                │
│  Name: @                                                │
│  Value: 76.198.78.71                                    │
│                                                         │
│  [Cancel]  [Delete]  ← Click Delete                     │
└─────────────────────────────────────────────────────────┘
```

**After deletion, the A record should be GONE!**

---

## 📸 **STEP 6: ADD FIRST CNAME RECORD (Root Domain)**

### **What to do:**
1. Click the **"+ Add"** button (or "Add Record")
2. Select **"CNAME"** from Type dropdown
3. Fill in:
   - **Name:** `@`
   - **Value:** `cname.vercel-dns.com`
   - **TTL:** 600 (or leave default)
4. Click **"Save"**

### **What you'll see:**
```
┌─────────────────────────────────────────────────────────┐
│  Add DNS Record                                         │
│                                                         │
│  Type: [CNAME ▼]  ← Select CNAME                        │
│                                                         │
│  Name: [@        ]  ← Type @                            │
│                                                         │
│  Value: [cname.vercel-dns.com]  ← Type this exactly    │
│                                                         │
│  TTL: [600 ▼]  ← Leave default                          │
│                                                         │
│  [Cancel]  [Save]  ← Click Save                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📸 **STEP 7: ADD SECOND CNAME RECORD (WWW Subdomain)**

### **What to do:**
1. Click **"+ Add"** button again
2. Select **"CNAME"** from Type dropdown
3. Fill in:
   - **Name:** `www`
   - **Value:** `cname.vercel-dns.com`
   - **TTL:** 600
4. Click **"Save"**

### **What you'll see:**
```
┌─────────────────────────────────────────────────────────┐
│  Add DNS Record                                         │
│                                                         │
│  Type: [CNAME ▼]  ← Select CNAME                        │
│                                                         │
│  Name: [www      ]  ← Type www                          │
│                                                         │
│  Value: [cname.vercel-dns.com]  ← Type this exactly    │
│                                                         │
│  TTL: [600 ▼]                                           │
│                                                         │
│  [Cancel]  [Save]  ← Click Save                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📸 **STEP 8: VERIFY DNS RECORDS**

### **What you should see now:**
Your DNS records should look like this:

```
┌─────────────────────────────────────────────────────────┐
│  DNS Management for veraawell.com                       │
│                                                         │
│  Type    Name    Value                   TTL    Actions│
│  ──────────────────────────────────────────────────────│
│  CNAME   @       cname.vercel-dns.com   600    [Edit][🗑]│  ✅ CORRECT
│  CNAME   www     cname.vercel-dns.com   600    [Edit][🗑]│  ✅ CORRECT
│                                                         │
│  [+ Add] button                                         │
└─────────────────────────────────────────────────────────┘
```

**✅ Perfect! No A records, only CNAME records!**

---

## 📸 **STEP 9: CONFIGURE VERCEL**

### **What to do:**
1. Go to: https://vercel.com/dashboard
2. Login with your account
3. Click on your project (Veraawell)
4. Click "Settings" (top menu)
5. Click "Domains" (left sidebar)

### **What you'll see:**
```
┌─────────────────────────────────────────────────────────┐
│  Vercel Dashboard > Veraawell > Settings > Domains      │
│                                                         │
│  Production Domains                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │ veraawell.vercel.app                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Add Domain] button  ← Click this                      │
└─────────────────────────────────────────────────────────┘
```

---

## 📸 **STEP 10: ADD DOMAIN IN VERCEL**

### **What to do:**
1. Click **"Add Domain"** button
2. Type: `veraawell.com`
3. Click **"Add"**
4. Wait for verification (10-30 seconds)

### **What you'll see:**
```
┌─────────────────────────────────────────────────────────┐
│  Add Domain                                             │
│                                                         │
│  Domain: [veraawell.com          ]                      │
│                                                         │
│  [Cancel]  [Add]  ← Click Add                           │
└─────────────────────────────────────────────────────────┘
```

**Then:**
```
┌─────────────────────────────────────────────────────────┐
│  Verifying DNS configuration...                         │
│  [Loading spinner]                                      │
└─────────────────────────────────────────────────────────┘
```

**After verification:**
```
┌─────────────────────────────────────────────────────────┐
│  Production Domains                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │ veraawell.com                                   │   │
│  │ Status: Valid Configuration ✅                   │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ veraawell.vercel.app                            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 📸 **STEP 11: ADD WWW SUBDOMAIN**

### **What to do:**
1. Click **"Add Domain"** again
2. Type: `www.veraawell.com`
3. Click **"Add"**

### **Final result:**
```
┌─────────────────────────────────────────────────────────┐
│  Production Domains                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │ veraawell.com                                   │   │
│  │ Status: Valid Configuration ✅                   │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ www.veraawell.com                               │   │
│  │ Status: Valid Configuration ✅                   │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ veraawell.vercel.app                            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**✅ Perfect! All domains configured!**

---

## ⏱️ **WAIT FOR DNS PROPAGATION**

### **What happens now:**
- DNS changes need to propagate globally
- Takes 1-48 hours (usually 1-4 hours)
- Nothing you can do to speed this up
- Just wait patiently!

### **Check propagation status:**
1. Go to: https://dnschecker.org
2. Enter: `veraawell.com`
3. Select: `CNAME` record type
4. Click "Search"

### **What you'll see:**
```
┌─────────────────────────────────────────────────────────┐
│  DNS Checker - veraawell.com (CNAME)                    │
│                                                         │
│  Location          Status    Result                     │
│  ────────────────────────────────────────────────────  │
│  🇺🇸 USA           ✅        cname.vercel-dns.com       │
│  🇬🇧 UK            ✅        cname.vercel-dns.com       │
│  🇮🇳 India         ✅        cname.vercel-dns.com       │
│  🇯🇵 Japan         ✅        cname.vercel-dns.com       │
│  🇦🇺 Australia     ✅        cname.vercel-dns.com       │
│                                                         │
│  All green checkmarks = DNS propagated! ✅              │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ **SUCCESS! TEST YOUR WEBSITE**

### **After DNS propagates, test:**

1. **Open browser**
2. **Go to:** https://veraawell.com
3. **You should see:** Your website loads! 🎉

### **What you'll see:**
```
┌─────────────────────────────────────────────────────────┐
│  🔒 veraawell.com                                       │
│                                                         │
│  [Your beautiful website loads here!]                   │
│                                                         │
│  ✅ No timeout errors                                   │
│  ✅ No "site can't be reached"                          │
│  ✅ Fast loading                                        │
│  ✅ SSL certificate (padlock icon)                      │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 **QUICK CHECKLIST**

Use this to track your progress:

- [ ] Logged into GoDaddy
- [ ] Went to "My Products"
- [ ] Clicked "Manage DNS" for veraawell.com
- [ ] Deleted A record (76.198.78.71)
- [ ] Added CNAME: @ → cname.vercel-dns.com
- [ ] Added CNAME: www → cname.vercel-dns.com
- [ ] Logged into Vercel
- [ ] Added domain: veraawell.com
- [ ] Added domain: www.veraawell.com
- [ ] Vercel shows "Valid Configuration"
- [ ] Waiting for DNS propagation
- [ ] Checked dnschecker.org
- [ ] Tested https://veraawell.com
- [ ] Website loads successfully! 🎉

---

## ⚠️ **COMMON MISTAKES TO AVOID**

### **❌ MISTAKE 1: Adding A record instead of CNAME**
**Wrong:**
```
Type: A
Name: @
Value: 76.76.21.21  ← NO! Don't use A records!
```

**Correct:**
```
Type: CNAME
Name: @
Value: cname.vercel-dns.com  ← YES! Use CNAME!
```

### **❌ MISTAKE 2: Wrong CNAME value**
**Wrong:**
```
Value: vercel.com  ← NO!
Value: veraawell.vercel.app  ← NO!
Value: cname.vercel.com  ← NO!
```

**Correct:**
```
Value: cname.vercel-dns.com  ← YES! Exactly this!
```

### **❌ MISTAKE 3: Not deleting old A record**
**Wrong:**
```
A       @       76.198.78.71  ← Still there!
CNAME   @       cname.vercel-dns.com
```

**Correct:**
```
CNAME   @       cname.vercel-dns.com  ← Only CNAME!
```

### **❌ MISTAKE 4: Testing too soon**
**Wrong:**
- Change DNS
- Test immediately
- "It doesn't work!" 😢

**Correct:**
- Change DNS
- Wait 1-4 hours
- Check dnschecker.org
- Test when propagated ✅

---

## 📞 **NEED HELP?**

### **Can't find DNS settings?**
- Call GoDaddy: 480-505-8877
- Say: "I need help accessing DNS management for my domain"

### **Vercel not accepting domain?**
- Email: support@vercel.com
- Say: "I'm trying to add veraawell.com from GoDaddy"

### **DNS not propagating?**
- Wait 24 hours
- If still not working, contact GoDaddy support

---

## 🎉 **CONGRATULATIONS!**

Once you see your website at https://veraawell.com, you've successfully:

✅ Fixed DNS configuration
✅ Connected domain to Vercel
✅ Enabled SSL certificate
✅ Made website accessible to everyone
✅ Solved the timeout issue

**Your website is now live on your custom domain! 🚀**

---

**Remember:** DNS propagation takes time. Be patient! Usually works within 1-4 hours, but can take up to 48 hours in rare cases.
