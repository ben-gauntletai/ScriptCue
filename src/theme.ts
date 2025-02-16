import { MD3LightTheme as DefaultTheme, MD3Theme } from 'react-native-paper';

export const colors = {
  primary: '#1B365D',
  secondary: '#4A5568',
  error: '#DC2626',
  success: '#059669',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceVariant: '#F3F4F6',
  text: '#000000',
  textSecondary: '#666666',
  border: '#E5E5EA',
  elevation: {
    level1: '#00000008',
    level2: '#00000010',
    level3: '#00000015',
  },
} as const;

export const typography = {
  headlineLarge: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
  },
  headlineMedium: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '600',
  },
  titleLarge: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
  },
  titleMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  labelLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  labelMedium: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
} as const;

export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;

export const theme: MD3Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    secondary: colors.secondary,
    error: colors.error,
    background: colors.background,
    surface: colors.surface,
    surfaceVariant: colors.surfaceVariant,
    onSurface: colors.text,
    onSurfaceVariant: colors.textSecondary,
    outline: colors.border,
    success: '#4CAF50',
  },
  roundness: 12,
};

export const navigationTheme = {
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.error,
  },
}; 