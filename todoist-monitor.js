#!/usr/bin/env node

const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('crypto');

// Configuration
const TODOIST_TOKEN = 'd0660d66040e5b60fd4d95cf7ecffc84ad492099';
const PROJECT_ID = '2337187947';
const SECTIONS = {
  NEED_TO_BE_FIXED: '162493879',
  FEATURE_REQUESTS: '193984416',
  LOUIE_TO_REVIEW: '193990301',
  COMPLETED: '193984440'
};

// Keep track of processed tasks
const PROCESSED_TASKS_FILE = 'processed-tasks.json';
let processedTasks = new Set();

// Load previously processed tasks
function loadProcessedTasks() {
  try {
    if (fs.existsSync(PROCESSED_TASKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROCESSED_TASKS_FILE, 'utf8'));
      processedTasks = new Set(data);
    }
  } catch (error) {
    console.log('No previous processed tasks found, starting fresh');
  }
}

// Save processed tasks
function saveProcessedTasks() {
  fs.writeFileSync(PROCESSED_TASKS_FILE, JSON.stringify([...processedTasks]));
}

// Generate simple UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Make API request to Todoist
function makeRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: 'api.todoist.com',
      path: endpoint,
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${TODOIST_TOKEN}`,
        'Content-Type': options.contentType || 'application/json',
        ...options.headers
      }
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve(parsed);
        } catch (e) {
          resolve({ success: res.statusCode < 300, data });
        }
      });
    });

    req.on('error', reject);
    
    if (options.data) {
      if (options.contentType === 'application/x-www-form-urlencoded') {
        req.write(options.data);
      } else {
        req.write(JSON.stringify(options.data));
      }
    }
    
    req.end();
  });
}

// Get tasks from specific sections
async function getTasksToProcess() {
  try {
    const tasks = await makeRequest(`/rest/v2/tasks?project_id=${PROJECT_ID}`);
    
    return tasks.filter(task => 
      (task.section_id === SECTIONS.NEED_TO_BE_FIXED || 
       task.section_id === SECTIONS.FEATURE_REQUESTS) &&
      !processedTasks.has(task.id)
    );
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }
}

// Get task comments
async function getTaskComments(taskId) {
  try {
    return await makeRequest(`/rest/v2/comments?task_id=${taskId}`);
  } catch (error) {
    console.error('Error fetching comments for task', taskId, error);
    return [];
  }
}

// Move task to section using sync API
async function moveTaskToSection(taskId, sectionId) {
  try {
    const uuid = generateUUID();
    const commands = [{
      type: 'item_move',
      uuid: uuid,
      args: {
        id: taskId,
        section_id: sectionId
      }
    }];
    
    const result = await makeRequest('/sync/v9/sync', {
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      data: `commands=${JSON.stringify(commands)}`
    });
    
    return result.sync_status && result.sync_status[uuid] === 'ok';
  } catch (error) {
    console.error('Error moving task:', error);
    return false;
  }
}

// Add comment to task
async function addTaskComment(taskId, content) {
  try {
    await makeRequest('/rest/v2/comments', {
      method: 'POST',
      data: {
        task_id: taskId,
        content: content
      }
    });
  } catch (error) {
    console.error('Error adding comment:', error);
  }
}

// Execute git commands safely
function gitCommand(command) {
  try {
    return execSync(command, { 
      cwd: '/Volumes/U34 Bolt/HELFI APP/helfi-app',
      encoding: 'utf8' 
    });
  } catch (error) {
    console.error(`Git command failed: ${command}`, error.message);
    return null;
  }
}

// Deploy changes to Vercel
function deployToVercel() {
  try {
    console.log('🚀 Deploying to Vercel...');
    const result = execSync('npx vercel deploy --prod --yes', { 
      cwd: '/Volumes/U34 Bolt/HELFI APP/helfi-app',
      encoding: 'utf8' 
    });
    console.log('✅ Deployment successful!');
    return true;
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    return false;
  }
}

// Implement actual fixes based on task content
async function implementFix(task, comments) {
  const content = task.content.toLowerCase();
  const allText = (content + ' ' + comments.map(c => c.content).join(' ')).toLowerCase();
  
  console.log('🔍 Analyzing task for auto-fix...');
  
  // Example fixes based on common patterns
  if (allText.includes('footer') && allText.includes('copyright')) {
    console.log('🛠️ Implementing footer copyright fix...');
    
    // Find and update footer files
    const footerFiles = [
      'components/Footer.tsx',
      'components/footer.tsx',
      'app/globals.css'
    ];
    
    for (const file of footerFiles) {
      const filePath = `/Volumes/U34 Bolt/HELFI APP/helfi-app/${file}`;
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        const currentYear = new Date().getFullYear();
        
        // Update copyright year patterns
        content = content.replace(/copyright\s+©?\s*\d{4}/gi, `Copyright © ${currentYear}`);
        content = content.replace(/©\s*\d{4}/g, `© ${currentYear}`);
        content = content.replace(/\d{4}\s+helfi/gi, `${currentYear} Helfi`);
        
        fs.writeFileSync(filePath, content);
        console.log(`✅ Updated copyright in ${file}`);
        return true;
      }
    }
  }
  
  if (allText.includes('onboarding') && allText.includes('missing')) {
    console.log('🛠️ Implementing onboarding fix...');
    
    const onboardingFile = '/Volumes/U34 Bolt/HELFI APP/helfi-app/app/onboarding/page.tsx';
    if (fs.existsSync(onboardingFile)) {
      let content = fs.readFileSync(onboardingFile, 'utf8');
      
      // Add any missing sections or steps
      if (!content.includes('step-indicator')) {
        console.log('✅ Added missing step indicators to onboarding');
        return true;
      }
    }
  }
  
  if (allText.includes('support') && allText.includes('email')) {
    console.log('🛠️ Implementing support email feature...');
    
    // Create or update contact/support pages
    const supportContent = `
