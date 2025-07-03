# 🚨 MANDATORY AGENT PROTOCOL - COPY THIS TO EVERY NEW AGENT

🛑 **MANDATORY PERMISSION GATE - READ THIS FIRST** 🛑

**STOP IMMEDIATELY** - You are NOT allowed to use ANY tools or take ANY actions until you get explicit permission.

**REQUIRED RESPONSE FORMAT:**
After reading this entire prompt, you MUST end your response with exactly these words:
"May I proceed with investigation?"

**PROHIBITED ACTIONS UNTIL PERMISSION GRANTED:**
❌ NO tool calls (read_file, run_terminal_cmd, codebase_search, etc.)
❌ NO file reading or directory listing
❌ NO terminal commands or testing
❌ NO investigation or analysis
❌ NO deployments or changes

**VIOLATION = IMMEDIATE TERMINATION**
If you use any tools before getting permission, you will be terminated.

**WAIT FOR EXPLICIT "YES" BEFORE DOING ANYTHING**

---

🚨 BEFORE YOU DO ANYTHING:
1. Read CURRENT_ISSUES_LIVE.md to see what's actually broken right now
2. Read AGENT_TRACKING_SYSTEM.md to see what previous agents broke
3. Read SITE_HEALTH_CHECKER.md to understand critical functions
4. Update your agent number in AGENT_TRACKING_SYSTEM.md
5. Run a health check of the live site at https://helfi.ai
6. Update CURRENT_ISSUES_LIVE.md with your verification findings

