#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const templateAnalyzer = require('./services/templateAnalyzer');

async function testTemplateAnalyzer() {
  console.log('🧪 Testing Enhanced Template Analyzer...');
  console.log('==========================================');
  
  try {
    // Create a sample template for testing
    const sampleTemplate = `
# EMPLOYMENT CONTRACT

## Employee Information
**Employee Name:** {{employeeName}}
**Email:** {{employeeEmail}}
**Phone:** {{employeePhone}}
**Address:** {{employeeAddress}}
**City:** {{employeeCity}}
**State:** {{employeeState}}
**Zip Code:** {{employeeZipCode}}

## Employment Details
**Start Date:** {{startDate}}
**Position:** {{jobTitle}}
**Department:** {{department}}
**Salary:** ${{annualSalary}}
**Employment Type:** {{employmentType}}

## Benefits
- Health Insurance: {{healthInsurance}}
- Dental Insurance: {{dentalInsurance}}
- 401(k) Match: {{retirementMatch}}%
- Vacation Days: {{vacationDays}} days/year

## Terms and Conditions
This agreement is effective from {{effectiveDate}} and will continue until terminated.

**Company Name:** {{companyName}}
**HR Manager:** {{hrManager}}
**Date:** {{contractDate}}
    `;

    const tempDir = path.join(__dirname, 'temp');
    const templatePath = path.join(tempDir, 'sample-contract.txt');
    
    // Ensure temp directory exists
    await fs.ensureDir(tempDir);
    await fs.writeFile(templatePath, sampleTemplate);

    console.log('📄 Created sample employment contract template');
    console.log('🔍 Analyzing template...\n');

    // Analyze the template
    const analysis = await templateAnalyzer.analyzeTemplate(templatePath, 'txt');

    // Display analysis results
    console.log('📊 TEMPLATE ANALYSIS RESULTS:');
    console.log('============================');
    
    console.log(`📁 File: ${analysis.metadata.filename}`);
    console.log(`📏 Size: ${Math.round(analysis.metadata.fileSize / 1024)}KB`);
    console.log(`📝 Word Count: ${analysis.wordCount}`);
    console.log(`📄 Paragraphs: ${analysis.paragraphCount}`);
    console.log(`🏷️  Complexity: ${analysis.complexity}`);
    
    console.log('\n🔍 PLACEHOLDERS:');
    console.log('================');
    console.log(`Total: ${analysis.placeholders.count}`);
    
    Object.entries(analysis.placeholders.categorized).forEach(([category, fields]) => {
      if (fields.length > 0) {
        console.log(`\n${category.toUpperCase()} (${fields.length}):`);
        fields.forEach(field => console.log(`  • ${field}`));
      }
    });

    console.log('\n🏗️  DOCUMENT STRUCTURE:');
    console.log('=======================');
    console.log(`Sections: ${analysis.structure.metadata.totalSections}`);
    console.log(`Headings: ${analysis.structure.metadata.totalHeadings}`);
    console.log(`Lists: ${analysis.structure.metadata.totalLists}`);
    console.log(`Tables: ${analysis.structure.metadata.totalTables}`);
    console.log(`Paragraphs: ${analysis.structure.metadata.totalParagraphs}`);

    console.log('\n📋 SECTIONS:');
    analysis.structure.sections.forEach((section, index) => {
      console.log(`  ${index + 1}. ${section.title}`);
    });

    console.log('\n⏱️  PROCESSING ESTIMATE (100 documents):');
    console.log('==========================================');
    const estimate = templateAnalyzer.estimateProcessingTime(analysis, 100);
    console.log(`Total Time: ${estimate.totalTime}ms (${(estimate.totalTime / 1000).toFixed(1)}s)`);
    console.log(`Per Document: ${estimate.perDocument}ms`);
    console.log(`Complexity Factor: ${estimate.complexity}`);

    console.log('\n🧪 SAMPLE DATA GENERATION:');
    console.log('==========================');
    const sampleData = templateAnalyzer.generateSampleData(analysis.placeholders, 2);
    console.log('Sample Row 1:');
    Object.entries(sampleData[0]).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    console.log('\n✅ VALIDATION:');
    console.log('===============');
    console.log(`Template Compatible: ${analysis.validation.isCompatible ? '✅ Yes' : '❌ No'}`);
    if (analysis.validation.issues.length > 0) {
      console.log('Issues:');
      analysis.validation.issues.forEach(issue => console.log(`  • ${issue}`));
    } else {
      console.log('  ✅ No validation issues found');
    }

    // Cleanup
    await fs.remove(tempDir);
    console.log('\n🧹 Cleaned up temporary files');
    
    console.log('\n🎉 Template analyzer test completed successfully!');
    console.log('==========================================');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testTemplateAnalyzer();
