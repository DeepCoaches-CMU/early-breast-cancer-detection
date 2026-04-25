import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

type BadgeType = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'birads1' | 'birads2' | 'birads3' | 'birads4' | 'birads5';

interface BadgeProps {
  label: string;
  type?: BadgeType;
  style?: ViewStyle;
}

const BADGE_COLORS: Record<BadgeType, { bg: string; text: string; border: string }> = {
  default: { bg: '#2A2A4A', text: '#8B8FA8', border: '#3A3A5A' },
  success: { bg: '#00FF8820', text: '#00FF88', border: '#00FF8840' },
  warning: { bg: '#FFB82220', text: '#FFB822', border: '#FFB82240' },
  danger: { bg: '#FF3B3B20', text: '#FF3B3B', border: '#FF3B3B40' },
  info: { bg: '#00F2FF20', text: '#00F2FF', border: '#00F2FF40' },
  birads1: { bg: '#00FF8820', text: '#00FF88', border: '#00FF8840' },
  birads2: { bg: '#00F2FF20', text: '#00F2FF', border: '#00F2FF40' },
  birads3: { bg: '#FFB82220', text: '#FFB822', border: '#FFB82240' },
  birads4: { bg: '#FF6B3520', text: '#FF6B35', border: '#FF6B3540' },
  birads5: { bg: '#FF3B3B20', text: '#FF3B3B', border: '#FF3B3B40' },
};

export function classificationToBadgeType(classification?: string): BadgeType {
  switch (classification) {
    case 'BI-RADS 1': return 'birads1';
    case 'BI-RADS 2': return 'birads2';
    case 'BI-RADS 3': return 'birads3';
    case 'BI-RADS 4': return 'birads4';
    case 'BI-RADS 5': return 'birads5';
    default: return 'default';
  }
}

export function Badge({ label, type = 'default', style }: BadgeProps) {
  const colors = BADGE_COLORS[type];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.bg, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
