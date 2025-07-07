import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { supplements, medications } = await request.json();

    if (!supplements || !medications) {
      return NextResponse.json({ error: 'Missing supplements or medications data' }, { status: 400 });
    }

    // Prepare the data for OpenAI analysis
    const supplementList = (supplements as any[]).map((s: any) => ({
      name: s.name,
      dosage: s.dosage,
      timing: Array.isArray(s.timing) ? s.timing.join(', ') : s.timing,
      schedule: s.scheduleInfo
    }));

    const medicationList = (medications as any[]).map((m: any) => ({
      name: m.name,
      dosage: m.dosage,
      timing: Array.isArray(m.timing) ? m.timing.join(', ') : m.timing,
      schedule: m.scheduleInfo
    }));

    const prompt = `As a clinical pharmacist, analyze the following supplements and medications for potential interactions:

SUPPLEMENTS:
${supplementList.map(s => `- ${s.name}: ${s.dosage}, taken ${s.timing}, schedule: ${s.schedule}`).join('\n')}

MEDICATIONS:
${medicationList.map(m => `- ${m.name}: ${m.dosage}, taken ${m.timing}, schedule: ${m.schedule}`).join('\n')}

Please provide a comprehensive interaction analysis in the following JSON format:
{
  "overallRisk": "low|medium|high",
  "interactions": [
    {
      "substance1": "name",
      "substance2": "name",
      "severity": "low|medium|high",
      "description": "detailed explanation of the interaction",
      "recommendation": "specific recommendation for the user",
      "timingAdjustment": "suggested timing changes if needed"
    }
  ],
  "timingOptimization": {
    "morning": ["list of substances best taken in morning"],
    "afternoon": ["list of substances best taken in afternoon"],
    "evening": ["list of substances best taken in evening"],
    "beforeBed": ["list of substances best taken before bed"]
  },
  "generalRecommendations": [
    "general advice for this combination"
  ],
  "disclaimer": "Important medical disclaimer text"
}

Focus on:
1. Drug-supplement interactions
2. Supplement-supplement interactions
3. Timing conflicts that could reduce effectiveness
4. Absorption interference
5. Dosage concerns
6. Any contraindications

Be thorough but not alarmist. Provide actionable recommendations.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a clinical pharmacist with expertise in drug-supplement interactions. Provide accurate, evidence-based analysis while being appropriately cautious about medical advice."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const analysisText = completion.choices[0].message.content;
    console.log('OpenAI Response:', analysisText);
    
    // Parse the JSON response
    let analysis;
    try {
      if (!analysisText) {
        throw new Error('Empty response from OpenAI');
      }
      
      // Try to extract JSON from the response if it's wrapped in markdown
      let jsonText = analysisText;
      if (analysisText.includes('```json')) {
        const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        }
      } else if (analysisText.includes('```')) {
        const jsonMatch = analysisText.match(/```\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1];
        }
      }
      
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      console.error('Raw response:', analysisText);
      
      // Return a fallback response instead of failing
      analysis = {
        overallRisk: "medium",
        interactions: [{
          substance1: "Analysis",
          substance2: "Pending",
          severity: "medium",
          description: "Unable to parse detailed analysis. Please consult your healthcare provider.",
          recommendation: "Consult your healthcare provider for personalized advice.",
          timingAdjustment: "No specific timing adjustments available."
        }],
        timingOptimization: {
          morning: [],
          afternoon: [],
          evening: [],
          beforeBed: []
        },
        generalRecommendations: ["Consult your healthcare provider for personalized medication and supplement guidance."],
        disclaimer: "This analysis is for informational purposes only. Always consult your healthcare provider before making changes to your medication or supplement regimen."
      };
    }

    // Add metadata
    analysis.analysisDate = new Date().toISOString();
    analysis.supplementCount = supplements.length;
    analysis.medicationCount = medications.length;

    return NextResponse.json({ 
      success: true, 
      analysis 
    });

  } catch (error) {
    console.error('Error analyzing interactions:', error);
    return NextResponse.json({ 
      error: 'Failed to analyze interactions',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 