import { Animated } from 'react-native';

export const ANIMATION_DURATION = {
  FAST: 300,
  NORMAL: 500,
  SLOW: 800,
} as const;

export const fadeIn = (value: Animated.Value, duration = ANIMATION_DURATION.NORMAL) =>
  Animated.timing(value, {
    toValue: 1,
    duration,
    useNativeDriver: true,
  });

export const fadeOut = (value: Animated.Value, duration = ANIMATION_DURATION.NORMAL) =>
  Animated.timing(value, {
    toValue: 0,
    duration,
    useNativeDriver: true,
  });

export const slideUp = (value: Animated.Value, duration = ANIMATION_DURATION.NORMAL) =>
  Animated.timing(value, {
    toValue: 0,
    duration,
    useNativeDriver: true,
  });

export const scale = (value: Animated.Value, duration = ANIMATION_DURATION.NORMAL) =>
  Animated.timing(value, {
    toValue: 1,
    duration,
    useNativeDriver: true,
  });

export const createFadeInAnimation = () => {
  const opacity = new Animated.Value(0);
  const translateY = new Animated.Value(20);

  const animate = () =>
    Animated.parallel([
      fadeIn(opacity),
      slideUp(translateY),
    ]).start();

  return {
    opacity,
    translateY,
    animate,
    style: {
      opacity,
      transform: [{ translateY }],
    },
  };
};

export const createFormAnimation = () => {
  const headerOpacity = new Animated.Value(0);
  const formOpacity = new Animated.Value(0);
  const formTranslateY = new Animated.Value(50);

  const animate = () =>
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: ANIMATION_DURATION.FAST,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(formOpacity, {
            toValue: 1,
            duration: ANIMATION_DURATION.NORMAL,
            useNativeDriver: true,
          }),
          Animated.timing(formTranslateY, {
            toValue: 0,
            duration: ANIMATION_DURATION.NORMAL,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

  return {
    headerOpacity,
    formOpacity,
    formTranslateY,
    animate,
    headerStyle: {
      opacity: headerOpacity,
      transform: [{ scale: headerOpacity }],
    },
    formStyle: {
      opacity: formOpacity,
      transform: [{ translateY: formTranslateY }],
    },
  };
}; 