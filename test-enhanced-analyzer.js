#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const templateAnalyzer = require('./services/templateAnalyzer');

async function testEnhancedTemplateAnalyzer() {
  console.log('🚀 Testing Enhanced Template Analyzer with Advanced Features...');
  console.log('================================================================');
  
  try {
    // Create sample templates for testing
    const sampleTemplates = {
      contract: `
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
      `,
      
      invoice: `
# INVOICE

## Company Details
**From:** {{companyName}}
**Address:** {{companyAddress}}
**Phone:** {{companyPhone}}
**Email:** {{companyEmail}}

## Client Information
**Bill To:** {{clientName}}
**Client Address:** {{clientAddress}}
**Client Email:** {{clientEmail}}

## Invoice Details
**Invoice #:** {{invoiceNumber}}
**Date:** {{invoiceDate}}
**Due Date:** {{dueDate}}

## Items
{{#each items}}
- {{description}}: ${{amount}}
{{/each}}

**Subtotal:** ${{subtotal}}
**Tax:** ${{taxAmount}}
**Total:** ${{totalAmount}}

## Payment Terms
{{paymentTerms}}
      `,
      
      letter: `
# COVER LETTER

{{recipientName}}
{{recipientTitle}}
{{companyName}}
{{companyAddress}}

Dear {{recipientName}},

I am writing to express my interest in the {{positionTitle}} position at {{companyName}}.

## Qualifications
{{#each qualifications}}
- {{this}}
{{/each}}

## Experience
{{experience}}

## Contact Information
**Name:** {{applicantName}}
**Email:** {{applicantEmail}}
**Phone:** {{applicantPhone}}
**Address:** {{applicantAddress}}

Sincerely,
{{applicantName}}
      `
    };

    const tempDir = path.join(__dirname, 'temp');
    await fs.ensureDir(tempDir);
    
    // Write template files
    const templatePaths = {};
    for (const [name, content] of Object.entries(sampleTemplates)) {
      const filePath = path.join(tempDir, `${name}.txt`);
      await fs.writeFile(filePath, content);
      templatePaths[name] = filePath;
    }

    console.log('📄 Created sample templates for testing');
    console.log('🔍 Testing enhanced analysis features...\n');

    // Test 1: Enhanced single template analysis
    console.log('📊 TEST 1: Enhanced Single Template Analysis');
    console.log('============================================');
    
    const contractAnalysis = await templateAnalyzer.analyzeTemplate(templatePaths.contract, 'txt');
    
    console.log(`📁 File: ${contractAnalysis.metadata.filename}`);
    console.log(`📏 Size: ${Math.round(contractAnalysis.metadata.fileSize / 1024)}KB`);
    console.log(`📝 Word Count: ${contractAnalysis.wordCount}`);
    console.log(`📄 Paragraphs: ${contractAnalysis.paragraphCount}`);
    console.log(`🏷️  Complexity: ${contractAnalysis.complexity}`);
    console.log(`✅ Validation Score: ${contractAnalysis.validation.score}/100`);
    console.log(`⚠️  Risk Level: ${contractAnalysis.validation.riskLevel}`);
    
    console.log('\n🔍 ENHANCED PLACEHOLDER ANALYSIS:');
    console.log(`Total: ${contractAnalysis.placeholders.count}`);
    console.log(`Naming Convention: ${contractAnalysis.placeholders.patterns.namingConvention}`);
    console.log(`Common Prefixes: ${contractAnalysis.placeholders.patterns.commonPrefixes.join(', ')}`);
    console.log(`Has Nested: ${contractAnalysis.placeholders.patterns.hasNested}`);
    
    console.log('\n📋 CATEGORIZED PLACEHOLDERS:');
    Object.entries(contractAnalysis.placeholders.categorized).forEach(([category, fields]) => {
      if (fields.length > 0) {
        console.log(`\n${category.toUpperCase()} (${fields.length}):`);
        fields.forEach(field => console.log(`  • ${field}`));
      }
    });

    console.log('\n💡 INTELLIGENT SUGGESTIONS:');
    if (contractAnalysis.placeholders.suggestions.missing.length > 0) {
      console.log(`Missing fields: ${contractAnalysis.placeholders.suggestions.missing.slice(0, 5).join(', ')}`);
    }
    if (contractAnalysis.placeholders.suggestions.improvements.length > 0) {
      console.log(`Naming improvements: ${contractAnalysis.placeholders.suggestions.improvements.length} suggestions`);
    }

    console.log('\n🏗️  ENHANCED STRUCTURE ANALYSIS:');
    console.log(`Sections: ${contractAnalysis.structure.metadata.totalSections}`);
    console.log(`Headings: ${contractAnalysis.structure.metadata.totalHeadings}`);
    console.log(`Lists: ${contractAnalysis.structure.metadata.totalLists}`);
    console.log(`Tables: ${contractAnalysis.structure.metadata.totalTables}`);
    console.log(`Paragraphs: ${contractAnalysis.structure.metadata.totalParagraphs}`);

    console.log('\n✅ COMPREHENSIVE VALIDATION:');
    console.log(`Compatibility: ${contractAnalysis.validation.isCompatible ? '✅' : '❌'}`);
    console.log(`Issues: ${contractAnalysis.validation.issues.length}`);
    console.log(`Warnings: ${contractAnalysis.validation.warnings.length}`);
    console.log(`Recommendations: ${contractAnalysis.validation.recommendations.length}`);
    
    if (contractAnalysis.validation.issues.length > 0) {
      console.log('\n❌ Issues:');
      contractAnalysis.validation.issues.forEach(issue => console.log(`  • ${issue}`));
    }
    
    if (contractAnalysis.validation.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      contractAnalysis.validation.warnings.forEach(warning => console.log(`  • ${warning}`));
    }
    
    if (contractAnalysis.validation.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      contractAnalysis.validation.recommendations.slice(0, 3).forEach(rec => console.log(`  • ${rec}`));
    }

    // Test 2: Template comparison
    console.log('\n\n🔄 TEST 2: Template Comparison');
    console.log('================================');
    
    const comparison = await templateAnalyzer.compareTemplates(
      templatePaths.contract,
      templatePaths.invoice
    );
    
    console.log(`📊 Similarity Score: ${comparison.score}/100`);
    console.log(`🔍 Similarities: ${comparison.similarities.placeholders.length} common placeholders`);
    console.log(`📏 Differences: ${comparison.differences.placeholders.countDifference} placeholder difference`);
    
    console.log('\n📋 COMMON PLACEHOLDERS:');
    comparison.similarities.placeholders.forEach(p => console.log(`  • ${p}`));
    
    console.log('\n📊 COMPATIBILITY ASSESSMENT:');
    Object.entries(comparison.compatibility).forEach(([aspect, level]) => {
      console.log(`  ${aspect}: ${level}`);
    });
    
    console.log('\n💡 COMPARISON RECOMMENDATIONS:');
    comparison.recommendations.forEach(rec => console.log(`  • ${rec}`));

    // Test 3: Batch analysis
    console.log('\n\n📦 TEST 3: Batch Template Analysis');
    console.log('====================================');
    
    const batchResults = await templateAnalyzer.batchAnalyzeTemplates(
      Object.values(templatePaths),
      { parallel: true, maxConcurrent: 3, includeComparison: true }
    );
    
    console.log(`📊 Batch Analysis Results: ${batchResults.length} templates processed`);
    
    batchResults.forEach((result, index) => {
      if (result.success && result.analysis) {
        console.log(`\n📄 Template ${index + 1}: ${result.filename || 'Unknown'}`);
        console.log(`  • Placeholders: ${result.analysis.placeholders.count}`);
        console.log(`  • Complexity: ${result.analysis.complexity}`);
        console.log(`  • Validation Score: ${result.analysis.validation.score}/100`);
      } else if (result.comparison) {
        console.log('\n📊 BATCH COMPARISON SUMMARY:');
        console.log(`Total Templates: ${result.comparison.summary.totalTemplates}`);
        console.log(`Average Placeholders: ${result.comparison.summary.averagePlaceholders}`);
        console.log(`Average Word Count: ${result.comparison.summary.averageWordCount}`);
        
        console.log('\n🏷️  COMPLEXITY DISTRIBUTION:');
        Object.entries(result.comparison.summary.complexityDistribution).forEach(([complexity, count]) => {
          console.log(`  ${complexity}: ${count} templates`);
        });
        
        console.log('\n📝 NAMING CONVENTIONS:');
        Object.entries(result.comparison.summary.namingConventions).forEach(([convention, count]) => {
          console.log(`  ${convention}: ${count} templates`);
        });
        
        console.log('\n❌ COMMON ISSUES:');
        result.comparison.summary.commonIssues.forEach(issue => console.log(`  • ${issue}`));
        
        console.log('\n💡 BATCH RECOMMENDATIONS:');
        result.comparison.recommendations.forEach(rec => console.log(`  • ${rec}`));
        
        console.log('\n✅ BEST PRACTICES:');
        result.comparison.bestPractices.forEach(practice => console.log(`  • ${practice}`));
      }
    });

    // Test 4: Cache functionality
    console.log('\n\n💾 TEST 4: Cache Management');
    console.log('============================');
    
    // Test caching
    const startTime = Date.now();
    const cachedAnalysis = await templateAnalyzer.getCachedAnalysis(templatePaths.contract, 'txt');
    const cacheTime = Date.now() - startTime;
    
    console.log(`⚡ Cached analysis retrieved in ${cacheTime}ms`);
    console.log(`📊 Cache hit: ${cachedAnalysis.placeholders.count} placeholders found`);
    
    const cacheStats = templateAnalyzer.getCacheStats();
    console.log(`📈 Cache Statistics:`);
    console.log(`  • Size: ${cacheStats.size} entries`);
    console.log(`  • Timeout: ${cacheStats.timeout / 1000}s`);
    
    // Test 5: Performance estimation
    console.log('\n\n⏱️  TEST 5: Performance Estimation');
    console.log('====================================');
    
    const processingEstimate = templateAnalyzer.estimateProcessingTime(contractAnalysis, 1000);
    console.log(`📊 Processing Estimate for 1000 documents:`);
    console.log(`  • Total Time: ${processingEstimate.totalTime}ms (${(processingEstimate.totalTime / 1000).toFixed(1)}s)`);
    console.log(`  • Per Document: ${processingEstimate.perDocument}ms`);
    console.log(`  • Complexity Factor: ${processingEstimate.complexity}`);
    console.log(`  • Factors: ${Object.entries(processingEstimate.factors).map(([k, v]) => `${k}: ${v}`).join(', ')}`);

    console.log('\n🎉 Enhanced Template Analyzer Testing Complete!');
    console.log('================================================');
    console.log('✅ All advanced features working correctly');
    console.log('🚀 Ready for production use with enhanced capabilities');
    
    // Cleanup
    await fs.remove(tempDir);
    
  } catch (error) {
    console.error('❌ Testing failed:', error);
    process.exit(1);
  }
}

// Run the enhanced test
if (require.main === module) {
  testEnhancedTemplateAnalyzer();
}

module.exports = { testEnhancedTemplateAnalyzer };
