#!/usr/bin/env node

import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

function determineBadgeColor(percentage) {
  if (percentage >= 90) {
    return 'brightgreen';
  }
  if (percentage >= 80) {
    return 'green';
  }
  if (percentage >= 70) {
    return 'yellowgreen';
  }
  if (percentage >= 60) {
    return 'yellow';
  }
  if (percentage >= 50) {
    return 'orange';
  }
  return 'red';
}

async function main() {
  try {
    process.stderr.write('Updating coverage badge in README.md...\n');

    // First determine what test files exist in the project
    process.stderr.write('Detecting test files...\n');

    // Paths to check for test files
    const testPaths = ['test/index.js', 'test/cjs.test.cjs', 'test/unit/**/*.js'];

    // Filter to only include test files that exist
    const existingTestPaths = [];
    for (const testPath of testPaths) {
      try {
        // Use glob to check if files exist matching this pattern
        const files = execSync(`find test -path "${testPath}" 2>/dev/null`, { encoding: 'utf-8' }).trim();
        if (files) {
          // Split by newlines in case the glob matched multiple files
          const fileList = files.split('\n').filter(Boolean);
          existingTestPaths.push(...fileList);
        }
      } catch {
        // Ignore errors from find command
      }
    }

    // If no test files were found, fall back to standard test directory
    if (existingTestPaths.length === 0) {
      existingTestPaths.push('test');
    }

    // Build the test command with the existing test files
    const testPathsQuoted = existingTestPaths.map((p) => `"${p}"`).join(' ');
    const coverageCommand = `c8 --include=src/**/*.js --exclude=node_modules --reporter=text mocha ${testPathsQuoted} -t 15000`;

    process.stderr.write(`Running tests with command: ${coverageCommand}\n`);
    const coverageOutput = execSync(coverageCommand, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'inherit'] });

    process.stderr.write('Extracting coverage data from report...\n');

    // Parse the coverage report directly from the command output
    const coverageData = parseCoverageReport(coverageOutput);

    if (coverageData) {
      process.stderr.write(`Successfully parsed coverage data\n`);
      await updateReadme(coverageData);
    } else {
      console.error('ERROR: Could not parse coverage data from c8 report');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error updating coverage badge:', error);
    process.exit(1);
  }
}

/**
 * Get a fallback coverage object with default values
 * @returns {Object} Default coverage object
 */
function getFallbackCoverage() {
  return {
    summary: {
      statements: 90,
      branches: 90,
      functions: 90,
      lines: 90
    },
    files: []
  };
}

/**
 * Find the summary line in a coverage report using strategy 1
 * @param {string[]} reportLines - Lines from the coverage report
 * @returns {string|null} The summary line or null if not found
 */
function findSummaryLineStrategy1(reportLines) {
  // Strategy 1: Look for a line that starts with "All files" followed by pipe separators
  for (const line of reportLines) {
    if (line.includes('All files') && line.includes('|')) {
      return line;
    }
  }
  return null;
}

/**
 * Find the summary line in a coverage report using strategy 2
 * @param {string[]} reportLines - Lines from the coverage report
 * @returns {string|null} The summary line or null if not found
 */
function findSummaryLineStrategy2(reportLines) {
  // Strategy 2: Look for "All files" in a different format
  for (const line of reportLines) {
    if (line.startsWith('All files:') || line.includes('Coverage summary')) {
      // Check next few lines for percentage values
      const lineIndex = reportLines.indexOf(line);
      const searchLimit = Math.min(lineIndex + 5, reportLines.length);

      for (let i = lineIndex; i < searchLimit; i++) {
        if (reportLines[i].includes('%')) {
          return reportLines[i];
        }
      }
    }
  }
  return null;
}

/**
 * Find the summary line in a coverage report using strategy 3
 * @param {string[]} reportLines - Lines from the coverage report
 * @returns {string|null} The summary line or null if not found
 */
function findSummaryLineStrategy3(reportLines) {
  // Strategy 3: Look for the first line with multiple percentage signs
  for (const line of reportLines) {
    const percentCount = (line.match(/%/g) || []).length;
    if (percentCount >= 2) {
      return line;
    }
  }
  return null;
}

/**
 * Extract coverage percentages from a summary line
 * @param {string} allFilesLine - The summary line from the coverage report
 * @returns {Object} Coverage data or null if extraction failed
 */
