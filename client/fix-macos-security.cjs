#!/usr/bin/env node
/**
 * Fix macOS Gatekeeper issues for native Node.js modules
 * Removes quarantine attributes from all .node files and binaries in node_modules
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function removeQuarantine(dir) {
  try {
    // Remove quarantine from directory
    execSync(`xattr -d com.apple.quarantine "${dir}" 2>/dev/null || true`, { stdio: 'ignore' });
    
    // Find all .node files and binaries (esbuild, etc.)
    const findCommand = `find "${dir}" \\( -name "*.node" -o -name "esbuild" -o -name "esbuild.exe" \\) -type f 2>/dev/null`;
    try {
      const files = execSync(findCommand, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      files.forEach(file => {
        try {
          execSync(`xattr -d com.apple.quarantine "${file}" 2>/dev/null || true`, { stdio: 'ignore' });
        } catch (e) {
          // Ignore errors
        }
      });
      if (files.length > 0) {
        console.log(`Removed quarantine from ${files.length} native module(s)`);
      }
    } catch (e) {
      // No files found or find failed
    }
  } catch (error) {
    // Ignore errors
  }
}

// Remove quarantine from node_modules
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  removeQuarantine(nodeModulesPath);
  console.log('macOS security fix applied');
} else {
  console.log('node_modules not found, skipping...');
}
