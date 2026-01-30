# Playwright MCP Setup Guide

## ✅ What's Already Done

1. **Playwright MCP installed globally** - `@playwright/mcp@latest` is installed
2. **Playwright browsers installed** - Chromium is ready to use
3. **Playwright package** - Already in your project dependencies (`playwright@^1.53.2`)

## 🔧 How to Enable Playwright MCP in Cursor

### Step 1: Open Cursor Settings
1. Open Cursor IDE
2. Press `Cmd + ,` (Mac) or `Ctrl + ,` (Windows/Linux) to open Settings
3. Or go to **Cursor** → **Settings** → **Features** → **MCP**

### Step 2: Add Playwright MCP Server
1. Click **"+ Add New MCP Server"** button
2. Fill in the form:
   - **Name**: `playwright` (or any name you prefer)
   - **Type**: Select `stdio` (standard input/output)
   - **Command**: `npx`
   - **Args**: `@playwright/mcp@latest`
3. Click **Save**

### Alternative: Manual Configuration

If you prefer to edit settings directly, add this to your Cursor settings.json:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

**Note**: Settings.json is usually located at:
- **Mac**: `~/Library/Application Support/Cursor/User/settings.json`
- **Windows**: `%APPDATA%\Cursor\User\settings.json`
- **Linux**: `~/.config/Cursor/User/settings.json`

### Step 3: Refresh MCP Tools
1. After adding the server, click the **refresh** button in the MCP settings
2. You should see Playwright tools appear in the list

## 🎯 How to Use Playwright MCP

Once configured, you can ask the AI agent to:
- Test your app by navigating to URLs
- Click buttons and fill forms
- Take screenshots
- Test login flows
- Verify UI elements
- Test on different screen sizes

### Example Requests:
- "Test the login flow on stg.helfi.ai"
- "Take a screenshot of the dashboard after logging in"
- "Fill out the food diary form and submit it"
- "Check if the mobile menu works correctly"

## ✅ Verification

To verify Playwright MCP is working:
1. Open Composer (Cmd/Ctrl + I)
2. Ask: "Can you navigate to https://stg.helfi.ai and take a screenshot?"
3. The agent should be able to use Playwright tools

## 🔍 Troubleshooting

**If tools don't appear:**
- Make sure you clicked "Refresh" after adding the server
- Restart Cursor IDE
- Check that Node.js 18+ is installed: `node --version`

**If Playwright fails:**
- Run: `npx playwright install chromium` (already done)
- Check that `@playwright/mcp` is accessible: `npx @playwright/mcp@latest --version`

## 📝 Notes

- MCP tools only work with the **Composer Agent** (not regular chat)
- Tool execution requires **user approval** before running
- Playwright MCP uses structured accessibility snapshots (not screenshots) for faster, more reliable automation
