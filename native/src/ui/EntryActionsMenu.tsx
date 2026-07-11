import React from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type EntryAction = {
  label: string
  icon: keyof typeof Feather.glyphMap
  onPress: () => void
  destructive?: boolean
}

export function EntryActionsButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.dotsButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Feather name="more-horizontal" size={25} color="#4B5563" />
    </Pressable>
  )
}

export function EntryActionsMenu({
  visible,
  onClose,
  actions,
}: {
  visible: boolean
  onClose: () => void
  actions: EntryAction[]
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom + 12, 28) }]}>
        <Pressable accessibilityLabel="Close actions" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.sheet}>
          {actions.map((action, index) => (
            <Pressable
              key={`${action.label}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => {
                action.onPress()
                onClose()
              }}
              style={[styles.row, index > 0 && styles.divider]}
            >
              <Feather name={action.icon} size={22} color={action.destructive ? '#DC2626' : '#16803A'} />
              <Text style={[styles.rowText, action.destructive && styles.destructiveText]}>{action.label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={[styles.row, styles.divider, styles.cancelRow]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  dotsButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  backdrop: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12, backgroundColor: 'rgba(6, 17, 14, 0.18)' },
  sheet: { overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: '#DDE7E0', backgroundColor: '#FFFFFF', shadowColor: '#102017', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 9 }, elevation: 10 },
  row: { minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  rowText: { flex: 1, color: '#17231B', fontSize: 16, fontWeight: '600' },
  destructiveText: { color: '#DC2626' },
  cancelRow: { justifyContent: 'center' },
  cancelText: { color: '#17231B', fontSize: 16, fontWeight: '700' },
})
