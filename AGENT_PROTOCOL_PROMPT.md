# 🚨 MANDATORY AGENT PROTOCOL - COPY THIS TO EVERY NEW AGENT

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

### **MANDATORY PRE-WORK CHECKLIST:**
- [ ] Read `AGENT_TRACKING_SYSTEM.md` completely
- [ ] Read `CURRENT_ISSUES_LIVE.md` completely  
- [ ] Read `SITE_HEALTH_CHECKER.md` completely
- [ ] Update `AGENT_TRACKING_SYSTEM.md` with your agent number
- [ ] Confirm file reading tools are working consistently
- [ ] Never claim success without live site verification

### **CRITICAL AGENT FAILURE HISTORY:**
- **Agent #3**: Inconsistent file reading, claimed files didn't exist when they did, terminated by user
- **Agent #2**: Made false success claims, ignored contradicting evidence
- **Agent #24**: Broke API key, never tested on live site
- **Agent #23**: Hallucinated commit information, provided wrong dates

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