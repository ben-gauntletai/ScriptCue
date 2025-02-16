import { Platform } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export const haptics = {
  light: () => {
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
  },
  medium: () => {
    ReactNativeHapticFeedback.trigger('impactMedium', hapticOptions);
  },
  heavy: () => {
    ReactNativeHapticFeedback.trigger('impactHeavy', hapticOptions);
  },
  error: () => {
    ReactNativeHapticFeedback.trigger('notificationError', hapticOptions);
  },
  success: () => {
    ReactNativeHapticFeedback.trigger('notificationSuccess', hapticOptions);
  },
};

export const keyboardTypes = {
  email: 'email-address',
  password: 'default',
  numeric: 'numeric',
  phone: 'phone-pad',
} as const;

export const returnKeyTypes = {
  next: 'next',
  done: 'done',
  send: 'send',
  go: 'go',
} as const;

export const autoCapitalize = {
  none: 'none',
  sentences: 'sentences',
  words: 'words',
  characters: 'characters',
} as const; 