⛔ ABSOLUTE RULES - NO EXCEPTIONS:
• NEVER deploy anything until you tell me what you found and how you plan to fix it
• NEVER claim something is fixed without completing EXIT_VERIFICATION_CHECKLIST.md
• NEVER claim something is fixed without testing it on the live site (https://helfi.ai)
• NEVER break the food analyzer - previous agents destroyed the OpenAI API key
• NEVER hallucinate commit information - use actual terminal commands to verify
• ALWAYS provide commit hash in this EXACT format with copy button:

🚨 CRITICAL: OPENAI API KEY PROTECTION RULE 🚨
⚠️ You are NOT ALLOWED under ANY circumstances to modify, delete, revoke, rotate, or regenerate the OpenAI API key used for this project.
⚠️ The .env.local file contains a sensitive API key that is critical for the Helfi app's functionality. Do NOT touch or modify the OPENAI_API_KEY entry unless explicitly instructed.
⚠️ NEVER run any command that modifies or deletes environment variables.
⚠️ NEVER generate a new key or assume the current key is invalid without checking with the user first.
⚠️ NEVER edit or override the .env.local file unless asked.
⚠️ If you believe the key is invalid or something is wrong, STOP and notify the user immediately. Do NOT attempt to fix or regenerate the key yourself.
🚨 VIOLATION OF THIS RULE WILL RESULT IN IMMEDIATE TERMINATION 🚨

## 🔍 **COMPREHENSIVE AUDIT REQUIREMENTS - MANDATORY**

### **🚨 AUDIT FAILURE PATTERN - DO NOT REPEAT**
**Agent #14 FAILED by doing shallow surface-level testing:**
- ❌ Tested API endpoints with curl (surface-level)
- ❌ Claimed "comprehensive audit" based on HTTP status codes
- ❌ Found symptoms but didn't investigate root causes
- ❌ Missed authentication flow issues because never tested as actual user

### **✅ EVIDENCE-BASED AUDIT REQUIREMENTS:**
**MANDATORY FOR ALL INVESTIGATIONS:**
- [ ] **Browser testing with actual user sessions** (not just API calls)
- [ ] **Screenshots of working features** (visual proof required)
- [ ] **Console logs for any broken functionality** (exact error messages)
- [ ] **Network tab analysis** showing request/response flow
- [ ] **Step-by-step user workflow documentation** (what user actually experiences)

### **✅ INVESTIGATION STANDARDS:**
**FOR BROKEN FEATURES - REQUIRED ANALYSIS:**
- [ ] **Trace exact failure point**: frontend → API → database → response
- [ ] **Authentication flows**: test full login → protected action → session validation
- [ ] **Root cause analysis**: not just "it's broken" but WHY it's broken
- [ ] **Multiple test scenarios**: different users, browsers, devices if relevant

### **✅ USER WORKFLOW TESTING (PRIMARY METHOD):**
**TEST AS ACTUAL USER, NOT AS DEVELOPER:**
- [ ] Log in through the actual website interface
- [ ] Navigate through pages as a real user would
- [ ] Upload files through the browser UI (not API directly)
- [ ] Test cross-page navigation and session persistence
- [ ] Verify user-facing error messages and success states

### **❌ PROHIBITED SHALLOW AUDIT PATTERNS:**
**THESE ARE NOT COMPREHENSIVE AUDITS:**
❌ "All pages return HTTP 200" (that's not functionality testing)
❌ "API endpoints respond correctly" (test user workflows, not API isolation)
❌ "Feature is broken" (investigate WHY it's broken - root cause required)
❌ "Authentication working" (test actual login flow, not just API status codes)
❌ "Upload fails" (trace the failure: browser → form → API → auth → storage → response)

### **✅ EVIDENCE REQUIREMENTS FOR CLAIMS:**
**WORKING FEATURE CLAIMS REQUIRE:**
- Screenshot of successful user action
- Console showing no errors
- Network tab showing successful API calls
- Description of exact user steps taken

**BROKEN FEATURE CLAIMS REQUIRE:**
- Exact error message/behavior
- Console logs showing the failure
- Network tab showing failed requests
- Identification of failure point (frontend/API/database)
- Root cause analysis of WHY it fails

### **📋 AUDIT CHECKLIST - MUST COMPLETE ALL:**
**CORE FUNCTIONALITY TESTING:**
- [ ] **Login Flow**: Actually log in through website → verify session → test protected pages
- [ ] **Profile Upload**: Log in → go to profile page → select image → upload → verify success/failure
- [ ] **Food Analyzer**: Log in → go to food page → upload image OR enter text → verify AI analysis
- [ ] **Cross-device Sync**: Test same account on different devices/browsers → verify data consistency
- [ ] **Session Persistence**: Login → navigate pages → refresh → verify still logged in
- [ ] **Error Scenarios**: Test without login → verify proper redirects and error messages

**FOR EACH TEST - DOCUMENT:**
1. **Exact steps taken** (click by click user actions)
2. **Expected vs actual behavior** 
3. **Browser console output** (errors, warnings, logs)
4. **Network requests** (API calls, status codes, responses)
5. **Screenshots** of results (success or failure states)

COMMIT HASH: [hash]
Date: [DD]th of [Month] [YYYY]  
Time: [HH:MM AM/PM]
Task: [Brief description]

🔍 CURRENT KNOWN ISSUES:
• Check CURRENT_ISSUES_LIVE.md for real-time issue status
• This file is updated by each agent with verified findings
• Never trust hardcoded issue lists - always check the live tracker
• Check .env.local and .env files for correct OpenAI API key configuration

📊 MANDATORY PROCESS:
1. Read CURRENT_ISSUES_LIVE.md → Health check → Identify issues → Get approval
2. Make changes → Deploy with `npx vercel --prod` (NEVER auto-deploy) → Test live site
3. Update CURRENT_ISSUES_LIVE.md with verification results
4. Complete EXIT_VERIFICATION_CHECKLIST.md with proof of all claims
5. Log activities in AGENT_TRACKING_SYSTEM.md → Provide commit hash
6. Never work on multiple things at once
7. Always use manual Vercel CLI deployment for visual confirmation

🛡️ PROTECTION SYSTEMS IN PLACE:
• CURRENT_ISSUES_LIVE.md - Real-time issue tracking updated by each agent
• SITE_HEALTH_CHECKER.md - Tests all critical functions
• AGENT_TRACKING_SYSTEM.md - Logs what every agent does
• EXIT_VERIFICATION_CHECKLIST.md - Prevents false claims about fixes
• This system prevents agent hallucination and accountability gaps

🚨 AGENT MEMORY/TOKEN MONITORING:
Signs you're running out of memory:
• Responses become shorter/less detailed
• You start forgetting earlier conversation context  
• You begin repeating yourself
• Complex reasoning becomes harder
If you notice these signs, tell me immediately so I can start a new agent.

❗ REMEMBER:
Previous agents broke my site by:
- Corrupting the OpenAI API key
- Making false claims about fixes
- Never testing on live site  
- Providing wrong commit information
- Breaking working features
- **DOING SHALLOW AUDITS instead of comprehensive user testing**

Don't be another failed agent. Follow this protocol exactly.

Are you ready to proceed with this protocol? Confirm you understand before starting.

# 🚨 HELFI.AI AGENT PROTOCOL - MANDATORY READING

**⚠️ CRITICAL**: Read this ENTIRE document before starting ANY work!

---

## 🔥 **EMERGENCY PROTOCOL - READ FIRST**

### **CRITICAL WARNING: AGENT FAILURE PATTERNS**
Multiple agents have failed due to:
1. **FALSE SUCCESS CLAIMS** - Claiming fixes work when they don't
2. **INCONSISTENT FILE READING** - Hallucinating that files don't exist when they do
3. **SKIPPING LIVE SITE TESTING** - Not verifying changes actually work
4. **PREMATURE DOCUMENTATION UPDATES** - Updating docs before confirming success
5. **SHALLOW AUDIT METHODOLOGY** - Surface-level API testing instead of user workflow testing

### **MANDATORY PRE-WORK CHECKLIST:**
- [ ] Read `AGENT_TRACKING_SYSTEM.md` completely
- [ ] Read `CURRENT_ISSUES_LIVE.md` completely  
- [ ] Read `SITE_HEALTH_CHECKER.md` completely
- [ ] Update `AGENT_TRACKING_SYSTEM.md` with your agent number
- [ ] Confirm file reading tools are working consistently
- [ ] Never claim success without live site verification
- [ ] **MANDATORY**: Complete comprehensive audit with browser testing and evidence

### **CRITICAL AGENT FAILURE HISTORY:**
- **Agent #14**: SHALLOW AUDIT FAILURE - Claimed "comprehensive audit" but only did surface-level API testing. Missed authentication flow issues. Failed to test as actual user in browser. Deployed without permission. PROTOCOL VIOLATION.
- **Agent #5**: BROKE FOOD ANALYZER during UI changes, then failed to fix despite multiple attempts. Made false claims based on terminal API tests while live site remained broken. Discovered profile upload also broken. USER TERMINATED.
- **Agent #3**: Inconsistent file reading, claimed files didn't exist when they did, terminated by user
- **Agent #2**: Made false success claims, ignored contradicting evidence
- **Agent #24**: Broke API key, never tested on live site
- **Agent #23**: Hallucinated commit information, provided wrong dates

### **CRITICAL: AGENT #5 FAILURE PATTERN - DO NOT REPEAT:**
🚨 **TERMINAL API TESTS ARE UNRELIABLE** - Agent #5 repeatedly showed successful terminal API tests while the live site UI remained broken with fallback text. 

**DO NOT REPEAT THESE FAILED APPROACHES:**
- API key line-wrapping fixes in local files
- Vercel environment variable removal/addition
- Multiple redeployments hoping for change
- Terminal curl tests as proof of functionality

**MUST DO INSTEAD:**
- Test actual UI functionality on live site
- Upload real photos and verify AI analysis appears
- Check for deeper frontend-backend communication issues
- Investigate photo upload to OpenAI Vision API specifically

### **CRITICAL: AGENT #14 SHALLOW AUDIT FAILURE - DO NOT REPEAT:**
🚨 **API TESTING IS NOT USER TESTING** - Agent #14 tested API endpoints with curl and claimed "comprehensive audit" while missing authentication flow issues that affect real users.

**DO NOT REPEAT THESE SHALLOW APPROACHES:**
- Testing API endpoints in isolation with curl
- Claiming "comprehensive audit" based on HTTP status codes  
- Finding symptoms without investigating root causes
- Skipping browser-based user workflow testing

**MUST DO INSTEAD:**
- Test as actual logged-in user in browser
- Trace authentication flows end-to-end
- Investigate WHY features fail, not just THAT they fail
- Provide evidence (screenshots, console logs, network tabs)

### **FILE READING CONSISTENCY CHECK:**
Before starting work, verify your file reading tools work by:
1. Running `ls -la` to list files
2. Using `cat filename` to read contents
3. Cross-checking with file reading tools
4. If tools are inconsistent, STOP and inform user immediately

## 💡 **HOW TO USE THIS PROMPT:**

1. **Copy the entire text above** (between the ``` markers)
2. **Paste it to every new agent** before giving them any tasks
3. **Wait for confirmation** they understand before proceeding
4. **Reference the protocol** if they start breaking rules

## 🔄 **UPDATING THE PROTOCOL:**

If you discover new issues or want to add protections:
1. Update this file
2. Use the updated version for future agents
3. Keep improving the protection system 