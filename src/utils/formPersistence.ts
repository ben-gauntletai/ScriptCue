import AsyncStorage from '@react-native-async-storage/async-storage';

const FORM_STATE_PREFIX = '@form_state:';
const EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours

interface StoredFormState<T> {
  data: T;
  timestamp: number;
}

export const saveFormState = async <T>(formId: string, data: T): Promise<void> => {
  try {
    const state: StoredFormState<T> = {
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(
      `${FORM_STATE_PREFIX}${formId}`,
      JSON.stringify(state)
    );
  } catch (error) {
    console.warn('Failed to save form state:', error);
  }
};

export const loadFormState = async <T>(formId: string): Promise<T | null> => {
  try {
    const stored = await AsyncStorage.getItem(`${FORM_STATE_PREFIX}${formId}`);
    if (!stored) return null;

    const state: StoredFormState<T> = JSON.parse(stored);
    const now = Date.now();

    // Check if state has expired
    if (now - state.timestamp > EXPIRY_TIME) {
      await clearFormState(formId);
      return null;
    }

    return state.data;
  } catch (error) {
    console.warn('Failed to load form state:', error);
    return null;
  }
};

export const clearFormState = async (formId: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(`${FORM_STATE_PREFIX}${formId}`);
  } catch (error) {
    console.warn('Failed to clear form state:', error);
  }
};

export const clearExpiredFormStates = async (): Promise<void> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const formKeys = keys.filter(key => key.startsWith(FORM_STATE_PREFIX));
    const now = Date.now();

    for (const key of formKeys) {
      const stored = await AsyncStorage.getItem(key);
      if (!stored) continue;

      const state: StoredFormState<unknown> = JSON.parse(stored);
      if (now - state.timestamp > EXPIRY_TIME) {
        await AsyncStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn('Failed to clear expired form states:', error);
  }
}; 