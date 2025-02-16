// Email pattern for validation
export const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

// Common email domains for suggestion
export const commonEmailDomains = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
];

// Password validation
export const passwordMinLength = 6;
export const passwordPattern = {
  hasUpperCase: /[A-Z]/,
};

// Input sanitization
export const sanitizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

export const sanitizePassword = (password: string): string => {
  return password.trim();
};

// Form validation messages
export const validationMessages = {
  required: 'This field is required',
  email: {
    pattern: 'Please enter a valid email address',
  },
  password: {
    minLength: `Password must be at least ${passwordMinLength} characters`,
    requirements: {
      uppercase: 'Must contain at least one uppercase letter',
    },
    match: 'Passwords do not match',
  },
  general: {
    unexpectedError: 'An unexpected error occurred. Please try again.',
    networkError: 'Network error. Please check your connection.',
    tooManyAttempts: 'Too many attempts. Please try again later.',
  },
};

// Password strength calculation
export const calculatePasswordStrength = (password: string): number => {
  let score = 0;

  // Length checks
  if (password.length >= passwordMinLength) score += 1;
  if (password.length >= 8) score += 1;

  // Character type checks
  if (passwordPattern.hasUpperCase.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;

  // Normalize to 0-4 range
  return Math.min(4, Math.floor(score));
};

// Email domain suggestion
export const suggestEmailDomain = (email: string): string | null => {
  const parts = email.split('@');
  if (parts.length !== 2) return null;

  const [, domain] = parts;
  if (!domain) return null;

  const suggestion = commonEmailDomains.find(
    (commonDomain) =>
      commonDomain.startsWith(domain) || 
      commonDomain.toLowerCase().startsWith(domain.toLowerCase())
  );

  return suggestion || null;
};

// Form submission rate limiting
const submissionTimestamps: { [key: string]: number[] } = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;

export const checkRateLimit = (formId: string): boolean => {
  const now = Date.now();
  const timestamps = submissionTimestamps[formId] || [];

  // Remove timestamps older than the window
  const recentTimestamps = timestamps.filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW
  );

  submissionTimestamps[formId] = recentTimestamps;

  // Check if we've exceeded the limit
  if (recentTimestamps.length >= MAX_ATTEMPTS) {
    return false;
  }

  // Add current timestamp
  submissionTimestamps[formId] = [...recentTimestamps, now];
  return true;
};

// Password validation rules
export const validatePassword = (password: string): string[] => {
  const errors: string[] = [];

  if (password.length < passwordMinLength) {
    errors.push(validationMessages.password.minLength);
  }

  if (!passwordPattern.hasUpperCase.test(password)) {
    errors.push(validationMessages.password.requirements.uppercase);
  }

  return errors;
}; 