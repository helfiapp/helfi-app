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
    expectedHash: 'a4369679275e5cfccea5a19aa2803750a88b9031134bdba40f8557b2fcb19f63',
    allowEnvVar: 'ALLOW_ADD_INGREDIENT_SEARCH_EDIT',
    description: 'Add Ingredient standalone search UI',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: ADD_INGREDIENT_MODAL_SEARCH START',
    endMarker: 'PROTECTED: ADD_INGREDIENT_MODAL_SEARCH END',
    expectedHash: '0da51ca49512fc4c88a07de0e55d0c9996154afbee732ca243549c627a6df772',
    allowEnvVar: 'ALLOW_ADD_INGREDIENT_MODAL_SEARCH_EDIT',
    description: 'Add Ingredient modal search UI',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'add-ingredient', 'AddIngredientClient.tsx'),
    startMarker: 'PROTECTED: ADD_INGREDIENT_SEARCH_CORE START',
    endMarker: 'PROTECTED: ADD_INGREDIENT_SEARCH_CORE END',
    expectedHash: '37f416baf8ccf98ce78ce2e7d28a663b8b4b2e93b240c3716b1537a5f69afad1',
    allowEnvVar: 'ALLOW_ADD_INGREDIENT_SEARCH_CORE_EDIT',
    description: 'Add Ingredient standalone search core logic',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: ADD_INGREDIENT_MODAL_SEARCH_CORE START',
    endMarker: 'PROTECTED: ADD_INGREDIENT_MODAL_SEARCH_CORE END',
    expectedHash: '59e83d9d80738834b2ac6c1502fd8bb2849e595c7d526e1648c718b63846e728',
    allowEnvVar: 'ALLOW_ADD_INGREDIENT_MODAL_SEARCH_CORE_EDIT',
    description: 'Add Ingredient modal search core logic',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'build-meal', 'MealBuilderClient.tsx'),
    startMarker: 'PROTECTED: BUILD_MEAL_SEARCH_CORE START',
    endMarker: 'PROTECTED: BUILD_MEAL_SEARCH_CORE END',
    expectedHash: '4c38c030432c1bbc9d06c1e7dace0ed96bb1a9e16410e32f107863fd9cc60647',
    allowEnvVar: 'ALLOW_BUILD_MEAL_SEARCH_CORE_EDIT',
    description: 'Build a Meal search core logic',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'api', 'food-data', 'route.ts'),
    startMarker: 'PROTECTED: FOOD_DATA_PACKAGED_SORT START',
    endMarker: 'PROTECTED: FOOD_DATA_PACKAGED_SORT END',
    expectedHash: '3c38724d5d192f258786ff4765311d33f45a263b33c91b3db559cf49749226b2',
    allowEnvVar: 'ALLOW_FOOD_DATA_PACKAGED_SORT_EDIT',
    description: 'Food data packaged search ranking hierarchy',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'api', 'food-data', 'route.ts'),
    startMarker: 'PROTECTED: FOOD_DATA_PACKAGED_FILTER START',
    endMarker: 'PROTECTED: FOOD_DATA_PACKAGED_FILTER END',
    expectedHash: '55c381986cfd2086e244e4488dc97e1ba1e3823543033b916d2d645db0ea4bcb',
    allowEnvVar: 'ALLOW_FOOD_DATA_PACKAGED_FILTER_EDIT',
    description: 'Food data packaged active-word filter logic',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: ENERGY_SUMMARY_CALC START',
    endMarker: 'PROTECTED: ENERGY_SUMMARY_CALC END',
    expectedHash: 'e003846101a2fcaea648e4e39df08aa1970836625816c2121a0ce67195217a1c',
    allowEnvVar: 'ALLOW_ENERGY_SUMMARY_CALC_EDIT',
    description: 'Food Diary energy summary calorie math',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: ENERGY_ALLOWANCE_TEXT START',
    endMarker: 'PROTECTED: ENERGY_ALLOWANCE_TEXT END',
    expectedHash: 'f889a0734f6c1a971d0321a86224b5cb77328fe3f47dde1965f14e94faed6a06',
    allowEnvVar: 'ALLOW_ENERGY_ALLOWANCE_TEXT_EDIT',
    description: 'Food Diary allowance display text',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'api', 'user-data', 'route.ts'),
    startMarker: 'PROTECTED: HEALTH_SETUP_STAMP_GUARD START',
    endMarker: 'PROTECTED: HEALTH_SETUP_STAMP_GUARD END',
    expectedHash: '8c453ba819c3d1a05a8c24aff1c239a62b23b60776afecdd0c4c87b0986a8d4e',
    allowEnvVar: 'ALLOW_HEALTH_SETUP_STAMP_GUARD_EDIT',
    description: 'Health setup stamp guard (stale/missing write blocker)',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'insights', 'InsightLandingClient.tsx'),
    startMarker: 'PROTECTED: INSIGHTS_REPORT_STATE_DERIVATION START',
    endMarker: 'PROTECTED: INSIGHTS_REPORT_STATE_DERIVATION END',
    expectedHash: '47e356d2d50beb407227c8a83a542dfbcaa2ae3506bbf95b3ee649abfea04171',
    allowEnvVar: 'ALLOW_INSIGHTS_REPORT_STATE_DERIVATION_EDIT',
    description: 'Insights report active-state derivation logic',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'insights', 'InsightLandingClient.tsx'),
    startMarker: 'PROTECTED: INSIGHTS_COUNTDOWN_TIMER_LOGIC START',
    endMarker: 'PROTECTED: INSIGHTS_COUNTDOWN_TIMER_LOGIC END',
    expectedHash: 'f13148a452f3d4d6f81d69493afa4c5f9e7148c332fdb33be20e55503d7587c0',
    allowEnvVar: 'ALLOW_INSIGHTS_COUNTDOWN_TIMER_LOGIC_EDIT',
    description: 'Insights countdown timer fallback logic',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'insights', 'InsightLandingClient.tsx'),
    startMarker: 'PROTECTED: INSIGHTS_REPORT_STATUS_AND_COUNTDOWN START',
    endMarker: 'PROTECTED: INSIGHTS_REPORT_STATUS_AND_COUNTDOWN END',
    expectedHash: 'd7c59d103a323a84c73edff310f6338d3d86d5e97c040fbb4dac14c72048d6ce',
    allowEnvVar: 'ALLOW_INSIGHTS_REPORT_STATUS_AND_COUNTDOWN_EDIT',
    description: 'Insights report status and countdown UI block',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'insights', 'page.tsx'),
    startMarker: 'PROTECTED: INSIGHTS_WEEKLY_STATE_SELF_HEAL START',
    endMarker: 'PROTECTED: INSIGHTS_WEEKLY_STATE_SELF_HEAL END',
    expectedHash: 'ba078b30794b95986182199851ceadae56193807b4373834ee60fe34e76f5419',
    allowEnvVar: 'ALLOW_INSIGHTS_WEEKLY_STATE_SELF_HEAL_EDIT',
    description: 'Insights weekly state self-heal logic',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'api', 'reports', 'weekly', 'status', 'route.ts'),
    startMarker: 'PROTECTED: WEEKLY_STATUS_SELF_HEAL START',
    endMarker: 'PROTECTED: WEEKLY_STATUS_SELF_HEAL END',
    expectedHash: '871126610c699c2db7d4e55bc77f9b1340ed06f7537013d0b5d76dd5c8e9f07f',
    allowEnvVar: 'ALLOW_WEEKLY_STATUS_SELF_HEAL_EDIT',
    description: 'Weekly report status API self-heal logic',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'api', 'reports', 'weekly', 'dispatch', 'route.ts'),
    startMarker: 'PROTECTED: WEEKLY_REPORT_EMAIL_LAYOUT START',
    endMarker: 'PROTECTED: WEEKLY_REPORT_EMAIL_LAYOUT END',
    expectedHash: '2fdfd7b28b4dc7c95fbbe1ef21b5f29a702bdde384571cc3caad9a26da86af41',
    allowEnvVar: 'ALLOW_WEEKLY_REPORT_EMAIL_LAYOUT_EDIT',
    description: 'Weekly report email layout block',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'lib', 'weekly-health-report.ts'),
    startMarker: 'PROTECTED: WEEKLY_STATE_INSERT_CASTS START',
    endMarker: 'PROTECTED: WEEKLY_STATE_INSERT_CASTS END',
    expectedHash: '8a1b58aa702c777f7299ed20a0a44e4e9579d23a595d5c9a933889a0f616762a',
    allowEnvVar: 'ALLOW_WEEKLY_STATE_INSERT_CASTS_EDIT',
    description: 'Weekly report state insert timestamp casting query',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'insights', 'InsightLandingClient.tsx'),
    startMarker: 'PROTECTED: INSIGHTS_REPORT_ACTION_ROW START',
    endMarker: 'PROTECTED: INSIGHTS_REPORT_ACTION_ROW END',
    expectedHash: '14c93b97b73a2031bf3c4d0d7d580a69b71c17631c689b7bad8b4e67fe17351b',
    allowEnvVar: 'ALLOW_INSIGHTS_REPORT_ACTION_ROW_EDIT',
    description: 'Insights report action row UI',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'components', 'VoiceChat.tsx'),
    startMarker: 'PROTECTED: FOOD_CHAT_PARSE_AND_FALLBACK START',
    endMarker: 'PROTECTED: FOOD_CHAT_PARSE_AND_FALLBACK END',
    expectedHash: 'f98ed8250eb65740b0ff83f5d0af227a8e25ccf78da50914c4a80e58f3292166',
    allowEnvVar: 'ALLOW_FOOD_CHAT_PARSE_EDIT',
    description: 'Food chat parsing + fallback conversion to Build this meal options',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'components', 'VoiceChat.tsx'),
    startMarker: 'PROTECTED: FOOD_CHAT_BUILD_MEAL_HANDOFF START',
    endMarker: 'PROTECTED: FOOD_CHAT_BUILD_MEAL_HANDOFF END',
    expectedHash: '0965a5db6e8adbaeb015c710ac97d72fcb54bb6cc1480feb8362f1a5df062d97',
    allowEnvVar: 'ALLOW_FOOD_CHAT_BUILD_HANDOFF_EDIT',
    description: 'Food chat Build this meal button handoff to recipeImport draft',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'components', 'VoiceChat.tsx'),
    startMarker: 'PROTECTED: FOOD_CHAT_ASSISTANT_OPTION_RENDER START',
    endMarker: 'PROTECTED: FOOD_CHAT_ASSISTANT_OPTION_RENDER END',
    expectedHash: '4f7e7b19b3425793fd933e091df82ea2c0cb392a961da17113e27b1219aa535b',
    allowEnvVar: 'ALLOW_FOOD_CHAT_OPTION_RENDER_EDIT',
    description: 'Food chat assistant option cards + Build this meal buttons rendering',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'api', 'chat', 'voice', 'route.ts'),
    startMarker: 'PROTECTED: FOOD_CHAT_RECIPE_INTENT_AND_PROMPT START',
    endMarker: 'PROTECTED: FOOD_CHAT_RECIPE_INTENT_AND_PROMPT END',
    expectedHash: '93fd4f39384c730b4d15a2f4d8bd3721de6b056eb85bbcd0bb0a61b5db9cf9a2',
    allowEnvVar: 'ALLOW_FOOD_CHAT_PROMPT_RULES_EDIT',
    description: 'Food chat recipe-intent detection + recipe JSON wrapper prompt rules',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'api', 'chat', 'voice', 'route.ts'),
    startMarker: 'PROTECTED: FOOD_CHAT_STRUCTURED_MEAL_PAYLOAD_ENFORCER START',
    endMarker: 'PROTECTED: FOOD_CHAT_STRUCTURED_MEAL_PAYLOAD_ENFORCER END',
    expectedHash: '14ed2841ad974a7d3b90d1babe1e2343efec49ad6614ff3330db25d35b611e17',
    allowEnvVar: 'ALLOW_FOOD_CHAT_PAYLOAD_ENFORCER_EDIT',
    description: 'Food chat structured meal payload enforcer',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'api', 'chat', 'voice', 'route.ts'),
    startMarker: 'PROTECTED: FOOD_CHAT_MEAL_PAYLOAD_ENRICH_STREAM START',
    endMarker: 'PROTECTED: FOOD_CHAT_MEAL_PAYLOAD_ENRICH_STREAM END',
    expectedHash: 'a5947dc68e2243bd92cee7e7e8f2434814b2faa60ff3bc21b33cbe2a0f6dd09c',
    allowEnvVar: 'ALLOW_FOOD_CHAT_PAYLOAD_ENRICH_STREAM_EDIT',
    description: 'Food chat stream-path payload enrichment call',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'api', 'chat', 'voice', 'route.ts'),
    startMarker: 'PROTECTED: FOOD_CHAT_MEAL_PAYLOAD_ENRICH_NON_STREAM START',
    endMarker: 'PROTECTED: FOOD_CHAT_MEAL_PAYLOAD_ENRICH_NON_STREAM END',
    expectedHash: 'a5947dc68e2243bd92cee7e7e8f2434814b2faa60ff3bc21b33cbe2a0f6dd09c',
    allowEnvVar: 'ALLOW_FOOD_CHAT_PAYLOAD_ENRICH_NON_STREAM_EDIT',
    description: 'Food chat non-stream payload enrichment call',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'build-meal', 'MealBuilderClient.tsx'),
    startMarker: 'PROTECTED: MEAL_BUILDER_SHARE_PAYLOAD_AND_CHANNELS START',
    endMarker: 'PROTECTED: MEAL_BUILDER_SHARE_PAYLOAD_AND_CHANNELS END',
    expectedHash: '69db01c088c74722bec03e11d7b050b78a65f129a7cb65642164f0fdaaf9e674',
    allowEnvVar: 'ALLOW_MEAL_BUILDER_SHARE_FLOW_EDIT',
    description: 'Meal builder share payload + quick-share channel handlers',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'build-meal', 'MealBuilderClient.tsx'),
    startMarker: 'PROTECTED: MEAL_BUILDER_RECIPE_IMPORT_DRAFT_APPLY START',
    endMarker: 'PROTECTED: MEAL_BUILDER_RECIPE_IMPORT_DRAFT_APPLY END',
    expectedHash: 'ef787b3947e92bba2bbd1e884b73d8b0b99bd33ded3384cde6f3b53a4c24e4fa',
    allowEnvVar: 'ALLOW_MEAL_BUILDER_RECIPE_IMPORT_APPLY_EDIT',
    description: 'Meal builder recipe-import draft apply + serving inference flow',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'build-meal', 'MealBuilderClient.tsx'),
    startMarker: 'PROTECTED: MEAL_BUILDER_IMPORTED_RECIPE_PANEL START',
    endMarker: 'PROTECTED: MEAL_BUILDER_IMPORTED_RECIPE_PANEL END',
    expectedHash: '13f8df5efba005cf2bbc3c1a008427e2f4d0192c409700bae8717ecfd3c1a2d8',
    allowEnvVar: 'ALLOW_MEAL_BUILDER_IMPORTED_RECIPE_PANEL_EDIT',
    description: 'Meal builder imported recipe expander panel',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'build-meal', 'MealBuilderClient.tsx'),
    startMarker: 'PROTECTED: MEAL_BUILDER_SHARE_BUTTON_ROW START',
    endMarker: 'PROTECTED: MEAL_BUILDER_SHARE_BUTTON_ROW END',
    expectedHash: 'ce3d878384e25019246d838a86f48eb6c9201d1cb6af3cc9230ad4199b551d12',
    allowEnvVar: 'ALLOW_MEAL_BUILDER_SHARE_BUTTON_ROW_EDIT',
    description: 'Meal builder Share meal button + branded icon strip',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: FOOD_PAGE_ASK_AI_ENTRY_LINK START',
    endMarker: 'PROTECTED: FOOD_PAGE_ASK_AI_ENTRY_LINK END',
    expectedHash: '08adfd06aef902fc15db8f167acc7b40459e396bb527161384377216f00ae888',
    allowEnvVar: 'ALLOW_FOOD_PAGE_ASK_AI_ENTRY_EDIT',
    description: 'Food Diary Ask AI entry link',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: FOOD_PAGE_FAVORITE_SHARE_HELPERS START',
    endMarker: 'PROTECTED: FOOD_PAGE_FAVORITE_SHARE_HELPERS END',
    expectedHash: 'e55709ceb095672f8098b86429ab5c85fd4bc291d0904af69cec2ce3a67ca7a7',
    allowEnvVar: 'ALLOW_FOOD_PAGE_FAVORITE_SHARE_HELPERS_EDIT',
    description: 'Food Diary favorite share-text + channel handlers',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: FOOD_PAGE_FAVORITE_SHARE_CHOOSER_MODAL START',
    endMarker: 'PROTECTED: FOOD_PAGE_FAVORITE_SHARE_CHOOSER_MODAL END',
    expectedHash: '10ad7b520be2d002d78563a5e58bfb05dfd18af78f5edfb5ec560ac76689849b',
    allowEnvVar: 'ALLOW_FOOD_PAGE_FAVORITE_SHARE_CHOOSER_EDIT',
    description: 'Food Diary favorites chooser modal share controls',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: FOOD_PAGE_FAVORITE_SHARE_PREVIEW_MODAL START',
    endMarker: 'PROTECTED: FOOD_PAGE_FAVORITE_SHARE_PREVIEW_MODAL END',
    expectedHash: 'd945412300577516369ea0670a512aa961e4a5b1c5679ed27cb70712f8bda59a',
    allowEnvVar: 'ALLOW_FOOD_PAGE_FAVORITE_SHARE_PREVIEW_EDIT',
    description: 'Food Diary favorites preview modal share controls',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'recommended', 'RecommendedMealClient.tsx'),
    startMarker: 'PROTECTED: RECOMMENDED_MEAL_BUILD_HANDOFF START',
    endMarker: 'PROTECTED: RECOMMENDED_MEAL_BUILD_HANDOFF END',
    expectedHash: 'c096f4bb9961a788239828b8ef11bf6f1a0183b25b2e0e40890e5b9f25c657ff',
    allowEnvVar: 'ALLOW_RECOMMENDED_MEAL_HANDOFF_EDIT',
    description: 'Recommended meal Build this meal handoff',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'recommended', 'RecommendedMealClient.tsx'),
    startMarker: 'PROTECTED: RECOMMENDED_MEAL_BUILD_BUTTON_ROW START',
    endMarker: 'PROTECTED: RECOMMENDED_MEAL_BUILD_BUTTON_ROW END',
    expectedHash: '6415d69be130bdc45205d017c51328c7c6569cf8460ac63757980dc595630e83',
    allowEnvVar: 'ALLOW_RECOMMENDED_MEAL_BUTTON_ROW_EDIT',
    description: 'Recommended meal action buttons row',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: FOOD_BARCODE_LOOKUP_FLOW START',
    endMarker: 'PROTECTED: FOOD_BARCODE_LOOKUP_FLOW END',
    expectedHash: 'f9e936baf0eb0efa7b0e075d7ed414eeeab67def541dba92fd311df75d4c128c',
    allowEnvVar: 'ALLOW_FOOD_BARCODE_LOOKUP_FLOW_EDIT',
    description: 'Food Diary barcode lookup + action routing flow',
  });
  checkProtectedRegion({
    filePath: path.join(__dirname, '..', 'app', 'food', 'page.tsx'),
    startMarker: 'PROTECTED: FOOD_BARCODE_SCANNER_ENGINE START',
    endMarker: 'PROTECTED: FOOD_BARCODE_SCANNER_ENGINE END',
    expectedHash: 'bd609b1e4f7905450a0185241ea10d013097e145e26be668f6e640abfb5fb9d3',
    allowEnvVar: 'ALLOW_FOOD_BARCODE_SCANNER_ENGINE_EDIT',
    description: 'Food Diary barcode scanner camera + decoder engine',
  });
  console.log('✅ Guard Rails: Protected regions verified.');
}

main();