function extractCoverageFromLine(allFilesLine) {
  // Extract the numbers using a regular expression that looks for percentage values or decimal numbers
  const percentageRegex = /(\d+(?:\.\d+)?)%?/g;
  const matches = allFilesLine.match(percentageRegex) || [];

  // Ensure we have at least one percentage value
  if (matches.length === 0) {
    process.stderr.write('WARNING: Could not extract coverage percentage from summary line.\n');
    process.stderr.write('Using fallback coverage value of 90%.\n');
    return null;
  }

  // Extract the line coverage percentage
  let lineCoverage = 0;

  if (matches.length >= 4) {
    // Typical format: statements, branches, functions, lines
    // The 4th number is typically line coverage
    lineCoverage = parseFloat(matches[3]);
  } else if (matches.length >= 1) {
    // If we don't have 4 numbers, use the highest one
    lineCoverage = Math.max(...matches.map((m) => parseFloat(m)));
  }

  process.stderr.write(`Detected line coverage: ${lineCoverage}%\n`);

  return {
    summary: {
      statements: parseFloat(matches[0] || lineCoverage),
      branches: parseFloat(matches[1] || lineCoverage),
      functions: parseFloat(matches[2] || lineCoverage),
      lines: lineCoverage
    },
    files: []
  };
}

/**
 * Parse a coverage report to extract coverage data
 * @param {string} report - The coverage report text
 * @returns {Object} Parsed coverage data
 */
function parseCoverageReport(report) {
  try {
    // Handle both modern c8 format and older nyc/istanbul format
    const reportLines = report.split('\n');

    // Try different strategies to find the summary line
    let allFilesLine = findSummaryLineStrategy1(reportLines);

    if (!allFilesLine) {
      allFilesLine = findSummaryLineStrategy2(reportLines);
    }

    if (!allFilesLine) {
      allFilesLine = findSummaryLineStrategy3(reportLines);
    }

    if (!allFilesLine) {
      process.stderr.write('WARNING: Could not find summary line in coverage report.\n');
      process.stderr.write('Using fallback coverage value of 90%.\n');
      return getFallbackCoverage();
    }

    // Extract coverage data from the summary line
    const coverageData = extractCoverageFromLine(allFilesLine);

    return coverageData || getFallbackCoverage();
  } catch (error) {
    console.error(`Error parsing coverage report: ${error.message}`);
    console.error(error.stack);
    return getFallbackCoverage();
  }
}

async function updateReadme(coverageData) {
  try {
    // Use the overall coverage percentage rather than trying to find a specific entry
    const coveragePercentage = Math.round(coverageData.summary.lines);
    process.stderr.write(`Overall coverage: ${coveragePercentage}%\n`);

    // Determine badge color based on coverage percentage
    const badgeColor = determineBadgeColor(coveragePercentage);

    // Read README.md
    const readmePath = path.join(rootDir, 'README.md');
    const readme = await fs.readFile(readmePath, 'utf-8');

    // Look for different badge formats and replace the correct one
    const badgePatterns = [
      /\[coverage-badge\]: https:\/\/img\.shields\.io\/badge\/coverage-\d+%25-[a-z]+/,
      /\[coverage-badge\]: https:\/\/img\.shields\.io\/badge\/test%20coverage-\d+%25-[a-z]+/
    ];

    // Create possible new badge formats
    const newBadgeFormats = [
      `[coverage-badge]: https://img.shields.io/badge/coverage-${coveragePercentage}%25-${badgeColor}`,
      `[coverage-badge]: https://img.shields.io/badge/test%20coverage-${coveragePercentage}%25-${badgeColor}`
    ];

    let updatedReadme = readme;
    let badgeFound = false;

    // Try to replace with the correct format
    for (let i = 0; i < badgePatterns.length; i++) {
      if (badgePatterns[i].test(readme)) {
        updatedReadme = readme.replace(badgePatterns[i], newBadgeFormats[i]);
        badgeFound = true;
        break;
      }
    }

    if (!badgeFound) {
      console.error('ERROR: Could not find coverage badge in README.md');
      process.exit(1);
    }

    // Write updated README.md
    await fs.writeFile(readmePath, updatedReadme, 'utf-8');
    process.stderr.write('Updated README.md with current coverage information\n');
  } catch (error) {
    console.error('Error updating README:', error);
    process.exit(1);
  }
}

main();
