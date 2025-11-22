import React from 'react'

interface MessageModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  type?: 'success' | 'error' | 'info'
  buttonText?: string
}

const MessageModal: React.FC<MessageModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  buttonText = 'OK'
}) => {
  if (!isOpen) return null

  const typeStyles = {
    success: {
      icon: '✓',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      button: 'bg-helfi-green hover:bg-helfi-green-dark'
    },
    error: {
      icon: '✕',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      button: 'bg-red-500 hover:bg-red-600'
    },
    info: {
      icon: 'ℹ',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700'
    }
  }

  const styles = typeStyles[type]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex items-start mb-4">
            <div className={`flex-shrink-0 ${styles.iconBg} rounded-full p-2 mr-4`}>
              <span className={`text-xl font-bold ${styles.iconColor}`}>{styles.icon}</span>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
              <p className="text-gray-600 whitespace-pre-line">{message}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className={`px-6 py-2 text-white rounded-lg transition-colors ${styles.button}`}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MessageModal

