import React from 'react';

interface CreditInfo {
  dailyUsed: number;
  dailyLimit: number;
  additionalCredits: number;
  plan: string;
  creditCost?: number;
  featureUsageToday?: {
    foodAnalysis: number;
    interactionAnalysis: number;
  };
  dailyLimits?: {
    total: number;
    foodAnalysis: number;
    interactionAnalysis: number;
  };
}

interface CreditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditInfo: CreditInfo;
}

const CreditPurchaseModal: React.FC<CreditPurchaseModalProps> = ({ 
  isOpen, 
  onClose, 
  creditInfo 
}) => {
  if (!isOpen) return null;

  const handlePurchase = (creditPackage: string) => {
    // For now, redirect to billing page
    // In a real implementation, this would integrate with payment processor
    window.location.href = '/billing';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            Analysis Quota Exceeded
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Insufficient Credits
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  You need {creditInfo.creditCost || 1} credits for this analysis.
                  You've used {creditInfo.dailyUsed} of {creditInfo.dailyLimit} daily credits.
                  {creditInfo.additionalCredits > 0 
                    ? ` You have ${creditInfo.additionalCredits} additional credits remaining.`
                    : ' You have no additional credits remaining.'
                  }
                </p>
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-600 mb-4">
            <strong>Current Plan:</strong> {creditInfo.plan}
          </div>

          {/* Feature-specific usage breakdown */}
          {creditInfo.featureUsageToday && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-gray-900 mb-2">Today's Feature Usage</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700">Food Analysis (1 credit each):</span>
                  <span className="font-medium text-gray-900">{creditInfo.featureUsageToday.foodAnalysis}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Interaction Analysis (3 credits each):</span>
                  <span className="font-medium text-gray-900">{creditInfo.featureUsageToday.interactionAnalysis}</span>
                </div>
              </div>
            </div>
          )}

          {/* Show upgrade option for non-subscribed users */}
          {creditInfo.plan !== 'PREMIUM' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-blue-900 mb-2">
                Upgrade to Premium
              </h4>
              <p className="text-sm text-blue-800 mb-3">
                Get monthly credits plus unlimited additional credits. Perfect for both food analysis and interaction analysis.
              </p>
              <button
                onClick={() => handlePurchase('premium')}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
              >
                View Premium Plans
              </button>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">
              Purchase Additional Credits
            </h4>
            
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => handlePurchase('credits-100')}
                className="flex justify-between items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-900">100 Credits</div>
                  <div className="text-sm text-gray-500">Never expire</div>
                </div>
                <div className="text-lg font-bold text-green-600">$5</div>
              </button>
              
              <button
                onClick={() => handlePurchase('credits-150')}
                className="flex justify-between items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-900">150 Credits</div>
                  <div className="text-sm text-gray-500">Never expire • Best Value</div>
                </div>
                <div className="text-lg font-bold text-green-600">$10</div>
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditPurchaseModal; 