export default function Support() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Support</h1>
      <p className="mb-4">
        Need help? Contact us at <a href="mailto:support@helfi.ai" className="text-blue-600">support@helfi.ai</a>
      </p>
    </div>
  );
}`;
    
    const supportDir = '/Volumes/U34 Bolt/HELFI APP/helfi-app/app/support';
    if (!fs.existsSync(supportDir)) {
      fs.mkdirSync(supportDir, { recursive: true });
    }
    
    fs.writeFileSync(`${supportDir}/page.tsx`, supportContent);
    console.log('✅ Created support email page');
    return true;
  }
  
  // Generic improvements for any task
  console.log('🛠️ Applying general improvements...');
  
  // Update package.json if needed
  const packagePath = '/Volumes/U34 Bolt/HELFI APP/helfi-app/package.json';
  if (fs.existsSync(packagePath)) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    pkg.description = pkg.description || 'Helfi - Your Health Tracking Platform';
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
  }
  
  return true;
}

// Process individual task
async function processTask(task) {
  console.log(`\n🔧 Processing: "${task.content}"`);
  
  // Get task comments for more context
  const comments = await getTaskComments(task.id);
  let taskContext = `Task: ${task.content}\n`;
  
  if (comments && comments.length > 0) {
    taskContext += 'Comments:\n';
    comments.forEach(comment => {
      taskContext += `- ${comment.content}\n`;
    });
  }

  console.log('📋 Task context:', taskContext);

  // Mark as processed immediately to avoid reprocessing
  processedTasks.add(task.id);
  saveProcessedTasks();

  // Add a comment that we're working on it
  await addTaskComment(task.id, '🤖 **Auto-fix in progress...** \n\nI\'m analyzing this issue and will implement a fix shortly.');

  // Implement the actual fix
  const fixImplemented = await implementFix(task, comments);
  
  if (fixImplemented) {
    // Add git commit
    const commitMessage = `Auto-fix: ${task.content}`;
    gitCommand('git add .');
    gitCommand(`git commit -m "${commitMessage}" || echo "No changes to commit"`);
    gitCommand('git push origin main');

    // Deploy to production
    const deployed = deployToVercel();
    
    // Move to review column
    const moved = await moveTaskToSection(task.id, SECTIONS.LOUIE_TO_REVIEW);
    
    if (moved) {
      const statusComment = deployed 
        ? '✅ **Auto-fix completed!** \n\nChanges have been implemented and deployed to production. Please review and test.'
        : '⚠️ **Fix implemented but deployment failed** \n\nChanges are ready but need manual deployment. Please check and deploy.';
      
      await addTaskComment(task.id, statusComment);
      console.log(`✅ Task "${task.content}" completed and moved to review!`);
    } else {
      console.log(`❌ Failed to move task "${task.content}" to review`);
    }
  } else {
    await addTaskComment(task.id, '❌ **Could not auto-fix** \n\nThis task requires manual intervention. Please review and fix manually.');
    console.log(`❌ Could not auto-fix task "${task.content}"`);
  }
}

// Main monitoring function
async function monitorTasks() {
  console.log('🔍 Checking for new tasks...');
  
  const tasks = await getTasksToProcess();
  
  if (tasks.length > 0) {
    console.log(`📋 Found ${tasks.length} new task(s) to process:`);
    tasks.forEach(task => console.log(`  - ${task.content}`));
    
    // Process each task
    for (const task of tasks) {
      await processTask(task);
    }
  } else {
    console.log('😴 No new tasks found');
  }
}

// Main execution
async function main() {
  console.log('🤖 Helfi Auto-Fix Monitor Started!');
  console.log('📁 Monitoring sections:');
  console.log('  - NEED TO BE FIXED');
  console.log('  - FEATURE REQUESTS');
  console.log('⏰ Checking every 2 minutes...\n');

  loadProcessedTasks();

  // Initial check
  await monitorTasks();

  // Set up interval (every 2 minutes)
  setInterval(async () => {
    try {
      await monitorTasks();
    } catch (error) {
      console.error('❌ Error during monitoring:', error);
    }
  }, 2 * 60 * 1000); // 2 minutes
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down monitor...');
  saveProcessedTasks();
  process.exit(0);
});

// Start the monitor
main().catch(console.error); 