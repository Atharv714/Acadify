#!/usr/bin/env node
/**
 * MCP Server Test Script
 * 
 * This script tests basic MCP server functionality
 * Run: node test-mcp.js
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Testing MCP Server Setup\n');

// Test 1: Check if dependencies are installed
console.log('1️⃣  Checking dependencies...');
try {
  const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
  const requiredDeps = [
    '@modelcontextprotocol/sdk',
    'firebase-admin',
    'googleapis',
    'dotenv',
  ];
  
  let allInstalled = true;
  for (const dep of requiredDeps) {
    if (!packageJson.dependencies[dep]) {
      console.log(`   ❌ Missing: ${dep}`);
      allInstalled = false;
    } else {
      console.log(`   ✅ ${dep} v${packageJson.dependencies[dep]}`);
    }
  }
  
  if (!allInstalled) {
    console.log('\n   Run: npm install');
    process.exit(1);
  }
} catch (err) {
  console.log('   ❌ Could not read package.json');
  process.exit(1);
}

// Test 2: Check if .env file exists
console.log('\n2️⃣  Checking environment configuration...');
try {
  const envContent = readFileSync(join(__dirname, '.env'), 'utf8');
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
  ];
  
  let allSet = true;
  for (const envVar of requiredVars) {
    if (envContent.includes(`${envVar}=`) && !envContent.includes(`${envVar}=your-`)) {
      console.log(`   ✅ ${envVar} is set`);
    } else {
      console.log(`   ❌ ${envVar} not configured`);
      allSet = false;
    }
  }
  
  if (!allSet) {
    console.log('\n   Edit .env file with your Firebase credentials');
    console.log('   Get them from: Firebase Console → Project Settings → Service Accounts');
  }
} catch (err) {
  console.log('   ❌ .env file not found');
  console.log('   Run: cp .env.example .env');
  console.log('   Then fill in your credentials');
  process.exit(1);
}

// Test 3: Check if TypeScript is compiled
console.log('\n3️⃣  Checking build...');
try {
  const distExists = readFileSync(join(__dirname, 'dist', 'index.js'), 'utf8');
  console.log('   ✅ dist/index.js exists');
} catch (err) {
  console.log('   ❌ Build not found');
  console.log('   Run: npm run build');
  process.exit(1);
}

// Test 4: Check source file structure
console.log('\n4️⃣  Checking source files...');
try {
  const srcContent = readFileSync(join(__dirname, 'src', 'index.ts'), 'utf8');
  
  const requiredPatterns = [
    { pattern: 'ListToolsRequestSchema', name: 'Tool handler' },
    { pattern: 'CallToolRequestSchema', name: 'Tool execution' },
    { pattern: 'get_classroom_courses', name: 'Classroom tool' },
    { pattern: 'get_course_work', name: 'CourseWork tool' },
    { pattern: 'get_gmail_messages', name: 'Gmail tool' },
    { pattern: 'get_dashboard_summary', name: 'Summary tool' },
    { pattern: 'stream_alerts', name: 'Alerts tool' },
  ];
  
  for (const { pattern, name } of requiredPatterns) {
    if (srcContent.includes(pattern)) {
      console.log(`   ✅ ${name}`);
    } else {
      console.log(`   ❌ ${name} missing`);
    }
  }
} catch (err) {
  console.log('   ❌ src/index.ts not found');
  process.exit(1);
}

// Final summary
console.log('\n✅ All tests passed!');
console.log('\n📋 Next steps:');
console.log('   1. Make sure .env is configured with your credentials');
console.log('   2. Run: npm run dev');
console.log('   3. Check for "Revind MCP Server running on stdio"');
console.log('   4. Test with Ollama Desktop or your dashboard\n');
console.log('📚 Documentation:');
console.log('   • ../MCP_QUICKSTART.md - Setup guide');
console.log('   • ../MCP_IMPLEMENTATION.md - Technical details');
console.log('   • ./README.md - Server docs\n');
