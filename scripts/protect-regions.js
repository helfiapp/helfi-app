/**
 * Guard rails for critical UI regions.
 *
 * This script runs before build and prevents deployments if protected
 * sections were modified without explicit override.
 *
 * To intentionally edit a protected region, set env:
 *   ALLOW_INGREDIENTS_EDIT=true
 * for that build/deploy, then update this expected snapshot accordingly.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fail(msg) {
  console.error('\n❌ Guard Rails: ' + msg + '\n');
  process.exit(1);
}

function checkIngredientsCard() {
  const allow = String(process.env.ALLOW_INGREDIENTS_EDIT || '').toLowerCase() === 'true';
  const filePath = path.join(__dirname, '..', 'app', 'food', 'page.tsx');
  const content = fs.readFileSync(filePath, 'utf8');

  const startMarker = 'PROTECTED: INGREDIENTS_CARD START';
  const endMarker = 'PROTECTED: INGREDIENTS_CARD END';
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    fail('Ingredients Card markers are missing in app/food/page.tsx. Do not remove protection markers.');
  }

  // Extract inner region (between markers)
  // We search from the end of the start marker line to the beginning of end marker line.
  const innerStart = content.indexOf('\n', startIdx) + 1;
  const innerEnd = content.lastIndexOf('\n', endIdx);
  const currentRegion = content.slice(innerStart, innerEnd);

  // Canonical snapshot of the protected "Multiple Ingredients Entry" JSX region.
  // IMPORTANT: If you intentionally update this region, set ALLOW_INGREDIENTS_EDIT=true
  // for one build, then paste the updated snapshot below so future edits are guarded.
  const EXPECTED_INGREDIENTS_CARD = `
                {manualFoodType === 'multiple' && (
                  <div className="mb-6 max-h-[60vh] overflow-y-auto overscroll-contain pr-1">
                    <div className="mb-6">
                      <div className="space-y-4">
                      {manualIngredients.map((ing, index) => (
                        <div key={index} className="border border-gray-200 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-medium text-gray-700">Ingredient {index + 1}</h4>
                            {manualIngredients.length > 1 && (
                              <div className="relative ingredient-options-dropdown">
                                <button
                                  onClick={() => setShowIngredientOptions(showIngredientOptions === \`\${index}\` ? null : \`\${index}\`)}
                                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                  </svg>
                                </button>
                                
                                {showIngredientOptions === \`\${index}\` && (
                                  <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                                    <button
                                      onClick={() => {
                                        removeIngredient(index);
                                        setShowIngredientOptions(null);
                                      }}
                                      className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center text-sm"
                                    >
                                      <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="mb-3">
                            <input
                              type="text"
                              value={ing.name}
                              onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                              placeholder="Ingredient name"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                            />
                          </div>
                        </div>
                      ))}
                      
                      <button
                        onClick={addIngredient}
                        className="w-full px-4 py-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors flex items-center justify-center border border-emerald-200"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Ingredient
                      </button>
                    </div>
                    </div>
                  </div>
                )}`.replace(/\r\n/g, '\n'); // normalize line endings

  const normalizedCurrent = currentRegion.replace(/\r\n/g, '\n');

  if (normalizedCurrent !== EXPECTED_INGREDIENTS_CARD) {
    // Secondary tolerant comparison: ignore all whitespace differences
    const stripWS = (s) => s.replace(/\s+/g, '');
    if (stripWS(normalizedCurrent) === stripWS(EXPECTED_INGREDIENTS_CARD)) {
      console.warn('⚠️ Guard Rails: Ingredients Card differs only by whitespace. Proceeding.');
      return;
    }
    if (!allow) {
      fail(
        'The Ingredients Card (manual multi-ingredient entry) was modified.\n' +
        'If this change is intentional, redeploy with ALLOW_INGREDIENTS_EDIT=true and then update scripts/protect-regions.js snapshot.'
      );
    } else {
      console.warn('⚠️ Guard Rails: Ingredients Card changed (override enabled). Remember to update EXPECTED_INGREDIENTS_CARD snapshot.');
    }
  }
}

function hashRegion(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function checkProtectedRegion(opts) {
  const {
    filePath,
    startMarker,
    endMarker,
    expectedHash,
    allowEnvVar,
    description,
  } = opts;
  const allow = String(process.env[allowEnvVar] || '').toLowerCase() === 'true';
  const content = fs.readFileSync(filePath, 'utf8');

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    fail(`${description} markers are missing in ${filePath}. Do not remove protection markers.`);
  }

  const innerStart = content.indexOf('\n', startIdx) + 1;
  const innerEnd = content.lastIndexOf('\n', endIdx);
  const currentRegion = content.slice(innerStart, innerEnd).replace(/\r\n/g, '\n');
  const currentHash = hashRegion(currentRegion);

  if (currentHash !== expectedHash) {
    if (!allow) {
      fail(
        `${description} was modified.\n` +
        `If this change is intentional, redeploy with ${allowEnvVar}=true and then update the hash in scripts/protect-regions.js.`
      );
    } else {
      console.warn(`⚠️ Guard Rails: ${description} changed (override enabled). Remember to update scripts/protect-regions.js hash.`);
    }
  }
}

function main() {
  checkIngredientsCard();
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'add-ingredient', 'AddIngredientClient.tsx'),
    startMarker: 'PROTECTED: ADD_INGREDIENT_SEARCH START',
    endMarker: 'PROTECTED: ADD_INGREDIENT_SEARCH END',
    expectedHash: 'f07df75bcd62e4e2f69cabc5fea6742778066e66d48c61bb1546e0347da7f6fe',
    allowEnvVar: 'ALLOW_ADD_INGREDIENT_SEARCH_EDIT',
    description: 'Add Ingredient standalone search UI',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: ADD_INGREDIENT_MODAL_SEARCH START',
    endMarker: 'PROTECTED: ADD_INGREDIENT_MODAL_SEARCH END',
    expectedHash: '2d56018cf817445bb2a505bc63138c70c6ab68058b70291920b73254b0f5cbe2',
    allowEnvVar: 'ALLOW_ADD_INGREDIENT_MODAL_SEARCH_EDIT',
    description: 'Add Ingredient modal search UI',
  });
  console.log('✅ Guard Rails: Protected regions verified.');
}

main();
