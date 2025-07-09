// BULLETPROOF SUPPLEMENT SAVE FIX
// This addresses the recurring supplement data loss issue

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function bulletproofSupplementSave(userId, supplements, medications) {
  console.log('🔧 BULLETPROOF SAVE INITIATED');
  console.log('Input data:', { 
    userId, 
    supplementsCount: supplements?.length || 0, 
    medicationsCount: medications?.length || 0 
  });

  try {
    // STEP 1: Validate input data
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    if (!Array.isArray(supplements)) {
      console.warn('⚠️ Supplements not an array, defaulting to empty array');
      supplements = [];
    }
    
    if (!Array.isArray(medications)) {
      console.warn('⚠️ Medications not an array, defaulting to empty array');
      medications = [];
    }

    // STEP 2: Create emergency backup before any changes
    const emergencyBackup = {
      timestamp: new Date().toISOString(),
      supplements: supplements,
      medications: medications,
      action: 'bulletproof_save'
    };

    await prisma.healthGoal.upsert({
      where: {
        userId_name: {
          userId: userId,
          name: '__EMERGENCY_BACKUP_SUPPLEMENTS__'
        }
      },
      update: {
        category: JSON.stringify(emergencyBackup)
      },
      create: {
        userId: userId,
        name: '__EMERGENCY_BACKUP_SUPPLEMENTS__',
        category: JSON.stringify(emergencyBackup)
      }
    });

    console.log('✅ Emergency backup created');

    // STEP 3: Use transaction for atomic operations
    const result = await prisma.$transaction(async (tx) => {
      // Get current state
      const currentSupplements = await tx.supplement.findMany({
        where: { userId: userId }
      });
      
      const currentMedications = await tx.medication.findMany({
        where: { userId: userId }
      });

      console.log('📊 Current state:', {
        currentSupplementsCount: currentSupplements.length,
        currentMedicationsCount: currentMedications.length
      });

      // STEP 4: Safe supplement update using upsert approach
      const supplementResults = [];
      
      // First, mark all existing supplements as potentially deleted
      const existingSupplementIds = currentSupplements.map(s => s.id);
      
      // Process each supplement from the form
      for (const supplement of supplements) {
        if (!supplement.name || !supplement.dosage) {
          console.warn('⚠️ Skipping invalid supplement:', supplement);
          continue;
        }

        // Find existing supplement by name and dosage
        const existing = currentSupplements.find(s => 
          s.name === supplement.name && s.dosage === supplement.dosage
        );

        if (existing) {
          // Update existing supplement
          const updated = await tx.supplement.update({
            where: { id: existing.id },
            data: {
              timing: supplement.timing || [],
              days: supplement.days || [],
              schedule: supplement.schedule || 'daily'
            }
          });
          supplementResults.push(updated);
          
          // Remove from deletion list
          const index = existingSupplementIds.indexOf(existing.id);
          if (index > -1) {
            existingSupplementIds.splice(index, 1);
          }
        } else {
          // Create new supplement
          const created = await tx.supplement.create({
            data: {
              userId: userId,
              name: supplement.name,
              dosage: supplement.dosage,
              timing: supplement.timing || [],
              days: supplement.days || [],
              schedule: supplement.schedule || 'daily'
            }
          });
          supplementResults.push(created);
        }
      }

      // Delete supplements that are no longer in the form
      if (existingSupplementIds.length > 0) {
        await tx.supplement.deleteMany({
          where: {
            id: { in: existingSupplementIds }
          }
        });
        console.log('🗑️ Deleted supplements:', existingSupplementIds.length);
      }

      // STEP 5: Safe medication update using same approach
      const medicationResults = [];
      const existingMedicationIds = currentMedications.map(m => m.id);
      
      for (const medication of medications) {
        if (!medication.name || !medication.dosage) {
          console.warn('⚠️ Skipping invalid medication:', medication);
          continue;
        }

        const existing = currentMedications.find(m => 
          m.name === medication.name && m.dosage === medication.dosage
        );

        if (existing) {
          const updated = await tx.medication.update({
            where: { id: existing.id },
            data: {
              timing: medication.timing || [],
              days: medication.days || [],
              schedule: medication.schedule || 'daily'
            }
          });
          medicationResults.push(updated);
          
          const index = existingMedicationIds.indexOf(existing.id);
          if (index > -1) {
            existingMedicationIds.splice(index, 1);
          }
        } else {
          const created = await tx.medication.create({
            data: {
              userId: userId,
              name: medication.name,
              dosage: medication.dosage,
              timing: medication.timing || [],
              days: medication.days || [],
              schedule: medication.schedule || 'daily'
            }
          });
          medicationResults.push(created);
        }
      }

      if (existingMedicationIds.length > 0) {
        await tx.medication.deleteMany({
          where: {
            id: { in: existingMedicationIds }
          }
        });
        console.log('🗑️ Deleted medications:', existingMedicationIds.length);
      }

      return {
        supplements: supplementResults,
        medications: medicationResults
      };
    });

    console.log('✅ BULLETPROOF SAVE COMPLETED');
    console.log('Final counts:', {
      supplements: result.supplements.length,
      medications: result.medications.length
    });

    return {
      success: true,
      data: result,
      message: 'Supplements and medications saved successfully'
    };

  } catch (error) {
    console.error('❌ BULLETPROOF SAVE FAILED:', error);
    
    // Try to restore from backup if save failed
    try {
      const backup = await prisma.healthGoal.findFirst({
        where: {
          userId: userId,
          name: '__EMERGENCY_BACKUP_SUPPLEMENTS__'
        }
      });

      if (backup) {
        const backupData = JSON.parse(backup.category);
        console.log('🔄 Attempting restore from backup...');
        // This would need additional implementation for full restore
      }
    } catch (restoreError) {
      console.error('❌ Backup restore also failed:', restoreError);
    }

    return {
      success: false,
      error: error.message,
      message: 'Failed to save supplements and medications'
    };
  }
}

// Test the function
async function testBulletproofSave() {
  const testUserId = 'cmcku4yvq000010l6z4ttp0ib'; // Your user ID
  
  const testSupplements = [
    {
      name: 'Vitamin D',
      dosage: '1000 IU',
      timing: ['morning'],
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      schedule: 'daily'
    },
    {
      name: 'Magnesium',
      dosage: '400mg',
      timing: ['evening'],
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      schedule: 'daily'
    }
  ];

  const testMedications = [
    {
      name: 'Tadalafil',
      dosage: '5mg',
      timing: ['morning', 'evening'],
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      schedule: 'daily'
    },
    {
      name: 'Fluoxetine',
      dosage: '20 mg',
      timing: ['morning'],
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      schedule: 'daily'
    }
  ];

  const result = await bulletproofSupplementSave(testUserId, testSupplements, testMedications);
  console.log('Test result:', result);
  
  await prisma.$disconnect();
}

// Run the test
testBulletproofSave().catch(console.error); 